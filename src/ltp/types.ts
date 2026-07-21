/**
 * The value model for the pure LTP protocol reducer ({@link ltpReduce}).
 *
 * The reducer models the **receiver** side of an ASTM/CLSI-LIS01 (LIS01-A2)
 * session — the host/LIS receiving an upload — because that is where the one
 * safety decision lives: whether to `ACK` (accept) or `NAK` (reject) a frame that
 * just arrived. It is a **pure function** of the current {@link LtpState} and one
 * inbound {@link LtpEvent}, returning an {@link LtpTransition} (the next state plus
 * the actions the consumer should take and any warnings). No sockets, no timers,
 * no I/O — the consumer owns the wire and the clock; the reducer owns the logic.
 */

import type { AstmFrame } from "../frames/types.js";
import type { AstmLtpWarning } from "./warnings.js";

/**
 * The protocol phase. The line is either **neutral** (idle — awaiting an `ENQ` to
 * establish, or reset there after an `EOT`) or in **transfer** (establishment
 * accepted; frames and their per-frame `ACK`/`NAK` flow until the sender's `EOT`).
 * The classic three-phase LIS01 model (establishment → transfer → termination)
 * collapses to these two, since establishment is the `neutral → transfer` edge and
 * termination is the `transfer → neutral` edge.
 */
export type LtpPhase = "neutral" | "transfer";

/**
 * The reducer's immutable session state. Every {@link ltpReduce} call returns a new,
 * frozen `LtpState`; the previous one is never mutated.
 */
export interface LtpState {
  /** The current protocol phase. */
  readonly phase: LtpPhase;
  /**
   * The next frame number the receiver expects (`1 → … → 7 → 0 → …`), meaningful in
   * `transfer`. A trusted frame carrying this number is accepted and appended; any
   * other number is a duplicate retransmit (idempotent re-`ACK`) or an out-of-sequence
   * frame (rejected with `NAK`), never silently bridged.
   */
  readonly expectedFrame: number;
  /**
   * The frame number of the last frame accepted into the current record, used to
   * recognise a duplicate retransmit; `undefined` before the first frame of a
   * transfer is accepted.
   */
  readonly lastAcceptedFrame?: number;
  /**
   * The reassembled bytes of every **complete** record delivered so far in the
   * session (each closed by an `ETX` frame with a clean run). Concatenate these and
   * hand them to `parseAstmRecords` to get the message. Only trusted, in-sequence
   * frames contribute; a rejected or partial record never appears.
   */
  readonly records: readonly Uint8Array[];
  /** `true` when a record is mid-reassembly (an `ETB` frame was accepted, awaiting its `ETX`). */
  readonly recordOpen: boolean;
  /**
   * The bytes accumulated so far for the in-progress record — the concatenation of
   * the `ETB` frames accepted since the last `ETX`. Empty when no record is open.
   * These bytes are **never** delivered on their own: only an `ETX` completes a
   * record, at which point they (plus the final frame's text) become one entry in
   * {@link LtpState.records}. An `EOT` or an `ENQ` restart discards them unread.
   */
  readonly openRecord: Uint8Array;
}

/**
 * An inbound protocol event the consumer feeds the reducer: one of the four LTP
 * control signals (`ENQ`/`ACK`/`NAK`/`EOT`) read off the wire, or a `frame` the
 * consumer already decoded with `decodeAstmFrames` (the reducer reuses the codec's
 * `trusted`/`checksum` verdict — it never re-derives it).
 */
export type LtpEvent =
  | { readonly type: "enq" }
  | { readonly type: "ack" }
  | { readonly type: "nak" }
  | { readonly type: "eot" }
  | { readonly type: "frame"; readonly frame: AstmFrame };

/**
 * An action the reducer tells the consumer to take. The consumer performs the I/O
 * (write the byte to the socket, hand the record to the parser); the reducer only
 * decides. `sendAck`/`sendNak`/`sendEot` are single control bytes; `deliverRecord`
 * carries the freshly-completed record's reassembled bytes.
 */
export type LtpAction =
  | { readonly type: "sendAck" }
  | { readonly type: "sendNak" }
  | { readonly type: "sendEot" }
  | { readonly type: "deliverRecord"; readonly record: Uint8Array };

/**
 * The result of one {@link ltpReduce} step: the next {@link LtpState}, the
 * {@link LtpAction}s to perform (in order), and any {@link AstmLtpWarning}s raised.
 */
export interface LtpTransition {
  /** The next session state (frozen). */
  readonly state: LtpState;
  /** The actions the consumer should take, in order. */
  readonly actions: readonly LtpAction[];
  /** Warnings raised by this step (empty on a clean, expected event). */
  readonly warnings: readonly AstmLtpWarning[];
}
