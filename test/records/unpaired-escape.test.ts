/**
 * `ASTM_UNPAIRED_ESCAPE_CHARACTER`: an escape character that heads no escape sequence is read as
 * the literal character it is, and opens no atom, so it no longer merges the rest of the record.
 *
 * An escape sequence is the escape character, one body character, and the escape character again
 * (`&F&` / `&S&` / `&R&` / `&E&`). Before this code existed, the codec read an escape character
 * that started no such sequence as the opening of one that never closed, and copied from it to the
 * end of the record: every field after it merged into the field it sat in, and **nothing was
 * reported**. One `&` in a result value cost the units, the abnormal flag and the status together
 * and dropped the status from `final` to `unspecified`; one in a surname cost the patient's birth
 * date and sex. Emit then re-escaped the merged text into a spec-clean-looking line that read back
 * as the same wrong value, so a round trip made the mis-read look deliberate.
 *
 * **The bound is the fix, and it is keyed on observation only.** Reading one body character and no
 * further never infers a byte the sender did not send; it declines to treat an escape character as
 * an escape when the bytes do not show one. It also keeps the decision local: under the old
 * unbounded scan, whether a field kept its value depended on whether some later field happened to
 * carry an escape character too.
 *
 * **What the parser does NOT decide** is what the sender meant by the character. It keeps the byte
 * that arrived and says so. The spec-clean way to send a literal escape character is `&E&`, and
 * this package's own serializer emits it that way, so a stream this parser produced never trips
 * this code.
 *
 * **No clause is claimed.** That an escape body is a single character is read off the four
 * mnemonics this package implements and off its own emit contract, not off a normative sentence:
 * the relevant CLSI text is withheld from the free sample and the surrounding standards are
 * paywalled, and the redistributable OSS corpus hardcodes `|\^&` and never reads the declaration.
 *
 * All fixtures are **synthetic**: names, identifiers, specimen IDs and values are invented and
 * correspond to no real person or specimen.
 */

import { describe, expect, it } from "vitest";

import {
  AstmStrictError,
  CANONICAL_DELIMITERS,
  TOLERABLE_CODES,
  WARNING_CODES,
  decodeEscapes,
  defineAstmProfile,
  isSafetyCriticalCode,
  parseAstmRecords,
  patient,
  results,
  serializeAstmRecords,
  splitEscapeAware,
  tokenizeHeader,
} from "../../src/index.js";

const D = CANONICAL_DELIMITERS;
const codes = (raw: string): string[] => parseAstmRecords(raw).warnings.map((w) => w.code);
const unpaired = (raw: string): number =>
  codes(raw).filter((c) => c === WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER).length;

const HEADER = "H|\\^&|||SYNTH-LAB";
const stream = (...lines: string[]): string => [...lines, ""].join("\r");

/** The measured fixture: one unescaped `&` inside an otherwise conformant result value. */
const RESULT_WITH_LONE_ESCAPE = stream(
  HEADER,
  "P|1||LAB-0001",
  "O|1|SPEC-0001||^^^687|R",
  "R|1|^^^687|28.6&|U/L||N||F",
  "L|1|N",
);

/** The identical record without that one byte. Nothing here may ever trip the code. */
const RESULT_CLEAN = stream(
  HEADER,
  "P|1||LAB-0001",
  "O|1|SPEC-0001||^^^687|R",
  "R|1|^^^687|28.6|U/L||N||F",
  "L|1|N",
);

/** The measured fixture on the patient side: an ampersand in a surname. */
const PATIENT_WITH_LONE_ESCAPE = stream(
  HEADER,
  "P|1||LAB-0001||O&BRIEN^JANE||19800101|F",
  "O|1|SPEC-0001||^^^687|R",
  "R|1|^^^687|28.6|U/L||N||F",
  "L|1|N",
);

describe("an unpaired escape character no longer swallows the rest of the record", () => {
  it("a result keeps its units, its abnormal flag and its FINAL status", () => {
    const msg = parseAstmRecords(RESULT_WITH_LONE_ESCAPE);
    const [only] = results(msg);
    expect(only).toBeDefined();

    // Every one of these was absent before: the whole tail read back inside `value`.
    expect(only?.units).toBe("U/L");
    expect(only?.abnormalFlags).toBe("N");
    expect(only?.flag?.meaning).toBe("normal");
    expect(only?.status.code).toBe("F");
    expect(only?.status.meaning).toBe("final");
    expect(only?.status.isActiveFinal).toBe(true);

    // The value keeps the byte that arrived, and nothing more. The parser does not decide the
    // sender meant `&E&`: it neither drops the character nor invents the one that would pair it.
    expect(only?.value).toBe("28.6&");
  });

  it("and says so, exactly once, positioned on the record and field that carried it", () => {
    const msg = parseAstmRecords(RESULT_WITH_LONE_ESCAPE);
    const reported = msg.warnings.filter(
      (w) => w.code === WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER,
    );
    expect(reported).toHaveLength(1);
    const [w] = reported;
    expect(w?.position.recordType).toBe("R");
    expect(w?.position.recordIndex).toBe(3);
    // The value is `R` field 4 (1-based, type letter is field 1).
    expect(w?.position.fieldIndex).toBe(4);
    // PHI discipline: a warning never carries the field's text.
    expect(w?.message).not.toContain("28.6");
  });

  it("a patient keeps their birth date and sex, and the surname keeps its ampersand", () => {
    const msg = parseAstmRecords(PATIENT_WITH_LONE_ESCAPE);
    const p = patient(msg);
    expect(p?.name?.last).toBe("O&BRIEN");
    expect(p?.name?.first).toBe("JANE");
    // Both of these were gone before, with no warning at all.
    expect(p?.birthDate?.raw).toBe("19800101");
    expect(p?.sex).toBe("F");
    expect(unpaired(PATIENT_WITH_LONE_ESCAPE)).toBe(1);
  });

  it("two unpaired escape characters in one record no longer pair up across a field separator", () => {
    // The old scan looked forward for ANY later escape character, so a second one elsewhere in the
    // record closed a sequence that was never opened and merged everything between them. Whether a
    // field survived therefore depended on an unrelated later field, which is why the bound matters.
    const raw = stream(HEADER, "P|1||LAB-0001||O&BRIEN^JANE||19800101|F|||SITE-A&B", "L|1|N");
    const p = patient(parseAstmRecords(raw));
    expect(p?.name?.last).toBe("O&BRIEN");
    expect(p?.birthDate?.raw).toBe("19800101");
    expect(p?.sex).toBe("F");
    expect(unpaired(raw)).toBe(2);
  });
});

describe("the negative controls: what must NOT report, and must not change", () => {
  it("a conformant stream is untouched and silent", () => {
    expect(codes(RESULT_CLEAN)).toEqual([]);
    const [only] = results(parseAstmRecords(RESULT_CLEAN));
    expect(only?.value).toBe("28.6");
    expect(only?.units).toBe("U/L");
  });

  it("a properly escaped ampersand (`&E&`) decodes to one literal and reports nothing", () => {
    const raw = stream(HEADER, "P|1||LAB-0001||O&E&BRIEN^JANE||19800101|F", "L|1|N");
    const p = patient(parseAstmRecords(raw));
    expect(p?.name?.last).toBe("O&BRIEN");
    expect(p?.name?.first).toBe("JANE");
    expect(codes(raw)).toEqual([]);
  });

  it("the header's own delimiter declaration is opaque, so it never reports", () => {
    // The declaration carries the escape character literally, by construction. Reporting it would
    // fire on every conformant stream in existence.
    expect(unpaired(RESULT_CLEAN)).toBe(0);
    expect(tokenizeHeader("H|\\^&|||SYNTH-LAB", D).map((f) => f.raw)).toEqual([
      "H",
      "\\^&",
      "",
      "",
      "SYNTH-LAB",
    ]);
  });

  it("an escaped delimiter still reads as ONE component, which is the codec's whole point", () => {
    expect(splitEscapeAware("1&S&40", D.component, D.escape)).toEqual(["1&S&40"]);
    expect(decodeEscapes("1&S&40", D)).toBe("1^40");
    // Opaque even when the body IS the delimiter being split on: the bound preserves that.
    expect(splitEscapeAware("a&*&b", "*", "&")).toEqual(["a&*&b"]);
  });

  it("an unrecognized single-character body is still ASTM_UNKNOWN_ESCAPE_SEQUENCE, not this code", () => {
    const raw = stream(HEADER, "P|1||LAB-0001||A&Z&B^JANE||19800101|F", "L|1|N");
    expect(codes(raw)).toEqual([WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE]);
    expect(unpaired(raw)).toBe(0);
  });
});

describe("the boundary of what this fixed: an `&X&` atom still swallows a delimiter body", () => {
  it("does NOT report this code, and the value, units and status still go together", () => {
    // The scope of the fix, asserted so it cannot be restated more widely than it is. A real
    // three-character sequence is opaque by design (that is what keeps `&F&` one token under a set
    // naming `F` as a delimiter), so `&|&` under the canonical set is an atom and that field
    // separator never becomes a boundary. One character away from the headline fixture.
    const raw = stream(HEADER, "P|1||LAB-0001", "R|1|^^^687|28.6&|&U/L||||F", "L|1|N");
    const [only] = results(parseAstmRecords(raw));
    expect(only?.value).toBe("28.6&|&U/L");
    expect(only?.units).toBeUndefined();
    expect(only?.status.meaning).toBe("unspecified");

    // Never silent, but the only report is a tolerable code, so a profile expecting it lets a
    // strict parse accept the record. Recorded as a known defect, not closed here.
    expect(codes(raw)).toEqual([WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE]);
    expect(unpaired(raw)).toBe(0);
    expect(TOLERABLE_CODES.has(WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE)).toBe(true);
  });

  it("and the atom rule it comes from is exactly why it is not narrowed", () => {
    // Narrowing the atom to exclude a delimiter body would break this, which is the guarantee the
    // atom exists for: under a set declaring `F` as the field separator, `&F&` is one token.
    const alt = { field: "F", repeat: "\\", component: "^", escape: "&" };
    expect(splitEscapeAware("a&F&b", alt.field, alt.escape)).toEqual(["a&F&b"]);
    expect(decodeEscapes("a&F&b", alt)).toBe("aFb");
  });
});

describe("the codec's split and its decoder agree on what an escape sequence is", () => {
  it("a delimiter after an unpaired escape character still splits", () => {
    // This single assertion is the regression: under the old rule the delimiter was swallowed and
    // the result was ["a&^b"]. Anything that reintroduces an unbounded forward scan reddens it.
    expect(splitEscapeAware("a&^b", "^", "&")).toEqual(["a&", "b"]);
    expect(splitEscapeAware("O&BRIEN^JANE", "^", "&")).toEqual(["O&BRIEN", "JANE"]);
  });

  it("an escape character in the last two positions heads no sequence and is kept verbatim", () => {
    expect(splitEscapeAware("a^b&", "^", "&")).toEqual(["a", "b&"]);
    expect(decodeEscapes("b&", D)).toBe("b&");
    expect(decodeEscapes("b&x", D)).toBe("b&x");
  });

  it("the decoder reports every unpaired character it keeps, and only those", () => {
    let unknown = 0;
    let loose = 0;
    const out = decodeEscapes(
      "O&BRIEN&Z&x&",
      D,
      () => (unknown += 1),
      () => (loose += 1),
    );
    expect(out).toBe("O&BRIEN&Z&x&");
    expect(unknown).toBe(1); // the `&Z&`
    expect(loose).toBe(2); // the one after `O` and the trailing one
  });
});

describe("the round trip no longer bakes a mis-read into a spec-clean line", () => {
  it("emit escapes the literal character, and the re-read is the SAME tree, not the same garble", () => {
    const msg = parseAstmRecords(RESULT_WITH_LONE_ESCAPE);
    const emitted = serializeAstmRecords(msg, msg.delimiters);

    // The emitted line is spec-clean: the literal escape character goes out as `&E&`, and every
    // field separator that was on the wire is still a field separator.
    expect(emitted).toContain("R|1|^^^687|28.6&E&|U/L||N||F");
    // The old emit produced `28.6&E&&F&U/L&F&&F&N&F&&F&F`: the merged tail re-escaped into one value.
    expect(emitted).not.toContain("&F&U/L");

    const reread = parseAstmRecords(emitted);
    const [only] = results(reread);
    expect(only?.value).toBe("28.6&");
    expect(only?.units).toBe("U/L");
    expect(only?.status.meaning).toBe("final");

    // A stream this package emitted carries no unpaired escape character, so the warning does not
    // survive the trip: emit is conservative, and there is nothing left to report.
    expect(reread.warnings.map((w) => w.code)).toEqual([]);

    // Idempotent, and structurally identical on both sides.
    expect(serializeAstmRecords(reread, reread.delimiters)).toBe(emitted);
    const tree = (m: ReturnType<typeof parseAstmRecords>): string =>
      JSON.stringify(m.records.map((r) => r.fields.map((f) => f.components)));
    expect(tree(reread)).toBe(tree(msg));
  });
});

describe("the safety gate: this one is tolerable, and the reason is a property of the parse", () => {
  it("is on the tolerable list and is not safety-critical", () => {
    expect(TOLERABLE_CODES.has(WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER)).toBe(true);
    expect(isSafetyCriticalCode(WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER)).toBe(false);
  });

  it("a tolerating profile changes the report and NOT one byte of the parsed value", () => {
    const profile = defineAstmProfile({
      name: "synthetic-vendor",
      tolerate: [
        { code: "ASTM_UNPAIRED_ESCAPE_CHARACTER", rationale: "feed sends bare ampersands" },
      ],
    });
    const plain = parseAstmRecords(RESULT_WITH_LONE_ESCAPE);
    const tolerated = parseAstmRecords(RESULT_WITH_LONE_ESCAPE, { profile });

    const [a] = results(plain);
    const [b] = results(tolerated);
    expect(b?.value).toBe(a?.value);
    expect(b?.units).toBe(a?.units);
    expect(b?.status.meaning).toBe(a?.status.meaning);

    const quirk = tolerated.warnings.find((w) => w.code === WARNING_CODES.PROFILE_QUIRK_APPLIED);
    expect(quirk?.toleratedCode).toBe(WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER);
    // Negative control on the comparison itself: the two parses must differ SOMEWHERE, or the
    // assertion above is comparing a thing to itself.
    expect(tolerated.warnings.map((w) => w.code)).not.toEqual(plain.warnings.map((w) => w.code));
  });

  it("strict refuses an untolerated one, and accepts it once a profile expects it", () => {
    expect(() => parseAstmRecords(RESULT_WITH_LONE_ESCAPE, { strict: true })).toThrow(
      AstmStrictError,
    );
    const profile = defineAstmProfile({
      name: "synthetic-vendor",
      tolerate: [
        { code: "ASTM_UNPAIRED_ESCAPE_CHARACTER", rationale: "feed sends bare ampersands" },
      ],
    });
    expect(() =>
      parseAstmRecords(RESULT_WITH_LONE_ESCAPE, { strict: true, profile }),
    ).not.toThrow();
    // The clean stream was never at risk either way.
    expect(() => parseAstmRecords(RESULT_CLEAN, { strict: true })).not.toThrow();
  });
});
