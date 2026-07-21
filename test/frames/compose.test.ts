import { describe, expect, it } from "vitest";

import { parseAstmRecords, parseFramedAstm, results } from "../../src/index.js";

import { frame, stream } from "./_frame-builder.js";

describe("parseFramedAstm — composing the framing and record layers at the edge", () => {
  it("decodes frames and parses the reassembled records into an AstmMessage", () => {
    const bytes = stream(
      frame("H|\\^&\r", { fn: 1, kind: "ETX" }),
      frame("P|1\r", { fn: 2, kind: "ETX" }),
      frame("O|1|ACC-7\r", { fn: 3, kind: "ETX" }),
      frame("R|1|^^^687|28.6|U/L||N||F\r", { fn: 4, kind: "ETX" }),
      frame("L|1|N\r", { fn: 5, kind: "ETX" }),
    );
    const { message, frames, frameWarnings } = parseFramedAstm(bytes);

    expect(frameWarnings).toEqual([]);
    expect(frames).toHaveLength(5);
    expect(message.header.delimiters.field).toBe("|");
    expect(results(message)[0]?.value).toBe("28.6");
    expect(results(message)[0]?.units).toBe("U/L");
  });

  it("a record split across frames parses identically to its single-frame form", () => {
    const H = "H|\\^&\r";
    const R = "R|1|^^^687|123.4|mg/dL|10-20|H||F\r";
    const L = "L|1\r";

    // Frame the R record across two ETB/ETX frames; H and L each single-frame.
    const cut = 12;
    const framed = stream(
      frame(H, { fn: 1, kind: "ETX" }),
      frame(R.slice(0, cut), { fn: 2, kind: "ETB" }),
      frame(R.slice(cut), { fn: 3, kind: "ETX" }),
      frame(L, { fn: 4, kind: "ETX" }),
    );
    const viaFrames = parseFramedAstm(framed).message;
    const direct = parseAstmRecords(H + R + L);

    expect(results(viaFrames)[0]?.value).toBe("123.4");
    expect(results(viaFrames)[0]?.value).toBe(results(direct)[0]?.value);
    expect(viaFrames.records.map((r) => r.type)).toEqual(direct.records.map((r) => r.type));
  });

  it("a bad-checksum frame is excluded, so its record never reaches the parser", () => {
    const bytes = stream(
      frame("H|\\^&\r", { fn: 1, kind: "ETX" }),
      frame("R|1|^^^687|9.9|U/L||N||F\r", { fn: 2, kind: "ETX", forceChecksum: 0x00 }),
      frame("L|1\r", { fn: 3, kind: "ETX" }),
    );
    const { message, frameWarnings } = parseFramedAstm(bytes);
    expect(frameWarnings.length).toBeGreaterThan(0);
    // The untrusted result record was never merged, so the parsed message has no results.
    expect(results(message)).toEqual([]);
    expect(message.records.map((r) => r.type)).toEqual(["H", "L"]);
  });
});
