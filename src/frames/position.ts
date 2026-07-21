/**
 * Positional context for frame-codec warnings and errors.
 *
 * **PHI discipline (the whole point).** A frame deviation is located by **frame
 * number + byte offset** and nothing else — never the record text a frame
 * carries. A frame warning or error may be logged verbatim without ever leaking a
 * result value, a patient identifier, or any other field the reassembled record
 * bytes contain.
 */

/**
 * Where in a framed byte stream a warning or error originated. Both members are
 * positional; neither is a value.
 *
 * @example
 * ```ts
 * import type { AstmFramePosition } from "@cosyte/astm";
 * const at: AstmFramePosition = { frameNumber: 2, byteOffset: 251 };
 * ```
 */
export interface AstmFramePosition {
  /**
   * The frame's sequence number (`0`–`7`) when it could be read, or `undefined`
   * when the frame was so truncated the number was not present.
   */
  readonly frameNumber?: number;
  /** Byte offset of the `STX` that opened the frame, within the decoded stream. */
  readonly byteOffset: number;
}
