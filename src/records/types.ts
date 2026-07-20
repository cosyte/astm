/**
 * The immutable ASTM record model produced by {@link parseAstmRecords}.
 *
 * A message is a header (which carries the resolved delimiters as provenance), an
 * ordered list of typed records, and the Tier-2 warnings the lenient parser
 * accumulated. Every record keeps its raw {@link AstmField}s **and** the typed
 * accessors relevant to its type — the raw tree is always present so nothing the
 * parser did not model is lost.
 *
 * Phase-1 scope: `H`/`P`/`O`/`R`/`L` are modeled; every other type letter is an
 * {@link UnsupportedRecord} (surfaced, never dropped). Result-flag/status
 * *semantics*, comments/query/`M`/`S`, framing, and serialization are later
 * phases — this layer surfaces the safety-critical values **raw**.
 */

import type { Delimiters } from "../common/delimiters.js";
import type { AstmDate } from "../common/dates.js";
import type { UniversalTestId } from "../common/coding-system.js";
import type { AstmRecordWarning } from "../common/warnings.js";

/**
 * One ASTM field, as split from a record. The tree holds **decoded** component
 * strings (escape sequences already resolved), while {@link AstmField.raw}
 * preserves the exact wire text of the field for round-trip and audit.
 *
 * `components` is the first repeat's components (the common single-repeat case);
 * `repeats` holds every repeat when a field uses the repeat delimiter.
 */
export interface AstmField {
  /** The exact field text as it appeared on the wire (escapes NOT decoded). */
  readonly raw: string;
  /** Components of the first repeat, each escape-decoded. Empty field → `[""]`. */
  readonly components: readonly string[];
  /** Every repeat, each an array of decoded components. `repeats[0] === components`. */
  readonly repeats: readonly (readonly string[])[];
}

/** Common shape of every parsed record. */
interface RecordBase {
  /** The record's raw type letter. */
  readonly type: string;
  /** 0-based ordinal of the record within the message. */
  readonly recordIndex: number;
  /** The record's fields. `fields[0]` is the type-letter field; data fields are 1-indexed after it. */
  readonly fields: readonly AstmField[];
}

/**
 * The `H` (header) record. Carries the delimiters it declared as provenance.
 */
export interface HeaderRecord extends RecordBase {
  readonly type: "H";
  /** The four delimiters resolved from this header. */
  readonly delimiters: Delimiters;
}

/**
 * A patient name (`Last^First^Middle`), each component surfaced verbatim.
 */
export interface PatientName {
  readonly raw: string;
  readonly last?: string;
  readonly first?: string;
  readonly middle?: string;
}

/**
 * The `P` (patient) record.
 *
 * **Safety:** the practice-assigned ID (field 3) and the laboratory-assigned ID
 * (field 4) are modeled as **distinct** fields and never collapsed — conflating
 * them is the primary result-misfiling path.
 */
export interface PatientRecord extends RecordBase {
  readonly type: "P";
  /** Field 2 — sequence number. */
  readonly seq?: string;
  /** Field 3 — practice-assigned patient ID. Distinct from {@link PatientRecord.laboratoryAssignedId}. */
  readonly practiceAssignedId?: string;
  /** Field 4 — laboratory-assigned patient ID. Distinct from {@link PatientRecord.practiceAssignedId}. */
  readonly laboratoryAssignedId?: string;
  /** Field 6 — patient name (`Last^First^Middle`). */
  readonly name?: PatientName;
  /** Field 8 — birthdate (`YYYYMMDDHHMMSS`, precision-preserving). */
  readonly birthDate?: AstmDate;
  /** Field 9 — sex, surfaced raw (`M`/`F`/`U`/vendor value). */
  readonly sex?: string;
}

/**
 * The `O` (order) record — binds a result to a specimen.
 */
export interface OrderRecord extends RecordBase {
  readonly type: "O";
  /** Field 2 — sequence number. */
  readonly seq?: string;
  /** Field 3 — specimen / accession ID. */
  readonly specimenId?: string;
  /** Field 4 — instrument specimen ID. */
  readonly instrumentSpecimenId?: string;
  /** Field 5 — Universal Test ID (same caret structure as a result's). */
  readonly universalTestId?: UniversalTestId;
}

/**
 * The `R` (result) record — the value itself.
 *
 * Phase-1 surfaces the safety-critical fields **raw**: value, units, reference
 * range, abnormal flags, and result status are strings exactly as received.
 * Turning the flag/status letters into modeled semantics (with the fail-safe
 * `UNDEFINED` fallback and correction/cancel handling) is Phase 2.
 */
export interface ResultRecord extends RecordBase {
  readonly type: "R";
  /** Field 2 — sequence number. */
  readonly seq?: string;
  /** Field 3 — Universal Test ID (local code in component 4 is the primary identifier). */
  readonly universalTestId?: UniversalTestId;
  /**
   * Field 4 — the measured value. In the ordinary single-component case this is the decoded scalar.
   * When the value field carried an *unescaped* component delimiter (an ambiguity), this is the
   * **full raw field text** — never a truncated component — and {@link ResultRecord.valueComponents}
   * plus an `ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT` warning are also present.
   */
  readonly value?: string;
  /**
   * Field 4 split into components, present only when the value field carried an *unescaped* component
   * delimiter — i.e. it read as more than one component. Surfaced alongside the full raw value (and a
   * warning) so an ambiguous split is visible, never resolved silently.
   */
  readonly valueComponents?: readonly string[];
  /** Field 5 — units (vendor free text; a missing unit is not defaulted). */
  readonly units?: string;
  /** Field 6 — reference range, surfaced raw. */
  readonly referenceRange?: string;
  /** Field 7 — abnormal flags, surfaced raw (HL7 Table 0078 values; semantics are Phase 2). */
  readonly abnormalFlags?: string;
  /** Field 9 — result status, surfaced raw (`F`/`C`/`X`/…; semantics are Phase 2). */
  readonly resultStatus?: string;
  /** Field 11 — operator. */
  readonly operator?: string;
  /** Field 12 — test started timestamp. */
  readonly startedAt?: AstmDate;
  /** Field 13 — test completed timestamp. */
  readonly completedAt?: AstmDate;
  /** Field 14 — instrument identifier. */
  readonly instrument?: string;
}

/**
 * The `L` (terminator) record — closes a message.
 */
export interface TerminatorRecord extends RecordBase {
  readonly type: "L";
}

/**
 * Any record whose type letter is not modeled in Phase 1 (`C`/`Q`/`M`/`S`/…, or
 * a genuinely unknown letter). Surfaced with its raw fields intact and flagged
 * with an `ASTM_RECORD_UNKNOWN_TYPE` warning — never dropped.
 */
export interface UnsupportedRecord extends RecordBase {
  readonly type: "unsupported";
  /** The raw type letter as it appeared on the wire. */
  readonly rawType: string;
}

/** The discriminated union of every parsed record. */
export type AstmRecord =
  | HeaderRecord
  | PatientRecord
  | OrderRecord
  | ResultRecord
  | TerminatorRecord
  | UnsupportedRecord;

/**
 * A parsed ASTM message: the header, the ordered records (the header is also
 * `records[0]`), the resolved delimiters, and the accumulated warnings.
 *
 * @example
 * ```ts
 * import { parseAstmRecords } from "@cosyte/astm";
 * const msg = parseAstmRecords("H|\\^&\rL|1\r");
 * msg.header.delimiters.field; // "|"
 * msg.records.length;          // 2
 * ```
 */
export interface AstmMessage {
  readonly header: HeaderRecord;
  readonly records: readonly AstmRecord[];
  readonly delimiters: Delimiters;
  readonly warnings: readonly AstmRecordWarning[];
}

/**
 * Options for {@link parseAstmRecords}. Lenient by default (Postel's Law).
 */
export interface AstmParseOptions {
  /**
   * When `true`, escalate any Tier-2 deviation to a thrown {@link AstmStrictError}
   * instead of accumulating a warning. Off by default.
   */
  readonly strict?: boolean;
}
