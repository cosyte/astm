/**
 * Unit tests for {@link detectFraming}: `STX`/`ENQ` ⇒ framed, a bare record letter
 * ⇒ raw, anything else ⇒ ambiguous (defaulted to framed + one warning), and an
 * explicit override short-circuits all of it with no warning.
 */

import { describe, expect, it } from "vitest";

import { detectFraming, LTP_WARNING_CODES } from "../../src/index.js";

const bytes = (...b: number[]): Uint8Array => Uint8Array.from(b);

describe("detectFraming", () => {
  it("STX-led stream is framed (serial / framed-TCP), no warning", () => {
    const r = detectFraming(bytes(0x02, 0x31, 0x48));
    expect(r.framing).toBe("framed");
    expect(r.defaulted).toBe(false);
    expect(r.warnings).toHaveLength(0);
  });

  it("ENQ-led stream is framed (the handshake is present), no warning", () => {
    const r = detectFraming(bytes(0x05));
    expect(r.framing).toBe("framed");
    expect(r.warnings).toHaveLength(0);
  });

  it("a bare record letter (H) is raw (framing dropped, cobas b121)", () => {
    const r = detectFraming(bytes(0x48, 0x7c, 0x5c)); // "H|\"
    expect(r.framing).toBe("raw");
    expect(r.defaulted).toBe(false);
    expect(r.warnings).toHaveLength(0);
  });

  it.each([0x50, 0x4f, 0x52, 0x43, 0x51, 0x4d, 0x53, 0x4c])(
    "record letter 0x%s leads a raw stream",
    (lead) => {
      expect(detectFraming(bytes(lead)).framing).toBe("raw");
    },
  );

  it("an unrecognizable lead byte defaults to framed and warns (never guesses into data loss)", () => {
    const r = detectFraming(bytes(0x2a)); // "*"
    expect(r.framing).toBe("framed");
    expect(r.defaulted).toBe(true);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]?.code).toBe(LTP_WARNING_CODES.ASTM_LTP_AMBIGUOUS_TRANSPORT);
  });

  it("an empty stream is ambiguous → defaulted to framed + warning (advisory, never throws)", () => {
    const r = detectFraming(bytes());
    expect(r.framing).toBe("framed");
    expect(r.defaulted).toBe(true);
    expect(r.warnings[0]?.code).toBe(LTP_WARNING_CODES.ASTM_LTP_AMBIGUOUS_TRANSPORT);
  });

  it("an override forces raw even for an STX-led stream, with no warning", () => {
    const r = detectFraming(bytes(0x02, 0x31), { override: "raw" });
    expect(r.framing).toBe("raw");
    expect(r.defaulted).toBe(false);
    expect(r.warnings).toHaveLength(0);
  });

  it("an override forces framed even for a record-letter-led stream", () => {
    const r = detectFraming(bytes(0x48), { override: "framed" });
    expect(r.framing).toBe("framed");
    expect(r.warnings).toHaveLength(0);
  });
});
