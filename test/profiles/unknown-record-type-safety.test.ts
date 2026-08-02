/**
 * `ASTM_RECORD_UNKNOWN_TYPE` and the profile safety allow-list.
 *
 * The allow-list admits a warning code a profile may downgrade. It was chosen on one test: the
 * code has to be structural or syntactic noise that cannot alter, drop, or fabricate an extracted
 * value. `ASTM_RECORD_UNKNOWN_TYPE` passed that test, and still does: an unmodeled record is
 * surfaced verbatim as an unsupported record and no field of it is interpreted.
 *
 * Message grouping then made a record's **type letter** load-bearing. A message runs from an `H`
 * header to its `L` terminator, so grouping decides where a message starts by recognizing the
 * letter, and a header the reader does not recognize as a header opens no message. The two
 * messages either side of it merge into one, and the merged message pairs a patient with results
 * that arrived under a different header. The `ASTM_RECORD_UNKNOWN_TYPE` warning is the only report
 * that the merge happened, so a profile downgrading it quiets the whole signal and a
 * `{ strict: true }` parse then accepts the stream.
 *
 * The code is therefore off the allow-list, and the safety gate is re-checked at the point a
 * warning is downgraded as well as at the point a profile is defined, because `AstmProfile` is a
 * plain interface and a hand-authored literal never passes through the factory. This file measures
 * the merge that motivates all that, pins the classification, and records the re-derivation of the
 * three codes that remain: for each, the same logical stream is read the same way with the
 * condition present and absent, and the comparison is shown to fail for the code that was removed.
 *
 * **The merge is still deliberately not closed.** Recognizing a mangled header *as* a header would
 * mean guessing at a byte the sender did not send, and that guess would split the stream a different
 * way just as silently, so a warning plus a strict refusal remains the honest disposition.
 *
 * Two consequences of the merge that this file used to pin as unfixed have since been addressed,
 * neither by inferring the letter. The merged tail's lost fields are now reported per record with
 * `ASTM_RECORD_FIELDS_UNSEPARATED`, so the value loss is no longer left to be inferred from a letter
 * warning; and message classification no longer answers `results` over a letter it could not read,
 * withholding the kind instead. Both tests below now measure the closure rather than the defect.
 *
 * All fixtures are **synthetic**: the identifiers, names, specimen IDs, and values are invented and
 * correspond to no real person or specimen.
 *
 * Grounding: the `H` … `L` message unit is grounded on `messages()` in `src/records/messages.ts`.
 * No clause is claimed for the allow-list itself, which is this library's own policy, not the
 * standard's.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  ALL_ASTM_WARNING_CODES,
  AstmProfileDefinitionError,
  AstmStrictError,
  SAFETY_CRITICAL_CODES,
  TOLERABLE_CODES,
  WARNING_CODES,
  astmProfiles,
  defineAstmProfile,
  isSafetyCriticalCode,
  messages,
  parseAstmRecords,
  patient,
  results,
  setDefaultAstmProfile,
  type AnyAstmWarningCode,
  type AstmProfile,
} from "../../src/index.js";

/**
 * Two messages. The first names a patient and carries one result; the second is result-only, the
 * `P`-less shape a patient-less result message takes. `h2` is the second message's header line,
 * so the same stream can be built with a clean header and with a header the reader cannot see.
 *
 * The `P`-less second message is what makes this the silent case: the merged message still carries
 * exactly one `P`, so the multi-patient guard has nothing to object to and every accessor answers.
 */
const twoMessages = (h2: string): string =>
  "H|\\^&|||ANALYZER^1\r" +
  "P|1|PRAC-0001|LAB-0001||SYNTHA^ALPHA\r" +
  "O|1|SPEC-0001||^^^687|R\r" +
  "R|1|^^^687|10.0|U/L||N||F\r" +
  "L|1|N\r" +
  h2 +
  "O|1|SPEC-0002||^^^999|R\r" +
  "R|1|^^^999|999.9|U/L||H||F\r" +
  "L|1|N\r";

/** The control: an ordinary second header, recognized, opening its own message. */
const CLEAN = twoMessages("H|\\^&|||ANALYZER^1\r");

/**
 * The same stream with one byte in front of the second header. The line no longer begins with `H`,
 * so its type letter reads as a space and the reader surfaces it as an unsupported record.
 */
const MANGLED = twoMessages(" H|\\^&|||ANALYZER^1\r");

describe("an unrecognized header re-merges two messages", () => {
  it("control: a recognized second header opens its own message, and nothing is warned", () => {
    const msg = parseAstmRecords(CLEAN);
    expect(msg.warnings).toEqual([]);
    const ms = messages(msg);
    expect(ms).toHaveLength(2);
    // One result each: the second message's result belongs to the second message.
    expect(ms[0]?.results).toHaveLength(1);
    expect(ms[1]?.results).toHaveLength(1);
    // Only the first message names a patient. The second is result-only, so it answers undefined.
    expect(ms[0]?.patient).toBeDefined();
    expect(ms[1]?.patient).toBeUndefined();
  });

  it("mangled: the header is surfaced as an unsupported record and opens no message", () => {
    const msg = parseAstmRecords(MANGLED);
    // Nothing is dropped: the record count is identical, one line is just read as a different type.
    expect(msg.records.map((r) => r.type)).toEqual([
      "H",
      "P",
      "O",
      "R",
      "L",
      "unsupported",
      "O",
      "R",
      "L",
    ]);
    expect(messages(msg)).toHaveLength(1);
  });

  it("the merge is the wrong-patient path: one patient acquires the next message's result", () => {
    const merged = messages(parseAstmRecords(MANGLED))[0];
    expect(merged).toBeDefined();
    // The first message's patient, now holding both results. The 999.9 arrived under the header the
    // reader could not see, so on the clean stream it is filed against no patient at all.
    expect(merged?.patients).toHaveLength(1);
    expect(merged?.results).toHaveLength(2);
    expect(merged?.results.map((r) => r.value)).toEqual(["10.0", "999.9"]);
  });

  it("the multi-patient guard cannot catch it: the flat accessors answer without objecting", () => {
    const msg = parseAstmRecords(MANGLED);
    // One message and one P, so neither ambiguity guard fires and both accessors return a value.
    expect(() => patient(msg)).not.toThrow();
    expect(patient(msg)).toBeDefined();
    expect(results(msg)).toHaveLength(2);
  });

  it("the ASTM_RECORD_UNKNOWN_TYPE warning is the entire signal, and strict mode refuses", () => {
    const msg = parseAstmRecords(MANGLED);
    expect(msg.warnings.map((w) => w.code)).toEqual([WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE]);
    expect(msg.warnings[0]?.position).toMatchObject({ recordIndex: 5 });
    expect(() => parseAstmRecords(MANGLED, { strict: true })).toThrow(AstmStrictError);
  });

  /**
   * The cost is not only misattribution. Delimiters are re-read at each `H`, keyed on the same
   * letter, so a header the reader does not recognize does not re-scope them either and the whole
   * following message is tokenized with the previous header's set. Where the two sets differ, the
   * merged tail loses its fields.
   *
   * The loss itself still happens, and still cannot be repaired without guessing which set the
   * sender meant. What is no longer true is that it happens in silence: every record the delimiters
   * in force could not split now carries its own `ASTM_RECORD_FIELDS_UNSEPARATED`, so the reader is
   * told which records lost their fields rather than only that a letter was unreadable.
   */
  it("a mangled header also skips delimiter re-scoping, so the merged tail loses values", () => {
    const first = "H|\\^&|||s\rP|1||LAB-0001\rO|1|SPEC-0001\rR|1|^^^687|10.0|U/L||N||F\rL|1|N\r";
    const second = "*~:#*||*s2\rO*1*SPEC-0002\rR*1*:::688*99.9*mmol/L**H**F\rL*1*N\r";

    const clean = parseAstmRecords(`${first}H${second}`);
    expect(messages(clean)).toHaveLength(2);
    expect(messages(clean).flatMap((m) => m.results.map((r) => r.value))).toEqual(["10.0", "99.9"]);

    const mangled = parseAstmRecords(`${first} H${second}`);
    expect(messages(mangled)).toHaveLength(1);
    // The second result's value, units and status are all gone: its record was split with the
    // first header's delimiters, which do not occur in it.
    const merged = messages(mangled)[0]?.results ?? [];
    expect(merged).toHaveLength(2);
    expect(merged[0]?.value).toBe("10.0");
    expect(merged[1]?.value).toBeUndefined();
    expect(merged[1]?.units).toBeUndefined();
    expect(merged[1]?.status.isActiveFinal).toBe(false);
    // The loss is no longer silent: the unreadable letter is reported, and so is every record the
    // delimiters in force could not split (the tail's `O`, `R` and `L`), each at its own position.
    expect(mangled.warnings.map((w) => w.code)).toEqual([
      WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE,
      WARNING_CODES.ASTM_RECORD_FIELDS_UNSEPARATED,
      WARNING_CODES.ASTM_RECORD_FIELDS_UNSEPARATED,
      WARNING_CODES.ASTM_RECORD_FIELDS_UNSEPARATED,
    ]);
    expect(
      mangled.warnings
        .filter((w) => w.code === WARNING_CODES.ASTM_RECORD_FIELDS_UNSEPARATED)
        .map((w) => w.position.recordType),
    ).toEqual(["O", "R", "L"]);
    // The clean twin, whose header the reader did see, reports none of it.
    expect(clean.warnings.map((w) => w.code)).not.toContain(
      WARNING_CODES.ASTM_RECORD_FIELDS_UNSEPARATED,
    );
    // And strict mode refuses the collapse: the code is safety-critical, so no profile reaches it.
    expect(() => parseAstmRecords(`${first} H${second}`, { strict: true })).toThrow(
      AstmStrictError,
    );
  });

  it("carries no field data in the warning text (value discipline)", () => {
    for (const w of parseAstmRecords(MANGLED).warnings) {
      expect(w.message).not.toContain("999.9");
      expect(w.message).not.toContain("ALPHA");
      expect(w.message).not.toContain("SPEC-0002");
    }
  });
});

/**
 * Segmentation is not the only reader of a record's type letter. `classifyMessage` counts `Q`,
 * `R` and `O` records by letter, and the `Q`-dominates rule (a message carrying a query is never
 * read as a result set) is stated on that count. An unrecognized letter defeats it too, which is a
 * second, independent reason the code cannot be tolerable.
 *
 * The intended letter is still never inferred, because that is the guess this package declines to
 * make. What the classifier does instead is decline the positive answer: an unrecognized letter
 * with no `Q` read alongside it leaves the kind `indeterminate`, so the request no longer reads as
 * a result set. A `Q` that was read still dominates, since an unreadable letter can only add a
 * kind, never remove the query already on the wire.
 */
describe("the type letter has a second load-bearing reader: message classification", () => {
  // A host-query request that also carries a result. The Q-dominates rule reads this as a query
  // and flags the contradiction.
  const Q_AND_R = "H|\\^&\rQ|1|^SPEC-0001\rR|1|^^^687|10.0|U/L||N||F\rL|1|N\r";
  // The same stream with one byte in front of the Q.
  const Q_MANGLED = "H|\\^&\r Q|1|^SPEC-0001\rR|1|^^^687|10.0|U/L||N||F\rL|1|N\r";

  it("control: the query dominates and the contradiction is flagged", () => {
    const msg = parseAstmRecords(Q_AND_R);
    expect(msg.classification.kind).toBe("host-query");
    expect(msg.classification.isHostQueryRequest).toBe(true);
    expect(msg.classification.hasUnrecognized).toBe(false);
    expect(msg.warnings.map((w) => w.code)).toEqual([
      WARNING_CODES.ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND,
    ]);
  });

  it("an unrecognized Q letter no longer makes the same request read as a result set", () => {
    const msg = parseAstmRecords(Q_MANGLED);
    // The letter is still not inferred, so the query is not recovered. What is refused is the
    // positive claim that this is a result set, which is the misreading the Q-dominates rule bars.
    expect(msg.classification.kind).toBe("indeterminate");
    expect(msg.classification.isHostQueryRequest).toBe(false);
    expect(msg.classification.hasUnrecognized).toBe(true);
    // The raw counts stay truthful: the R really is present, the Q really was not read.
    expect(msg.classification.hasResults).toBe(true);
    expect(msg.classification.hasQuery).toBe(false);
    // The mangled Q record still carries its field separators, so only the letter is reported.
    expect(msg.warnings.map((w) => w.code)).toEqual([WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE]);
  });

  it("an unrecognized letter cannot cancel a Q that WAS read", () => {
    // The stray byte lands on the R instead. The Q is legible, so it still dominates.
    const rMangled = "H|\\^&\rQ|1|^SPEC-0001\r R|1|^^^687|10.0|U/L||N||F\rL|1|N\r";
    const msg = parseAstmRecords(rMangled);
    expect(msg.classification.kind).toBe("host-query");
    expect(msg.classification.isHostQueryRequest).toBe(true);
    expect(msg.classification.hasUnrecognized).toBe(true);
  });

  it("and no profile can quiet that report either", () => {
    for (const code of TOLERABLE_CODES) {
      const profile = defineAstmProfile({
        name: `tolerating-${code}`,
        tolerate: [{ code, rationale: "a deviation this profile expects" }],
      });
      expect(parseAstmRecords(Q_MANGLED, { profile }).warnings.map((w) => w.code)).toEqual([
        WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE,
      ]);
      expect(() => parseAstmRecords(Q_MANGLED, { strict: true, profile })).toThrow(AstmStrictError);
    }
  });
});

describe("ASTM_RECORD_UNKNOWN_TYPE is not a code a profile may tolerate", () => {
  it("is off the tolerable allow-list and on the safety-critical set", () => {
    expect(TOLERABLE_CODES.has(WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE)).toBe(false);
    expect(SAFETY_CRITICAL_CODES.has(WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE)).toBe(true);
    expect(isSafetyCriticalCode(WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE)).toBe(true);
  });

  it("the allow-list is exactly the three codes that survived the re-derivation", () => {
    expect([...TOLERABLE_CODES].sort()).toEqual(
      [
        WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS,
        WARNING_CODES.ASTM_RECORD_UNINTERPRETED_QUERY_STATUS,
        WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
      ].sort(),
    );
    // Still a partition: every known code is on exactly one side.
    for (const code of ALL_ASTM_WARNING_CODES) {
      expect(TOLERABLE_CODES.has(code) !== SAFETY_CRITICAL_CODES.has(code)).toBe(true);
    }
  });

  it("naming it in `tolerate` is a definition-time throw that names the profile", () => {
    expect(() =>
      defineAstmProfile({
        name: "vendor-with-a-stray-byte",
        // The type union permits the code (it is a real warning code); the gate refuses it at runtime.
        tolerate: [{ code: "ASTM_RECORD_UNKNOWN_TYPE", rationale: "emits a vendor record letter" }],
      }),
    ).toThrow(AstmProfileDefinitionError);

    try {
      defineAstmProfile({
        name: "vendor-with-a-stray-byte",
        // The type union permits the code (it is a real warning code); the gate refuses it at runtime.
        tolerate: [{ code: "ASTM_RECORD_UNKNOWN_TYPE", rationale: "emits a vendor record letter" }],
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AstmProfileDefinitionError);
      expect((err as AstmProfileDefinitionError).profileName).toBe("vendor-with-a-stray-byte");
      expect((err as Error).message).toMatch(/safety-critical/u);
    }
  });

  it("a rogue parent cannot smuggle it in through `extends`", () => {
    const rogue = {
      name: "rogue",
      lineage: ["rogue"],
      tolerate: [{ code: "ASTM_RECORD_UNKNOWN_TYPE", rationale: "hand-crafted, bypassing define" }],
    };
    expect(() =>
      defineAstmProfile({
        name: "heir",
        // @ts-expect-error: deliberately hand-crafted, not built by defineAstmProfile
        extends: rogue,
      }),
    ).toThrow(AstmProfileDefinitionError);
  });

  it("no built-in profile tolerates it", () => {
    for (const profile of Object.values(astmProfiles)) {
      expect(profile.tolerate.map((t) => t.code)).not.toContain(
        WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE,
      );
    }
  });

  it("no profile built by the factory can quiet the merge or let strict mode accept it", () => {
    // Exhaustive over what a factory-built profile is now allowed to say. Each is a real profile,
    // and none of them reaches the warning that reports the lost boundary.
    for (const code of TOLERABLE_CODES) {
      const profile = defineAstmProfile({
        name: `tolerating-${code}`,
        tolerate: [{ code, rationale: "a deviation this profile expects" }],
      });
      const msg = parseAstmRecords(MANGLED, { profile });
      expect(msg.warnings.map((w) => w.code)).toEqual([WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE]);
      expect(() => parseAstmRecords(MANGLED, { strict: true, profile })).toThrow(AstmStrictError);
    }
  });

  /**
   * The definition-time gate guards a door with a second entrance. `AstmProfile` is a plain
   * exported interface, so an object literal naming the code type-checks with no cast, and both
   * `parseAstmRecords(raw, { profile })` and `setDefaultAstmProfile` accept one without re-running
   * the factory. The warning transform therefore re-checks the gate at the point of application,
   * which is what makes "no profile can quiet this" true rather than only true of the factory.
   */
  describe("a hand-authored profile object cannot quiet it either", () => {
    const handAuthored: AstmProfile = {
      name: "hand-authored",
      lineage: ["hand-authored"],
      tolerate: [
        {
          code: WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE,
          rationale: "built as an object literal, never passed through the factory",
        },
      ],
    };

    afterEach(() => {
      setDefaultAstmProfile(null);
    });

    it("passed per call: the warning survives and strict still refuses", () => {
      const msg = parseAstmRecords(MANGLED, { profile: handAuthored });
      expect(msg.warnings.map((w) => w.code)).toEqual([WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE]);
      expect(msg.warnings[0]?.expected).toBeUndefined();
      expect(() => parseAstmRecords(MANGLED, { strict: true, profile: handAuthored })).toThrow(
        AstmStrictError,
      );
    });

    it("installed process-wide as the default: same answer, with no call-site evidence", () => {
      setDefaultAstmProfile(handAuthored);
      const msg = parseAstmRecords(MANGLED);
      expect(msg.warnings.map((w) => w.code)).toEqual([WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE]);
      expect(() => parseAstmRecords(MANGLED, { strict: true })).toThrow(AstmStrictError);
    });

    it("still downgrades the codes it is genuinely allowed to, so the guard is not a blanket", () => {
      const alsoTolerable: AstmProfile = {
        name: "hand-authored-mixed",
        lineage: ["hand-authored-mixed"],
        tolerate: [
          { code: WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE, rationale: "refused at apply time" },
          { code: WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE, rationale: "genuinely tolerable" },
        ],
      };
      const raw =
        "H|\\^&|||sender\rP|1||LAB-0001\rO|1|SPEC-0001\rR|1|^^^687|28.6&Z&x|U/L||N||F\rL|1|N\r" +
        " H|\\^&|||sender2\rO|1|SPEC-0002\rR|1|^^^688|99.9|mmol/L||H||F\rL|1|N\r";
      const codes = parseAstmRecords(raw, { profile: alsoTolerable }).warnings.map((w) => w.code);
      // The escape warning is downgraded; the unknown-type warning is not.
      expect(codes).toContain(WARNING_CODES.PROFILE_QUIRK_APPLIED);
      expect(codes).toContain(WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE);
    });
  });
});

/**
 * The second half of the admission test, written down as measurement: a code may stay on the
 * allow-list only while nothing in this package reads the condition it reports. The two readers
 * of record structure are message grouping and message classification, so each surviving code is
 * checked against both.
 *
 * **The comparison is between two streams, not between two profiles.** Comparing a parse with a
 * profile against a parse without one measures nothing here: the profile transform runs after the
 * records are built and only rewrites warning objects, so the grouping is profile-independent by
 * construction, for every code, including one that should never have been tolerable. The question
 * is whether the **condition** the warning reports moves a boundary, so each fixture below comes
 * as a pair: the same logical stream with the condition present and with it absent. Equal
 * partitions mean the readers did not see it.
 *
 * The pairing is only trustworthy if it can fail, so `readTheSame` is exercised below on two
 * negative controls, one per arm: the mangled-header pair, where the partitions differ, and the
 * mangled-`Q` pair, where the partitions agree and only the classification differs. Without the
 * second, the classification arm would never be shown capable of failing.
 */
interface Pair {
  readonly code: AnyAstmWarningCode;
  /** The stream carrying the condition. */
  readonly withCondition: string;
  /** The same logical stream with the condition removed and nothing else changed. */
  readonly without: string;
}

const SURVIVORS: readonly Pair[] = [
  {
    // The second message redeclares a fully different, self-consistent delimiter set; the paired
    // stream says the same thing in the canonical set.
    code: WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS,
    withCondition:
      "H|\\^&|||sender\rP|1||LAB-0001\rO|1|SPEC-0001\rR|1|^^^687|28.6|U/L||N||F\rL|1|N\r" +
      "H*~:#*||*sender2\rP*1**LAB-0002\rO*1*SPEC-0002\rR*1*:::688*99.9*mmol/L**H**F\rL*1*N\r",
    without:
      "H|\\^&|||sender\rP|1||LAB-0001\rO|1|SPEC-0001\rR|1|^^^687|28.6|U/L||N||F\rL|1|N\r" +
      "H|\\^&|||sender2\rP|1||LAB-0002\rO|1|SPEC-0002\rR|1|^^^688|99.9|mmol/L||H||F\rL|1|N\r",
  },
  {
    // An escape body the codec does not recognize, inside a result value; the paired stream
    // carries the same characters with no escape delimiters around them.
    code: WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
    withCondition:
      "H|\\^&|||sender\rP|1||LAB-0001\rO|1|SPEC-0001\rR|1|^^^687|28.6&Z&x|U/L||N||F\rL|1|N\r" +
      "H|\\^&|||sender2\rP|1||LAB-0002\rO|1|SPEC-0002\rR|1|^^^688|99.9|mmol/L||H||F\rL|1|N\r",
    without:
      "H|\\^&|||sender\rP|1||LAB-0001\rO|1|SPEC-0001\rR|1|^^^687|28.6Zx|U/L||N||F\rL|1|N\r" +
      "H|\\^&|||sender2\rP|1||LAB-0002\rO|1|SPEC-0002\rR|1|^^^688|99.9|mmol/L||H||F\rL|1|N\r",
  },
  {
    // A request-information status on a Q record; the paired stream leaves that field empty.
    code: WARNING_CODES.ASTM_RECORD_UNINTERPRETED_QUERY_STATUS,
    withCondition:
      "H|\\^&|||sender\rP|1||LAB-0001\rL|1|N\r" +
      "H|\\^&|||sender2\rQ|1|^SPEC-0001|^SPEC-0001|^^^687||||||||O^F\rL|1|N\r",
    without:
      "H|\\^&|||sender\rP|1||LAB-0001\rL|1|N\r" +
      "H|\\^&|||sender2\rQ|1|^SPEC-0001|^SPEC-0001|^^^687|||||||||\rL|1|N\r",
  },
];

/** The message partition: one string of type letters per message, in wire order. */
const partition = (raw: string): string[] =>
  messages(parseAstmRecords(raw)).map((m) => m.records.map((r) => r.type).join(""));

/** What classification reads out of a stream, as a comparable value. */
const classification = (raw: string): string =>
  JSON.stringify(parseAstmRecords(raw).classification);

/**
 * True when the two streams are read the same way by both structural readers, i.e. the condition
 * that distinguishes them is invisible to grouping and to classification.
 */
const readTheSame = (a: string, b: string): boolean =>
  JSON.stringify(partition(a)) === JSON.stringify(partition(b)) &&
  classification(a) === classification(b);

describe("the surviving codes report conditions neither structural reader sees", () => {
  it("negative control, grouping arm: the comparison DOES fail for the code that was removed", () => {
    // CLEAN and MANGLED differ only by the stray byte that ASTM_RECORD_UNKNOWN_TYPE reports.
    // If `readTheSame` could not tell them apart, every assertion below would be vacuous.
    expect(readTheSame(CLEAN, MANGLED)).toBe(false);
    expect(partition(CLEAN)).toHaveLength(2);
    expect(partition(MANGLED)).toHaveLength(1);
  });

  it("negative control, classification arm: it fails on a difference grouping cannot see", () => {
    // The grouping arm alone would short-circuit the pair above, leaving the classification arm
    // never shown capable of failing. These two partition identically and classify differently.
    const clean = "H|\\^&\rQ|1|^SPEC-0001\rR|1|^^^687|10.0|U/L||N||F\rL|1|N\r";
    const mangledQ = "H|\\^&\r Q|1|^SPEC-0001\rR|1|^^^687|10.0|U/L||N||F\rL|1|N\r";
    expect(partition(clean)).toHaveLength(1);
    expect(partition(mangledQ)).toHaveLength(1);
    expect(classification(clean)).not.toBe(classification(mangledQ));
    expect(readTheSame(clean, mangledQ)).toBe(false);
  });

  for (const { code, withCondition, without } of SURVIVORS) {
    describe(code, () => {
      it("the paired streams differ by exactly this tolerable code and nothing else", () => {
        const codes = parseAstmRecords(withCondition).warnings.map((w) => w.code);
        expect(codes).toContain(code);
        expect(parseAstmRecords(without).warnings.map((w) => w.code)).not.toContain(code);
        // No other tolerable code is in play, so the comparison isolates this one.
        for (const other of TOLERABLE_CODES) {
          if (other !== code) expect(codes).not.toContain(other);
        }
      });

      it("both readers give the same answer with the condition present and absent", () => {
        expect(partition(withCondition)).toHaveLength(2);
        expect(readTheSame(withCondition, without)).toBe(true);
      });

      it("is downgraded rather than dropped, so the record it reports is still reported", () => {
        const profile = defineAstmProfile({
          name: `tolerating-${code}`,
          tolerate: [{ code, rationale: "a deviation this profile expects" }],
        });
        const bare = parseAstmRecords(withCondition).warnings;
        const tolerated = parseAstmRecords(withCondition, { profile }).warnings;
        expect(tolerated).toHaveLength(bare.length);
        const downgraded = tolerated.find((w) => w.code === WARNING_CODES.PROFILE_QUIRK_APPLIED);
        expect(downgraded?.toleratedCode).toBe(code);
      });
    });
  }
});
