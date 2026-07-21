import { describe, expect, it } from "vitest";

import { computeChecksum, parseChecksumHex, toChecksumHex } from "../../src/index.js";

describe("frame checksum", () => {
  it("sums the span modulo 256", () => {
    // 0xFF + 0x02 = 0x101 → 0x01 (mod 256).
    expect(computeChecksum(Uint8Array.from([0xff, 0x02]), 0, 1)).toBe(0x01);
  });

  it("includes both endpoints of [start, endInclusive]", () => {
    const bytes = Uint8Array.from([0x02, 0x31, 0x41, 0x03]); // STX '1' 'A' ETX
    // FN..terminator inclusive = '1' + 'A' + ETX.
    expect(computeChecksum(bytes, 1, 3)).toBe((0x31 + 0x41 + 0x03) & 0xff);
  });

  it("emits uppercase, zero-padded hex", () => {
    expect(toChecksumHex(0x0a)).toBe("0A");
    expect(toChecksumHex(0x75)).toBe("75");
    expect(toChecksumHex(0x100)).toBe("00"); // masked to a byte
  });

  it("parses a checksum case-insensitively (lowercase accepted)", () => {
    expect(parseChecksumHex(Uint8Array.from([0x37, 0x35]), 0, 1)).toBe(0x75); // "75"
    expect(parseChecksumHex(Uint8Array.from([0x37, 0x61]), 0, 1)).toBe(0x7a); // "7a"
    expect(parseChecksumHex(Uint8Array.from([0x37, 0x41]), 0, 1)).toBe(0x7a); // "7A"
  });

  it("returns undefined for a non-hex or out-of-range checksum (never a false match)", () => {
    expect(parseChecksumHex(Uint8Array.from([0x37, 0x7a]), 0, 1)).toBeUndefined(); // 'z' not hex
    expect(parseChecksumHex(Uint8Array.from([0x37]), 0, 1)).toBeUndefined(); // second byte missing
    expect(parseChecksumHex(Uint8Array.from([0x37, 0x35]), 5, 6)).toBeUndefined(); // out of range
  });
});
