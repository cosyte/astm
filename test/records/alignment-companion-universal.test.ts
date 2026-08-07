/**
 * The companion universal is **false**, and this file is the axis that shows it.
 *
 * The three tail codes rest on one defence against over-refusal: a stream whose escaping raises
 * nothing can never be refused because of them, because firing requires an escape character heading
 * no sequence this codec can interpret, and each of those is a deviation the package already reports
 * on its own (`ASTM_UNPAIRED_ESCAPE_CHARACTER` where it heads nothing,
 * `ASTM_UNKNOWN_ESCAPE_SEQUENCE` where it heads an unrecognized body). That defence was written as a
 * universal over the whole firing population, and asserted as one.
 *
 * **IT IS NOT A UNIVERSAL. THE CORPORA THAT ASSERTED IT ALL FIX THE ESCAPE ROLE.** Every measurement
 * in this family declares its swept character into one of the three splitting roles and leaves the
 * escape role at `&`, so none of them can see a declaration that names the escape character in a
 * splitting role too. On such a set the splitting pass consumes the character before the escape
 * decode reaches it, so the triple never becomes a sequence anybody reports: a tail code fires with
 * **neither** escape companion anywhere in the stream. That population is swept below and it is not
 * empty.
 *
 * **WHAT REPLACES THE UNIVERSAL, AND IT IS WEAKER IN EXACTLY ONE PLACE.** A tail code still never
 * fires alone. Where the escape role is a character distinct from the three splitting roles, one of
 * the two escape companions fires beside it, tuple for tuple, which is asserted here on the whole
 * distinct arm. Where it is not distinct, neither may fire, and the declaration itself is reported
 * by `ASTM_RECORD_DELIMITER_ROLE_COLLISION`, which no profile may tolerate. So the defence survives
 * in the only form it was ever needed in: **no stream whose escaping and whose declaration are both
 * clean is refused by a tail code.** What does not survive is the sentence, and the sentence was on
 * consumer surfaces.
 *
 * **THE COLLISION IS REPORTED ONCE PER SET CHANGE, NOT ONCE PER RECORD, AND THAT IS THE SHARP EDGE.**
 * A second header re-declaring the same colliding set raises nothing, while the tail codes in its
 * message fire again. A consumer scoping warnings to a message therefore sees a tail code standing
 * entirely alone, with no companion and no collision inside that message's own record range. The
 * stream-scoped statement above is true; the per-message one is not, and the difference is measured
 * below rather than left to be found.
 *
 * **THE FIELD ROLE CANNOT COLLIDE WITH THE ESCAPE ROLE AT ALL**, so the swept collision arm has two
 * roles and not three. The delimiter declaration is read as the three characters following the field
 * separator and stops at the next occurrence of that separator, so a set naming the escape character
 * as the field separator terminates its own declaration one character short and the header is
 * refused. That is asserted here rather than assumed, because "three splitting roles" would
 * otherwise read as three reachable collisions.
 *
 * **WHICH SPLIT GAINS THE BOUNDARY IS A DIFFERENT AXIS FROM WHICH ROLE THE COLLISION IS IN, AND THE
 * FIRST TWO ARMS OF THIS FILE HELD IT FIXED.** The role a declaration puts the swept character in
 * decides where the collision is; the role of the delimiter the contested reading gains a boundary
 * on decides which of the three tail codes fires. They are independent. The two arms above carry the
 * swept character inside a single field of the carrier, so no field boundary is ever in contest and
 * `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS` is observed **zero** times in either of them, which is
 * asserted below rather than left to be noticed. Its orphan population was therefore not measured by
 * the corpus whose zeros certify the correction, even though the correction is stated over all three
 * codes. The two field arms sweep that axis: the collision stays in the repeat or component role,
 * where it is expressible, and the gained boundary is on the **field** separator, which the swept
 * character never is. That is what makes a `SHIFTED_FIELDS` orphan reachable at all, and it is why
 * the field role being uncollidable does not put the field **code** out of reach.
 *
 * **It is a report, not a repair, and no guard moves in this file.** No code is added, removed or
 * renamed, no split changes, no extracted value moves, and no stream's disposition changes: every
 * tuple in the orphan class is already refused by the untolerable collision code, before and after.
 * What changes is the claim.
 *
 * All fixtures are **synthetic**, including the identifiers. No clause of ASTM E1394 / CLSI LIS01 /
 * LIS02 is claimed anywhere here: the atom rule, the mnemonic set, the leftmost match and the
 * declaration reader are all this package's own codec.
 */

import { describe, expect, it } from "vitest";

import {
  AstmStrictError,
  defineAstmProfile,
  parseAstmRecords,
  TOLERABLE_CODES,
  WARNING_CODES,
} from "../../src/index.js";

const SHIFT = WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS;
const TRUNCATED = WARNING_CODES.ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD;
const COMPONENTS = WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS;
const COLLISION = WARNING_CODES.ASTM_RECORD_DELIMITER_ROLE_COLLISION;

/** The three tail codes, one per splitting role. There is no fourth: nothing splits on the escape role. */
const TAIL_CODES: readonly string[] = [SHIFT, TRUNCATED, COMPONENTS];

/**
 * The two tolerable escape reports the retired universal named. A tuple raising neither of these
 * beside a tail code is an **orphan**, and the retired sentence said there were none.
 */
const ESCAPE_COMPANIONS: readonly string[] = [
  WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER,
  WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
];

const codes = (raw: string): readonly string[] => parseAstmRecords(raw).warnings.map((w) => w.code);

/**
 * The widest profile the safety gate permits, built **from** the allow-list so it cannot drift out
 * of step with it.
 *
 * **This is also the harness's negative control**, the standing one for this family: it is
 * constructed by spreading this package's own `TOLERABLE_CODES`, so a copy of this file pointed at a
 * sibling parser fails loudly on that spread rather than reporting a figure against the wrong
 * package.
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

/** The committed declaration alphabet, the same one every other measurement in this family sweeps. */
const DECLARATION_ALPHABET = ["F", "S", "R", "E", "~", ":", "#", "*"] as const;

/**
 * The two splitting roles a collision with the escape role is **expressible** in. The field role is
 * absent by construction, not by choice, and the arm below proves it.
 */
const COLLIDABLE_ROLES = ["repeat", "component"] as const;

/** The committed body alphabet: the four mnemonics, the four canonical delimiters, four others. */
const BODY_ALPHABET = ["F", "S", "R", "E", "|", "\\", "^", "&", "~", ":", "#", "*"] as const;

const MNEMONICS = ["F", "S", "R", "E"] as const;
const isMnemonic = (ch: string): boolean => (MNEMONICS as readonly string[]).includes(ch);

const ROLE_CODE = { repeat: TRUNCATED, component: COMPONENTS } as const;

/**
 * The declared set for a role, in the two arms this file contrasts. `distinct` leaves the escape
 * role at the canonical `&` exactly as every other corpus in this family does; `collides` puts the
 * swept character in the escape role **as well**, which is the axis they all fix.
 */
const declaredSet = (
  ch: string,
  role: (typeof COLLIDABLE_ROLES)[number],
  arm: "distinct" | "collides",
): { readonly header: string; readonly escape: string } => {
  const escape = arm === "collides" ? ch : "&";
  return {
    header: role === "repeat" ? `H|${ch}^${escape}` : `H|\\${ch}${escape}`,
    escape,
  };
};

/**
 * The carrier both arms use: a comment record, whose text field carries repeats and components
 * without any of them meaning anything clinically, so the only codes a tuple raises are the escape
 * codes and the declaration's own. Same carrier as every measurement this family has taken, so the
 * populations stay directly comparable.
 */
const carrier = (header: string, text: string): string =>
  `${header}\r` + `P|1||LAB-0001\r` + `C|1|I|${text}|G\r` + `L|1|N\r`;

/**
 * **THE TWO ARMS ARE NOT THE SAME SHAPE, AND THAT IS FORCED BY THE COLLISION, NOT CHOSEN.** On a
 * distinct set the contested construct has independent axes: an escape sequence, the delimiter it
 * abuts, and the sequence past that delimiter, so the body and the tail body can be swept against
 * each other. On a colliding set the escape character and the splitting delimiter are the **same
 * byte**, so those axes are one axis: what varies is the length of the run of that byte. Sweeping
 * the collides arm on the distinct arm's shape would hold its only real axis fixed, which is exactly
 * the mistake this file exists to correct. Each arm is therefore swept on its own geometry and the
 * comparison between them is made on the disposition, never on the shape.
 */
interface Tuple {
  readonly declaration: string;
  readonly role: (typeof COLLIDABLE_ROLES)[number];
  readonly arm: "distinct" | "collides";
  /**
   * Which split the contested reading gains its boundary on, which is what decides the tail code.
   * `tail` gains it on the role the swept character was declared into; `field` gains it on the field
   * separator, so the code observed is `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS`.
   */
  readonly axis: "tail" | "field";
  readonly raw: string;
  /** Observed, never predicted. */
  readonly seen: readonly string[];
  /** The one code this tuple is measuring, decided by the axis and not by the declaration alone. */
  readonly observed: string;
  readonly fires: boolean;
  /** Any of the three tail codes fired, whichever this tuple was built to observe. */
  readonly anyTail: boolean;
  /** A tail code fired and neither escape companion did. The retired universal denied these exist. */
  readonly orphan: boolean;
  readonly collides: boolean;
}

const tupleOf = (
  declaration: string,
  role: (typeof COLLIDABLE_ROLES)[number],
  arm: "distinct" | "collides",
  text: string,
  axis: "tail" | "field",
): Tuple => {
  const set = declaredSet(declaration, role, arm);
  const raw = carrier(set.header, text);
  const seen = codes(raw);
  const observed = axis === "field" ? SHIFT : ROLE_CODE[role];
  const fires = seen.includes(observed);
  return {
    declaration,
    role,
    arm,
    axis,
    raw,
    seen,
    observed,
    fires,
    anyTail: seen.some((c) => TAIL_CODES.includes(c)),
    orphan: fires && !seen.some((c) => ESCAPE_COMPANIONS.includes(c)),
    collides: seen.includes(COLLISION),
  };
};

/**
 * The **distinct** arm, on this family's standard contested construct: a value, an escape sequence,
 * the delimiter the split is taken on, the sequence past it, and a trailing literal. The escape role
 * stays at `&` and the swept character goes into the splitting role, exactly as every other corpus
 * in this family builds it.
 */
const distinctCorpus: readonly Tuple[] = DECLARATION_ALPHABET.flatMap((ch) =>
  COLLIDABLE_ROLES.flatMap((role) =>
    BODY_ALPHABET.flatMap((body) =>
      BODY_ALPHABET.map((tailBody) =>
        tupleOf(ch, role, "distinct", `28.6&${body}&${ch}&${tailBody}&U/L`, "tail"),
      ),
    ),
  ),
);

/** The literal contexts the run is embedded in, so a firing tuple is not an artifact of a bare field. */
const PREFIXES = ["", "28.6", "GLU"] as const;
const SUFFIXES = ["", "U/L", "L"] as const;

/**
 * The **collides** arm, swept on its own single axis: the length of the run of the collided byte.
 * The range starts at 3, the shortest run that can be a sequence at all, and runs to 9, two past the
 * point where a second construct starts.
 */
const RUN_LENGTHS = [3, 4, 5, 6, 7, 8, 9] as const;

const collidesCorpus: readonly Tuple[] = DECLARATION_ALPHABET.flatMap((ch) =>
  COLLIDABLE_ROLES.flatMap((role) =>
    RUN_LENGTHS.flatMap((n) =>
      PREFIXES.flatMap((prefix) =>
        SUFFIXES.map((suffix) =>
          tupleOf(ch, role, "collides", `${prefix}${ch.repeat(n)}${suffix}`, "tail"),
        ),
      ),
    ),
  ),
);

/**
 * The **field** axis, which both arms above hold fixed. The contested construct is a run of the
 * declared escape character, then the **field separator**, then a shorter run of the same character:
 * the reading taken closes a triple, takes the separator as a boundary and resumes on the tail,
 * while the competing reading opens its triple one character later and swallows the separator whole.
 * The tail run is deliberately short, because a run of three or more is itself a triple whose body
 * is a recognized mnemonic and is therefore the excluded tail.
 *
 * **The payload is built from the DECLARED escape character, never from a hardcoded `&`.** That is
 * the trap this file already caught once: an arm that carries a character the header did not declare
 * into the escape role is measuring a different package, and reports a comforting zero.
 */
const HEAD_RUNS = [3, 4, 5] as const;
const TAIL_RUNS = [1, 2, 3] as const;

const fieldArm = (arm: "distinct" | "collides"): readonly Tuple[] =>
  DECLARATION_ALPHABET.flatMap((ch) =>
    COLLIDABLE_ROLES.flatMap((role) => {
      const { escape } = declaredSet(ch, role, arm);
      return HEAD_RUNS.flatMap((n) =>
        TAIL_RUNS.flatMap((m) =>
          PREFIXES.flatMap((prefix) =>
            SUFFIXES.map((suffix) =>
              tupleOf(
                ch,
                role,
                arm,
                `${prefix}${escape.repeat(n)}|${escape.repeat(m)}${suffix}`,
                "field",
              ),
            ),
          ),
        ),
      );
    }),
  );

/** The field axis with the escape role left at `&`, which is the two-sided control's other side. */
const fieldDistinctCorpus: readonly Tuple[] = fieldArm("distinct");

/** The field axis with the escape role collided into the declared splitting role. */
const fieldCollidesCorpus: readonly Tuple[] = fieldArm("collides");

const corpus: readonly Tuple[] = [
  ...distinctCorpus,
  ...collidesCorpus,
  ...fieldDistinctCorpus,
  ...fieldCollidesCorpus,
];

describe("the corpus itself, or its zeros certify nothing", () => {
  it("sweeps the escape role, which is the axis every other corpus in this family fixes", () => {
    // Both arms have to be populated and both have to FIRE, or the contrast below is vacuous. This
    // is the mistake the tail-body corpus already made once on this question, by fixing the axis it
    // was measuring.
    // Populations derived from the alphabets, never typed in.
    expect(distinctCorpus).toHaveLength(
      DECLARATION_ALPHABET.length * COLLIDABLE_ROLES.length * BODY_ALPHABET.length ** 2,
    );
    expect(collidesCorpus).toHaveLength(
      DECLARATION_ALPHABET.length *
        COLLIDABLE_ROLES.length *
        RUN_LENGTHS.length *
        PREFIXES.length *
        SUFFIXES.length,
    );
    for (const arm of [fieldDistinctCorpus, fieldCollidesCorpus]) {
      expect(arm).toHaveLength(
        DECLARATION_ALPHABET.length *
          COLLIDABLE_ROLES.length *
          HEAD_RUNS.length *
          TAIL_RUNS.length *
          PREFIXES.length *
          SUFFIXES.length,
      );
    }
    for (const arm of [distinctCorpus, collidesCorpus, fieldDistinctCorpus, fieldCollidesCorpus]) {
      expect(arm.filter((t) => t.fires).length).toBeGreaterThan(0);
    }
    // The arms must actually differ in the declaration they emit, or "collides" is a relabelling.
    expect(declaredSet("F", "repeat", "distinct")).toEqual({ header: "H|F^&", escape: "&" });
    expect(declaredSet("F", "repeat", "collides")).toEqual({ header: "H|F^F", escape: "F" });
  });

  it("reports the collision on exactly the colliding arm, so the arm label is the parser's, not ours", () => {
    // The label is checked against the package's own reading of the declaration rather than against
    // the string this file built, so a corpus that mislabels an arm cannot pass.
    for (const t of corpus) expect(t.collides).toBe(t.arm === "collides");
  });

  it("observes the field code nowhere in the two arms that used to be the whole corpus", () => {
    // THE BLIND SPOT, MEASURED RATHER THAN DESCRIBED. The correction this file certifies is stated
    // over all three tail codes, and for a while the corpus carrying it never once observed
    // `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS`: both arms keep the contested construct inside a single
    // field of the carrier, so no field boundary is ever in contest. This assertion reds if either
    // of those two arms ever starts reaching the field split, which would mean the field arms below
    // are no longer the only thing measuring it.
    for (const t of [...distinctCorpus, ...collidesCorpus]) {
      expect({ raw: t.raw, sawFieldCode: false }).toEqual({
        raw: t.raw,
        sawFieldCode: t.seen.includes(SHIFT),
      });
    }
    // And the field arms observe exactly that code, or they are measuring the same axis again under
    // a different name.
    for (const t of [...fieldDistinctCorpus, ...fieldCollidesCorpus])
      expect(t.observed).toBe(SHIFT);
    for (const t of [...distinctCorpus, ...collidesCorpus]) expect(t.observed).not.toBe(SHIFT);
  });
});

describe("the retired universal, refuted", () => {
  it("pins this file's own corpus figures", () => {
    // `#defect-12`'s standing trap is that a corpus moves every figure, so name the corpus by a
    // constant that is IN THE TREE: these are `distinctCorpus`, `collidesCorpus`,
    // `fieldDistinctCorpus` and `fieldCollidesCorpus` above.
    expect(distinctCorpus).toHaveLength(2304);
    expect(distinctCorpus.filter((t) => t.fires)).toHaveLength(1536);
    expect(distinctCorpus.filter((t) => t.orphan)).toHaveLength(0);

    expect(collidesCorpus).toHaveLength(1008);
    expect(collidesCorpus.filter((t) => t.fires)).toHaveLength(648);
    expect(collidesCorpus.filter((t) => t.orphan)).toHaveLength(288);

    // The field axis, on the same footing. These are the figures for the population the two arms
    // above cannot reach, and they are pinned rather than bounded so that a drift reds the suite.
    expect(fieldDistinctCorpus).toHaveLength(1296);
    expect(fieldDistinctCorpus.filter((t) => t.fires)).toHaveLength(432);
    expect(fieldDistinctCorpus.filter((t) => t.orphan)).toHaveLength(0);

    expect(fieldCollidesCorpus).toHaveLength(1296);
    expect(fieldCollidesCorpus.filter((t) => t.fires)).toHaveLength(360);
    expect(fieldCollidesCorpus.filter((t) => t.orphan)).toHaveLength(144);

    // The property the whole correction turns on, over the union.
    expect(corpus.filter((t) => t.orphan && !t.collides)).toHaveLength(0);
  });

  it("fires a tail code with neither escape companion, which the universal said was unreachable", () => {
    const orphans = corpus.filter((t) => t.orphan);
    expect(orphans).toHaveLength(288 + 144);
    // Every one of them is on the colliding arm. That is the whole scope of the correction: the
    // sentence is true wherever the escape role is a character distinct from the three splitting
    // roles, and false only where it is not.
    for (const t of orphans) expect(t.arm).toBe("collides");
    // And the orphan class is not confined to the two codes the first two arms observe. Each of the
    // three is reached by at least one orphan, which is what the file's zeros now certify over.
    for (const code of TAIL_CODES) {
      expect({ code, reached: true }).toEqual({
        code,
        reached: orphans.some((t) => t.observed === code),
      });
    }
  });

  it("holds tuple for tuple wherever the escape role is distinct, which is where it is now scoped", () => {
    // The corrected sentence, asserted on the arm it now claims rather than on the population it
    // used to claim. Not a count: the observed disposition of every firing tuple.
    for (const t of corpus.filter((x) => x.arm === "distinct" && x.fires)) {
      expect({ raw: t.raw, hasCompanion: true }).toEqual({
        raw: t.raw,
        hasCompanion: t.seen.some((c) => ESCAPE_COMPANIONS.includes(c)),
      });
    }
  });

  it("names one measured orphan in full, so the class is reproducible without the sweep", () => {
    // The declaration names `F` as the component separator AND as the escape character, so one byte
    // both opens a sequence and ends a component. A run of five is then a contested construct whose
    // every character the splitting pass has already claimed, and the escape reporters never see a
    // sequence to complain about. The tail code fires; neither companion does.
    const raw = "H|\\FF\rP|1||LAB-0001\rR|1|FFFFF|28.6|U/L||||F\rL|1|N\r";
    const seen = codes(raw);
    expect(seen).toContain(COMPONENTS);
    expect(seen).toContain(COLLISION);
    for (const companion of ESCAPE_COMPANIONS) expect(seen).not.toContain(companion);
    // A run of seven under the same set is NOT an orphan, which is recorded because it shows the
    // class is a property of the run's geometry rather than of the declaration alone.
    expect(codes("H|\\FF\rP|1||LAB-0001\rR|1|FFFFFFF|28.6|U/L||||F\rL|1|N\r")).not.toContain(
      COMPONENTS,
    );
  });

  it("names a field-code orphan in full, on a declaration whose collision is in another role", () => {
    // The population the two original arms could not reach, reproducible by hand. `H|F^F` names `F`
    // as the repeat separator AND as the escape character, so the collision is in the repeat role,
    // while the boundary the readings disagree about is on the FIELD separator, which `F` is not.
    // The reading taken closes `FFF` and takes the `|`; the competing one opens its triple a
    // character later and swallows the `|` whole. The trailing `F` heads no interpretable sequence,
    // so the field code fires, and the repeat split has already claimed every one of those bytes, so
    // neither escape reporter has anything to say.
    const raw = "H|F^F\rP|1||LAB-0001\rC|1|I|FFF|F|G\rL|1|N\r";
    const seen = codes(raw);
    expect(seen).toContain(SHIFT);
    expect(seen).toContain(COLLISION);
    for (const companion of ESCAPE_COMPANIONS) expect(seen).not.toContain(companion);
    // Lengthening the tail run to three makes it a triple whose body is a recognized mnemonic, which
    // is the excluded tail, so the code goes silent. Recorded because it shows the field orphan is a
    // property of the geometry here too, exactly as it is on the run arm above.
    expect(codes("H|F^F\rP|1||LAB-0001\rC|1|I|FFF|FFF|G\rL|1|N\r")).not.toContain(SHIFT);
  });
});

describe("what replaces it, and it is weaker in exactly one place", () => {
  it("never fires a tail code alone: an escape companion or the collision, on every firing tuple", () => {
    // Read on `anyTail` rather than on the code each tuple was BUILT to observe, so a tuple that
    // raises a tail code the arm was not aimed at is inside the claim too. Reading it on `fires`
    // would let exactly that kind of tuple out through the same door this slice is closing.
    for (const t of corpus.filter((x) => x.anyTail)) {
      expect({
        raw: t.raw,
        accompanied: true,
      }).toEqual({
        raw: t.raw,
        accompanied: t.seen.some((c) => ESCAPE_COMPANIONS.includes(c)) || t.collides,
      });
    }
    // And `anyTail` is a strictly wider population than `fires` on this corpus, or the widening
    // above is a no-op dressed up as a strengthening.
    expect(corpus.filter((t) => t.anyTail).length).toBeGreaterThan(
      corpus.filter((t) => t.fires).length,
    );
  });

  it("refuses no stream whose escaping and declaration are both clean, which is the defence", () => {
    // The over-refusal defence, restated on the population it actually covers. A tuple is clean when
    // the package says nothing is wrong with either its escaping or its declaration; the three tail
    // codes are deliberately not consulted, so "clean" does not consult the criterion it judges.
    const clean = corpus.filter(
      (t) =>
        !t.seen.some((c) =>
          [
            ...ESCAPE_COMPANIONS,
            WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE,
            COLLISION,
          ].includes(c),
        ),
    );
    // And a clean tuple needs both bodies recognized, so the population is the mnemonic square of
    // the tail axis's distinct arm. DERIVED from the alphabets, never typed in, and pinned rather
    // than merely bounded: a lower bound of one cannot go red when the population moves, which is
    // the whole defect this slice is closing on its sibling file.
    expect(clean).toHaveLength(
      MNEMONICS.length ** 2 * DECLARATION_ALPHABET.length * COLLIDABLE_ROLES.length,
    );
    expect(clean.filter((t) => t.anyTail)).toHaveLength(0);
    for (const t of clean) expect(t.arm).toBe("distinct");
    for (const t of clean) expect(t.axis).toBe("tail");
  });

  it("changes no stream's disposition, because the collision already refused every orphan", () => {
    // The orphan class is the only place the sentence was wrong, and it costs nothing: the
    // collision code is not tolerable, so the widest gate-legal profile already refused all of it.
    expect(TOLERABLE_CODES.has(COLLISION)).toBe(false);
    for (const t of corpus.filter((x) => x.orphan)) {
      expect(acceptedUnderMaximalTolerance(t.raw)).toBe(false);
    }
  });
});

describe("the collision is reported once per set change, not once per record", () => {
  it("leaves a tail code standing alone inside a second message that re-declares the same set", () => {
    // The sharp edge, and the reason the replacement sentence is scoped to the STREAM. The second
    // header changes nothing, so it raises no collision, while the tail code in its message fires
    // again. A consumer reading warnings per message sees that second one with nothing beside it.
    const orphanRecord = "R|1|FFFFF|28.6|U/L||||F";
    const raw =
      `H|\\FF\rP|1||LAB-0001\r${orphanRecord}\r` + `H|\\FF\rP|2||LAB-0002\r${orphanRecord}\r`;
    const warnings = parseAstmRecords(raw).warnings;

    // One collision for the stream, on the FIRST header, and two tail codes.
    const collisions = warnings.filter((w) => w.code === COLLISION);
    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.position.recordIndex).toBe(0);
    expect(warnings.filter((w) => w.code === COMPONENTS)).toHaveLength(2);

    // The second message is records 3 to 5. Nothing in that range says anything about escaping or
    // about the declaration, and the tail code is there on its own.
    const secondMessage = warnings.filter((w) => (w.position.recordIndex ?? 0) >= 3);
    expect(secondMessage.map((w) => w.code)).toEqual([COMPONENTS]);
  });
});

describe("the field role cannot collide with the escape role, so the arm has two roles", () => {
  it("refuses a declaration that names the escape character as the field separator", () => {
    // Not a judgement and not an exclusion: the declaration is the three characters after the field
    // separator and it stops at the next one, so such a set terminates itself one character short.
    // Swept over the committed alphabet so this is a property of the reader, not of one example.
    for (const ch of DECLARATION_ALPHABET) {
      expect(() => parseAstmRecords(`H${ch}\\^${ch}\rL${ch}1${ch}N\r`)).toThrow();
    }
    // The canonical field separator behaves the same way, which is the case a reader is likeliest
    // to try by hand.
    expect(() => parseAstmRecords("H|\\^|\rL|1|N\r")).toThrow();
  });
});

describe("negative controls, run rather than declared", () => {
  it("fails when the orphan predicate is pointed at the wrong role's code", () => {
    // The corpus wires each role to its own tail code. Pointing the repeat arm at the component
    // code has to change the observed firing population, or the wiring is not being measured.
    const repeats = corpus.filter((t) => t.role === "repeat");
    const byOwnCode = repeats.filter((t) => t.seen.includes(TRUNCATED)).length;
    const byWrongCode = repeats.filter((t) => t.seen.includes(COMPONENTS)).length;
    expect(byOwnCode).toBeGreaterThan(0);
    expect(byWrongCode).not.toBe(byOwnCode);
  });

  it("fails when the collision arm is perturbed back to a distinct escape role", () => {
    // Two-sided: the orphan class must vanish when the collision is removed, and must be non-empty
    // when it is present. A one-sided control passes on a corpus that never collides at all.
    // The collides arm's own geometry, re-run with the escape role moved back to `&` and nothing
    // else changed. The runs are then ordinary literal text under a distinct escape character.
    const perturbed = DECLARATION_ALPHABET.flatMap((ch) =>
      COLLIDABLE_ROLES.flatMap((role) =>
        RUN_LENGTHS.flatMap((n) =>
          PREFIXES.flatMap((prefix) =>
            SUFFIXES.map((suffix) =>
              tupleOf(ch, role, "distinct", `${prefix}${ch.repeat(n)}${suffix}`, "tail"),
            ),
          ),
        ),
      ),
    );
    expect(perturbed.filter((t) => t.orphan)).toHaveLength(0);
    expect(collidesCorpus.filter((t) => t.orphan).length).toBeGreaterThan(0);
    // And the tail codes are the ones being observed on both sides, or the zero above is a zero
    // about nothing.
    expect(TAIL_CODES).toContain(ROLE_CODE.repeat);
    expect(TAIL_CODES).toContain(ROLE_CODE.component);
  });

  it("fails when the field arm is perturbed back to a distinct escape role", () => {
    // The same two-sided control on the axis this slice adds, and it is not the same control: the
    // field arm's payload is built from the DECLARED escape character, so perturbing the role
    // perturbs the bytes with it. That is deliberate. A carrier that kept emitting the collided
    // character while the header declared `&` would carry no escape sequences at all and report a
    // comforting zero, which is the vacuous control this file caught in itself once already.
    expect(fieldDistinctCorpus.filter((t) => t.orphan)).toHaveLength(0);
    expect(fieldCollidesCorpus.filter((t) => t.orphan).length).toBeGreaterThan(0);
    // Both sides have to fire, or the zero is a zero about a population that never reached the code.
    expect(fieldDistinctCorpus.filter((t) => t.fires).length).toBeGreaterThan(0);
    expect(fieldCollidesCorpus.filter((t) => t.fires).length).toBeGreaterThan(0);
  });

  it("fails when the field arm's boundary is measured on the wrong delimiter role", () => {
    // The field arm claims its contested boundary is on the FIELD separator. Rebuilding it with the
    // component separator in place of the `|` has to move the observed population off the field
    // code, or the arm is not measuring the role it names.
    const wrongRole = DECLARATION_ALPHABET.flatMap((ch) =>
      COLLIDABLE_ROLES.flatMap((role) => {
        const { escape } = declaredSet(ch, role, "collides");
        return HEAD_RUNS.flatMap((n) =>
          TAIL_RUNS.map((m) =>
            tupleOf(ch, role, "collides", `${escape.repeat(n)}^${escape.repeat(m)}`, "field"),
          ),
        );
      }),
    );
    expect(wrongRole.filter((t) => t.fires)).toHaveLength(0);
  });

  it("uses a mnemonic set the corpus actually exercises, so the alphabet is not decorative", () => {
    // The mnemonic set decides which tails are excluded. If the corpus never used one of them the
    // exclusion would be untested and the figures above would be measuring a smaller space.
    for (const m of MNEMONICS) expect(BODY_ALPHABET).toContain(m);
    expect(BODY_ALPHABET.filter((c) => !isMnemonic(c)).length).toBeGreaterThan(0);
  });
});
