/**
 * A gained **component** boundary moves a modeled slot one place along, and a test identity's
 * coding scheme and a patient's given name are two of the slots it moves.
 *
 * Escape sequences are matched greedily, leftmost first, so the escape character closing one triple
 * cannot also open the next. Where it could have, the same bytes carry two alignments that disagree
 * by one boundary. Two reports already existed for what the reading taken makes of the bytes
 * **after** that boundary: one wired to the field split, where every later field shifts, and one
 * wired to the repeat split, where the field's modeled reading stops at the boundary. **The third
 * splitting role was wired to neither, and the reason it was left open is the sentence that turned
 * out to be false.** "A gained repeat or component boundary divides one field and reaches nothing
 * outside it, so it cannot move a modeled slot" is true in its first clause and false in its
 * inference: **components are modeled INSIDE a field.**
 *
 * **What that costs, on payloads that carry it.** A Universal Test ID's four components are the
 * LOINC-candidate slot, the test name, the **coding scheme** and the **local code**. Under the
 * canonical set `R|1|&F&^&GLU^L^687|28.6|U/L||||F` reads four of them, so `L` is the coding scheme
 * and `687` the vendor's local code; the competing alignment reads three, and `687` is the **coding
 * scheme**. A vendor's local code and a code-system selector are not the same thing, and a consumer
 * routing on one of them routes on the alignment. A patient name's three components are last, first
 * and middle: `P|1||MRN-0001||DOE&F&^&JANE^A||19700101|F` reads a given name of `&JANE` and a
 * middle name of `A`, and under the competing alignment `A` is the **given** name with no middle
 * name at all. Before this code the only warning on either stream was the **tolerable**
 * `ASTM_UNPAIRED_ESCAPE_CHARACTER`, so the widest gate-legal profile plus `{ strict: true }`
 * accepted both.
 *
 * **The question is the one the other two ask, on the third role, so it is a third code and not a
 * widening of either.** The predicate is identical and lives in one place: a contested alignment
 * whose reading resumes on an escape character heading no sequence it can **interpret** (none at
 * all, or one whose body is not a recognized mnemonic). What differs is what the
 * gained boundary costs, and it is a third thing again. On the field role every later field shifts,
 * so a slot changes hands. On the repeat role nothing shifts and the field's modeled reading stops
 * at the boundary, so components leave the record. Here nothing leaves the record and no field
 * number changes: the components **move one slot along**. The other two codes could not carry that
 * claim, which is why neither was widened to it.
 *
 * **One structural difference from the repeat role is worth stating, because it is not symmetric.**
 * There, only the **first** gained boundary in a field reaches a modeled slot, because a field is
 * modeled out of its first repeat alone. Here the shift propagates from the gained boundary to the
 * end of the component list, so **every** boundary **at or before the last modeled component index**
 * moves a named slot, not only the first.
 *
 * **It does NOT follow that every gained boundary moves one, and writing that down was this slice's
 * own first refutation.** A model reads a **fixed** number of components: a patient name three
 * (last, first, middle), a Universal Test ID four. A contested boundary further right than that
 * still shifts the list and leaves every named slot byte-identical under both alignments. "The
 * components all shift" is a claim about the LIST; a claim about a MODELED SLOT needs the model's
 * own arity. That is the same inference error this whole defect exists to retire, arriving from the
 * other side, so it is recorded here rather than quietly corrected.
 *
 * **So TWO bounds run the other way, and this fires inside both**, which is over-reporting and never
 * under-reporting: past the last modeled component index, and inside a **later** repeat, where
 * `components` is `repeats[0]` and nothing modeled moves at all. **Both axes are swept on their own
 * below**, because the corpus this family is measured on holds them fixed by design and a criterion
 * measured only there inherits the blind spot.
 *
 * **It is a report, not a repair.** The split is unchanged, every decoded byte is identical, and the
 * components read are the components that were always read. Picking the other alignment would be a
 * different guess with no more evidence behind it, on a published package. Withholding the moved
 * slots is a separate question and is deliberately not answered here.
 *
 * **The tier is strict-accepted-under-a-gate-legal-profile.** "0 silent" has no discriminating
 * power here: anything that can exhibit this raises a tolerable code, so an empty warning list is
 * structurally unreachable. **Every count below derives from a committed alphabet constant inside
 * the assertion that uses it**, never from a hand-typed number.
 *
 * All fixtures are **synthetic**, including the patient name and the identifiers, which are there
 * on purpose: a claim about a record carrying a test identity and a name has to be tested on a
 * payload that carries them. No clause of ASTM E1394 / CLSI LIS01 / LIS02 is claimed anywhere here.
 * The atom rule, the mnemonic set, the leftmost match and this criterion are all this package's own
 * codec, and nothing rests on standards text this repo cannot read.
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

const COMPONENTS = WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS;
const ALIGNMENT = WARNING_CODES.ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT;
/**
 * The two codes that landed **before** this one, asking this same tail question on the other two
 * splitting roles. They are held out of this file's tier on both sides, so the figures below stay
 * the delta THIS code causes rather than a mixed base. Each fires on a column disjoint from this
 * one, which is asserted rather than assumed, so holding them out moves no figure here; what it
 * does is keep both fields meaning what they say.
 *
 * **This list is complete and cannot grow.** The three splitting roles are field, repeat and
 * component, and all three are wired now. There is no fourth, because nothing splits on the escape
 * role.
 */
const EARLIER_TAIL_CODES: readonly string[] = [
  WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS,
  WARNING_CODES.ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD,
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
 * The measured test-identity fixture, on the canonical set. **Synthetic: no real accession, no real
 * MRN, no real vendor code.** The Universal Test ID field opens with an escape sequence whose body
 * is the recognized `F` mnemonic, immediately before a component separator that is itself followed
 * by an escape character heading nothing. The recognized body is what keeps the pre-existing
 * ambiguity report silent here, which is the silence this code closes.
 */
const MOVED_IDENTITY = "H|\\^&\rP|1||MRN-0001\rR|1|&F&^&GLU^L^687|28.6|U/L||||F\rL|1|N\r";

/** The Universal Test ID field of that fixture, so both alignments are taken of the same bytes. */
const MOVED_IDENTITY_FIELD = "&F&^&GLU^L^687";

/**
 * The measured patient-name fixture, on the canonical set. **Synthetic: no real person, no real
 * MRN.** Same construct in a name field, so the claim about identifiers is made against a payload
 * that carries one.
 */
const MOVED_NAME = "H|\\^&\rP|1||MRN-0001||DOE&F&^&JANE^A||19700101|F\rL|1|N\r";

/** The name field of that fixture. */
const MOVED_NAME_FIELD = "DOE&F&^&JANE^A";

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

describe("the moved slots, measured against both alignments of the same bytes", () => {
  it("reads a coding scheme and a local code the competing alignment aligns one slot apart", () => {
    const leftmost = splitEscapeAware(MOVED_IDENTITY_FIELD, "^", "&");
    const competing = competingSplit(MOVED_IDENTITY_FIELD, "^", "&");
    // The boundary the reading GAINED: one more component, and every component after it one place
    // further right. Nothing left the record and no field number moved.
    expect(leftmost).toHaveLength(competing.length + 1);

    const id = results(parseAstmRecords(MOVED_IDENTITY))[0]?.universalTestId;
    // Under the reading taken, `L` is the coding scheme and `687` the vendor's local code.
    expect(id?.codingScheme).toBe("L");
    expect(id?.localCode).toBe("687");
    // Under the competing alignment the same bytes put `687` in the CODING SCHEME slot, and there
    // is no local code at all. A code-system selector and a vendor's local code are not the same
    // thing: this is the harm, and it is decided by an alignment rather than by the sender.
    expect(competing[1]).toBe("L");
    expect(competing[2]).toBe("687");
    expect(competing).toHaveLength(3);
  });

  it("reads a given name and a middle name the competing alignment reads as one name", () => {
    const name = patient(parseAstmRecords(MOVED_NAME))?.name;
    expect(name).toMatchObject({ first: "&JANE", middle: "A" });
    // Under the competing alignment `A` is the GIVEN name and there is no middle name at all.
    expect(competingSplit(MOVED_NAME_FIELD, "^", "&")).toEqual(["DOE&F&^&JANE", "A"]);
  });

  it("reports both, on a code no profile may tolerate", () => {
    for (const raw of [MOVED_IDENTITY, MOVED_NAME]) {
      expect(codes(raw)).toContain(COMPONENTS);
      // The only other code either raises is the tolerable one that used to be the whole report.
      expect(codes(raw)).toEqual([COMPONENTS, WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER]);
      expect(TOLERABLE_CODES.has(WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER)).toBe(true);
      expect(TOLERABLE_CODES.has(COMPONENTS)).toBe(false);
      // The tier that moved: the widest gate-legal profile accepted these and no longer does.
      expect(acceptedUnderMaximalTolerance(raw)).toBe(false);
    }
  });

  it("leaves the pre-existing ambiguity report exactly as it was", () => {
    // That code asks whether this codec's vocabulary prefers the reading taken AT the contested
    // position, and its recognized-body exclusion silences it on both fixtures. It is untouched:
    // this code is a second question, not a widening of that one, which is the whole reason the two
    // exist separately.
    for (const raw of [MOVED_IDENTITY, MOVED_NAME]) expect(codes(raw)).not.toContain(ALIGNMENT);
  });

  it("is a report and not a repair: every decoded byte is the one that was always read", () => {
    // The split is unchanged. The components read here are byte-for-byte the ones the package read
    // when nothing reported them at all.
    const id = results(parseAstmRecords(MOVED_IDENTITY))[0]?.universalTestId;
    expect(id?.components).toEqual(["|", "&GLU", "L", "687"]);
    const record = parseAstmRecords(MOVED_IDENTITY).records[2];
    expect(record?.fields[2]?.raw).toBe(MOVED_IDENTITY_FIELD);
  });

  it("does not reach through a re-emit, so it must be caught on the FIRST read", () => {
    // Emit rewrites the preserved sequence into recognized mnemonics, and those bytes carry the
    // reading that was taken unambiguously. Generation 2 is silent and is CORRECT about its own
    // bytes: the components it reads are the ones generation 1 read. A clean re-read is never
    // evidence that the first read was unambiguous.
    const secondGeneration = serializeAstmRecords(parseAstmRecords(MOVED_IDENTITY));
    expect(codes(secondGeneration)).not.toContain(COMPONENTS);
    expect(results(parseAstmRecords(secondGeneration))[0]?.universalTestId?.components).toEqual([
      "|",
      "&GLU",
      "L",
      "687",
    ]);
  });
});

describe("the streams it must NOT touch, which is what the tail axis decides", () => {
  it("stays silent where the tail heads a RECOGNIZED sequence, which is well formed", () => {
    // The over-refusal that sank the rejected pair-count criterion for this family. Here the sender
    // escaped a field separator, wrote a component separator, and escaped a field separator again:
    // entirely well formed, zero warnings of any kind. A criterion that refused this would refuse
    // conformant streams, which is why the tail is weighed rather than the contested pair counted.
    const wellFormed = "H|\\^&\rP|1||MRN-0001\rR|1|&F&^&F&GLU^L^687|28.6|U/L||||F\rL|1|N\r";
    expect(codes(wellFormed)).toEqual([]);
    expect(acceptedUnderMaximalTolerance(wellFormed)).toBe(true);
  });

  it("REPORTS the tail that heads an UNRECOGNIZED sequence, which was this file's residue", () => {
    // ── THE RESIDUE THIS FILE ONCE NAMED, NOW CLOSED, AND THE CORRECTION IS TO THE REASON.
    // The recorded reason for the silence was that the competing alignment would leave TWO escape
    // characters bare here, so the bytes prefer the reading taken more strongly than in the case
    // that already fired. That comparison is true and it is not the question this code asks. It
    // reports a COST, and the cost is the same one: four components against the competing
    // alignment's three, so a coding scheme and a local code are read out of positions the other
    // reading does not put them in. Consuming a triple is not interpreting it: an unrecognized body
    // is preserved verbatim and never guessed at, which this package reports in its own right.
    const residue = "H|\\^&\rP|1||MRN-0001\rR|1|&F&^&Z&GLU^L^687|28.6|U/L||||F\rL|1|N\r";
    const seen = codes(residue);
    expect(seen).toContain(COMPONENTS);
    // The harm is the same harm, and the NAMED slots are the ones that move.
    const id = results(parseAstmRecords(residue))[0]?.universalTestId;
    expect(id?.components).toHaveLength(4);
    expect(id?.codingScheme).toBe("L");
    expect(id?.localCode).toBe("687");
    const rival = competingSplit("&F&^&Z&GLU^L^687", "^", "&");
    expect(rival).toHaveLength(3);
    expect(rival[1]).toBe("L");
    expect(rival[2]).toBe("687");
    // It was accepted before by every gate-legal profile, on one tolerable code, and is not now.
    expect(seen.filter((c) => c !== COMPONENTS)).toEqual([
      WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
    ]);
    expect(acceptedUnderMaximalTolerance(residue)).toBe(false);
  });

  it("stays silent on a gained FIELD boundary, which the first tail report covers", () => {
    // A contested FIELD boundary is a different column, and this code is wired to the component
    // split, so it cannot see it. Asserted rather than assumed: the three columns are disjoint.
    const fieldRole = "H|\\^&\rP|1||MRN-0001\rR|1|^^^687|28.6&F&|&U/L||||F\rL|1|N\r";
    const seen = codes(fieldRole);
    expect(seen).toContain(WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS);
    expect(seen).not.toContain(COMPONENTS);
  });

  it("stays silent on a gained REPEAT boundary, which the second tail report covers", () => {
    // Likewise for the repeat column. There the cost is a field read short, not a slot moved along,
    // which is why that is a separate code with a separate claim.
    const repeatRole = "H|F^&\rP|1||LAB-0001\rR|1|^^^687|28.6&S&F&U/L||||F\rL|1|N\r";
    const seen = codes(repeatRole);
    expect(seen).toContain(WARNING_CODES.ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD);
    expect(seen).not.toContain(COMPONENTS);
  });

  it("leaves a spec-clean canonical stream completely alone", () => {
    const clean = "H|\\^&\rP|1||MRN-0001\rR|1|^^^687|28.6|U/L||N||F\rL|1|N\r";
    expect(codes(clean)).toEqual([]);
    expect(acceptedUnderMaximalTolerance(clean)).toBe(true);
  });
});

/* ───────────── the axis the shared corpus holds fixed, swept on its own ───────────── */

/**
 * **The blind spot, named and swept rather than inherited.** The 864-tuple corpus this family is
 * measured on puts the contested boundary at the FIRST boundary of the FIRST repeat, every time, so
 * it cannot see either index axis. For this code both matter, and they matter in opposite
 * directions, which is exactly why the sweep is here and not folded into that corpus:
 *
 * - **The component index bounds the harm only at the MODEL'S ARITY, not at the first boundary.**
 *   The shift propagates from the gained boundary to the end of the component list, so every
 *   boundary at or before the last modeled component index moves a named slot. This is the
 *   structural difference from the repeat role, where only the first boundary reaches one.
 *   **Past that index nothing NAMED moves and it fires anyway**, because a model reads a fixed
 *   number of components: a patient name three, a Universal Test ID four. That bound is measured
 *   below rather than assumed, and getting it wrong is exactly the inference error this whole
 *   defect exists to retire: "the components all shift" is a claim about the LIST, and a claim
 *   about a MODELED SLOT needs the model's own arity.
 * - **The repeat index bounds it outright.** `components` is `repeats[0]`, so a contested boundary
 *   inside a later repeat moves nothing modeled, and this fires there anyway.
 *
 * Both of those are **over-reporting, never under-reporting**, which is the direction this package
 * errs in.
 *
 * The prefixes are the axis, on the canonical set: a repeat prefix pushes the contested boundary
 * into a later repeat, a component prefix pushes it further along inside its repeat.
 */
const REPEAT_PREFIXES = ["", "A\\", "A\\B\\"] as const;
/**
 * Component positions for the contested boundary. **It runs past the arity of both models on
 * purpose**: a patient name reads three components and a Universal Test ID four, so the last two
 * prefixes put the contested boundary beyond every named slot. A sweep that stopped at the second
 * would be green and blind to the bound below.
 */
const COMPONENT_PREFIXES = ["", "X^", "X^Y^", "X^Y^Z^", "X^Y^Z^W^"] as const;
/** The number of components a patient name models: last, first, middle. */
const NAME_ARITY = 3;
/** The number of components a Universal Test ID models: LOINC candidate, name, scheme, local code. */
const UTID_ARITY = 4;

/** The contested construct itself: a recognized earlier body, the component separator, a bare tail. */
const CONTESTED = "GLU&Z&^&L";

const axisStream = (repeatPrefix: string, componentPrefix: string): string =>
  `H|\\^&\rP|1||MRN-0001\rR|1|${repeatPrefix}${componentPrefix}${CONTESTED}|28.6|U/L||||F\rL|1|N\r`;

describe("the two index axes the shared corpus cannot see", () => {
  it("fires on every position of both axes, which is the over-reporting direction", () => {
    let swept = 0;
    for (const r of REPEAT_PREFIXES) {
      for (const c of COMPONENT_PREFIXES) {
        swept += 1;
        expect(codes(axisStream(r, c))).toContain(COMPONENTS);
      }
    }
    expect(swept).toBe(REPEAT_PREFIXES.length * COMPONENT_PREFIXES.length);
  });

  it("reads one component more than the competing alignment at every position ON THIS TAIL", () => {
    // The claim about the LIST, and it is scoped to this fixture's tail rather than stated as a
    // universal. On a tail the reading cannot interpret and whose body is NOT the component
    // separator, the shift propagates from the contested boundary to the end of the component list,
    // so the reading taken reads exactly one component more wherever in the list that boundary
    // sits. **It is NOT universal over the firing population**: where the sequence past the
    // boundary carries the component separator itself, both readings read the same number of
    // components in different places, which `alignment-unrecognized-tail.test.ts` sweeps and pins.
    // `CONTESTED` ends on a bare escape character, so this axis never reaches that class.
    for (const c of COMPONENT_PREFIXES) {
      const raw = axisStream("", c);
      const taken = parseAstmRecords(raw).records[2]?.fields[2]?.components ?? [];
      expect(taken).toHaveLength(competingSplit(c + CONTESTED, "^", "&").length + 1);
    }
  });

  it("moves a NAMED slot only at or before the model's own arity, and fires past it anyway", () => {
    // ── THE CLAIM ABOUT THE LIST IS NOT THE CLAIM ABOUT A MODELED SLOT, AND CONFLATING THEM IS THE
    // EXACT INFERENCE ERROR THIS DEFECT EXISTS TO RETIRE. The first draft of this code's docs read
    // "EVERY gained boundary in a repeat moves those slots, not only the first". False: a model
    // reads a FIXED number of components, so a contested boundary further right than the last
    // modeled index shifts the list and leaves every named slot byte-identical under both
    // alignments. Asserted per position against the model's arity, not described.
    for (const [index, c] of COMPONENT_PREFIXES.entries()) {
      const raw = axisStream("", c);
      const id = results(parseAstmRecords(raw))[0]?.universalTestId;
      const rival = competingSplit(c + CONTESTED, "^", "&");
      // Read the MODEL's own named slots, not a prefix of the component list truncated at the same
      // constant on both sides: that proxy stays green on an UNDER-stated arity, because it would
      // compare two lists that agree only because it stopped short of where they differ.
      const named = {
        loincCandidate: id?.loincCandidate,
        testName: id?.testName,
        codingScheme: id?.codingScheme,
        localCode: id?.localCode,
      };
      const rivalNamed = {
        loincCandidate: rival[0],
        testName: rival[1],
        codingScheme: rival[2],
        localCode: rival[3],
      };
      // The contested boundary sits at component index `index`, because each prefix entry adds one
      // component in front of it.
      if (index < UTID_ARITY) {
        expect(named).not.toEqual(rivalNamed);
      } else {
        expect(named).toEqual(rivalNamed);
      }
      // Over-reporting, never under: it fires on both sides of that bound.
      expect(codes(raw)).toContain(COMPONENTS);
    }
    // The sweep has to run past the arity or it cannot see the bound it asserts.
    expect(COMPONENT_PREFIXES.length).toBeGreaterThan(UTID_ARITY);
  });

  it("does the same on a patient name, whose arity is smaller again", () => {
    // The same bound on the other modeled component list, because the arity is the model's and not
    // the parser's: a name reads three components where a test identity reads four, so the position
    // at which a named slot stops moving is different on the same bytes.
    for (const [index, c] of COMPONENT_PREFIXES.entries()) {
      const raw = `H|\\^&\rP|1||MRN-0001||${c}${CONTESTED}||19700101|F\rL|1|N\r`;
      expect(codes(raw)).toContain(COMPONENTS);
      const name = patient(parseAstmRecords(raw))?.name;
      const rival = competingSplit(c + CONTESTED, "^", "&");
      const rivalName = { last: rival[0], first: rival[1], middle: rival[2] };
      if (index < NAME_ARITY) {
        expect({ last: name?.last, first: name?.first, middle: name?.middle }).not.toEqual(
          rivalName,
        );
      } else {
        expect({ last: name?.last, first: name?.first, middle: name?.middle }).toEqual(rivalName);
      }
    }
    expect(COMPONENT_PREFIXES.length).toBeGreaterThan(NAME_ARITY);
  });

  it("moves NOTHING modeled inside a later repeat, and fires there anyway", () => {
    // The bound written down instead of guessed at. Narrowing the sink to the first repeat would
    // change which streams a published package refuses and wants its own measurement, so it is
    // disclosed here rather than taken.
    for (const r of REPEAT_PREFIXES.slice(1)) {
      for (const c of COMPONENT_PREFIXES) {
        const raw = axisStream(r, c);
        const parsed = parseAstmRecords(raw);
        const field = parsed.records[2]?.fields[2];
        // `components` is `repeats[0]`, and the first repeat carries none of the contested bytes.
        const firstRepeatRaw = splitEscapeAware(field?.raw ?? "", "\\", "&")[0] ?? "";
        expect(field?.components).toHaveLength(competingSplit(firstRepeatRaw, "^", "&").length);
        expect(codes(raw)).toContain(COMPONENTS);
      }
    }
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
 * refusing one is an over-refusal whatever else is true of it. The three alignment codes are
 * deliberately NOT in this list, so escape-clean does not consult the criterion it is used to judge.
 */
const ESCAPE_DEVIATION_CODES = [
  WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
  WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER,
  WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE,
] as const;

const declaredSet = (ch: string, role: (typeof SPLITTING_ROLES)[number]) => {
  if (role === "field") return { header: `H${ch}\\^&`, field: ch, repeat: "\\" };
  if (role === "repeat") return { header: `H|${ch}^&`, field: "|", repeat: ch };
  return { header: `H|\\${ch}&`, field: "|", repeat: "\\" };
};

/**
 * The committed corpus stream: a comment record, whose text field carries components and repeats
 * without any of them meaning anything clinically, so the only codes a tuple raises are the escape
 * codes and the declaration's own. Same carrier as the two criterion measurements this file follows
 * on from, so the three populations are directly comparable.
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
  /** The field separator this tuple's declared set puts in force, so its bytes can be rejoined. */
  readonly fieldSeparator: string;
  /** Observed, never predicted. */
  readonly reportsMovedComponents: boolean;
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
          fieldSeparator: set.field,
          reportsMovedComponents: seen.includes(COMPONENTS),
          // Purely additive, so dropping a code from the observed list reconstructs the warning set
          // as it was without it. Nothing here is predicted from a model of the old package.
          //
          // The two EARLIER codes on the same tail test are held out of BOTH sides, so this pair
          // stays the delta THIS code causes rather than a mixed base. They fire on disjoint
          // columns, asserted below, so holding them out moves no figure here.
          acceptedBefore: seen
            .filter((c) => c !== COMPONENTS && !EARLIER_TAIL_CODES.includes(c))
            .every((c) => TOLERABLE_CODES.has(c)),
          acceptedNow: seen
            .filter((c) => !EARLIER_TAIL_CODES.includes(c))
            .every((c) => TOLERABLE_CODES.has(c)),
          escapeClean: !seen.some((c) => (ESCAPE_DEVIATION_CODES as readonly string[]).includes(c)),
        };
      }),
    ),
  ),
);

const mnemonicBodies = BODY_ALPHABET.filter(isMnemonic).length;
const sets = DECLARATION_ALPHABET.length * SPLITTING_ROLES.length;
/** The one tail whose bytes carry no escape deviation of their own: the recognized sequence. */
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
 * escape character does. The recognized tail is the only exclusion, and it is the one that matters,
 * because it is the only tail on which a stream can be escape-clean at all.
 *
 * **DERIVED from `TAIL_SUFFIXES` and the mnemonic set, not typed out**, so a tail added to that
 * constant is classified by the rule the package applies rather than by a name someone wrote beside
 * it, and the population figures below move with it.
 */
const REPORTED_TAILS: readonly string[] = TAIL_SUFFIXES.filter(
  (t) => !isMnemonic(tailBodyOf(t.suffix) ?? ""),
).map((t) => t.name);
/** The one role this code is wired to, and the two tails it fires on. */
const componentRoles = 1;
const componentTails = REPORTED_TAILS.length;

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
    // If no tuple were escape-clean, "refuses 0 escape-clean streams" would be a fact about the
    // corpus rather than about the criterion. The recognized-mnemonic bodies on every tail are what
    // supply them.
    expect(corpus.filter((t) => t.escapeClean).length).toBeGreaterThan(0);
    // A recognized body on the one tail that is itself a recognized sequence: the other two tails
    // leave a bare escape character or an unreadable body, each of which this package reports.
    expect(corpus.filter((t) => t.escapeClean)).toHaveLength(sets * mnemonicBodies * cleanTails);
  });
});

describe("the population it moves, on the strict-accepted tier", () => {
  it("fires on exactly one role and two tails, which is the whole of its claim", () => {
    const fired = corpus.filter((t) => t.reportsMovedComponents);
    expect(fired).toHaveLength(
      DECLARATION_ALPHABET.length * componentRoles * BODY_ALPHABET.length * componentTails,
    );
    for (const t of fired) {
      expect(t.role).toBe("component");
      expect(REPORTED_TAILS).toContain(t.tail);
    }
    // The one tail left out, asserted from the other side so this is a statement about the axis and
    // not about the two cells that happen to be populated.
    for (const t of corpus.filter((x) => !x.reportsMovedComponents && x.role === "component")) {
      expect(t.tail).toBe("a recognized sequence");
    }
  });

  it("moves tuples one way only: accepted to refused, and none back", () => {
    const moved = corpus.filter((t) => t.acceptedBefore && !t.acceptedNow);
    const back = corpus.filter((t) => !t.acceptedBefore && t.acceptedNow);
    // Exactly the recognized-mnemonic bodies of its column move: on every other body the
    // pre-existing ambiguity report already fired, and it is untolerable, so those tuples were
    // refused before this code existed. The four that move are precisely the ones that report's
    // recognized-body exclusion left silent.
    expect(moved).toHaveLength(
      DECLARATION_ALPHABET.length * componentRoles * mnemonicBodies * componentTails,
    );
    expect(back).toHaveLength(0);
    for (const t of moved) {
      expect(t.role).toBe("component");
      expect(isMnemonic(t.body)).toBe(true);
      expect(REPORTED_TAILS).toContain(t.tail);
    }
    // The two reported tails contribute equally, so neither half of the column is carrying the
    // other: the tail axis is a real split of the population and not a relabelling of one case.
    for (const tail of REPORTED_TAILS) {
      expect(moved.filter((t) => t.tail === tail)).toHaveLength(
        DECLARATION_ALPHABET.length * componentRoles * mnemonicBodies,
      );
    }
  });

  it("refuses NOT ONE escape-clean stream, and cannot", () => {
    // The contrast with the rejected pair-count criterion, which refused half of them. Firing
    // requires an escape character that either heads no sequence or heads one whose body this codec
    // does not recognize, and each of those is an escape deviation this package already reports, so
    // an escape-clean tuple is structurally out of reach on BOTH reported tails.
    const cleanRefused = corpus.filter((t) => t.escapeClean && t.reportsMovedComponents);
    expect(cleanRefused).toHaveLength(0);
    for (const t of corpus.filter((t) => t.reportsMovedComponents)) {
      expect(t.escapeClean).toBe(false);
      const seen = codes(t.raw);
      expect(
        seen.includes(WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER) ||
          seen.includes(WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE),
      ).toBe(true);
    }
  });

  it("fires on a column disjoint from both earlier tail reports", () => {
    // The three codes partition the splitting roles, which is what lets each carry its own claim.
    // Asserted on the shared corpus rather than reasoned from the wiring.
    for (const t of corpus) {
      const seen = codes(t.raw);
      if (seen.includes(COMPONENTS)) {
        for (const earlier of EARLIER_TAIL_CODES) expect(seen).not.toContain(earlier);
      }
    }
    expect(SPLITTING_ROLES).toHaveLength(3);
  });

  it("reads every tuple into the same bytes, so only the reporting changed", () => {
    // Nothing is dropped and nothing is invented anywhere in the corpus: every carrier record
    // rejoins, field for field, to exactly the line it was built from. This code reports a
    // boundary; it never moves one.
    for (const t of corpus) {
      const carrier = t.raw.split("\r").find((line) => line.startsWith("C"));
      const record = parseAstmRecords(t.raw).records[2];
      expect(record?.fields.map((x) => x.raw).join(t.fieldSeparator)).toBe(carrier);
    }
  });
});

/* ───────── the same corpus with the contested boundary in a LATER repeat ───────── */

/**
 * **The blind spot swept at the corpus's own scale, not just on a handful of fixtures.** The corpus
 * above puts the contested construct at the head of the field, so it always lands in the first
 * repeat, where `components` is read from. This sweep runs the identical alphabet with a clean first
 * repeat in front of it, which pushes the contested boundary into the **second** repeat and out of
 * every modeled slot.
 *
 * What it establishes is the over-reporting bound as a measurement rather than as prose: the column,
 * the acceptance delta and the escape-clean zero are all unchanged, and on **every** tuple that
 * fires the first repeat, and therefore the whole modeled component list, is identical under both
 * alignments. The code fires there anyway, deliberately, because a consumer reading `repeats` is
 * still reading an alignment guess.
 */
const laterRepeatStream = (
  set: { header: string; field: string; repeat: string },
  contested: string,
  body: string,
  suffix: string,
): string => {
  const f = set.field;
  return (
    `${set.header}\r` +
    `P${f}1${f}${f}LAB-0001\r` +
    `C${f}1${f}I${f}5.0${set.repeat}28.6&${body}&${contested}&${suffix}${f}G\r` +
    `L${f}1${f}N\r`
  );
};

describe("the same alphabet with the contested boundary out of the first repeat", () => {
  it("moves the same population, and moves NOTHING modeled on any of it", () => {
    let fired = 0;
    let moved = 0;
    let back = 0;
    let cleanRefused = 0;
    let modeledIdentical = 0;
    for (const declaration of DECLARATION_ALPHABET) {
      for (const role of SPLITTING_ROLES) {
        for (const body of BODY_ALPHABET) {
          for (const tail of TAIL_SUFFIXES) {
            const set = declaredSet(declaration, role);
            const raw = laterRepeatStream(set, declaration, body, tail.suffix);
            const seen = codes(raw);
            const fires = seen.includes(COMPONENTS);
            const acceptedBefore = seen
              .filter((c) => c !== COMPONENTS && !EARLIER_TAIL_CODES.includes(c))
              .every((c) => TOLERABLE_CODES.has(c));
            const acceptedNow = seen
              .filter((c) => !EARLIER_TAIL_CODES.includes(c))
              .every((c) => TOLERABLE_CODES.has(c));
            if (fires) fired += 1;
            if (acceptedBefore && !acceptedNow) moved += 1;
            if (!acceptedBefore && acceptedNow) back += 1;
            if (
              fires &&
              !seen.some((c) => (ESCAPE_DEVIATION_CODES as readonly string[]).includes(c))
            ) {
              cleanRefused += 1;
            }
            if (fires) {
              // The modeled component list is `repeats[0]`, and the clean first repeat carries none
              // of the contested bytes, so both alignments read it identically. Observed, per tuple.
              const field = parseAstmRecords(raw).records[2]?.fields[3];
              expect(field?.components).toEqual(["5.0"]);
              modeledIdentical += 1;
            }
          }
        }
      }
    }
    // The same column and the same delta as the head-of-field corpus: the repeat index moves
    // neither, which is exactly what makes the shared corpus's silence on this axis safe to state.
    expect(fired).toBe(
      DECLARATION_ALPHABET.length * componentRoles * BODY_ALPHABET.length * componentTails,
    );
    expect(moved).toBe(
      DECLARATION_ALPHABET.length * componentRoles * mnemonicBodies * componentTails,
    );
    expect(back).toBe(0);
    expect(cleanRefused).toBe(0);
    // And the bound itself: on every tuple that fires here, nothing modeled moved.
    expect(modeledIdentical).toBe(fired);
  });
});
