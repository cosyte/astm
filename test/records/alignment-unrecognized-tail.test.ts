/**
 * A contested boundary bought with a construct the reading taken **cannot interpret** is reported,
 * and that is two tails rather than one.
 *
 * Escape sequences are matched greedily, leftmost first, so the escape character closing one triple
 * cannot also open the next. Where it could have, the same bytes carry two alignments that disagree
 * by one boundary, and three reports already fire on that: one per splitting role, each naming what
 * the gained boundary costs in its own role. All three asked the same question about the tail, and
 * all three asked it too narrowly: they fired only where the escape character the reading resumes on
 * heads **no sequence at all**, and stayed silent where it heads a sequence whose body this codec
 * does **not recognize**. That silence is what this file closes.
 *
 * **THE CORRECTION IS TO THE REASON, WHICH IS WHY IT IS WORTH WRITING DOWN.** The recorded reason
 * for the silence was a comparison of preferences: in that case the competing alignment would leave
 * **two** escape characters bare while the reading taken carries one unreadable body, so the bytes
 * prefer the reading taken more strongly there, not less. That comparison is true. It is not the
 * question these codes ask. They report a **cost**: a modeled slot decided by a boundary the bytes
 * do not force. The cost is the same one under both tails, which is measured here rather than
 * asserted, and **consuming a triple is not interpreting one**: an unrecognized body is preserved
 * verbatim and never guessed at, and this package already reports it as a deviation in its own
 * right. A reading that resumes on one has bought its boundary with bytes it cannot read exactly as
 * a reading that resumes on a bare escape character has.
 *
 * **WHAT STAYS SILENT, AND IT IS THE WHOLE OF THE OVER-REFUSAL ARGUMENT.** The third tail, where the
 * escape character heads a sequence this codec **recognizes**, is untouched. That is the only tail
 * on which a stream can be escape-clean at all, so it is the only one whose refusal could reach
 * traffic whose escaping is working. Under a set naming the field separator `F`, `28.6&F&F&F&U/L` is
 * the sender escaping that separator, writing it, and escaping it again: nothing is reported and
 * nothing is refused. Refusing that is the failure that sank a preceding candidate criterion for
 * this family, and the criterion here **cannot** commit it: wherever the escape role is a character
 * distinct from the three splitting roles, every position it now rejects is one the package already
 * reports, as an unpaired escape character or as an unrecognized escape sequence. That property is
 * asserted on every firing tuple below rather than argued. **This corpus holds the escape role
 * fixed, so that scope is the corpus's own bound and not a universal**: off it the claim is false
 * and the collision code is what refuses the stream. See
 * `test/records/alignment-companion-universal.test.ts`.
 *
 * **THAT REMAINING SILENCE IS A TRADE, NOT A CLAIM THAT NOTHING WAS LOST, AND IT IS PINNED BELOW.**
 * The gained boundary is exactly as real on the excluded tail, and there it is not merely
 * under-reported: it is `warnings: []`, so a lenient consumer sees nothing at all. On the canonical
 * set `R|1|^^^687|28.6&F&|&F&U/L||||F` reads nine fields against the competing alignment's eight and
 * hands back a status of `final`; `28.6&S&\&S&U/L` reads a value of `28.6^`; `&F&^&F&GLU^L^687` reads one
 * component more, so a coding scheme and a local code sit where an alignment guess put them. Every
 * surface that states this bound has to state that beside it.
 *
 * **THE AXIS THE SHARED 864-TUPLE CORPUS FIXES, SWEPT HERE.** That corpus carries a `tail` axis with
 * three values but fixes the tail sequence's **body** to one character, so a criterion measured only
 * there would say nothing about which bodies it fires on. The sweep below varies that body over the
 * same committed alphabet as every other body axis in this suite, crossed with the declared set, the
 * splitting role and the contested body, and asserts the observed disposition of every tuple against
 * a predicate derived from those alphabets. No count in it is hand-typed.
 *
 * **It is a report, not a repair.** The split is unchanged, every decoded byte is identical, and the
 * values read are the values that were always read. Withholding the moved slots stays a separate
 * question and is not answered here.
 *
 * **The tier is strict-accepted-under-a-gate-legal-profile.** "0 silent" has no discriminating power
 * here: anything that can exhibit this raises a tolerable code, so an empty warning list is
 * structurally unreachable.
 *
 * All fixtures are **synthetic**, including the patient name and the identifiers, which are there on
 * purpose: a claim about a record carrying an identity has to be tested on a payload that carries
 * one. No clause of ASTM E1394 / CLSI LIS01 / LIS02 is claimed anywhere here. The atom rule, the
 * mnemonic set, the leftmost match and this criterion are all this package's own codec, and nothing
 * rests on standards text this repo cannot read.
 */

import { describe, expect, it } from "vitest";

import {
  AstmStrictError,
  defineAstmProfile,
  parseAstmRecords,
  patient,
  results,
  serializeAstmRecords,
  splitEscapeAware,
  TOLERABLE_CODES,
  WARNING_CODES,
} from "../../src/index.js";

const SHIFT = WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS;
const TRUNCATED = WARNING_CODES.ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD;
const COMPONENTS = WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS;
const ALIGNMENT = WARNING_CODES.ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT;

/** The three tail reports, one per splitting role. There is no fourth: nothing splits on escape. */
const TAIL_CODES = [SHIFT, TRUNCATED, COMPONENTS] as const;
/** The same list widened to plain strings, for membership tests over observed code lists. */
const TAIL_CODE_NAMES: readonly string[] = TAIL_CODES;

const codes = (raw: string) => parseAstmRecords(raw).warnings.map((w) => w.code);

/**
 * The widest profile the safety gate permits, built **from** the allow-list so it cannot drift out
 * of step with it. Acceptance under this profile is the strongest form of "a gate-legal profile
 * accepts it", which is the tier this whole file is measured on.
 *
 * **This is also the harness's standing negative control.** It is constructed by spreading this
 * package's own tolerable set, so a copy of this file pointed at a sibling parser fails loudly on
 * that spread rather than quietly producing a number against the wrong package.
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
 * The competing alignment of the same bytes, **transcribed here and shipped nowhere**, so what the
 * other reading gives is measured rather than asserted from memory. At a contested position the
 * escape character that closes the leftmost triple instead opens the competing one: the two
 * characters before it become literals, the three from it become an opaque atom holding the
 * delimiter, and the scan resumes one character further on than the leftmost reading does.
 */
const competingSplit = (text: string, delimiter: string, escape: string): string[] => {
  const out: string[] = [];
  let current = "";
  let i = 0;
  while (i < text.length) {
    const isTriple = text.charAt(i) === escape && text.charAt(i + 2) === escape;
    const contested = isTriple && text.charAt(i + 3) === delimiter && text.charAt(i + 4) === escape;
    if (contested) {
      current += text.slice(i, i + 5);
      i += 5;
      continue;
    }
    if (isTriple) {
      current += text.slice(i, i + 3);
      i += 3;
      continue;
    }
    if (text.charAt(i) === delimiter) {
      out.push(current);
      current = "";
      i += 1;
      continue;
    }
    current += text.charAt(i);
    i += 1;
  }
  out.push(current);
  return out;
};

/* ──────────────── the three harms, on the canonical set, one per splitting role ──────────────── */

/**
 * The field-role fixture: a gained **field** boundary whose tail heads `&Z&`, a sequence this codec
 * cannot interpret. Carries a name and identifiers on purpose, because the harm it exhibits is a
 * fabricated result status attached to a real modeled result. **Synthetic: no real person, no real
 * MRN, no real accession.**
 */
const FIELD_HARM =
  "H|\\^&\r" +
  "P|1||MRN-0001||SYNTHETIC^GRAZYNA^Q||19700101|F\r" +
  "R|1|^^^687|28.6&F&|&Z&U/L||||F\r" +
  "L|1|N\r";
const FIELD_HARM_RECORD = "R|1|^^^687|28.6&F&|&Z&U/L||||F";

/** The repeat-role fixture: a gained **first** repeat boundary, so the value truncates. */
const REPEAT_HARM =
  "H|\\^&\r" +
  "P|1||MRN-0001||SYNTHETIC^GRAZYNA^Q||19700101|F\r" +
  "R|1|^^^687|28.6&S&\\&Z&U/L|U/L||||F\r" +
  "L|1|N\r";

/**
 * The component-role fixture: a gained **component** boundary inside a patient name. The last name
 * carries the field separator the leading sequence decodes to, under **both** alignments, so it is
 * not one of the slots in question and is deliberately not asserted as `DOE`.
 */
const COMPONENT_HARM = "H|\\^&\rP|1||MRN-0001||DOE&F&^&Z&JANE^A||19700101|F\rL|1|N\r";

describe("the field role: a fabricated status bought with a construct the reading cannot read", () => {
  it("reads a status the competing alignment puts in no field at all", () => {
    const leftmost = splitEscapeAware(FIELD_HARM_RECORD, "|", "&");
    const competing = competingSplit(FIELD_HARM_RECORD, "|", "&");
    expect(leftmost).toHaveLength(competing.length + 1);
    // Field 9 (the result status) exists under the reading taken and does not exist under the other.
    expect(leftmost[8]).toBe("F");
    expect(competing[8]).toBeUndefined();
    // Both readings consume every byte: neither is forced, and that is the whole condition.
    expect(leftmost.join("|")).toBe(FIELD_HARM_RECORD);
    expect(competing.join("|")).toBe(FIELD_HARM_RECORD);
  });

  it("is reported now, and a gate-legal profile no longer accepts it", () => {
    const parsed = parseAstmRecords(FIELD_HARM);
    // NON-VACUITY: the payload can express the harm. A safety claim tested against bytes that carry
    // no identity proves nothing, so the identity is asserted before the harm is.
    expect(parsed.records[1]?.fields[5]?.raw).toBe("SYNTHETIC^GRAZYNA^Q");
    expect(parsed.records[1]?.fields[3]?.raw).toBe("MRN-0001");
    const [only] = results(parsed);
    expect(only?.value).toBe("28.6|");
    expect(only?.status.meaning).toBe("final");
    expect(only?.status.isActiveFinal).toBe(true);

    const seen = codes(FIELD_HARM);
    expect(seen).toContain(SHIFT);
    // What it looked like before: one tolerable code, so the widest gate-legal profile accepted it.
    expect(seen.filter((c) => c !== SHIFT)).toEqual([WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE]);
    expect(seen.filter((c) => c !== SHIFT).every((c) => TOLERABLE_CODES.has(c))).toBe(true);
    expect(acceptedUnderMaximalTolerance(FIELD_HARM)).toBe(false);
    // The earlier alignment report stays silent: its recognized-body exclusion is untouched here.
    expect(seen).not.toContain(ALIGNMENT);

    const w = parsed.warnings.find((x) => x.code === SHIFT);
    expect(w?.position).toEqual({ recordIndex: 2, recordType: "R", fieldIndex: 4 });
    // A delimiter is a byte off the wire and a name is PHI: the message carries neither.
    expect(w?.message).not.toMatch(/[|^&\\]/u);
    expect(w?.message).not.toMatch(/GRAZYNA|MRN-0001|28\.6/u);
  });

  it("is a report and not a repair: every byte survives into the fields, in order", () => {
    expect(
      parseAstmRecords(FIELD_HARM)
        .records[2]?.fields.map((f) => f.raw)
        .join("|"),
    ).toBe(FIELD_HARM_RECORD);
  });

  it("does not reach through a re-emit, so it must be caught on the FIRST read", () => {
    // Emit rewrites the preserved sequences into recognized mnemonics, and those bytes carry the
    // reading that was taken unambiguously. Generation two is silent and is CORRECT about its own
    // bytes. A clean re-read is not evidence that generation one was read right.
    const generation2 = serializeAstmRecords(parseAstmRecords(FIELD_HARM));
    expect(codes(generation2)).not.toContain(SHIFT);
    expect(acceptedUnderMaximalTolerance(generation2)).toBe(true);
  });
});

describe("the repeat role: a value truncated at a boundary bought the same way", () => {
  it("stops the value at the gained boundary and reports it now", () => {
    const parsed = parseAstmRecords(REPEAT_HARM);
    expect(parsed.records[1]?.fields[5]?.raw).toBe("SYNTHETIC^GRAZYNA^Q");
    const [only] = results(parsed);
    // The harm: every value extractor answers the first repeat alone, and the rest is on the wire.
    expect(only?.value).toBe("28.6^");
    expect(parsed.records[2]?.fields[3]?.repeats).toEqual([["28.6^"], ["&Z&U/L"]]);
    const seen = codes(REPEAT_HARM);
    expect(seen).toContain(TRUNCATED);
    expect(seen.filter((c) => c !== TRUNCATED)).toEqual([
      WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
    ]);
    expect(acceptedUnderMaximalTolerance(REPEAT_HARM)).toBe(false);
    // Disjoint from the other two columns, asserted rather than reasoned from the wiring.
    expect(seen).not.toContain(SHIFT);
    expect(seen).not.toContain(COMPONENTS);
  });
});

describe("the component role: a given name moved one slot along, bought the same way", () => {
  it("moves the NAMED slots and reports it now", () => {
    const parsed = parseAstmRecords(COMPONENT_HARM);
    // The reading taken: three components, so `&Z&JANE` is the given name and `A` the middle name.
    expect(patient(parsed)?.name).toMatchObject({ first: "&Z&JANE", middle: "A" });
    // The competing alignment reads three, so `A` is the GIVEN name and there is no middle name.
    expect(competingSplit("DOE&F&^&Z&JANE^A", "^", "&")).toEqual(["DOE&F&^&Z&JANE", "A"]);
    const seen = codes(COMPONENT_HARM);
    expect(seen).toContain(COMPONENTS);
    expect(seen.filter((c) => c !== COMPONENTS)).toEqual([
      WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
    ]);
    expect(acceptedUnderMaximalTolerance(COMPONENT_HARM)).toBe(false);
    expect(seen).not.toContain(SHIFT);
    expect(seen).not.toContain(TRUNCATED);
  });
});

describe("what must NOT move, which is the whole of the over-refusal argument", () => {
  it("leaves the RECOGNIZED tail silent and accepted, on all three roles", () => {
    // The one exclusion left. On each role the tail heads a sequence this codec interprets, so the
    // reading taken can vouch for the byte it paid with and the stream can be entirely well formed.
    const perRole = [
      "H|\\^&\rP|1||LAB-0001\rR|1|^^^687|28.6&F&|&E&U/L||||F\rL|1|N\r",
      "H|\\^&\rP|1||MRN-0001\rR|1|^^^687|28.6&R&\\&R&U/L|U/L||||F\rL|1|N\r",
      "H|\\^&\rP|1||MRN-0001\rR|1|&S&^&S&GLU^L^687|28.6|U/L||||F\rL|1|N\r",
    ];
    for (const raw of perRole) {
      expect(codes(raw)).toEqual([]);
      expect(acceptedUnderMaximalTolerance(raw)).toBe(true);
    }
  });

  it("SILENCE ON THAT TAIL IS A TRADE, NOT A CLAIM THAT NOTHING WAS LOST", () => {
    // ── THE RESIDUE THAT REMAINS, PINNED SO NO SURFACE MAY DROP THE HEDGE.
    // The excluded tail is excluded because refusing it would refuse a stream whose escaping is
    // working, not because the gained boundary costs less there. On all three roles the boundary is
    // exactly as real, and here it is not merely under-reported: it is `warnings: []`, so a lenient
    // consumer sees NOTHING at all. Every surface that states the bound must state this beside it.
    //
    // FIELD: nine fields against eight, and a fabricated `final`, on an empty warning list.
    const field = "H|\\^&\rP|1||LAB-0001\rR|1|^^^687|28.6&F&|&F&U/L||||F\rL|1|N\r";
    const fieldLine = "R|1|^^^687|28.6&F&|&F&U/L||||F";
    expect(codes(field)).toEqual([]);
    expect(splitEscapeAware(fieldLine, "|", "&")).toHaveLength(
      competingSplit(fieldLine, "|", "&").length + 1,
    );
    expect(results(parseAstmRecords(field))[0]?.status.meaning).toBe("final");
    expect(results(parseAstmRecords(field))[0]?.status.isActiveFinal).toBe(true);
    expect(acceptedUnderMaximalTolerance(field)).toBe(true);

    // REPEAT: the value truncates and the rest leaves every modeled slot, on an empty warning list.
    const repeat = "H|\\^&\rP|1||MRN-0001\rR|1|^^^687|28.6&S&\\&S&U/L|U/L||||F\rL|1|N\r";
    expect(codes(repeat)).toEqual([]);
    const repeated = parseAstmRecords(repeat);
    expect(results(repeated)[0]?.value).toBe("28.6^");
    expect(repeated.records[2]?.fields[3]?.repeats).toEqual([["28.6^"], ["^U/L"]]);
    expect(acceptedUnderMaximalTolerance(repeat)).toBe(true);

    // COMPONENT: one component more than the competing alignment, so a coding scheme and a local
    // code sit where an alignment guess put them, on an empty warning list.
    const component = "H|\\^&\rP|1||MRN-0001\rR|1|&F&^&F&GLU^L^687|28.6|U/L||||F\rL|1|N\r";
    expect(codes(component)).toEqual([]);
    const id = results(parseAstmRecords(component))[0]?.universalTestId;
    expect(id?.components).toHaveLength(4);
    expect(id?.codingScheme).toBe("L");
    expect(id?.localCode).toBe("687");
    expect(competingSplit("&F&^&F&GLU^L^687", "^", "&")).toHaveLength(3);
    expect(acceptedUnderMaximalTolerance(component)).toBe(true);
  });

  it("still accepts the counterexample that sank the preceding candidate criterion", () => {
    // Under a set naming the FIELD separator `F`, `28.6&F&F&F&U/L` is the sender escaping that
    // separator, writing it, and escaping it again. A criterion counting only the contested pair
    // scores this a tie and refuses it. Weighing the tail does not, and widening the tail axis from
    // one value to two does not either, because this tail is the one still excluded.
    const wellFormed = "HF\\^&\rPF1FFLAB-0001\rCF1FIF28.6&F&F&F&U/LFG\rLF1FN\r";
    expect(codes(wellFormed)).toEqual([WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS]);
    for (const c of TAIL_CODE_NAMES) expect(codes(wellFormed)).not.toContain(c);
    expect(acceptedUnderMaximalTolerance(wellFormed)).toBe(true);
  });

  it("is a report only: no tolerable code was struck off and no code became tolerable", () => {
    for (const c of TAIL_CODES) expect(TOLERABLE_CODES.has(c)).toBe(false);
    expect(TOLERABLE_CODES.has(WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE)).toBe(true);
    expect(TOLERABLE_CODES.has(WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER)).toBe(true);
  });
});

/* ─────────── the axis the shared corpus fixes: the body of the TAIL sequence ─────────── */

/** The four recognized escape mnemonics. */
const MNEMONICS = ["F", "S", "R", "E"] as const;
const isMnemonic = (ch: string): boolean => (MNEMONICS as readonly string[]).includes(ch);

/**
 * The committed declaration alphabet, the same one every other measurement in this family sweeps:
 * the four mnemonic letters, and four characters that are delimiters in no vocabulary.
 */
const DECLARATION_ALPHABET = ["F", "S", "R", "E", "~", ":", "#", "*"] as const;

/** The three roles a split is taken on. The escape role is held fixed: nothing splits on it. */
const SPLITTING_ROLES = ["field", "repeat", "component"] as const;

/** The committed body alphabet: the four mnemonics, the four canonical delimiters, four others. */
const BODY_ALPHABET = ["F", "S", "R", "E", "|", "\\", "^", "&", "~", ":", "#", "*"] as const;

/**
 * **The axis this slice turns on, and the one the shared 864-tuple corpus fixes to a single
 * character.** That corpus varies whether the tail is bare, recognized or unrecognized, but the one
 * unrecognized body it uses is `Z`, so it can say nothing about which bodies the widened criterion
 * fires on. This is the same alphabet, used as the body of the tail sequence.
 */
const TAIL_BODY_ALPHABET = BODY_ALPHABET;

const ROLE_CODE = { field: SHIFT, repeat: TRUNCATED, component: COMPONENTS } as const;

const declaredSet = (ch: string, role: (typeof SPLITTING_ROLES)[number]) => {
  if (role === "field") return { header: `H${ch}\\^&`, field: ch };
  if (role === "repeat") return { header: `H|${ch}^&`, field: "|" };
  return { header: `H|\\${ch}&`, field: "|" };
};

/**
 * The three characters a split is taken on under a given declared set, which is what decides whether
 * an unreadable tail body ALSO costs a boundary of its own. The escape role is not among them:
 * nothing splits on it, so `&&&` loses no boundary.
 */
const splittingRoles = (ch: string, role: (typeof SPLITTING_ROLES)[number]): readonly string[] => {
  if (role === "field") return [ch, "\\", "^"];
  if (role === "repeat") return ["|", ch, "^"];
  return ["|", "\\", ch];
};

/**
 * The committed corpus stream: a comment record, whose text field carries components and repeats
 * without any of them meaning anything clinically, so the only codes a tuple raises are the escape
 * codes and the declaration's own. Same carrier as every measurement this family has taken, so the
 * populations stay directly comparable.
 */
const corpusStream = (
  set: { header: string; field: string },
  contested: string,
  body: string,
  tailBody: string,
): string => {
  const f = set.field;
  return (
    `${set.header}\r` +
    `P${f}1${f}${f}LAB-0001\r` +
    `C${f}1${f}I${f}28.6&${body}&${contested}&${tailBody}&U/L${f}G\r` +
    `L${f}1${f}N\r`
  );
};

interface Tuple {
  readonly declaration: string;
  readonly role: (typeof SPLITTING_ROLES)[number];
  readonly body: string;
  readonly tailBody: string;
  readonly raw: string;
  /** Observed, never predicted. */
  readonly fires: boolean;
  /** Accepted on the tier with the three tail codes held out: the disposition before this widening. */
  readonly acceptedBefore: boolean;
  /** Accepted on the tier as it stands. */
  readonly acceptedNow: boolean;
  /** No code says anything is wrong with this stream's escaping. */
  readonly escapeClean: boolean;
}

/**
 * The codes that say this package found something wrong with a stream's **escaping**. A tuple
 * raising none of them is escape-clean, and refusing one of those is an over-refusal whatever else
 * is true of it. The three tail codes are deliberately NOT in this list, so escape-clean does not
 * consult the criterion it is used to judge.
 */
const ESCAPE_DEVIATION_CODES = [
  WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
  WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER,
  WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE,
] as const;

const corpus: readonly Tuple[] = DECLARATION_ALPHABET.flatMap((declaration) =>
  SPLITTING_ROLES.flatMap((role) =>
    BODY_ALPHABET.flatMap((body) =>
      TAIL_BODY_ALPHABET.map((tailBody): Tuple => {
        const set = declaredSet(declaration, role);
        const raw = corpusStream(set, declaration, body, tailBody);
        const seen = codes(raw);
        return {
          declaration,
          role,
          body,
          tailBody,
          raw,
          fires: seen.includes(ROLE_CODE[role]),
          // Purely additive, so dropping the tail codes from the observed list reconstructs the
          // warning set as it was without them. Nothing here is predicted from a model of the old
          // package: the parse is the shipped one and only the filter differs.
          acceptedBefore: seen
            .filter((c) => !TAIL_CODE_NAMES.includes(c))
            .every((c) => TOLERABLE_CODES.has(c)),
          acceptedNow: seen.every((c) => TOLERABLE_CODES.has(c)),
          escapeClean: !seen.some((c) => (ESCAPE_DEVIATION_CODES as readonly string[]).includes(c)),
        };
      }),
    ),
  ),
);

/**
 * What the criterion says, written out from the alphabets rather than from the implementation: the
 * report fires unless the escape character the reading resumes on heads a sequence whose body is one
 * of the four recognized mnemonics.
 */
const shouldFire = (t: Tuple): boolean => !isMnemonic(t.tailBody);

/**
 * What must move on the tier, again derived rather than counted: the tuple has to have been accepted
 * before, which means neither of the two untolerable codes that already existed fired on it. The
 * ambiguity report fires unless the contested body is a recognized mnemonic; the swallowed-delimiter
 * report fires where an unrecognized body is itself a splitting delimiter in force, and the tail body
 * is exactly such a body wherever this criterion fires.
 */
const shouldMove = (t: Tuple): boolean =>
  shouldFire(t) &&
  isMnemonic(t.body) &&
  !splittingRoles(t.declaration, t.role).includes(t.tailBody);

describe("the tail-body axis, swept because the shared corpus fixes it", () => {
  it("sweeps every declared set, role, contested body and tail body, and every set resolves", () => {
    expect(corpus).toHaveLength(
      DECLARATION_ALPHABET.length *
        SPLITTING_ROLES.length *
        BODY_ALPHABET.length *
        TAIL_BODY_ALPHABET.length,
    );
    for (const t of corpus) {
      const parsed = parseAstmRecords(t.raw);
      expect(parsed.records).toHaveLength(4);
      expect(parsed.records[2]?.type).toBe("C");
      expect(codes(t.raw)).not.toContain(WARNING_CODES.ASTM_RECORD_FIELDS_UNSEPARATED);
    }
  });

  it("contains streams whose escaping is entirely well-formed, or its zeros certify nothing", () => {
    // THE NEGATIVE CONTROL ON THE CORPUS ITSELF. A corpus holding no well-formed stream cannot
    // observe a criterion refusing one, and reports a comforting zero instead. That mistake was made
    // once on this question already, by a corpus that fixed the tail.
    const clean = corpus.filter((t) => t.escapeClean);
    expect(clean.length).toBeGreaterThan(0);
    for (const t of clean) {
      expect(isMnemonic(t.body)).toBe(true);
      expect(isMnemonic(t.tailBody)).toBe(true);
    }
    // Escape-clean needs BOTH bodies recognized, so it is exactly the mnemonic square of the corpus.
    expect(clean).toHaveLength(
      DECLARATION_ALPHABET.length * SPLITTING_ROLES.length * MNEMONICS.length * MNEMONICS.length,
    );
    // And the two dispositions must actually disagree somewhere, or there is nothing to measure.
    expect(corpus.some((t) => t.acceptedBefore !== t.acceptedNow)).toBe(true);
  });

  it("fires on exactly the tail bodies this codec cannot interpret, tuple for tuple", () => {
    // Not a count: the observed disposition of every tuple against a predicate derived from the
    // alphabets. A count can be right for the wrong reason, and this cannot.
    for (const t of corpus) {
      expect({ tailBody: t.tailBody, fires: t.fires }).toEqual({
        tailBody: t.tailBody,
        fires: shouldFire(t),
      });
    }
    // The population, derived from that predicate rather than typed in: every declared set, every
    // role, every contested body, against the tail bodies that are not recognized mnemonics.
    expect(corpus.filter((t) => t.fires)).toHaveLength(
      DECLARATION_ALPHABET.length *
        SPLITTING_ROLES.length *
        BODY_ALPHABET.length *
        (TAIL_BODY_ALPHABET.length - MNEMONICS.length),
    );
  });

  it("refuses NOT ONE escape-clean stream, and cannot", () => {
    // THE FINDING that carries this widening, and it is the same one that carried the three reports
    // it widens. Firing requires the tail either to head no sequence or to head one whose body this
    // codec does not recognize, and the package reports each of those in its own right, so an
    // escape-clean tuple is structurally out of reach.
    //
    // SCOPED: THIS CORPUS HOLDS THE ESCAPE ROLE FIXED, AND THE COMPANION CLAIM BELOW IS FALSE OFF
    // THAT AXIS. Where the declaration names the escape character in a splitting role too, a tail
    // code fires with NEITHER companion; the collision code refuses those streams instead. Swept in
    // `alignment-companion-universal.test.ts`, stated once on the tail test in `escapes.ts`. The
    // assertion here is true of this corpus and is deliberately not written as a universal.
    expect(corpus.filter((t) => t.escapeClean && t.fires)).toHaveLength(0);
    for (const t of corpus.filter((x) => x.fires)) {
      const seen = codes(t.raw);
      expect(
        seen.includes(WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER) ||
          seen.includes(WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE),
      ).toBe(true);
    }
  });

  it("moves tuples one way only, and exactly the ones the derived predicate names", () => {
    const moved = corpus.filter((t) => t.acceptedBefore && !t.acceptedNow);
    const back = corpus.filter((t) => !t.acceptedBefore && t.acceptedNow);
    expect(back).toHaveLength(0);
    for (const t of corpus) {
      expect({ raw: t.raw, moved: t.acceptedBefore && !t.acceptedNow }).toEqual({
        raw: t.raw,
        moved: shouldMove(t),
      });
    }
    expect(moved).toHaveLength(corpus.filter(shouldMove).length);
    // Every moved tuple is a stream this package already called deviant, on tolerable codes only.
    for (const t of moved) {
      expect(
        codes(t.raw)
          .filter((c) => !TAIL_CODE_NAMES.includes(c))
          .every((c) => TOLERABLE_CODES.has(c)),
      ).toBe(true);
      expect(codes(t.raw)).not.toContain(ALIGNMENT);
    }
    // The bound that keeps the number honest: a tail body which is itself a splitting delimiter in
    // force fires but does NOT move, because the swallowed-delimiter report already refused it.
    const firesButHeld = corpus.filter((t) => t.fires && !t.acceptedBefore && isMnemonic(t.body));
    expect(firesButHeld.length).toBeGreaterThan(0);
    for (const t of firesButHeld) {
      expect(splittingRoles(t.declaration, t.role)).toContain(t.tailBody);
      expect(codes(t.raw)).toContain(WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE);
    }
  });

  it("splits the bytes differently on every tuple it fires on, and NOT always by one more", () => {
    // ── THE UNIVERSAL THIS SWEEP REFUTED IN ITS OWN FIRST DRAFT, KEPT AS A MEASUREMENT.
    // The obvious claim is that the reading taken reads exactly ONE more segment than the competing
    // alignment. **That is false**, and the axis this file exists to sweep is what shows it: where
    // the tail sequence's body is the delimiter the split is being taken on, the reading taken keeps
    // that character inside an opaque atom while the competing alignment splits on it, so the two
    // readings produce the SAME number of segments in DIFFERENT places. Under `H~\^&`,
    // `28.6&F&~&~&U/L` reads `28.6&F&` + `&~&U/L` and the competitor reads `28.6&F&~&` + `&U/L`:
    // two against two. The invariant that does hold on every firing tuple is that the two readings
    // DISAGREE, and that both consume every byte, so neither is forced.
    //
    // The worked example above is pinned by its own bytes first, because a quoted reproduction that
    // does not reproduce is worse than no example: this repo has shipped one.
    expect(splitEscapeAware("28.6&F&~&~&U/L", "~", "&")).toEqual(["28.6&F&", "&~&U/L"]);
    expect(competingSplit("28.6&F&~&~&U/L", "~", "&")).toEqual(["28.6&F&~&", "&U/L"]);
    const tieStream = "H~\\^&\rP~1~~LAB-0001\rC~1~I~28.6&F&~&~&U/L~G\rL~1~N\r";
    expect(codes(tieStream)).toContain(SHIFT);

    let oneMore = 0;
    let sameCountDifferentSplit = 0;
    for (const t of corpus.filter((x) => x.fires)) {
      const contested = t.declaration;
      const text = `28.6&${t.body}&${contested}&${t.tailBody}&U/L`;
      const taken = splitEscapeAware(text, contested, "&");
      const rival = competingSplit(text, contested, "&");
      // Both readings consume every byte: neither is forced by them.
      expect(taken.join(contested)).toBe(text);
      expect(rival.join(contested)).toBe(text);
      expect(taken).not.toEqual(rival);
      if (taken.length === rival.length + 1) {
        oneMore += 1;
        expect(t.tailBody).not.toBe(contested);
      } else {
        sameCountDifferentSplit += 1;
        expect(taken).toHaveLength(rival.length);
        expect(t.tailBody).toBe(contested);
      }
    }
    // Both classes are populated, so neither branch above is vacuous, and together they are the
    // whole firing population.
    expect(oneMore).toBeGreaterThan(0);
    expect(sameCountDifferentSplit).toBeGreaterThan(0);
    expect(oneMore + sameCountDifferentSplit).toBe(corpus.filter((t) => t.fires).length);
    // And the second class is exactly the tuples whose tail body is the contested delimiter, which
    // is a derived predicate rather than an observation fitted after the fact.
    expect(sameCountDifferentSplit).toBe(
      corpus.filter((t) => t.fires && t.tailBody === t.declaration).length,
    );
  });

  it("PINS THE ONE CLASS WHERE NOTHING MOVES INDEX, ON ALL THREE ROLES AND THE MODELED SLOTS", () => {
    // ── THE CLAIM CORRECTION THIS WIDENING FORCED, MEASURED HERE RATHER THAN ARGUED.
    // The three codes each carried a role-specific cost claim ("every later field is one place
    // further right", "read as more repeats than the other reading gives it", "every later
    // component sits one place further right"). Widening the tail bound widened the firing
    // population past the point where those hold: on the tie class above, NO index moves. The
    // claims now name that exception on every surface, and this is what pins it. Nothing here
    // narrows the guard: over-reporting relative to the indexes is the deliberate direction.
    //
    // THE TIE CLASS IS ONE END OF THE CORRECTION AND NOT THE WHOLE OF IT. The same claims also
    // understate: this corpus carries ONE contested construct per record, and a record carrying two
    // is displaced by two. Swept in `alignment-offset-rephasing.test.ts`.
    const ties = corpus.filter((t) => t.fires && t.tailBody === t.declaration);
    expect(ties.length).toBeGreaterThan(0);

    // 1. THE CLASS IS BOUNDED, AND THE BOUND IS WHAT KEEPS THE OVER-REPORT FREE. A tail body equal
    //    to the delimiter being split on is a splitting delimiter in force, so the record was
    //    ALREADY refused, and this class costs no stream its disposition.
    for (const t of ties) {
      expect(codes(t.raw)).toContain(WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE);
      expect(t.acceptedBefore).toBe(false);
      expect(t.acceptedNow).toBe(false);
    }

    // 2. THE MODELED SLOTS ARE IDENTICAL UNDER BOTH READINGS, ON EACH ROLE, ON THE CANONICAL SET.
    //    Asserted against the competing alignment rather than against a remembered figure.
    const fieldLine = "R|1|^^^687|28.6&F&|&|&U/L||||F";
    const fieldRaw = `H|\\^&\rP|1||LAB-0001\r${fieldLine}\rL|1|N\r`;
    expect(codes(fieldRaw)).toContain(SHIFT);
    const takenFields = splitEscapeAware(fieldLine, "|", "&");
    const rivalFields = competingSplit(fieldLine, "|", "&");
    expect(takenFields).toHaveLength(rivalFields.length);
    expect(takenFields).not.toEqual(rivalFields);
    // The status slot does NOT move: field 9 holds the sender's `F` under both readings.
    expect(takenFields[8]).toBe("F");
    expect(rivalFields[8]).toBe("F");
    expect(results(parseAstmRecords(fieldRaw))[0]?.status.isActiveFinal).toBe(true);
    // What differs is the CONTENTS of the fields at and after the boundary, not their indexes.
    expect(takenFields[4]).not.toBe(rivalFields[4]);

    const repeatRaw = "H|\\^&\rP|1||LAB-0001\rR|1|^^^687|28.6&F&\\&\\&U/L|U/L||||F\rL|1|N\r";
    expect(codes(repeatRaw)).toContain(TRUNCATED);
    const takenRepeats = splitEscapeAware("28.6&F&\\&\\&U/L", "\\", "&");
    const rivalRepeats = competingSplit("28.6&F&\\&\\&U/L", "\\", "&");
    // The field is NOT read as more repeats than the competing alignment gives it: two against two.
    expect(takenRepeats).toHaveLength(rivalRepeats.length);
    expect(takenRepeats).not.toEqual(rivalRepeats);
    expect(parseAstmRecords(repeatRaw).records[2]?.fields[3]?.repeats).toHaveLength(2);

    const componentRaw = "H|\\^&\rP|1||MRN-0001||DOE&F&^&^&JANE^A||19700101|F\rL|1|N\r";
    expect(codes(componentRaw)).toContain(COMPONENTS);
    const takenComponents = splitEscapeAware("DOE&F&^&^&JANE^A", "^", "&");
    const rivalComponents = competingSplit("DOE&F&^&^&JANE^A", "^", "&");
    // No component index moves: `A` is the middle name under BOTH readings.
    expect(takenComponents).toHaveLength(rivalComponents.length);
    expect(takenComponents).not.toEqual(rivalComponents);
    expect(takenComponents[2]).toBe("A");
    expect(rivalComponents[2]).toBe("A");
    expect(patient(parseAstmRecords(componentRaw))?.name?.middle).toBe("A");

    // 3. NON-VACUITY, from the other side: the shift IS real off this class, so the exception is an
    //    exception and not a restatement of the whole population.
    const shiftedLine = "R|1|^^^687|28.6&F&|&Z&U/L||||F";
    expect(splitEscapeAware(shiftedLine, "|", "&")).toHaveLength(
      competingSplit(shiftedLine, "|", "&").length + 1,
    );
  });

  it("leaves the recognized tail bodies exactly where they were", () => {
    const untouched = corpus.filter((t) => isMnemonic(t.tailBody));
    expect(untouched).toHaveLength(
      DECLARATION_ALPHABET.length *
        SPLITTING_ROLES.length *
        BODY_ALPHABET.length *
        MNEMONICS.length,
    );
    for (const t of untouched) {
      expect(t.fires).toBe(false);
      expect(t.acceptedNow).toBe(t.acceptedBefore);
    }
  });
});

/* ── the payload-shape axis, so the tie class is measured on more than one carrier shape ── */

/**
 * **Text before the contested construct**, and **text after it**. Every corpus in this family so far
 * has fixed both (`28.6` and `U/L`), so a class measured only on them says nothing about whether the
 * carrier shape decides it. These are the committed constants the tie-class figures are derived
 * from: an empty one, a plain one, one carrying a component boundary, and one carrying an escape or
 * a repeat boundary of its own, so the sweep contains multi-construct payloads and not only the
 * single-construct shape the rest of the file uses.
 */
const PAYLOAD_PREFIXES = ["28.6", "", "A^B", "X\\Y"] as const;
const PAYLOAD_SUFFIXES = ["U/L", "", "&Z&Q", "P^Q\\R"] as const;

interface ShapedTuple {
  readonly declaration: string;
  readonly role: (typeof SPLITTING_ROLES)[number];
  readonly tailBody: string;
  readonly text: string;
  readonly raw: string;
  /** Observed, never predicted. */
  readonly fires: boolean;
  readonly ties: boolean;
  readonly swallowed: boolean;
  readonly acceptedBefore: boolean;
}

const shapedCorpus: readonly ShapedTuple[] = DECLARATION_ALPHABET.flatMap((declaration) =>
  SPLITTING_ROLES.flatMap((role) =>
    BODY_ALPHABET.flatMap((body) =>
      TAIL_BODY_ALPHABET.flatMap((tailBody) =>
        PAYLOAD_PREFIXES.flatMap((prefix) =>
          PAYLOAD_SUFFIXES.map((suffix): ShapedTuple => {
            const set = declaredSet(declaration, role);
            const f = set.field;
            const text = `${prefix}&${body}&${declaration}&${tailBody}&${suffix}`;
            const raw =
              `${set.header}\r` +
              `P${f}1${f}${f}LAB-0001\r` +
              `C${f}1${f}I${f}${text}${f}G\r` +
              `L${f}1${f}N\r`;
            const seen = codes(raw);
            const taken = splitEscapeAware(text, declaration, "&");
            const rival = competingSplit(text, declaration, "&");
            return {
              declaration,
              role,
              tailBody,
              text,
              raw,
              fires: seen.includes(ROLE_CODE[role]),
              ties: taken.length === rival.length,
              swallowed: seen.includes(WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE),
              acceptedBefore: seen
                .filter((c) => !TAIL_CODE_NAMES.includes(c))
                .every((c) => TOLERABLE_CODES.has(c)),
            };
          }),
        ),
      ),
    ),
  ),
);

describe("the payload-shape axis, and the ONE CLASS in which nothing moves index", () => {
  it("sweeps every shape, and its size is derived from the committed constants", () => {
    expect(shapedCorpus).toHaveLength(
      DECLARATION_ALPHABET.length *
        SPLITTING_ROLES.length *
        BODY_ALPHABET.length *
        TAIL_BODY_ALPHABET.length *
        PAYLOAD_PREFIXES.length *
        PAYLOAD_SUFFIXES.length,
    );
    // The criterion does not read the carrier shape, which is the point of running this axis.
    for (const t of shapedCorpus) expect(t.fires).toBe(!isMnemonic(t.tailBody));
    expect(shapedCorpus.filter((t) => t.fires)).toHaveLength(
      DECLARATION_ALPHABET.length *
        SPLITTING_ROLES.length *
        BODY_ALPHABET.length *
        (TAIL_BODY_ALPHABET.length - MNEMONICS.length) *
        PAYLOAD_PREFIXES.length *
        PAYLOAD_SUFFIXES.length,
    );
  });

  it("ties on exactly the tuples whose tail body is the delimiter being split on, both ways", () => {
    // Neither direction is fitted after the fact: the predicate is stated and both errors are zero.
    const firing = shapedCorpus.filter((t) => t.fires);
    expect(firing.filter((t) => t.ties && t.tailBody !== t.declaration)).toHaveLength(0);
    expect(firing.filter((t) => !t.ties && t.tailBody === t.declaration)).toHaveLength(0);
    // The population, derived: only a NON-mnemonic declaration can be its own non-mnemonic tail body.
    expect(firing.filter((t) => t.ties)).toHaveLength(
      (DECLARATION_ALPHABET.length - MNEMONICS.length) *
        SPLITTING_ROLES.length *
        BODY_ALPHABET.length *
        PAYLOAD_PREFIXES.length *
        PAYLOAD_SUFFIXES.length,
    );
  });

  it("costs no stream its disposition: every tie was ALREADY refused", () => {
    // THE BOUND that lets the three codes over-report on this class without over-refusing. A tail
    // body equal to the delimiter being split on is a splitting delimiter in force, so the
    // swallowed-delimiter report, which no profile may tolerate, had already refused the record.
    const ties = shapedCorpus.filter((t) => t.fires && t.ties);
    expect(ties.length).toBeGreaterThan(0);
    expect(ties.filter((t) => !t.swallowed)).toHaveLength(0);
    expect(ties.filter((t) => t.acceptedBefore)).toHaveLength(0);
  });
});

describe("the harness's negative controls, RUN rather than declared", () => {
  it("fails when pointed at the wrong role's code", () => {
    // A harness that cannot fail against the wrong input is not measuring anything. The field-role
    // fixture must not raise the repeat-role or component-role code.
    const wrongColumn = corpus.filter(
      (t) => t.role === "field" && codes(t.raw).includes(TRUNCATED),
    );
    expect(wrongColumn).toHaveLength(0);
    // ── AND THE CONTROL THAT WAS VACUOUS IN THIS FILE'S OWN FIRST DRAFT, REPAIRED.
    // It read the shipped predicate against the COMPONENTS column of the FIELD tuples, where that
    // code never fires at all, so the comparison collapsed to an identity and could not fail. A
    // control has to be read against a column the predicate DOES describe but describes WRONGLY.
    // Here that is the role axis: `shouldFire` says nothing about which role a tuple is on, so a
    // predicate that adds a role condition must disagree with the package on a real population.
    const fieldTuples = corpus.filter((t) => t.role === "field");
    const observed = (t: Tuple) => codes(t.raw).includes(ROLE_CODE[t.role]);
    // The shipped predicate agrees with the package on every tuple of every role.
    expect(corpus.filter((t) => observed(t) !== shouldFire(t))).toHaveLength(0);
    // Read against the WRONG role's code it disagrees, on a population that is not empty.
    const misread = fieldTuples.filter((t) => codes(t.raw).includes(COMPONENTS) !== shouldFire(t));
    expect(misread.length).toBeGreaterThan(0);
    expect(misread).toHaveLength(fieldTuples.filter(shouldFire).length);
    // And a predicate carrying a role condition the criterion does not have disagrees too, which
    // is what the identity above could not show.
    const roleScoped = (t: Tuple) => shouldFire(t) && t.role === "field";
    expect(corpus.some((t) => observed(t) !== roleScoped(t))).toBe(true);
  });

  it("fails when the mnemonic set is perturbed in either direction", () => {
    // Two-sided, because a one-sided control passes when the constant is understated. Both
    // perturbations are chosen from inside the swept alphabet, or they could not disagree with
    // anything: a letter the corpus never uses as a tail body is not a perturbation of this
    // measurement at all, which is a mistake this control made in its own first draft.
    const overstated = (ch: string) => [...MNEMONICS, "~"].includes(ch);
    const understated = (ch: string) => (["F", "S", "R"] as readonly string[]).includes(ch);
    expect(TAIL_BODY_ALPHABET).toContain("~");
    expect(TAIL_BODY_ALPHABET).toContain("E");
    // The shipped predicate agrees with the package on every tuple; each perturbed one does not.
    expect(corpus.every((t) => t.fires === !isMnemonic(t.tailBody))).toBe(true);
    expect(corpus.some((t) => t.fires !== !overstated(t.tailBody))).toBe(true);
    expect(corpus.some((t) => t.fires !== !understated(t.tailBody))).toBe(true);
  });
});

describe("the canonical set, swept the same way", () => {
  it("reaches all three roles with no unusual declaration at all", () => {
    // Unlike the population the rejected pair count moved, this one is NOT confined to a set naming
    // a mnemonic letter as a delimiter: all three canonical splitting characters reach it.
    const rolesReached = new Set<string>();
    let checked = 0;
    for (const contested of ["|", "\\", "^"] as const) {
      for (const body of BODY_ALPHABET) {
        for (const tailBody of TAIL_BODY_ALPHABET) {
          const raw =
            `H|\\^&\rP|1||LAB-0001\r` +
            `C|1|I|28.6&${body}&${contested}&${tailBody}&U/L|G\r` +
            `L|1|N\r`;
          const seenNames: readonly string[] = codes(raw);
          const fired = TAIL_CODE_NAMES.filter((c) => seenNames.includes(c));
          // At most one of the three ever fires on one construct: the columns are disjoint.
          expect(fired.length).toBeLessThanOrEqual(1);
          if (fired.length === 1) {
            expect(isMnemonic(tailBody)).toBe(false);
            rolesReached.add(fired[0] ?? "");
          }
          checked += 1;
        }
      }
    }
    expect(checked).toBe(3 * BODY_ALPHABET.length * TAIL_BODY_ALPHABET.length);
    expect([...rolesReached].sort()).toEqual([...TAIL_CODE_NAMES].sort());
  });
});
