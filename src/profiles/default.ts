/**
 * The `default` conservative baseline profile. Tolerates **nothing** and forces no
 * transport — every deviation surfaces as its own warning, unmodified, and framing
 * is auto-detected. It exists so "no profile" and "the default profile" are the
 * same, explicit behaviour, and so a consumer can name the baseline when composing
 * (`extends: astmProfiles.default`) without importing a special sentinel. Absence of
 * a profile means this conservative default applied — not that a stream was fully
 * understood.
 *
 * Authored through the public `defineAstmProfile()` API — zero privileged coupling;
 * it is exactly what a user would write.
 */

import { defineAstmProfile } from "./define.js";
import type { AstmProfile } from "./types.js";

/**
 * The conservative baseline profile: no tolerated quirks, no transport override.
 *
 * @example
 * ```ts
 * import { parseAstmRecords, astmProfiles } from "@cosyte/astm";
 * const msg = parseAstmRecords(raw, { profile: astmProfiles.default });
 * // identical to parseAstmRecords(raw) with no profile.
 * ```
 */
export const defaultProfile: AstmProfile = defineAstmProfile({
  name: "default",
  description: "Conservative baseline — tolerates nothing; every deviation surfaces as a warning.",
  tolerate: [],
});
