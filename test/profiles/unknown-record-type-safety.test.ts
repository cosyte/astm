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
 * that this happened, so a profile downgrading it quiets the whole signal and a `{ strict: true }`
 * parse then accepts the stream.
 *
 * The code is therefore off the allow-list. This file measures the merge that motivates it, pins
 * the classification, and records the re-derivation of the three codes that remain: each is
 * measured to leave the message partition untouched, tolerated or not.
 *
 * The parser is deliberately unchanged here. Recognizing a mangled header *as* a header would mean
 * guessing at a byte the sender did not send, and that guess would split the stream a different
 * way just as silently.
 *
 * All fixtures are **synthetic**: the identifiers, names, specimen IDs, and values are invented and
 * correspond to no real person or specimen.
 *
 * Grounding: the `H` … `L` message unit is grounded on `messages()` in `src/records/messages.ts`.
 * No clause is claimed for the allow-list itself, which is this library's own policy, not the
 * standard's.
 */

import { describe, expect, it } from "vitest";

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
  type AnyAstmWarningCode,
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
 * The mis-classification itself is not fixed here: it is a property of reading the letter, the same
 * one segmentation has, and inferring the intended letter is the guess this package declines to
 * make. What is fixed is that the report of it can no longer be configured away.
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
    expect(msg.warnings.map((w) => w.code)).toEqual([
      WARNING_CODES.ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND,
    ]);
  });

  it("an unrecognized Q letter makes the same request read as a result set", () => {
    const msg = parseAstmRecords(Q_MANGLED);
    expect(msg.classification.kind).toBe("results");
    expect(msg.classification.isHostQueryRequest).toBe(false);
    // The ambiguity warning is gone with the Q, so this code is the only report left.
    expect(msg.warnings.map((w) => w.code)).toEqual([WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE]);
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

  it("no definable profile can quiet the re-merge signal or let strict mode accept the stream", () => {
    // Exhaustive over what a profile is now allowed to say. Each is a real profile, and none of
    // them reaches the warning that reports the lost boundary.
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
});

/**
 * The second half of the admission test, written down as measurement: a code may stay on the
 * allow-list only while nothing in this package reads the condition it reports. Grouping is that
 * reader, so each surviving code is checked against it directly.
 *
 * Each fixture below is a two-message stream that trips exactly one tolerable code. The assertion
 * is that the message partition is identical with and without a profile that downgrades it, which
 * is what "grouping does not see this code" means operationally.
 */
const SURVIVORS: readonly (readonly [AnyAstmWarningCode, string])[] = [
  // A second header redeclaring a fully different, self-consistent delimiter set.
  [
    WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS,
    "H|\\^&|||sender\rP|1||LAB-0001\rO|1|SPEC-0001\rR|1|^^^687|28.6|U/L||N||F\rL|1|N\r" +
      "H*~:#*||*sender2\rP*1**LAB-0002\rO*1*SPEC-0002\rR*1*:::688*99.9*mmol/L**H**F\rL*1*N\r",
  ],
  // An escape body the codec does not recognize, preserved byte-for-byte inside a result value.
  [
    WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
    "H|\\^&|||sender\rP|1||LAB-0001\rO|1|SPEC-0001\rR|1|^^^687|28.6&Z&x|U/L||N||F\rL|1|N\r" +
      "H|\\^&|||sender2\rP|1||LAB-0002\rO|1|SPEC-0002\rR|1|^^^688|99.9|mmol/L||H||F\rL|1|N\r",
  ],
  // A request-information status on a Q record, surfaced verbatim and never interpreted.
  [
    WARNING_CODES.ASTM_RECORD_UNINTERPRETED_QUERY_STATUS,
    "H|\\^&|||sender\rP|1||LAB-0001\rL|1|N\r" +
      "H|\\^&|||sender2\rQ|1|^SPEC-0001|^SPEC-0001|^^^687||||||||O^F\rL|1|N\r",
  ],
];

describe("the codes that remain tolerable are invisible to message grouping", () => {
  const partition = (raw: string, profile?: Parameters<typeof parseAstmRecords>[1]): string[] =>
    messages(parseAstmRecords(raw, profile)).map((m) => m.records.map((r) => r.type).join(""));

  for (const [code, raw] of SURVIVORS) {
    describe(code, () => {
      it("trips exactly this tolerable code on a lenient parse", () => {
        const codes = parseAstmRecords(raw).warnings.map((w) => w.code);
        expect(codes).toContain(code);
        // No other tolerable code is in play, so the next assertion isolates this one.
        for (const other of TOLERABLE_CODES) {
          if (other !== code) expect(codes).not.toContain(other);
        }
      });

      it("leaves the message partition identical whether or not a profile downgrades it", () => {
        const profile = defineAstmProfile({
          name: `tolerating-${code}`,
          tolerate: [{ code, rationale: "a deviation this profile expects" }],
        });
        const bare = partition(raw);
        const tolerated = partition(raw, { profile });
        expect(bare).toHaveLength(2);
        expect(tolerated).toEqual(bare);
      });

      it("is downgraded rather than dropped, so the record it reports is still reported", () => {
        const profile = defineAstmProfile({
          name: `tolerating-${code}`,
          tolerate: [{ code, rationale: "a deviation this profile expects" }],
        });
        const bare = parseAstmRecords(raw).warnings;
        const tolerated = parseAstmRecords(raw, { profile }).warnings;
        expect(tolerated).toHaveLength(bare.length);
        const downgraded = tolerated.find((w) => w.code === WARNING_CODES.PROFILE_QUIRK_APPLIED);
        expect(downgraded?.toleratedCode).toBe(code);
      });
    });
  }
});
