/**
 * A boundary the reading may have GAINED now has a report of its own.
 *
 * Escape sequences are matched greedily, leftmost first, so the escape character that closes one
 * triple cannot also open the next. Where it could have, the same bytes carry two alignments that
 * disagree by exactly one boundary: under the reading taken, `28.6&Z&|&U/L` is the atom `&Z&`, then
 * a field separator that splits, then a literal escape character; under the other it is a literal
 * escape character, then `28.6&Z`, then the atom `&|&` whose field separator splits nothing, and the
 * whole thing is one unsplit field.
 *
 * **This is the mirror of the swallowed-delimiter case and the more dangerous half.** That one
 * reports a boundary the reading lost. This one reports a boundary the reading may have gained, and
 * a gained boundary hands a consumer a value and a units string the sender's bytes do not
 * unambiguously carry. Both codes the condition raised before this one existed
 * (`ASTM_UNKNOWN_ESCAPE_SEQUENCE` and `ASTM_UNPAIRED_ESCAPE_CHARACTER`) are on the profile
 * allow-list, so a gate-legal profile naming them left `{ strict: true }` accepting the altered
 * reading.
 *
 * **This slice adds a second, narrower code and changes nothing else.** The split is untouched, every
 * decoded byte is identical, and both tolerable codes still fire and stay tolerable, because each
 * remains true and benign of the cases that cost nothing. Picking the other alignment was considered
 * and is not what happens here: it is a different guess with no more evidence behind it, and it would
 * change values on a published package. What is new is that the ambiguity is reported by a code no
 * profile may tolerate.
 *
 * **Two things this does NOT do, stated so they are not read into it.** It does not repair the
 * reading: the value below is the same value it always was. And it does not reach through a re-emit:
 * emit rewrites the preserved sequences into recognized mnemonics, and that stream carries the
 * reading that was taken unambiguously, so a second-generation read is silent and is correct about
 * its own bytes. The first read of the wire bytes is the only place the ambiguity exists.
 *
 * **The corpus is named by the constants in this file** (`ALIGNMENT_ALPHABET` and `neutralStream`),
 * and every count below is derived from them inside the assertion rather than written as a literal.
 * A figure whose corpus is not in the tree cannot be re-derived. The measure is
 * **strict-accepted-under-a-gate-legal-profile**, not "zero silent": a non-canonical or unrecognized
 * escape body always raises a tolerable code, so an empty warning list is structurally unreachable
 * for anything that could exhibit this at all.
 *
 * All fixtures are **synthetic**. No clause of ASTM E1394 / CLSI LIS01 / LIS02 is claimed: the atom
 * rule, the mnemonic set and the leftmost match are this package's own codec, and nothing here rests
 * on standards text this repo cannot read.
 */

import { describe, expect, it } from "vitest";

import {
  AstmStrictError,
  defineAstmProfile,
  parseAstmRecords,
  results,
  serializeAstmRecords,
  splitEscapeAware,
  TOLERABLE_CODES,
  WARNING_CODES,
} from "../../src/index.js";

const codes = (raw: string) => parseAstmRecords(raw).warnings.map((w) => w.code);

/** The measured fixture: `&Z&` immediately before a field separator that is itself followed by an escape character. */
const GAINED = "H|\\^&\rP|1||LAB-0001\rR|1|^^^687|28.6&Z&|&U/L||||F\rL|1|N\r";

/**
 * The widest profile the safety gate permits, built **from** the allow-list so it cannot drift out of
 * step with it. Acceptance under this profile is the strongest form of "a gate-legal profile accepts
 * it", which is the tier this defect is measured on.
 */
const maximalTolerance = defineAstmProfile({
  name: "maximalTolerance",
  description:
    "Every code the safety gate permits a profile to tolerate, so acceptance here is the widest a " +
    "gate-legal profile can be. A measurement instrument, not a shipped profile.",
  tolerate: [...TOLERABLE_CODES].map((code) => ({
    code,
    rationale: "Measurement instrument: the widest tolerance the safety gate permits.",
  })),
});

const acceptedUnderMaximalTolerance = (raw: string): boolean => {
  try {
    parseAstmRecords(raw, { strict: true, profile: maximalTolerance });
    return true;
  } catch (err) {
    if (err instanceof AstmStrictError) return false;
    throw err;
  }
};

/**
 * The committed corpus alphabet: the four recognized mnemonics, the three splitting roles of the
 * canonical set, its escape role, and four characters that are neither. Twelve characters, swept in
 * both positions of the pair that decides this (the earlier sequence's body, and the character the
 * competing alignment would have held).
 */
const ALIGNMENT_ALPHABET = ["F", "S", "R", "E", "|", "\\", "^", "&", "~", ":", "#", "*"] as const;

/**
 * The committed corpus stream: a comment record, whose text field carries components and repeats
 * without any of them meaning anything clinically, so the only codes a tuple raises are the escape
 * codes themselves. A result record is the harm fixture (see `GAINED`); this is the measurement
 * carrier, chosen so the count is not dominated by unrelated result-semantics warnings.
 */
const neutralStream = (body: string, next: string): string =>
  `H|\\^&\rP|1||LAB-0001\rC|1|I|28.6&${body}&${next}&U/L|G\rL|1|N\r`;

/** The three splitting roles of the canonical set, named rather than counted. */
const SPLITTING_ROLES = ["|", "\\", "^"] as const;
/** The canonical field separator: the only role the later shift report is wired to. */
const FIELD_SEPARATOR = "|";
/** The canonical repeat separator: the only role the later truncation report is wired to. */
const REPEAT_SEPARATOR = "\\";
/** The canonical component separator: the only role the later component report is wired to. */
const COMPONENT_SEPARATOR = "^";
/** The four recognized escape mnemonics: a body this codec can interpret, which the exclusion turns on. */
const MNEMONICS = ["F", "S", "R", "E"] as const;

/**
 * The codes that landed **after** this one and ask a different question about the same contested
 * position: what the reading taken makes of the bytes past the boundary. They are held out of this
 * file's tier wherever it measures what THIS code moved, so those figures stay the ones this slice
 * took rather than being re-cut every time another code lands on the same corpus. Each one's own
 * delta is measured separately, below.
 */
const LATER_TAIL_CODES = [
  WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS,
  WARNING_CODES.ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD,
  WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS,
] as const;

describe("the measured fixture: a boundary the leftmost alignment gained", () => {
  it("reads a value and units the bytes do not unambiguously carry, and now says so", () => {
    const [only] = results(parseAstmRecords(GAINED));
    // The reading is unchanged by this slice. Under the competing alignment there is no second
    // field at all, so neither of these two strings is a reading the bytes force.
    expect(only?.value).toBe("28.6&Z&");
    expect(only?.units).toBe("&U/L");
    expect(only?.status.meaning).toBe("final");

    // The gained boundary here is a FIELD boundary and the reading resumes on a bare escape
    // character, so the later shift report fires alongside this one. Neither is a widening of the
    // other: this code answers whether the codec's vocabulary prefers the reading taken AT the
    // contested position, that one answers what the reading makes of the bytes AFTER it.
    expect(codes(GAINED)).toEqual([
      WARNING_CODES.ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT,
      WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS,
      WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
      WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER,
    ]);
    const w = parseAstmRecords(GAINED).warnings[0];
    // The field the gained boundary ended: the value field, not the one it created.
    expect(w?.position).toEqual({ recordIndex: 2, recordType: "R", fieldIndex: 4 });
    // A delimiter is a byte off the wire; the message names none of them.
    expect(w?.message).not.toMatch(/[|^&\\]/u);
  });

  it("is refused in strict mode under the widest gate-legal profile there can be", () => {
    expect(acceptedUnderMaximalTolerance(GAINED)).toBe(false);
    try {
      parseAstmRecords(GAINED, { strict: true, profile: maximalTolerance });
      expect.unreachable("the new code must escalate");
    } catch (err) {
      const escalating = (err as AstmStrictError).warnings.map((x) => x.code);
      // The two tolerated ones are re-badged and do not escalate; the two untolerable ones do.
      expect(escalating).toEqual([
        WARNING_CODES.ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT,
        WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS,
      ]);
    }
  });

  it("keeps both tolerable codes tolerable and the new one out of reach of a profile", () => {
    expect(TOLERABLE_CODES.has(WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE)).toBe(true);
    expect(TOLERABLE_CODES.has(WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER)).toBe(true);
    expect(TOLERABLE_CODES.has(WARNING_CODES.ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT)).toBe(false);
    expect(() =>
      defineAstmProfile({
        name: "nope",
        tolerate: [{ code: WARNING_CODES.ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT, rationale: "no" }],
      }),
    ).toThrow();
  });

  it("does not change the split: the leftmost alignment is still the one taken", () => {
    // Reporting the ambiguity is the whole change. Taking the other alignment would be a different
    // guess, and it would move values on a published package.
    expect(splitEscapeAware("28.6&Z&|&U/L", "|", "&")).toEqual(["28.6&Z&", "&U/L"]);
    expect(splitEscapeAware("a&F&b", "F", "&")).toEqual(["a&F&b"]);
  });

  it("does NOT reach through a re-emit, and the second generation is right about its own bytes", () => {
    // Emit escapes the preserved characters into recognized mnemonics, and those bytes carry the
    // reading that was taken with no competing alignment left in them. The disclosure is that the
    // catch point is the FIRST read, not that the round trip is guarded.
    const emitted = serializeAstmRecords(parseAstmRecords(GAINED));
    expect(emitted).toContain("28.6&E&Z&E&|&E&U/L");
    expect(codes(emitted)).toEqual([]);
    expect(results(parseAstmRecords(emitted))[0]?.value).toBe("28.6&Z&");
    expect(results(parseAstmRecords(emitted))[0]?.units).toBe("&U/L");
  });
});

describe("the sweep over the committed alignment alphabet", () => {
  it("reports exactly the pairs where a competing alignment would have held the delimiter", () => {
    const reported: string[] = [];
    const expected: string[] = [];
    for (const body of ALIGNMENT_ALPHABET) {
      for (const next of ALIGNMENT_ALPHABET) {
        // Reported only where the earlier body is unrecognized (a recognized one is a construct
        // this codec can interpret, so its own vocabulary prefers the reading taken) and the
        // character the competitor would have held is a delimiter something splits on.
        if (
          !(MNEMONICS as readonly string[]).includes(body) &&
          (SPLITTING_ROLES as readonly string[]).includes(next)
        ) {
          expected.push(body + next);
        }
        if (
          codes(neutralStream(body, next)).includes(
            WARNING_CODES.ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT,
          )
        ) {
          reported.push(body + next);
        }
      }
    }
    expect(reported).toEqual(expected);
    // Derived from the alphabet, never written as a literal: eight unrecognized bodies against the
    // three splitting roles, out of the full square.
    expect(expected).toHaveLength(
      (ALIGNMENT_ALPHABET.length - MNEMONICS.length) * SPLITTING_ROLES.length,
    );
  });

  it("moves exactly the tuples a gate-legal profile used to accept, and no others", () => {
    // ── READ THIS BEFORE TOUCHING A NUMBER HERE. These figures measure what THIS code moved, and
    // LATER codes refuse some of the same tuples on a different test. A figure quoted against a
    // moving base goes stale without anyone being wrong, so every later code is held out of the
    // tier explicitly rather than the numbers being re-cut each time one lands. Held out, every
    // figure below is the one this slice measured. The list is derived rather than typed twice:
    // both later codes ask about the same contested position and are named together below.
    let acceptedNow = 0;
    let newlyRefused = 0;
    for (const body of ALIGNMENT_ALPHABET) {
      for (const next of ALIGNMENT_ALPHABET) {
        const raw = neutralStream(body, next);
        const seen = codes(raw);
        const fired = seen.includes(WARNING_CODES.ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT);
        const heldOut = seen.filter((c) => !(LATER_TAIL_CODES as readonly string[]).includes(c));
        // What the parse would have been before this code existed: the slice is purely additive, so
        // dropping the new code from the list reconstructs the previous warning set exactly.
        const acceptedBefore = heldOut
          .filter((c) => c !== WARNING_CODES.ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT)
          .every((c) => TOLERABLE_CODES.has(c));
        const acceptedOnThisCode = heldOut.every((c) => TOLERABLE_CODES.has(c));
        if (acceptedOnThisCode) acceptedNow += 1;
        if (acceptedBefore && fired) newlyRefused += 1;
        // Acceptance moved on exactly the tuples this code fired on AND nothing else already refused.
        expect(acceptedOnThisCode).toBe(acceptedBefore && !fired);
      }
    }
    const total = ALIGNMENT_ALPHABET.length * ALIGNMENT_ALPHABET.length;
    // 144 tuples over the committed alphabet: 108 were strict-accepted under the widest gate-legal
    // profile and 93 are now. 24 tuples raise the new code; the other 9 of those were already
    // refused by ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE, so 15 is the acceptance delta, not the
    // fire count. Never write the two as the same number.
    expect(total).toBe(144);
    expect(newlyRefused).toBe(15);
    expect(acceptedNow).toBe(93);
    expect(acceptedNow + newlyRefused).toBe(108);
  });

  it("shares this corpus with the later shift report, whose own delta is measured separately", () => {
    // The later code's effect on the SAME corpus, so the two are never read as one number. It is
    // wired to the field split only, so it can fire on exactly one column of this square: the one
    // where the character the competing alignment would have held is the field separator. Every
    // count is derived from the committed alphabet inside the assertion.
    const fires: string[] = [];
    let newlyRefusedByShift = 0;
    for (const body of ALIGNMENT_ALPHABET) {
      for (const next of ALIGNMENT_ALPHABET) {
        const raw = neutralStream(body, next);
        const seen = codes(raw);
        if (seen.includes(WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS))
          fires.push(body + next);
        const acceptedHoldingItOut = seen
          .filter((c) => c !== WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS)
          .every((c) => TOLERABLE_CODES.has(c));
        if (
          acceptedHoldingItOut &&
          seen.includes(WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS)
        ) {
          newlyRefusedByShift += 1;
        }
      }
    }
    // One column, every body: the tail in this carrier is always a bare escape character.
    expect(fires).toHaveLength(ALIGNMENT_ALPHABET.length);
    for (const t of fires) expect(t.endsWith(FIELD_SEPARATOR)).toBe(true);
    // Of that column, the tuples a gate-legal profile still accepted are exactly the four
    // recognized mnemonic bodies: on every unrecognized body THIS file's code already fired, and it
    // is untolerable, so those tuples were refused before the shift report existed. The four the
    // shift report moves are precisely the ones this code's recognized-body exclusion left silent.
    expect(newlyRefusedByShift).toBe(MNEMONICS.length);
  });

  it("shares it with the later truncation report too, whose delta is the same size", () => {
    // The second later code on the SAME corpus, measured on its own so the three are never read as
    // one number. It is wired to the repeat split only, so it fires on exactly one column of this
    // square: the one where the character the competing alignment would have held is the canonical
    // repeat separator. Every count is derived from the committed alphabet inside the assertion.
    const fires: string[] = [];
    let newlyRefusedByTruncation = 0;
    for (const body of ALIGNMENT_ALPHABET) {
      for (const next of ALIGNMENT_ALPHABET) {
        const raw = neutralStream(body, next);
        const seen = codes(raw);
        const fired = seen.includes(WARNING_CODES.ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD);
        if (fired) fires.push(body + next);
        const acceptedHoldingItOut = seen
          .filter((c) => c !== WARNING_CODES.ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD)
          .every((c) => TOLERABLE_CODES.has(c));
        if (acceptedHoldingItOut && fired) newlyRefusedByTruncation += 1;
      }
    }
    // One column, every body: the tail in this carrier is always a bare escape character.
    expect(fires).toHaveLength(ALIGNMENT_ALPHABET.length);
    for (const t of fires) expect(t.endsWith(REPEAT_SEPARATOR)).toBe(true);
    // And the two later codes never fire on the same tuple: different columns, by construction.
    for (const t of fires) expect(t.endsWith(FIELD_SEPARATOR)).toBe(false);
    // Of that column the four recognized mnemonic bodies are what moves, for the same reason as the
    // shift report: on every unrecognized body THIS file's code already fired and is untolerable.
    expect(newlyRefusedByTruncation).toBe(MNEMONICS.length);
  });

  it("shares it with the later component report too, and the three columns partition the roles", () => {
    // The third later code on the SAME corpus, measured on its own so the four are never read as
    // one number. It is wired to the component split only, so it fires on exactly one column of
    // this square: the one where the character the competing alignment would have held is the
    // canonical component separator. Every count is derived from the committed alphabet inside the
    // assertion.
    const fires: string[] = [];
    let newlyRefusedByComponents = 0;
    for (const body of ALIGNMENT_ALPHABET) {
      for (const next of ALIGNMENT_ALPHABET) {
        const raw = neutralStream(body, next);
        const seen = codes(raw);
        const fired = seen.includes(WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS);
        if (fired) fires.push(body + next);
        const acceptedHoldingItOut = seen
          .filter((c) => c !== WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS)
          .every((c) => TOLERABLE_CODES.has(c));
        if (acceptedHoldingItOut && fired) newlyRefusedByComponents += 1;
      }
    }
    // One column, every body: the tail in this carrier is always a bare escape character.
    expect(fires).toHaveLength(ALIGNMENT_ALPHABET.length);
    for (const t of fires) expect(t.endsWith(COMPONENT_SEPARATOR)).toBe(true);
    // And no tuple is shared with either of the other two later codes: three disjoint columns, one
    // per splitting role, which is now the whole of that axis.
    for (const t of fires) {
      expect(t.endsWith(FIELD_SEPARATOR)).toBe(false);
      expect(t.endsWith(REPEAT_SEPARATOR)).toBe(false);
    }
    expect(SPLITTING_ROLES).toHaveLength(3);
    // Of that column the four recognized mnemonic bodies are what moves, for the same reason as the
    // other two: on every unrecognized body THIS file's code already fired and is untolerable.
    expect(newlyRefusedByComponents).toBe(MNEMONICS.length);
  });

  it("reads every tuple into the same bytes, so only the reporting changed", () => {
    for (const body of ALIGNMENT_ALPHABET) {
      for (const next of ALIGNMENT_ALPHABET) {
        const raw = neutralStream(body, next);
        // Nothing is dropped and nothing is invented: every character between the record's third
        // field separator and its last survives into the parsed record's raw fields.
        const record = parseAstmRecords(raw).records[2];
        const rejoined = record?.fields.map((f) => f.raw).join("|");
        expect(rejoined).toBe(`C|1|I|28.6&${body}&${next}&U/L|G`);
      }
    }
  });
});

describe("what it deliberately does not report", () => {
  it("leaves a recognized mnemonic alone, and a SECOND code now covers what that left open", () => {
    // THIS code is still silent here, and deliberately so: the reading taken interprets a construct
    // (`&F&` is the sender escaping a field separator) while the competitor's body is a delimiter
    // character this codec cannot interpret, so its own vocabulary prefers the reading taken, and
    // reporting it would report the mechanism working. That exclusion is unchanged by the later
    // slice and is pinned here so a widening of THIS test cannot land silently.
    const raw = "H|\\^&\rP|1||LAB-0001\rR|1|^^^687|28.6&F&|&U/L||||F\rL|1|N\r";
    expect(codes(raw)).not.toContain(WARNING_CODES.ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT);
    // What it never followed from that argument is that the reading taken is CONFORMANT. It is not:
    // it carries a bare escape character, the value holds a raw field separator, and the gained
    // FIELD boundary shifts every later field, so the sender's trailing `F` is read out of the
    // result-status slot. That is answered by a different question about the same position, and
    // therefore by a different code, not by widening the test above.
    expect(codes(raw)).toEqual([
      WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS,
      WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER,
    ]);
    const [only] = results(parseAstmRecords(raw));
    expect(only?.value).toBe("28.6|");
    expect(only?.units).toBe("&U/L");
    // The reading is UNCHANGED by that second code: it reports, it does not repair.
    expect(only?.status.meaning).toBe("final");
    // And the reason it stopped being a residue: a gate-legal profile no longer accepts it.
    expect(acceptedUnderMaximalTolerance(raw)).toBe(false);
  });

  it("stays silent where BOTH alignments interpret a construct, and a THIRD code covers it", () => {
    // Under a set naming a mnemonic letter as a splitting delimiter the competitor's body is
    // recognized too, so each alignment interprets exactly one construct and neither is preferred.
    // THIS code's exclusion silences it anyway, and that exclusion is unchanged: it is pinned here
    // so a widening of this test cannot land silently. What answers the case is the same tail
    // question the shift report asks, taken on the repeat split instead, which is a third code.
    const raw = "H|F^&\rP|1||LAB-0001\rR|1|^^^687|28.6&S&F&U/L||||F\rL|1|N\r";
    expect(codes(raw)).not.toContain(WARNING_CODES.ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT);
    expect(codes(raw)).toEqual([
      WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS,
      WARNING_CODES.ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD,
      WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER,
    ]);
    const [only] = results(parseAstmRecords(raw));
    // What the gained REPEAT boundary costs is the VALUE, and only the value. It reaches no
    // field-indexed slot: the units slot is empty and the status is `unspecified` under BOTH
    // alignments of these bytes, decided by the record's own eight-field shape. Reading those two
    // as a cost of the boundary was measured false, and the reading is unchanged by the new code:
    // it reports, it does not repair.
    expect(only?.value).toBe("28.6^");
    expect(only?.units).toBeUndefined();
    expect(only?.status.meaning).toBe("unspecified");
    // And the reason it stopped being a residue: a gate-legal profile no longer accepts it.
    expect(acceptedUnderMaximalTolerance(raw)).toBe(false);
  });

  it("stays silent where no competing alignment exists at all", () => {
    // The character after the delimiter is not the escape character, so the alternative sequence
    // would never close and there is only one reading. An ordinary escaped value followed by an
    // ordinary boundary must not become noisy.
    const raw = "H|\\^&\rP|1||LAB-0001\rR|1|^^^687|28.6&Z&|U/L||N||F\rL|1|N\r";
    expect(codes(raw)).toEqual([WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE]);
    expect(codes("H|\\^&\rP|1||LAB-0001\rR|1|^^^687|1&S&40|U/L||N||F\rL|1|N\r")).toEqual([]);
  });

  it("does not fire on the swallowed-delimiter case, which is the opposite condition", () => {
    // A delimiter INSIDE the atom is a boundary lost, and it has its own code. Nothing is gained
    // there, so this code correctly stays out of it.
    const swallowed = "H|\\^&\rP|1||LAB-0001\rR|1|^^^687|28.6&|&U/L||||F\rL|1|N\r";
    expect(codes(swallowed)).toEqual([
      WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
      WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE,
    ]);
  });
});

describe("the three splitting roles, each asked exactly once", () => {
  it("reports a gained repeat boundary and a gained component boundary, once each", () => {
    // The split runs once per role, so a character that is a delimiter in a later role survives into
    // the segment that role's pass reads. Each of these carries exactly one competing alignment.
    const repeated = "H|\\^&\rP|1||LAB-0001\rC|1|I|28.6&Z&\\&U/L|G\rL|1|N\r";
    const componentised = "H|\\^&\rP|1||LAB-0001\rC|1|I|28.6&Z&^&U/L|G\rL|1|N\r";
    for (const raw of [repeated, componentised]) {
      const fired = codes(raw).filter(
        (c) => c === WARNING_CODES.ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT,
      );
      expect(fired).toHaveLength(1);
    }
  });

  it("reports a header's data portion at the whole-record field index, and never its declaration", () => {
    // The header has its own tokenizer because its declaration carries the non-field delimiters
    // literally. The declaration is opaque and reports nothing; the data portion reports normally,
    // with its indices shifted back to whole-record positions.
    const raw = "H|\\^&|28.6&Z&|&U/L|sender\rP|1||LAB-0001\rL|1|N\r";
    expect(codes(raw)).toContain(WARNING_CODES.ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT);
    const w = parseAstmRecords(raw).warnings.find(
      (x) => x.code === WARNING_CODES.ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT,
    );
    expect(w?.position).toEqual({ recordIndex: 0, recordType: "H", fieldIndex: 3 });
    // A declaration whose own bytes have the shape of a sequence followed by a delimiter is taken
    // verbatim as one opaque field, so it contributes nothing here.
    expect(codes("H|&^&\rP|1||LAB-0001\rL|1|N\r")).not.toContain(
      WARNING_CODES.ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT,
    );
  });
});
