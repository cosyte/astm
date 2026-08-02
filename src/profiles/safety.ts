/**
 * The safety spine of the profile subsystem: the set of warning codes a profile is
 * **forbidden** to tolerate. A vendor profile exists to quiet known, benign
 * structural noise: never to hide a deviation that could change a clinical
 * reading, lose track of where one message ends, or corrupt the wire.
 *
 * **Design: default-deny.** Rather than enumerate the *forbidden* codes (a list you
 * can forget to extend when a new warning ships, the exact incompleteness a
 * safety gate must not have), this module enumerates the tiny set of **explicitly
 * tolerable** codes and treats *every other* code, across all three registries
 * (record `ASTM_RECORD_*`, frame `ASTM_FRAME_*`, protocol `ASTM_LTP_*`), as
 * safety-critical. A warning code added later is therefore
 * safety-critical **by default** until someone deliberately, reviewably adds it to
 * the allow-list below. Widening the allow-list can only ever be an explicit,
 * argued act; forgetting to touch this file can never *weaken* the gate.
 *
 * **The test for admitting a code has two parts, and the second one is easy to
 * miss.** A code may sit on the allow-list only while
 *
 * 1. it is structural or syntactic noise that **cannot alter, drop, or fabricate
 *    an extracted value** (a profile re-badges a *warning*, it never re-parses, so
 *    the underlying datum is surfaced identically with or without the profile);
 *    **and**
 * 2. **nothing else in this package reads the condition the warning reports.**
 *
 * Part 2 is a claim about the whole library, not about the warning, and it is the
 * part that can stop being true without anyone touching this file. A code admitted
 * as benign stops being benign the moment a later feature starts making a decision
 * out of the very condition the warning is reporting, and adding that feature does
 * not force this file to be revisited. That is not hypothetical: it happened once
 * here, to `ASTM_RECORD_UNKNOWN_TYPE`, and the consequence was a wrong-patient
 * path.
 *
 * **A record's type letter acquired two load-bearing readers, and the code was
 * admitted before either existed.** Message grouping reads the letter to decide
 * where one message ends and the next begins, so an unrecognized header opens no
 * message and two messages are read as one, pairing a patient with results that
 * arrived under a different header. Message classification counts `Q` / `R` / `O`
 * records by the same letter, so an unrecognized `Q` costs a host-query request its
 * `Q`-dominates guarantee: it reads as a result set, and the
 * `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND` warning that flags that contradiction goes
 * with it. In both cases `ASTM_RECORD_UNKNOWN_TYPE` is the only warning left on the
 * stream, while the allow-list still described it as harmless. Tolerating it
 * re-badged the single report that the reader had lost its place, and a strict parse
 * then accepted the stream. It is off the list for that reason, and its removal is
 * what part 2 above is written down to prevent a repeat of.
 *
 * **So the three that remain are recorded with the reading each one survives**, not
 * merely with the value it preserves. Each was re-derived against both readers of
 * record structure above, plus the single-message / single-patient guards:
 *
 * - `ASTM_NONSTANDARD_DELIMITERS`: the header's own declared delimiters are read
 *   and honored either way, and this notes only that they differ from the canonical
 *   set. Neither reader sees them: the stream is cut into records on a line break,
 *   and a record's type letter is the first character of its line, both taken before
 *   any delimiter-driven tokenization runs.
 * - `ASTM_UNKNOWN_ESCAPE_SEQUENCE`: an unrecognized escape body is **preserved
 *   byte-for-byte** in the decoded value (the escape codec does not guess at one),
 *   so the value is identical with or without the profile. Neither reader sees it
 *   either: a decoded field value is never cut back into records, and the type
 *   letter is read before decoding.
 * - `ASTM_RECORD_UNINTERPRETED_QUERY_STATUS`: a request-information status carried
 *   verbatim as a leaf field on a `Q` record; the code set is paywalled and is not
 *   interpreted, profile or not. Classification reads whether a `Q` record is
 *   *present*, never what this field says, and grouping does not read `Q` at all.
 *
 * Everything a wrong value could hide from: a result value split ambiguity, an
 * undefined abnormal flag or result status, an unparseable reference range, absent
 * units, a mis-attached comment, a partial timestamp, a query-vs-result ambiguity,
 * an unrecognized record type, a bad frame checksum / sequence gap / unterminated /
 * oversize frame, an ambiguous transport, an unexpected protocol event, or a
 * rejected frame: is forbidden.
 *
 * **What this file cannot do for you.** Part 2 is a review obligation, not a
 * mechanical one. There is no honest automatic check for "nothing load-bearing
 * reads this", because deciding whether a future reader of record structure has put
 * an allow-listed code back in the path takes reading the reader. What is
 * mechanical is the direction of the failure: default-deny means a *new* code is
 * refused until argued in, so the residual risk is confined to the small, explicit
 * list below. Re-derive that list whenever something new starts reading record
 * structure.
 */

import { WARNING_CODES } from "../common/warnings.js";
import { FRAME_WARNING_CODES } from "../frames/warnings.js";
import { LTP_WARNING_CODES } from "../ltp/warnings.js";

import type { AnyAstmWarningCode } from "./types.js";

/**
 * The **only** warning codes a profile may list in its `tolerate` set: benign
 * structural or syntactic vendor noise that cannot alter, drop, or fabricate an
 * extracted value, **and** whose reported condition nothing else in this package
 * reads: not to decide where one message ends and the next begins, and not to
 * decide what kind of message it is. Frozen so it cannot be mutated at runtime to
 * smuggle a code in. Adding to this set is a deliberate, reviewable act, and an
 * addition has to satisfy both halves of that test, not just the first.
 *
 * `ASTM_RECORD_UNKNOWN_TYPE` is **not** on this list, and used to be. An
 * unrecognized record type may be a header the reader did not recognize as one, in
 * which case two messages have been read as one, or a `Q` it did not recognize, in
 * which case a host-query request reads as a result set. Tolerating it can quiet
 * the only report either happened.
 *
 * @example
 * ```ts
 * import { TOLERABLE_CODES } from "@cosyte/astm";
 * TOLERABLE_CODES.has("ASTM_UNKNOWN_ESCAPE_SEQUENCE"); // true
 * TOLERABLE_CODES.has("ASTM_RECORD_UNKNOWN_TYPE"); // false
 * TOLERABLE_CODES.has("ASTM_FRAME_BAD_CHECKSUM"); // false
 * ```
 */
export const TOLERABLE_CODES: ReadonlySet<AnyAstmWarningCode> = Object.freeze(
  new Set<AnyAstmWarningCode>([
    WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS,
    WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
    WARNING_CODES.ASTM_RECORD_UNINTERPRETED_QUERY_STATUS,
  ]),
);

/**
 * Every real warning code across the three registries: the universe the safety
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
 * The forbidden set: computed as **every known code minus the tolerable
 * allow-list**, so it is complete by construction. Frozen. A code appears here iff
 * it is a real warning code that is not in {@link TOLERABLE_CODES}.
 *
 * @example
 * ```ts
 * import { SAFETY_CRITICAL_CODES } from "@cosyte/astm";
 * SAFETY_CRITICAL_CODES.has("ASTM_RECORD_UNDEFINED_RESULT_STATUS"); // true
 * SAFETY_CRITICAL_CODES.has("ASTM_RECORD_UNKNOWN_TYPE"); // true
 * SAFETY_CRITICAL_CODES.has("ASTM_FRAME_BAD_CHECKSUM"); // true
 * ```
 */
export const SAFETY_CRITICAL_CODES: ReadonlySet<AnyAstmWarningCode> = Object.freeze(
  new Set<AnyAstmWarningCode>(ALL_WARNING_CODES.filter((c) => !TOLERABLE_CODES.has(c))),
);

/**
 * True when `code` is a known warning code that is **not** tolerable: i.e. a
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
 * isSafetyCriticalCode("ASTM_RECORD_UNKNOWN_TYPE"); // true (it can mean a lost message boundary)
 * ```
 */
export function isSafetyCriticalCode(code: string): boolean {
  return SAFETY_CRITICAL_CODES.has(code as AnyAstmWarningCode);
}
