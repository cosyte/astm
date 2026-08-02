/**
 * The runtime side of the profile subsystem: turning an active {@link AstmProfile}
 * into a warning transform the record parser runs over its accumulated warnings,
 * plus the transport-override accessor the framing detector consumes.
 *
 * A profile **never touches an extracted value**. The warning transform operates
 * purely at the warning layer: downgrading a deviation it *expects* into a
 * `PROFILE_QUIRK_APPLIED` warning (flagged `expected`, carrying the original
 * `toleratedCode`) while leaving every un-expected warning untouched. Because the
 * transform only ever rewrites a warning object (never a record, field, or value),
 * a profile cannot change how any byte parses: a spec-clean message parses
 * identically with or without a profile.
 */

import { profileQuirkApplied, type AstmRecordWarning } from "../common/warnings.js";
import type { AstmFraming } from "../ltp/transport.js";

import { isSafetyCriticalCode } from "./safety.js";
import type { AstmProfile, AstmQuirkTolerance } from "./types.js";

/**
 * Does `tolerance` apply to `warning`? The codes must match, and every structural
 * key present in the tolerance's `match` must equal the warning's position: a
 * tolerance with no `match` applies to every warning of its code. Matching is on
 * PHI-free structural identifiers only (record-type letter, 1-based field index).
 *
 * @internal
 */
function toleranceApplies(tolerance: AstmQuirkTolerance, warning: AstmRecordWarning): boolean {
  if (tolerance.code !== warning.code) return false;
  const match = tolerance.match;
  if (match === undefined) return true;
  if (match.recordType !== undefined && warning.position.recordType !== match.recordType) {
    return false;
  }
  if (match.fieldIndex !== undefined && warning.position.fieldIndex !== match.fieldIndex) {
    return false;
  }
  return true;
}

/**
 * Apply a profile to a single warning. Returns a downgraded `PROFILE_QUIRK_APPLIED`
 * warning when the profile expects this deviation; otherwise returns the original
 * warning unchanged (referential identity preserved, so an un-tolerated warning is
 * never reallocated). A warning that is already `expected` (e.g. re-processed) is
 * passed through untouched.
 *
 * **The safety gate is re-checked here, and that is not redundant.**
 * {@link defineAstmProfile} refuses a safety-critical code at definition time, but
 * {@link AstmProfile} is a plain interface: a hand-authored object literal
 * type-checks, and `parseAstmRecords(raw, { profile })` and `setDefaultAstmProfile`
 * both accept one without re-running the factory. A definition-time-only gate
 * therefore guards a door that has a second entrance. A safety-critical code is
 * **not downgraded here whatever the profile says**, so the original warning
 * survives and `strict` still escalates it. Silently declining to downgrade, rather
 * than throwing, is the fail-safe direction: the signal is preserved either way, and
 * a parse is not turned into an exception by a profile the caller built by hand.
 *
 * @param profile - The active profile.
 * @param warning - One accumulated warning.
 * @returns The re-badged warning when tolerated, else the original.
 * @example
 * ```ts
 * import { applyAstmProfile, astmProfiles, unknownEscapeSequence } from "@cosyte/astm";
 * const w = unknownEscapeSequence({ recordIndex: 4, recordType: "R", fieldIndex: 5 });
 * const out = applyAstmProfile(astmProfiles.referenceCorpus, w);
 * out.code; // "PROFILE_QUIRK_APPLIED"
 * out.toleratedCode; // "ASTM_UNKNOWN_ESCAPE_SEQUENCE"
 * ```
 */
export function applyAstmProfile(
  profile: AstmProfile,
  warning: AstmRecordWarning,
): AstmRecordWarning {
  if (warning.expected === true) return warning;
  if (isSafetyCriticalCode(warning.code)) return warning;
  for (const tolerance of profile.tolerate) {
    if (toleranceApplies(tolerance, warning)) {
      return profileQuirkApplied(warning, profile.name);
    }
  }
  return warning;
}

/**
 * Apply a profile across a whole warning list, returning a NEW array (the input is
 * never mutated). Returned unchanged (same reference contents, a shallow copy) when
 * `profile` is `undefined`, so the no-profile path pays only a copy. Every tolerated
 * warning is re-badged; every other warning passes through by identity, nothing is
 * dropped, reordered, or reallocated beyond the re-badge.
 *
 * @param warnings - The accumulated record warnings.
 * @param profile - The active profile, or `undefined` for no transform.
 * @returns A new array with tolerated warnings downgraded.
 * @example
 * ```ts
 * import { applyAstmProfileToWarnings, astmProfiles } from "@cosyte/astm";
 * const out = applyAstmProfileToWarnings(msgWarnings, astmProfiles.referenceCorpus);
 * ```
 */
export function applyAstmProfileToWarnings(
  warnings: readonly AstmRecordWarning[],
  profile: AstmProfile | undefined,
): AstmRecordWarning[] {
  if (profile === undefined) return [...warnings];
  return warnings.map((w) => applyAstmProfile(profile, w));
}

/**
 * The profile's transport override, if any: the value a consumer feeds to
 * `detectFraming(bytes, { override })` to force framed/raw and bypass leading-byte
 * auto-detection. `undefined` means "let detection decide."
 *
 * @param profile - The active profile, or `undefined`.
 * @returns `"framed"` / `"raw"` when the profile forces one, else `undefined`.
 * @example
 * ```ts
 * import { resolveProfileTransport, detectFraming, astmProfiles } from "@cosyte/astm";
 * const override = resolveProfileTransport(myRawTcpProfile);
 * const { framing } = detectFraming(bytes, override !== undefined ? { override } : {});
 * ```
 */
export function resolveProfileTransport(profile: AstmProfile | undefined): AstmFraming | undefined {
  return profile?.transport;
}
