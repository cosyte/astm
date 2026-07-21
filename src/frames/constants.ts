/**
 * Byte constants and limits for the ASTM/CLSI-LIS01 (was E1381) frame codec.
 *
 * A frame on the wire is `<STX> FN text <ETB|ETX> C1 C2 <CR> <LF>`: an `STX`
 * start byte, a single ASCII frame-number digit `FN` (`0`–`7`), up to 240 bytes
 * of record text, an `ETB` (intermediate) or `ETX` (final) terminator, a
 * two-hex-char modulo-256 checksum, and a `CR`+`LF` tail. These are the raw byte
 * values; the decoder in `./decode.ts` is the only consumer.
 */

/** Start of a frame (`0x02`). */
export const STX = 0x02;
/** Final-frame terminator (`0x03`) — the last frame of a record. */
export const ETX = 0x03;
/** Intermediate-frame terminator (`0x17`) — the record continues in the next frame. */
export const ETB = 0x17;
/** Carriage return (`0x0D`) — closes a frame after the checksum. */
export const CR = 0x0d;
/** Line feed (`0x0A`) — follows the `CR` at the end of a frame. */
export const LF = 0x0a;

/** ASCII `0` (`0x30`) — the low end of the frame-number digit range. */
export const FN_ZERO = 0x30;
/** ASCII `7` (`0x37`) — the high end of the frame-number digit range. */
export const FN_SEVEN = 0x37;

/**
 * The maximum record-text length in a single frame (240 bytes). The seven framing
 * control bytes (`STX`, `FN`, the terminator, the two checksum chars, `CR`, `LF`)
 * are **not** counted toward this limit — only the record text between `FN` and the
 * terminator is. Text longer than this without a split is an oversize deviation.
 */
export const MAX_FRAME_TEXT = 240;

/** The frame-number sequence is modulo 8 (`0`–`7`), and by convention starts at `1`. */
export const FRAME_NUMBER_MODULUS = 8;
/** The frame number of the first frame of a transfer (`1`); the sequence rolls over `7 → 0 → 1`. */
export const FIRST_FRAME_NUMBER = 1;
