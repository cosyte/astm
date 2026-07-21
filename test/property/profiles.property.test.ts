import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  ALL_ASTM_WARNING_CODES,
  SAFETY_CRITICAL_CODES,
  TOLERABLE_CODES,
  WARNING_CODES,
  defineAstmProfile,
  parseAstmRecords,
  type AstmProfile,
} from "../../src/index.js";

/**
 * Phase-8 headline safety properties, over arbitrary input:
 *
 *   1. **A profile never changes a message's parse.** For any input and any
 *      (safety-valid) profile, the parsed `records` and `delimiters` are deep-equal
 *      to the no-profile parse. A profile only ever re-badges a *warning*; it can
 *      never alter, drop, or fabricate an extracted value.
 *   2. **Tolerance downgrades, never drops.** The warning count is identical with
 *      and without a profile; every re-badged `PROFILE_QUIRK_APPLIED` carries a
 *      `toleratedCode` the profile actually listed, and that code is tolerable
 *      (never safety-critical).
 *   3. **The safety gate is total.** Every safety-critical code is refused at
 *      definition time; every tolerable code is accepted.
 */

// A "maximal tolerant" profile: tolerates every benign code the gate allows. If even
// this profile cannot change a parse, no profile can.
const MAXIMAL: AstmProfile = defineAstmProfile({
  name: "maximal",
  tolerate: [...TOLERABLE_CODES].map((code) => ({
    code,
    rationale: "property-test: tolerate every benign code",
  })),
});

// Arbitrary record lines over a small alphabet that can trip the benign warnings
// (extra record letters, a bare '&' escape, non-canonical content) without ever
// producing PHI.
const CONTENT = fc.stringMatching(/^[A-Za-z0-9.^\\&/ <>-]*$/u);
const LINE = fc
  .tuple(
    fc.constantFrom("P", "O", "R", "C", "Q", "M", "S", "Z", "L"),
    fc.array(CONTENT, { maxLength: 5 }),
  )
  .map(([t, fields]) => [t, ...fields].join("|"));
const MESSAGE = fc.array(LINE, { maxLength: 8 }).map((lines) => ["H|\\^&", ...lines].join("\r"));

describe("a profile never changes a message's parse (property)", () => {
  it("records + delimiters are identical with and without the maximal tolerant profile", () => {
    fc.assert(
      fc.property(MESSAGE, (raw) => {
        const bare = parseAstmRecords(raw);
        const withProfile = parseAstmRecords(raw, { profile: MAXIMAL });
        expect(withProfile.records).toEqual(bare.records);
        expect(withProfile.delimiters).toEqual(bare.delimiters);
        expect(withProfile.classification).toEqual(bare.classification);
      }),
    );
  });

  it("tolerance downgrades but never drops a warning; every quirk names a tolerated code", () => {
    fc.assert(
      fc.property(MESSAGE, (raw) => {
        const bare = parseAstmRecords(raw);
        const withProfile = parseAstmRecords(raw, { profile: MAXIMAL });
        // Same number of warnings — re-badged, never dropped or added.
        expect(withProfile.warnings).toHaveLength(bare.warnings.length);
        for (const w of withProfile.warnings) {
          if (w.code === WARNING_CODES.PROFILE_QUIRK_APPLIED) {
            expect(w.expected).toBe(true);
            const tolerated = w.toleratedCode;
            expect(tolerated).toBeDefined();
            if (tolerated !== undefined) {
              // The re-badged code must be one the profile tolerated — tolerable, never critical.
              expect(TOLERABLE_CODES.has(tolerated)).toBe(true);
              expect(SAFETY_CRITICAL_CODES.has(tolerated)).toBe(false);
            }
          }
        }
        // A genuine safety-critical deviation is NEVER re-badged — it survives verbatim
        // (by identity). Exclude the PROFILE_QUIRK_APPLIED marker itself, which is
        // "critical" by set membership but only ever appears as a re-badge of a *benign*
        // original, so it has no counterpart in the bare parse.
        const genuineCritical = (w: { code: string }): boolean =>
          SAFETY_CRITICAL_CODES.has(w.code as never) &&
          w.code !== WARNING_CODES.PROFILE_QUIRK_APPLIED;
        expect(withProfile.warnings.filter(genuineCritical)).toEqual(
          bare.warnings.filter(genuineCritical),
        );
      }),
    );
  });
});

describe("the safety gate is total (property)", () => {
  it("refuses every safety-critical code and accepts every tolerable code", () => {
    for (const code of ALL_ASTM_WARNING_CODES) {
      const define = (): AstmProfile =>
        defineAstmProfile({
          name: "probe",
          tolerate: [{ code, rationale: "probe" }],
        });
      if (SAFETY_CRITICAL_CODES.has(code)) {
        expect(define).toThrow(/safety-critical/u);
      } else {
        expect(define).not.toThrow();
      }
    }
  });
});
