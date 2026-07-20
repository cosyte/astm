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
import { parseAstmDate } from "../common/dates.js";
import { recognizeUniversalTestId } from "../common/coding-system.js";
import {
  ambiguousValueSplit,
  nonStandardDelimiters,
  unknownEscapeSequence,
  unknownRecordType,
  type AstmRecordWarning,
} from "../common/warnings.js";
import { fieldScalar, tokenizeRecord } from "./tokenize.js";
import type {
  AstmField,
  AstmMessage,
  AstmParseOptions,
  AstmRecord,
  HeaderRecord,
  OrderRecord,
  PatientName,
  PatientRecord,
  ResultRecord,
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

  const records: AstmRecord[] = lines.map((line, recordIndex) =>
    buildRecord(line, recordIndex, delimiters, warnings),
  );

  const header = records[0] as HeaderRecord;
  const message: AstmMessage = { header, records, delimiters, warnings };

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
      return buildPatient(recordIndex, fields);
    case "O":
      return buildOrder(recordIndex, fields);
    case "R":
      return buildResult(recordIndex, fields, warnings);
    case "L":
      return { type: "L", recordIndex, fields } satisfies TerminatorRecord;
    default: {
      warnings.push(unknownRecordType({ recordIndex, recordType: rawType }));
      return { type: "unsupported", rawType, recordIndex, fields } satisfies UnsupportedRecord;
    }
  }
}

function buildPatient(recordIndex: number, fields: readonly AstmField[]): PatientRecord {
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

  const birthRaw = fieldScalar(astmField(fields, 8));
  const birthDate = birthRaw !== undefined ? parseAstmDate(birthRaw) : undefined;

  return {
    type: "P",
    recordIndex,
    fields,
    ...definedString("seq", fieldScalar(astmField(fields, 2))),
    ...definedString("practiceAssignedId", fieldScalar(astmField(fields, 3))),
    ...definedString("laboratoryAssignedId", fieldScalar(astmField(fields, 4))),
    ...(name !== undefined ? { name } : {}),
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
  const startedRaw = fieldScalar(astmField(fields, 12));
  const completedRaw = fieldScalar(astmField(fields, 13));
  const startedAt = startedRaw !== undefined ? parseAstmDate(startedRaw) : undefined;
  const completedAt = completedRaw !== undefined ? parseAstmDate(completedRaw) : undefined;

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
    ...definedString("units", fieldScalar(astmField(fields, 5))),
    ...definedString("referenceRange", fieldScalar(astmField(fields, 6))),
    ...definedString("abnormalFlags", fieldScalar(astmField(fields, 7))),
    ...definedString("resultStatus", fieldScalar(astmField(fields, 9))),
    ...definedString("operator", fieldScalar(astmField(fields, 11))),
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(completedAt !== undefined ? { completedAt } : {}),
    ...definedString("instrument", fieldScalar(astmField(fields, 14))),
  };
}

/** Spread helper: include `{ [key]: value }` only when `value` is a defined string. */
function definedString(key: string, value: string | undefined): Record<string, string> {
  return value === undefined ? {} : { [key]: value };
}
