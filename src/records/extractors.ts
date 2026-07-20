/**
 * Typed extractors over an {@link AstmMessage} — the one-line "pull the value out"
 * surface that is the package's north star.
 *
 * They are thin, total, and immutable: they read the already-parsed model and
 * never re-parse, never mutate, and never fabricate. `results()` returns every
 * `R` record in order; `patient()` returns the first `P` record (the identity a
 * result files against), or `undefined` when the message carries none.
 */

import type { AstmMessage, PatientRecord, ResultRecord } from "./types.js";

/**
 * Every result (`R`) record in the message, in wire order.
 *
 * @param msg - A parsed message.
 * @returns The result records (possibly empty).
 * @example
 * ```ts
 * import { parseAstmRecords, results } from "@cosyte/astm";
 * const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
 * results(msg)[0]?.units; // "U/L"
 * ```
 */
export function results(msg: AstmMessage): readonly ResultRecord[] {
  return msg.records.filter((r): r is ResultRecord => r.type === "R");
}

/**
 * The first patient (`P`) record, or `undefined` when the message has none.
 *
 * A message can carry several `P` records (multiple patients in a batch); this
 * returns the first. Consumers needing all of them can filter `msg.records`.
 *
 * @param msg - A parsed message.
 * @returns The first patient record, or `undefined`.
 * @example
 * ```ts
 * import { parseAstmRecords, patient } from "@cosyte/astm";
 * const msg = parseAstmRecords("H|\\^&\rP|1|PRAC|LAB\rL|1\r");
 * patient(msg)?.practiceAssignedId; // "PRAC"
 * ```
 */
export function patient(msg: AstmMessage): PatientRecord | undefined {
  return msg.records.find((r): r is PatientRecord => r.type === "P");
}
