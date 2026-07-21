/**
 * The pure LTP protocol reducer: {@link ltpReduce} and {@link ltpInitialState}.
 *
 * A deterministic, socket-free receiver-side state machine for ASTM/CLSI-LIS01
 * (LIS01-A2). The consumer owns the wire — it reads bytes, decodes frames with
 * `decodeAstmFrames`, and drives this reducer one {@link LtpEvent} at a time — and
 * the reducer decides, purely, what happens next: whether to `ACK` or `NAK`, when a
 * record is complete, and when the session returns to neutral.
 *
 * **The one inviolable rule (borrowed from `mllp`'s ACK-failsafe discipline):** a
 * frame the codec did not vouch for — a bad checksum, an unterminated frame, or one
 * out of sequence — is answered with `NAK`, **never** a fabricated positive `ACK`,
 * and its bytes are **never** appended to a record or delivered. A `NAK` drives
 * retransmit, not acceptance. This is the protocol-level twin of the frame codec's
 * "a bad-checksum frame is never merged into a record."
 */

import { FRAME_NUMBER_MODULUS, FIRST_FRAME_NUMBER } from "../frames/constants.js";
import type { AstmFrame } from "../frames/types.js";
import { ltpFrameRejected, ltpUnexpectedEvent, type AstmLtpWarning } from "./warnings.js";
import type { LtpAction, LtpEvent, LtpState, LtpTransition } from "./types.js";

const EMPTY = new Uint8Array(0);

/**
 * The neutral starting state for a fresh session: line idle, no record in flight,
 * nothing delivered yet. A consumer creates one of these when a connection opens
 * and folds inbound events through {@link ltpReduce} from here.
 *
 * @returns A frozen neutral {@link LtpState}.
 * @example
 * ```ts
 * import { ltpInitialState, ltpReduce } from "@cosyte/astm";
 * let state = ltpInitialState();
 * const step = ltpReduce(state, { type: "enq" });
 * step.actions; // [{ type: "sendAck" }]
 * state = step.state;
 * ```
 */
export function ltpInitialState(): LtpState {
  return freezeState({
    phase: "neutral",
    expectedFrame: FIRST_FRAME_NUMBER,
    records: [],
    recordOpen: false,
    openRecord: EMPTY,
  });
}

/**
 * Advance the LTP session by one inbound event — a pure function, no I/O.
 *
 * Behaviour by phase:
 * - **neutral** — `enq` accepts establishment (`sendAck`, enter transfer); `eot` is
 *   a benign line reset (no-op); `ack`/`nak` are unexpected at a receiver (surfaced,
 *   never read as acceptance); a `frame` before establishment is tolerated
 *   (Postel's Law) — the session auto-establishes and processes it, with a warning.
 * - **transfer** — a `frame` is accepted (`sendAck`, appended, sequence advanced) only
 *   when it is trusted *and* carries the expected number; a duplicate of the last
 *   accepted frame is idempotently re-`ACK`ed without re-appending; a bad or
 *   out-of-sequence frame is `NAK`ed and dropped. `eot` terminates the transfer and
 *   returns to neutral (a record left open on an `ETB` is **not** delivered). `enq`
 *   restarts establishment. `ack`/`nak` are unexpected.
 *
 * @param state - The current session state.
 * @param event - The inbound event.
 * @returns The next state, the actions to take, and any warnings.
 * @example
 * ```ts
 * import { ltpInitialState, ltpReduce } from "@cosyte/astm";
 * // A bad-checksum frame is NAKed, never ACKed, and never appended.
 * const est = ltpReduce(ltpInitialState(), { type: "enq" }).state;
 * const bad = { trusted: false } as never;
 * ltpReduce(est, { type: "frame", frame: bad }).actions; // [{ type: "sendNak" }]
 * ```
 */
export function ltpReduce(state: LtpState, event: LtpEvent): LtpTransition {
  switch (event.type) {
    case "enq":
      return establish(state);
    case "eot":
      return terminate(state);
    case "ack":
    case "nak":
      // A receiver sends ACK/NAK; receiving one is a role/protocol violation. Surface it and hold —
      // an inbound ACK is NEVER read as acceptance of data (that is the sender's signal, not ours).
      return { state, actions: [], warnings: [ltpUnexpectedEvent()] };
    case "frame":
      return onFrame(state, event.frame);
  }
}

/** `neutral --enq--> transfer`, or a mid-transfer `enq` restart. Establishment is accepted with an ACK. */
function establish(state: LtpState): LtpTransition {
  const warnings: AstmLtpWarning[] = state.phase === "transfer" ? [ltpUnexpectedEvent()] : [];
  // Enter (or restart) transfer: reset the frame counters and drop any half-built record — a partial
  // reassembly is never carried across an establishment boundary, never delivered as if whole.
  const next = freezeState({
    phase: "transfer",
    expectedFrame: FIRST_FRAME_NUMBER,
    records: state.records,
    recordOpen: false,
    openRecord: EMPTY,
  });
  return { state: next, actions: [{ type: "sendAck" }], warnings };
}

/** `--eot--> neutral`. Terminating discards any open (unterminated) record — no partial is invented. */
function terminate(state: LtpState): LtpTransition {
  const next = freezeState({
    phase: "neutral",
    expectedFrame: FIRST_FRAME_NUMBER,
    records: state.records,
    recordOpen: false,
    openRecord: EMPTY,
  });
  return { state: next, actions: [], warnings: [] };
}

/** A frame arrived. In neutral, tolerate the missing handshake (auto-establish + warn), then process. */
function onFrame(state: LtpState, frame: AstmFrame): LtpTransition {
  if (state.phase === "neutral") {
    const established = freezeState({
      phase: "transfer",
      expectedFrame: FIRST_FRAME_NUMBER,
      records: state.records,
      recordOpen: false,
      openRecord: EMPTY,
    });
    const step = processTransferFrame(established, frame);
    return {
      state: step.state,
      actions: step.actions,
      warnings: [ltpUnexpectedEvent(frame.frameNumber), ...step.warnings],
    };
  }
  return processTransferFrame(state, frame);
}

/**
 * The safety-critical core: decide `ACK` vs `NAK` for a frame received in transfer.
 *
 * A frame is accepted — `sendAck`, text appended, sequence advanced, and (on `ETX`)
 * the completed record delivered — **only** when it is trusted (codec-vouched
 * checksum + terminator) *and* carries the expected sequence number. A duplicate of
 * the last accepted frame is re-`ACK`ed idempotently. Everything else (bad checksum,
 * unterminated, out of sequence) is `NAK`ed and dropped: never appended, never
 * delivered, sequence never advanced.
 */
function processTransferFrame(state: LtpState, frame: AstmFrame): LtpTransition {
  // ── Fail-safe: an untrusted frame is NAKed, full stop. No ACK is ever fabricated for it. ──
  if (!frame.trusted) {
    return reject(state, frame.frameNumber);
  }

  const fn = frame.frameNumber;
  // A trusted frame is terminated with a valid checksum, so its frame number was read; guard anyway.
  if (fn === undefined) {
    return reject(state, undefined);
  }

  // ── Duplicate retransmit: the sender re-sent an already-accepted frame (it missed our ACK). ──
  // Re-ACK idempotently; do NOT re-append or advance. (Not a deviation — normal recovery.)
  if (state.lastAcceptedFrame !== undefined && fn === state.lastAcceptedFrame) {
    return { state, actions: [{ type: "sendAck" }], warnings: [] };
  }

  // ── Out of sequence: a trusted frame carrying the wrong number. Never bridge the gap — NAK it. ──
  if (fn !== state.expectedFrame) {
    return reject(state, fn);
  }

  return acceptFrame(state, frame, fn);
}

/**
 * Accept a trusted, in-sequence frame: `sendAck`, append its text to the open
 * record, deliver on `ETX`, and advance the sequence counter.
 */
function acceptFrame(state: LtpState, frame: AstmFrame, fn: number): LtpTransition {
  const nextExpected = (fn + 1) % FRAME_NUMBER_MODULUS;
  const accumulated = concatBytes([state.openRecord, frame.text]);
  const actions: LtpAction[] = [{ type: "sendAck" }];

  if (frame.terminator === "ETX") {
    // Record complete: the accumulated bytes (prior ETB frames + this final text) are one record.
    // Hand the action its own copy so the delivered bytes never alias the entry stored in
    // `state.records` — mutating one must never retroactively mutate the other.
    actions.push({ type: "deliverRecord", record: accumulated.slice() });
    const next = freezeState({
      phase: "transfer",
      expectedFrame: nextExpected,
      lastAcceptedFrame: fn,
      records: [...state.records, accumulated],
      recordOpen: false,
      openRecord: EMPTY,
    });
    return { state: next, actions, warnings: [] };
  }

  // ETB — the record continues in a later frame; carry the accumulated bytes forward.
  const next = freezeState({
    phase: "transfer",
    expectedFrame: nextExpected,
    lastAcceptedFrame: fn,
    records: state.records,
    recordOpen: true,
    openRecord: accumulated,
  });
  return { state: next, actions, warnings: [] };
}

/** Reject a frame: `sendNak`, no append, no advance, plus a frame-rejected warning. */
function reject(state: LtpState, frameNumber: number | undefined): LtpTransition {
  return {
    state,
    actions: [{ type: "sendNak" }],
    warnings: [ltpFrameRejected(frameNumber)],
  };
}

/**
 * Build a frozen {@link LtpState}. `lastAcceptedFrame` is omitted (not set to
 * `undefined`) when absent, keeping `exactOptionalPropertyTypes` happy. The
 * `records` array is copied and frozen; the byte payloads are copies the caller owns
 * (a typed array with elements cannot itself be `Object.freeze`d).
 */
function freezeState(fields: {
  readonly phase: LtpState["phase"];
  readonly expectedFrame: number;
  readonly lastAcceptedFrame?: number;
  readonly records: readonly Uint8Array[];
  readonly recordOpen: boolean;
  readonly openRecord: Uint8Array;
}): LtpState {
  const state: LtpState = {
    phase: fields.phase,
    expectedFrame: fields.expectedFrame,
    ...(fields.lastAcceptedFrame !== undefined
      ? { lastAcceptedFrame: fields.lastAcceptedFrame }
      : {}),
    records: Object.freeze([...fields.records]),
    recordOpen: fields.recordOpen,
    openRecord: fields.openRecord,
  };
  return Object.freeze(state);
}

/** Concatenate byte chunks into one `Uint8Array` (the reassembled record bytes). */
function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
