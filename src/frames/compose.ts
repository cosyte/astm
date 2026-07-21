/**
 * Composing the two layers at the edge: {@link parseFramedAstm}.
 *
 * The framing layer ({@link decodeAstmFrames}) and the record layer
 * (`parseAstmRecords`) share nothing but the payload boundary — a frame carries
 * record bytes; a record knows nothing about frames. This helper joins them at the
 * one point they meet: decode a framed stream into trusted, reassembled record
 * bytes, then parse those bytes into an {@link AstmMessage}. It is deliberately
 * thin — a consumer that already holds de-framed record bytes calls
 * `parseAstmRecords` directly, and a consumer that only wants frames calls
 * `decodeAstmFrames` directly.
 */

import { parseAstmRecords } from "../records/parse.js";
import type { AstmMessage, AstmParseOptions } from "../records/types.js";
import { decodeAstmFrames } from "./decode.js";
import type { AstmFrame, FrameOptions } from "./types.js";
import type { AstmFrameWarning } from "./warnings.js";

/**
 * The result of {@link parseFramedAstm}: the parsed message, plus the frame-layer
 * detail (every decoded frame and the frame warnings) so a consumer keeps full
 * visibility into the transport below the records.
 */
export interface FramedAstmResult {
  /** The message parsed from the trusted, reassembled record bytes. */
  readonly message: AstmMessage;
  /** Every decoded frame, trusted or not, in wire order. */
  readonly frames: readonly AstmFrame[];
  /** The frame-layer warnings (bad checksum, sequence gap, unterminated, oversize). */
  readonly frameWarnings: readonly AstmFrameWarning[];
}

/**
 * Decode a framed ASTM byte stream and parse its reassembled records in one call.
 *
 * Only **trusted, contiguous** frames are reassembled (a bad-checksum frame, a
 * sequence gap, or an unterminated frame is surfaced in `frames`/`frameWarnings`
 * but never fed to the record parser), so the parsed `message` reflects only bytes
 * the framing layer vouched for.
 *
 * @param bytes - The framed byte stream.
 * @param options - Frame decode options **and** record parse options (both layers
 *   honor a shared `strict`).
 * @returns The parsed message plus the frame-layer detail.
 * @throws {@link AstmParseError} `EMPTY_INPUT` when the stream is empty, or when no
 *   trusted records could be reassembled (nothing to parse).
 * @throws {@link AstmFrameStrictError} / {@link AstmStrictError} in `strict` mode on
 *   a frame or record deviation, respectively.
 * @example
 * ```ts
 * import { parseFramedAstm } from "@cosyte/astm";
 * // A single final frame carrying "H|\^&\r" — checksum "E5" over FN..ETX (mod 256).
 * const bytes = new Uint8Array([
 *   0x02, 0x31, 0x48, 0x7c, 0x5c, 0x5e, 0x26, 0x0d, 0x03, 0x45, 0x35, 0x0d, 0x0a,
 * ]);
 * const { message, frames } = parseFramedAstm(bytes);
 * message.header.delimiters.field; // "|"
 * frames.length;                   // 1
 * ```
 */
export function parseFramedAstm(
  bytes: Uint8Array,
  options: FrameOptions & AstmParseOptions = {},
): FramedAstmResult {
  const { records, frames, warnings } = decodeAstmFrames(bytes, options);
  const joined = concatBytes(records);
  const message = parseAstmRecords(joined, options);
  return { message, frames, frameWarnings: warnings };
}

/** Concatenate the reassembled record byte-strings into one de-framed record stream. */
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
