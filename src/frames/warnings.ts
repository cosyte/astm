/**
 * The **frame** warning registry (`ASTM_FRAME_*`) for the ASTM/CLSI-LIS01 codec —
 * the second of the package's two registries, alongside the record layer's
 * `ASTM_RECORD_*` (both share only the `EMPTY_INPUT` fatal).
 *
 * A frame warning is the lenient codec's record of a tolerated byte-level
 * deviation: it never crashes, never invents a value, and — critically — never
 * lets an untrusted frame be silently merged into a record. Every warning carries
 * a stable code plus an {@link AstmFramePosition} (frame number + byte offset) and
 * **never** the record bytes a frame carries (PHI discipline). Consumers compare
 * `warning.code === FRAME_WARNING_CODES.<CODE>`; renaming a code is a **breaking
 * change**.
 */

import type { AstmFramePosition } from "./position.js";

/**
 * Stable string codes for every frame-codec warning. `key === value` so
 * `Object.values(...)` yields a stable snapshot set.
 *
 * @example
 * ```ts
 * import { decodeAstmFrames, FRAME_WARNING_CODES } from "@cosyte/astm";
 * const bytes = new Uint8Array([]); // ...a framed stream...
 * void bytes;
 * FRAME_WARNING_CODES.ASTM_FRAME_BAD_CHECKSUM; // "ASTM_FRAME_BAD_CHECKSUM"
 * ```
 */
export const FRAME_WARNING_CODES = {
  /**
   * A frame's two-hex-char checksum did not match the modulo-256 sum recomputed over its bytes. The
   * frame is surfaced with `trusted: false` and its text is **never merged** into a reassembled
   * record (default **warn** in lenient mode, escalated to a thrown error in `strict`). Corruption is
   * never silently trusted — the "checksums are routinely not validated" claim was refuted; we
   * validate.
   */
  ASTM_FRAME_BAD_CHECKSUM: "ASTM_FRAME_BAD_CHECKSUM",
  /**
   * A frame's sequence number was not the expected next value (`1 → … → 7 → 0 → …`) — a frame was
   * possibly dropped. The stream is **never silently concatenated across the gap** as if contiguous;
   * the in-progress record is tainted and not emitted as a clean reassembly.
   */
  ASTM_FRAME_SEQUENCE_GAP: "ASTM_FRAME_SEQUENCE_GAP",
  /**
   * A frame opened with `STX` but no valid terminator + checksum was found before the stream ended
   * (or before the next `STX`), or a record's frames ended on an intermediate `ETB` with no final
   * `ETX`. The partial bytes are surfaced flagged untrusted and **no partial record is invented**
   * (warn in lenient, thrown in `strict`).
   */
  ASTM_FRAME_UNTERMINATED: "ASTM_FRAME_UNTERMINATED",
  /**
   * A frame's record text exceeded the 240-byte limit without a split. The frame is still surfaced
   * (and, if its checksum validates, reassembled) — the deviation is flagged, not silently dropped
   * (warn in lenient, thrown in `strict`).
   */
  ASTM_FRAME_OVERSIZE: "ASTM_FRAME_OVERSIZE",
} as const;

/**
 * Discriminant type for {@link AstmFrameWarning.code}. Narrowing by this code lets
 * consumers write exhaustive `switch` blocks against {@link FRAME_WARNING_CODES}.
 */
export type FrameWarningCode = (typeof FRAME_WARNING_CODES)[keyof typeof FRAME_WARNING_CODES];

/**
 * A single frame-codec warning: a stable code, a value-free human-readable
 * message, and positional context (frame number + byte offset).
 *
 * @example
 * ```ts
 * import type { AstmFrameWarning } from "@cosyte/astm";
 * const w: AstmFrameWarning = {
 *   code: "ASTM_FRAME_BAD_CHECKSUM",
 *   message: "Frame checksum mismatch.",
 *   position: { frameNumber: 2, byteOffset: 251 },
 * };
 * ```
 */
export interface AstmFrameWarning {
  readonly code: FrameWarningCode;
  /** Human-readable detail for logs. Never contains the frame's record bytes. */
  readonly message: string;
  readonly position: AstmFramePosition;
}

/**
 * Build an `ASTM_FRAME_BAD_CHECKSUM` warning. The frame is surfaced flagged
 * untrusted and never merged into a record; the warning carries position only.
 *
 * @example
 * ```ts
 * import { frameBadChecksum } from "@cosyte/astm";
 * frameBadChecksum({ frameNumber: 2, byteOffset: 251 });
 * ```
 */
export function frameBadChecksum(position: AstmFramePosition): AstmFrameWarning {
  return {
    code: FRAME_WARNING_CODES.ASTM_FRAME_BAD_CHECKSUM,
    message: "Frame checksum mismatch — surfaced untrusted, never merged into a record.",
    position,
  };
}

/**
 * Build an `ASTM_FRAME_SEQUENCE_GAP` warning. A frame was possibly dropped; the
 * record is not concatenated across the gap as if contiguous.
 *
 * @example
 * ```ts
 * import { frameSequenceGap } from "@cosyte/astm";
 * frameSequenceGap({ frameNumber: 3, byteOffset: 502 });
 * ```
 */
export function frameSequenceGap(position: AstmFramePosition): AstmFrameWarning {
  return {
    code: FRAME_WARNING_CODES.ASTM_FRAME_SEQUENCE_GAP,
    message: "Frame number out of sequence — possible dropped frame, never silently bridged.",
    position,
  };
}

/**
 * Build an `ASTM_FRAME_UNTERMINATED` warning. The partial bytes are surfaced
 * flagged untrusted; no partial record is invented.
 *
 * @example
 * ```ts
 * import { frameUnterminated } from "@cosyte/astm";
 * frameUnterminated({ byteOffset: 730 });
 * ```
 */
export function frameUnterminated(position: AstmFramePosition): AstmFrameWarning {
  return {
    code: FRAME_WARNING_CODES.ASTM_FRAME_UNTERMINATED,
    message: "Unterminated frame — partial bytes surfaced untrusted, no partial record invented.",
    position,
  };
}

/**
 * Build an `ASTM_FRAME_OVERSIZE` warning. The 240-byte text limit was exceeded
 * without a split; the frame is flagged, not silently dropped.
 *
 * @example
 * ```ts
 * import { frameOversize } from "@cosyte/astm";
 * frameOversize({ frameNumber: 1, byteOffset: 0 });
 * ```
 */
export function frameOversize(position: AstmFramePosition): AstmFrameWarning {
  return {
    code: FRAME_WARNING_CODES.ASTM_FRAME_OVERSIZE,
    message: "Frame text exceeded the 240-byte limit without a split — flagged, never dropped.",
    position,
  };
}
