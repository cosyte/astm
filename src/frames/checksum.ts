/**
 * The ASTM/CLSI-LIS01 modulo-256 frame checksum.
 *
 * The checksum is the sum, modulo 256, of every byte **after** the `STX` up to
 * and **including** the `ETB`/`ETX` terminator — i.e. the frame number, the record
 * text, and the terminator byte. It is carried on the wire as **two hexadecimal
 * characters**. This module computes it (`computeChecksum`), formats it for emit
 * (`toChecksumHex` — always **uppercase**), and reads it back leniently
 * (`parseChecksumHex` — **accepts lowercase**), matching the real-vendor quirk that
 * some analyzers emit a lowercase checksum.
 */

/**
 * Sum bytes `[start, endInclusive]` of `bytes` modulo 256 — the ASTM frame
 * checksum span (frame number through the terminator, inclusive).
 *
 * @param bytes - The full decoded byte stream.
 * @param start - First index to include (the frame-number byte, one past `STX`).
 * @param endInclusive - Last index to include (the `ETB`/`ETX` terminator byte).
 * @returns The checksum in `0`–`255`.
 * @example
 * ```ts
 * import { computeChecksum } from "@cosyte/astm";
 * // bytes: STX '1' 'A' ETX  →  sum '1' + 'A' + ETX, mod 256.
 * computeChecksum(new Uint8Array([0x02, 0x31, 0x41, 0x03]), 1, 3); // 0x75
 * ```
 */
export function computeChecksum(bytes: Uint8Array, start: number, endInclusive: number): number {
  let sum = 0;
  for (let i = start; i <= endInclusive; i++) {
    sum = (sum + (bytes[i] ?? 0)) & 0xff;
  }
  return sum;
}

/**
 * Format a checksum byte as the two **uppercase** hex characters ASTM puts on the
 * wire (the conservative-emit form). Decode accepts lowercase; emit is uppercase.
 *
 * @param checksum - A value in `0`–`255`.
 * @returns Two uppercase hex characters, zero-padded (e.g. `"0A"`, `"75"`).
 * @example
 * ```ts
 * import { toChecksumHex } from "@cosyte/astm";
 * toChecksumHex(0x0a); // "0A"
 * ```
 */
export function toChecksumHex(checksum: number): string {
  return (checksum & 0xff).toString(16).toUpperCase().padStart(2, "0");
}

/** ASCII code for a single hex digit (`0`–`9`/`A`–`F`/`a`–`f`), or `undefined`. */
function hexNibble(code: number | undefined): number | undefined {
  if (code === undefined) return undefined;
  if (code >= 0x30 && code <= 0x39) return code - 0x30; // 0-9
  if (code >= 0x41 && code <= 0x46) return code - 0x41 + 10; // A-F
  if (code >= 0x61 && code <= 0x66) return code - 0x61 + 10; // a-f (lenient: lowercase accepted)
  return undefined;
}

/**
 * Read the two-hex-char checksum at `bytes[i0]`/`bytes[i1]`, **case-insensitively**
 * (a lowercase checksum is a tolerated real-vendor quirk). Returns `undefined` when
 * either position is out of range or not a hex digit — the caller then treats the
 * frame as having no readable declared checksum, never as a match.
 *
 * @param bytes - The full decoded byte stream.
 * @param i0 - Index of the high hex nibble (immediately after the terminator).
 * @param i1 - Index of the low hex nibble.
 * @returns The declared checksum in `0`–`255`, or `undefined` if unreadable.
 * @example
 * ```ts
 * import { parseChecksumHex } from "@cosyte/astm";
 * parseChecksumHex(new Uint8Array([0x37, 0x35]), 0, 1); // 0x75 ("75")
 * parseChecksumHex(new Uint8Array([0x37, 0x35]), 5, 6); // undefined (out of range)
 * ```
 */
export function parseChecksumHex(bytes: Uint8Array, i0: number, i1: number): number | undefined {
  const hi = hexNibble(bytes[i0]);
  const lo = hexNibble(bytes[i1]);
  if (hi === undefined || lo === undefined) return undefined;
  return (hi << 4) | lo;
}
