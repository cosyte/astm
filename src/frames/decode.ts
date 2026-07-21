/**
 * The frame-layer entry point: {@link decodeAstmFrames}.
 *
 * Decode a framed ASTM/CLSI-LIS01 byte stream (`<STX> FN text <ETB|ETX> CS <CR>
 * <LF>` frames) into a list of frames plus the reassembled record bytes of the
 * frames that were trusted and contiguous. Lenient by default: byte-level
 * deviations become {@link AstmFrameWarning}s, and the only fatal is the shared
 * `EMPTY_INPUT` (an empty stream). The two safety-critical rules are absolute in
 * **both** modes: a bad-checksum frame is surfaced flagged untrusted and **never**
 * merged into a record, and a sequence gap is **never** silently bridged.
 *
 * This is the framing layer only — it does not parse record grammar. Hand a
 * reassembled record to `parseAstmRecords`, or use `parseFramedAstm` to compose
 * both layers at the edge.
 */

import { AstmParseError, FATAL_CODES } from "../common/errors.js";
import {
  CR,
  ETB,
  ETX,
  FN_SEVEN,
  FN_ZERO,
  FRAME_NUMBER_MODULUS,
  FIRST_FRAME_NUMBER,
  LF,
  MAX_FRAME_TEXT,
  STX,
} from "./constants.js";
import { computeChecksum, parseChecksumHex } from "./checksum.js";
import { AstmFrameStrictError } from "./errors.js";
import {
  frameBadChecksum,
  frameOversize,
  frameSequenceGap,
  frameUnterminated,
  type AstmFrameWarning,
} from "./warnings.js";
import type {
  AstmFrame,
  DecodeAstmFramesResult,
  FrameChecksum,
  FrameOptions,
  FrameTerminator,
} from "./types.js";

/**
 * Decode a framed ASTM byte stream into frames + reassembled record bytes.
 *
 * Bytes outside a frame (before the first `STX`, or between a frame's trailing
 * `LF` and the next `STX`) are skipped: in ASTM they are low-level transfer
 * control (`ENQ`/`ACK`/`NAK`/`EOT` — the Phase 6 protocol layer), never record
 * content, so skipping them is not data loss.
 *
 * @param bytes - The framed byte stream.
 * @param options - Decode options; lenient unless `strict` is set.
 * @returns The decoded frames, the reassembled trusted record bytes, and any warnings.
 * @throws {@link AstmParseError} with `EMPTY_INPUT` when `bytes` is empty (both modes).
 * @throws {@link AstmFrameStrictError} when `strict` is set and any deviation occurred.
 * @example
 * ```ts
 * import { decodeAstmFrames } from "@cosyte/astm";
 * // One final frame carrying the record text "R|1|" — checksum "AF" over FN..ETX (mod 256).
 * const bytes = new Uint8Array([0x02, 0x31, 0x52, 0x7c, 0x31, 0x7c, 0x03, 0x41, 0x46, 0x0d, 0x0a]);
 * const { records, frames } = decodeAstmFrames(bytes);
 * frames[0]?.frameNumber; // 1
 * records.length;         // 1
 * ```
 */
export function decodeAstmFrames(
  bytes: Uint8Array,
  options: FrameOptions = {},
): DecodeAstmFramesResult {
  if (bytes.length === 0) {
    throw new AstmParseError(FATAL_CODES.EMPTY_INPUT, "Framed input is empty.", { recordIndex: 0 });
  }

  const frames: AstmFrame[] = [];
  const records: Uint8Array[] = [];
  const warnings: AstmFrameWarning[] = [];

  // Reassembly state for the current (possibly multi-frame) record.
  let recordChunks: Uint8Array[] = [];
  let recordTainted = false;
  let recordOpen = false; // a frame has been accumulated toward a record not yet closed by ETX

  // Sequence state: the next frame number expected. ASTM starts at 1 and rolls over 7 → 0 → 1.
  let expected = FIRST_FRAME_NUMBER;

  const n = bytes.length;
  let i = 0;
  while (i < n) {
    if (bytes[i] !== STX) {
      i++; // inter-frame / transfer-control byte — not record content, skip it
      continue;
    }

    const stxOffset = i;
    const fnIndex = i + 1;
    const frameNumber = fnIndex < n ? readFrameNumber(bytes[fnIndex]) : undefined;

    // Scan forward for the terminator (ETB/ETX). A second STX or end-of-stream first ⇒ unterminated.
    let termIndex = -1;
    let oversize = false;
    for (let k = i + 2; k < n; k++) {
      const b = bytes[k];
      if (b === ETB || b === ETX) {
        termIndex = k;
        break;
      }
      if (b === STX) break; // next frame started before this one terminated
      if (k - (i + 2) + 1 > MAX_FRAME_TEXT) oversize = true; // keep scanning; flagged below
    }

    // ── Unterminated: no terminator, or the checksum bytes are truncated past end-of-stream. ──
    const checksumTruncated = termIndex !== -1 && termIndex + 2 >= n;
    if (termIndex === -1 || checksumTruncated) {
      // Payload ends at the terminator (checksum truncated) or the next STX / end-of-stream.
      const textEnd = termIndex !== -1 ? termIndex : nextStxOrEnd(bytes, i + 2, n);
      const text = bytes.slice(Math.min(i + 2, textEnd), textEnd);
      frames.push({
        ...(frameNumber !== undefined ? { frameNumber } : {}),
        text,
        byteOffset: stxOffset,
        checksum: { computed: 0, valid: false },
        trusted: false,
        unterminated: true,
        oversize,
      });
      warnings.push(frameUnterminated(framePosition(frameNumber, stxOffset)));
      recordTainted = true;
      recordOpen = false; // this attempt ended in error; do not double-report at end-of-stream
      // Resume at the next STX (if the stream continued) or finish.
      i = termIndex === -1 ? textEnd : n;
      continue;
    }

    // ── Terminated frame: verify checksum over [FN .. terminator] inclusive. ──
    const termKind: FrameTerminator = bytes[termIndex] === ETB ? "ETB" : "ETX";
    const computed = computeChecksum(bytes, fnIndex, termIndex);
    const declared = parseChecksumHex(bytes, termIndex + 1, termIndex + 2);
    const valid = declared !== undefined && declared === computed;
    const checksum: FrameChecksum =
      declared !== undefined ? { computed, declared, valid } : { computed, valid };
    const text = bytes.slice(i + 2, termIndex);

    const frame: AstmFrame = {
      ...(frameNumber !== undefined ? { frameNumber } : {}),
      terminator: termKind,
      text,
      byteOffset: stxOffset,
      checksum,
      trusted: valid,
      unterminated: false,
      oversize,
    };
    frames.push(frame);

    // Sequence check — never bridge a gap silently. An out-of-range FN (not 0–7) is a gap by
    // definition. On a valid, in-sequence number, advance the expected counter (mod 8).
    if (frameNumber !== undefined && isFrameDigit(frameNumber) && frameNumber === expected) {
      expected = (frameNumber + 1) % FRAME_NUMBER_MODULUS;
    } else {
      warnings.push(frameSequenceGap(framePosition(frameNumber, stxOffset)));
      recordTainted = true;
      // Resync to what we actually received so a single drop does not cascade warnings.
      if (frameNumber !== undefined && isFrameDigit(frameNumber)) {
        expected = (frameNumber + 1) % FRAME_NUMBER_MODULUS;
      }
    }

    if (oversize) warnings.push(frameOversize(framePosition(frameNumber, stxOffset)));

    if (!valid) {
      // Bad checksum: surfaced untrusted (above), warned, and NEVER merged into the record.
      warnings.push(frameBadChecksum(framePosition(frameNumber, stxOffset)));
      recordTainted = true;
    } else {
      recordChunks.push(text);
    }

    if (termKind === "ETX") {
      // Record complete. Emit ONLY a clean reassembly; a tainted record is dropped (its frames
      // remain surfaced), never emitted as if whole.
      if (!recordTainted) records.push(concatBytes(recordChunks));
      recordChunks = [];
      recordTainted = false;
      recordOpen = false;
    } else {
      recordOpen = true; // ETB — the record continues in a later frame
    }

    // Advance past the two checksum chars and an optional CR/LF tail.
    i = termIndex + 3;
    if (bytes[i] === CR) i++;
    if (bytes[i] === LF) i++;
  }

  // A record left open on an intermediate ETB with no final ETX is unterminated — no partial
  // record is invented; its frames are already surfaced.
  if (recordOpen) {
    warnings.push(frameUnterminated({ byteOffset: n }));
  }

  if (options.strict === true && warnings.length > 0) {
    throw new AstmFrameStrictError(warnings);
  }

  return freezeResult({ records, frames, warnings });
}

/**
 * Freeze the decoded result so the model rejects mutation — the frame objects,
 * their checksum sub-objects, the warnings, and the three container arrays. The
 * `Uint8Array` payloads are deliberately **not** frozen: `Object.freeze` throws on
 * a typed array that has elements, and the byte buffers are copies the caller owns.
 */
function freezeResult(result: DecodeAstmFramesResult): DecodeAstmFramesResult {
  for (const f of result.frames) {
    Object.freeze(f.checksum);
    Object.freeze(f);
  }
  for (const w of result.warnings) {
    Object.freeze(w.position);
    Object.freeze(w);
  }
  Object.freeze(result.records);
  Object.freeze(result.frames);
  Object.freeze(result.warnings);
  return Object.freeze(result);
}

/** Read a frame-number byte into its numeric value; `undefined` only when the byte is absent. */
function readFrameNumber(fnByte: number | undefined): number | undefined {
  if (fnByte === undefined) return undefined;
  // Surface the digit value even when out of 0–7 range (a corruption flagged as a sequence gap).
  return fnByte - FN_ZERO;
}

/** Whether a decoded frame number is a valid ASTM `0`–`7` sequence digit. */
function isFrameDigit(frameNumber: number): boolean {
  return frameNumber >= 0 && frameNumber <= FN_SEVEN - FN_ZERO;
}

/** Build a value-free frame position (frame number + byte offset). */
function framePosition(
  frameNumber: number | undefined,
  byteOffset: number,
): { frameNumber?: number; byteOffset: number } {
  return frameNumber !== undefined ? { frameNumber, byteOffset } : { byteOffset };
}

/** Index of the next `STX` at or after `from`, or `end` if none — bounds a partial (unterminated) frame. */
function nextStxOrEnd(bytes: Uint8Array, from: number, end: number): number {
  for (let k = from; k < end; k++) {
    if (bytes[k] === STX) return k;
  }
  return end;
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
