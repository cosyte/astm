/**
 * Public barrel for the `@cosyte/astm` vendor-profile subsystem. Assembles the
 * `astmProfiles` namespace object (the built-ins) and re-exports the public profile
 * API: `defineAstmProfile`, the registry accessors, the apply helpers, the safety
 * set, the definition-time error, and the profile types.
 *
 * The individual built-ins are reached via `astmProfiles.referenceCorpus` etc., not
 * as top-level named exports — mirrors the sibling `profiles` namespace convention
 * ("default" is too generic for a top-level export).
 */

export { defineAstmProfile } from "./define.js";
export { AstmProfileDefinitionError } from "./errors.js";
export type {
  AstmProfile,
  DefineAstmProfileOptions,
  AstmQuirkTolerance,
  AstmQuirkMatch,
  AstmProfileProvenance,
  AnyAstmWarningCode,
} from "./types.js";
export {
  getAstmProfile,
  listAstmProfiles,
  setDefaultAstmProfile,
  getDefaultAstmProfile,
} from "./registry.js";
export { applyAstmProfile, applyAstmProfileToWarnings, resolveProfileTransport } from "./apply.js";
export {
  SAFETY_CRITICAL_CODES,
  TOLERABLE_CODES,
  ALL_ASTM_WARNING_CODES,
  isSafetyCriticalCode,
} from "./safety.js";

import { defaultProfile } from "./default.js";
import { referenceCorpus } from "./reference-corpus.js";

/**
 * Namespace object exposing the built-in profiles: the conservative `default`
 * baseline plus the evidence-backed `referenceCorpus` (grounded firsthand in the
 * redistributable OSS reference corpus), each authored via the public
 * `defineAstmProfile()` API and carrying its cited provenance. Named per-vendor
 * profiles (cobas / Sysmex / …) are **deferred** pending a firsthand
 * vendor-attributed quirk document — the engine fully supports them; we do not ship
 * ungrounded ones.
 *
 * @example
 * ```ts
 * import { parseAstmRecords, astmProfiles } from "@cosyte/astm";
 * const msg = parseAstmRecords(raw, { profile: astmProfiles.referenceCorpus });
 * msg.profile?.name; // "referenceCorpus"
 * ```
 */
export const astmProfiles = Object.freeze({
  default: defaultProfile,
  referenceCorpus,
}) as {
  readonly default: typeof defaultProfile;
  readonly referenceCorpus: typeof referenceCorpus;
};
