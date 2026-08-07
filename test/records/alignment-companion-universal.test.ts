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
  readonly raw: string;
  /** Observed, never predicted. */
  readonly seen: readonly string[];
  readonly fires: boolean;
  /** A tail code fired and neither escape companion did. The retired universal denied these exist. */
  readonly orphan: boolean;
  readonly collides: boolean;
}

const tupleOf = (
  declaration: string,
  role: (typeof COLLIDABLE_ROLES)[number],
  arm: "distinct" | "collides",
  text: string,
): Tuple => {
  const set = declaredSet(declaration, role, arm);
  const raw = carrier(set.header, text);
  const seen = codes(raw);
  const fires = seen.includes(ROLE_CODE[role]);
  return {
    declaration,
    role,
    arm,
    raw,
    seen,
    fires,
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
        tupleOf(ch, role, "distinct", `28.6&${body}&${ch}&${tailBody}&U/L`),
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
          tupleOf(ch, role, "collides", `${prefix}${ch.repeat(n)}${suffix}`),
        ),
      ),
    ),
  ),
);

const corpus: readonly Tuple[] = [...distinctCorpus, ...collidesCorpus];

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
    for (const arm of [distinctCorpus, collidesCorpus]) {
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
});

describe("the retired universal, refuted", () => {
  it("pins this file's own corpus figures", () => {
    // `#defect-12`'s standing trap is that a corpus moves every figure, so name the corpus by a
    // constant that is IN THE TREE: these are `distinctCorpus` and `collidesCorpus` above.
    expect(distinctCorpus).toHaveLength(2304);
    expect(distinctCorpus.filter((t) => t.fires)).toHaveLength(1536);
    expect(distinctCorpus.filter((t) => t.orphan)).toHaveLength(0);

    expect(collidesCorpus).toHaveLength(1008);
    expect(collidesCorpus.filter((t) => t.fires)).toHaveLength(648);
    expect(collidesCorpus.filter((t) => t.orphan)).toHaveLength(288);

    // The property the whole correction turns on, over the union.
    expect(corpus.filter((t) => t.orphan && !t.collides)).toHaveLength(0);
  });

  it("fires a tail code with neither escape companion, which the universal said was unreachable", () => {
    const orphans = corpus.filter((t) => t.orphan);
    expect(orphans.length).toBeGreaterThan(0);
    // Every one of them is on the colliding arm. That is the whole scope of the correction: the
    // sentence is true wherever the escape role is a character distinct from the three splitting
    // roles, and false only where it is not.
    for (const t of orphans) expect(t.arm).toBe("collides");
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
});

describe("what replaces it, and it is weaker in exactly one place", () => {
  it("never fires a tail code alone: an escape companion or the collision, on every firing tuple", () => {
    for (const t of corpus.filter((x) => x.fires)) {
      expect({
        raw: t.raw,
        accompanied: true,
      }).toEqual({
        raw: t.raw,
        accompanied: t.seen.some((c) => ESCAPE_COMPANIONS.includes(c)) || t.collides,
      });
    }
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
    expect(clean.length).toBeGreaterThan(0);
    expect(clean.filter((t) => t.fires)).toHaveLength(0);
    // And a clean tuple needs both bodies recognized, so the population is the mnemonic square of
    // the distinct arm. Derived from the alphabets, never typed in.
    for (const t of clean) expect(t.arm).toBe("distinct");
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
              tupleOf(ch, role, "distinct", `${prefix}${ch.repeat(n)}${suffix}`),
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

  it("uses a mnemonic set the corpus actually exercises, so the alphabet is not decorative", () => {
    // The mnemonic set decides which tails are excluded. If the corpus never used one of them the
    // exclusion would be untested and the figures above would be measuring a smaller space.
    for (const m of MNEMONICS) expect(BODY_ALPHABET).toContain(m);
    expect(BODY_ALPHABET.filter((c) => !isMnemonic(c)).length).toBeGreaterThan(0);
  });
});
