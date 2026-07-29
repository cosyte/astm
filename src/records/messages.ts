/**
 * Message grouping — the safe replacement for the stream-scoped extractors.
 *
 * A parsed {@link AstmMessage} models a whole **record stream**, and a stream may carry
 * several messages back to back: a message runs from an `H` header to its `L` terminator.
 * The flat extractors in `./extractors.js` read the whole stream, so on a multi-message
 * stream `patient(msg)` answered with the first `P` in the stream while `results(msg)`
 * answered with every `R` in it — pairing the two, which is exactly what the package's
 * one-line north star does, attributed one patient's results to another. It needed no
 * redeclaration and no unusual delimiters, and it warned about nothing.
 *
 * {@link messages} is the fix: it splits the stream into the messages it actually
 * contains, and each one carries only its own records, so a patient and a result are only
 * ever paired inside the message that carried both.
 *
 * **Where a message begins.** A new message opens at every `H` record and runs to the
 * record before the next `H` (or the end of the stream). That is deliberately the *same*
 * boundary the parser already uses to scope delimiters: the active delimiter set is
 * re-read at each `H` and governs that header and the records that follow it, so message
 * boundaries and delimiter scope cannot disagree. The `L` terminator **closes** a message
 * but does not open a scope, so anything between an `L` and the next `H` stays with the
 * message its header opened rather than being dropped. Grouping is therefore **total**:
 * every record of the stream lands in exactly one message, none duplicated, none lost.
 *
 * **What the standard grounds, and what it does not.** CLSI LIS02-A2 §2 is definitional
 * about the unit itself: a message is bounded by the `H` record at one end and the `L`
 * record at the other. That clause is in CLSI's free sample and is the whole of what is
 * claimed from the standard here. It does **not** settle which record *opens* a new scope
 * partway through a stream, so treating a second `H` as the start of the next message —
 * rather than, say, requiring an intervening `L` — is a reasoned choice, not a citation. It
 * is made this way because it is the boundary this parser already enforces for delimiters,
 * and because it never drops a record.
 *
 * **What is deliberately not modeled.** ASTM's within-message record hierarchy — which `P`
 * a given `R` files against when one message carries several patients — is not modeled
 * here. The clauses that would ground it (the message-level structure diagram, and the `P`
 * sequence-number rule) are withheld from the free sample and are paywalled, so rather than
 * guess a scoping rule this layer refuses to answer: a message carrying more than one `P`
 * leaves {@link AstmStreamMessage.patient} `undefined` and surfaces all of them on
 * {@link AstmStreamMessage.patients}. Multi-patient messages are real — at least one
 * openly-published vendor interface grammar makes the patient group repeatable on the
 * download direction — so this is a deferral with a known shape, not a claim that the case
 * does not arise, and not a claim that the standard is silent about it.
 *
 * **The OSS corpus was checked and offers no prior art.** It is informative here, unlike
 * for delimiter questions, but only negatively: the two commonly-cited reference
 * implementations both dissolve the message unit. One dispatches records to per-type
 * callbacks one at a time with no carried state, leaving the grouping to the integrator;
 * the other merges every message of a transport session into one envelope of flat
 * per-record-type buckets, from which the association cannot be recovered at all. A flat
 * model is the incumbent shape, and the misattribution above is what it costs.
 */

import type { Delimiters } from "../common/delimiters.js";
import type { AstmPosition } from "../common/position.js";
import type {
  AstmMessage,
  AstmRecord,
  CommentRecord,
  HeaderRecord,
  OrderRecord,
  PatientRecord,
  QueryRecord,
  ResultRecord,
} from "./types.js";

/**
 * Stable codes for the two ways a flat, stream-scoped accessor can fail to name a single
 * answer. Renaming a code is a **breaking change**.
 *
 * @example
 * ```ts
 * import { parseAstmRecords, patient, AMBIGUOUS_CODES, AstmAmbiguousStreamError } from "@cosyte/astm";
 * try {
 *   patient(parseAstmRecords(raw));
 * } catch (err) {
 *   if (err instanceof AstmAmbiguousStreamError) {
 *     err.code === AMBIGUOUS_CODES.ASTM_AMBIGUOUS_MULTI_MESSAGE;
 *   }
 * }
 * ```
 */
export const AMBIGUOUS_CODES = {
  /** The stream carries more than one `H` … `L` message, so a stream-wide answer spans patients. */
  ASTM_AMBIGUOUS_MULTI_MESSAGE: "ASTM_AMBIGUOUS_MULTI_MESSAGE",
  /** The one message in the stream carries more than one `P`, so "the patient" is not determined. */
  ASTM_AMBIGUOUS_MULTI_PATIENT: "ASTM_AMBIGUOUS_MULTI_PATIENT",
} as const;

/** A value from {@link AMBIGUOUS_CODES} — the discriminant on {@link AstmAmbiguousStreamError}. */
export type AmbiguousCode = (typeof AMBIGUOUS_CODES)[keyof typeof AMBIGUOUS_CODES];

/**
 * Thrown by a flat extractor when the stream it was handed does not determine a single
 * answer — either because it carries several messages, or because its one message carries
 * several patients.
 *
 * The throw **is** the fix. A caller who gets this error is strictly better off than one
 * who silently received another patient's results, and the remedy is mechanical: walk
 * {@link messages} and read each message's own records.
 *
 * **PHI:** carries a stable code, a position, and two counts. Never a field value, never a
 * patient identifier.
 *
 * @example
 * ```ts
 * import { parseAstmRecords, messages, results, AstmAmbiguousStreamError } from "@cosyte/astm";
 * const msg = parseAstmRecords(raw);
 * try {
 *   results(msg);
 * } catch (err) {
 *   if (err instanceof AstmAmbiguousStreamError) {
 *     for (const m of messages(msg)) m.results.length;
 *   }
 * }
 * ```
 */
export class AstmAmbiguousStreamError extends Error {
  /** The stable discriminant — see {@link AMBIGUOUS_CODES}. */
  public readonly code: AmbiguousCode;
  /** Where the ambiguity became visible: the second header, or the second `P`. Value-free. */
  public readonly position: AstmPosition;
  /** How many `H` … `L` messages the stream carries. */
  public readonly messageCount: number;
  /** How many `P` records the message in question carries. */
  public readonly patientCount: number;

  /** @internal */
  public constructor(
    code: AmbiguousCode,
    message: string,
    position: AstmPosition,
    counts: { readonly messageCount: number; readonly patientCount: number },
  ) {
    super(message);
    this.name = "AstmAmbiguousStreamError";
    this.code = code;
    this.position = position;
    this.messageCount = counts.messageCount;
    this.patientCount = counts.patientCount;
  }
}

/**
 * One `H` … `L` message inside a parsed stream, with its own records and nothing else.
 *
 * This is the unit the flat extractors were always assumed to be reading. `AstmMessage`
 * models the whole stream; this models a message within it.
 */
export interface AstmStreamMessage {
  /** 0-based ordinal of this message within the stream. */
  readonly index: number;
  /** This message's header record. */
  readonly header: HeaderRecord;
  /**
   * The delimiter set in force for this message — the header's own resolved set, which is
   * the set its records were actually read with. When a later header's declaration was
   * unusable, this is the set that stayed in force, never a guessed one.
   */
  readonly delimiters: Delimiters;
  /** Every record of this message in wire order, the header first. */
  readonly records: readonly AstmRecord[];
  /**
   * This message's patient — but **only when the message determines one**: the single `P`
   * when it carries exactly one, and `undefined` when it carries none **or** several.
   * `patients.length` distinguishes those two cases; there is no third meaning.
   *
   * A message carrying several patients is not answered with the first one, because
   * "the first `P`" is precisely the guess that files a result against the wrong person.
   */
  readonly patient: PatientRecord | undefined;
  /** Every `P` record in this message, in wire order (usually zero or one). */
  readonly patients: readonly PatientRecord[];
  /** Every `R` (result) record in this message, in wire order. */
  readonly results: readonly ResultRecord[];
  /** Every `O` (order) record in this message, in wire order. */
  readonly orders: readonly OrderRecord[];
  /** Every `C` (comment) record in this message, in wire order. */
  readonly comments: readonly CommentRecord[];
  /**
   * Every `Q` (request-information) record in this message, in wire order.
   *
   * For this message's host-query classification, call `classifyMessage(m.records)`. The
   * `classification` on the parsed model is folded over the **whole stream**, so it is not
   * per-message and is not mirrored here; deriving it from a message's own records is.
   */
  readonly queries: readonly QueryRecord[];
}

/**
 * Split a parsed stream into the `H` … `L` messages it carries.
 *
 * This is the safe path and it never throws: a single-message stream yields exactly one
 * entry, and pairing a patient with a result inside one entry is correct by construction.
 *
 * Returns an **array**, not an iterator: the stream is already fully parsed and frozen, so
 * there is no work to defer, and every other extractor in this package returns a
 * `readonly` array.
 *
 * @param msg - A parsed stream.
 * @returns The messages, in wire order; never empty for a parsed stream.
 * @example
 * ```ts
 * import { parseAstmRecords, messages } from "@cosyte/astm";
 * const stream = parseAstmRecords("H|\\^&\rP|1|PRAC-1\rR|1|^^^687|1.0|U/L||N||F\rL|1\r");
 * for (const m of messages(stream)) {
 *   m.patient?.practiceAssignedId; // "PRAC-1"
 *   m.results[0]?.value; // "1.0"
 * }
 * ```
 */
export function messages(msg: AstmMessage): readonly AstmStreamMessage[] {
  const groups: AstmRecord[][] = [];
  let current: AstmRecord[] | undefined;
  for (const record of msg.records) {
    if (record.type === "H" || current === undefined) {
      current = [];
      groups.push(current);
    }
    current.push(record);
  }

  return Object.freeze(
    groups.map((records, index) => {
      const header = records.find((r): r is HeaderRecord => r.type === "H") ?? msg.header;
      const patients = records.filter((r): r is PatientRecord => r.type === "P");
      return Object.freeze({
        index,
        header,
        delimiters: header.delimiters,
        records: Object.freeze(records),
        patient: patients.length === 1 ? patients[0] : undefined,
        patients: Object.freeze(patients),
        results: Object.freeze(records.filter((r): r is ResultRecord => r.type === "R")),
        orders: Object.freeze(records.filter((r): r is OrderRecord => r.type === "O")),
        comments: Object.freeze(records.filter((r): r is CommentRecord => r.type === "C")),
        queries: Object.freeze(records.filter((r): r is QueryRecord => r.type === "Q")),
      });
    }),
  );
}

/**
 * How many `H` … `L` messages a stream carries, and where the second one starts.
 *
 * Counts `H` records directly rather than materializing the groups — the flat extractors
 * call this on every invocation, and the answer is the same by construction.
 *
 * @internal
 */
function surveyMessages(msg: AstmMessage): {
  readonly count: number;
  readonly secondHeader: AstmRecord | undefined;
} {
  let count = 0;
  let secondHeader: AstmRecord | undefined;
  for (const record of msg.records) {
    if (record.type !== "H") continue;
    count += 1;
    if (count === 2) secondHeader = record;
  }
  return { count, secondHeader };
}

/**
 * Guard for a flat, stream-scoped extractor: refuse to answer for a stream carrying more
 * than one message.
 *
 * @internal
 */
export function assertSingleMessage(msg: AstmMessage, accessor: string): void {
  const { count, secondHeader } = surveyMessages(msg);
  if (count <= 1) return;
  throw new AstmAmbiguousStreamError(
    AMBIGUOUS_CODES.ASTM_AMBIGUOUS_MULTI_MESSAGE,
    `${accessor} is scoped to the whole stream, and this stream carries ${String(count)} messages, so its answer would span patients. Use messages() and read each message's own records.`,
    { recordIndex: secondHeader?.recordIndex ?? 0, recordType: "H" },
    { messageCount: count, patientCount: 0 },
  );
}

/**
 * Guard for {@link patient}: refuse to answer for a message carrying more than one `P`.
 *
 * The same harm as the multi-message case, one level down — "the first `P`" is a guess
 * about which patient a result files against, and this parser does not guess.
 *
 * @internal
 */
export function assertSinglePatient(msg: AstmMessage, accessor: string): void {
  const patients = msg.records.filter((r): r is PatientRecord => r.type === "P");
  if (patients.length <= 1) return;
  throw new AstmAmbiguousStreamError(
    AMBIGUOUS_CODES.ASTM_AMBIGUOUS_MULTI_PATIENT,
    `${accessor} cannot name one patient: this message carries ${String(patients.length)} P records. Read them from messages()[n].patients and pair each with the records it owns.`,
    { recordIndex: patients[1]?.recordIndex ?? 0, recordType: "P" },
    { messageCount: 1, patientCount: patients.length },
  );
}
