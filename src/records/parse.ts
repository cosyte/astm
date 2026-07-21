/**
 * The record-layer entry point: {@link parseAstmRecords}.
 *
 * Phase 1 assumes **already-de-framed** record bytes (the E1381/LIS01 framing
 * layer is a later phase). It reads the four delimiters from the header, tokenizes
 * every record escape-aware, and builds the immutable {@link AstmMessage} — lenient
 * by default: vendor quirks become typed warnings, and only three unrecoverable
 * structural conditions are fatal.
 */

import { AstmParseError, FATAL_CODES } from "../common/errors.js";
import { deepFreeze } from "../common/freeze.js";
import { isNonStandard, readDelimiters, type Delimiters } from "../common/delimiters.js";
import { parseAstmDate, type AstmDate } from "../common/dates.js";
import { recognizeUniversalTestId } from "../common/coding-system.js";
import {
  ambiguousMessageKind,
  ambiguousValueSplit,
  nonStandardDelimiters,
  orphanComment,
  partialTimestamp,
  undefinedAbnormalFlag,
  undefinedResultStatus,
  uninterpretedQueryStatus,
  unitsAbsent,
  unknownEscapeSequence,
  unknownRecordType,
  unparseableReferenceRange,
  type AstmRecordWarning,
} from "../common/warnings.js";
import {
  interpretAbnormalFlag,
  interpretResultStatus,
  parseReferenceRange,
} from "./result-semantics.js";
import { classifyMessage } from "./host-query.js";
import { fieldScalar, tokenizeRecord } from "./tokenize.js";
import type {
  AstmField,
  AstmMessage,
  AstmParseOptions,
  AstmRecord,
  CommentRecord,
  HeaderRecord,
  ManufacturerRecord,
  OrderRecord,
  PatientName,
  PatientRecord,
  QueryRecord,
  ResultRecord,
  ScientificRecord,
  TerminatorRecord,
  UnsupportedRecord,
} from "./types.js";

/**
 * Thrown by {@link parseAstmRecords} in `strict` mode when the lenient parser
 * would otherwise have accumulated one or more Tier-2 warnings. Carries the
 * warnings (code + position, never a value) so a caller can see every deviation.
 *
 * @example
 * ```ts
 * import { parseAstmRecords, AstmStrictError } from "@cosyte/astm";
 * try {
 *   parseAstmRecords("H|\\^&\rZ|1\r", { strict: true });
 * } catch (err) {
 *   if (err instanceof AstmStrictError) err.warnings.length; // >= 1
 * }
 * ```
 */
export class AstmStrictError extends Error {
  public readonly warnings: readonly AstmRecordWarning[];
  /** @internal */
  public constructor(warnings: readonly AstmRecordWarning[]) {
    super(`Strict mode: ${String(warnings.length)} tolerated deviation(s) rejected.`);
    this.name = "AstmStrictError";
    this.warnings = warnings;
  }
}

/**
 * Parse an ASTM/CLSI-LIS02 record stream into an immutable {@link AstmMessage}.
 *
 * The stream is a sequence of records separated by `CR` (with `LF`/`CRLF`
 * tolerated); the first record must be an `H` header, which declares the
 * delimiters used by the rest. Lenient by default — set `strict` to reject any
 * tolerated deviation.
 *
 * @param raw - The de-framed record bytes, as a string or `Uint8Array` (decoded
 *   latin1 so byte values survive 1:1).
 * @param options - Parse options; lenient unless `strict` is set.
 * @returns The parsed, deeply-frozen message.
 * @throws {@link AstmParseError} on a Tier-3 fatal (`EMPTY_INPUT`,
 *   `ASTM_RECORD_NO_HEADER`, `ASTM_RECORD_UNDECLARED_DELIMITERS`).
 * @throws {@link AstmStrictError} when `strict` is set and a deviation occurs.
 * @example
 * ```ts
 * import { parseAstmRecords, results } from "@cosyte/astm";
 * const msg = parseAstmRecords("H|\\^&\rP|1\rO|1|ACC\rR|1|^^^687|28.6|U/L||N||F\rL|1|N\r");
 * results(msg)[0]?.value; // "28.6"
 * ```
 */
export function parseAstmRecords(
  raw: string | Uint8Array,
  options: AstmParseOptions = {},
): AstmMessage {
  const text = typeof raw === "string" ? raw : decodeBytes(raw);

  if (text.trim().length === 0) {
    throw new AstmParseError(FATAL_CODES.EMPTY_INPUT, "Input is empty.", { recordIndex: 0 });
  }

  // Records are CR-delimited (LF / CRLF tolerated). Phase 1 assumes de-framed record bytes.
  const lines = text.split(/\r\n|\r|\n/u).filter((l) => l.length > 0);

  const first = lines[0];
  if (first === undefined || first.charAt(0) !== "H") {
    const leadType = first?.charAt(0);
    throw new AstmParseError(
      FATAL_CODES.ASTM_RECORD_NO_HEADER,
      "First record is not an H (header) record.",
      leadType !== undefined && leadType.length > 0
        ? { recordIndex: 0, recordType: leadType }
        : { recordIndex: 0 },
    );
  }

  const delimiters = readDelimiters(first);
  if (delimiters === undefined) {
    throw new AstmParseError(
      FATAL_CODES.ASTM_RECORD_UNDECLARED_DELIMITERS,
      "Header record is too short to declare the four delimiters.",
      { recordIndex: 0, recordType: "H" },
    );
  }

  const warnings: AstmRecordWarning[] = [];
  if (isNonStandard(delimiters)) {
    warnings.push(nonStandardDelimiters({ recordIndex: 0, recordType: "H" }));
  }

  const built: AstmRecord[] = lines.map((line, recordIndex) =>
    buildRecord(line, recordIndex, delimiters, warnings),
  );
  // Second pass: attach each comment to its immediately-preceding H/P/O/R parent (an orphan → root).
  const records = attachComments(built, warnings);

  // Host-query classification. `Q` dominates so a query is never read as a result set; a message that
  // carries BOTH a Q and an R is contradictory — classified host-query (still a request) and warned,
  // never silently treated as a result upload.
  const classification = classifyMessage(records);
  if (classification.hasQuery && classification.hasResults) {
    warnings.push(ambiguousMessageKind({ recordIndex: 0, recordType: "H" }));
  }

  const header = records[0] as HeaderRecord;
  const message: AstmMessage = { header, records, delimiters, classification, warnings };

  if (options.strict === true && warnings.length > 0) {
    throw new AstmStrictError(warnings);
  }
  return deepFreeze(message);
}

/** Decode record bytes as latin1 so every byte survives to the string 1:1 (ASTM is byte-oriented). */
function decodeBytes(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

/** ASTM fields are 1-indexed; the type letter is field 1. Map an ASTM field number to the array slot. */
function astmField(fields: readonly AstmField[], n: number): AstmField | undefined {
  return fields[n - 1];
}

function buildRecord(
  line: string,
  recordIndex: number,
  d: Delimiters,
  warnings: AstmRecordWarning[],
): AstmRecord {
  const rawType = line.charAt(0);
  const fields = tokenizeRecord(line, d, (fieldIndex) => {
    warnings.push(
      unknownEscapeSequence({ recordIndex, recordType: rawType, fieldIndex: fieldIndex + 1 }),
    );
  });

  switch (rawType) {
    case "H":
      return { type: "H", recordIndex, fields, delimiters: d } satisfies HeaderRecord;
    case "P":
      return buildPatient(recordIndex, fields, warnings);
    case "O":
      return buildOrder(recordIndex, fields);
    case "R":
      return buildResult(recordIndex, fields, warnings);
    case "C":
      return buildComment(recordIndex, fields);
    case "Q":
      return buildQuery(recordIndex, fields, warnings);
    // `M` (manufacturer) and `S` (scientific) are vendor-defined free-form data surfaced VERBATIM and
    // NEVER interpreted into typed clinical fields — the exact wire line is preserved for round-trip.
    case "M":
      return { type: "M", recordIndex, fields, rawLine: line } satisfies ManufacturerRecord;
    case "S":
      return { type: "S", recordIndex, fields, rawLine: line } satisfies ScientificRecord;
    case "L":
      return { type: "L", recordIndex, fields } satisfies TerminatorRecord;
    default: {
      warnings.push(unknownRecordType({ recordIndex, recordType: rawType }));
      return { type: "unsupported", rawType, recordIndex, fields } satisfies UnsupportedRecord;
    }
  }
}

function buildPatient(
  recordIndex: number,
  fields: readonly AstmField[],
  warnings: AstmRecordWarning[],
): PatientRecord {
  const nameField = astmField(fields, 6);
  const name: PatientName | undefined =
    nameField !== undefined && fieldScalar(nameField) !== undefined
      ? {
          raw: nameField.raw,
          ...definedString("last", nameField.components[0]),
          ...definedString("first", nameField.components[1]),
          ...definedString("middle", nameField.components[2]),
        }
      : undefined;

  const birthDate = parseDateField(
    fieldScalar(astmField(fields, 8)),
    recordIndex,
    "P",
    8,
    warnings,
  );

  return {
    type: "P",
    recordIndex,
    fields,
    ...definedString("seq", fieldScalar(astmField(fields, 2))),
    // The three patient identifiers stay DISTINCT — practice-assigned (3), laboratory-assigned (4),
    // and a third ID (5) never collapse into one; conflating them is the primary misfiling path.
    ...definedString("practiceAssignedId", fieldScalar(astmField(fields, 3))),
    ...definedString("laboratoryAssignedId", fieldScalar(astmField(fields, 4))),
    ...definedString("patientIdThree", fieldScalar(astmField(fields, 5))),
    ...(name !== undefined ? { name } : {}),
    ...definedString("mothersMaidenName", fieldScalar(astmField(fields, 7))),
    ...(birthDate !== undefined ? { birthDate } : {}),
    ...definedString("sex", fieldScalar(astmField(fields, 9))),
  };
}

function buildOrder(recordIndex: number, fields: readonly AstmField[]): OrderRecord {
  const utidField = astmField(fields, 5);
  return {
    type: "O",
    recordIndex,
    fields,
    ...definedString("seq", fieldScalar(astmField(fields, 2))),
    ...definedString("specimenId", fieldScalar(astmField(fields, 3))),
    ...definedString("instrumentSpecimenId", fieldScalar(astmField(fields, 4))),
    ...(hasContent(utidField)
      ? { universalTestId: recognizeUniversalTestId(utidField.components) }
      : {}),
    // Priority (6), action code (~12), and report type (~26) are surfaced verbatim. The `~` field
    // indices and the code sets are `[OSS-derived]` (paywalled), so they are never mapped to a
    // guessed meaning — see the JSDoc on `OrderRecord`.
    ...definedString("priority", fieldScalar(astmField(fields, 6))),
    ...definedString("actionCode", fieldScalar(astmField(fields, 12))),
    ...definedString("reportType", fieldScalar(astmField(fields, 26))),
  };
}

/**
 * Whether a field carries any content at all — used to decide a Universal Test ID is present. The
 * scalar check is wrong here: a UTID's code lives in component 4 while component 1 (the LOINC slot)
 * is normally empty, so `fieldScalar` (first non-empty component) would miss `^^^687`.
 */
function hasContent(field: AstmField | undefined): field is AstmField {
  return field !== undefined && field.raw.length > 0;
}

function buildResult(
  recordIndex: number,
  fields: readonly AstmField[],
  warnings: AstmRecordWarning[],
): ResultRecord {
  const utidField = astmField(fields, 3);
  const valueField = astmField(fields, 4);
  const startedAt = parseDateField(
    fieldScalar(astmField(fields, 12)),
    recordIndex,
    "R",
    12,
    warnings,
  );
  const completedAt = parseDateField(
    fieldScalar(astmField(fields, 13)),
    recordIndex,
    "R",
    13,
    warnings,
  );

  // A value field with more than one component carried an *unescaped* component delimiter — an
  // ambiguity. Fail-safe: surface BOTH the full raw value (so nothing is truncated) AND the split,
  // and WARN. Never resolve it silently to a single (wrong, truncated) value.
  const ambiguous = valueField !== undefined && valueField.components.length > 1;
  const valueComponents = ambiguous ? valueField.components : undefined;
  // The primary `value` is the decoded scalar for the ordinary single-component case, but the FULL
  // raw field text when ambiguous — so `results(msg)[0].value` is never a truncated component.
  const value = ambiguous ? valueField.raw : fieldScalar(valueField);
  if (ambiguous) {
    warnings.push(ambiguousValueSplit({ recordIndex, recordType: "R", fieldIndex: 4 }));
  }

  // ── Phase 2: modeled, fail-safe result semantics (raw fields still surfaced alongside). ──
  const units = fieldScalar(astmField(fields, 5));
  // Reference range is surfaced from the FULL field text (not the first component), so a
  // component-delimited value (`low^high`) is preserved verbatim and read as `unparsed` + warned,
  // never truncated to a single bound. A present-but-empty field is treated as absent (no warn).
  const rangeRaw = fieldRaw(astmField(fields, 6));
  const flagRaw = fieldScalar(astmField(fields, 7));
  const statusRaw = fieldScalar(astmField(fields, 9));

  // Units: a *numeric* value with no units is the hazard (a bare magnitude is meaningless). Warn only
  // then — a qualitative result (e.g. "POSITIVE") legitimately has no units. Never default or guess.
  if (units === undefined && value !== undefined && isNumericValue(value)) {
    warnings.push(unitsAbsent({ recordIndex, recordType: "R", fieldIndex: 5 }));
  }

  const range = rangeRaw !== undefined ? parseReferenceRange(rangeRaw) : undefined;
  if (range?.kind === "unparsed") {
    warnings.push(unparseableReferenceRange({ recordIndex, recordType: "R", fieldIndex: 6 }));
  }

  const flag = flagRaw !== undefined ? interpretAbnormalFlag(flagRaw) : undefined;
  if (flag !== undefined && !flag.recognized) {
    warnings.push(undefinedAbnormalFlag({ recordIndex, recordType: "R", fieldIndex: 7 }));
  }

  // Status is ALWAYS modeled: an absent field 9 yields `unspecified` (never assumed `final`).
  const status = interpretResultStatus(statusRaw);
  if (statusRaw !== undefined && !status.recognized) {
    warnings.push(undefinedResultStatus({ recordIndex, recordType: "R", fieldIndex: 9 }));
  }

  return {
    type: "R",
    recordIndex,
    fields,
    ...definedString("seq", fieldScalar(astmField(fields, 2))),
    ...(hasContent(utidField)
      ? { universalTestId: recognizeUniversalTestId(utidField.components) }
      : {}),
    ...definedString("value", value),
    ...(valueComponents !== undefined ? { valueComponents } : {}),
    ...definedString("units", units),
    ...definedString("referenceRange", rangeRaw),
    ...(range !== undefined ? { range } : {}),
    ...definedString("abnormalFlags", flagRaw),
    ...(flag !== undefined ? { flag } : {}),
    ...definedString("resultStatus", statusRaw),
    status,
    ...definedString("operator", fieldScalar(astmField(fields, 11))),
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(completedAt !== undefined ? { completedAt } : {}),
    ...definedString("instrument", fieldScalar(astmField(fields, 14))),
  };
}

/**
 * Build a `C` (comment) record from its fields. Parent attachment is resolved in a second pass
 * ({@link attachComments}); here `attachedToRoot` is a provisional `false` and `parentIndex` is unset.
 */
function buildComment(recordIndex: number, fields: readonly AstmField[]): CommentRecord {
  const textField = astmField(fields, 4);
  // Comment text is component-capable: multiple components are a normal structured comment, not an
  // ambiguity, so no warning. Surface the FULL field text (never truncated) plus the component split.
  const textComponents =
    textField !== undefined && textField.components.length > 1 ? textField.components : undefined;
  const text = textField !== undefined && textField.raw.length > 0 ? textField.raw : undefined;

  return {
    type: "C",
    recordIndex,
    fields,
    attachedToRoot: false,
    ...definedString("seq", fieldScalar(astmField(fields, 2))),
    ...definedString("source", fieldScalar(astmField(fields, 3))),
    ...definedString("text", text),
    ...(textComponents !== undefined ? { textComponents } : {}),
    ...definedString("commentType", fieldScalar(astmField(fields, 5))),
  };
}

/**
 * Build a `Q` (Request Information) record. The field *positions* are the public ASTM E1394 layout
 * (3 = starting range ID, 4 = ending range ID, 5 = Universal Test ID, 13 = request-info status); the
 * starting/ending range component structure, the `ALL` universal-query keyword, and the status code
 * set are all `[OSS-derived / paywalled]` — surfaced **verbatim** and **never interpreted or guessed**.
 * A present request-information status is flagged uninterpreted (the code set is paywalled).
 */
function buildQuery(
  recordIndex: number,
  fields: readonly AstmField[],
  warnings: AstmRecordWarning[],
): QueryRecord {
  const utidField = astmField(fields, 5);
  // The `ALL` universal-query keyword is recognized as a literal token only; its behavior is paywalled.
  const utidRaw = fieldRaw(utidField);
  const queriesAllTests = utidRaw !== undefined && utidRaw.trim().toUpperCase() === "ALL";

  // Surfaced from the FULL field text (fieldRaw, not fieldScalar) so it is literally verbatim — never
  // escape-decoded and never truncated to the first component — and so the uninterpreted-status warning
  // fires on ANY non-empty field-13 (matching the range-ID fields above). The status code set is
  // paywalled, so the value is passed through untouched, never interpreted.
  const requestInformationStatus = fieldRaw(astmField(fields, 13));
  if (requestInformationStatus !== undefined) {
    warnings.push(uninterpretedQueryStatus({ recordIndex, recordType: "Q", fieldIndex: 13 }));
  }

  return {
    type: "Q",
    recordIndex,
    fields,
    ...definedString("seq", fieldScalar(astmField(fields, 2))),
    // Range IDs are surfaced from the FULL field text (never truncated to a component); their internal
    // caret structure is [OSS-derived]/paywalled and is not interpreted here.
    ...definedString("startingRangeId", fieldRaw(astmField(fields, 3))),
    ...definedString("endingRangeId", fieldRaw(astmField(fields, 4))),
    ...(hasContent(utidField) && !queriesAllTests
      ? { universalTestId: recognizeUniversalTestId(utidField.components) }
      : {}),
    queriesAllTests,
    ...definedString("requestInformationStatus", requestInformationStatus),
  };
}

/**
 * Attach every `C` (comment) record to its parent by position — the immediately-preceding
 * `H`/`P`/`O`/`R` record; consecutive comments share that parent. **Fail-safe:** a comment with no
 * valid preceding parent is an **orphan** — it is attached to the message root (`attachedToRoot:
 * true`) with an `ASTM_RECORD_ORPHAN_COMMENT` warning, **never dropped**. Returns a new array; the
 * non-comment records pass through unchanged.
 *
 * @param records - The built records, in wire order.
 * @param warnings - The accumulator an orphan comment warns onto.
 * @returns The records with each comment's `parentIndex` / `attachedToRoot` resolved.
 * @example
 * ```ts
 * import { attachComments } from "@cosyte/astm";
 * // A comment with no preceding H/P/O/R is an orphan attached to the root.
 * const warnings: import("@cosyte/astm").AstmRecordWarning[] = [];
 * const out = attachComments(
 *   [{ type: "C", recordIndex: 0, fields: [], attachedToRoot: false }],
 *   warnings,
 * );
 * (out[0] as { attachedToRoot: boolean }).attachedToRoot; // true
 * ```
 */
export function attachComments(
  records: readonly AstmRecord[],
  warnings: AstmRecordWarning[],
): AstmRecord[] {
  let lastParentIndex: number | undefined;
  return records.map((rec) => {
    if (rec.type === "H" || rec.type === "P" || rec.type === "O" || rec.type === "R") {
      lastParentIndex = rec.recordIndex;
      return rec;
    }
    if (rec.type !== "C") return rec;
    if (lastParentIndex === undefined) {
      warnings.push(orphanComment({ recordIndex: rec.recordIndex, recordType: "C" }));
      return { ...rec, attachedToRoot: true };
    }
    return { ...rec, parentIndex: lastParentIndex, attachedToRoot: false };
  });
}

/**
 * Parse a `YYYYMMDDHHMMSS` date field, emitting a value-free `ASTM_RECORD_PARTIAL_TIMESTAMP` warning
 * when the digit run truncates a component (an odd length that cuts a two-digit component in half).
 * The raw run is preserved and the structured value is never zero-filled into a fabricated time.
 */
function parseDateField(
  raw: string | undefined,
  recordIndex: number,
  recordType: string,
  fieldIndex: number,
  warnings: AstmRecordWarning[],
): AstmDate | undefined {
  if (raw === undefined) return undefined;
  const date = parseAstmDate(raw);
  if (date?.truncated === true) {
    warnings.push(partialTimestamp({ recordIndex, recordType, fieldIndex }));
  }
  return date;
}

/**
 * Whether a result value is purely numeric (optional comparator + sign + digits) — the case where a
 * missing unit is a genuine hazard. A qualitative value (letters, e.g. `POSITIVE`) is excluded, so it
 * does not trip the units-absent warning.
 */
function isNumericValue(value: string): boolean {
  return /^\s*[<>]?\s*-?\d+(?:\.\d+)?\s*$/u.test(value);
}

/** The full field text (all components), or `undefined` when the field is absent or empty. */
function fieldRaw(field: AstmField | undefined): string | undefined {
  return field !== undefined && field.raw.length > 0 ? field.raw : undefined;
}

/** Spread helper: include `{ [key]: value }` only when `value` is a defined string. */
function definedString(key: string, value: string | undefined): Record<string, string> {
  return value === undefined ? {} : { [key]: value };
}
