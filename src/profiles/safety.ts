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
 * **A fourth and a fifth reader of record structure landed together, and the
 * allow-list was re-derived against them.** `ASTM_RECORD_DELIMITER_ROLE_COLLISION`
 * reports a header declaring one character in two of the repeat / component /
 * escape roles, so the boundary between those two roles is not in the bytes;
 * `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` reports an unrecognized escape body
 * that is itself a splitting delimiter, so the atom rule kept it out of the split.
 * Both are safety-critical by construction, because that side is computed rather
 * than listed. What they required was re-reading the survivors below against them,
 * and two of the four needed their arguments rewritten rather than merely
 * re-checked: each was, on its own, the *only* warning a stream exhibiting one of
 * these conditions raised. That is the state this file exists to prevent, and it is
 * why the remedy in both cases was a **second, narrower, non-tolerable code**
 * rather than striking the tolerable one off. Striking it off would have changed
 * behavior for every profile naming it while still leaving the two conditions
 * reported by codes that also fire on cases costing nothing.
 *
 * **A sixth reader landed with `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT`, and it is
 * the mirror of the fifth.** That code reports that the escape character closing an
 * unrecognized sequence could instead have opened one holding the delimiter that
 * split, so the bytes carry two alignments disagreeing by one boundary and the
 * leftmost was taken. It is safety-critical by construction, and the direction is
 * why it could not be left to the codes below: the fifth reports a boundary the
 * reading **lost**, this one a boundary the reading may have **gained**, and a
 * gained boundary hands back a value the sender's bytes do not unambiguously carry.
 * Both of the codes that condition previously raised are on the list below, so a
 * profile naming them left `{ strict: true }` accepting it. Re-reading the survivors
 * against it changed no admission and rewrote no argument: none of the four is a
 * statement about where a boundary was taken, and the new code is not tolerable, so
 * the same "a profile re-badges the code it names and no other" reason already
 * written under the two escape entries covers it.
 *
 * **A further reader landed with `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS`, and it is
 * the first one that reaches a MODELED SLOT rather than a boundary.** It reports
 * that a contested alignment decided a **field** boundary while the reading taken
 * resumes on an escape character heading no sequence, so every later field sits one
 * place further right than the competing alignment puts it. On a result record that
 * moves the units and the **result status**: the sender's trailing letter is read out
 * of field 9 under the reading taken and out of no field at all under the other, so a
 * status of `final` can be a consequence of the alignment rather than something the
 * sender wrote there. Until it existed the only warning on that stream was the
 * **tolerable** `ASTM_UNPAIRED_ESCAPE_CHARACTER`, so the widest gate-legal profile
 * plus `{ strict: true }` accepted a fabricated `final` on a lab result. It is
 * safety-critical by construction and must never be admitted. Re-reading the
 * survivors against it moved no admission, and the reason is worth stating because it
 * is not last time's: `ASTM_UNPAIRED_ESCAPE_CHARACTER` stays on the list because it
 * remains true and benign of every case that costs nothing (a bare escape character
 * in a value alters no boundary at all), and the case where it accompanies a shifted
 * field is now reported by a code no profile may re-badge.
 *
 * **So the ones that remain are recorded with the reading each one survives**, not
 * merely with the value it preserves. Each was re-derived against **every** reader of
 * record structure named above (this sentence deliberately names no count: it has
 * been corrected upward at every slice that landed one), plus the single-message /
 * single-patient guards:
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
 *
 *   **Its admission was resting on a set of declarations it does not distinguish,
 *   and no longer is.** A declaration naming one character in two roles is
 *   necessarily non-canonical, so this code fired on it, and until
 *   `ASTM_RECORD_DELIMITER_ROLE_COLLISION` existed it was the *only* warning such a
 *   stream raised: tolerating "the declared set is unusual" therefore quieted
 *   "the declared set cannot express the boundary it was read with". That second
 *   condition now has its own code, which is not tolerable, so what is left here is
 *   the honest statement it always meant to be: the set differs from the canonical
 *   one and was honored. The reason tolerating this one cannot quiet that one is the
 *   profile mechanism and nothing subtler: a profile re-badges the code it names and
 *   no other. It is **not** that the two conditions are independent. They are not:
 *   every colliding set is non-canonical, which is exactly why this bullet needed
 *   rewriting.
 * - `ASTM_UNKNOWN_ESCAPE_SEQUENCE`: an unrecognized escape body is **preserved
 *   byte-for-byte** in the decoded value (the escape codec does not guess at one),
 *   so the value is identical with or without the profile. A decoded field value is
 *   never cut back into records, the type letter is read before decoding, and the
 *   split reader counts fields the escape-aware tokenizer has already finished
 *   dividing, so none of those three sees it.
 *
 *   **Part 2 acquired a reader here, and it is named rather than left to be found.**
 *   `isSplittingDelimiter` in `../common/escapes.ts` runs **only** on the
 *   unrecognized-body condition this code reports, and decides out of it whether to
 *   raise `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`. That is a reader of the
 *   reported condition, which is exactly what part 2 asks about, so this entry no
 *   longer survives on "nothing reads it". It survives on a narrower and checkable
 *   claim: a profile tolerating a code re-badges **that code and no other**, so
 *   tolerating this one cannot quiet what the reader raises, and what it raises is
 *   not tolerable in any case. If a future reader of this same condition ever
 *   produces something a profile **can** tolerate, this entry stops being admissible
 *   and comes off the list.
 *
 *   **A second reader of the same condition landed, and it is named here for the
 *   same reason.** The mnemonic test in `../common/escapes.ts` is now asked twice:
 *   once by the decoder, to decide whether a body is recognized, and once by the
 *   escape-aware split, which raises `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT` only
 *   where an **unrecognized** body sits in a sequence a competing alignment would
 *   have aligned differently. That is the condition this code reports, read a second
 *   time, and this entry survives it on the same narrower claim: what that reader
 *   raises is a different code, which a profile cannot name and cannot tolerate.
 *
 *   **This entry used to be recorded as questionable, and what made it questionable
 *   is now a separate code that is not on this list.** The argument above is about
 *   the *decoded value*, and it holds. What it did not cover is that the
 *   escape-aware split itself treats an `&X&` triple as opaque, so where `X` is a
 *   delimiter that delimiter never became a boundary: the split the argument says
 *   has "already finished dividing" divided one time too few, and this code was the
 *   only report of it. Measured on the canonical set:
 *   `R|1|^^^687|28.6&|&U/L||||F` yields a value of `28.6&|&U/L`, no units, and status
 *   `unspecified` rather than `final`, and this was the sole warning, so a profile
 *   tolerating it (the shipped `referenceCorpus` does) let `{ strict: true }` accept
 *   it. That failed part 1 of the two-clause test on the reading, not on the value.
 *   `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` now fires **alongside** this code on
 *   exactly that subset and is safety-critical, so the lost boundary is reported by
 *   something no profile may tolerate and that same stream is refused under
 *   `{ strict: true }`. This code was **not** removed, for two reasons: removing it
 *   changes behavior for every profile naming it, and it remains true and benign of
 *   every unrecognized body that is not a delimiter in force, where the sequence is
 *   preserved byte-for-byte and no boundary is lost. What is scoped away here is a
 *   claim, not a guard. Do not close the underlying condition by narrowing the atom,
 *   which is what keeps `&F&` one token under a delimiter set that names `F` as a
 *   delimiter, and do not read the new code as a repair: the value is byte-identical
 *   to what it was, and only the reporting changed.
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
 *
 *   **The alignment reader is not a reader of this condition, and the distinction is
 *   worth stating rather than leaving to be checked.** It asks whether the character
 *   two positions past a sequence *is* the escape character, never whether that
 *   character heads a sequence of its own, which is the question this code answers.
 *   The two are independent in both directions, measured: `28.6&Z&|&U/L` raises this
 *   code and the alignment code together, and `28.6&Z&|&U&L` raises the alignment
 *   code with no unpaired character anywhere in it.
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
 * declaration naming one character in two roles, a delimiter an unrecognized escape
 * sequence kept out of the split, a boundary a competing escape alignment disagrees
 * about, a bad frame checksum / sequence gap / unterminated
 * / oversize frame, an ambiguous transport, an unexpected protocol event, or a
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
 * which case the message kind is no longer knowable. Tolerating it can quiet the
 * only report either happened.
 *
 * `ASTM_RECORD_FIELDS_UNSEPARATED` is not on this list either, and never was. It
 * reports a record the delimiters in force could not split, so every modeled field
 * of that record is missing: it fails the first half of the test outright.
 *
 * `ASTM_RECORD_DELIMITER_ROLE_COLLISION`,
 * `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` and
 * `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT` are not on this list and must not be
 * added to it. Each reports a boundary the reading cannot defend from the bytes (the
 * first two a boundary that is not in the reading, the third one that may not be in
 * the bytes), and each exists precisely because the only warnings its condition
 * previously raised were among the four below.
 *
 * `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS` is not on this list and must not be added
 * to it either, and it is the strongest case of the four: it reports not merely a
 * boundary but a modeled slot changing hands, up to and including a result status
 * reading `final` that the competing alignment of the same bytes puts in no field at
 * all.
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
