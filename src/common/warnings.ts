/**
 * Tier-2 warning registry and factories for the `@cosyte/astm` record parser.
 *
 * A warning is the lenient parser's record of a tolerated deviation: it never
 * throws, never drops data, and never fabricates a value. Consumers compare
 * `warning.code === WARNING_CODES.<CODE>` to react; renaming a code is a
 * **breaking change**. Every warning carries a stable code plus a
 * {@link AstmPosition} and **never** a field value (PHI discipline).
 */

import type { AstmPosition } from "./position.js";

/**
 * Stable string codes for every Tier-2 warning the record parser may emit.
 * `key === value` so `Object.values(...)` yields a stable snapshot set.
 *
 * @example
 * ```ts
 * import { parseAstmRecords, WARNING_CODES } from "@cosyte/astm";
 * const msg = parseAstmRecords("H|\\^&\rL|1\r");
 * msg.warnings.some((w) => w.code === WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE);
 * ```
 */
export const WARNING_CODES = {
  /**
   * A record's type letter is not one of the modeled types: surfaced as an unsupported record,
   * never dropped. Treat it as a possible lost message boundary, because a header the reader did
   * not recognize as one does not open a new message.
   */
  ASTM_RECORD_UNKNOWN_TYPE: "ASTM_RECORD_UNKNOWN_TYPE",
  /**
   * The delimiters in force found **no field separator at all** in a record that carries content
   * beyond its type letter, so the whole record read back as a single field and none of its modeled
   * fields could be recovered. The raw line is surfaced intact and nothing is dropped, but on a
   * result record it means the value, the units and the status are all absent from the parsed model.
   *
   * This is one signature of a record being read with a delimiter set that does not belong to it,
   * which is how a delimiter-scoping mistake turns into lost values. It is reported rather than
   * repaired, because recovering the fields would mean guessing which set the sender meant.
   *
   * **Its absence is not evidence that a record was read in its own set.** This tests one of the
   * four delimiter roles, the field separator, and only in its total form, where that separator
   * occurs in the line (unescaped). Two whole classes of the same loss are outside it: a foreign set
   * whose field separator happens to occur somewhere in the line still splits (on the wrong
   * boundaries, silently, and this can happen to one record inside a run of these warnings); and a
   * set differing in the repeat, component or escape role usually splits into fields normally,
   * where a mis-split component can cost a test identity while the value survives, and where an
   * `&X&` sequence whose body is a delimiter is an opaque atom, so that delimiter does not split
   * and every field after it shifts. The escape role's worst case has narrowed and not
   * disappeared: an escape character heading no sequence is now read as a literal and reported
   * under {@link WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER} rather than merging the rest of the
   * record, and a delimiter swallowed inside an `&X&` body now raises
   * {@link WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE} as well as the tolerable
   * {@link WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE}, though it still splits the same way. Treat this code as a
   * report that one record definitely lost its fields, never as a sweep that would have fired if
   * any had.
   */
  ASTM_RECORD_FIELDS_UNSEPARATED: "ASTM_RECORD_FIELDS_UNSEPARATED",
  /** The header declared delimiters other than the canonical `H|\^&`: tolerated, noted. */
  ASTM_NONSTANDARD_DELIMITERS: "ASTM_NONSTANDARD_DELIMITERS",
  /**
   * A header declared **one character in two roles**, so the boundary between those two roles is
   * not recoverable from the bytes. The declaration is still read and honored and no record is
   * dropped: what is gone is a distinction the sender's own bytes no longer carry.
   *
   * The field separator is not part of this: a declaration naming it in another role is refused
   * earlier (the `ASTM_RECORD_UNDECLARED_DELIMITERS` fatal on the first header,
   * {@link WARNING_CODES.ASTM_RECORD_UNREADABLE_REDECLARATION} on a later one). What this code
   * covers is the three unordered pairs among the rest: **repeat/component, repeat/escape,
   * component/escape**.
   *
   * Measured on `H|^^&` (repeat and component both `^`): the field `A^B^C^D` reads back as four
   * repeats of one component each, so `components` holds only `A` and a two-repeats-of-two-components
   * reading cannot be recovered. Measured on `H|\&&` (component and escape both `&`): `A&B` splits
   * into two components while `A&F&B` reads as the single component `A|B`, so the same character
   * means two different things depending on what follows it.
   *
   * **It is not tolerable**, and the reason is the pair it travels with: such a set is always
   * non-canonical, so before this code existed the only warning on the stream was
   * {@link WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS}, which a profile may tolerate. That made a
   * structurally unreadable declaration indistinguishable, to a strict consumer, from an ordinary
   * vendor set. Emit refuses the same sets outright (`ASTM_EMIT_INVALID_DELIMITERS`).
   *
   * One warning per header that declares such a set, not one per colliding pair.
   */
  ASTM_RECORD_DELIMITER_ROLE_COLLISION: "ASTM_RECORD_DELIMITER_ROLE_COLLISION",
  /**
   * An escape sequence whose body was **not** a recognized mnemonic held a character that is one of
   * the three splitting delimiters in force, and the atom rule (an `&X&` triple is opaque) kept it
   * out of the split, so a boundary the bytes carried never became one. The sequence is preserved
   * verbatim in the value; nothing is dropped and nothing is re-split.
   *
   * Measured on the canonical set: `R|1|^^^687|28.6&|&U/L||||F` reads `value` = `28.6&|&U/L`, with
   * **no units** and status `unspecified` rather than `final`.
   *
   * **This is the code that says a boundary was lost.** The same condition also raises
   * {@link WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE}, which stays and stays tolerable: that code
   * reports only that a body was not recognized, which is true of bodies that cost nothing. This one
   * is the narrower, safety-critical half, and no profile may tolerate it.
   *
   * **What it does not do is repair anything.** The atom rule is unchanged (it is what keeps `&F&`
   * one token under a set that names `F` as a delimiter), so the value is byte-identical to what it
   * was before this code existed. It also cannot see the condition through a re-emit: emit rewrites
   * the preserved sequence into recognized mnemonics, and the resulting stream says that value
   * unambiguously, so a second-generation read is silent and correct about its own bytes. The place
   * to catch this is the first read of the wire bytes, which is where it now refuses a strict parse.
   */
  ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE: "ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE",
  /** An escape sequence body was not one of `&F&`/`&S&`/`&R&`/`&E&`: preserved verbatim. */
  ASTM_UNKNOWN_ESCAPE_SEQUENCE: "ASTM_UNKNOWN_ESCAPE_SEQUENCE",
  /**
   * An escape character appeared where no escape sequence starts (an escape sequence is the escape
   * character, one body character, and the escape character again). It is read as the **literal
   * character it is** and kept byte-for-byte in the decoded value. Nothing is dropped and no byte is
   * invented: this flags that the sender did not write the character the spec-clean way, which
   * is `&E&`.
   *
   * **What it replaced is the reason it exists.** The codec used to read such a character as the
   * opening of a sequence that never closed and merge the whole remainder of the record into the
   * field it sat in, reporting nothing at all. One `&` in a result value cost the units, the
   * abnormal flag and the status together and left the status reading `unspecified` rather than
   * `final`; one in a surname cost the patient's birth date and sex. Emit then re-escaped the merged
   * text into a spec-clean-looking line that read back as the same wrong value, so the mis-read
   * survived a round trip without ever surfacing.
   *
   * **This code is not a statement about the rest of the record.** It reports one character. A
   * *different* escape character in the same record may still head a real three-character sequence,
   * and if that sequence's body happens to be a delimiter (`&|&` under the canonical set) the atom
   * rule means that delimiter does not split. That case is reported separately, under
   * {@link WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE}, and it still costs a field
   * boundary.
   */
  ASTM_UNPAIRED_ESCAPE_CHARACTER: "ASTM_UNPAIRED_ESCAPE_CHARACTER",
  /**
   * A result value field carried an *unescaped* component delimiter, so it split into more than one
   * component. Both the full raw value and the split are surfaced and this warning fires: the
   * ambiguity is never resolved silently into a truncated value.
   */
  ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT: "ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT",
  /**
   * A result's abnormal-flag field (`R` field 7) carried a letter outside HL7 Table 0078. The flag is
   * surfaced as `undefined`: never dropped, and **never coerced to `normal`** (a clinical error).
   */
  ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG: "ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG",
  /**
   * A result's status field (`R` field 9) carried a letter that is not a recognized status. It is
   * surfaced as `undefined` and, like every non-`F` status, never reads as active-final.
   */
  ASTM_RECORD_UNDEFINED_RESULT_STATUS: "ASTM_RECORD_UNDEFINED_RESULT_STATUS",
  /**
   * A result's reference-range field (`R` field 6) did not match a recognized form (`low-high`,
   * `<high`, `>low`). The text is surfaced verbatim as `unparsed`: a bound is **never fabricated**.
   */
  ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE: "ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE",
  /**
   * A result carried a numeric value but no units (`R` field 5 empty). Units are vendor free text
   * (not UCUM); a missing unit is flagged here and **never defaulted, guessed, or converted**.
   */
  ASTM_RECORD_UNITS_ABSENT: "ASTM_RECORD_UNITS_ABSENT",
  /**
   * A `C` (comment) record had no valid preceding `H`/`P`/`O`/`R` parent: an **orphan**. The comment
   * is attached to the message root (`attachedToRoot: true`) and surfaced, **never dropped**.
   */
  ASTM_RECORD_ORPHAN_COMMENT: "ASTM_RECORD_ORPHAN_COMMENT",
  /**
   * A `YYYYMMDDHHMMSS` timestamp had an odd digit run that truncates a two-digit component in half
   * (e.g. a partial day/hour). The raw run is preserved and the structured value stops at the last
   * **complete** component: the dangling digit is **never zero-filled into a fabricated time**.
   */
  ASTM_RECORD_PARTIAL_TIMESTAMP: "ASTM_RECORD_PARTIAL_TIMESTAMP",
  /**
   * A `Q` (request-information) record carried a request-information status code (field 13). The code
   * *set* is `[OSS-derived / paywalled]` with no publicly-groundable enumeration, so the parser
   * interprets **none** of them: the status is surfaced verbatim and this value-free warning flags that
   * it was passed through **uninterpreted**, never mapped to a guessed meaning.
   */
  ASTM_RECORD_UNINTERPRETED_QUERY_STATUS: "ASTM_RECORD_UNINTERPRETED_QUERY_STATUS",
  /**
   * A message carried **both** a `Q` (request) and an `R` (result) record: a contradictory shape. The
   * message is classified `host-query` (the `Q` **dominates**, so it is never read as a result set) and
   * this warning flags the anomaly. Positional context only; no field value.
   */
  ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND: "ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND",
  /**
   * A later `H` (header) record declared a **different** delimiter set from the one in force, and the
   * parser **followed it**: that header and every record after it are read with the newly-declared
   * delimiters, until the next `H`. Records already read keep the set that was in force when they were
   * read: a redeclaration never reinterprets bytes that have already been consumed.
   *
   * A stream carrying several messages back to back is ordinary, and a header that simply **repeats**
   * the delimiters already in force is a no-op that warns nothing. This code fires only when the set
   * actually changes, because that is the point at which a reader still using the old set would begin
   * merging fields together.
   */
  ASTM_RECORD_DELIMITERS_REDECLARED: "ASTM_RECORD_DELIMITERS_REDECLARED",
  /**
   * A later `H` (header) record could not declare a usable delimiter set: it was too short, or the
   * field separator it named also appeared among the other three, leaving the four roles
   * indistinguishable. The delimiters **already in force are kept** and every record is still surfaced;
   * a set is never guessed and no record is dropped.
   *
   * The same condition on the *first* header is unrecoverable and remains the
   * `ASTM_RECORD_UNDECLARED_DELIMITERS` fatal: there is no earlier set to fall back to.
   */
  ASTM_RECORD_UNREADABLE_REDECLARATION: "ASTM_RECORD_UNREADABLE_REDECLARATION",
  /**
   * The downgraded form an active vendor {@link AstmProfile} produces from a deviation it *expects*
   * (see `src/profiles/`). The original warning is **never dropped**: its code moves to
   * {@link AstmRecordWarning.toleratedCode}, the warning is re-badged `PROFILE_QUIRK_APPLIED` with
   * `expected: true` and the tolerating profile named, so a consumer can filter known, grounded noise
   * while the fact of the deviation, and where it was, survives. A profile can only ever reach this
   * path for a **non-safety-critical** code (enforced at profile-definition time); a safety-critical
   * deviation (a result value, flag, status, patient identifier, code system, or a frame-integrity
   * warning) can **never** be tolerated, so it can never be re-badged here.
   */
  PROFILE_QUIRK_APPLIED: "PROFILE_QUIRK_APPLIED",
} as const;

/**
 * Discriminant type for {@link AstmRecordWarning.code}. Narrowing by this code
 * lets consumers write exhaustive `switch` blocks and guarantees a typo-free
 * comparison against {@link WARNING_CODES}.
 */
export type WarningCode = (typeof WARNING_CODES)[keyof typeof WARNING_CODES];

/**
 * A single Tier-2 warning: a stable code, a value-free human-readable message,
 * and positional context. Plain data, accumulated onto `AstmMessage.warnings`.
 *
 * @example
 * ```ts
 * import type { AstmRecordWarning } from "@cosyte/astm";
 * const w: AstmRecordWarning = {
 *   code: "ASTM_RECORD_UNKNOWN_TYPE",
 *   message: "Unknown record type.",
 *   position: { recordIndex: 2, recordType: "Z" },
 * };
 * ```
 */
export interface AstmRecordWarning {
  readonly code: WarningCode;
  /** Human-readable detail for logs. Never contains a field value. */
  readonly message: string;
  readonly position: AstmPosition;
  /**
   * `true` when an active vendor {@link AstmProfile} *expected* this deviation and re-badged it as a
   * {@link WARNING_CODES.PROFILE_QUIRK_APPLIED}. An `expected` warning does **not** escalate to a
   * thrown `AstmStrictError` in strict mode (the whole point of the profile is that this deviation is
   * known and benign): it is still recorded, so nothing is hidden. Absent on an untolerated warning.
   */
  readonly expected?: boolean;
  /** The name of the {@link AstmProfile} that tolerated this warning, when `expected`. */
  readonly profile?: string;
  /**
   * When `code` is {@link WARNING_CODES.PROFILE_QUIRK_APPLIED}, the original warning code the profile
   * tolerated, so a consumer can still see *which* deviation was re-badged as expected.
   */
  readonly toleratedCode?: WarningCode;
}

/**
 * Build an `ASTM_RECORD_UNKNOWN_TYPE` warning. The record is still surfaced (as
 * an unsupported record), never dropped.
 *
 * **This one is not cosmetic.** Message grouping decides where a message starts by
 * reading each record's type letter, so an unrecognized letter may be a header the
 * reader failed to see, and two messages then read as one. A profile is therefore
 * not permitted to tolerate this code.
 *
 * @example
 * ```ts
 * import { unknownRecordType } from "@cosyte/astm";
 * unknownRecordType({ recordIndex: 3, recordType: "Z" });
 * ```
 */
export function unknownRecordType(position: AstmPosition): AstmRecordWarning {
  return {
    code: WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE,
    message:
      "Unrecognized record type, surfaced verbatim as an unsupported record. " +
      "If this record was a header, message grouping did not open a new message here.",
    position,
  };
}

/**
 * Build an `ASTM_RECORD_FIELDS_UNSEPARATED` warning. The raw line is surfaced
 * intact; what is lost is every **modeled** field of the record, because the
 * delimiters in force never split it.
 *
 * **This one is not cosmetic either.** A record with content but no field
 * separator is a record being read with a delimiter set that does not belong to
 * it, and on a result record that costs the value, the units and the status in
 * one go. The fields are not reconstructed, because doing so would mean guessing
 * which set the sender meant, so a profile is not permitted to tolerate this code.
 *
 * **It is a report, not a sweep.** See {@link WARNING_CODES} for the two classes
 * of the same loss it does not see: its absence never certifies a record split
 * correctly.
 *
 * @example
 * ```ts
 * import { fieldsUnseparated } from "@cosyte/astm";
 * fieldsUnseparated({ recordIndex: 4, recordType: "R" });
 * ```
 */
export function fieldsUnseparated(position: AstmPosition): AstmRecordWarning {
  return {
    code: WARNING_CODES.ASTM_RECORD_FIELDS_UNSEPARATED,
    message:
      "The delimiters in force found no field separator in this record, so its whole content read " +
      "back as one field and none of its modeled fields could be recovered. The raw line is " +
      "surfaced intact, and no field is reconstructed, because the set the sender used is unknown.",
    position,
  };
}

/**
 * Build an `ASTM_NONSTANDARD_DELIMITERS` warning. The declared delimiters are
 * used as-is; this only flags that they differ from the canonical set.
 *
 * @example
 * ```ts
 * import { nonStandardDelimiters } from "@cosyte/astm";
 * nonStandardDelimiters({ recordIndex: 0, recordType: "H" });
 * ```
 */
export function nonStandardDelimiters(position: AstmPosition): AstmRecordWarning {
  return {
    code: WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS,
    message: "Header declared non-canonical delimiters, read from the header and honored.",
    position,
  };
}

/**
 * Build an `ASTM_RECORD_DELIMITER_ROLE_COLLISION` warning. Emitted when a header
 * declares one character in two of the repeat / component / escape roles. The
 * declaration is honored and no record is dropped; the message names no character,
 * because a delimiter is a byte off the wire.
 *
 * A profile may **not** tolerate this code: it reports a distinction the bytes no
 * longer carry, and the only other warning such a set raises
 * ({@link WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS}) is tolerable.
 *
 * @example
 * ```ts
 * import { delimiterRoleCollision } from "@cosyte/astm";
 * delimiterRoleCollision({ recordIndex: 0, recordType: "H" });
 * ```
 */
export function delimiterRoleCollision(position: AstmPosition): AstmRecordWarning {
  return {
    code: WARNING_CODES.ASTM_RECORD_DELIMITER_ROLE_COLLISION,
    message:
      "Header declared one character in two delimiter roles, honored as declared; the boundary " +
      "between those two roles cannot be recovered from the bytes, and emit refuses such a set.",
    position,
  };
}

/**
 * Build an `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` warning. Emitted when an
 * unrecognized escape body is itself a splitting delimiter in force, so the atom
 * rule kept it out of the split. The value is preserved verbatim and is identical
 * with the warning and without it; what the warning reports is the boundary that
 * did not happen.
 *
 * A profile may **not** tolerate this code. It fires alongside
 * {@link WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE}, which remains tolerable and
 * reports the strictly weaker fact that a body was not recognized.
 *
 * @example
 * ```ts
 * import { delimiterSwallowedByEscape } from "@cosyte/astm";
 * delimiterSwallowedByEscape({ recordIndex: 4, recordType: "R", fieldIndex: 4 });
 * ```
 */
export function delimiterSwallowedByEscape(position: AstmPosition): AstmRecordWarning {
  return {
    code: WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE,
    message:
      "An unrecognized escape sequence held a delimiter in force, so that delimiter did not end a " +
      "field, repeat or component. The sequence is preserved verbatim and nothing is re-split.",
    position,
  };
}

/**
 * Build an `ASTM_RECORD_DELIMITERS_REDECLARED` warning. Emitted when a later `H`
 * record declares a delimiter set different from the one in force; the new set is
 * honored from that header onward. Positional context only: never the delimiters
 * themselves.
 *
 * @example
 * ```ts
 * import { delimitersRedeclared } from "@cosyte/astm";
 * delimitersRedeclared({ recordIndex: 5, recordType: "H" });
 * ```
 */
export function delimitersRedeclared(position: AstmPosition): AstmRecordWarning {
  return {
    code: WARNING_CODES.ASTM_RECORD_DELIMITERS_REDECLARED,
    message:
      "A later header declared different delimiters, honored from that header onward; earlier records keep the set they were read with.",
    position,
  };
}

/**
 * Build an `ASTM_RECORD_UNREADABLE_REDECLARATION` warning. Emitted when a later
 * `H` record cannot declare a usable delimiter set; the set already in force is
 * kept and every record is still surfaced.
 *
 * @example
 * ```ts
 * import { unreadableRedeclaration } from "@cosyte/astm";
 * unreadableRedeclaration({ recordIndex: 2, recordType: "H" });
 * ```
 */
export function unreadableRedeclaration(position: AstmPosition): AstmRecordWarning {
  return {
    code: WARNING_CODES.ASTM_RECORD_UNREADABLE_REDECLARATION,
    message:
      "A later header could not declare a usable delimiter set, the delimiters already in force were kept.",
    position,
  };
}

/**
 * Build an `ASTM_UNKNOWN_ESCAPE_SEQUENCE` warning. The sequence is preserved
 * verbatim in the decoded value; the warning body carries neither the sequence
 * nor its surrounding text.
 *
 * @example
 * ```ts
 * import { unknownEscapeSequence } from "@cosyte/astm";
 * unknownEscapeSequence({ recordIndex: 4, recordType: "R", fieldIndex: 4 });
 * ```
 */
export function unknownEscapeSequence(position: AstmPosition): AstmRecordWarning {
  return {
    code: WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
    message: "Unrecognized escape sequence preserved verbatim.",
    position,
  };
}

/**
 * Build an `ASTM_UNPAIRED_ESCAPE_CHARACTER` warning. The character is preserved
 * verbatim as a literal in the decoded value and opens no atom, so it does not
 * merge the rest of the record; the warning body carries neither the character's
 * surroundings nor any field value.
 *
 * **It is a statement about that one character, not about the record.** A
 * different escape character in the same record may head a real three-character
 * sequence, and if that sequence's body is a delimiter, that delimiter does not
 * split, which is reported separately by
 * {@link WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE}.
 *
 * A profile **may** tolerate this code: the value it reports is byte-identical
 * with the warning and without it, because reading the character as a literal is
 * the parse, not a consequence of the warning.
 *
 * @example
 * ```ts
 * import { unpairedEscapeCharacter } from "@cosyte/astm";
 * unpairedEscapeCharacter({ recordIndex: 4, recordType: "R", fieldIndex: 4 });
 * ```
 */
export function unpairedEscapeCharacter(position: AstmPosition): AstmRecordWarning {
  return {
    code: WARNING_CODES.ASTM_UNPAIRED_ESCAPE_CHARACTER,
    message:
      "An escape character headed no escape sequence, read as the literal character it is " +
      "rather than opening a sequence that never closes. The spec-clean form is the escaped one.",
    position,
  };
}

/**
 * Build an `ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT` warning. Emitted when a result
 * value field split on an unescaped component delimiter: the full raw value and
 * the split are both surfaced, never a silent truncation.
 *
 * @example
 * ```ts
 * import { ambiguousValueSplit } from "@cosyte/astm";
 * ambiguousValueSplit({ recordIndex: 3, recordType: "R", fieldIndex: 4 });
 * ```
 */
export function ambiguousValueSplit(position: AstmPosition): AstmRecordWarning {
  return {
    code: WARNING_CODES.ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT,
    message:
      "Result value contained an unescaped component delimiter, full raw value and split both surfaced.",
    position,
  };
}

/**
 * Build an `ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG` warning. The flag is surfaced as
 * `undefined` (never coerced to `normal`); the warning carries only the position.
 *
 * @example
 * ```ts
 * import { undefinedAbnormalFlag } from "@cosyte/astm";
 * undefinedAbnormalFlag({ recordIndex: 4, recordType: "R", fieldIndex: 7 });
 * ```
 */
export function undefinedAbnormalFlag(position: AstmPosition): AstmRecordWarning {
  return {
    code: WARNING_CODES.ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG,
    message: "Abnormal flag is not in HL7 Table 0078, surfaced as undefined, never as normal.",
    position,
  };
}

/**
 * Build an `ASTM_RECORD_UNDEFINED_RESULT_STATUS` warning. The status is surfaced
 * as `undefined` and, like every non-final status, never reads as active-final.
 *
 * @example
 * ```ts
 * import { undefinedResultStatus } from "@cosyte/astm";
 * undefinedResultStatus({ recordIndex: 4, recordType: "R", fieldIndex: 9 });
 * ```
 */
export function undefinedResultStatus(position: AstmPosition): AstmRecordWarning {
  return {
    code: WARNING_CODES.ASTM_RECORD_UNDEFINED_RESULT_STATUS,
    message: "Result status is not a recognized status letter, surfaced as undefined.",
    position,
  };
}

/**
 * Build an `ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE` warning. The range text is
 * surfaced verbatim as `unparsed`; no bound is fabricated.
 *
 * @example
 * ```ts
 * import { unparseableReferenceRange } from "@cosyte/astm";
 * unparseableReferenceRange({ recordIndex: 4, recordType: "R", fieldIndex: 6 });
 * ```
 */
export function unparseableReferenceRange(position: AstmPosition): AstmRecordWarning {
  return {
    code: WARNING_CODES.ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE,
    message:
      "Reference range did not match a recognized form, surfaced verbatim, no bound invented.",
    position,
  };
}

/**
 * Build an `ASTM_RECORD_UNITS_ABSENT` warning. Emitted when a result carries a
 * numeric value but no units; units are never defaulted, guessed, or converted.
 *
 * @example
 * ```ts
 * import { unitsAbsent } from "@cosyte/astm";
 * unitsAbsent({ recordIndex: 4, recordType: "R", fieldIndex: 5 });
 * ```
 */
export function unitsAbsent(position: AstmPosition): AstmRecordWarning {
  return {
    code: WARNING_CODES.ASTM_RECORD_UNITS_ABSENT,
    message: "Numeric result value carried no units, never defaulted, guessed, or converted.",
    position,
  };
}

/**
 * Build an `ASTM_RECORD_ORPHAN_COMMENT` warning. Emitted when a `C` record had no
 * valid preceding `H`/`P`/`O`/`R` parent; the comment is attached to the message
 * root and surfaced, never dropped.
 *
 * @example
 * ```ts
 * import { orphanComment } from "@cosyte/astm";
 * orphanComment({ recordIndex: 5, recordType: "C" });
 * ```
 */
export function orphanComment(position: AstmPosition): AstmRecordWarning {
  return {
    code: WARNING_CODES.ASTM_RECORD_ORPHAN_COMMENT,
    message: "Comment had no valid preceding parent, attached to the message root, never dropped.",
    position,
  };
}

/**
 * Build an `ASTM_RECORD_PARTIAL_TIMESTAMP` warning. Emitted when a
 * `YYYYMMDDHHMMSS` value had an odd digit run that truncates a component; the raw
 * run is preserved and no time is fabricated.
 *
 * @example
 * ```ts
 * import { partialTimestamp } from "@cosyte/astm";
 * partialTimestamp({ recordIndex: 2, recordType: "P", fieldIndex: 8 });
 * ```
 */
export function partialTimestamp(position: AstmPosition): AstmRecordWarning {
  return {
    code: WARNING_CODES.ASTM_RECORD_PARTIAL_TIMESTAMP,
    message: "Timestamp digit run truncates a component, preserved verbatim, never zero-filled.",
    position,
  };
}

/**
 * Build an `ASTM_RECORD_UNINTERPRETED_QUERY_STATUS` warning. Emitted when a `Q`
 * record carries a request-information status code; the code set is paywalled, so
 * the status is surfaced verbatim and never mapped to a guessed meaning.
 *
 * @example
 * ```ts
 * import { uninterpretedQueryStatus } from "@cosyte/astm";
 * uninterpretedQueryStatus({ recordIndex: 2, recordType: "Q", fieldIndex: 13 });
 * ```
 */
export function uninterpretedQueryStatus(position: AstmPosition): AstmRecordWarning {
  return {
    code: WARNING_CODES.ASTM_RECORD_UNINTERPRETED_QUERY_STATUS,
    message:
      "Query request-information status surfaced verbatim, code set paywalled, never interpreted.",
    position,
  };
}

/**
 * Build an `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND` warning. Emitted when a message
 * carries both a `Q` (request) and an `R` (result) record; the message is
 * classified as a host-query request (the `Q` dominates) and the anomaly is
 * flagged.
 *
 * @example
 * ```ts
 * import { ambiguousMessageKind } from "@cosyte/astm";
 * ambiguousMessageKind({ recordIndex: 0, recordType: "H" });
 * ```
 */
export function ambiguousMessageKind(position: AstmPosition): AstmRecordWarning {
  return {
    code: WARNING_CODES.ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND,
    message:
      "Message carried both a Q (request) and an R (result) record, classified host-query; Q dominates.",
    position,
  };
}

/**
 * Build a `PROFILE_QUIRK_APPLIED` warning: the downgraded form an active vendor profile produces from
 * a deviation it *expects*. The original warning is **not dropped**: its `code` moves to
 * `toleratedCode`, the warning is re-badged `PROFILE_QUIRK_APPLIED`, `expected` is set, and the
 * tolerating profile is named. The original `position` and `message` are preserved (both PHI-free by
 * the same construction as every other factory), so a consumer can filter known, grounded noise while
 * the fact of the deviation, and where it was, survive. A profile can only ever reach this path for a
 * **non-safety-critical** code (enforced at profile-definition time by the safety gate).
 *
 * @param original - The warning the profile tolerated.
 * @param profileName - The name of the tolerating profile.
 * @returns The re-badged, still-informative warning.
 * @example
 * ```ts
 * import { profileQuirkApplied, unknownEscapeSequence } from "@cosyte/astm";
 * const original = unknownEscapeSequence({ recordIndex: 4, recordType: "R", fieldIndex: 5 });
 * const w = profileQuirkApplied(original, "referenceCorpus");
 * w.code; // "PROFILE_QUIRK_APPLIED"
 * w.toleratedCode; // "ASTM_UNKNOWN_ESCAPE_SEQUENCE"
 * ```
 */
export function profileQuirkApplied(
  original: AstmRecordWarning,
  profileName: string,
): AstmRecordWarning {
  return {
    code: WARNING_CODES.PROFILE_QUIRK_APPLIED,
    message: `Profile "${profileName}" expected ${original.code}: ${original.message}`,
    position: original.position,
    expected: true,
    profile: profileName,
    toleratedCode: original.code,
  };
}
