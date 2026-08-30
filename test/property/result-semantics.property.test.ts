import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  ABNORMAL_FLAG_CODES,
  ABNORMAL_FLAG_VOCABULARY,
  RESULT_STATUS_VOCABULARY,
  interpretAbnormalFlag,
  interpretResultStatus,
  parseReferenceRange,
} from "../../src/index.js";

/**
 * The Phase-2 headline safety properties, over arbitrary input. These are the
 * "never a confident wrong value" invariants the whole phase exists to hold:
 *
 *   1. A `C` (correction) or `X` (cancellation) result NEVER reads as active-final.
 *   2. An abnormal flag reads as `normal` ONLY for the exact letter `N`: an
 *      unrecognized flag is never coerced to normal.
 *   3. A reference range never fabricates a bound: an `unparsed` range has no
 *      bound, and any parsed bound is literal text taken from the input.
 *   4. A letter outside the named vocabulary is surfaced verbatim, reported
 *      unrecognized, and never coerced to normal or to final, while STILL
 *      carrying the attribution it was graded against.
 */

/** The recognized status letters, exact-match after trimming. */
const STATUS_CODES = ["F", "C", "P", "R", "S", "I", "X"] as const;
describe("result-semantics safety properties", () => {
  it("a C/X status is never active-final, and only F is", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const s = interpretResultStatus(raw);
        const t = raw.trim();
        if (t === "C" || t === "X") expect(s.isActiveFinal).toBe(false);
        // isActiveFinal is true iff the trimmed input is exactly "F".
        expect(s.isActiveFinal).toBe(t === "F");
        if (t === "C") expect(s.supersedes).toBe(true);
        if (t === "X") expect(s.cancelled).toBe(true);
      }),
    );
  });

  it("an absent status is unspecified and never active-final", () => {
    fc.assert(
      fc.property(fc.constantFrom(undefined, "", " ", "   ", "\t"), (raw) => {
        const s = interpretResultStatus(raw);
        expect(s.meaning).toBe("unspecified");
        expect(s.isActiveFinal).toBe(false);
      }),
    );
  });

  it("a flag reads as normal ONLY for the exact letter N", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const f = interpretAbnormalFlag(raw);
        expect(f.meaning === "normal").toBe(raw.trim() === "N");
        // An unrecognized flag is surfaced as undefined, never dropped and never normal.
        if (!f.recognized) {
          expect(f.meaning).toBe("undefined");
          expect(f.raw).toBe(raw);
        }
      }),
    );
  });

  it("a reference range never fabricates a bound", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const r = parseReferenceRange(raw);
        expect(r.raw).toBe(raw); // always verbatim
        if (r.kind === "unparsed") {
          expect(r.low).toBeUndefined();
          expect(r.high).toBeUndefined();
        }
        // Any bound that IS produced is literal text from the input (never invented).
        if (r.low !== undefined) expect(raw).toContain(r.low);
        if (r.high !== undefined) expect(raw).toContain(r.high);
      }),
    );
  });
});

describe("outside the named vocabulary: raw surfaced, unrecognized, never coerced", () => {
  it("a flag outside the vocabulary is verbatim, unrecognized and never normal", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const f = interpretAbnormalFlag(raw);
        const recognized = (ABNORMAL_FLAG_CODES as readonly string[]).includes(raw.trim());
        expect(f.recognized).toBe(recognized);
        expect(f.raw).toBe(raw); // ALWAYS verbatim, recognized or not
        if (!recognized) {
          expect(f.meaning).toBe("undefined");
          expect(f.meaning).not.toBe("normal");
          expect(f.code).toBeUndefined();
        }
      }),
    );
  });

  it("a status outside the set is verbatim, unrecognized and never final", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => s.trim().length > 0),
        (raw) => {
          const s = interpretResultStatus(raw);
          const recognized = (STATUS_CODES as readonly string[]).includes(raw.trim());
          expect(s.recognized).toBe(recognized);
          expect(s.raw).toBe(raw); // present field: always verbatim
          if (!recognized) {
            expect(s.meaning).toBe("undefined");
            expect(s.meaning).not.toBe("final");
            expect(s.isActiveFinal).toBe(false);
            expect(s.code).toBeUndefined();
          }
        },
      ),
    );
  });

  it("an unrecognized flag STILL reports the vocabulary identifier and version", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const f = interpretAbnormalFlag(raw);
        // Present on every outcome, so unknown-to-anyone and not-caught-up-with
        // are distinguishable rather than both reading as a bare `undefined`.
        expect(f.vocabulary.attributed).toBe(true);
        expect(f.vocabulary.system).toBe(ABNORMAL_FLAG_VOCABULARY.system);
        expect(f.vocabulary.version).toBe(ABNORMAL_FLAG_VOCABULARY.version);
      }),
    );
  });

  it("every status, absent or present, reports the unattributed statement", () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: undefined }), (raw) => {
        const s = interpretResultStatus(raw);
        expect(s.vocabulary.attributed).toBe(false);
        expect(s.vocabulary.reason).toBe(RESULT_STATUS_VOCABULARY.reason);
        // Never the flag vocabulary's identifier, by any route.
        expect(JSON.stringify(s.vocabulary)).not.toContain(ABNORMAL_FLAG_VOCABULARY.system);
      }),
    );
  });
});

describe("recognition is exact-match: case is never folded", () => {
  it("a flag that would match only case-insensitively stays unrecognized and verbatim", () => {
    const caseVariants = (ABNORMAL_FLAG_CODES as readonly string[]).flatMap((code) => {
      const lower = code.toLowerCase();
      const upper = code.toUpperCase();
      return [lower, upper].filter((v) => v !== code);
    });
    // Every letter-bearing code has at least one variant that differs by case only.
    expect(caseVariants.length).toBeGreaterThan(0);
    fc.assert(
      fc.property(fc.constantFrom(...caseVariants), (raw) => {
        const f = interpretAbnormalFlag(raw);
        expect(f.recognized).toBe(false);
        expect(f.meaning).toBe("undefined");
        expect(f.meaning).not.toBe("normal");
        expect(f.raw).toBe(raw); // verbatim, never up-cased into a match
        expect(f.vocabulary.system).toBe(ABNORMAL_FLAG_VOCABULARY.system);
      }),
    );
  });

  it("a status that would match only case-insensitively stays unrecognized and verbatim", () => {
    fc.assert(
      fc.property(fc.constantFrom(...STATUS_CODES.map((c) => c.toLowerCase())), (raw) => {
        const s = interpretResultStatus(raw);
        expect(s.recognized).toBe(false);
        expect(s.meaning).toBe("undefined");
        expect(s.isActiveFinal).toBe(false);
        expect(s.raw).toBe(raw); // verbatim, never up-cased into a match
      }),
    );
  });
});
