/**
 * The frame encoder refuses a `startFrameNumber` it cannot write as a frame
 * number (`src/frames/encode.ts`, `ASTM_FRAME_INVALID_START_FRAME_NUMBER`).
 *
 * Why this file exists, in one line: the option was documented `0`-`7` and was
 * **unchecked**, so a value outside that range did not fail, it went out as
 * whatever byte `FN_ZERO + value` truncated to. Measured on this package's own
 * round trip: `-1` put a `/` in the frame-number position, and `NaN`,
 * `Infinity` and `-Infinity` each put a `NUL` there in **every** frame, after
 * which the decoder recognised no frame number at all and emitted **none** of
 * the records. The quieter half is the reason the guard checks the whole domain
 * rather than just the ends: `1.5` and `257` truncated back onto the `1` digit
 * and silently produced the stream a `startFrameNumber` of `1` produces, so the
 * option accepted values it documented as invalid without saying so.
 *
 * The old behaviour is asserted on bytes rebuilt with the test-only `frame()`
 * builder, which computes `0x30 + fn` and the checksum the same way the encoder
 * did, so nothing is transcribed twice. All content is synthetic.
 *
 * The other half of this file is the capability the guard must NOT remove: a
 * start other than `1` composes a **continuation** of a transfer already in
 * progress, and that is a real, working use. It is pinned here so the domain is
 * never narrowed to `1` on the reasoning that nothing else decodes.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  AstmFrameEncodeError,
  AstmParseError,
  composeAstmFrames,
  decodeAstmFrames,
  parseAstmRecords,
  parseFramedAstm,
  serializeFramedAstm,
} from "../../src/index.js";
import { frame, stream } from "./_frame-builder.js";

/** Synthetic four-record message: no real patient, no real accession. */
const RECORDS = [
  "H|\\^&\r",
  "P|1||||SYNTHETIC^PATIENT\r",
  "R|1|^^^687|28.6|U/L||N||F\r",
  "L|1|N\r",
] as const;

/** The frame-number byte of every frame in a stream, as characters. */
function frameNumberBytes(bytes: Uint8Array): string[] {
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] === 0x02) out.push(String.fromCharCode(bytes[i + 1] ?? 0));
  }
  return out;
}

/** Concatenate framed byte runs, the way a transport would put them on the wire. */
function join(...parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * The old encoder in the only respect this file measures: it wrote
 * `FN_ZERO + startFrameNumber` into the frame-number position and advanced
 * `(n + 1) % 8` from there, with no check. `frame()` does the same arithmetic and
 * `stream()` applies the same byte truncation, so these are the bytes that used
 * to go out. Bounded to records under 240 bytes (no split), which every fixture
 * below is.
 */
const composeUnvalidated = (records: readonly string[], start: number): Uint8Array =>
  // The FIRST frame takes the raw start value, unreduced, because that is what the
  // old encoder wrote: `(start + i) % 8` for i = 0 would silently normalise a value
  // like 8 into a '0' the old encoder never emitted.
  stream(...records.map((r, i) => frame(r, { fn: i === 0 ? start : (start + i) % 8 })));

describe("what an unwritable startFrameNumber used to put on the wire", () => {
  it("-1 wrote a '/' into the frame-number position, and the record was never emitted", () => {
    const old = composeUnvalidated([...RECORDS], -1);
    // Not a frame number: '/' is one below ASCII '0'.
    expect(frameNumberBytes(old)[0]).toBe("/");
    const out = decodeAstmFrames(old);
    expect(out.warnings.map((w) => w.code)).toContain("ASTM_FRAME_SEQUENCE_GAP");
    // The first record is untrusted and is not emitted: four records in, fewer out.
    expect(out.records.length).toBeLessThan(RECORDS.length);
    expect(() => parseFramedAstm(old)).toThrow(AstmParseError);
  });

  it("NaN wrote a NUL into EVERY frame, and not one record came back", () => {
    const old = composeUnvalidated([...RECORDS], Number.NaN);
    expect(frameNumberBytes(old)).toEqual(["\u0000", "\u0000", "\u0000", "\u0000"]);
    const out = decodeAstmFrames(old);
    // Every frame is a gap, so every record is dropped: a whole message lost.
    expect(out.records).toHaveLength(0);
    expect(out.warnings.map((w) => w.code)).toEqual([
      "ASTM_FRAME_SEQUENCE_GAP",
      "ASTM_FRAME_SEQUENCE_GAP",
      "ASTM_FRAME_SEQUENCE_GAP",
      "ASTM_FRAME_SEQUENCE_GAP",
    ]);
    expect(() => parseFramedAstm(old)).toThrow(AstmParseError);
  });

  it("the recorded detail was wrong and this pins the measured one: it is NUL, not a space", () => {
    // A space (0x20) would be an ordinary inter-frame byte; a NUL is what the
    // arithmetic actually produced. The distinction is why the whole stream, and
    // not just its first record, was lost.
    expect(frameNumberBytes(composeUnvalidated([...RECORDS], Number.NaN))[0]).not.toBe(" ");
  });

  it("1.5 and 257 truncated back onto '1' and silently emitted the start-at-1 stream", () => {
    const asOne = composeUnvalidated([...RECORDS], 1);
    // The old encoder pushed the raw sum into a number[] and let Uint8Array.from
    // truncate it, which is what stream() does here too.
    expect([...composeUnvalidated([...RECORDS], 1.5)]).toEqual([...asOne]);
    expect([...composeUnvalidated([...RECORDS], 257)]).toEqual([...asOne]);
  });
});

describe("composeAstmFrames refuses a startFrameNumber it cannot write", () => {
  const unwritable: readonly (readonly [string, number])[] = [
    ["below the range", -1],
    ["one above the range", 8],
    ["a non-digit", 9],
    ["a fraction under one", 0.5],
    ["a fraction that truncates onto a digit", 1.5],
    ["a value that wraps back onto a digit", 257],
    ["a value past the safe integer range", 1e21],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
  ];

  for (const [label, value] of unwritable) {
    it(`refuses ${label} (${String(value)})`, () => {
      try {
        composeAstmFrames([...RECORDS], { startFrameNumber: value });
        expect.unreachable("composeAstmFrames should have refused");
      } catch (err) {
        expect(err).toBeInstanceOf(AstmFrameEncodeError);
        expect((err as AstmFrameEncodeError).code).toBe("ASTM_FRAME_INVALID_START_FRAME_NUMBER");
      }
    });
  }

  it("names the value it received, which is the caller's own option and not stream content", () => {
    try {
      composeAstmFrames([...RECORDS], { startFrameNumber: 9 });
      expect.unreachable("composeAstmFrames should have refused");
    } catch (err) {
      const message = (err as AstmFrameEncodeError).message;
      expect(message).toContain("9");
      // Nothing from the records reaches the message.
      expect(message).not.toContain("28.6");
      expect(message).not.toContain("SYNTHETIC");
    }
  });

  it("checks the option before the records, so the refusal does not depend on the data", () => {
    // An empty list would otherwise be ASTM_FRAME_EMPTY_RECORD: the option is
    // malformed whatever records follow it.
    try {
      composeAstmFrames([], { startFrameNumber: 9 });
      expect.unreachable("composeAstmFrames should have refused");
    } catch (err) {
      expect((err as AstmFrameEncodeError).code).toBe("ASTM_FRAME_INVALID_START_FRAME_NUMBER");
    }
  });

  it("covers serializeFramedAstm too, which passes the same options through", () => {
    const msg = parseAstmRecords(RECORDS.join(""));
    expect(() => serializeFramedAstm(msg, { startFrameNumber: -1 })).toThrow(AstmFrameEncodeError);
  });
});

describe("the negative controls: what the guard must NOT refuse", () => {
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7]) {
    it(`still composes with startFrameNumber ${String(n)}, the whole documented domain`, () => {
      const bytes = composeAstmFrames([...RECORDS], { startFrameNumber: n });
      expect(frameNumberBytes(bytes)[0]).toBe(String(n));
    });
  }

  it("still composes with no options at all, byte-identical to an explicit 1", () => {
    expect([...composeAstmFrames([...RECORDS])]).toEqual([
      ...composeAstmFrames([...RECORDS], { startFrameNumber: 1 }),
    ]);
  });

  it("is a biconditional: refused if and only if it is not a whole number in 0-7", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: -20, max: 20 }),
          fc.double({ min: -20, max: 20, noNaN: true }),
          fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
        ),
        (value) => {
          const writable = Number.isInteger(value) && value >= 0 && value <= 7;
          let refused = false;
          try {
            composeAstmFrames(["L|1\r"], { startFrameNumber: value });
          } catch (err) {
            expect(err).toBeInstanceOf(AstmFrameEncodeError);
            refused =
              (err as AstmFrameEncodeError).code === "ASTM_FRAME_INVALID_START_FRAME_NUMBER";
          }
          expect(refused).toBe(!writable);
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe("the capability the guard keeps: a non-default start composes a continuation", () => {
  it("two calls joined are byte-identical to one call, and decode with no warnings", () => {
    const head = [...RECORDS].slice(0, 2);
    const tail = [...RECORDS].slice(2);
    const partA = composeAstmFrames(head); // frames 1, 2
    const partB = composeAstmFrames(tail, { startFrameNumber: 3 }); // frames 3, 4
    const joined = join(partA, partB);

    expect([...joined]).toEqual([...composeAstmFrames([...RECORDS])]);
    const out = decodeAstmFrames(joined);
    expect(out.warnings).toEqual([]);
    expect(out.records).toHaveLength(4);
    expect(parseFramedAstm(joined).message.records.map((r) => r.type)).toEqual([
      "H",
      "P",
      "R",
      "L",
    ]);
  });

  it("holds across the 7 to 0 rollover, where the continuation number is not the frame count", () => {
    // Five records of 250 bytes: each splits into two frames, so the head's two
    // records consume four frames (1, 2, 3, 4) and the tail resumes at 5.
    const big = Array.from({ length: 5 }, (_, i) => `C|${String(i + 1)}|${"X".repeat(250)}\r`);
    const partA = composeAstmFrames(big.slice(0, 2));
    const framesUsed = frameNumberBytes(partA).length;
    expect(framesUsed).toBe(4);
    const partB = composeAstmFrames(big.slice(2), { startFrameNumber: (1 + framesUsed) % 8 });
    const joined = join(partA, partB);

    expect([...joined]).toEqual([...composeAstmFrames(big)]);
    const out = decodeAstmFrames(joined);
    expect(out.warnings).toEqual([]);
    expect(out.records).toHaveLength(5);
    // The rollover really is crossed: 7 is followed by 0.
    expect(frameNumberBytes(joined)).toEqual(["1", "2", "3", "4", "5", "6", "7", "0", "1", "2"]);
  });
});

describe("what a non-default start costs when the stream IS decoded on its own", () => {
  it("opens on a sequence gap, drops that first record, and leaves parseFramedAstm no header", () => {
    // Documented on the option rather than guarded against: 0 is writable, and a
    // stream that starts at 0 is a legitimate continuation. Read alone it is not
    // the start of a transfer, and the decoder never bridges a gap silently.
    const bytes = composeAstmFrames([...RECORDS], { startFrameNumber: 0 });
    const out = decodeAstmFrames(bytes);
    expect(out.warnings.map((w) => w.code)).toEqual(["ASTM_FRAME_SEQUENCE_GAP"]);
    expect(out.records).toHaveLength(RECORDS.length - 1);
    try {
      parseFramedAstm(bytes);
      expect.unreachable("the H record was dropped, so there is no header");
    } catch (err) {
      expect(err).toBeInstanceOf(AstmParseError);
      expect((err as AstmParseError).code).toBe("ASTM_RECORD_NO_HEADER");
    }
  });
});
