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

  it("a terminator padded with trailing whitespace, where no field is at stake", () => {
    // The code is safety-critical, so it cannot be tolerated by a profile and strict refuses on it.
    // Firing it over a pad byte would leave a consumer no remedy but to abandon strict mode, and
    // the diagnosis would be false anyway: with no non-blank byte after the type letter there is no
    // field content that could have been lost.
    expect(unseparated("H|\\^&\rP|1||LAB-0001\rL \r")).toBe(0);
    expect(unseparated("H|\\^&\rP|1||LAB-0001\rL\t\r")).toBe(0);
    expect(() => parseAstmRecords("H|\\^&\rP|1||LAB-0001\rL \r", { strict: true })).not.toThrow();
    // A non-blank byte after the type letter is still reported, so this is a whitespace carve-out
    // and not a length one.
    expect(unseparated("H|\\^&\rP|1||LAB-0001\rL1\r")).toBe(1);
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

/**
 * **The limits, pinned.** This code tests one of the four delimiter roles, the field separator, and
 * only in its total form, so its absence is not evidence that a record split correctly. The shapes
 * below still lose data and still report nothing, and each reproduces identically on the previous
 * release.
 *
 * **They are the accepted kind of limit**, for two different reasons: repairing the field-separator
 * class would mean deciding which set a record ought to have had, which is the guess the parser
 * declines to make everywhere else, and narrowing the escape atom would break the guarantee the
 * atom exists for.
 *
 * **The escape role's worst case has NARROWED, and the narrowing is pinned both ways below.** A
 * bare escape character used to merge every field after it, silently; it now reads as a literal and
 * raises `ASTM_UNPAIRED_ESCAPE_CHARACTER`. What did **not** change is the atom rule: an `&X&`
 * sequence whose body is a delimiter still swallows that delimiter and still costs the value, the
 * units and the status together. What did change is the reporting, and only for part of that group:
 * where the body is UNRECOGNIZED it now also raises `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`,
 * which is not tolerable, so a profile can no longer leave a strict parse accepting it; where the
 * body is a RECOGNIZED mnemonic whose letter holds a delimiter role it raises neither code, because
 * that is the sender escaping a delimiter on purpose. The `&|&` half is asserted below; the
 * recognized-mnemonic half is asserted in `test/records/swallowed-delimiter.test.ts`.
 *
 * They are asserted rather than merely written down, so that the documented boundary cannot quietly
 * drift into a guarantee the code does not provide. A test here going red means the scope moved,
 * and the prose on the warning code, in `README.md` and in the quickstart has to move with it.
 */
describe("the limits: shapes that lose data and are deliberately NOT reported", () => {
  it("a foreign set whose field separator happens to occur in the line still splits, silently", () => {
    // The record is `*`-separated but carries one `|`, which is the set in force. It therefore
    // splits into two fields on the wrong boundary, so the collapse test does not see it, and the
    // value, the units and the status are gone exactly as in the total case.
    const raw = "H|\\^&\rP|1||LAB-0001\rR*1*^^^688*99.9*mmol/L**H**F|\rL|1|N\r";
    const [only] = results(parseAstmRecords(raw));
    expect(only?.value).toBeUndefined();
    expect(only?.units).toBeUndefined();
    expect(only?.status.isActiveFinal).toBe(false);
    expect(codes(raw)).toEqual([]);

    // The same record without that one byte is the total form, and IS reported. One character is
    // the whole difference between the covered case and the uncovered one.
    expect(codes("H|\\^&\rP|1||LAB-0001\rR*1*^^^688*99.9*mmol/L**H**F\rL|1|N\r")).toEqual([
      WARNING_CODES.ASTM_RECORD_FIELDS_UNSEPARATED,
    ]);
  });

  it("a run of these warnings is not a sweep: one record inside the run can escape it", () => {
    // A collapsed tail where one record happens to carry the in-force `|`. The records around it
    // are reported and it is not, so a consumer who reads the run as "these are the damaged ones"
    // is wrong about exactly the record that lost its value.
    const raw =
      "H|\\^&|||s\rP|1||LAB-0001\rL|1|N\r H*~:#*\rP*1**LAB-0002\rR*1*^^^688*99.9*mmol/L**H**F|\rL*1*N\r";
    const reported = parseAstmRecords(raw)
      .warnings.filter((w) => w.code === WARNING_CODES.ASTM_RECORD_FIELDS_UNSEPARATED)
      .map((w) => w.position.recordIndex);
    expect(reported).toEqual([3, 4, 6]);
    // Record 5 is the `R`, and it is the one that lost its value.
    expect(reported).not.toContain(5);
    const lost = parseAstmRecords(raw).records[5];
    expect(lost?.type).toBe("R");
    expect(lost?.type === "R" ? lost.value : "unreachable").toBeUndefined();
  });

  it("a BARE escape character has left this list: it no longer costs the value", () => {
    // This case used to belong here, and it was the sharpest member of the group: a lone `&` under
    // the canonical set merged every field after it, so a nine-field result read back as four with
    // no warning at all. It is closed at the source, not by widening this check: an escape
    // character heading no `&X&` sequence is read as a literal, so the record splits normally and
    // `ASTM_UNPAIRED_ESCAPE_CHARACTER` reports the character. See `unpaired-escape.test.ts`.
    const raw = "H|\\^&\rP|1||LAB-0001\rR|1|^^^687|28.6&|U/L||N||F\rL|1|N\r";
    expect(parseAstmRecords(raw).records[2]?.fields).toHaveLength(9);
    const [only] = results(parseAstmRecords(raw));
    expect(only?.value).toBe("28.6&");
    expect(only?.units).toBe("U/L");
    expect(only?.status.isActiveFinal).toBe(true);
    expect(codes(raw)).toEqual([WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER]);
  });

  it("but an `&X&` whose body IS a delimiter still swallows it, and still costs the value", () => {
    // The atom rule is unchanged and deliberate: it is what keeps `&F&` one token under a declared
    // set that names `F` as a delimiter. The cost is that `&|&` under the canonical set is also an
    // atom, so that field separator never becomes a boundary. One character apart from the fixture
    // above, and the whole tail is gone again.
    const raw = "H|\\^&\rP|1||LAB-0001\rR|1|^^^687|28.6&|&U/L||||F\rL|1|N\r";
    const [only] = results(parseAstmRecords(raw));
    expect(only?.value).toBe("28.6&|&U/L");
    expect(only?.units).toBeUndefined();
    expect(only?.status.isActiveFinal).toBe(false);

    // The loss above is unchanged: this is a report, not a repair. What is no longer true is that
    // the only report is a TOLERABLE code, which is what let a profile leave a strict parse
    // accepting the record.
    expect(codes(raw)).toEqual([
      WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
      WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE,
    ]);
    expect(TOLERABLE_CODES.has(WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE)).toBe(true);
    expect(TOLERABLE_CODES.has(WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE)).toBe(
      false,
    );
  });

  it("a set differing only in the component role splits into fields normally, silently", () => {
    // Fields separate on `|` as declared, so nothing collapses and the value and units survive.
    // What does not survive is the test identity: the component split never happened.
    const raw = "H|\\^&\rP|1||LAB-0001\rR|1|:::688|99.9|mmol/L||H||F\rL|1|N\r";
    const [only] = results(parseAstmRecords(raw));
    expect(only?.value).toBe("99.9");
    expect(only?.units).toBe("mmol/L");
    expect(codes(raw)).toEqual([]);
    // The canonical twin resolves a local code; the foreign-component one cannot.
    expect(only?.universalTestId?.localCode).toBeUndefined();
    expect(
      results(parseAstmRecords("H|\\^&\rP|1||LAB-0001\rR|1|^^^688|99.9|mmol/L||H||F\rL|1|N\r"))[0]
        ?.universalTestId?.localCode,
    ).toBe("688");
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
