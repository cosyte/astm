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
  /** A record's type letter is not one of the modeled types — surfaced as an unsupported record. */
  ASTM_RECORD_UNKNOWN_TYPE: "ASTM_RECORD_UNKNOWN_TYPE",
  /** The header declared delimiters other than the canonical `H|\^&` — tolerated, noted. */
  ASTM_NONSTANDARD_DELIMITERS: "ASTM_NONSTANDARD_DELIMITERS",
  /** An escape sequence body was not one of `&F&`/`&S&`/`&R&`/`&E&` — preserved verbatim. */
  ASTM_UNKNOWN_ESCAPE_SEQUENCE: "ASTM_UNKNOWN_ESCAPE_SEQUENCE",
  /**
   * A result value field carried an *unescaped* component delimiter, so it split into more than one
   * component. Both the full raw value and the split are surfaced and this warning fires — the
   * ambiguity is never resolved silently into a truncated value.
   */
  ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT: "ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT",
  /**
   * A result's abnormal-flag field (`R` field 7) carried a letter outside HL7 Table 0078. The flag is
   * surfaced as `undefined` — never dropped, and **never coerced to `normal`** (a clinical error).
   */
  ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG: "ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG",
  /**
   * A result's status field (`R` field 9) carried a letter that is not a recognized status. It is
   * surfaced as `undefined` and, like every non-`F` status, never reads as active-final.
   */
  ASTM_RECORD_UNDEFINED_RESULT_STATUS: "ASTM_RECORD_UNDEFINED_RESULT_STATUS",
  /**
   * A result's reference-range field (`R` field 6) did not match a recognized form (`low-high`,
   * `<high`, `>low`). The text is surfaced verbatim as `unparsed` — a bound is **never fabricated**.
   */
  ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE: "ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE",
  /**
   * A result carried a numeric value but no units (`R` field 5 empty). Units are vendor free text
   * (not UCUM); a missing unit is flagged here and **never defaulted, guessed, or converted**.
   */
  ASTM_RECORD_UNITS_ABSENT: "ASTM_RECORD_UNITS_ABSENT",
  /**
   * A `C` (comment) record had no valid preceding `H`/`P`/`O`/`R` parent — an **orphan**. The comment
   * is attached to the message root (`attachedToRoot: true`) and surfaced, **never dropped**.
   */
  ASTM_RECORD_ORPHAN_COMMENT: "ASTM_RECORD_ORPHAN_COMMENT",
  /**
   * A `YYYYMMDDHHMMSS` timestamp had an odd digit run that truncates a two-digit component in half
   * (e.g. a partial day/hour). The raw run is preserved and the structured value stops at the last
   * **complete** component — the dangling digit is **never zero-filled into a fabricated time**.
   */
  ASTM_RECORD_PARTIAL_TIMESTAMP: "ASTM_RECORD_PARTIAL_TIMESTAMP",
  /**
   * A `Q` (request-information) record carried a request-information status code (field 13). The code
   * *set* is `[OSS-derived / paywalled]` with no publicly-groundable enumeration, so the parser
   * interprets **none** of them: the status is surfaced verbatim and this value-free warning flags that
   * it was passed through **uninterpreted** — never mapped to a guessed meaning.
   */
  ASTM_RECORD_UNINTERPRETED_QUERY_STATUS: "ASTM_RECORD_UNINTERPRETED_QUERY_STATUS",
  /**
   * A message carried **both** a `Q` (request) and an `R` (result) record — a contradictory shape. The
   * message is classified `host-query` (the `Q` **dominates**, so it is never read as a result set) and
   * this warning flags the anomaly. Positional context only; no field value.
   */
  ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND: "ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND",
  /**
   * The downgraded form an active vendor {@link AstmProfile} produces from a deviation it *expects*
   * (see `src/profiles/`). The original warning is **never dropped**: its code moves to
   * {@link AstmRecordWarning.toleratedCode}, the warning is re-badged `PROFILE_QUIRK_APPLIED` with
   * `expected: true` and the tolerating profile named, so a consumer can filter known, grounded noise
   * while the fact of the deviation — and where it was — survives. A profile can only ever reach this
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
   * known and benign) — it is still recorded, so nothing is hidden. Absent on an untolerated warning.
   */
  readonly expected?: boolean;
  /** The name of the {@link AstmProfile} that tolerated this warning, when `expected`. */
  readonly profile?: string;
  /**
   * When `code` is {@link WARNING_CODES.PROFILE_QUIRK_APPLIED}, the original warning code the profile
   * tolerated — so a consumer can still see *which* deviation was re-badged as expected.
   */
  readonly toleratedCode?: WarningCode;
}

/**
 * Build an `ASTM_RECORD_UNKNOWN_TYPE` warning. The record is still surfaced (as
 * an unsupported record), never dropped.
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
    message: "Unrecognized record type — surfaced verbatim as an unsupported record.",
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
    message: "Header declared non-canonical delimiters — read from the header and honored.",
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
 * Build an `ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT` warning. Emitted when a result
 * value field split on an unescaped component delimiter — the full raw value and
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
      "Result value contained an unescaped component delimiter — full raw value and split both surfaced.",
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
    message: "Abnormal flag is not in HL7 Table 0078 — surfaced as undefined, never as normal.",
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
    message: "Result status is not a recognized status letter — surfaced as undefined.",
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
      "Reference range did not match a recognized form — surfaced verbatim, no bound invented.",
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
    message: "Numeric result value carried no units — never defaulted, guessed, or converted.",
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
    message: "Comment had no valid preceding parent — attached to the message root, never dropped.",
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
    message: "Timestamp digit run truncates a component — preserved verbatim, never zero-filled.",
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
      "Query request-information status surfaced verbatim — code set paywalled, never interpreted.",
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
      "Message carried both a Q (request) and an R (result) record — classified host-query; Q dominates.",
    position,
  };
}

/**
 * Build a `PROFILE_QUIRK_APPLIED` warning — the downgraded form an active vendor profile produces from
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
