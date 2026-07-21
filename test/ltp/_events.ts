/**
 * Test-only helpers for the LTP reducer: turn synthetic record text into real,
 * codec-vouched {@link AstmFrame}s (by round-tripping through the frame builder and
 * `decodeAstmFrames`, so `trusted`/`checksum` are the codec's genuine verdict, not a
 * hand-set flag) and fold an event list through the reducer. All content is
 * synthetic — plain record bytes with no patient identifiers.
 */

import { decodeAstmFrames, ltpInitialState, ltpReduce } from "../../src/index.js";
import type { AstmFrame, LtpAction, LtpEvent, LtpState } from "../../src/index.js";
import { def, frame, type FrameOpts } from "../frames/_frame-builder.js";

/** Build one real {@link AstmFrame} by framing `text` and decoding it back. */
export function frameOf(text: string, opts: FrameOpts = {}): AstmFrame {
  const bytes = Uint8Array.from(frame(text, opts));
  return def(decodeAstmFrames(bytes).frames[0]);
}

/** A `frame` event carrying a real {@link AstmFrame}. */
export function frameEvent(text: string, opts: FrameOpts = {}): LtpEvent {
  return { type: "frame", frame: frameOf(text, opts) };
}

/** Split text into ≤ `size`-byte chunks and frame them as ETB…ETX with a **continuous** FN from 1. */
export function framesFor(text: string, size: number, startFn = 1): AstmFrame[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  if (chunks.length === 0) chunks.push("");
  return chunks.map((chunk, idx) =>
    frameOf(chunk, {
      fn: (startFn + idx) % 8,
      kind: idx === chunks.length - 1 ? "ETX" : "ETB",
    }),
  );
}

/** Fold a list of events through the reducer from a fresh session; return the final state + all actions. */
export function runSession(events: readonly LtpEvent[]): {
  state: LtpState;
  actions: LtpAction[];
} {
  let state = ltpInitialState();
  const actions: LtpAction[] = [];
  for (const event of events) {
    const step = ltpReduce(state, event);
    state = step.state;
    actions.push(...step.actions);
  }
  return { state, actions };
}

/** Concatenate byte chunks (the reassembled de-framed record stream). */
export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
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

/** Byte-level equality of two `Uint8Array`s. */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
