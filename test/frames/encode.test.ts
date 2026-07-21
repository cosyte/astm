/**
 * Unit tests for the frame-layer emit side (`src/frames/encode.ts`):
 * {@link composeAstmFrames} — the exact inverse of {@link decodeAstmFrames}.
 */

import { describe, expect, it } from "vitest";

import {
  AstmFrameEncodeError,
  composeAstmFrames,
  decodeAstmFrames,
  parseAstmRecords,
  parseFramedAstm,
  results,
  serializeFramedAstm,
} from "../../src/index.js";
import { def } from "./_frame-builder.js";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);

describe("composeAstmFrames — round-trip against the decoder", () => {
  it("frames a single record that the decoder verifies and reassembles exactly", () => {
    const rec = "L|1\r";
    const bytes = composeAstmFrames([rec]);
    const out = decodeAstmFrames(bytes);
    expect(out.warnings).toEqual([]);
    expect(out.frames).toHaveLength(1);
    expect(out.frames[0]?.checksum.valid).toBe(true); // checksum COMPUTED, not faked
    expect(out.frames[0]?.terminator).toBe("ETX");
    expect(dec(def(out.records[0]))).toBe(rec);
  });

  it("splits a >240-byte record into ETB…ETX frames and reassembles it", () => {
    const rec = "R|1|^^^687|" + "9".repeat(600) + "|U/L||N||F\r";
    const out = decodeAstmFrames(composeAstmFrames([enc(rec)]));
    expect(out.frames.map((f) => f.terminator)).toEqual(["ETB", "ETB", "ETX"]);
    expect(out.frames.map((f) => f.frameNumber)).toEqual([1, 2, 3]);
    expect(dec(def(out.records[0]))).toBe(rec);
    expect(out.warnings).toEqual([]);
  });

  it("numbers frames continuously across records and rolls over 7 → 0", () => {
    // Nine one-frame records: frame numbers 1..7,0,1.
    const recs = Array.from({ length: 9 }, (_, i) => `R|${String(i)}|^^^1|${String(i)}\r`);
    const out = decodeAstmFrames(composeAstmFrames(recs));
    expect(out.frames.map((f) => f.frameNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 0, 1]);
    expect(out.warnings).toEqual([]);
    expect(out.records.map(dec)).toEqual(recs);
  });

  it("honors an explicit startFrameNumber", () => {
    const out = decodeAstmFrames(composeAstmFrames(["L|1\r"], { startFrameNumber: 5 }));
    expect(out.frames[0]?.frameNumber).toBe(5);
  });

  it("accepts both Uint8Array and latin1 string records", () => {
    const a = composeAstmFrames([enc("L|1\r")]);
    const b = composeAstmFrames(["L|1\r"]);
    expect([...a]).toEqual([...b]);
  });
});

describe("composeAstmFrames — structural refusal (never an empty frame)", () => {
  it("throws on an empty record list", () => {
    expect(() => composeAstmFrames([])).toThrow(AstmFrameEncodeError);
  });

  it("throws on an empty record, naming its index", () => {
    try {
      composeAstmFrames(["H|\\^&\r", ""]);
    } catch (err) {
      expect(err).toBeInstanceOf(AstmFrameEncodeError);
      expect((err as AstmFrameEncodeError).code).toBe("ASTM_FRAME_EMPTY_RECORD");
      expect((err as AstmFrameEncodeError).recordIndex).toBe(1);
    }
  });
});

describe("serializeFramedAstm — the two emit layers composed", () => {
  it("serializes + frames a message that parseFramedAstm decodes back to an equal message", () => {
    const raw = "H|\\^&\rP|1|PRAC|LAB\rO|1|ACC\rR|1|^^^687|28.6|U/L|10-40|N||F\rL|1|N\r";
    const msg = parseAstmRecords(raw);
    const bytes = serializeFramedAstm(msg);
    const rt = parseFramedAstm(bytes);
    expect(rt.frameWarnings).toEqual([]);
    expect(rt.message.records.map((r) => r.type)).toEqual(["H", "P", "O", "R", "L"]);
    expect(results(rt.message)[0]?.value).toBe("28.6");
    expect(results(rt.message)[0]?.status.isActiveFinal).toBe(true);
  });
});
