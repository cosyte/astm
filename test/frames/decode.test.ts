import { describe, expect, it } from "vitest";

import {
  AstmFrameStrictError,
  AstmParseError,
  FATAL_CODES,
  FRAME_WARNING_CODES,
  computeChecksum,
  decodeAstmFrames,
} from "../../src/index.js";

import { bytesOf, checksumOf, def, frame, hex2, stream } from "./_frame-builder.js";

/** Latin1-decode reassembled record bytes back to a string for readable assertions. */
function asText(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

describe("decodeAstmFrames — happy path", () => {
  it("decodes a single final (ETX) frame and reassembles its record bytes", () => {
    const bytes = stream(frame("R|1|^^^687|28.6|U/L\r", { fn: 1, kind: "ETX" }));
    const { records, frames, warnings } = decodeAstmFrames(bytes);

    expect(warnings).toEqual([]);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.frameNumber).toBe(1);
    expect(frames[0]?.terminator).toBe("ETX");
    expect(frames[0]?.trusted).toBe(true);
    expect(frames[0]?.checksum.valid).toBe(true);
    expect(records).toHaveLength(1);
    expect(asText(def(records[0]))).toBe("R|1|^^^687|28.6|U/L\r");
  });

  it("skips inter-frame transfer-control bytes (ENQ/ACK/EOT) without warning", () => {
    const ENQ = [0x05];
    const ACK = [0x06];
    const EOT = [0x04];
    const bytes = stream(ENQ, ACK, frame("H|\\^&\r", { fn: 1 }), EOT);
    const { records, frames, warnings } = decodeAstmFrames(bytes);

    expect(warnings).toEqual([]);
    expect(frames).toHaveLength(1);
    expect(asText(def(records[0]))).toBe("H|\\^&\r");
  });

  it("accepts a lowercase checksum (a tolerated real-vendor quirk) with no warning", () => {
    const bytes = stream(frame("R|1|5.0\r", { fn: 1, checksumCase: "lower" }));
    const { records, frames, warnings } = decodeAstmFrames(bytes);

    expect(warnings).toEqual([]);
    expect(frames[0]?.trusted).toBe(true);
    expect(asText(def(records[0]))).toBe("R|1|5.0\r");
  });

  it("tolerates a missing CR/LF tail (Postel's Law)", () => {
    const bytes = stream(frame("L|1\r", { fn: 1, noCrLf: true }));
    const { records, warnings } = decodeAstmFrames(bytes);
    expect(warnings).toEqual([]);
    expect(asText(def(records[0]))).toBe("L|1\r");
  });

  it("computes the checksum over FN..terminator inclusive (matches the wire byte)", () => {
    // STX '1' 'A' ETX → checksum spans '1','A',ETX.
    const bytes = Uint8Array.from([
      0x02,
      0x31,
      0x41,
      0x03,
      ...bytesOf(hex2(checksumOf([0x31, 0x41, 0x03]))),
    ]);
    const { frames } = decodeAstmFrames(bytes);
    expect(frames[0]?.checksum.computed).toBe(computeChecksum(bytes, 1, 3));
    expect(frames[0]?.checksum.valid).toBe(true);
  });
});

describe("decodeAstmFrames — multi-frame reassembly (240-split)", () => {
  it("reassembles an ETB…ETX run into one record equal to the single-frame form", () => {
    const record = "R|1|^^^687|28.6|U/L|3.0-10.0|N||F\r";
    const single = stream(frame(record, { fn: 1, kind: "ETX" }));

    // Same bytes split at an arbitrary point across two frames with correct sequence numbers.
    const cut = 15;
    const multi = stream(
      frame(record.slice(0, cut), { fn: 1, kind: "ETB" }),
      frame(record.slice(cut), { fn: 2, kind: "ETX" }),
    );

    const a = decodeAstmFrames(single);
    const b = decodeAstmFrames(multi);
    expect(b.warnings).toEqual([]);
    expect(b.records).toHaveLength(1);
    expect(asText(def(b.records[0]))).toBe(record);
    expect(asText(def(b.records[0]))).toBe(asText(def(a.records[0])));
  });

  it("rolls the frame number over 7 → 0 across a long record with no gap warning", () => {
    const parts = Array.from({ length: 9 }, (_, i) => `seg${String(i)};`);
    const record = parts.join("") + "\r";
    const fns = [1, 2, 3, 4, 5, 6, 7, 0, 1];
    const frameList = parts.map((p, i) =>
      frame(p + (i === parts.length - 1 ? "\r" : ""), {
        fn: def(fns[i]),
        kind: i === parts.length - 1 ? "ETX" : "ETB",
      }),
    );
    const { records, warnings } = decodeAstmFrames(stream(...frameList));
    expect(warnings).toEqual([]);
    expect(asText(def(records[0]))).toBe(record);
  });
});

describe("decodeAstmFrames — fail-safe: bad checksum", () => {
  it("surfaces a bad-checksum frame untrusted and never merges it into a record", () => {
    const bytes = stream(frame("R|1|999\r", { fn: 1, forceChecksum: 0x00 }));
    const { records, frames, warnings } = decodeAstmFrames(bytes);

    expect(frames).toHaveLength(1);
    expect(frames[0]?.trusted).toBe(false);
    expect(frames[0]?.checksum.valid).toBe(false);
    // The frame's bytes are still surfaced (for audit) …
    expect(asText(def(frames[0]).text)).toBe("R|1|999\r");
    // … but never reassembled into a trusted record.
    expect(records).toEqual([]);
    expect(warnings.map((w) => w.code)).toContain(FRAME_WARNING_CODES.ASTM_FRAME_BAD_CHECKSUM);
  });

  it("drops a whole multi-frame record if any one frame fails checksum (no partial merge)", () => {
    const record = "R|1|part-one;part-two\r";
    const cut = 10;
    const bytes = stream(
      frame(record.slice(0, cut), { fn: 1, kind: "ETB" }),
      frame(record.slice(cut), { fn: 2, kind: "ETX", forceChecksum: 0x00 }),
    );
    const { records, warnings } = decodeAstmFrames(bytes);
    expect(records).toEqual([]); // the final frame was untrusted → the record is not emitted
    expect(warnings.map((w) => w.code)).toContain(FRAME_WARNING_CODES.ASTM_FRAME_BAD_CHECKSUM);
  });

  it("carries only a frame number + byte offset in the warning — never the record text", () => {
    const bytes = stream(frame("R|1|SECRET-VALUE\r", { fn: 3, forceChecksum: 0x00 }));
    const { warnings } = decodeAstmFrames(bytes);
    const w = warnings.find((x) => x.code === FRAME_WARNING_CODES.ASTM_FRAME_BAD_CHECKSUM);
    expect(w?.position.frameNumber).toBe(3);
    expect(typeof w?.position.byteOffset).toBe("number");
    expect(w?.message).not.toContain("SECRET");
    expect(JSON.stringify(w)).not.toContain("SECRET");
  });
});

describe("decodeAstmFrames — fail-safe: sequence gap", () => {
  it("warns on a frame-number gap and does not bridge the record across it", () => {
    const bytes = stream(
      frame("R|1|a\r".slice(0, 4), { fn: 1, kind: "ETB" }),
      frame("|a\r", { fn: 3, kind: "ETX" }), // expected 2 — a frame was dropped
    );
    const { records, warnings } = decodeAstmFrames(bytes);
    expect(warnings.map((w) => w.code)).toContain(FRAME_WARNING_CODES.ASTM_FRAME_SEQUENCE_GAP);
    expect(records).toEqual([]); // never silently concatenated across the gap
  });

  it("does not warn when frames are contiguous (1,2,3)", () => {
    const bytes = stream(
      frame("A", { fn: 1, kind: "ETB" }),
      frame("B", { fn: 2, kind: "ETB" }),
      frame("C\r", { fn: 3, kind: "ETX" }),
    );
    const { records, warnings } = decodeAstmFrames(bytes);
    expect(warnings).toEqual([]);
    expect(asText(def(records[0]))).toBe("ABC\r");
  });
});

describe("decodeAstmFrames — fail-safe: unterminated", () => {
  it("warns on a frame with STX but no terminator, inventing no record", () => {
    const bytes = Uint8Array.from([0x02, 0x31, ...bytesOf("R|1|partial")]);
    const { records, frames, warnings } = decodeAstmFrames(bytes);
    expect(warnings.map((w) => w.code)).toContain(FRAME_WARNING_CODES.ASTM_FRAME_UNTERMINATED);
    expect(frames[0]?.unterminated).toBe(true);
    expect(frames[0]?.trusted).toBe(false);
    expect(records).toEqual([]);
  });

  it("warns on a record left open on ETB with no final ETX", () => {
    const bytes = stream(frame("half\r", { fn: 1, kind: "ETB" }));
    const { records, warnings } = decodeAstmFrames(bytes);
    expect(warnings.map((w) => w.code)).toContain(FRAME_WARNING_CODES.ASTM_FRAME_UNTERMINATED);
    expect(records).toEqual([]);
  });
});

describe("decodeAstmFrames — fail-safe: oversize", () => {
  it("warns when a frame's text exceeds 240 bytes", () => {
    const big = "X".repeat(250) + "\r";
    const bytes = stream(frame(big, { fn: 1, kind: "ETX" }));
    const { records, frames, warnings } = decodeAstmFrames(bytes);
    expect(warnings.map((w) => w.code)).toContain(FRAME_WARNING_CODES.ASTM_FRAME_OVERSIZE);
    expect(frames[0]?.oversize).toBe(true);
    // Checksum still validates, so the (deviating) frame is tolerated and reassembled.
    expect(records).toHaveLength(1);
  });

  it("does not warn at exactly 240 bytes", () => {
    const exact = "Y".repeat(240);
    const bytes = stream(frame(exact, { fn: 1, kind: "ETX" }));
    const { warnings } = decodeAstmFrames(bytes);
    expect(warnings).toEqual([]);
  });
});

describe("decodeAstmFrames — modes and empties", () => {
  it("throws EMPTY_INPUT on an empty stream (both modes)", () => {
    expect(() => decodeAstmFrames(new Uint8Array([]))).toThrowError(AstmParseError);
    try {
      decodeAstmFrames(new Uint8Array([]));
    } catch (err) {
      expect(err instanceof AstmParseError && err.code).toBe(FATAL_CODES.EMPTY_INPUT);
    }
  });

  it("strict mode throws AstmFrameStrictError carrying the deviations", () => {
    const bytes = stream(frame("R|1|x\r", { fn: 1, forceChecksum: 0x00 }));
    expect(() => decodeAstmFrames(bytes, { strict: true })).toThrowError(AstmFrameStrictError);
    try {
      decodeAstmFrames(bytes, { strict: true });
    } catch (err) {
      expect(err instanceof AstmFrameStrictError).toBe(true);
      if (err instanceof AstmFrameStrictError) {
        expect(err.warnings.length).toBeGreaterThan(0);
        expect(err.warnings[0]?.code).toBe(FRAME_WARNING_CODES.ASTM_FRAME_BAD_CHECKSUM);
      }
    }
  });

  it("strict mode passes a clean stream through unchanged", () => {
    const bytes = stream(frame("H|\\^&\r", { fn: 1 }));
    const { records } = decodeAstmFrames(bytes, { strict: true });
    expect(asText(def(records[0]))).toBe("H|\\^&\r");
  });
});
