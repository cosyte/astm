/**
 * Validation helpers for `defineAstmProfile`. Every validator returns `void` on
 * success and throws {@link AstmProfileDefinitionError} on failure. The name
 * validator is split out so the factory can call it FIRST and pass `opts.name` to
 * every subsequent throw site (a bad-tolerance error should name the profile it
 * came from).
 *
 * The load-bearing check is {@link validateTolerations}: it refuses any `tolerate`
 * entry whose code is unknown, whose rationale is empty, or — the safety rule —
 * whose code is **safety-critical** (default-deny; see `src/profiles/safety.ts`).
 * That refusal is what lets the rest of the system treat "an active profile" as
 * safe by construction: it can only ever quiet a benign, value-preserving warning.
 *
 * Zero runtime deps — inlined Levenshtein for the "did you mean?" hint.
 *
 * @internal
 */

import { AstmProfileDefinitionError } from "./errors.js";
import { ALL_ASTM_WARNING_CODES, isSafetyCriticalCode } from "./safety.js";
import type { AstmQuirkTolerance, DefineAstmProfileOptions } from "./types.js";

/**
 * Known top-level option keys accepted by `defineAstmProfile`. Any key outside this
 * list throws with an optional Levenshtein-based "did you mean?" hint.
 *
 * @internal
 */
const KNOWN_OPTION_KEYS: readonly string[] = [
  "name",
  "description",
  "tolerate",
  "transport",
  "provenance",
  "extends",
];

/** The two legal {@link AstmFraming} values a profile's `transport` may take. */
const KNOWN_TRANSPORTS: readonly string[] = ["framed", "raw"];

/**
 * Iterative DP Levenshtein distance. Zero-dep, ≤15 LoC; used only for the
 * unknown-option-key hint.
 *
 * @internal
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev: number[] = [];
  for (let j = 0; j <= b.length; j++) prev.push(j);
  for (let i = 1; i <= a.length; i++) {
    const curr: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr.push(Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost));
    }
    prev = curr;
  }
  return prev[b.length] ?? 0;
}

/**
 * Validate the profile NAME (fail-fast). Throws on null/undefined opts, a
 * non-string name, or an empty/whitespace-only name.
 *
 * @internal
 */
export function validateProfileName(opts: DefineAstmProfileOptions): void {
  if (opts === null || opts === undefined) {
    throw new AstmProfileDefinitionError(
      `defineAstmProfile: options is required and must be an object. Received: ${String(opts)}.`,
    );
  }
  if (typeof opts.name !== "string") {
    throw new AstmProfileDefinitionError(
      "defineAstmProfile: 'name' is required and must be a non-empty string. " +
        `Received: ${JSON.stringify((opts as { name?: unknown }).name)}.`,
    );
  }
  if (opts.name.trim().length === 0) {
    throw new AstmProfileDefinitionError(
      "defineAstmProfile: 'name' is required and must be a non-empty string. " +
        `Received: ${JSON.stringify(opts.name)}.`,
      opts.name,
    );
  }
}

/**
 * Validate TOP-LEVEL option keys. Throws on any unknown key with a
 * Levenshtein-based hint when the edit distance to a known key is ≤ 2.
 *
 * @internal
 */
export function validateOptionKeys(opts: DefineAstmProfileOptions): void {
  for (const key of Object.keys(opts)) {
    if (KNOWN_OPTION_KEYS.includes(key)) continue;
    let hint: string | undefined;
    for (const known of KNOWN_OPTION_KEYS) {
      if (levenshtein(key, known) <= 2) {
        hint = known;
        break;
      }
    }
    throw new AstmProfileDefinitionError(
      `Profile '${opts.name}' has unknown option key '${key}'. ` +
        (hint !== undefined ? `Did you mean '${hint}'? ` : "") +
        `Known keys: ${KNOWN_OPTION_KEYS.join(", ")}.`,
      opts.name,
    );
  }
}

/**
 * Validate the optional `transport` override: absent, or exactly `"framed"` /
 * `"raw"`. A profile that forces framing must force a real framing.
 *
 * @internal
 */
export function validateTransport(opts: DefineAstmProfileOptions): void {
  if (opts.transport === undefined) return;
  if (typeof opts.transport !== "string" || !KNOWN_TRANSPORTS.includes(opts.transport)) {
    throw new AstmProfileDefinitionError(
      `Profile '${opts.name}' has an invalid 'transport' ${JSON.stringify(opts.transport)}. ` +
        `It must be one of: ${KNOWN_TRANSPORTS.join(", ")}.`,
      opts.name,
    );
  }
}

/**
 * Validate a `tolerate` list: every entry's `code` must be a real warning code,
 * must **not** be safety-critical (default-deny), and must carry a non-empty
 * `rationale` (a tolerated deviation without a stated, grounded reason is exactly
 * the "invented quirk" the anti-invention rule forbids). Runs post-merge so a
 * tolerance inherited from a rogue parent is caught too.
 *
 * @internal
 */
export function validateTolerations(
  tolerate: readonly AstmQuirkTolerance[],
  profileName: string,
): void {
  for (const t of tolerate) {
    if (typeof t.code !== "string" || !ALL_ASTM_WARNING_CODES.has(t.code)) {
      throw new AstmProfileDefinitionError(
        `Profile '${profileName}' tolerate entry has unknown warning code ${JSON.stringify(t.code)}. ` +
          `Only real codes from the record / frame / LTP registries may be named.`,
        profileName,
      );
    }
    if (isSafetyCriticalCode(t.code)) {
      throw new AstmProfileDefinitionError(
        `Profile '${profileName}' may not tolerate '${t.code}' — it is a safety-critical warning ` +
          `code (a result value / flag / status / range / units, patient or comment context, ` +
          `message-kind ambiguity, code system, or a frame / LTP integrity warning). A profile quiets ` +
          `benign structural noise, never a deviation that could change a clinical reading or corrupt ` +
          `the wire — it can never make a bad checksum "ok" or a cancelled result read "final."`,
        profileName,
      );
    }
    if (typeof t.rationale !== "string" || t.rationale.trim().length === 0) {
      throw new AstmProfileDefinitionError(
        `Profile '${profileName}' tolerate entry for '${t.code}' needs a non-empty 'rationale' ` +
          `documenting the real, grounded deviation it expects.`,
        profileName,
      );
    }
  }
}
