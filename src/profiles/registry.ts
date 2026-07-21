/**
 * The profile **registry**: the named built-in set (with provenance) plus a
 * process-scoped default. Mirrors the sibling `@cosyte/hl7` / `@cosyte/ccda`
 * `set/getDefault*Profile` convention. `parseAstmRecords(raw)` with no explicit
 * `profile` option consults {@link getDefaultAstmProfile}; an explicit `profile`
 * option always wins, and `profile: null` opts out of the default for a single call.
 *
 * The single mutable module-scoped `let` is the only such state in the profile
 * subsystem — an intentional, documented trade-off (identical to the siblings).
 * Tests that set a default MUST clear it in teardown (`setDefaultAstmProfile(null)`)
 * to avoid cross-test bleed.
 */

import { defaultProfile } from "./default.js";
import { referenceCorpus } from "./reference-corpus.js";
import type { AstmProfile } from "./types.js";

/**
 * The built-in profiles, keyed by name. Each carries its own provenance (except the
 * conservative `default` baseline).
 *
 * @internal
 */
const BUILT_INS: ReadonlyMap<string, AstmProfile> = new Map<string, AstmProfile>([
  [defaultProfile.name, defaultProfile],
  [referenceCorpus.name, referenceCorpus],
]);

/**
 * Look up a built-in profile by name. Returns `undefined` when no built-in has that
 * name (a user-defined profile is not in this registry — pass it directly).
 *
 * @param name - The built-in profile name.
 * @returns The profile, or `undefined`.
 * @example
 * ```ts
 * import { getAstmProfile } from "@cosyte/astm";
 * getAstmProfile("referenceCorpus")?.provenance?.source;
 * ```
 */
export function getAstmProfile(name: string): AstmProfile | undefined {
  return BUILT_INS.get(name);
}

/**
 * The names of every built-in profile, in registration order.
 *
 * @returns The built-in names.
 * @example
 * ```ts
 * import { listAstmProfiles } from "@cosyte/astm";
 * listAstmProfiles(); // ["default", "referenceCorpus"]
 * ```
 */
export function listAstmProfiles(): readonly string[] {
  return Object.freeze([...BUILT_INS.keys()]);
}

/**
 * Process-scoped default profile. `undefined` means "unset" — `parseAstmRecords`
 * applies no profile in that state.
 *
 * @internal
 */
let _defaultProfile: AstmProfile | undefined = undefined;

/**
 * Register a process-scoped default profile that `parseAstmRecords(raw)` applies
 * when no explicit `profile` option is passed. Pass `null` (or `undefined`) to
 * clear. An explicit `parseAstmRecords(raw, { profile })` always wins;
 * `{ profile: null }` opts out of the default for a single call.
 *
 * **Test hygiene:** the only mutable module-scoped state here — tests that call this
 * MUST clear it in teardown or default-profile bleed infects later tests.
 *
 * @param profile - The profile to register as default, or `null` to clear.
 * @example
 * ```ts
 * import { setDefaultAstmProfile, astmProfiles, parseAstmRecords } from "@cosyte/astm";
 * setDefaultAstmProfile(astmProfiles.referenceCorpus);
 * const msg = parseAstmRecords(raw); // uses referenceCorpus
 * setDefaultAstmProfile(null); // clear
 * ```
 */
export function setDefaultAstmProfile(profile: AstmProfile | null): void {
  _defaultProfile = profile ?? undefined;
}

/**
 * Return the current process-scoped default profile, or `undefined` if none is
 * registered.
 *
 * @returns The default profile, or `undefined`.
 * @example
 * ```ts
 * import { getDefaultAstmProfile } from "@cosyte/astm";
 * const p = getDefaultAstmProfile();
 * if (p !== undefined) console.log("default profile:", p.name);
 * ```
 */
export function getDefaultAstmProfile(): AstmProfile | undefined {
  return _defaultProfile;
}
