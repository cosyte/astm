import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseAstmRecords, results, WARNING_CODES } from "../../src/index.js";

/**
 * Integration coverage: the Phase-2 result semantics wired through
 * `parseAstmRecords`, over the Tier-2 result-semantics fixture. Verifies the raw
 * strings and the modeled views coexist, and that every safety warning fires
 * with a value-free position (record + field index only).
 */
const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), "latin1");

describe("parseAstmRecords — modeled result semantics", () => {
  const msg = parseAstmRecords(fixture("tier2-result-semantics.astm"));
  const r = results(msg);

  it("models a correction (C) and a numeric-value-missing-units warning", () => {
    const rec = r[0];
    expect(rec?.status.code).toBe("C");
    expect(rec?.status.meaning).toBe("correction");
    expect(rec?.status.supersedes).toBe(true);
    expect(rec?.status.isActiveFinal).toBe(false); // a correction is never active-final
    expect(rec?.abnormalFlags).toBe("HH"); // raw preserved
    expect(rec?.flag?.meaning).toBe("critically-above-normal");
    // numeric value 12.0 with empty units -> units-absent warning
    expect(
      msg.warnings.some(
        (w) =>
          w.code === WARNING_CODES.ASTM_RECORD_UNITS_ABSENT &&
          w.position.recordIndex === rec?.recordIndex,
      ),
    ).toBe(true);
  });

  it("models a cancellation (X) so it can never read as current", () => {
    const rec = r[1];
    expect(rec?.status.code).toBe("X");
    expect(rec?.status.cancelled).toBe(true);
    expect(rec?.status.isActiveFinal).toBe(false);
    expect(rec?.flag?.meaning).toBe("below-scale"); // "<" off-scale-low
    expect(rec?.range?.kind).toBe("open-high"); // ">0.2"
    expect(rec?.range?.low).toBe("0.2");
  });

  it("surfaces an unrecognized flag as undefined + warns, never coerced to normal", () => {
    const rec = r[2];
    expect(rec?.abnormalFlags).toBe("ZZ");
    expect(rec?.flag?.recognized).toBe(false);
    expect(rec?.flag?.meaning).toBe("undefined");
    expect(rec?.flag?.meaning).not.toBe("normal");
    expect(
      msg.warnings.some(
        (w) =>
          w.code === WARNING_CODES.ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG &&
          w.position.recordIndex === rec?.recordIndex &&
          w.position.fieldIndex === 7,
      ),
    ).toBe(true);
  });

  it("surfaces an unparseable range verbatim + warns, no fabricated bound", () => {
    const rec = r[3];
    expect(rec?.referenceRange).toBe("weird-range-text"); // raw preserved
    expect(rec?.range?.kind).toBe("unparsed");
    expect(rec?.range?.low).toBeUndefined();
    expect(rec?.range?.high).toBeUndefined();
    expect(rec?.flag?.meaning).toBe("significant-change-up"); // directional U
    expect(
      msg.warnings.some(
        (w) =>
          w.code === WARNING_CODES.ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE &&
          w.position.recordIndex === rec?.recordIndex,
      ),
    ).toBe(true);
  });

  it("preserves a component-delimited reference range verbatim, never truncating a bound", () => {
    // A field-6 value carrying an unescaped component delimiter (`3.5^5.0`) must surface the FULL
    // field text and read as unparsed + warn — never truncate to the first component ("3.5").
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^900|4.2|U/L|3.5^5.0|N||F\rL|1\r");
    const rec = results(msg)[0];
    expect(rec?.referenceRange).toBe("3.5^5.0"); // full field, not "3.5"
    expect(rec?.range?.raw).toBe("3.5^5.0");
    expect(rec?.range?.kind).toBe("unparsed");
    expect(rec?.range?.low).toBeUndefined();
    expect(rec?.range?.high).toBeUndefined();
    expect(
      msg.warnings.some((w) => w.code === WARNING_CODES.ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE),
    ).toBe(true);
  });

  it("types an absent status as unspecified, never final", () => {
    const rec = r[4];
    expect(rec?.resultStatus).toBeUndefined();
    expect(rec?.status.meaning).toBe("unspecified");
    expect(rec?.status.isActiveFinal).toBe(false);
    expect(rec?.flag?.meaning).toBe("critically-below-normal"); // LL panic-low
    expect(rec?.range?.kind).toBe("open-low"); // "<0.5"
  });

  it("models the directional-down flag and previously-transmitted status", () => {
    const rec = r[5];
    expect(rec?.flag?.meaning).toBe("significant-change-down"); // D
    expect(rec?.status.meaning).toBe("previously-transmitted");
    expect(rec?.status.isActiveFinal).toBe(false);
  });

  it("every warning is value-free — code + position only", () => {
    for (const w of msg.warnings) {
      expect(typeof w.code).toBe("string");
      expect(typeof w.position.recordIndex).toBe("number");
      // The message never embeds a value; it is a fixed, code-scoped string.
      expect(w.message).not.toMatch(/12\.0|weird-range-text|ZZ|COBAS-02|ROE|RICHARD/u);
    }
  });
});

describe("parseAstmRecords — spec-clean Tier-1 result stays warning-free", () => {
  it("a canonical H/P/O/R/L message models cleanly with no semantics warnings", () => {
    const msg = parseAstmRecords(fixture("tier1-result.astm"));
    const semanticsCodes = new Set<string>([
      WARNING_CODES.ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG,
      WARNING_CODES.ASTM_RECORD_UNDEFINED_RESULT_STATUS,
      WARNING_CODES.ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE,
      WARNING_CODES.ASTM_RECORD_UNITS_ABSENT,
    ]);
    expect(msg.warnings.filter((w) => semanticsCodes.has(w.code))).toHaveLength(0);
    const r = results(msg);
    expect(r[0]?.status.isActiveFinal).toBe(true); // F
    expect(r[0]?.flag?.meaning).toBe("normal"); // N
    expect(r[0]?.range?.kind).toBe("closed");
    expect(r[0]?.range?.low).toBe("10");
    expect(r[0]?.range?.high).toBe("40");
    expect(r[1]?.flag?.meaning).toBe("above-normal"); // H
  });
});
