/**
 * The frame-layer **emit** side: {@link composeAstmFrames} — Phase 7.
 *
 * The exact inverse of {@link decodeAstmFrames}. Given the reassembled record
 * byte-strings (one entry per complete record — the same shape `decodeAstmFrames`
 * *produces*), it wraps each into one or more `<STX> FN text <ETB|ETX> CS <CR><LF>`
 * frames, so `decodeAstmFrames(composeAstmFrames(records)).records` reproduces the
 * input records exactly.
 *
 * Everything structural is **computed, never accepted-as-given**:
 * - the **modulo-256 checksum** over `FN … terminator` (inclusive), emitted as two
 *   **uppercase** hex chars (the conservative-emit form the decoder accepts either
 *   case of);
 * - the **frame number** `0`–`7`, starting at `1` and rolling over `7 → 0 → 1`,
 *   continuous across every frame in the stream (as the decoder's sequence check
 *   expects);
 * - the **240-byte text split** — a record longer than 240 bytes is split across
 *   frames closed by `ETB` (intermediate) with a final `ETX`; the seven framing
 *   control bytes are never counted toward the 240.
 *
 * A record must carry bytes: an empty record (or an empty record list) is a typed
 * {@link AstmFrameEncodeError}, never an empty frame.
 */

import { computeChecksum, toChecksumHex } from "./checksum.js";
import {
  CR,
  ETB,
  ETX,
  FN_ZERO,
  FRAME_NUMBER_MODULUS,
  FIRST_FRAME_NUMBER,
  LF,
  MAX_FRAME_TEXT,
  STX,
} from "./constants.js";

/**
 * Thrown by {@link composeAstmFrames} when the input cannot be framed into a
 * spec-clean stream — an empty record list, or a record with no bytes (a frame
 * must carry a record; an empty one is a structural error, never an empty frame).
 * Carries a stable code + the offending record index, never record bytes.
 *
 * @example
 * ```ts
 * import { composeAstmFrames, AstmFrameEncodeError } from "@cosyte/astm";
 * try {
 *   composeAstmFrames([]);
 * } catch (err) {
 *   if (err instanceof AstmFrameEncodeError) err.code; // "ASTM_FRAME_EMPTY_RECORD"
 * }
 * ```
 */
export class AstmFrameEncodeError extends Error {
  /** Stable discriminant. */
  public readonly code: "ASTM_FRAME_EMPTY_RECORD";
  /** Index of the offending record within the input, when applicable. */
  public readonly recordIndex?: number;
  /** @internal */
  public constructor(message: string, recordIndex?: number) {
    super(message);
    this.name = "AstmFrameEncodeError";
    this.code = "ASTM_FRAME_EMPTY_RECORD";
    if (recordIndex !== undefined) this.recordIndex = recordIndex;
  }
}

/** Options for {@link composeAstmFrames}. */
export interface ComposeFramesOptions {
  /**
   * The frame number to start the sequence at (`0`–`7`). Defaults to
   * {@link FIRST_FRAME_NUMBER} (`1`) — the ASTM convention.
   */
  readonly startFrameNumber?: number;
}

/** Latin1 bytes of a string (each char → its byte), so `\r` etc. survive 1:1. */
function toBytes(input: Uint8Array | string): Uint8Array {
  if (typeof input !== "string") return input;
  const out = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i += 1) out[i] = input.charCodeAt(i) & 0xff;
  return out;
}

/** Build one frame's bytes: `STX FN text (ETB|ETX) C1 C2 CR LF`, checksum over `FN … terminator`. */
function encodeFrame(text: Uint8Array, frameNumber: number, isFinal: boolean): number[] {
  const term = isFinal ? ETX : ETB;
  // Assemble STX FN text term, then compute the checksum over FN..term inclusive.
  const bytes = [STX, FN_ZERO + frameNumber, ...text, term];
  const cs = computeChecksum(Uint8Array.from(bytes), 1, bytes.length - 1);
  const hex = toChecksumHex(cs);
  return [...bytes, hex.charCodeAt(0), hex.charCodeAt(1), CR, LF];
}

/**
 * Frame reassembled record bytes into a spec-clean ASTM/CLSI-LIS01 byte stream —
 * the inverse of {@link decodeAstmFrames}.
 *
 * Each record is split at 240 text bytes into `ETB`-closed intermediate frames
 * and a final `ETX` frame; frame numbers run `1, 2, … 7, 0, 1 …` continuously
 * across the whole stream; every frame's modulo-256 checksum is computed and
 * emitted uppercase.
 *
 * @param records - The reassembled record byte-strings (`Uint8Array` or latin1
 *   `string`), one entry per complete record.
 * @param options - Encode options.
 * @returns The framed byte stream.
 * @throws {@link AstmFrameEncodeError} when the list is empty or a record has no bytes.
 * @example
 * ```ts
 * import { composeAstmFrames, decodeAstmFrames } from "@cosyte/astm";
 * const records = [new TextEncoder().encode("H|\\^&\r"), new TextEncoder().encode("L|1\r")];
 * const bytes = composeAstmFrames(records);
 * decodeAstmFrames(bytes).records.length; // 2
 * ```
 */
export function composeAstmFrames(
  records: readonly (Uint8Array | string)[],
  options: ComposeFramesOptions = {},
): Uint8Array {
  if (records.length === 0) {
    throw new AstmFrameEncodeError("Cannot frame an empty record list — nothing to transmit.");
  }

  const out: number[] = [];
  let frameNumber = options.startFrameNumber ?? FIRST_FRAME_NUMBER;

  records.forEach((record, recordIndex) => {
    const bytes = toBytes(record);
    if (bytes.length === 0) {
      throw new AstmFrameEncodeError(
        "Cannot frame an empty record — a frame must carry record bytes.",
        recordIndex,
      );
    }
    // Split the record text into <=240-byte chunks; the last chunk of the record closes with ETX.
    for (let offset = 0; offset < bytes.length; offset += MAX_FRAME_TEXT) {
      const chunk = bytes.subarray(offset, offset + MAX_FRAME_TEXT);
      const isFinal = offset + MAX_FRAME_TEXT >= bytes.length;
      out.push(...encodeFrame(chunk, frameNumber, isFinal));
      frameNumber = (frameNumber + 1) % FRAME_NUMBER_MODULUS;
    }
  });

  return Uint8Array.from(out);
}
