/**
 * Unit tests for the record-layer emit side (`src/records/serialize.ts`): the
 * conservative serializer that is the inverse of `parseAstmRecords`.
 */

import { describe, expect, it } from "vitest";

import {
  AstmSerializeError,
  CANONICAL_DELIMITERS,
  encodeComponent,
  parseAstmRecords,
  serializeAstmRecord,
  serializeAstmRecords,
  results,
} from "../../src/index.js";

/** Assert a value is defined and return it — the lint-clean alternative to a `!` assertion. */
function def<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a defined value");
  return value;
}

describe("encodeComponent", () => {
  it("escapes the escape char first, then the three delimiters, so decode is the exact inverse", () => {
    // a value carrying all four canonical delimiters
    expect(encodeComponent("a&b|c^d\\e", CANONICAL_DELIMITERS)).toBe("a&E&b&F&c&S&d&R&e");
  });

  it("leaves a delimiter-free component untouched", () => {
    expect(encodeComponent("28.6", CANONICAL_DELIMITERS)).toBe("28.6");
  });

  it("refuses a CR/LF in a value — it cannot be escaped and would break framing", () => {
    expect(() => encodeComponent("line1\rline2", CANONICAL_DELIMITERS)).toThrow(AstmSerializeError);
    expect(() => encodeComponent("line1\nline2", CANONICAL_DELIMITERS)).toThrow(AstmSerializeError);
    try {
      encodeComponent("x\ry", CANONICAL_DELIMITERS, 3);
    } catch (err) {
      expect(err).toBeInstanceOf(AstmSerializeError);
      expect((err as AstmSerializeError).code).toBe("ASTM_EMIT_UNENCODABLE_VALUE");
      expect((err as AstmSerializeError).recordIndex).toBe(3);
    }
  });
});

describe("serializeAstmRecord", () => {
  it("emits the header's delimiter declaration LITERALLY, never escaped", () => {
    const msg = parseAstmRecords("H|\\^&|||analyzer^cobas^1|||||host||P\rL|1\r");
    const header = def(msg.records[0]);
    const out = serializeAstmRecord(header);
    expect(out.startsWith("H|\\^&")).toBe(true);
    // The `&` in the declaration is NOT turned into `&E&`.
    expect(out).toContain("H|\\^&|||analyzer^cobas^1|||||host||P");
  });

  it("surfaces M/S records byte-identically from their rawLine", () => {
    const msg = parseAstmRecords("H|\\^&\rM|1|QC^LEVEL2^LOT-88|4.21^mmol/L^ACCEPT\rL|1\r");
    const m = def(msg.records.find((r) => r.type === "M"));
    expect(serializeAstmRecord(m)).toBe("M|1|QC^LEVEL2^LOT-88|4.21^mmol/L^ACCEPT");
  });

  it("serializes a multi-repeat field with the repeat delimiter", () => {
    const msg = parseAstmRecords("H|\\^&\rO|1|ACC-42|SPEC-7|^^^687\\^^^688|R\rL|1\r");
    const order = def(msg.records.find((r) => r.type === "O"));
    expect(serializeAstmRecord(order)).toBe("O|1|ACC-42|SPEC-7|^^^687\\^^^688|R");
  });
});

describe("serializeAstmRecords", () => {
  it("round-trips a canonical stream byte-for-byte", () => {
    const raw = "H|\\^&\rP|1|PRAC|LAB\rO|1|ACC\rR|1|^^^687|28.6|U/L|10-40|N||F\rL|1|N\r";
    expect(serializeAstmRecords(parseAstmRecords(raw))).toBe(raw);
  });

  it("re-escapes an embedded component delimiter so it round-trips as one component", () => {
    // The titre 1^40 arrives properly escaped as 1&S&40 and reads as ONE component.
    const raw = "H|\\^&\rR|1|^^^687|1&S&40|titer||N||F\rL|1\r";
    expect(results(parseAstmRecords(raw))[0]?.value).toBe("1^40");
    const out = serializeAstmRecords(parseAstmRecords(raw));
    expect(out).toContain("1&S&40"); // re-escaped, not emitted raw
    expect(results(parseAstmRecords(out))[0]?.value).toBe("1^40");
  });

  it("normalizes a non-canonical delimiter set to the canonical H|\\^& on emit", () => {
    // Declared field `#`, repeat `~`, component `*`, escape `\`.
    const raw = "H#~*\\\rR#1#***687#5.0#U/L\rL#1";
    const msg = parseAstmRecords(raw);
    const out = serializeAstmRecords(msg);
    expect(out.startsWith("H|\\^&")).toBe(true);
    // The result value + its canonical UTID survive normalization.
    expect(out).toContain("R|1|^^^687|5.0|U/L");
    expect(results(parseAstmRecords(out))[0]?.value).toBe("5.0");
  });

  it("accepts a bare record list as well as a message", () => {
    const msg = parseAstmRecords("H|\\^&\rL|1\r");
    expect(serializeAstmRecords(msg.records)).toBe(serializeAstmRecords(msg));
  });
});
