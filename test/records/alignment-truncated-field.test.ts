/**
 * A gained **repeat** boundary shifts nothing and still costs a modeled slot, because a field is
 * read out of its first repeat alone.
 *
 * Escape sequences are matched greedily, leftmost first, so the escape character closing one triple
 * cannot also open the next. Where it could have, the same bytes carry two alignments that disagree
 * by one boundary. On the **field** separator that gained boundary shifts every later field, and
 * that already reports. On the **repeat** separator nothing shifts at all: the units slot and the
 * result-status slot are read out of the same field numbers under either alignment. **That was read
 * as "so it reaches nothing", and it is false.** A field's modeled value and its components are
 * taken from `repeats[0]`, so everything past a gained repeat boundary stays on the wire, stays in
 * `repeats`, and leaves every modeled slot.
 *
 * **Two costs, both measured on the canonical set, so no unusual declaration is needed to reach
 * either.**
 * - A value **truncates**: `28.6&S&\&U/L` reads as the two repeats `28.6^` and `&U/L`, and every
 *   value extractor answers `28.6^`. The competing alignment reads one repeat carrying all of it.
 * - A modeled component list is **deleted**, which is the half a shift report could not cover:
 *   `&F&\&687` in a Universal Test ID field reads as one component holding a decoded field
 *   separator, so the identity comes back as a LOINC candidate the sender never wrote and the local
 *   code `687` is in no modeled slot at all. A patient name loses its given and middle names the
 *   same way.
 *
 * **It is a report, not a repair.** The split is unchanged, every decoded byte is identical,
 * `repeats` still carries every one of them, and the truncated value read is the value that was
 * always read. Picking the other alignment would be a different guess with no more evidence behind
 * it, on a published package. What is new is that the truncation is reported by a code no profile
 * may tolerate, where before it was covered only by tolerable ones.
 *
 * **The tail is weighed one construct deep, on the same test the shift report uses.** A criterion
 * counting only the contested pair was measured over this same corpus and rejected, because it
 * refuses streams whose escaping is entirely well formed. The tail is what separates the two, and
 * the corpus below carries it as an axis so the over-refusal class is inside the measurement rather
 * than outside it.
 *
 * **The tier is strict-accepted-under-a-gate-legal-profile.** "0 silent" has no discriminating
 * power here: anything that can exhibit this raises a tolerable code, so an empty warning list is
 * structurally unreachable. **Every count below derives from a committed alphabet constant inside
 * the assertion that uses it**, never from a hand-typed number.
 *
 * All fixtures are **synthetic**, including the patient name and the identifiers, which are there
 * on purpose: a claim about a record carrying an identity has to be tested on a payload that
 * carries one. No clause of ASTM E1394 / CLSI LIS01 / LIS02 is claimed anywhere here. The atom
 * rule, the mnemonic set, the leftmost match and this criterion are all this package's own codec,
 * and nothing rests on standards text this repo cannot read.
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

const TRUNCATED = WARNING_CODES.ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD;
const SHIFT = WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS;
/**
 * The code that landed after this one, asking the same tail question on the third and last
 * splitting role, the component split. It is held out of this file's tier on both sides, so the
 * figures below stay the delta this code caused rather than a mixed base. Its own delta is measured
 * in its own file.
 */
const LATER_TAIL_CODE = WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS;
const ALIGNMENT = WARNING_CODES.ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT;

const codes = (raw: string) => parseAstmRecords(raw).warnings.map((w) => w.code);

/**
 * The widest profile the safety gate permits, built **from** the allow-list so it cannot drift out
 * of step with it. Acceptance under this profile is the strongest form of "a gate-legal profile
 * accepts it", which is the tier this whole file is measured on.
 *
 * **This is also the harness's negative control.** It is constructed by spreading this package's
 * own tolerable set, so a copy of this file pointed at a sibling parser fails loudly on that spread
 * rather than quietly producing a number against the wrong package.
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

/**
 * The truncated-value fixture, on the **canonical** set, carrying a patient name and identifiers so
 * the claim is made against a payload that can express the harm. **Synthetic: no real person, no
 * real accession, no real MRN.** The value field ends in an escape sequence whose body is the
 * recognized component mnemonic, immediately before the repeat separator, which is itself followed
 * by an escape character heading nothing.
 */
const TRUNCATED_VALUE =
  "H|\\^&\r" +
  "P|1||MRN-0001||SYNTHETIC^GRAZYNA^Q||19700101|F\r" +
  "R|1|^^^687|28.6&S&\\&U/L|U/L||||F\r" +
  "L|1|N\r";

/** The value field of that fixture, so both alignments can be taken of exactly the same bytes. */
const TRUNCATED_VALUE_FIELD = "28.6&S&\\&U/L";

/**
 * The deleted-identity fixture, also on the **canonical** set. The Universal Test ID field opens
 * with an escape sequence whose body is the recognized field mnemonic, then the repeat separator,
 * then an escape character heading nothing.
 */
const DELETED_IDENTITY = "H|\\^&\rP|1||MRN-0001\rR|1|&F&\\&687|28.6|U/L||||F\rL|1|N\r";

describe("the truncated value, measured against both alignments of the same bytes", () => {
  it("reads a value the competing alignment reads in full", () => {
    const leftmost = splitEscapeAware(TRUNCATED_VALUE_FIELD, "\\", "&");
    const competing = competingSplit(TRUNCATED_VALUE_FIELD, "\\", "&");
    // The boundary the reading GAINED: two repeats where the other reading has one.
    expect(leftmost).toHaveLength(competing.length + 1);
    expect(competing).toHaveLength(1);
    // Neither alignment is forced by the bytes: they differ only in where one escape character's
    // triple begins, and both readings consume every byte.
    expect(leftmost.join("\\")).toBe(TRUNCATED_VALUE_FIELD);
    expect(competing.join("\\")).toBe(TRUNCATED_VALUE_FIELD);
  });

  it("hands a consumer a truncated result value off a payload that also carries a name", () => {
    const parsed = parseAstmRecords(TRUNCATED_VALUE);
    // NON-VACUITY: the payload can express the harm. A PHI or safety claim tested against bytes
    // that carry no identity proves nothing, so the identity is asserted before the harm is.
    expect(parsed.records[1]?.type).toBe("P");
    expect(parsed.records[1]?.fields[5]?.raw).toBe("SYNTHETIC^GRAZYNA^Q");
    expect(parsed.records[1]?.fields[3]?.raw).toBe("MRN-0001");
    const [only] = results(parsed);
    // And it is a real modeled result, not an empty shell that could carry a value vacuously.
    expect(only?.units).toBe("U/L");
    expect(only?.status.meaning).toBe("final");
    // THE HARM: the value stops at the gained boundary. Nothing said so before this code.
    expect(only?.value).toBe("28.6^");
    expect(parsed.records[2]?.fields[3]?.repeats).toEqual([["28.6^"], ["&U/L"]]);
    // Nothing shifted, and that is the point: the units and the status are read out of the same
    // field numbers either way, which is exactly why the shift report cannot see this.
    expect(parsed.records[2]?.fields).toHaveLength(9);
    expect(competingSplit(TRUNCATED_VALUE.split("\r")[2] ?? "", "|", "&")).toHaveLength(9);
  });

  it("reports it now, and a gate-legal profile no longer accepts it", () => {
    // What it looked like before this code: the ONLY warning was a tolerable one, so the widest
    // gate-legal profile plus strict mode accepted the truncation.
    const seen = codes(TRUNCATED_VALUE);
    expect(seen.filter((c) => c !== TRUNCATED)).toEqual([
      WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER,
    ]);
    expect(seen.filter((c) => c !== TRUNCATED).every((c) => TOLERABLE_CODES.has(c))).toBe(true);
    expect(seen).toContain(TRUNCATED);
    expect(acceptedUnderMaximalTolerance(TRUNCATED_VALUE)).toBe(false);

    // Neither of the other two alignment reports fires here. The earlier one is silent because the
    // contested body is a recognized mnemonic, and the shift report is silent because no field
    // boundary was gained. This code is a widening of neither.
    expect(seen).not.toContain(ALIGNMENT);
    expect(seen).not.toContain(SHIFT);

    const w = parseAstmRecords(TRUNCATED_VALUE).warnings.find((x) => x.code === TRUNCATED);
    // The field whose reading was cut off. The repeat index is deliberately not reported: what a
    // consumer needs is which field lost the rest of its value.
    expect(w?.position).toEqual({ recordIndex: 2, recordType: "R", fieldIndex: 4 });
    // A delimiter is a byte off the wire, and a name is PHI: the message carries neither.
    expect(w?.message).not.toMatch(/[|^&\\]/u);
    expect(w?.message).not.toMatch(/GRAZYNA|MRN-0001|28\.6/u);
  });
});

describe("the deleted identity, which is the half a shift report could not reach", () => {
  it("empties a Universal Test ID into a component the sender never wrote", () => {
    const parsed = parseAstmRecords(DELETED_IDENTITY);
    const record = parsed.records[2];
    // The identity field carries a test code on the wire, and both alignments keep every byte.
    expect(record?.fields[2]?.raw).toBe("&F&\\&687");
    expect(competingSplit("&F&\\&687", "\\", "&")).toEqual(["&F&\\&687"]);
    // THE HARM: the reading taken divides it, and the modeled components come from the first
    // repeat alone, so the local code leaves every modeled slot and what is left is one component
    // holding a decoded field separator. That component is then read as a LOINC candidate.
    expect(record?.fields[2]?.repeats).toEqual([["|"], ["&687"]]);
    const id = results(parsed)[0]?.universalTestId;
    expect(id?.components).toEqual(["|"]);
    expect(id?.localCode).toBeUndefined();
    expect(id?.codingScheme).toBeUndefined();
    // Reported now, and refused. Before this code the only warning was a tolerable one.
    const seen = codes(DELETED_IDENTITY);
    expect(seen).toContain(TRUNCATED);
    expect(seen.filter((c) => c !== TRUNCATED)).toEqual([
      WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER,
    ]);
    expect(acceptedUnderMaximalTolerance(DELETED_IDENTITY)).toBe(false);
  });

  it("takes a patient's given and middle names the same way", () => {
    const name = "H|\\^&\rP|1||MRN-0001||DOE&S&\\&JANE^A||19700101|F\rL|1|N\r";
    const parsed = parseAstmRecords(name);
    // The competing alignment reads one repeat holding the whole name field.
    expect(competingSplit("DOE&S&\\&JANE^A", "\\", "&")).toEqual(["DOE&S&\\&JANE^A"]);
    // The reading taken keeps the first repeat only, so there is no given name and no middle name.
    expect(patient(parsed)?.name).toMatchObject({ last: "DOE^" });
    expect(patient(parsed)?.name?.first).toBeUndefined();
    expect(patient(parsed)?.name?.middle).toBeUndefined();
    expect(codes(name)).toContain(TRUNCATED);
    expect(acceptedUnderMaximalTolerance(name)).toBe(false);
  });
});

describe("what the report does and does not change", () => {
  it("is a report and not a repair: no profile may tolerate it and no byte moved", () => {
    expect(TOLERABLE_CODES.has(TRUNCATED)).toBe(false);
    expect(() =>
      defineAstmProfile({
        name: "nope",
        tolerate: [{ code: TRUNCATED, rationale: "no" }],
      }),
    ).toThrow();
    // Every character of the record survives into the parsed fields, in order, unchanged, and the
    // bytes past the gained boundary are still in `repeats`. Nothing was dropped: what the warning
    // reports is that the MODELED reading stops early.
    const record = parseAstmRecords(TRUNCATED_VALUE).records[2];
    expect(record?.fields.map((f) => f.raw).join("|")).toBe("R|1|^^^687|28.6&S&\\&U/L|U/L||||F");
    expect(record?.fields[3]?.repeats.flat().join("")).toContain("&U/L");
  });

  it("does not reach through a re-emit, so it must be caught on the FIRST read", () => {
    // Emit rewrites the preserved sequences into recognized mnemonics, and those bytes carry the
    // reading that was taken unambiguously. Generation two is silent and is CORRECT about its own
    // bytes. A clean re-read is not evidence that generation one was read right.
    const generation2 = serializeAstmRecords(parseAstmRecords(TRUNCATED_VALUE));
    expect(codes(generation2)).not.toContain(TRUNCATED);
    expect(acceptedUnderMaximalTolerance(generation2)).toBe(true);
  });
});

describe("WHICH boundary was gained, the axis that decides what it costs", () => {
  it("fires at a LATER boundary too, where NO modeled slot moves", () => {
    // ── THE BOUND ON THE CLAIM, MEASURED AND STATED RATHER THAN LEFT TO BE FOUND. The sink is
    // called for a contested repeat boundary at ANY repeat index. Only the FIRST one reaches a
    // modeled slot, because `components` is `repeats[0]`. At a later one the first repeat is
    // identical under both alignments, so the value, the components and every slot taken from them
    // read the same either way, and what differs is the repeat structure after the first.
    const later = "H|\\^&\rP|1||MRN-0001\rR|1|^^^687|5.0\\28.6&S&\\&U/L|U/L||||F\rL|1|N\r";
    const parsed = parseAstmRecords(later);
    const field = parsed.records[2]?.fields[3];
    expect(field?.repeats).toEqual([["5.0"], ["28.6^"], ["&U/L"]]);
    // The competing alignment reads one repeat fewer, and the FIRST is the same under both.
    const rival = competingSplit("5.0\\28.6&S&\\&U/L", "\\", "&");
    expect(rival).toHaveLength(field?.repeats.length ? field.repeats.length - 1 : 0);
    expect(rival[0]).toBe("5.0");
    expect(field?.components).toEqual(["5.0"]);
    const [only] = results(parsed);
    expect(only?.value).toBe("5.0");
    expect(only?.units).toBe("U/L");
    expect(only?.status.meaning).toBe("final");
    // AND IT FIRES ANYWAY. That is deliberate: the boundary is still one the bytes do not force,
    // and a consumer reading `repeats` is still reading an alignment guess. Relative to the modeled
    // slots it is OVER-reporting, never under-reporting, which is the direction this package errs
    // in. Narrowing the sink to the first boundary changes which streams a published package
    // refuses and wants its own measurement, so the bound is written down instead of guessed at.
    expect(codes(later)).toContain(TRUNCATED);
    expect(acceptedUnderMaximalTolerance(later)).toBe(false);
    // Same field index either way: the warning names the field, not the repeat.
    expect(parsed.warnings.find((w) => w.code === TRUNCATED)?.position).toEqual({
      recordIndex: 2,
      recordType: "R",
      fieldIndex: 4,
    });
  });

  it("contrasts with the first boundary, where the modeled reading really does move", () => {
    // The other half of the same axis, so the two are never read as one statement. Here the first
    // repeat differs between the alignments, which is what makes the modeled slot move.
    const first = parseAstmRecords(TRUNCATED_VALUE).records[2]?.fields[3];
    expect(first?.repeats[0]).toEqual(["28.6^"]);
    expect(competingSplit(TRUNCATED_VALUE_FIELD, "\\", "&")[0]).toBe(TRUNCATED_VALUE_FIELD);
    expect(first?.components).toEqual(["28.6^"]);
  });
});

describe("the streams it must NOT touch, which is what the tail axis decides", () => {
  it("stays silent where the reading taken reads cleanly past the boundary", () => {
    // Same shape, one byte different: the escape character past the boundary heads a RECOGNIZED
    // sequence, so the reading taken interprets it and the competing alignment is the one that
    // would leave it bare. The two repeats here are the ones the sender wrote, escaping the repeat
    // separator, writing it, and escaping it again. Refusing that is the over-refusal that sank the
    // preceding candidate criterion for this family.
    const wellFormed = "H|\\^&\rP|1||MRN-0001\rR|1|^^^687|28.6&R&\\&R&U/L|U/L||||F\rL|1|N\r";
    expect(codes(wellFormed)).toEqual([]);
    expect(acceptedUnderMaximalTolerance(wellFormed)).toBe(true);
    // And it really does divide the field: silence here is a judgement about which reading the
    // bytes prefer, not a claim that no boundary was gained.
    expect(parseAstmRecords(wellFormed).records[2]?.fields[3]?.repeats).toEqual([
      ["28.6\\"],
      ["\\U/L"],
    ]);
  });

  it("REPORTS the tail that heads an UNRECOGNIZED sequence, which was this file's residue", () => {
    // ── THE RESIDUE THIS FILE ONCE NAMED, NOW CLOSED, AND THE CORRECTION IS TO THE REASON.
    // The recorded reason for the silence was that the competing alignment would leave TWO escape
    // characters bare here, so the bytes prefer the reading taken more strongly than in the case
    // that already fired. That comparison is true and it is not the question this code asks. It
    // reports a COST, and the cost is the same one: the value truncates at the gained boundary and
    // everything past it leaves every modeled slot, identical to the bare-tail fixture above.
    // Consuming a triple is not interpreting it: an unrecognized body is preserved verbatim and
    // never guessed at, and this package reports it as a deviation in its own right.
    const residue = "H|\\^&\rP|1||MRN-0001\rR|1|^^^687|28.6&S&\\&Z&U/L|U/L||||F\rL|1|N\r";
    const seen = codes(residue);
    expect(seen).toContain(TRUNCATED);
    // The harm is the same harm: the value stops at the gained boundary just the same.
    expect(results(parseAstmRecords(residue))[0]?.value).toBe("28.6^");
    expect(parseAstmRecords(residue).records[2]?.fields[3]?.repeats).toEqual([
      ["28.6^"],
      ["&Z&U/L"],
    ]);
    // It was accepted before by every gate-legal profile, on one tolerable code, and is not now.
    expect(seen.filter((c) => c !== TRUNCATED)).toEqual([
      WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
    ]);
    expect(seen.filter((c) => c !== TRUNCATED).every((c) => TOLERABLE_CODES.has(c))).toBe(true);
    expect(acceptedUnderMaximalTolerance(residue)).toBe(false);
  });

  it("stays silent on a gained FIELD boundary, which is the other code's question", () => {
    // The two are wired to different splits and neither is a widening of the other. A gained field
    // boundary shifts every later field into a modeled slot, which this code says nothing about.
    const fieldRole = "H|\\^&\rP|1||MRN-0001\rR|1|^^^687|28.6&F&|&U/L||||F\rL|1|N\r";
    const seen = codes(fieldRole);
    expect(seen).toContain(SHIFT);
    expect(seen).not.toContain(TRUNCATED);
  });

  it("stays silent on a gained COMPONENT boundary, WHICH ALSO MOVES A MODELED SLOT", () => {
    // ── CLOSED SINCE, BY A THIRD CODE, AND THIS CODE'S SILENCE ON IT IS STILL THE POINT HERE.
    // A gained component boundary reaches a modeled slot too, and differently: the components do
    // not leave the record, they move one slot along, so a vendor local code is read as a coding
    // scheme and a given name as a middle name. This code cannot cover that, because what it
    // reports is a reading cut short and there the reading is complete and misaligned. That is why
    // closing it took a sink on a third split, which is another criterion and took its own
    // population measurement. Both cases below reproduced on this slice's base reported by nothing;
    // the closure is asserted alongside this code's silence so that silence stays a statement about
    // THIS code rather than a stale claim that nothing reports these streams.
    const utid = "H|\\^&\rP|1||MRN-0001\rR|1|&F&^&GLU^L^687|28.6|U/L||||F\rL|1|N\r";
    expect(codes(utid)).toEqual([
      WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS,
      WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER,
    ]);
    expect(acceptedUnderMaximalTolerance(utid)).toBe(false);
    const id = results(parseAstmRecords(utid))[0]?.universalTestId;
    expect(id?.codingScheme).toBe("L");
    expect(id?.localCode).toBe("687");
    expect(competingSplit("&F&^&GLU^L^687", "^", "&")).toHaveLength(
      (id?.components.length ?? 0) - 1,
    );

    const name = "H|\\^&\rP|1||MRN-0001||DOE&F&^&JANE^A||19700101|F\rL|1|N\r";
    expect(codes(name)).toEqual([
      WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS,
      WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER,
    ]);
    expect(acceptedUnderMaximalTolerance(name)).toBe(false);
    expect(patient(parseAstmRecords(name))?.name).toMatchObject({ first: "&JANE", middle: "A" });

    expect(codes(utid)).not.toContain(TRUNCATED);
    expect(codes(name)).not.toContain(TRUNCATED);
  });
});

/* ─────────────────────── the population this code moves, measured ─────────────────────── */

/** The four recognized escape mnemonics. */
const MNEMONICS = ["F", "S", "R", "E"] as const;
const isMnemonic = (ch: string): boolean => (MNEMONICS as readonly string[]).includes(ch);

/**
 * The committed declaration alphabet: the four mnemonic letters, and four characters that are
 * delimiters in no vocabulary. None collides with the roles held fixed below, so every set
 * resolves. Same alphabet as the two measurements this one follows on from, so the populations are
 * directly comparable.
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
 * A corpus that fixes this axis contains no well-formed stream at all, so it cannot observe a
 * criterion refusing one and reports a comforting zero.
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
  if (role === "field") return { header: `H${ch}\\^&`, field: ch };
  if (role === "repeat") return { header: `H|${ch}^&`, field: "|" };
  return { header: `H|\\${ch}&`, field: "|" };
};

/**
 * The committed corpus stream: a comment record, whose text field carries components and repeats
 * without any of them meaning anything clinically, so the only codes a tuple raises are the escape
 * codes and the declaration's own. Same carrier as the two measurements this one follows on from,
 * so the populations are directly comparable.
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
  readonly reportsTruncation: boolean;
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
          reportsTruncation: seen.includes(TRUNCATED),
          // Purely additive, so dropping this code from the observed list reconstructs the previous
          // warning set exactly. Nothing here is predicted from a model of the old package.
          //
          // A LATER code on this same tail test, wired to the component split, is held out of BOTH
          // sides, so this pair stays the delta THIS code caused rather than drifting into a mixed
          // base. It fires on a disjoint column, so holding it out moves no figure below; what it
          // does is keep both fields meaning what they say. That is this file's own recorded
          // lesson, applied before it could bite a second time: `acceptedBefore` once held out only
          // one code and silently stopped meaning what it said for a whole column.
          acceptedBefore: seen
            .filter((c) => c !== TRUNCATED && c !== LATER_TAIL_CODE)
            .every((c) => TOLERABLE_CODES.has(c)),
          acceptedNow: seen
            .filter((c) => c !== LATER_TAIL_CODE)
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
const truncationRoles = 1;
const truncationTails = REPORTED_TAILS.length;

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

describe("what the truncation report moves, on the strict-accepted tier", () => {
  it("fires on exactly one role against two tails, and on no escape-clean stream at all", () => {
    const fires = corpus.filter((t) => t.reportsTruncation);
    expect(fires).toHaveLength(
      DECLARATION_ALPHABET.length * truncationRoles * BODY_ALPHABET.length * truncationTails,
    );
    for (const t of fires) {
      expect(t.role).toBe("repeat");
      expect(REPORTED_TAILS).toContain(t.tail);
    }
    // THE FINDING that separates this criterion from the pair count measured and rejected before
    // it. That one refused 48 of the 96 escape-clean tuples in this same corpus. This one refuses
    // none, and it cannot: firing requires the escape character past the boundary either to head no
    // sequence or to head one whose body this codec does not recognize, and this package already
    // reports each of those as a deviation in its own right. Widening the tail axis from one tail
    // to two therefore costs nothing on the axis the rejected criterion failed on.
    expect(fires.filter((t) => t.escapeClean)).toHaveLength(0);
    for (const t of fires) {
      const seen = codes(t.raw);
      expect(
        seen.includes(WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER) ||
          seen.includes(WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE),
      ).toBe(true);
    }
    // And it never coincides with the shift report: they are wired to different splits.
    for (const t of fires) {
      expect(codes(t.raw)).not.toContain(SHIFT);
    }
  });

  it("moves the recognized-body tuples of that column, and moves none back", () => {
    const moved = corpus.filter((t) => t.acceptedBefore && !t.acceptedNow);
    const back = corpus.filter((t) => !t.acceptedBefore && t.acceptedNow);
    // The unrecognized bodies of that column were already refused: the earlier alignment report
    // fires on them and no profile may tolerate it either. What moves is exactly the population
    // that report's recognized-body exclusion left silent.
    expect(moved).toHaveLength(
      DECLARATION_ALPHABET.length * truncationRoles * mnemonicBodies * truncationTails,
    );
    expect(back).toHaveLength(0);
    for (const t of moved) {
      expect(isMnemonic(t.body)).toBe(true);
      expect(t.role).toBe("repeat");
      expect(REPORTED_TAILS).toContain(t.tail);
      expect(codes(t.raw)).not.toContain(ALIGNMENT);
    }
    // The two reported tails contribute equally, so neither half of the column is carrying the
    // other: the tail axis is a real split of the population and not a relabelling of one case.
    for (const tail of REPORTED_TAILS) {
      expect(moved.filter((t) => t.tail === tail)).toHaveLength(
        DECLARATION_ALPHABET.length * truncationRoles * mnemonicBodies,
      );
    }
    // Every moved tuple is a stream this package already called deviant, on a tolerable code.
    for (const t of moved) {
      expect(
        codes(t.raw)
          .filter((c) => c !== TRUNCATED)
          .every((c) => TOLERABLE_CODES.has(c)),
      ).toBe(true);
    }
  });

  it("leaves the RECOGNIZED tail of that column exactly where it was", () => {
    // The one exclusion left, and the one that carries the whole over-refusal argument: where the
    // reading taken interprets the construct it resumed on, the stream can be entirely well formed
    // and refusing it is the failure that sank the preceding candidate criterion.
    const untouched = corpus.filter((t) => t.role === "repeat" && !REPORTED_TAILS.includes(t.tail));
    expect(untouched).toHaveLength(
      DECLARATION_ALPHABET.length *
        truncationRoles *
        BODY_ALPHABET.length *
        (TAIL_SUFFIXES.length - truncationTails),
    );
    for (const t of untouched) {
      expect(t.tail).toBe("a recognized sequence");
      expect(t.reportsTruncation).toBe(false);
      expect(t.acceptedNow).toBe(t.acceptedBefore);
    }
  });

  it("leaves the other two roles exactly where they were", () => {
    const others = corpus.filter((t) => t.role !== "repeat");
    for (const t of others) {
      expect(t.reportsTruncation).toBe(false);
      expect(t.acceptedNow).toBe(t.acceptedBefore);
    }
  });
});

/**
 * The same sweep with the contested boundary moved off the front of the field, so the axis the
 * corpus above holds fixed is measured rather than assumed. The corpus above is deliberately left
 * exactly as the two measurements before it took it, so its figures stay directly comparable; this
 * is a second sweep beside it rather than a widening of it.
 */
const laterBoundaryStream = (
  set: { header: string; field: string },
  contested: string,
  body: string,
  suffix: string,
): string => {
  const f = set.field;
  return (
    `${set.header}\r` +
    `P${f}1${f}${f}LAB-0001\r` +
    `C${f}1${f}I${f}5.0${contested}28.6&${body}&${contested}&${suffix}${f}G\r` +
    `L${f}1${f}N\r`
  );
};

describe("the repeat-index axis, so what it costs is measured and not assumed", () => {
  it("fires on the same column with the boundary moved off the front, and moves the same tuples", () => {
    let fires = 0;
    let moved = 0;
    let back = 0;
    let escapeCleanRefused = 0;
    let firstRepeatUnchanged = 0;
    for (const declaration of DECLARATION_ALPHABET) {
      for (const body of BODY_ALPHABET) {
        for (const tail of TAIL_SUFFIXES) {
          const set = declaredSet(declaration, "repeat");
          const raw = laterBoundaryStream(set, declaration, body, tail.suffix);
          const seen = codes(raw);
          const fired = seen.includes(TRUNCATED);
          const acceptedBefore = seen
            .filter((c) => c !== TRUNCATED)
            .every((c) => TOLERABLE_CODES.has(c));
          const acceptedNow = acceptedUnderMaximalTolerance(raw);
          if (fired) fires += 1;
          if (acceptedBefore && !acceptedNow) moved += 1;
          if (!acceptedBefore && acceptedNow) back += 1;
          if (
            fired &&
            !seen.some((c) => (ESCAPE_DEVIATION_CODES as readonly string[]).includes(c))
          ) {
            escapeCleanRefused += 1;
          }
          if (fired) {
            // THE FINDING THIS AXIS EXISTS FOR: on every tuple that fires here, the FIRST repeat is
            // the same under both alignments, so nothing modeled moves and the report is an
            // over-report relative to the modeled slots. That is the bound on this code's claim.
            const text = `5.0${declaration}28.6&${body}&${declaration}&${tail.suffix}`;
            const taken = splitEscapeAware(text, declaration, "&");
            const rival = competingSplit(text, declaration, "&");
            expect(taken).toHaveLength(rival.length + 1);
            if (taken[0] === rival[0]) firstRepeatUnchanged += 1;
          }
        }
      }
    }
    // Same column and same size as the front-of-field sweep: one role, both reported tails, every
    // body. The tail axis and the repeat-index axis are independent, which is the point of running
    // this sweep beside the shared corpus rather than reasoning about it.
    expect(fires).toBe(DECLARATION_ALPHABET.length * BODY_ALPHABET.length * truncationTails);
    expect(moved).toBe(DECLARATION_ALPHABET.length * mnemonicBodies * truncationTails);
    expect(back).toBe(0);
    expect(escapeCleanRefused).toBe(0);
    // And on every one of them the modeled reading is untouched. Nothing here is a lost value.
    expect(firstRepeatUnchanged).toBe(fires);
  });
});

describe("the canonical set, swept the same way", () => {
  it("reaches it, on the repeat role and the two reported tails and nothing else", () => {
    // Unlike the population the rejected pair count moved, this one is NOT confined to a set naming
    // a mnemonic letter as a delimiter: the canonical repeat separator reaches it. A canonical
    // sender writing an escape sequence, the repeat separator, then a bare escape character is
    // inside this report, which is why it is worth having.
    let fired = 0;
    let checked = 0;
    for (const contested of ["|", "\\", "^"] as const) {
      for (const body of BODY_ALPHABET) {
        for (const tail of TAIL_SUFFIXES) {
          const raw = `H|\\^&\rP|1||LAB-0001\rC|1|I|28.6&${body}&${contested}&${tail.suffix}|G\rL|1|N\r`;
          if (codes(raw).includes(TRUNCATED)) {
            fired += 1;
            expect(contested).toBe("\\");
            expect(REPORTED_TAILS).toContain(tail.name);
          }
          checked += 1;
        }
      }
    }
    expect(checked).toBe(3 * BODY_ALPHABET.length * TAIL_SUFFIXES.length);
    expect(fired).toBe(BODY_ALPHABET.length * truncationRoles * truncationTails);
  });
});
