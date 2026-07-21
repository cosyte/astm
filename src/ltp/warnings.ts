/**
 * The **LTP** warning registry (`ASTM_LTP_*`) for the ASTM/CLSI-LIS01 protocol
 * layer — the third of the package's registries, alongside the record layer's
 * `ASTM_RECORD_*` and the frame codec's `ASTM_FRAME_*`.
 *
 * An LTP warning is the protocol reducer's (or the transport detector's) record
 * of a tolerated session-level deviation: an ambiguous framed/raw stream, a
 * control event that arrived in a state that did not expect it, or a frame the
 * receiver had to reject (`NAK`) rather than accept. Every warning carries a
 * stable code plus, at most, a **frame number** — never the record bytes a frame
 * carries (PHI discipline). Consumers compare `warning.code ===
 * LTP_WARNING_CODES.<CODE>`; renaming a code is a **breaking change**.
 */

/**
 * Stable string codes for every LTP protocol / transport warning. `key === value`
 * so `Object.values(...)` yields a stable snapshot set.
 *
 * @example
 * ```ts
 * import { LTP_WARNING_CODES } from "@cosyte/astm";
 * LTP_WARNING_CODES.ASTM_LTP_FRAME_REJECTED; // "ASTM_LTP_FRAME_REJECTED"
 * ```
 */
export const LTP_WARNING_CODES = {
  /**
   * The transport detector could not tell a framed stream from a raw (unframed) one from its leading
   * byte — it was neither `STX`/`ENQ` nor a bare record letter. It **defaults to framed** and warns,
   * never guessing silently into data loss; a profile override forces the mode. (cobas b121 drops
   * framing over TCP; cobas 4800 / Iguana retain it — both realities exist, so an unrecognizable lead
   * is defaulted, not assumed.)
   */
  ASTM_LTP_AMBIGUOUS_TRANSPORT: "ASTM_LTP_AMBIGUOUS_TRANSPORT",
  /**
   * A control event arrived in a protocol state that did not expect it — e.g. an inbound `ACK`/`NAK`
   * at a receiver (which sends, never receives, those), or an `ENQ` mid-transfer. The event is
   * surfaced and handled defensively (an unexpected `ACK`/`NAK` is **never** read as acceptance of
   * data); it never advances the transfer as if valid.
   */
  ASTM_LTP_UNEXPECTED_EVENT: "ASTM_LTP_UNEXPECTED_EVENT",
  /**
   * The receiver rejected a received frame with a `NAK` instead of accepting it — because its
   * checksum failed, it was unterminated, or its frame number was out of sequence. The frame's text
   * is **never** appended to the record and the transfer does **not** advance; the receiver awaits the
   * sender's retransmit. This is the protocol-level face of the frame codec's fail-safe: a bad frame
   * drives retransmit, not acceptance.
   */
  ASTM_LTP_FRAME_REJECTED: "ASTM_LTP_FRAME_REJECTED",
} as const;

/**
 * Discriminant type for {@link AstmLtpWarning.code}. Narrowing by this code lets
 * consumers write exhaustive `switch` blocks against {@link LTP_WARNING_CODES}.
 */
export type LtpWarningCode = (typeof LTP_WARNING_CODES)[keyof typeof LTP_WARNING_CODES];

/**
 * A single LTP protocol / transport warning: a stable code, a value-free
 * human-readable message, and — for a frame-scoped deviation — the frame number
 * only. Never carries a frame's record bytes.
 *
 * @example
 * ```ts
 * import type { AstmLtpWarning } from "@cosyte/astm";
 * const w: AstmLtpWarning = {
 *   code: "ASTM_LTP_FRAME_REJECTED",
 *   message: "Frame rejected — NAK sent, retransmit expected.",
 *   frameNumber: 2,
 * };
 * ```
 */
export interface AstmLtpWarning {
  readonly code: LtpWarningCode;
  /** Human-readable detail for logs. Never contains the frame's record bytes. */
  readonly message: string;
  /** The frame's sequence number when the warning is frame-scoped; absent otherwise. */
  readonly frameNumber?: number;
}

/**
 * Build an `ASTM_LTP_AMBIGUOUS_TRANSPORT` warning. The detector defaulted to
 * framed; a profile override can force raw.
 *
 * @example
 * ```ts
 * import { ltpAmbiguousTransport } from "@cosyte/astm";
 * ltpAmbiguousTransport();
 * ```
 */
export function ltpAmbiguousTransport(): AstmLtpWarning {
  return {
    code: LTP_WARNING_CODES.ASTM_LTP_AMBIGUOUS_TRANSPORT,
    message:
      "Leading byte was neither a frame start (STX/ENQ) nor a record letter — defaulted to framed; override with a profile to force raw.",
  };
}

/**
 * Build an `ASTM_LTP_UNEXPECTED_EVENT` warning. The event was surfaced and handled
 * defensively; it never advanced the transfer as if valid.
 *
 * @param frameNumber - The frame number, when the unexpected event was a frame; omitted otherwise.
 * @example
 * ```ts
 * import { ltpUnexpectedEvent } from "@cosyte/astm";
 * ltpUnexpectedEvent();
 * ```
 */
export function ltpUnexpectedEvent(frameNumber?: number): AstmLtpWarning {
  return {
    code: LTP_WARNING_CODES.ASTM_LTP_UNEXPECTED_EVENT,
    message:
      "Control event arrived in a state that did not expect it — handled defensively, never read as acceptance.",
    ...(frameNumber !== undefined ? { frameNumber } : {}),
  };
}

/**
 * Build an `ASTM_LTP_FRAME_REJECTED` warning. The receiver sent a `NAK`; the
 * frame's text was never appended and the transfer did not advance.
 *
 * @param frameNumber - The rejected frame's sequence number, when it could be read.
 * @example
 * ```ts
 * import { ltpFrameRejected } from "@cosyte/astm";
 * ltpFrameRejected(2);
 * ```
 */
export function ltpFrameRejected(frameNumber?: number): AstmLtpWarning {
  return {
    code: LTP_WARNING_CODES.ASTM_LTP_FRAME_REJECTED,
    message:
      "Frame rejected (bad checksum, unterminated, or out of sequence) — NAK sent, retransmit expected, never accepted.",
    ...(frameNumber !== undefined ? { frameNumber } : {}),
  };
}
