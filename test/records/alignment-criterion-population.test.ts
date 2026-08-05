/**
 * The population a candidate criterion for `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT` would move, and
 * the reason that candidate is **not** the one this package ships.
 *
 * **Nothing here changes behaviour.** Every criterion below other than the shipped one is a predicate
 * written out in this file and evaluated against the corpus. The package is measured, never modified,
 * because the thing being measured is which streams a **published** package refuses under
 * `{ strict: true }`, and that is not a number to move on an argument.
 *
 * **The open question this answers.** The shipped report fires where two escape alignments of the
 * same bytes disagree about one boundary and the leftmost triple's body is **not** a recognized
 * mnemonic. That exclusion is wider than the argument for it: where the declared set names one of the
 * four mnemonic letters as a splitting delimiter, *both* alignments interpret a construct at the
 * contested position, nothing prefers either, and the report is silent while a gained boundary can
 * truncate a result's value or empty its test identity. The obvious repair is to swap the
 * recognition test for a **count** of what each alignment interprets there, and fire unless the
 * alignment taken interprets strictly more. This file measures that candidate, and **rejects it**.
 *
 * **Why it is rejected, in one sentence:** the count is taken over the two contested triples only,
 * while the two alignments also disagree about every byte that follows, so a stream whose escaping is
 * entirely well-formed can be scored a tie and refused. The corpus below carries a `tail` axis
 * precisely so that class is inside it. A measurement whose corpus cannot contain the counterexample
 * certifies nothing, and an earlier corpus for this question could not.
 *
 * **The tier is strict-accepted-under-a-gate-legal-profile**, as everywhere else in this suite:
 * "0 silent" has no discriminating power here, because anything that can exhibit this at all already
 * raises a tolerable code, so an empty warning list is structurally unreachable. **Every count is
 * derived from the alphabet constants in this file inside the assertion that uses it.**
 *
 * All fixtures are **synthetic**. No clause of ASTM E1394 / CLSI LIS01 / LIS02 is claimed anywhere
 * here: the atom rule, the mnemonic set, the leftmost match and every criterion weighed below are
 * this package's own codec, and nothing rests on standards text this repo cannot read.
 */

import { describe, expect, it } from "vitest";

import {
  AstmStrictError,
  defineAstmProfile,
  parseAstmRecords,
  results,
  TOLERABLE_CODES,
  WARNING_CODES,
} from "../../src/index.js";

const ALIGNMENT = WARNING_CODES.ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT;

/**
 * The widest profile the safety gate permits, built **from** the allow-list so it cannot drift out
 * of step with it. Acceptance under this profile is the strongest form of "a gate-legal profile
 * accepts it", which is the tier this whole file is measured on.
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

const codes = (raw: string) => parseAstmRecords(raw).warnings.map((w) => w.code);

const acceptedUnderMaximalTolerance = (raw: string): boolean => {
  try {
    parseAstmRecords(raw, { strict: true, profile: maximalTolerance });
    return true;
  } catch (err) {
    if (err instanceof AstmStrictError) return false;
    throw err;
  }
};

/** The four recognized escape mnemonics. Every criterion weighed here is written in terms of these. */
const MNEMONICS = ["F", "S", "R", "E"] as const;
const isMnemonic = (ch: string): boolean => (MNEMONICS as readonly string[]).includes(ch);

/**
 * The committed declaration alphabet: the four mnemonic letters, which are the whole reason this
 * corpus differs from the canonical one, and four characters that are delimiters in no vocabulary.
 * None of them collides with the roles held fixed below, so every set here resolves.
 */
const DECLARATION_ALPHABET = ["F", "S", "R", "E", "~", ":", "#", "*"] as const;

/** The three roles a split is taken on. The escape role is held fixed: nothing splits on it. */
const SPLITTING_ROLES = ["field", "repeat", "component"] as const;

/**
 * The committed body alphabet: the four mnemonics, the four canonical delimiter characters, and
 * four characters that are neither. This is the character the leftmost alignment's triple holds.
 */
const BODY_ALPHABET = ["F", "S", "R", "E", "|", "\\", "^", "&", "~", ":", "#", "*"] as const;

/**
 * **The axis an earlier corpus for this question did not have, and the one that decides the answer.**
 * The two alignments disagree about the contested boundary AND about every byte after it, so what
 * follows the boundary is not a free variable. Three tails, each a different thing for the escape
 * character just past the boundary to be: heading nothing (a bare escape character, which is a
 * deviation of its own), heading a sequence this codec recognizes (the escape mechanism working),
 * and heading one it does not. A corpus fixing this to the first cannot contain a stream whose
 * escaping is well-formed, and therefore cannot see a criterion over-refusing one.
 */
const TAIL_SUFFIXES = [
  { name: "a bare escape character", suffix: "U/L" },
  { name: "a recognized sequence", suffix: "F&U/L" },
  { name: "an unrecognized sequence", suffix: "Z&U/L" },
] as const;

/**
 * The codes that say this package found something wrong with a stream's **escaping**. A tuple raising
 * none of them is **escape-clean**: every escape character in it heads a sequence this codec
 * recognizes, and no delimiter went missing inside an unreadable body. That is the escape mechanism
 * working exactly as it is meant to, so refusing one of these is an over-refusal whatever else is
 * true of the stream.
 *
 * **The alignment code is deliberately NOT in this list**, so escape-clean does not consult the
 * criterion it is used to judge. The population is the same 96 tuples either way, so the
 * independence costs nothing.
 *
 * **It does not follow that "no escape-clean tuple is reported today" is a free result, and it must
 * not be read as evidence about the shipped criterion.** It is still entailed one layer down: the
 * alignment sink is gated on a non-mnemonic body, and the same body always drives the unknown-escape
 * sink, so a stream raising the alignment code can never be escape-clean. What the zero does
 * discriminate is the **candidate** criterion from the shipped one, which is what this file needs it
 * for, and what the candidate does to this population is the finding below.
 *
 * **What escape-clean does NOT mean.** It says nothing about the decoded value, which legitimately
 * holds the literal delimiter an escape sequence stood for: `&F&` decoding to the field separator is
 * the whole point of the mechanism, not a residue of it.
 */
const ESCAPE_DEVIATION_CODES = [
  WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
  WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER,
  WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE,
] as const;

interface DeclaredSet {
  readonly header: string;
  readonly field: string;
}

/**
 * One declared set per (character, role) pair: the swept character takes that role and the other
 * three keep canonical characters, so the only thing varying between sets is which role the swept
 * character holds. The escape character is `&` throughout, because the condition needs an escape
 * character on both sides of the contested delimiter and varying it varies nothing else.
 */
const declaredSet = (ch: string, role: (typeof SPLITTING_ROLES)[number]): DeclaredSet => {
  if (role === "field") return { header: `H${ch}\\^&`, field: ch };
  if (role === "repeat") return { header: `H|${ch}^&`, field: "|" };
  return { header: `H|\\${ch}&`, field: "|" };
};

/**
 * The committed corpus stream: a comment record, whose text field carries components and repeats
 * without any of them meaning anything clinically, so the only codes a tuple raises are the escape
 * codes and the declaration's own. The contested delimiter is the swept character itself, placed
 * immediately after a triple and followed by the escape character, which is the shape that makes two
 * alignments exist at all.
 */
const corpusStream = (
  set: DeclaredSet,
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
  readonly declaration: string;
  readonly role: (typeof SPLITTING_ROLES)[number];
  readonly body: string;
  readonly tail: (typeof TAIL_SUFFIXES)[number]["name"];
  readonly raw: string;
  /** What the shipped package reports today. Observed, never predicted. */
  readonly reportsAlignment: boolean;
  /** What the candidate criterion would report. A predicate in this file; nothing ships it. */
  readonly candidateReports: boolean;
  /** Accepted today, on the tier. Observed. */
  readonly acceptedNow: boolean;
  /**
   * Accepted if the candidate were in force. The candidate would change only which tuples raise the
   * alignment code, so the observed list with that code dropped, plus the candidate's own answer,
   * reconstructs the disposition exactly.
   */
  readonly acceptedUnderCandidate: boolean;
  /** No code says anything is wrong with this stream's escaping. */
  readonly escapeClean: boolean;
}

/**
 * **The candidate criterion, transcribed and not shipped.** It counts the constructs each alignment
 * interprets at the contested position: the leftmost side interprets one where its body is a
 * recognized mnemonic, the competing side interprets one where the delimiter is. It reports unless
 * the leftmost side reads strictly more. The structural precondition (a delimiter with an escape
 * character two positions past it) holds by construction everywhere in this corpus.
 */
const candidateReports = (body: string, contested: string): boolean =>
  (isMnemonic(body) ? 1 : 0) <= (isMnemonic(contested) ? 1 : 0);

const corpus: readonly Tuple[] = DECLARATION_ALPHABET.flatMap((declaration) =>
  SPLITTING_ROLES.flatMap((role) =>
    BODY_ALPHABET.flatMap((body) =>
      TAIL_SUFFIXES.map((tail): Tuple => {
        const set = declaredSet(declaration, role);
        const raw = corpusStream(set, declaration, body, tail.suffix);
        const seen = codes(raw);
        const candidate = candidateReports(body, declaration);
        const othersTolerable = seen
          .filter((c) => c !== ALIGNMENT)
          .every((c) => TOLERABLE_CODES.has(c));
        return {
          declaration,
          role,
          body,
          tail: tail.name,
          raw,
          reportsAlignment: seen.includes(ALIGNMENT),
          candidateReports: candidate,
          acceptedNow: acceptedUnderMaximalTolerance(raw),
          acceptedUnderCandidate: othersTolerable && !candidate,
          escapeClean: !seen.some((c) => (ESCAPE_DEVIATION_CODES as readonly string[]).includes(c)),
        };
      }),
    ),
  ),
);

const mnemonicDeclarations = DECLARATION_ALPHABET.filter(isMnemonic).length;
const otherDeclarations = DECLARATION_ALPHABET.length - mnemonicDeclarations;
const mnemonicBodies = BODY_ALPHABET.filter(isMnemonic).length;
const otherBodies = BODY_ALPHABET.length - mnemonicBodies;
const sets = DECLARATION_ALPHABET.length * SPLITTING_ROLES.length;
/** The one tail whose bytes carry no escape deviation of their own. */
const cleanTails = 1;
/**
 * **The base under this corpus has moved three times since these figures were first taken, and it
 * moved on purpose every time.** Three codes shipped afterwards, each asking a different question
 * about the same contested position: what does the reading taken make of the bytes AFTER the
 * boundary. `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS` is wired to the **field** split,
 * `ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD` to the **repeat** split, and
 * `ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS` to the **component** split. All three fire only where
 * the escape character the reading resumes on heads no sequence, so each covers exactly one role
 * and one tail of this corpus, and the three columns are mutually disjoint. Every count is derived
 * from the corpus constants rather than written down, so a later axis moves them with it. **All
 * three splitting roles are wired now, so this constant has reached its ceiling: there is no fourth
 * role, because nothing splits on the escape role.**
 *
 * Every figure below that names an acceptance is re-derived against that, rather than left quoting
 * a base that no longer exists. **Never quote one of these numbers against a different sha.**
 * **These are the base, not the candidate**: the candidate is still the predicate transcribed in
 * this file and it still ships nowhere.
 */
const tailRoles = SPLITTING_ROLES.length;
const tailTails = 1;

describe("the corpus, and the axis that decides the answer", () => {
  it("sweeps every declared set, every body and every tail, and every set resolves", () => {
    expect(corpus).toHaveLength(sets * BODY_ALPHABET.length * TAIL_SUFFIXES.length);
    // A declaration this reader could not resolve throws rather than parsing, so building the corpus
    // at all is the proof every set resolved. What is asserted here is that each stream reached the
    // carrier record and was read with the set it declared.
    for (const t of corpus) {
      const parsed = parseAstmRecords(t.raw);
      expect(parsed.records).toHaveLength(4);
      expect(parsed.records[2]?.type).toBe("C");
      expect(codes(t.raw)).not.toContain(WARNING_CODES.ASTM_RECORD_FIELDS_UNSEPARATED);
    }
  });

  it("contains streams whose escaping is entirely well-formed, which is what the tail axis is for", () => {
    // The negative control, and the finding that rejected the candidate. Escape-clean means both
    // triples are recognized and no escape character is left bare: exactly a mnemonic body against
    // the recognized tail, whatever the declared set. A corpus fixing the tail to a bare escape
    // character has NONE of these, so it cannot observe a criterion refusing one, and would report a
    // comforting zero rather than a wrong answer.
    const clean = corpus.filter((t) => t.escapeClean);
    expect(clean).toHaveLength(sets * mnemonicBodies * cleanTails);
    for (const t of clean) {
      expect(isMnemonic(t.body)).toBe(true);
      expect(t.tail).toBe("a recognized sequence");
    }
    // Today not one of them is reported, which is the property a candidate must not break.
    expect(clean.filter((t) => t.reportsAlignment)).toHaveLength(0);
  });

  it("checks the transcribed candidate against the shipped reader where they must agree", () => {
    // The anti-strawman check. Wherever the contested delimiter is not a mnemonic letter the
    // competing alignment interprets nothing, the candidate's count reduces to the shipped
    // recognition test, and the two must give the same answer on every tuple. If the transcription
    // had drifted, every delta below would be an artifact of this file rather than of the package.
    const mustAgree = corpus.filter((t) => !isMnemonic(t.declaration));
    expect(mustAgree).toHaveLength(
      otherDeclarations * SPLITTING_ROLES.length * BODY_ALPHABET.length * TAIL_SUFFIXES.length,
    );
    for (const t of mustAgree) {
      expect(t.reportsAlignment).toBe(t.candidateReports);
    }
    // And it must disagree somewhere, or there is nothing to measure.
    expect(corpus.some((t) => t.reportsAlignment !== t.candidateReports)).toBe(true);
  });
});

describe("the population the candidate criterion would move, on the strict-accepted tier", () => {
  it("is a strict superset of what is reported today: nothing would stop being reported", () => {
    for (const t of corpus) {
      if (t.reportsAlignment) expect(t.candidateReports).toBe(true);
    }
    expect(corpus.filter((t) => t.reportsAlignment)).toHaveLength(
      sets * otherBodies * TAIL_SUFFIXES.length,
    );
    expect(corpus.filter((t) => t.candidateReports)).toHaveLength(
      (mnemonicDeclarations * SPLITTING_ROLES.length * BODY_ALPHABET.length +
        otherDeclarations * SPLITTING_ROLES.length * otherBodies) *
        TAIL_SUFFIXES.length,
    );
  });

  it("moves exactly the tuples where both contested triples are recognized, and none back", () => {
    const moved = corpus.filter((t) => t.acceptedNow && !t.acceptedUnderCandidate);
    const back = corpus.filter((t) => !t.acceptedNow && t.acceptedUnderCandidate);
    // Each figure is the one this corpus gave before the two tail reports shipped, LESS the tuples
    // those reports now refuse: their two roles against their one tail, on the recognized bodies
    // (the unrecognized ones were already refused by the alignment code either way).
    expect(corpus.filter((t) => t.acceptedNow)).toHaveLength(
      sets * mnemonicBodies * TAIL_SUFFIXES.length -
        DECLARATION_ALPHABET.length * tailRoles * mnemonicBodies * tailTails,
    );
    expect(corpus.filter((t) => t.acceptedUnderCandidate)).toHaveLength(
      otherDeclarations * SPLITTING_ROLES.length * mnemonicBodies * TAIL_SUFFIXES.length -
        otherDeclarations * tailRoles * mnemonicBodies * tailTails,
    );
    expect(moved).toHaveLength(
      mnemonicDeclarations * SPLITTING_ROLES.length * mnemonicBodies * TAIL_SUFFIXES.length -
        mnemonicDeclarations * tailRoles * mnemonicBodies * tailTails,
    );
    expect(back).toHaveLength(0);
    for (const t of moved) {
      expect(isMnemonic(t.declaration)).toBe(true);
      expect(isMnemonic(t.body)).toBe(true);
    }
  });

  it("cannot be reached without a nonstandard declaration, which is the one bound that held", () => {
    // The part of the candidate's case that survived. Reaching the moved population at all requires
    // declaring a mnemonic letter as a splitting delimiter, so no sender on the canonical set is
    // affected either way.
    for (const t of corpus.filter((x) => x.acceptedNow && !x.acceptedUnderCandidate)) {
      expect(codes(t.raw)).toContain(WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS);
    }
  });
});

describe("why the candidate is rejected rather than shipped", () => {
  it("would refuse streams whose escaping is entirely well-formed, and here is how many", () => {
    // THE FINDING. A third of the tuples the candidate moves are escape-clean: every escape
    // character in them heads a sequence this codec recognizes, and no delimiter went missing
    // inside an unreadable body. Today none of them is reported, on a definition that does not
    // consult the alignment code (though see that definition for why the zero is still entailed
    // rather than observed, and is evidence about the candidate, not about the shipped criterion).
    // Under the candidate, every
    // escape-clean tuple whose declared set names a mnemonic letter as a splitting delimiter would
    // be refused by a code no profile may tolerate.
    const moved = corpus.filter((t) => t.acceptedNow && !t.acceptedUnderCandidate);
    const overRefused = moved.filter((t) => t.escapeClean);
    expect(overRefused).toHaveLength(
      mnemonicDeclarations * SPLITTING_ROLES.length * mnemonicBodies * cleanTails,
    );
    // Which is exactly half of every escape-clean stream in the corpus.
    expect(overRefused).toHaveLength(corpus.filter((t) => t.escapeClean).length / 2);
    for (const t of overRefused) {
      expect(t.tail).toBe("a recognized sequence");
      expect(t.reportsAlignment).toBe(false);
    }
  });

  it("scores a tie on bytes where the leftmost alignment plainly reads more of them", () => {
    // The named counterexample, pinned so the argument cannot be re-derived from memory. Under
    // `HF\^&`, where `F` is the FIELD separator, the text carries `&F&` (the sender escaping that
    // separator), then the separator itself, then `&F&` again. The reading taken interprets BOTH
    // sequences and leaves no escape character bare, which is why the parse raises no escape
    // deviation at all. The candidate's count sees only the contested pair, reads one against one,
    // and would refuse it under a code no profile may tolerate.
    const wellFormed = "HF\\^&\rPF1FFLAB-0001\rCF1FIF28.6&F&F&F&U/LFG\rLF1FN\r";
    expect(codes(wellFormed)).toEqual([WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS]);
    expect(acceptedUnderMaximalTolerance(wellFormed)).toBe(true);
    expect(candidateReports("F", "F")).toBe(true);
    // Both escape sequences survive into the split, decoded to the separator each stood for, which
    // is the mechanism working rather than a residue of it.
    const record = parseAstmRecords(wellFormed).records[2];
    expect(record?.fields.map((f) => f.raw)).toEqual(["C", "1", "I", "28.6&F&", "&F&U/L", "G"]);
    expect(record?.fields[3]?.repeats).toEqual([["28.6F"]]);
    // The count is taken over the two contested triples only, while the alignments also disagree
    // about every byte after the boundary. That is the defect in the criterion, not in the corpus.
    expect(corpus.some((t) => t.raw === wellFormed)).toBe(true);
  });

  it("names the case it left open, WHICH A TAIL-WEIGHING CRITERION HAS SINCE CLOSED", () => {
    // What rejecting the candidate left broken, and what closed it afterwards. Under `H|F^&` the
    // contested delimiter is the REPEAT role, so the gained boundary divides one field and reaches
    // nothing outside it: the units and status slots read empty under every alignment of these
    // bytes, and the role is the reason that generalizes, not the field count. Saying the gained
    // boundary "costs the units and the status" attributes to it something it cannot reach, and
    // that reading was measured false here.
    const harm = "H|F^&\rP|1||LAB-0001\rR|1|^^^687|28.6&S&F&U/L||||F\rL|1|N\r";
    const record = parseAstmRecords(harm).records[2];
    expect(record?.fields).toHaveLength(8);

    // WHAT IT DOES COST IS THE VALUE, and that was the silent loss. The reading taken splits the
    // value field into two repeats and every value extractor reads the first, so `&U/L` leaves the
    // result entirely. The competing alignment reads the same bytes as one repeat carrying all of
    // it. Neither is forced by the bytes.
    const [only] = results(parseAstmRecords(harm));
    expect(only?.value).toBe("28.6^");
    expect(record?.fields[3]?.repeats).toEqual([["28.6^"], ["&U/L"]]);
    expect(only?.units).toBeUndefined();
    expect(only?.status.meaning).toBe("unspecified");

    // ── AND THIS IS NO LONGER SILENT. The criterion that closed it is exactly the one this file's
    // rejection pointed at: weigh the TAIL rather than the contested pair, taken on the repeat
    // split, under a code of its own. The reading is untouched (every assertion above still holds
    // byte for byte), and what changed is that a gate-legal profile no longer accepts it.
    expect(codes(harm)).toEqual([
      WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS,
      WARNING_CODES.ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD,
      WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER,
    ]);
    expect(acceptedUnderMaximalTolerance(harm)).toBe(false);

    // The candidate would also have caught it, and that is not what was wrong with the candidate.
    // What separates this case from the counterexample above is not the contested pair, which is a
    // tie in both, but the tail: here the escape character past the boundary heads nothing, there
    // it heads a recognized sequence. The counterexample is still accepted, which is the whole
    // point of having weighed the tail instead of counting the pair.
    expect(candidateReports("S", "F")).toBe(true);
    const wellFormed = "HF\\^&\rPF1FFLAB-0001\rCF1FIF28.6&F&F&F&U/LFG\rLF1FN\r";
    expect(acceptedUnderMaximalTolerance(wellFormed)).toBe(true);
  });
});

describe("the canonical set is untouched by either criterion, tuple for tuple", () => {
  /** The canonical set's three splitting roles. None of them is a mnemonic letter, which is the point. */
  const CANONICAL_SPLITTING = ["|", "\\", "^"] as const;

  it("gives the same answer under both, so nothing a canonical sender writes is in question", () => {
    let checked = 0;
    for (const contested of CANONICAL_SPLITTING) {
      for (const body of BODY_ALPHABET) {
        for (const tail of TAIL_SUFFIXES) {
          const raw = `H|\\^&\rP|1||LAB-0001\rC|1|I|28.6&${body}&${contested}&${tail.suffix}|G\rL|1|N\r`;
          expect(codes(raw).includes(ALIGNMENT)).toBe(candidateReports(body, contested));
          checked += 1;
        }
      }
    }
    expect(checked).toBe(CANONICAL_SPLITTING.length * BODY_ALPHABET.length * TAIL_SUFFIXES.length);
    expect(CANONICAL_SPLITTING.filter(isMnemonic)).toHaveLength(0);
  });
});
