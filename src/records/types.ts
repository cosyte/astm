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
import type { AbnormalFlag, ReferenceRange, ResultStatus } from "./result-semantics.js";

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
  /**
   * Field 5 — a third patient identifier (e.g. a national/alternate ID), surfaced verbatim. Kept
   * separate from the practice- and laboratory-assigned IDs — the three never collapse into one.
   */
  readonly patientIdThree?: string;
  /** Field 6 — patient name (`Last^First^Middle`). */
  readonly name?: PatientName;
  /** Field 7 — mother's maiden name, surfaced verbatim (a surname component; PHI). */
  readonly mothersMaidenName?: string;
  /** Field 8 — birthdate (`YYYYMMDDHHMMSS`, precision-preserving; a truncated run sets `truncated`). */
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
  /**
   * Field 6 — priority, surfaced raw (e.g. `S` STAT, `R` routine, `A` ASAP). Vendor letters vary;
   * the code set is `[OSS-derived]` (the exact enumeration is in the paywalled CLSI LIS02-A2), so the
   * value is surfaced verbatim and **never mapped to a guessed meaning**.
   */
  readonly priority?: string;
  /**
   * Field 12 — action code, surfaced raw (e.g. `C` cancel, `A` add, `N` new). The exact field index
   * (`~12`) and the code set are `[OSS-derived]` (paywalled) — surfaced verbatim, never interpreted.
   */
  readonly actionCode?: string;
  /**
   * Field 26 — report type, surfaced raw (e.g. `F` final, `P` preliminary, `X` cancel). The exact
   * field index (`~26`) and the code set are `[OSS-derived]` (paywalled) — surfaced verbatim.
   */
  readonly reportType?: string;
}

/**
 * The `R` (result) record — the value itself.
 *
 * The raw safety-critical fields (value, `units`, `referenceRange`,
 * `abnormalFlags`, `resultStatus`) are always surfaced exactly as received.
 * Phase 2 adds the **modeled, fail-safe** semantics alongside them: `flag`
 * (Table 0078, `undefined` never coerced to normal), `status` (a `C`/`X` never
 * reads as active-final; an absent status is `unspecified`, never `final`), and
 * `range` (open/closed bounds surfaced verbatim, never fabricated). The raw
 * strings and the modeled views coexist — nothing is collapsed or reconciled.
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
  /**
   * Field 6 — the reference range parsed into low/high (or open-ended) bounds, present only when the
   * field carried a value. An unparseable range is `kind: "unparsed"` with the raw text preserved and
   * **no bound fabricated**. Bounds are verbatim numeric text, never coerced to floats.
   */
  readonly range?: ReferenceRange;
  /** Field 7 — abnormal flags, surfaced raw (HL7 Table 0078 values). */
  readonly abnormalFlags?: string;
  /**
   * Field 7 — the abnormal flag interpreted against HL7 Table 0078, present only when the field
   * carried a value. An unrecognized flag is `{ recognized: false, meaning: "undefined" }` — surfaced,
   * never dropped, and **never coerced to `normal`**.
   */
  readonly flag?: AbnormalFlag;
  /** Field 9 — result status, surfaced raw (`F`/`C`/`X`/…). */
  readonly resultStatus?: string;
  /**
   * Field 9 — the modeled result status. **Always present** (an absent field yields a typed
   * `unspecified`, never assumed `final`), so `status.isActiveFinal` is always a reliable boolean: it
   * is `true` only for a plain `F`, and `false` for a correction (`C`), a cancellation (`X`), a
   * partial/preliminary/pending, an absent, or an unrecognized status.
   */
  readonly status: ResultStatus;
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
 * The `C` (comment) record — free-text context attached to a parent record.
 *
 * A comment is **attached by position** to the immediately-preceding `H`/`P`/`O`/`R` record
 * ({@link CommentRecord.parentIndex}); consecutive comments share that parent. **Fail-safe:** a
 * comment with no valid preceding parent is an **orphan** — it is attached to the message root
 * ({@link CommentRecord.attachedToRoot} `true`) and a value-free `ASTM_RECORD_ORPHAN_COMMENT` warning
 * fires — **never silently dropped**, so a comment carrying (e.g.) "QC / non-compliant" context can
 * never float away unnoticed.
 */
export interface CommentRecord extends RecordBase {
  readonly type: "C";
  /** Field 2 — sequence number. */
  readonly seq?: string;
  /** Field 3 — comment source (who/what produced it), surfaced verbatim. */
  readonly source?: string;
  /**
   * Field 4 — the comment text, surfaced as the **full** field text (all components), never
   * truncated to the first component. The component structure is in {@link CommentRecord.textComponents}.
   */
  readonly text?: string;
  /**
   * Field 4 — the comment text split into its decoded components (comment text is component-capable;
   * multiple components are a normal structured comment, **not** an ambiguity). Present only when the
   * field carried more than one component.
   */
  readonly textComponents?: readonly string[];
  /**
   * Field 5 — comment type code, surfaced verbatim. **`[OSS-derived]`:** `I` (instrument) is the only
   * value seen in the permissively-licensed real transcripts; other values (e.g. `G`/`T`/`P`) are
   * defined only in the paywalled CLSI LIS02-A2 and are **not** interpreted here — the raw code is
   * surfaced, never mapped to a guessed meaning.
   */
  readonly commentType?: string;
  /**
   * The `recordIndex` of the `H`/`P`/`O`/`R` record this comment is attached to, or `undefined` when
   * the comment is an orphan attached to the message root (see {@link CommentRecord.attachedToRoot}).
   */
  readonly parentIndex?: number;
  /** `true` when no valid parent preceded — the comment is attached to the message root (and warned). */
  readonly attachedToRoot: boolean;
}

/**
 * The `Q` (Request Information) record — the host-query request.
 *
 * A `Q` record asks the LIS for information (e.g. outstanding orders for a
 * specimen); its **presence classifies the whole message as a request, never a
 * result set** (see {@link AstmMessage.classification}). Its safety-relevant
 * fields — the starting/ending range ID and the request-information status — are
 * surfaced **verbatim**; the field *positions* are the public ASTM E1394 layout,
 * but their internal structure and code meanings are **`[OSS-derived / paywalled]`**
 * (roadmap §10 Q3) and are therefore **never interpreted or guessed**.
 */
export interface QueryRecord extends RecordBase {
  /** Field 2 — sequence number. */
  readonly seq?: string;
  readonly type: "Q";
  /**
   * Field 3 — starting range ID number, surfaced as the **full** verbatim field text (never truncated
   * to a component). Its caret component structure (e.g. patient ID ^ specimen ID) is
   * **`[OSS-derived / paywalled]`** — the raw split is available via {@link RecordBase.fields}, but the
   * *meaning* of each component is **never** assigned here.
   */
  readonly startingRangeId?: string;
  /** Field 4 — ending range ID number, surfaced verbatim (same `[OSS-derived]` caveat as field 3). */
  readonly endingRangeId?: string;
  /**
   * Field 5 — Universal Test ID (the same caret structure as an `O`/`R` record's), recognized by
   * provenance only. When the field is the literal universal-query keyword, {@link QueryRecord.queriesAllTests}
   * is set instead — see its caveat.
   */
  readonly universalTestId?: UniversalTestId;
  /**
   * `true` when field 5 is the literal `ALL` universal-query keyword (case-insensitive). **`[OSS-derived
   * / paywalled]`:** the token is surfaced because it appears in the OSS references, but its exact
   * host-query *behavior* (which tests a bare `ALL` selects, and whether the vendor answers with a full
   * `H/P/O/L` or a `P/O`-only response) is paywalled and vendor-specific — **not decided here**.
   */
  readonly queriesAllTests: boolean;
  /**
   * Field 13 — request-information status code(s), surfaced **verbatim**. The status code *set* is
   * **`[OSS-derived / paywalled]`** (roadmap §10 Q3): with no publicly-groundable enumeration, this
   * parser recognizes **none** of them and interprets nothing — every present status is surfaced raw
   * and flagged with a value-free `ASTM_RECORD_UNINTERPRETED_QUERY_STATUS` warning. Never mapped to a
   * guessed meaning.
   */
  readonly requestInformationStatus?: string;
}

/**
 * The `M` (manufacturer) record — vendor-defined free-form data
 * (QC / calibration / maintenance), surfaced **VERBATIM** and **never interpreted
 * into typed clinical fields**.
 *
 * Interpreting a vendor `M` record as clinical data would be a fabrication, so
 * this record carries **no typed accessors at all**: the exact wire text is in
 * {@link ManufacturerRecord.rawLine} (byte-preserving) and the tokenized tree in
 * {@link RecordBase.fields}. Nothing is parsed into a value, a code, or a unit.
 */
export interface ManufacturerRecord extends RecordBase {
  readonly type: "M";
  /** The record's exact wire text (terminator excluded), preserved byte-for-byte for round-trip. */
  readonly rawLine: string;
}

/**
 * The `S` (scientific) record — vendor-defined free-form data, surfaced
 * **VERBATIM** and **never interpreted into typed clinical fields** (same posture
 * as {@link ManufacturerRecord}).
 */
export interface ScientificRecord extends RecordBase {
  readonly type: "S";
  /** The record's exact wire text (terminator excluded), preserved byte-for-byte for round-trip. */
  readonly rawLine: string;
}

/**
 * The `L` (terminator) record — closes a message.
 */
export interface TerminatorRecord extends RecordBase {
  readonly type: "L";
}

/**
 * Any record whose type letter is not modeled (a genuinely unknown letter).
 * `H`/`P`/`O`/`R`/`C`/`L` (Phases 1–3) and `Q`/`M`/`S` (Phase 4) are all modeled;
 * anything else is surfaced with its raw fields intact and flagged with an
 * `ASTM_RECORD_UNKNOWN_TYPE` warning — never dropped.
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
  | CommentRecord
  | QueryRecord
  | ManufacturerRecord
  | ScientificRecord
  | TerminatorRecord
  | UnsupportedRecord;

/**
 * How a message is classified by the host-query flow.
 *
 * - `host-query` — the message carries at least one `Q` record: it is a **request
 *   for information**, and **must never be read as a result set** (the load-bearing
 *   safety distinction of this layer). `Q` **dominates**: a `Q` present classifies
 *   the message as a request even if a result record is also present (an anomaly,
 *   separately warned) — so a `Q`-bearing message is never silently treated as a
 *   result upload.
 * - `results` — no `Q`, at least one `R` (result) record: a result upload / response.
 * - `orders` — no `Q`, no `R`, at least one `O` (order) record: an order download,
 *   or a query response before results are attached.
 * - `indeterminate` — none of the above (e.g. header + terminator only). Not
 *   guessed into one of the other kinds.
 */
export type AstmMessageKind = "host-query" | "results" | "orders" | "indeterminate";

/**
 * The message-level classification from the host-query flow. `isHostQueryRequest`
 * is the single boolean a consumer should gate on before treating records as
 * results — it is `true` **iff** a `Q` record is present.
 *
 * @example
 * ```ts
 * import { parseAstmRecords } from "@cosyte/astm";
 * const req = parseAstmRecords("H|\\^&\rP|1\rQ|1|^SPEC-7||ALL\rL|1\r");
 * req.classification.kind;               // "host-query"
 * req.classification.isHostQueryRequest; // true — never read its records as results
 * ```
 */
export interface AstmMessageClassification {
  /** The message kind. */
  readonly kind: AstmMessageKind;
  /** At least one `Q` (request-information) record is present. */
  readonly hasQuery: boolean;
  /** At least one `R` (result) record is present. */
  readonly hasResults: boolean;
  /** At least one `O` (order) record is present. */
  readonly hasOrders: boolean;
  /**
   * `true` **iff** `kind === "host-query"` (a `Q` record is present) — the safety surface: gate on this
   * before treating records as results, so a query is never misread as a result upload.
   */
  readonly isHostQueryRequest: boolean;
}

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
  /**
   * The host-query classification of this message — whether it is a request (`Q`
   * present), a result upload, an order download, or indeterminate. Gate on
   * {@link AstmMessageClassification.isHostQueryRequest} before reading records as
   * results.
   */
  readonly classification: AstmMessageClassification;
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
