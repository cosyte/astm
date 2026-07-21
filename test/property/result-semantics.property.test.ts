import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  interpretAbnormalFlag,
  interpretResultStatus,
  parseReferenceRange,
} from "../../src/index.js";

/**
 * The Phase-2 headline safety properties, over arbitrary input. These are the
 * "never a confident wrong value" invariants the whole phase exists to hold:
 *
 *   1. A `C` (correction) or `X` (cancellation) result NEVER reads as active-final.
 *   2. An abnormal flag reads as `normal` ONLY for the exact letter `N` — an
 *      unrecognized flag is never coerced to normal.
 *   3. A reference range never fabricates a bound: an `unparsed` range has no
 *      bound, and any parsed bound is literal text taken from the input.
 */
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
