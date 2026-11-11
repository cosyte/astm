/**
 * Record bytes read as Latin-1, one character a byte, whatever bytes they hold.
 *
 * The byte reader takes the platform's decoder where that decoder agrees with Latin-1 and reads a
 * chunk at a time where it does not: the `latin1` label names windows-1252, which reads 0x80 to
 * 0x9F as other characters. These hold every byte value to the same message as the same text, on
 * both routes, and across the chunk boundary of the second.
 */

import { describe, expect, it } from "vitest";

import { parseAstmRecords } from "../../src/index.js";

/** A stream whose one manufacturer field carries `payload`, as text and as its bytes. */
function stream(payload: number[]): { text: string; bytes: Uint8Array } {
  const head = "H|\\^&\rM|1|BYTES|";
  const tail = "\rL|1\r";
  const codes = [...head].map((c) => c.charCodeAt(0));
  const end = [...tail].map((c) => c.charCodeAt(0));
  const all = [...codes, ...payload, ...end];
  return { text: String.fromCharCode(...all), bytes: Uint8Array.from(all) };
}

/** Every byte value but the structural ones, so the manufacturer field stays one field. */
function payloadBytes(from: number, to: number): number[] {
  const skip = new Set([0x0a, 0x0d, 0x26, 0x5c, 0x5e, 0x7c]);
  const out: number[] = [];
  for (let b = from; b <= to; b += 1) if (!skip.has(b)) out.push(b);
  return out;
}

describe("record bytes are read as Latin-1, one character a byte", () => {
  it("reads every byte outside 0x80 to 0x9F as the character with its code", () => {
    const { text, bytes } = stream([...payloadBytes(0x01, 0x7f), ...payloadBytes(0xa0, 0xff)]);
    expect(parseAstmRecords(bytes)).toEqual(parseAstmRecords(text));
  });

  it("reads 0x80 to 0x9F as the characters with those codes, not as windows-1252", () => {
    const { text, bytes } = stream(payloadBytes(0x01, 0xff));
    const msg = parseAstmRecords(bytes);
    expect(msg).toEqual(parseAstmRecords(text));
    const field = msg.records[1]?.fields[3]?.raw ?? "";
    expect(field.charCodeAt(field.indexOf("\u0080"))).toBe(0x80);
  });

  it.each([0x7f, 0x80, 0x9f, 0xa0])(
    "reads the byte %i on its own as the character with its code",
    (byte) => {
      // Alone, so no other byte decides which route the input takes: 0x80 and 0x9F are the two
      // ends of the range windows-1252 reads differently, and 0x7F and 0xA0 sit just outside it.
      const msg = parseAstmRecords(stream([0x41, byte, 0x42]).bytes);
      expect(msg.records[1]?.fields[3]?.raw).toBe(`A${String.fromCharCode(byte)}B`);
    },
  );

  it("reads a long input across chunk boundaries the same as its text", () => {
    const payload: number[] = [];
    for (let i = 0; i < 20_000; i += 1) payload.push(i % 7 === 0 ? 0x85 : 0x41 + (i % 26));
    const { text, bytes } = stream(payload);
    expect(parseAstmRecords(bytes)).toEqual(parseAstmRecords(text));
  });
});
