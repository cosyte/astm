/**
 * The safety spine of the profile subsystem: the set of warning codes a profile is
 * **forbidden** to tolerate. A vendor profile exists to quiet known, benign
 * structural noise — never to hide a deviation that could change a clinical
 * reading or corrupt the wire.
 *
 * **Design: default-deny.** Rather than enumerate the *forbidden* codes (a list you
 * can forget to extend when a new warning ships — the exact incompleteness a
 * safety gate must not have), this module enumerates the tiny set of **explicitly
 * tolerable** codes and treats *every other* code, across all three registries
 * (record `ASTM_RECORD_*`, frame `ASTM_FRAME_*`, protocol `ASTM_LTP_*`), as
 * safety-critical. A warning code added in a future phase is therefore
 * safety-critical **by default** until someone deliberately, reviewably adds it to
 * the allow-list below. Widening the allow-list can only ever be an explicit,
 * argued act; forgetting to touch this file can never *weaken* the gate.
 *
 * The four tolerable codes are the only deviations that (a) are structural/
 * syntactic vendor noise and (b) **cannot alter, drop, or fabricate an extracted
 * value** — because a profile only ever re-badges a *warning*, never re-parses. In
 * every one, the underlying datum is already surfaced verbatim regardless of the
 * profile:
 *
 * - `ASTM_RECORD_UNKNOWN_TYPE` — an unmodeled record type, surfaced verbatim as an
 *   `unsupported` record carrying no interpreted clinical field.
 * - `ASTM_NONSTANDARD_DELIMITERS` — the header's own declared delimiters are read
 *   and honored either way; this only notes they differ from the canonical set.
 * - `ASTM_UNKNOWN_ESCAPE_SEQUENCE` — an unrecognized `&…&` body is **preserved
 *   byte-for-byte** in the decoded value (the escape codec never guesses); the
 *   warning is a purely syntactic advisory, the value is identical with or without
 *   the profile.
 * - `ASTM_RECORD_UNINTERPRETED_QUERY_STATUS` — a `Q`-record request-information
 *   status surfaced verbatim on a *request* record; the code set is paywalled and
 *   is never interpreted, profile or not.
 *
 * Everything a wrong value could hide from — a result value split ambiguity, an
 * undefined abnormal flag or result status, an unparseable reference range, absent
 * units, a mis-attached comment, a partial timestamp, a query-vs-result ambiguity,
 * a bad frame checksum / sequence gap / unterminated / oversize frame, an
 * ambiguous transport, an unexpected protocol event, or a rejected frame — is
 * forbidden.
 */

import { WARNING_CODES } from "../common/warnings.js";
import { FRAME_WARNING_CODES } from "../frames/warnings.js";
import { LTP_WARNING_CODES } from "../ltp/warnings.js";

import type { AnyAstmWarningCode } from "./types.js";

/**
 * The **only** warning codes a profile may list in its `tolerate` set — benign,
 * structural/syntactic vendor noise that cannot alter, drop, or fabricate an
 * extracted value. Frozen so it cannot be mutated at runtime to smuggle a code in.
 * Adding to this set is a deliberate, reviewable act (and each addition must be an
 * `expected: false` non-safety code by the same reasoning as the four here).
 *
 * @example
 * ```ts
 * import { TOLERABLE_CODES } from "@cosyte/astm";
 * TOLERABLE_CODES.has("ASTM_UNKNOWN_ESCAPE_SEQUENCE"); // true
 * TOLERABLE_CODES.has("ASTM_FRAME_BAD_CHECKSUM"); // false
 * ```
 */
export const TOLERABLE_CODES: ReadonlySet<AnyAstmWarningCode> = Object.freeze(
  new Set<AnyAstmWarningCode>([
    WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE,
    WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS,
    WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
    WARNING_CODES.ASTM_RECORD_UNINTERPRETED_QUERY_STATUS,
  ]),
);

/**
 * Every real warning code across the three registries — the universe the safety
 * gate reasons over. `PROFILE_QUIRK_APPLIED` is included (it is a real record code)
 * so a profile can never tolerate the marker itself.
 *
 * @internal
 */
const ALL_WARNING_CODES: readonly AnyAstmWarningCode[] = [
  ...Object.values(WARNING_CODES),
  ...Object.values(FRAME_WARNING_CODES),
  ...Object.values(LTP_WARNING_CODES),
];

/**
 * The set of every real warning code, for O(1) membership checks (used by the
 * validator to distinguish "unknown code" from "known but forbidden"). Frozen.
 *
 * @example
 * ```ts
 * import { ALL_ASTM_WARNING_CODES } from "@cosyte/astm";
 * ALL_ASTM_WARNING_CODES.has("ASTM_LTP_FRAME_REJECTED"); // true
 * ```
 */
export const ALL_ASTM_WARNING_CODES: ReadonlySet<AnyAstmWarningCode> = Object.freeze(
  new Set<AnyAstmWarningCode>(ALL_WARNING_CODES),
);

/**
 * The forbidden set — computed as **every known code minus the tolerable
 * allow-list**, so it is complete by construction. Frozen. A code appears here iff
 * it is a real warning code that is not in {@link TOLERABLE_CODES}.
 *
 * @example
 * ```ts
 * import { SAFETY_CRITICAL_CODES } from "@cosyte/astm";
 * SAFETY_CRITICAL_CODES.has("ASTM_RECORD_UNDEFINED_RESULT_STATUS"); // true
 * SAFETY_CRITICAL_CODES.has("ASTM_FRAME_BAD_CHECKSUM"); // true
 * ```
 */
export const SAFETY_CRITICAL_CODES: ReadonlySet<AnyAstmWarningCode> = Object.freeze(
  new Set<AnyAstmWarningCode>(ALL_WARNING_CODES.filter((c) => !TOLERABLE_CODES.has(c))),
);

/**
 * True when `code` is a known warning code that is **not** tolerable — i.e. a
 * profile may never list it. A code that is not a real warning code at all returns
 * `false` here (the validator reports "unknown code" separately, a distinct
 * failure with a distinct message).
 *
 * @param code - The warning code to test.
 * @returns `true` iff the code is a real code outside the tolerable allow-list.
 * @example
 * ```ts
 * import { isSafetyCriticalCode } from "@cosyte/astm";
 * isSafetyCriticalCode("ASTM_UNKNOWN_ESCAPE_SEQUENCE"); // false (tolerable)
 * isSafetyCriticalCode("ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT"); // true
 * ```
 */
export function isSafetyCriticalCode(code: string): boolean {
  return SAFETY_CRITICAL_CODES.has(code as AnyAstmWarningCode);
}
