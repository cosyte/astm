/**
 * A header may declare one character in two delimiter roles, and the reader used to say nothing.
 *
 * `readDelimiters` refuses a declaration whose **field** separator is one of the other three: that
 * is the `ASTM_RECORD_UNDECLARED_DELIMITERS` fatal on the first header and the
 * `ASTM_RECORD_UNREADABLE_REDECLARATION` warning on a later one. It does not refuse a declaration
 * where two of the remaining three share a character, and it should not: the stream is still
 * readable, and refusing it would drop records a sender did send. What it costs is the boundary
 * between those two roles, which is not in the bytes any more, and that loss was reported by
 * nothing at all.
 *
 * **The measure that discriminates here is strict-accepted-under-a-gate-legal-profile, not
 * "silent".** Every such declaration is by definition non-canonical, so it always raised
 * `ASTM_NONSTANDARD_DELIMITERS`, which is tolerable: a `warnings: []` outcome was structurally
 * unreachable for the entire class, and "it is never silent" was therefore true of it and told you
 * nothing. What it hid is that a profile tolerating the ordinary vendor-set warning left
 * `{ strict: true }` accepting a declaration whose own field tree cannot be recovered. That is the
 * tier the sweep below measures.
 *
 * The emit side already refuses these sets (`ASTM_EMIT_INVALID_DELIMITERS`), which is how the hole
 * became visible from the outside: a message that parsed clean threw when re-serialized against
 * its own declared delimiters.
 *
 * **The corpus is named by the constants in this file** (`DELIMITER_ALPHABET` and `sweepStream`),
 * because a figure whose corpus is not in the tree cannot be re-derived and has to be retired. Every
 * count below is derived from `DELIMITER_ALPHABET.length` in the assertion itself, so changing the
 * alphabet moves the numbers rather than reddening a snapshot.
 *
 * All fixtures are **synthetic**. No clause of ASTM E1394 / CLSI LIS01 / LIS02 is claimed: the
 * grounding for how a declaration is read is this package's own `readDelimiters`, and the grounding
 * for what cannot be reversed is its own serializer.
 */

import { describe, expect, it } from "vitest";

import {
  AstmSerializeError,
  AstmStrictError,
  CANONICAL_DELIMITERS,
  defineAstmProfile,
  hasCollidingRoles,
  parseAstmRecords,
  readDelimiters,
  serializeAstmRecords,
  TOLERABLE_CODES,
  WARNING_CODES,
} from "../../src/index.js";

const codes = (raw: string): string[] => parseAstmRecords(raw).warnings.map((w) => w.code);

/**
 * The committed corpus alphabet: twelve punctuation characters a vendor could plausibly declare.
 * They are all non-alphanumeric so that no record content in `sweepStream` can be mistaken for a
 * delimiter, which is what keeps the sweep's warning set down to the two codes a declaration alone
 * can produce.
 */
const DELIMITER_ALPHABET = ["|", "\\", "^", "&", "~", ":", "#", "*", "!", "@", "$", "%"] as const;

/** The committed corpus stream: a header declaring the four roles, and a terminator. Nothing else. */
const sweepStream = (field: string, repeat: string, component: string, escape: string): string =>
  `H${field}${repeat}${component}${escape}${field}${field}${field}sender\rL${field}1${field}N\r`;

/** A profile that is legal under the safety gate and tolerates the ordinary vendor-set warning. */
const vendorSetProfile = defineAstmProfile({
  name: "vendor-set",
  tolerate: [
    { code: WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS, rationale: "vendor declares its own set" },
  ],
});

describe("a declaration naming one character in two roles is reported", () => {
  it("names the three pairs it covers, and the field role is not one of them", () => {
    // Three unordered pairs among repeat / component / escape, enumerated rather than counted.
    expect(hasCollidingRoles({ ...CANONICAL_DELIMITERS, repeat: "^" })).toBe(true); // repeat = component
    expect(hasCollidingRoles({ ...CANONICAL_DELIMITERS, repeat: "&" })).toBe(true); // repeat = escape
    expect(hasCollidingRoles({ ...CANONICAL_DELIMITERS, component: "&" })).toBe(true); // component = escape
    expect(hasCollidingRoles(CANONICAL_DELIMITERS)).toBe(false);
    // The field role never reaches this test: such a declaration does not resolve at all.
    expect(readDelimiters("H|\\^|")).toBeUndefined();
    expect(readDelimiters("H||^&")).toBeUndefined();
  });

  it("reports it on the first header, alongside the non-canonical note", () => {
    const raw = "H|^^&\rP|1||LAB-0001\rR|1|^^^687|28.6|U/L||N||F\rL|1|N\r";
    expect(codes(raw)).toEqual([
      WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS,
      WARNING_CODES.ASTM_RECORD_DELIMITER_ROLE_COLLISION,
    ]);
    const w = parseAstmRecords(raw).warnings[1];
    expect(w?.position).toEqual({ recordIndex: 0, recordType: "H" });
    // A delimiter is a byte off the wire, so it never appears in the message.
    expect(w?.message).not.toMatch(/[|^&]/u);
  });

  it("reports it on a later header that redeclares into such a set", () => {
    const raw =
      "H|\\^&\rP|1||LAB-0001\rL|1|N\r" +
      "H|^^&\rP|1||LAB-0002\rR|1|^^^688|99.9|mmol/L||N||F\rL|1|N\r";
    expect(codes(raw)).toEqual([
      WARNING_CODES.ASTM_RECORD_DELIMITERS_REDECLARED,
      WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS,
      WARNING_CODES.ASTM_RECORD_DELIMITER_ROLE_COLLISION,
    ]);
    expect(parseAstmRecords(raw).warnings[2]?.position).toEqual({
      recordIndex: 3,
      recordType: "H",
    });
  });

  it("is one warning per declaring header, not one per colliding pair", () => {
    // All three roles are the same character here, so all three pairs collide.
    const raw = "H|&&&\rP|1||LAB-0001\rL|1|N\r";
    expect(
      codes(raw).filter((c) => c === WARNING_CODES.ASTM_RECORD_DELIMITER_ROLE_COLLISION),
    ).toHaveLength(1);
  });

  it("warns nothing when a later header merely restates the colliding set in force", () => {
    // Two headers declare such a set and one warning is raised, because the second changes
    // nothing: the set it names came into force, and was reported, at the first. The rule is the
    // one every other delimiter warning follows. An earlier draft of the shipped prose said "once
    // per header that declares such a set", which this stream measures false.
    const raw = "H|&&&\rP|1||LAB-0001\rL|1|N\rH|&&&\rP|1||LAB-0002\rL|1|N\r";
    expect(codes(raw)).toEqual([
      WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS,
      WARNING_CODES.ASTM_RECORD_DELIMITER_ROLE_COLLISION,
    ]);
  });

  it("cannot be quieted by tolerating the code it used to hide behind", () => {
    // The part-2 pin: a profile re-badges the code it names and no other, so tolerating the
    // ordinary vendor-set warning leaves the collision report escalating in strict mode.
    expect(() =>
      parseAstmRecords("H|^^&\rP|1||LAB-0001\rL|1|N\r", {
        strict: true,
        profile: vendorSetProfile,
      }),
    ).toThrow(AstmStrictError);
  });

  it("is not tolerable, and the warning it used to hide behind is", () => {
    expect(TOLERABLE_CODES.has(WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS)).toBe(true);
    expect(TOLERABLE_CODES.has(WARNING_CODES.ASTM_RECORD_DELIMITER_ROLE_COLLISION)).toBe(false);
    // So a profile cannot be defined that tolerates it.
    expect(() =>
      defineAstmProfile({
        name: "nope",
        tolerate: [{ code: WARNING_CODES.ASTM_RECORD_DELIMITER_ROLE_COLLISION, rationale: "no" }],
      }),
    ).toThrow();
  });
});

describe("what the declaration costs, measured rather than asserted", () => {
  it("cannot recover a repeat boundary from a component one when they are the same character", () => {
    // Under `H|^^&` the repeat and component roles are both `^`, so a field a canonical sender
    // would have written as two repeats of two components reads as four repeats of one component.
    const raw = "H|^^&\rP|1||LAB-0001\rR|1|^^^687|A^B^C^D|U/L||N||F\rL|1|N\r";
    const field = parseAstmRecords(raw).records[2]?.fields[3];
    expect(field?.repeats).toEqual([["A"], ["B"], ["C"], ["D"]]);
    expect(field?.components).toEqual(["A"]);

    // The same bytes under the canonical set, where the two roles are distinct.
    const canonical = "H|\\^&\rP|1||LAB-0001\rR|1|^^^687|A^B\\C^D|U/L||N||F\rL|1|N\r";
    const clean = parseAstmRecords(canonical).records[2]?.fields[3];
    expect(clean?.repeats).toEqual([
      ["A", "B"],
      ["C", "D"],
    ]);
  });

  it("makes one character mean two things depending on what follows it", () => {
    // Under `H|\&&` the component and escape roles are both `&`.
    const split = "H|\\&&\rP|1||LAB-0001\rR|1|&&&687|A&B|U/L||N||F\rL|1|N\r";
    expect(parseAstmRecords(split).records[2]?.fields[3]?.components).toEqual(["A", "B"]);
    const atom = "H|\\&&\rP|1||LAB-0001\rR|1|&&&687|A&F&B|U/L||N||F\rL|1|N\r";
    expect(parseAstmRecords(atom).records[2]?.fields[3]?.components).toEqual(["A|B"]);
  });

  it("still throws on emit against the set the header declared, which is how it surfaced", () => {
    const msg = parseAstmRecords("H|^^&\rP|1||LAB-0001\rR|1|^^^687|A^B|U/L||N||F\rL|1|N\r");
    try {
      serializeAstmRecords(msg, msg.delimiters);
      expect.unreachable("emit must refuse a set it cannot reverse");
    } catch (err) {
      expect(err).toBeInstanceOf(AstmSerializeError);
      expect((err as AstmSerializeError).code).toBe("ASTM_EMIT_INVALID_DELIMITERS");
    }
  });

  it("does not change any value: the report is a report, not a repair", () => {
    const raw = "H|^^&\rP|1||LAB-0001\rR|1|^^^687|28.6|U/L||N||F\rL|1|N\r";
    const rec = parseAstmRecords(raw).records[2];
    expect(rec?.fields.map((f) => f.raw)).toEqual([
      "R",
      "1",
      "^^^687",
      "28.6",
      "U/L",
      "",
      "N",
      "",
      "F",
    ]);
  });
});

describe("the sweep: every resolvable declaration over the committed alphabet", () => {
  // 12 * 11 * 11 * 11 resolvable declarations, of which the colliding ones are those where two of
  // the three non-field roles agree: 12 * (11^3 - 11*10*9) of them, against 12 * 11*10*9 distinct.
  const n = DELIMITER_ALPHABET.length;
  const resolvable = n * (n - 1) ** 3;
  const distinct = n * (n - 1) * (n - 2) * (n - 3);
  const colliding = resolvable - distinct;

  const sweep = (): {
    resolvable: number;
    colliding: number;
    collidingReported: number;
    collidingStrictAccepted: number;
    distinctStrictAccepted: number;
    unexpectedCodes: Set<string>;
  } => {
    const acc = {
      resolvable: 0,
      colliding: 0,
      collidingReported: 0,
      collidingStrictAccepted: 0,
      distinctStrictAccepted: 0,
      unexpectedCodes: new Set<string>(),
    };
    for (const field of DELIMITER_ALPHABET) {
      for (const repeat of DELIMITER_ALPHABET) {
        for (const component of DELIMITER_ALPHABET) {
          for (const escape of DELIMITER_ALPHABET) {
            if (field === repeat || field === component || field === escape) continue;
            acc.resolvable += 1;
            const raw = sweepStream(field, repeat, component, escape);
            const seen = codes(raw);
            for (const c of seen) {
              if (
                c !== WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS &&
                c !== WARNING_CODES.ASTM_RECORD_DELIMITER_ROLE_COLLISION
              ) {
                acc.unexpectedCodes.add(c);
              }
            }
            const collides = repeat === component || repeat === escape || component === escape;
            if (collides) {
              acc.colliding += 1;
              if (seen.includes(WARNING_CODES.ASTM_RECORD_DELIMITER_ROLE_COLLISION)) {
                acc.collidingReported += 1;
              }
            }
            let accepted = true;
            try {
              parseAstmRecords(raw, { strict: true, profile: vendorSetProfile });
            } catch (err) {
              if (!(err instanceof AstmStrictError)) throw err;
              accepted = false;
            }
            if (accepted) {
              if (collides) acc.collidingStrictAccepted += 1;
              else acc.distinctStrictAccepted += 1;
            }
          }
        }
      }
    }
    return acc;
  };

  it("reports every colliding declaration and strict-refuses every one of them", () => {
    const acc = sweep();
    expect(acc.resolvable).toBe(resolvable);
    expect(acc.colliding).toBe(colliding);
    expect(acc.collidingReported).toBe(colliding);
    // The tier that discriminates. Every one of these was accepted before this code existed,
    // because the only warning it raised was the tolerable non-canonical note.
    expect(acc.collidingStrictAccepted).toBe(0);
    // And nothing else moved: a declaration whose four roles are distinct is untouched.
    expect(acc.distinctStrictAccepted).toBe(distinct);
    // No other warning code is reachable from a declaration alone on this corpus, which is what
    // makes the two counts above a statement about the declaration and not about the content.
    expect([...acc.unexpectedCodes]).toEqual([]);
  });
});
