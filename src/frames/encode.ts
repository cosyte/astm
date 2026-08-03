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
 *   expects); a caller may start the sequence elsewhere to compose one transfer
 *   across several calls, but only at a number a frame can actually carry;
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
 * - `ASTM_FRAME_RESERVED_BYTE`: a record holds a byte this layer reads as frame
 *   structure (`STX`, `ETB` or `ETX`). Framing has no escape mechanism, so such
 *   a byte cannot be carried inside a frame at all.
 * - `ASTM_FRAME_INVALID_START_FRAME_NUMBER`: `options.startFrameNumber` is not a
 *   whole number from `0` to `7`. A frame's number is one ASCII digit, so a
 *   value outside that range has no digit to be written as.
 *
 * @example
 * ```ts
 * import type { AstmFrameEncodeErrorCode } from "@cosyte/astm";
 * const code: AstmFrameEncodeErrorCode = "ASTM_FRAME_UNENCODABLE_CHARACTER";
 * ```
 */
export type AstmFrameEncodeErrorCode =
  | "ASTM_FRAME_EMPTY_RECORD"
  | "ASTM_FRAME_UNENCODABLE_CHARACTER"
  | "ASTM_FRAME_RESERVED_BYTE"
  | "ASTM_FRAME_INVALID_START_FRAME_NUMBER";

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
 * **The reserved-byte case, and why it has no escape hatch.** `STX`, `ETB` and
 * `ETX` are what {@link decodeAstmFrames} reads as frame structure: `STX` opens
 * a frame, and the first `ETB`/`ETX` after it *is* the end of that frame's text.
 * A record carrying one of those bytes therefore cannot be framed and read back,
 * whichever form it arrives in, and this layer has no escape sequence to hide one
 * behind. Passing bytes instead of a string does **not** route around it, because
 * the byte is the problem rather than the encoding. Take the byte out of the value
 * before framing: which byte belongs in a clinical value is the sender's call, not
 * this library's, so it refuses rather than substituting or deleting one.
 *
 * **The start-frame-number case, and why an option gets an error of its own.** A
 * frame's number is a single ASCII digit, `FN_ZERO + n` for `n` in `0`-`7`, and
 * nothing used to check that `options.startFrameNumber` was one. What went out
 * instead was whatever byte that sum truncated to: measured on this package's own
 * round trip, `-1` wrote `/` into the frame-number position and `NaN`, `Infinity`
 * and `-Infinity` each wrote a `NUL` byte into every frame of the stream, after
 * which the decoder read no frame number at all and emitted **none** of the
 * records. Out-of-domain values that happened to land back on a digit were worse
 * in a quieter way: `1.5` and `257` both produced the byte-for-byte stream a
 * `startFrameNumber` of `1` produces, so the option silently accepted a value it
 * documented as invalid. This one refusal is about the caller's own option rather
 * than about record content, so its message names the value received. Nothing
 * from the stream is quoted.
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
   * point. Enough to find it in the caller's own data. For a record supplied as
   * a `Uint8Array` this is the offending byte's index, which is the same
   * position: a record string is a byte string, so the two indices coincide.
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
   * The frame number to start the sequence at: a whole number from `0` to `7`.
   * Defaults to `1`, the number ASTM gives the first frame of a transfer and the
   * one {@link decodeAstmFrames} expects to read first.
   *
   * **Any other value writes a continuation rather than the start of a transfer,
   * and that is what the option is for**: composing one transfer across more than
   * one call. Concatenating `composeAstmFrames(head)` with
   * `composeAstmFrames(tail, { startFrameNumber: n })`, where `n` is the number
   * after the last frame `head` used, is byte-identical to composing the whole
   * list in a single call and decodes with an empty warnings array, across the
   * `7 → 0` rollover included.
   *
   * **Decoded on its own, a stream that starts anywhere but `1` opens on a
   * sequence gap.** The decoder never bridges a gap silently, so it warns
   * (`ASTM_FRAME_SEQUENCE_GAP`) and does not emit that first record.
   * **What {@link parseFramedAstm} does about that varies with the message
   * shape, and it does not always fail.** Measured: where a *later* record is an
   * `H`, it does not fail at all, and the message parses one record short with
   * the record layer's own `warnings` **empty**, the loss reported only in
   * `frameWarnings`. Where it does fail, the code varies too
   * (`ASTM_RECORD_NO_HEADER` with the `H` dropped, `EMPTY_INPUT` with nothing
   * left, `ASTM_RECORD_UNDECLARED_DELIMITERS` where what survived cannot declare
   * a set); that is three shapes measured rather than a closed list, and the
   * point is that a caller cannot key on one. Read `frameWarnings`. That is the
   * cost of the option rather than a defect in the caller's records, and it is
   * why `1` is the default.
   *
   * **Finding the number to continue from.** Nothing here returns it, and the
   * frame count is not it once a record splits: decode the part you just
   * composed and read the last frame's number, then add one modulo 8, as in
   * `((decodeAstmFrames(part).frames.at(-1)?.frameNumber ?? 0) + 1) % 8`. A frame
   * carries no number only when the stream ends immediately after its `STX`,
   * which is not something this encoder writes, so that fallback never fires on
   * a part composed here. Getting the number wrong costs the record at the join,
   * warned rather than silently.
   *
   * A value outside `0`-`7`, or one that is not a whole number, is refused with
   * `ASTM_FRAME_INVALID_START_FRAME_NUMBER`.
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

/**
 * The three bytes this layer reads as frame structure, and therefore the three a
 * frame's *text* cannot carry. Derived from {@link decodeAstmFrames} rather than
 * assumed: it starts a frame at `STX`, ends that frame's text at the first
 * `ETB`/`ETX` after it, and treats a second `STX` before any terminator as a new
 * frame beginning. `CR`/`LF` are deliberately absent, because they are read only
 * *after* a frame's checksum: a record's own `CR` terminator sits inside frame
 * text on every well-formed stream this encoder writes.
 */
const RESERVED_STRUCTURE_BYTES: ReadonlySet<number> = new Set([STX, ETB, ETX]);

/**
 * Refuse a record carrying a byte the framing reads as structure.
 *
 * **Why a refusal rather than a warning or a repair.** Framing has no escape
 * mechanism: there is nowhere to put such a byte and no way to signal that it is
 * data. Writing it anyway truncates the frame at that byte, and the outcome is
 * not reliably loud. Measured on this package's own round trip: where the two
 * bytes following an embedded `ETX` happen to be the short frame's checksum, the
 * truncated frame **verifies**, the remainder of the record is skipped as
 * inter-frame bytes, the next frame number is still in sequence, and both layers
 * report an empty warnings array while a whole result record has been absorbed
 * into the previous record's text and lost. An embedded `ETB` reaches the same
 * silence by the other door: the truncated frame stays open, so the *next*
 * record's text is appended to it and the two records read back as one. Emit has
 * no warning channel (it returns bytes), so the only alternatives to refusing are
 * substituting a byte the caller did not send or dropping one they did.
 *
 * The check is on the **bytes**, so it covers both accepted forms. A caller
 * cannot route around it by encoding the record themselves, which is the point:
 * the byte is unframable regardless of how it got there.
 *
 * @param bytes - One record's bytes.
 * @param recordIndex - The record's index within the input, for error context.
 * @throws {@link AstmFrameEncodeError} `ASTM_FRAME_RESERVED_BYTE` at the first
 *   such byte.
 */
function assertFramable(bytes: Uint8Array, recordIndex: number): void {
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i];
    if (byte !== undefined && RESERVED_STRUCTURE_BYTES.has(byte)) {
      throw new AstmFrameEncodeError(
        "A record contains a byte the framing layer reads as structure (STX, ETB or ETX). " +
          "A frame has no escape sequence for one, so it cannot be carried inside a frame: " +
          "remove it from the record before framing.",
        recordIndex,
        "ASTM_FRAME_RESERVED_BYTE",
        i,
      );
    }
  }
}

/**
 * Refuse a `startFrameNumber` that cannot be written as a frame number.
 *
 * **Derived from what a frame carries, not from a preference.** The byte after
 * `STX` is one ASCII digit, {@link FN_ZERO} plus the number, so the writable
 * numbers are exactly the whole numbers `0`-`7`, the same modulo-8 sequence
 * {@link decodeAstmFrames} reads and rolls over. Anything else has no digit.
 *
 * **Why a refusal rather than a clamp or a modulo.** Both of those pick a frame
 * number the caller did not ask for, and the frame number is the decoder's only
 * evidence that no frame was dropped: a stream numbered from a value the caller
 * did not choose is a stream whose sequence check certifies the wrong thing.
 * Writing the value through unchecked was the previous behaviour and it produced
 * bytes that were not frame numbers at all (`-1` wrote `/`; `NaN` and either
 * infinity wrote `NUL` into every frame, after which the decoder emitted none of
 * the records), or, where the truncation happened to land back on a digit,
 * silently behaved as some other start value (`1.5` and `257` both emitted the
 * `1` stream byte for byte).
 *
 * @param value - The caller's `startFrameNumber`.
 * @throws {@link AstmFrameEncodeError} `ASTM_FRAME_INVALID_START_FRAME_NUMBER`.
 */
function assertStartFrameNumber(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > FRAME_NUMBER_MODULUS - 1) {
    throw new AstmFrameEncodeError(
      "startFrameNumber must be a whole number from 0 to 7: a frame's number is one ASCII " +
        `digit and the sequence is modulo 8. Received: ${String(value)}.`,
      undefined,
      "ASTM_FRAME_INVALID_START_FRAME_NUMBER",
    );
  }
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
 * byte, the same substitution described above. The reserved-byte check below does
 * not reach that route either, because it compares elements against the three byte
 * values and an element like `0x0103` is not one of them, though its low byte
 * becomes an `ETX` on the wire. Pass a `Uint8Array` or a string.
 *
 * **A record carrying a frame-structure byte is refused too, in either form.**
 * `STX`, `ETB` and `ETX` are what the decoder reads as the shape of a frame, and
 * framing has no escape sequence to hide one behind, so a record holding one is
 * `ASTM_FRAME_RESERVED_BYTE` rather than a frame truncated at that byte. It used
 * to be written as given, and the result was not reliably loud: with the two
 * following bytes matching, the truncated frame verifies and a whole record is
 * absorbed into the previous one with an empty warnings array at both layers.
 * Supplying the record as a `Uint8Array` does not route around this check.
 *
 * **`options.startFrameNumber` is checked before *this function* reads a record**,
 * so on this entry point the refusal never depends on the caller's data.
 * ({@link serializeFramedAstm} serializes every record *before* it gets here, so
 * a record that cannot be serialized is refused first on that route.) It has to
 * be a whole number from `0` to `7`, because a frame's number is one ASCII digit;
 * anything else is `ASTM_FRAME_INVALID_START_FRAME_NUMBER` rather than whatever
 * byte the arithmetic truncated to. A value other than the default `1` writes a
 * **continuation** of a sequence already in progress, which is what the option is
 * for, and a continuation decoded on its own opens on a sequence gap: see
 * {@link ComposeFramesOptions}.
 *
 * What is still **not** guaranteed: that an accepted record round-trips through
 * the *record* layer. A delimiter colliding with a record's type letter, for one,
 * frames and de-frames byte-exactly and still re-reads as a different record.
 *
 * @param records - The reassembled record byte-strings (`Uint8Array` or latin1
 *   `string`), one entry per complete record.
 * @param options - Encode options.
 * @returns The framed byte stream.
 * @throws {@link AstmFrameEncodeError} when `options.startFrameNumber` is not a
 *   whole number from `0` to `7` (`ASTM_FRAME_INVALID_START_FRAME_NUMBER`), the
 *   list is empty, a record has no bytes (`ASTM_FRAME_EMPTY_RECORD`), a record
 *   string holds a character above `U+00FF`
 *   (`ASTM_FRAME_UNENCODABLE_CHARACTER`), or a record holds an `STX`, `ETB` or
 *   `ETX` byte (`ASTM_FRAME_RESERVED_BYTE`).
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
  // Options first: an unwritable start frame number is malformed whatever records follow, so the
  // refusal does not depend on the caller's data.
  const start = options.startFrameNumber ?? FIRST_FRAME_NUMBER;
  assertStartFrameNumber(start);

  if (records.length === 0) {
    throw new AstmFrameEncodeError("Cannot frame an empty record list: nothing to transmit.");
  }

  const out: number[] = [];
  let frameNumber = start;

  records.forEach((record, recordIndex) => {
    const bytes = toBytes(record, recordIndex);
    if (bytes.length === 0) {
      throw new AstmFrameEncodeError(
        "Cannot frame an empty record: a frame must carry record bytes.",
        recordIndex,
      );
    }
    assertFramable(bytes, recordIndex);
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
