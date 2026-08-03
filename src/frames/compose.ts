/**
 * Composing the two layers at the edge: {@link parseFramedAstm}.
 *
 * The framing layer ({@link decodeAstmFrames}) and the record layer
 * (`parseAstmRecords`) share nothing but the payload boundary: a frame carries
 * record bytes; a record knows nothing about frames. This helper joins them at the
 * one point they meet: decode a framed stream into trusted, reassembled record
 * bytes, then parse those bytes into an {@link AstmMessage}. It is deliberately
 * thin: a consumer that already holds de-framed record bytes calls
 * `parseAstmRecords` directly, and a consumer that only wants frames calls
 * `decodeAstmFrames` directly.
 */

import { parseAstmRecords } from "../records/parse.js";
import { serializeAstmRecord } from "../records/serialize.js";
import type { AstmMessage, AstmParseOptions, AstmRecord } from "../records/types.js";
import { composeAstmFrames, type ComposeFramesOptions } from "./encode.js";
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
 * // A single final frame carrying "H|\^&\r": checksum "E5" over FN..ETX (mod 256).
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

/**
 * Serialize an ASTM message (or a bare record list) and frame it into a spec-clean
 * byte stream in one call: the inverse of {@link parseFramedAstm}, composing the
 * two emit layers at the edge.
 *
 * Each record is serialized to spec-clean, `CR`-terminated wire text (canonical
 * delimiters, embedded delimiters re-escaped) and then framed **independently**
 * (one record per `ETX`-closed frame run), so the framing exactly mirrors what
 * {@link decodeAstmFrames} reassembles: `parseFramedAstm(serializeFramedAstm(msg))`
 * yields an equal message **with the default `startFrameNumber`**. That clause is
 * load-bearing rather than pedantic: a non-default start writes a continuation of
 * a sequence already in progress, and a continuation read on its own opens on a
 * sequence gap, so the decoder does not emit its first record and this round trip
 * does not hold for it. See {@link ComposeFramesOptions}.
 *
 * A value carrying a character above `U+00FF` is **refused** here rather than
 * framed: the record layer is happy to hold one, but a frame carries bytes and
 * nothing in the message says which character encoding to turn it into.
 *
 * A value carrying a raw `STX`, `ETB` or `ETX` is refused too, and being Latin-1
 * is no exemption: those three are what {@link decodeAstmFrames} reads as the
 * shape of a frame, and framing has no escape sequence to hide one behind. The
 * record layer is happy to hold those as well, so this is a message that
 * serializes to records perfectly well and cannot be framed.
 *
 * @param input - A parsed {@link AstmMessage} or a list of {@link AstmRecord}s.
 * @param options - Frame-encode options.
 * @returns The framed byte stream.
 * @throws {@link AstmSerializeError} when a value contains an unencodable `CR`/`LF`
 *   (`ASTM_EMIT_UNENCODABLE_VALUE`), or when a record's own type letter would not
 *   survive being written in the canonical set this function serializes with
 *   (`ASTM_EMIT_TYPE_LETTER_COLLISION`). The second reaches messages parsed under a
 *   **different** delimiter set, since this function passes no set of its own.
 * @throws {@link AstmFrameEncodeError} when `options.startFrameNumber` is not a
 *   whole number from `0` to `7` (`ASTM_FRAME_INVALID_START_FRAME_NUMBER`), there
 *   are no records to frame (`ASTM_FRAME_EMPTY_RECORD`), a value holds a
 *   character above `U+00FF` (`ASTM_FRAME_UNENCODABLE_CHARACTER`), or a record
 *   holds an `STX`, `ETB` or `ETX` byte (`ASTM_FRAME_RESERVED_BYTE`).
 * @example
 * ```ts
 * import { parseAstmRecords, serializeFramedAstm, parseFramedAstm } from "@cosyte/astm";
 * const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
 * const bytes = serializeFramedAstm(msg);
 * parseFramedAstm(bytes).message.records.length; // 3
 * ```
 */
export function serializeFramedAstm(
  input: AstmMessage | readonly AstmRecord[],
  options: ComposeFramesOptions = {},
): Uint8Array {
  const records: readonly AstmRecord[] = Array.isArray(input)
    ? (input as readonly AstmRecord[])
    : (input as AstmMessage).records;
  // Frame each record independently (record text + its CR terminator) so decode reassembles per record.
  const recordBytes = records.map((r) => serializeAstmRecord(r) + "\r");
  return composeAstmFrames(recordBytes, options);
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
