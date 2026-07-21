/**
 * Typed extractors over an {@link AstmMessage} — the one-line "pull the value out"
 * surface that is the package's north star.
 *
 * They are thin, total, and immutable: they read the already-parsed model and
 * never re-parse, never mutate, and never fabricate. `results()` returns every
 * `R` record in order; `patient()` returns the first `P` record (the identity a
 * result files against), or `undefined` when the message carries none.
 */

import type {
  AstmMessage,
  AstmRecord,
  CommentRecord,
  OrderRecord,
  PatientRecord,
  ResultRecord,
} from "./types.js";

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

/**
 * Every order (`O`) record in the message, in wire order.
 *
 * @param msg - A parsed message.
 * @returns The order records (possibly empty).
 * @example
 * ```ts
 * import { parseAstmRecords, orders } from "@cosyte/astm";
 * const msg = parseAstmRecords("H|\\^&\rO|1|ACC-42||^^^687|R\rL|1\r");
 * orders(msg)[0]?.specimenId; // "ACC-42"
 * ```
 */
export function orders(msg: AstmMessage): readonly OrderRecord[] {
  return msg.records.filter((r): r is OrderRecord => r.type === "O");
}

/**
 * Every comment (`C`) record in the message, in wire order. Each carries the
 * `parentIndex` of the `H`/`P`/`O`/`R` it attaches to (or `attachedToRoot` when
 * it is an orphan) — use {@link commentsFor} to get the comments of one record.
 *
 * @param msg - A parsed message.
 * @returns The comment records (possibly empty).
 * @example
 * ```ts
 * import { parseAstmRecords, comments } from "@cosyte/astm";
 * const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|5|U/L||||F\rC|1|I|checked|G\rL|1\r");
 * comments(msg)[0]?.text; // "checked"
 * ```
 */
export function comments(msg: AstmMessage): readonly CommentRecord[] {
  return msg.records.filter((r): r is CommentRecord => r.type === "C");
}

/**
 * The comment (`C`) records attached to a given parent record, in wire order.
 * Returns the comments whose `parentIndex` is that record's `recordIndex`, so a
 * comment carrying (e.g.) QC context is read against the record it modifies —
 * never floated to the wrong one.
 *
 * @param msg - A parsed message.
 * @param parent - The `H`/`P`/`O`/`R` record whose comments to collect.
 * @returns The attached comment records (possibly empty).
 * @example
 * ```ts
 * import { parseAstmRecords, results, commentsFor } from "@cosyte/astm";
 * const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|5|U/L||||F\rC|1|I|checked|G\rL|1\r");
 * commentsFor(msg, results(msg)[0]!)[0]?.text; // "checked"
 * ```
 */
export function commentsFor(msg: AstmMessage, parent: AstmRecord): readonly CommentRecord[] {
  return msg.records.filter(
    (r): r is CommentRecord => r.type === "C" && r.parentIndex === parent.recordIndex,
  );
}
