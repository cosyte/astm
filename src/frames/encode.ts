/**
 * The frame-layer **emit** side: {@link composeAstmFrames}.
 *
 * The exact inverse of {@link decodeAstmFrames}. Given the reassembled record
 * byte-strings (one entry per complete record, the same shape `decodeAstmFrames`
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
 * - the **240-byte text split**: a record longer than 240 bytes is split across
 *   frames closed by `ETB` (intermediate) with a final `ETX`; the seven framing
 *   control bytes are never counted toward the 240.
 *
 * A record must carry bytes: an empty record (or an empty record list) is a typed
 * {@link AstmFrameEncodeError}, never an empty frame.
 *
 * **A record given as a `string` is a byte string.** Each character stands for one
 * byte, so a character above `U+00FF` has no byte to stand for and the record is
 * refused rather than written. See {@link AstmFrameEncodeError} for what that
 * turns away and how to frame such content instead.
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
 * The reasons {@link composeAstmFrames} refuses rather than emitting bytes that
 * are not the record it was handed.
 *
 * - `ASTM_FRAME_EMPTY_RECORD`: an empty record list, or a record with no bytes.
 *   A frame must carry a record; an empty one is a structural error, never an
 *   empty frame.
 * - `ASTM_FRAME_UNENCODABLE_CHARACTER`: a record given as a `string` holds a
 *   character above `U+00FF`, which has no single byte to stand for.
 *
 * @example
 * ```ts
 * import type { AstmFrameEncodeErrorCode } from "@cosyte/astm";
 * const code: AstmFrameEncodeErrorCode = "ASTM_FRAME_UNENCODABLE_CHARACTER";
 * ```
 */
export type AstmFrameEncodeErrorCode =
  | "ASTM_FRAME_EMPTY_RECORD"
  | "ASTM_FRAME_UNENCODABLE_CHARACTER";

/**
 * Thrown by {@link composeAstmFrames} when the input cannot be framed into a
 * spec-clean stream. Carries a stable code + positional context, never the
 * record bytes and never the offending character (PHI discipline).
 *
 * **The unencodable-character case, and why it is a refusal.** A record passed as
 * a `string` is a **byte string**: character `i` becomes byte `i`, which is the
 * exact inverse of how this package turns record bytes back into a string (one
 * `String.fromCharCode` per byte, so every byte survives 1:1). A character above
 * `U+00FF` has no byte to become. Turning one into bytes takes a character
 * encoding, and nothing this package reads from an ASTM stream says which one:
 * it reads no character-set declaration from any record, so picking one would be
 * a guess at bytes the caller never supplied. Emit also has no warning channel,
 * so a warning here could only be ignored while the wrong bytes still shipped.
 *
 * **Framing content outside Latin-1.** Encode it yourself, with the code page
 * your instrument actually uses, and hand {@link composeAstmFrames} the
 * `Uint8Array`: it accepts bytes directly and writes them through untouched.
 * The refusal removes no capability, it routes you to the parameter that already
 * carried it.
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
  public readonly code: AstmFrameEncodeErrorCode;
  /** Index of the offending record within the input, when applicable. */
  public readonly recordIndex?: number;
  /**
   * Position of the offending character within that record, when applicable:
   * its index in the string, never the character itself and never its code
   * point. Enough to find it in the caller's own data.
   */
  public readonly characterIndex?: number;
  /** @internal */
  public constructor(
    message: string,
    recordIndex?: number,
    code: AstmFrameEncodeErrorCode = "ASTM_FRAME_EMPTY_RECORD",
    characterIndex?: number,
  ) {
    super(message);
    this.name = "AstmFrameEncodeError";
    this.code = code;
    if (recordIndex !== undefined) this.recordIndex = recordIndex;
    if (characterIndex !== undefined) this.characterIndex = characterIndex;
  }
}

/** Options for {@link composeAstmFrames}. */
export interface ComposeFramesOptions {
  /**
   * The frame number to start the sequence at (`0`–`7`). Defaults to
   * {@link FIRST_FRAME_NUMBER} (`1`): the ASTM convention.
   */
  readonly startFrameNumber?: number;
}

/**
 * The largest code point a single byte can carry. A character above it is not a
 * byte and this encoder will not invent one for it.
 */
const MAX_SINGLE_BYTE_CODE_POINT = 0xff;

/**
 * Latin1 bytes of a string (each char → its byte), so `\r` etc. survive 1:1.
 *
 * **The conversion is total or it throws.** It used to mask each character with
 * `& 0xff`, which silently replaced any character above `U+00FF` with a
 * different one: a code point's low byte is another perfectly ordinary
 * character, so the substitution reached the wire, checksummed clean, and was
 * read back with no warning from either layer. Measured on this package's own
 * round trip, `28.6 μmol/L` came back as `28.6 ¼mol/L` (units altered), a name
 * spelled with `U+0141` came back spelled with `A`, and a name spelled with
 * `U+017C` came back split across **two fields**, because that code point's low
 * byte is the field separator: the record re-read with a different field tree,
 * shifting a date of birth into the sex field, with an empty warnings array at
 * both layers. A round trip that silently alters a field is the thing this
 * package exists not to do, so the conversion now refuses instead.
 *
 * A surrogate needs no separate rule: each half of a surrogate pair is itself
 * above `U+00FF`, so an astral character is refused by the same bound, at the
 * index of its first half.
 *
 * @param input - One record: bytes are returned as-is, a string is read as a
 *   byte string.
 * @param recordIndex - The record's index within the input, for error context.
 * @throws {@link AstmFrameEncodeError} `ASTM_FRAME_UNENCODABLE_CHARACTER` when a
 *   character has no single byte to stand for.
 */
function toBytes(input: Uint8Array | string, recordIndex: number): Uint8Array {
  if (typeof input !== "string") return input;
  const out = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code > MAX_SINGLE_BYTE_CODE_POINT) {
      throw new AstmFrameEncodeError(
        "A record contains a character above U+00FF, which is not a single byte. " +
          "Encode the record with the character encoding your instrument uses and pass the bytes.",
        recordIndex,
        "ASTM_FRAME_UNENCODABLE_CHARACTER",
        i,
      );
    }
    out[i] = code;
  }
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
 * Frame reassembled record bytes into a spec-clean ASTM/CLSI-LIS01 byte stream:
 * the inverse of {@link decodeAstmFrames}.
 *
 * Each record is split at 240 text bytes into `ETB`-closed intermediate frames
 * and a final `ETX` frame; frame numbers run `1, 2, … 7, 0, 1 …` continuously
 * across the whole stream; every frame's modulo-256 checksum is computed and
 * emitted uppercase.
 *
 * **A record in either accepted form is written through unchanged, or refused.** A
 * record given as a `Uint8Array` is already bytes. A record given as a `string` is
 * a **byte string**, character `i` becoming byte `i`, the exact inverse of how a
 * decoded record becomes a string again. A character above `U+00FF` is not a byte,
 * so it is refused with `ASTM_FRAME_UNENCODABLE_CHARACTER` rather than replaced by
 * a different character (it used to be truncated to its low byte, which is another
 * ordinary character, and reached the wire silently). To frame content outside
 * Latin-1, encode it with the character encoding your instrument uses and pass the
 * resulting `Uint8Array`. Those two forms are the whole of what `records` accepts.
 * A caller reaching this from JavaScript with some **other** typed array is outside
 * the signature and gets no such refusal: each element is still written as its low
 * byte, the same substitution described above. Pass a `Uint8Array` or a string.
 *
 * That covers the string-to-bytes step only. It is **not** a guarantee that any
 * accepted record reads back: a record already carrying an `STX`, `ETX` or `ETB`
 * byte is framed as given and re-decodes wrong, which this refusal does not touch
 * and does not claim to.
 *
 * @param records - The reassembled record byte-strings (`Uint8Array` or latin1
 *   `string`), one entry per complete record.
 * @param options - Encode options.
 * @returns The framed byte stream.
 * @throws {@link AstmFrameEncodeError} when the list is empty, a record has no
 *   bytes (`ASTM_FRAME_EMPTY_RECORD`), or a record string holds a character above
 *   `U+00FF` (`ASTM_FRAME_UNENCODABLE_CHARACTER`).
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
    throw new AstmFrameEncodeError("Cannot frame an empty record list: nothing to transmit.");
  }

  const out: number[] = [];
  let frameNumber = options.startFrameNumber ?? FIRST_FRAME_NUMBER;

  records.forEach((record, recordIndex) => {
    const bytes = toBytes(record, recordIndex);
    if (bytes.length === 0) {
      throw new AstmFrameEncodeError(
        "Cannot frame an empty record: a frame must carry record bytes.",
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
