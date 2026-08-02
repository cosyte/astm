/**
 * `ASTM_RECORD_FIELDS_UNSEPARATED`: the report that a record was read with delimiters that are not
 * the set it was written with.
 *
 * A record carries its type letter and then its fields, separated by the field delimiter the header
 * declared. So a record that carries content beyond its type letter and yet yields exactly **one**
 * field contains no field separator at all, and the set in force is demonstrably not this record's
 * set. Every modeled field of it is then absent: on an `R` that is the value, the units and the
 * status in one go, which is a result record that reads back carrying no result.
 *
 * Before this code existed that happened in **silence**. The reachable route recorded against the
 * parser ran through a header whose type letter the reader could not recognize, which skips
 * delimiter re-scoping, but the collapse does not need a header at all: a single record written in
 * another set collapses the same way, and reported nothing.
 *
 * **The fields are reported, never repaired.** Re-splitting the record on a set no header declared
 * would mean guessing at bytes the sender did not send. The house rule is that a field is never
 * lost in silence, not that a field is always recovered, so this is a warning plus a strict refusal.
 *
 * **No clause is claimed.** That a record's fields are separated by the declared field delimiter is
 * read off this package's own emit contract and off every fixture in this repository, not off a
 * normative sentence: the relevant CLSI text is withheld from the free sample and the surrounding
 * standards are paywalled, and the redistributable OSS corpus hardcodes the canonical delimiters
 * and never reads the declaration, so it cannot ground a delimiter question either.
 *
 * All fixtures are **synthetic**: identifiers, specimen IDs and values are invented and correspond
 * to no real person or specimen.
 */

import { describe, expect, it } from "vitest";

import {
  AstmStrictError,
  SAFETY_CRITICAL_CODES,
  TOLERABLE_CODES,
  WARNING_CODES,
  defineAstmProfile,
  isSafetyCriticalCode,
  messages,
  parseAstmRecords,
  results,
  serializeAstmRecords,
} from "../../src/index.js";

const codes = (raw: string): string[] => parseAstmRecords(raw).warnings.map((w) => w.code);
const unseparated = (raw: string): number =>
  codes(raw).filter((c) => c === WARNING_CODES.ASTM_RECORD_FIELDS_UNSEPARATED).length;

/** A conformant single-message stream in the canonical set. Nothing here may ever trip the code. */
const CLEAN = "H|\\^&\rP|1||LAB-0001\rO|1|SPEC-0001\rR|1|^^^687|28.6|U/L||N||F\rL|1|N\r";

describe("a record the delimiters in force cannot split is reported", () => {
  it("a result written in another set reads back with no result, and now says so", () => {
    // The `R` was written with `*` as its field separator; the header declared `|`. No header is
    // mangled and no message boundary is involved: one record, in the wrong set.
    const raw = "H|\\^&\rP|1||LAB-0001\rR*1*:::688*99.9*mmol/L**H**F\rL|1|N\r";
    const msg = parseAstmRecords(raw);

    // The loss is real and is NOT repaired: the value, the units and the status are all gone.
    const [only] = results(msg);
    expect(only?.value).toBeUndefined();
    expect(only?.units).toBeUndefined();
    expect(only?.status.isActiveFinal).toBe(false);

    // What changed is that it is no longer silent.
    expect(codes(raw)).toEqual([WARNING_CODES.ASTM_RECORD_FIELDS_UNSEPARATED]);
    expect(msg.warnings[0]?.position).toMatchObject({ recordIndex: 2, recordType: "R" });
  });

  it("the raw line is still surfaced intact, so nothing is dropped", () => {
    const raw = "H|\\^&\rR*1*:::688*99.9*mmol/L**H**F\rL|1|N\r";
    const record = parseAstmRecords(raw).records[1];
    expect(record?.type).toBe("R");
    expect(record?.fields).toHaveLength(1);
    expect(record?.fields[0]?.raw).toBe("R*1*:::688*99.9*mmol/L**H**F");
  });

  it("each unsplittable record is reported at its own position, none is merged into one report", () => {
    const raw = "H|\\^&\rO*1*SPEC-0002\rR*1*:::688*99.9*mmol/L**H**F\rL*1*N\r";
    expect(
      parseAstmRecords(raw)
        .warnings.filter((w) => w.code === WARNING_CODES.ASTM_RECORD_FIELDS_UNSEPARATED)
        .map((w) => [w.position.recordIndex, w.position.recordType]),
    ).toEqual([
      [1, "O"],
      [2, "R"],
      [3, "L"],
    ]);
  });

  it("carries no field data (value discipline)", () => {
    for (const w of parseAstmRecords("H|\\^&\rR*1*:::688*99.9*mmol/L**H**F\rL|1|N\r").warnings) {
      expect(w.message).not.toContain("99.9");
      expect(w.message).not.toContain("mmol/L");
      expect(w.message).not.toContain("688");
    }
  });

  it("strict mode refuses it: a collapsed record is not a stream to accept quietly", () => {
    expect(() =>
      parseAstmRecords("H|\\^&\rR*1*:::688*99.9*mmol/L**H**F\rL|1|N\r", { strict: true }),
    ).toThrow(AstmStrictError);
  });
});

/**
 * The negative controls. A warning that fires on conformant traffic is noise, and noise on a
 * safety-critical code is worse than noise: it trains a reader to ignore the one report that
 * matters. Each of these is a shape that must stay silent.
 */
describe("what it must never fire on", () => {
  it("a conformant stream in the canonical set", () => {
    expect(codes(CLEAN)).toEqual([]);
  });

  it("a record that is only its type letter, which has no fields to separate", () => {
    expect(unseparated("H|\\^&\rL\r")).toBe(0);
    expect(unseparated("H|\\^&\rP\rL\r")).toBe(0);
  });

  it("a header, which is always read with the set it declares itself", () => {
    // Both headers are legible, so the second re-scopes the delimiters and neither is unsplittable.
    const raw = "H|\\^&|||s\rL|1|N\rH*~:#*||*s2\rR*1*:::688*9.0*U**H**F\rL*1*N\r";
    expect(unseparated(raw)).toBe(0);
    expect(codes(raw)).toEqual([
      WARNING_CODES.ASTM_RECORD_DELIMITERS_REDECLARED,
      WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS,
    ]);
    // And the redeclared message's value survives, which is what the scoping rule is for. The
    // stream carries two messages, so the per-message reader is the one entitled to answer.
    expect(messages(parseAstmRecords(raw)).flatMap((m) => m.results.map((r) => r.value))).toEqual([
      "9.0",
    ]);
  });

  it("a stream that round-trips through this package's own serializer", () => {
    const msg = parseAstmRecords(CLEAN);
    expect(codes(serializeAstmRecords(msg))).toEqual([]);
  });

  it("a non-canonical but self-consistent set, where every record matches its own header", () => {
    const raw = "H*~:#*||*s\rP*1**LAB-0001\rR*1*:::688*99.9*mmol/L**H**F\rL*1*N\r";
    expect(unseparated(raw)).toBe(0);
    expect(results(parseAstmRecords(raw)).map((r) => r.value)).toEqual(["99.9"]);
  });
});

describe("no profile may tolerate it", () => {
  it("is safety-critical by construction (default-deny), not by an entry someone remembered", () => {
    expect(TOLERABLE_CODES.has(WARNING_CODES.ASTM_RECORD_FIELDS_UNSEPARATED)).toBe(false);
    expect(SAFETY_CRITICAL_CODES.has(WARNING_CODES.ASTM_RECORD_FIELDS_UNSEPARATED)).toBe(true);
    expect(isSafetyCriticalCode(WARNING_CODES.ASTM_RECORD_FIELDS_UNSEPARATED)).toBe(true);
  });

  it("no profile the factory will build can quiet it or let strict mode accept it", () => {
    const raw = "H|\\^&\rR*1*:::688*99.9*mmol/L**H**F\rL|1|N\r";
    for (const code of TOLERABLE_CODES) {
      const profile = defineAstmProfile({
        name: `tolerating-${code}`,
        tolerate: [{ code, rationale: "a deviation this profile expects" }],
      });
      expect(parseAstmRecords(raw, { profile }).warnings.map((w) => w.code)).toEqual([
        WARNING_CODES.ASTM_RECORD_FIELDS_UNSEPARATED,
      ]);
      expect(() => parseAstmRecords(raw, { strict: true, profile })).toThrow(AstmStrictError);
    }
  });
});
