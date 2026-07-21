/**
 * Public entry point for the `@cosyte/astm` package — the ASTM/CLSI-LIS02
 * **record** layer (Phase 1).
 *
 * The north star: hand a de-framed ASTM record stream to {@link parseAstmRecords}
 * and pull a result's value, units, and flag out in one line — lenient on parse
 * (vendor quirks become typed warnings, never silent loss), and — the whole point
 * — **never a confident wrong value**. Delimiters are read from each header,
 * embedded escapes are decoded before a value is split, the practice- and
 * laboratory-assigned patient IDs stay distinct, and every deviation is a stable,
 * value-free warning.
 *
 * Deferred to later phases: result flag/status *semantics* (P2), comments / query
 * / `M` / `S` (P3–P4), the E1381 framing layer (P5+), and serialize/build (P7).
 */

/**
 * Library version string, synced with `package.json#version` at build time.
 *
 * @example
 * ```ts
 * import { VERSION } from "@cosyte/astm";
 * console.log(VERSION);
 * ```
 */
export const VERSION = "0.0.0";

export { parseAstmRecords, AstmStrictError } from "./records/parse.js";
export { results, patient } from "./records/extractors.js";
export { fieldScalar, tokenizeRecord } from "./records/tokenize.js";
export {
  interpretAbnormalFlag,
  interpretResultStatus,
  parseReferenceRange,
} from "./records/result-semantics.js";
export type {
  AbnormalFlag,
  AbnormalFlagCode,
  AbnormalFlagMeaning,
  ReferenceRange,
  ReferenceRangeKind,
  ResultStatus,
  ResultStatusCode,
  ResultStatusMeaning,
} from "./records/result-semantics.js";
export type {
  AstmField,
  AstmMessage,
  AstmParseOptions,
  AstmRecord,
  HeaderRecord,
  PatientRecord,
  PatientName,
  OrderRecord,
  ResultRecord,
  TerminatorRecord,
  UnsupportedRecord,
} from "./records/types.js";

export { FATAL_CODES, AstmParseError } from "./common/errors.js";
export type { FatalCode } from "./common/errors.js";
export {
  WARNING_CODES,
  unknownRecordType,
  nonStandardDelimiters,
  unknownEscapeSequence,
  ambiguousValueSplit,
  undefinedAbnormalFlag,
  undefinedResultStatus,
  unparseableReferenceRange,
  unitsAbsent,
} from "./common/warnings.js";
export type { WarningCode, AstmRecordWarning } from "./common/warnings.js";
export type { AstmPosition } from "./common/position.js";

export { CANONICAL_DELIMITERS, readDelimiters, isNonStandard } from "./common/delimiters.js";
export type { Delimiters } from "./common/delimiters.js";
export { decodeEscapes, splitEscapeAware } from "./common/escapes.js";
export type { UnknownEscapeSink } from "./common/escapes.js";
export { parseAstmDate, astmDateToLocalISO } from "./common/dates.js";
export type { AstmDate, AstmDatePrecision } from "./common/dates.js";
export { recognizeUniversalTestId, primaryCode } from "./common/coding-system.js";
export type { UniversalTestId, UniversalTestIdProvenance } from "./common/coding-system.js";
export { deepFreeze } from "./common/freeze.js";
