/**
 * Typed extractors over an {@link AstmMessage} — the one-line "pull the value out"
 * surface that is the package's north star.
 *
 * They are thin and immutable: they read the already-parsed model and never re-parse,
 * never mutate, and never fabricate.
 *
 * **They are scoped to a single message, and they enforce it.** An `AstmMessage` models a
 * whole record **stream**, which may carry several `H` … `L` messages back to back. These
 * extractors read across the whole stream, so on a multi-message stream `patient()` used to
 * answer with the first `P` in the stream while `results()` answered with every `R` in it —
 * pairing the two attributed one patient's results to another, silently and with no warning.
 * They now **refuse** that stream: an {@link AstmAmbiguousStreamError} instead of a confident
 * wrong answer, which is the same rule the rest of this parser follows. {@link messages} is
 * the path that works on any stream, and `commentsFor()` keeps working on every stream
 * because its parent record already names the message.
 *
 * @see {@link messages}
 */

import { assertSingleMessage, assertSinglePatient } from "./messages.js";
import type {
  AstmMessage,
  AstmRecord,
  CommentRecord,
  OrderRecord,
  PatientRecord,
  QueryRecord,
  ResultRecord,
} from "./types.js";

/**
 * Every result (`R`) record in the message, in wire order.
 *
 * @param msg - A parsed **single-message** stream.
 * @returns The result records (possibly empty).
 * @throws {@link AstmAmbiguousStreamError} (`ASTM_AMBIGUOUS_MULTI_MESSAGE`) when the stream
 *   carries more than one message — see {@link messages}.
 * @example
 * ```ts
 * import { parseAstmRecords, results } from "@cosyte/astm";
 * const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
 * results(msg)[0]?.units; // "U/L"
 * ```
 */
export function results(msg: AstmMessage): readonly ResultRecord[] {
  assertSingleMessage(msg, "results()");
  return msg.records.filter((r): r is ResultRecord => r.type === "R");
}

/**
 * The message's patient (`P`) record, or `undefined` when the message carries none.
 *
 * This is the identity a result files against, so it is answered only when the stream
 * determines exactly one. It **refuses** the two shapes where "the patient" is a guess: a
 * stream carrying several messages, and a single message carrying several `P` records. In
 * both, the old behaviour — the first `P` in the stream — is the wrong-patient path itself.
 *
 * @param msg - A parsed single-message stream carrying at most one patient.
 * @returns The patient record, or `undefined` when the message carries none.
 * @throws {@link AstmAmbiguousStreamError} (`ASTM_AMBIGUOUS_MULTI_MESSAGE`) when the stream
 *   carries more than one message, or (`ASTM_AMBIGUOUS_MULTI_PATIENT`) when its one message
 *   carries more than one `P`. Use {@link messages} and read `patients` in both cases.
 * @example
 * ```ts
 * import { parseAstmRecords, patient } from "@cosyte/astm";
 * const msg = parseAstmRecords("H|\\^&\rP|1|PRAC|LAB\rL|1\r");
 * patient(msg)?.practiceAssignedId; // "PRAC"
 * ```
 */
export function patient(msg: AstmMessage): PatientRecord | undefined {
  assertSingleMessage(msg, "patient()");
  assertSinglePatient(msg, "patient()");
  return msg.records.find((r): r is PatientRecord => r.type === "P");
}

/**
 * Every order (`O`) record in the message, in wire order.
 *
 * @param msg - A parsed **single-message** stream.
 * @returns The order records (possibly empty).
 * @throws {@link AstmAmbiguousStreamError} (`ASTM_AMBIGUOUS_MULTI_MESSAGE`) when the stream
 *   carries more than one message — see {@link messages}.
 * @example
 * ```ts
 * import { parseAstmRecords, orders } from "@cosyte/astm";
 * const msg = parseAstmRecords("H|\\^&\rO|1|ACC-42||^^^687|R\rL|1\r");
 * orders(msg)[0]?.specimenId; // "ACC-42"
 * ```
 */
export function orders(msg: AstmMessage): readonly OrderRecord[] {
  assertSingleMessage(msg, "orders()");
  return msg.records.filter((r): r is OrderRecord => r.type === "O");
}

/**
 * Every comment (`C`) record in the message, in wire order. Each carries the
 * `parentIndex` of the `H`/`P`/`O`/`R` it attaches to (or `attachedToRoot` when
 * it is an orphan) — use {@link commentsFor} to get the comments of one record.
 *
 * @param msg - A parsed **single-message** stream.
 * @returns The comment records (possibly empty).
 * @throws {@link AstmAmbiguousStreamError} (`ASTM_AMBIGUOUS_MULTI_MESSAGE`) when the stream
 *   carries more than one message — see {@link messages}.
 * @example
 * ```ts
 * import { parseAstmRecords, comments } from "@cosyte/astm";
 * const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|5|U/L||||F\rC|1|I|checked|G\rL|1\r");
 * comments(msg)[0]?.text; // "checked"
 * ```
 */
export function comments(msg: AstmMessage): readonly CommentRecord[] {
  assertSingleMessage(msg, "comments()");
  return msg.records.filter((r): r is CommentRecord => r.type === "C");
}

/**
 * The comment (`C`) records attached to a given parent record, in wire order.
 *
 * Unlike the other extractors this works on **any** stream, single- or multi-message: the
 * parent record it is handed already names the message, so there is nothing to disambiguate.
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

/**
 * Every request-information (`Q`) record in the message, in wire order. A non-empty
 * result means the message is a **host-query request**, not a result set — see
 * {@link AstmMessage.classification} (`isHostQueryRequest`).
 *
 * @param msg - A parsed **single-message** stream.
 * @returns The query records (possibly empty).
 * @throws {@link AstmAmbiguousStreamError} (`ASTM_AMBIGUOUS_MULTI_MESSAGE`) when the stream
 *   carries more than one message — see {@link messages}.
 * @example
 * ```ts
 * import { parseAstmRecords, query } from "@cosyte/astm";
 * const msg = parseAstmRecords("H|\\^&\rP|1\rQ|1|^SPEC-7||ALL\rL|1\r");
 * query(msg)[0]?.queriesAllTests; // true
 * ```
 */
export function query(msg: AstmMessage): readonly QueryRecord[] {
  assertSingleMessage(msg, "query()");
  return msg.records.filter((r): r is QueryRecord => r.type === "Q");
}
