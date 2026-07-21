/**
 * The frame-codec value model produced by {@link decodeAstmFrames}.
 *
 * The codec decodes a framed byte stream into a list of {@link AstmFrame}s (every
 * frame surfaced, trusted or not) plus the **reassembled record bytes** of the
 * frames that were trusted and contiguous. Nothing is invented: a frame whose
 * checksum fails, or that arrives out of sequence, or that never terminates, is
 * surfaced and flagged but is **never merged** into the clean `records` output.
 */

import type { AstmFrameWarning } from "./warnings.js";

/** Which terminator closed a frame: `ETB` (record continues) or `ETX` (record complete). */
export type FrameTerminator = "ETB" | "ETX";

/**
 * A frame's checksum verdict: the modulo-256 value recomputed from the frame's
 * bytes, the value declared on the wire (or `undefined` when it was unreadable),
 * and whether they matched.
 */
export interface FrameChecksum {
  /** The modulo-256 checksum recomputed over the frame (frame number through terminator). */
  readonly computed: number;
  /**
   * The checksum declared on the wire (the two hex chars after the terminator), read
   * case-insensitively; `undefined` when those bytes were missing or not hex.
   */
  readonly declared?: number;
  /** `true` only when a declared checksum was present **and** equal to `computed`. */
  readonly valid: boolean;
}

/**
 * One decoded ASTM frame. `text` is the frame's record-byte payload (the bytes
 * between the frame number and the terminator, escapes untouched — this is the
 * framing layer, not the record layer). `trusted` is the single flag a consumer
 * gates on: it is `true` only for a fully-terminated frame whose checksum
 * validated, and such frames are the only ones reassembled into `records`.
 */
export interface AstmFrame {
  /**
   * The frame's sequence number as read from the `FN` byte. Normally `0`–`7`; a
   * value outside that range means the `FN` byte was not a `0`–`7` digit (a
   * corruption that also trips a sequence-gap warning). `undefined` when the frame
   * was too truncated to carry a frame number at all.
   */
  readonly frameNumber?: number;
  /** `ETB` (intermediate) or `ETX` (final); `undefined` for an unterminated frame. */
  readonly terminator?: FrameTerminator;
  /** The frame's record-byte payload (may be empty). A **copy**, safe for the caller to retain. */
  readonly text: Uint8Array;
  /** Byte offset of the `STX` that opened this frame, within the decoded stream. */
  readonly byteOffset: number;
  /** The checksum verdict. */
  readonly checksum: FrameChecksum;
  /**
   * `true` only when the frame was fully terminated **and** its checksum validated.
   * Only trusted frames are reassembled into {@link DecodeAstmFramesResult.records};
   * an untrusted frame is surfaced here but never merged.
   */
  readonly trusted: boolean;
  /** `true` when no valid terminator + checksum was found for this frame (a truncated/partial frame). */
  readonly unterminated: boolean;
  /** `true` when the frame's record text exceeded the 240-byte limit. */
  readonly oversize: boolean;
}

/**
 * The result of {@link decodeAstmFrames}: the reassembled record bytes, every
 * decoded frame, and the accumulated frame warnings.
 */
export interface DecodeAstmFramesResult {
  /**
   * The reassembled record byte-strings — one entry per complete record (a run of
   * frames closed by an `ETX`), in wire order. **Only** clean reassemblies appear:
   * a record whose frames included a bad checksum, a sequence gap, or an
   * unterminated frame is **omitted** (its frames are still in {@link DecodeAstmFramesResult.frames},
   * flagged). Each entry is ready to hand to `parseAstmRecords`.
   */
  readonly records: readonly Uint8Array[];
  /** Every decoded frame, trusted or not, in wire order. */
  readonly frames: readonly AstmFrame[];
  /** The frame warnings accumulated during a lenient decode (empty in a clean decode). */
  readonly warnings: readonly AstmFrameWarning[];
}

/**
 * Options for {@link decodeAstmFrames}. Lenient by default (Postel's Law).
 */
export interface FrameOptions {
  /**
   * When `true`, escalate any tolerated frame deviation (bad checksum, sequence
   * gap, unterminated, oversize) to a thrown {@link AstmFrameStrictError} instead
   * of accumulating a warning. Off by default.
   */
  readonly strict?: boolean;
}
