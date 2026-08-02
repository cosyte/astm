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
 * records by the same letter, so an unrecognized `Q` cost a host-query request its
 * `Q`-dominates guarantee: it read as a result set, and the
 * `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND` warning that flags that contradiction went
 * with it. In both cases `ASTM_RECORD_UNKNOWN_TYPE` is the only warning left on the
 * stream, while the allow-list still described it as harmless. Tolerating it
 * re-badged the single report that the reader had lost its place, and a strict parse
 * then accepted the stream. It is off the list for that reason, and its removal is
 * what part 2 above is written down to prevent a repeat of.
 *
 * The classifier no longer answers `results` over a letter it could not read (it
 * withholds the kind instead), so that particular misreading is closed at the
 * source as well as reported. The allow-list conclusion is unchanged either way:
 * part 2 asks whether anything **reads** the reported condition, and the classifier
 * still does, now to decide whether it may answer at all.
 *
 * **A third reader of record structure landed with
 * `ASTM_RECORD_FIELDS_UNSEPARATED`, and the allow-list was re-derived against it.**
 * That code reports a record the delimiters in force could not split at all, which
 * is one signature of a record being read in a set that is not its own. It is
 * safety-critical (it reports lost values, so it fails part 1 outright) and it is
 * on the forbidden side by construction, because that side is computed rather than
 * listed. What it required was re-reading the survivors below against it:
 * none of them is a statement about whether a record split, so none of them is now
 * hiding it. Note the code is deliberately **partial** (see its own docs): it does
 * not fire wherever a field went missing to a foreign delimiter set, only where the
 * field separator was absent outright, so it is a reader of record structure that
 * cannot be relied on as a sweep.
 *
 * **So the ones that remain are recorded with the reading each one survives**, not
 * merely with the value it preserves. Each was re-derived against both readers of
 * record structure above, plus the single-message / single-patient guards:
 *
 * - `ASTM_NONSTANDARD_DELIMITERS`: the header's own declared delimiters are read
 *   and honored either way, and this notes only that they differ from the canonical
 *   set. No reader sees them: the stream is cut into records on a line break,
 *   and a record's type letter is the first character of its line, both taken before
 *   any delimiter-driven tokenization runs. It survives the split reader too, and
 *   the distinction is worth stating precisely: this code says the declared set is
 *   unusual, `ASTM_RECORD_FIELDS_UNSEPARATED` says a record did not match the set in
 *   force. A stream may be wholly non-canonical and split perfectly, and a wholly
 *   canonical stream can still carry a record that does not split, so tolerating the
 *   first can never quiet the second.
 * - `ASTM_UNKNOWN_ESCAPE_SEQUENCE`: an unrecognized escape body is **preserved
 *   byte-for-byte** in the decoded value (the escape codec does not guess at one),
 *   so the value is identical with or without the profile. No reader sees it
 *   either: a decoded field value is never cut back into records, the type
 *   letter is read before decoding, and the split reader counts fields, which the
 *   escape-aware tokenizer has already finished dividing before any body is decoded.
 * - `ASTM_UNPAIRED_ESCAPE_CHARACTER`: an escape character heading no escape
 *   sequence, read as the **literal character it is** and kept byte-for-byte in the
 *   decoded value, so the value is identical with or without the profile. Note what
 *   makes this admissible is a property of the *parse*, not of the warning: reading
 *   the character as a literal is unconditional, and tolerating the code changes
 *   nothing about how the record splits. No reader sees it, on the same grounds as
 *   the entry above: the type letter is read before any decoding, the split reader
 *   counts fields the escape-aware tokenizer has already finished dividing, and a
 *   decoded value is never cut back into records. Contrast the condition it
 *   replaced, which **would** have failed part 1: reading the same character as an
 *   unterminated sequence merged every field after it into one, and a code reporting
 *   that would have been a report of lost values.
 * - `ASTM_RECORD_UNINTERPRETED_QUERY_STATUS`: a request-information status carried
 *   verbatim as a leaf field on a `Q` record; the code set is paywalled and is not
 *   interpreted, profile or not. Classification reads whether a `Q` record is
 *   *present*, never what this field says; grouping does not read `Q` at all; and the
 *   split reader is a count of fields, not a reading of any one of them, so a record
 *   carrying this warning has by definition already split.
 *
 * Everything a wrong value could hide from: a result value split ambiguity, an
 * undefined abnormal flag or result status, an unparseable reference range, absent
 * units, a mis-attached comment, a partial timestamp, a query-vs-result ambiguity,
 * an unrecognized record type, a record the delimiters in force could not split, a
 * bad frame checksum / sequence gap / unterminated / oversize frame, an ambiguous
 * transport, an unexpected protocol event, or a rejected frame: is forbidden.
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
 * which case the message kind is no longer knowable. Tolerating it can quiet the
 * only report either happened.
 *
 * `ASTM_RECORD_FIELDS_UNSEPARATED` is not on this list either, and never was. It
 * reports a record the delimiters in force could not split, so every modeled field
 * of that record is missing: it fails the first half of the test outright.
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
    WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER,
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
