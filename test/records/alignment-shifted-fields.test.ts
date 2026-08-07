/**
 * A gained **field** boundary shifts every later field, and a result's status is one of the slots
 * it moves.
 *
 * Escape sequences are matched greedily, leftmost first, so the escape character closing one triple
 * cannot also open the next. Where it could have, the same bytes carry two alignments that disagree
 * by one boundary. The report that already existed for that asks whether this codec's own
 * vocabulary prefers the reading taken **at** the contested position, and it is silent where the
 * earlier triple's body is a recognized mnemonic. **That silence is what this file closes, and the
 * thing it was hiding is worse than a formatting deviation.** Under the canonical set,
 * `R|1|^^^687|28.6&F&|&U/L||||F` reads **9** fields where the competing alignment reads **8**, so
 * the sender's trailing `F` lands in field 9, the **result status**, under the first reading and in
 * no field at all under the second. The parse hands back units and a status of `final`, and both
 * are consequences of an alignment choice rather than values the sender put in those slots. A
 * downstream system reading `final` would act on a result these bytes do not say was finalised.
 *
 * **The question this code asks is a different one, not a widening.** It asks what the reading
 * taken makes of the bytes **after** the boundary. The two alignments resume one character apart,
 * so they disagree past the boundary, and where the escape character the reading taken resumes
 * on heads no sequence it can **interpret** (none at all, or one whose body is not a recognized
 * mnemonic), that reading bought a boundary with bytes it cannot read while the competing alignment
 * is precisely the reading that can. The earlier report's own exclusion is left exactly as it was.
 *
 * **The shift is not universal over the firing population**, and the exception is swept in
 * `alignment-unrecognized-tail.test.ts` and pinned below: where the sequence past the boundary
 * carries the field separator itself, the two readings read the same number of fields in different
 * places and no index moves.
 *
 * **It is a report, not a repair.** The split is unchanged, every decoded byte is identical, and
 * the units and status read are the ones that were always read. Picking the other alignment would
 * be a different guess with no more evidence behind it, on a published package. What is new is that
 * the shift is reported by a code no profile may tolerate, where before it was covered only by the
 * tolerable `ASTM_UNPAIRED_ESCAPE_CHARACTER`.
 *
 * **The tier is strict-accepted-under-a-gate-legal-profile.** "0 silent" has no discriminating
 * power here: anything that can exhibit this raises a tolerable code, so an empty warning list is
 * structurally unreachable. **Every count below derives from a committed alphabet constant inside
 * the assertion that uses it**, never from a hand-typed number.
 *
 * All fixtures are **synthetic**, including the patient name, which is there on purpose: a claim
 * about a record carrying identifiers has to be tested on a payload that carries them. No clause of
 * ASTM E1394 / CLSI LIS01 / LIS02 is claimed anywhere here. The atom rule, the mnemonic set, the
 * leftmost match and this criterion are all this package's own codec, and nothing rests on
 * standards text this repo cannot read.
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
const ALIGNMENT = WARNING_CODES.ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT;
/**
 * The codes that landed after this one, asking the same tail question on the other two splitting
 * roles: the repeat split, then the component split. Both are held out of this file's tier on both
 * sides, so the figures below stay the delta THIS code caused rather than drifting into a mixed
 * base. Each fires on a column disjoint from this one, so holding them out moves no figure here;
 * what it does is keep both fields meaning what they say. Each one's own delta is measured in its
 * own file. **All three splitting roles are wired now, so this list is complete: there is no fourth
 * role, because nothing splits on the escape role.**
 */
const LATER_TAIL_CODES: readonly string[] = [
  WARNING_CODES.ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD,
  WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS,
];

const codes = (raw: string) => parseAstmRecords(raw).warnings.map((w) => w.code);

/**
 * The widest profile the safety gate permits, built **from** the allow-list so it cannot drift out
 * of step with it. Acceptance under this profile is the strongest form of "a gate-legal profile
 * accepts it", which is the tier this whole file is measured on.
 *
 * **This is also the harness's negative control.** It is constructed by spreading this package's own
 * `TOLERABLE_CODES`, so a copy of this file pointed at a sibling parser fails loudly on that spread
 * rather than producing a number against the wrong package.
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
 * The measured fixture, on the canonical set, carrying a patient name and identifiers so the claim
 * is made against a payload that can express the harm. **Synthetic: no real person, no real
 * accession, no real MRN.** The result record's value field ends in an escape sequence whose body
 * is the recognized `F` mnemonic, immediately before a field separator that is itself followed by
 * an escape character heading nothing.
 */
const FABRICATED =
  "H|\\^&\r" +
  "P|1||MRN-0001||SYNTHETIC^GRAZYNA^Q||19700101|F\r" +
  "R|1|^^^687|28.6&F&|&U/L||||F\r" +
  "L|1|N\r";

/** The `R` line of the fixture, so the two alignments can be taken of exactly the same bytes. */
const FABRICATED_RECORD = "R|1|^^^687|28.6&F&|&U/L||||F";

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
      // The competing reading: a bare escape character, a literal body, then the atom that holds
      // the delimiter, so the delimiter never splits.
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

describe("the fabricated status, measured against both alignments of the same bytes", () => {
  it("reads a status the competing alignment puts in no field at all", () => {
    const leftmost = splitEscapeAware(FABRICATED_RECORD, "|", "&");
    const competing = competingSplit(FABRICATED_RECORD, "|", "&");
    // The boundary the reading GAINED: one more field, and every field after it shifted one place.
    // ONE contested construct, so ONE place. Not a universal: see `alignment-offset-rephasing.test.ts`.
    expect(leftmost).toHaveLength(competing.length + 1);
    // Field 9 (the result status) exists under the reading taken and does not exist under the other.
    // That is the whole defect: the letter is the sender's, the SLOT is the alignment's.
    expect(leftmost[8]).toBe("F");
    expect(competing[8]).toBeUndefined();
    // Field 5 (units) is the sender's `&U/L` under the reading taken and empty under the other.
    expect(leftmost[4]).toBe("&U/L");
    expect(competing[4]).toBe("");
    // Neither alignment is forced by the bytes: they differ only in where one escape character's
    // triple begins, and both readings consume every byte.
    expect(leftmost.join("|")).toBe(FABRICATED_RECORD);
    expect(competing.join("|")).toBe(FABRICATED_RECORD);
  });

  it("hands a consumer an active-final result off a payload that also carries a name", () => {
    const parsed = parseAstmRecords(FABRICATED);
    const [only] = results(parsed);
    // NON-VACUITY: the payload can express the harm. A PHI or safety claim tested against bytes
    // that carry no identity proves nothing, so the identity is asserted before the harm is.
    expect(parsed.records[1]?.type).toBe("P");
    const patient = parsed.records[1];
    expect(patient?.fields[5]?.raw).toBe("SYNTHETIC^GRAZYNA^Q");
    expect(patient?.fields[3]?.raw).toBe("MRN-0001");
    // And the result the fabricated status is attached to is a real modeled result, not an empty
    // shell that could carry a status vacuously.
    expect(only?.value).toBe("28.6|");
    expect(only?.units).toBe("&U/L");
    // THE HARM: a plain `F` in a slot the other reading does not have, read as an active final
    // result. `isActiveFinal` is the flag a consumer is told to read instead of the letter.
    expect(only?.status.meaning).toBe("final");
    expect(only?.status.isActiveFinal).toBe(true);
  });

  it("reports it now, and a gate-legal profile no longer accepts it", () => {
    // What it looked like before this code: the ONLY warning was a tolerable one, so the widest
    // gate-legal profile plus `{ strict: true }` accepted the fabrication.
    const seen = codes(FABRICATED);
    expect(seen.filter((c) => c !== SHIFT)).toEqual([WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER]);
    expect(seen.filter((c) => c !== SHIFT).every((c) => TOLERABLE_CODES.has(c))).toBe(true);
    expect(seen).toContain(SHIFT);
    expect(acceptedUnderMaximalTolerance(FABRICATED)).toBe(false);

    // The earlier alignment report stays silent here: its recognized-body exclusion is unchanged by
    // this slice, and this code is not a widening of it.
    expect(seen).not.toContain(ALIGNMENT);

    const w = parseAstmRecords(FABRICATED).warnings.find((x) => x.code === SHIFT);
    // The field the gained boundary ended, not the slot it corrupted: the boundary is the fact.
    expect(w?.position).toEqual({ recordIndex: 2, recordType: "R", fieldIndex: 4 });
    // A delimiter is a byte off the wire, and a name is PHI: the message carries neither.
    expect(w?.message).not.toMatch(/[|^&\\]/u);
    expect(w?.message).not.toMatch(/GRAZYNA|MRN-0001|28\.6/u);
  });

  it("is a report and not a repair: no profile may tolerate it and no byte moved", () => {
    expect(TOLERABLE_CODES.has(SHIFT)).toBe(false);
    expect(() =>
      defineAstmProfile({
        name: "nope",
        tolerate: [{ code: SHIFT, rationale: "no" }],
      }),
    ).toThrow();
    // Every character of the record survives into the parsed fields, in order, unchanged.
    const record = parseAstmRecords(FABRICATED).records[2];
    expect(record?.fields.map((f) => f.raw).join("|")).toBe(FABRICATED_RECORD);
  });

  it("does not reach through a re-emit, so it must be caught on the FIRST read", () => {
    // Emit rewrites the preserved sequences into recognized mnemonics, and those bytes carry the
    // reading that was taken unambiguously. Generation two is silent and is CORRECT about its own
    // bytes. A clean re-read is not evidence that generation one was read right.
    const generation2 = serializeAstmRecords(parseAstmRecords(FABRICATED));
    expect(codes(generation2)).not.toContain(SHIFT);
    expect(acceptedUnderMaximalTolerance(generation2)).toBe(true);
  });
});

describe("the streams it must NOT touch, which is what the tail axis decides", () => {
  it("stays silent where the reading taken reads cleanly past the boundary", () => {
    // Same shape, one byte different: the escape character past the boundary heads a RECOGNIZED
    // sequence, so the reading taken interprets it and the competing alignment is the one that
    // would leave it bare. The bytes prefer the reading taken and nothing is reported.
    const conformant =
      "H|\\^&\rP|1||MRN-0001||SYNTHETIC^GRAZYNA^Q||19700101|F\r" +
      "R|1|^^^687|28.6&F&|&E&U/L||||F\rL|1|N\r";
    expect(codes(conformant)).toEqual([]);
    expect(acceptedUnderMaximalTolerance(conformant)).toBe(true);
  });

  it("stays silent on the counterexample that sank the preceding candidate criterion", () => {
    // Under a set naming the FIELD separator `F`, `28.6&F&F&F&U/L` is the sender escaping that
    // separator, writing it, and escaping it again. The reading taken interprets both sequences and
    // leaves no escape character bare. A criterion counting only the contested pair scores this a
    // tie and refuses it; weighing the tail one construct deep does not.
    const wellFormed = "HF\\^&\rPF1FFLAB-0001\rCF1FIF28.6&F&F&F&U/LFG\rLF1FN\r";
    expect(codes(wellFormed)).toEqual([WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS]);
    expect(codes(wellFormed)).not.toContain(SHIFT);
    expect(acceptedUnderMaximalTolerance(wellFormed)).toBe(true);
  });

  it("stays silent on a gained REPEAT boundary, which moves no FIELD-indexed slot", () => {
    // The sink is wired to the field split only, and this is the half of the reason that holds: a
    // repeat boundary divides one field and reaches nothing outside it, so no FIELD-indexed slot
    // changes hands. Under `H|F^&` both alignments read 8 fields, the units slot is empty under both
    // and the status is `unspecified` under both. What that gained boundary costs is the VALUE,
    // which this code does not report and does not claim to. That is a different defect, and it has
    // since been closed by a different code on the same tail test: asserted here so this file's
    // silence stays a statement about THIS code rather than a stale claim that nothing reports it.
    const repeatRole = "H|F^&\rP|1||LAB-0001\rR|1|^^^687|28.6&S&F&U/L||||F\rL|1|N\r";
    expect(codes(repeatRole)).not.toContain(SHIFT);
    expect(codes(repeatRole)).toContain(WARNING_CODES.ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD);
    const [only] = results(parseAstmRecords(repeatRole));
    expect(only?.value).toBe("28.6^");
    expect(only?.units).toBeUndefined();
    expect(only?.status.meaning).toBe("unspecified");
  });

  it("stays silent on a gained COMPONENT boundary, WHICH DOES MOVE A MODELED SLOT", () => {
    // ── THE BOUND IS A CHOICE, NOT A CONSEQUENCE, AND WRITING IT AS A CONSEQUENCE WAS FALSE.
    // "A repeat or component boundary reaches nothing outside its field" is true and says nothing
    // about modeled slots, because components are modeled INSIDE a field. A Universal Test ID's four
    // components are the LOINC-candidate slot, the test name, the CODING SCHEME and the LOCAL CODE;
    // a patient name's three are last, first and middle. A gained component boundary shifts those
    // exactly as a gained field boundary shifts fields.
    //
    // Both cases below were `PRE-EXISTING` on this slice's base and reported by NOTHING. They have
    // since been closed, by a third code on this same tail test wired to the component split, which
    // is the different criterion this comment used to say they needed and which took its own
    // population measurement. THIS file's code is still silent on them, and that silence is what is
    // asserted here: it is wired to the field split, and a component boundary moves no field.
    // Asserting the closure alongside it keeps that silence a statement about THIS code rather than
    // a stale claim that nothing reports these streams.
    const utid = "H|\\^&\rP|1||MRN-0001\rR|1|&F&^&GLU^L^687|28.6|U/L||||F\rL|1|N\r";
    expect(codes(utid)).toEqual([
      WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS,
      WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER,
    ]);
    expect(acceptedUnderMaximalTolerance(utid)).toBe(false);
    const id = results(parseAstmRecords(utid))[0]?.universalTestId;
    // Under the alignment taken, `687` is the vendor LOCAL CODE and `L` the coding scheme. Under the
    // competing alignment the components are one fewer and `687` is read as the CODING SCHEME.
    expect(id?.codingScheme).toBe("L");
    expect(id?.localCode).toBe("687");
    const rival = competingSplit("&F&^&GLU^L^687", "^", "&");
    expect(rival).toHaveLength((id?.components.length ?? 0) - 1);
    expect(rival[1]).toBe("L");
    expect(rival[2]).toBe("687");

    const name = "H|\\^&\rP|1||MRN-0001||DOE&F&^&JANE^A||19700101|F\rL|1|N\r";
    expect(codes(name)).toEqual([
      WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS,
      WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER,
    ]);
    expect(acceptedUnderMaximalTolerance(name)).toBe(false);
    // The reading is unchanged: this closure is a report, not a repair, so the parts read here are
    // byte-for-byte the parts that were read when nothing reported them.
    expect(patient(parseAstmRecords(name))?.name).toMatchObject({ first: "&JANE", middle: "A" });
    // The competing alignment reads one component fewer, so `A` is the given name and there is no
    // middle name at all. A given name decided by an alignment guess, reported by nothing.
    expect(competingSplit("DOE&F&^&JANE^A", "^", "&")).toEqual(["DOE&F&^&JANE", "A"]);

    // Neither raises the shift report, by construction: it is wired to the field split.
    expect(codes(utid)).not.toContain(SHIFT);
    expect(codes(name)).not.toContain(SHIFT);
  });

  it("REPORTS the tail that heads an UNRECOGNIZED sequence, which was this file's residue", () => {
    // ── THE RESIDUE THIS FILE ONCE NAMED, NOW CLOSED, AND THE CORRECTION IS TO THE REASON.
    // The recorded reason for the silence was that the competing alignment would leave TWO escape
    // characters bare here, so the bytes prefer the reading taken more strongly than in the case
    // that already fired. That comparison is true and it is not the question these codes ask. They
    // report a COST: a modeled slot decided by a boundary the bytes do not force. The cost is
    // identical under both tails, asserted below against the bare-tail fixture's own figures, and
    // "consuming a triple" is not "interpreting" one: an unrecognized body is preserved verbatim
    // and never guessed at, which this package already reports as a deviation in its own right.
    // What the guard now tests is whether the reading taken can INTERPRET what it resumed on.
    const residue = "H|\\^&\rP|1||LAB-0001\rR|1|^^^687|28.6&F&|&Z&U/L||||F\rL|1|N\r";
    const seen = codes(residue);
    expect(seen).toContain(SHIFT);
    // The harm is the same harm, measured rather than asserted: 9 fields against the competing
    // alignment's 8, and a status in a slot the other reading does not have. Identical to the
    // bare-tail fixture at the top of this file.
    //
    // THE `+ 1` HERE IS THIS FIXTURE'S FIGURE, NOT A UNIVERSAL, and writing it as one was a defect
    // on three consumer surfaces. This record carries exactly ONE contested construct, as every
    // corpus in this family does; a record carrying two is displaced by two. The displacement is
    // swept in `alignment-offset-rephasing.test.ts` and stated once on `ShiftedFieldsSink`.
    const line = "R|1|^^^687|28.6&F&|&Z&U/L||||F";
    expect(splitEscapeAware(line, "|", "&")).toHaveLength(
      competingSplit(line, "|", "&").length + 1,
    );
    expect(results(parseAstmRecords(residue))[0]?.status.isActiveFinal).toBe(true);
    // It was accepted before by every gate-legal profile, on one tolerable code, and is not now.
    expect(seen.filter((c) => c !== SHIFT).every((c) => TOLERABLE_CODES.has(c))).toBe(true);
    expect(seen.filter((c) => c !== SHIFT)).toEqual([WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE]);
    expect(acceptedUnderMaximalTolerance(residue)).toBe(false);
    // And it is still a report, not a repair: every byte survives into the fields, in order.
    expect(
      parseAstmRecords(residue)
        .records[2]?.fields.map((f) => f.raw)
        .join("|"),
    ).toBe(line);
  });
});

/* ─────────────────────── the population this code moves, measured ─────────────────────── */

/** The four recognized escape mnemonics. */
const MNEMONICS = ["F", "S", "R", "E"] as const;
const isMnemonic = (ch: string): boolean => (MNEMONICS as readonly string[]).includes(ch);

/**
 * The committed declaration alphabet: the four mnemonic letters, which are what makes a set
 * non-canonical in the way that matters here, and four characters that are delimiters in no
 * vocabulary. None collides with the roles held fixed below, so every set resolves.
 */
const DECLARATION_ALPHABET = ["F", "S", "R", "E", "~", ":", "#", "*"] as const;

/** The three roles a split is taken on. The escape role is held fixed: nothing splits on it. */
const SPLITTING_ROLES = ["field", "repeat", "component"] as const;

/** The committed body alphabet: the four mnemonics, the four canonical delimiters, four others. */
const BODY_ALPHABET = ["F", "S", "R", "E", "|", "\\", "^", "&", "~", ":", "#", "*"] as const;

/**
 * **The axis this criterion turns on**, and the one a corpus for this question must have. The two
 * alignments resume one character apart, so what follows the boundary is not a free variable: it is
 * where they differ most. Three tails, each a different job for the escape character just past the
 * boundary: heading nothing, heading a sequence this codec recognizes, and heading one it does not.
 */
const TAIL_SUFFIXES = [
  { name: "a bare escape character", suffix: "U/L" },
  { name: "a recognized sequence", suffix: "F&U/L" },
  { name: "an unrecognized sequence", suffix: "Z&U/L" },
] as const;

/**
 * The codes that say this package found something wrong with a stream's **escaping**. A tuple
 * raising none of them is **escape-clean**: the escape mechanism working exactly as intended, so
 * refusing one is an over-refusal whatever else is true of it. The two alignment codes are
 * deliberately NOT in this list, so escape-clean does not consult the criterion it is used to judge.
 */
const ESCAPE_DEVIATION_CODES = [
  WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
  WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER,
  WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE,
] as const;

const declaredSet = (ch: string, role: (typeof SPLITTING_ROLES)[number]) => {
  if (role === "field") return { header: `H${ch}\\^&`, field: ch };
  if (role === "repeat") return { header: `H|${ch}^&`, field: "|" };
  return { header: `H|\\${ch}&`, field: "|" };
};

/**
 * The committed corpus stream: a comment record, whose text field carries components and repeats
 * without any of them meaning anything clinically, so the only codes a tuple raises are the escape
 * codes and the declaration's own. Same carrier as the criterion measurement this file follows on
 * from, so the two populations are directly comparable.
 */
const corpusStream = (
  set: { header: string; field: string },
  contested: string,
  body: string,
  suffix: string,
): string => {
  const f = set.field;
  return (
    `${set.header}\r` +
    `P${f}1${f}${f}LAB-0001\r` +
    `C${f}1${f}I${f}28.6&${body}&${contested}&${suffix}${f}G\r` +
    `L${f}1${f}N\r`
  );
};

interface Tuple {
  readonly role: (typeof SPLITTING_ROLES)[number];
  readonly body: string;
  readonly tail: (typeof TAIL_SUFFIXES)[number]["name"];
  readonly raw: string;
  /** Observed, never predicted. */
  readonly reportsShift: boolean;
  /** Accepted on the tier with this code held out: the disposition before it shipped. */
  readonly acceptedBefore: boolean;
  /** Accepted on the tier with this code in force: the disposition after it shipped. */
  readonly acceptedNow: boolean;
  /** No code says anything is wrong with this stream's escaping. */
  readonly escapeClean: boolean;
}

const corpus: readonly Tuple[] = DECLARATION_ALPHABET.flatMap((declaration) =>
  SPLITTING_ROLES.flatMap((role) =>
    BODY_ALPHABET.flatMap((body) =>
      TAIL_SUFFIXES.map((tail): Tuple => {
        const set = declaredSet(declaration, role);
        const raw = corpusStream(set, declaration, body, tail.suffix);
        const seen = codes(raw);
        return {
          role,
          body,
          tail: tail.name,
          raw,
          reportsShift: seen.includes(SHIFT),
          // Purely additive, so dropping a code from the observed list reconstructs the warning set
          // as it was without it. Nothing here is predicted from a model of the old package.
          //
          // A LATER code on the same tail test, wired to the repeat split, is held out of BOTH
          // sides, so this pair stays the delta THIS code caused rather than drifting into a mixed
          // base. It fires on a disjoint column, so holding it out of both moves no figure below;
          // what it does is keep both fields meaning what they say. The observed strict parse is
          // still what every fixture assertion above is taken on.
          acceptedBefore: seen
            .filter((c) => c !== SHIFT && !LATER_TAIL_CODES.includes(c))
            .every((c) => TOLERABLE_CODES.has(c)),
          acceptedNow: seen
            .filter((c) => !LATER_TAIL_CODES.includes(c))
            .every((c) => TOLERABLE_CODES.has(c)),
          escapeClean: !seen.some((c) => (ESCAPE_DEVIATION_CODES as readonly string[]).includes(c)),
        };
      }),
    ),
  ),
);

const mnemonicBodies = BODY_ALPHABET.filter(isMnemonic).length;
const sets = DECLARATION_ALPHABET.length * SPLITTING_ROLES.length;
/** The one tail whose bytes carry no escape deviation of their own. */
const cleanTails = 1;
/**
 * The body the tail's escape character heads, or `undefined` where it heads no sequence at all.
 * Read off the corpus constant rather than restated.
 */
const tailBodyOf = (suffix: string): string | undefined =>
  suffix.charAt(1) === "&" ? suffix.charAt(0) : undefined;

/**
 * **The tails the report fires on, and it is TWO of the three.** The test is whether the reading
 * taken can INTERPRET the construct it resumed on, not whether it can consume one: a body this
 * codec does not recognize is preserved verbatim and never guessed at, so a reading that resumes on
 * one bought its boundary with bytes it cannot read exactly as a reading that resumes on a bare
 * escape character does. The recognized tail is the only exclusion, and what that exclusion is
 * worth is measured in `test/records/alignment-companion-universal.test.ts` rather than restated
 * here. **This corpus holds the escape role at `&`**, so it cannot reach a declaration that names
 * the escape character in a splitting role too, and on those a stream IS escape-clean under one of
 * the other two tails.
 *
 * **DERIVED from `TAIL_SUFFIXES` and the mnemonic set, not typed out**, so a tail added to that
 * constant is classified by the rule the package applies rather than by a name someone wrote beside
 * it, and the population figures below move with it.
 */
const REPORTED_TAILS: readonly string[] = TAIL_SUFFIXES.filter(
  (t) => !isMnemonic(tailBodyOf(t.suffix) ?? ""),
).map((t) => t.name);
/** The one role this code is wired to, and the two tails it fires on. */
const shiftRoles = 1;
const shiftTails = REPORTED_TAILS.length;

describe("the corpus, and the property that makes its zeros mean something", () => {
  it("sweeps every declared set, every body and every tail, and every set resolves", () => {
    expect(corpus).toHaveLength(sets * BODY_ALPHABET.length * TAIL_SUFFIXES.length);
    for (const t of corpus) {
      const parsed = parseAstmRecords(t.raw);
      expect(parsed.records).toHaveLength(4);
      expect(parsed.records[2]?.type).toBe("C");
      expect(codes(t.raw)).not.toContain(WARNING_CODES.ASTM_RECORD_FIELDS_UNSEPARATED);
    }
  });

  it("contains streams whose escaping is entirely well-formed, or its zero certifies nothing", () => {
    // THE NEGATIVE CONTROL. A corpus that fixes the tail to a bare escape character contains no
    // well-formed stream at all, so it cannot observe a criterion refusing one and reports a
    // comforting zero. That mistake was made once on this question already. Escape-clean here means
    // a recognized body against the recognized tail, whatever the declared set.
    const clean = corpus.filter((t) => t.escapeClean);
    expect(clean).toHaveLength(sets * mnemonicBodies * cleanTails);
    for (const t of clean) {
      expect(isMnemonic(t.body)).toBe(true);
      expect(t.tail).toBe("a recognized sequence");
    }
    // And the two dispositions must actually disagree somewhere, or there is nothing to measure.
    expect(corpus.some((t) => t.acceptedBefore !== t.acceptedNow)).toBe(true);
  });
});

describe("what the shift report moves, on the strict-accepted tier", () => {
  it("fires on exactly one role against two tails, and on no escape-clean stream at all", () => {
    const fires = corpus.filter((t) => t.reportsShift);
    expect(fires).toHaveLength(
      DECLARATION_ALPHABET.length * shiftRoles * BODY_ALPHABET.length * shiftTails,
    );
    for (const t of fires) {
      expect(t.role).toBe("field");
      expect(REPORTED_TAILS).toContain(t.tail);
    }
    // THE FINDING that separates this criterion from the one measured and rejected before it. That
    // one refused 48 of the 96 escape-clean tuples in this same corpus. This one refuses none, and
    // it cannot: firing requires the escape character past the boundary either to head no sequence
    // or to head one whose body this codec does not recognize, and this package already reports
    // each of those as a deviation in its own right. That is why widening the tail axis from one
    // tail to two costs nothing on this axis, which is the axis the rejected criterion failed on.
    expect(fires.filter((t) => t.escapeClean)).toHaveLength(0);
    for (const t of fires) {
      const seen = codes(t.raw);
      expect(
        seen.includes(WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER) ||
          seen.includes(WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE),
      ).toBe(true);
    }
  });

  it("moves the recognized-body tuples of that column, and moves none back", () => {
    const moved = corpus.filter((t) => t.acceptedBefore && !t.acceptedNow);
    const back = corpus.filter((t) => !t.acceptedBefore && t.acceptedNow);
    // The unrecognized bodies of that column were already refused: the earlier alignment report
    // fires on them and no profile may tolerate it either. What moves is exactly the population
    // that report's recognized-body exclusion left silent.
    expect(moved).toHaveLength(
      DECLARATION_ALPHABET.length * shiftRoles * mnemonicBodies * shiftTails,
    );
    expect(back).toHaveLength(0);
    for (const t of moved) {
      expect(isMnemonic(t.body)).toBe(true);
      expect(t.role).toBe("field");
      expect(REPORTED_TAILS).toContain(t.tail);
      expect(codes(t.raw)).not.toContain(ALIGNMENT);
    }
    // The two reported tails contribute equally, so neither half of the column is carrying the
    // other: the tail axis is a real split of the population and not a relabelling of one case.
    for (const tail of REPORTED_TAILS) {
      expect(moved.filter((t) => t.tail === tail)).toHaveLength(
        DECLARATION_ALPHABET.length * shiftRoles * mnemonicBodies,
      );
    }
    // Every moved tuple is a stream this package already called deviant, on a tolerable code.
    for (const t of moved) {
      expect(
        codes(t.raw)
          .filter((c) => c !== SHIFT)
          .every((c) => TOLERABLE_CODES.has(c)),
      ).toBe(true);
    }
  });

  it("leaves the RECOGNIZED tail of that column exactly where it was", () => {
    // The one exclusion left, and the one that carries the whole over-refusal argument: where the
    // reading taken interprets the construct it resumed on, the stream can be entirely well formed
    // and refusing it is the failure that sank the preceding candidate criterion.
    const untouched = corpus.filter((t) => t.role === "field" && !REPORTED_TAILS.includes(t.tail));
    expect(untouched).toHaveLength(
      DECLARATION_ALPHABET.length *
        shiftRoles *
        BODY_ALPHABET.length *
        (TAIL_SUFFIXES.length - shiftTails),
    );
    for (const t of untouched) {
      expect(t.tail).toBe("a recognized sequence");
      expect(t.reportsShift).toBe(false);
      expect(t.acceptedNow).toBe(t.acceptedBefore);
    }
  });
});

describe("the canonical set, swept the same way", () => {
  it("reports the field role and nothing else, and never the well-formed tail", () => {
    let firedOnField = 0;
    let checked = 0;
    for (const contested of ["|", "\\", "^"] as const) {
      for (const body of BODY_ALPHABET) {
        for (const tail of TAIL_SUFFIXES) {
          const raw = `H|\\^&\rP|1||LAB-0001\rC|1|I|28.6&${body}&${contested}&${tail.suffix}|G\rL|1|N\r`;
          const fired = codes(raw).includes(SHIFT);
          if (fired) {
            firedOnField += 1;
            expect(contested).toBe("|");
            expect(REPORTED_TAILS).toContain(tail.name);
          }
          checked += 1;
        }
      }
    }
    expect(checked).toBe(3 * BODY_ALPHABET.length * TAIL_SUFFIXES.length);
    expect(firedOnField).toBe(BODY_ALPHABET.length * shiftRoles * shiftTails);
  });
});
