/**
 * REQUIRED byte-level FUZZ layer for the E1381 frame codec — the same bar as
 * `dicom` Part 10 and `mllp` framing.
 *
 * The hard guarantee: feeding **arbitrary / truncated / mixed / control-char-laden**
 * bytes into {@link decodeAstmFrames} must never crash, hang, or OOM — it degrades
 * to a typed error or a value-free warning. In lenient mode the only sanctioned
 * throw is the shared `EMPTY_INPUT` fatal (reachable only on a zero-length stream,
 * which these arbitraries never produce), so a lenient decode of non-empty bytes
 * must **never** throw. Every warning it accumulates must carry a registered
 * `ASTM_FRAME_*` code and a numeric byte offset.
 *
 * The final block is the **non-vacuity** proof: an arbitrary that always embeds a
 * well-formed frame drives the decoder through its deep paths (checksum verify,
 * reassembly, sequencing) — so the fuzzer is exercising the codec, not just the
 * "no STX ⇒ skip everything" fast path.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  AstmFrameStrictError,
  AstmParseError,
  FATAL_CODES,
  FRAME_WARNING_CODES,
  decodeAstmFrames,
} from "../../src/index.js";

import { checksumOf, def, frame, hex2 } from "../frames/_frame-builder.js";

const NUM_RUNS = 1500;

const KNOWN_FRAME_CODES = new Set<string>(Object.values(FRAME_WARNING_CODES));

/** Frame-structure control bytes, so control-char-laden noise partially forms frames. */
const CONTROL_BYTES = [0x02, 0x03, 0x17, 0x0d, 0x0a, 0x05, 0x06, 0x04, 0x15]; // STX ETX ETB CR LF ENQ ACK EOT NAK

/** Arbitrary raw bytes (the full 0–255 range). */
function randomBytes(): fc.Arbitrary<Uint8Array> {
  return fc.uint8Array({ minLength: 1, maxLength: 512 });
}

/** Arbitrary bytes biased toward frame-control chars, digits, and hex — near-miss frames. */
function controlLadenBytes(): fc.Arbitrary<Uint8Array> {
  const byte = fc.oneof(
    fc.constantFrom(...CONTROL_BYTES),
    fc.constantFrom(...[...Array(16).keys()].map((d) => 0x30 + d)), // '0'..'?': digits + a few
    fc.constantFrom(...[...Array(6).keys()].map((h) => 0x41 + h)), // 'A'..'F'
    fc.integer({ min: 0, max: 255 }),
  );
  return fc.array(byte, { minLength: 1, maxLength: 512 }).map((a) => Uint8Array.from(a));
}

/** A well-formed frame's bytes, from arbitrary (short) text and random FN / terminator / case. */
function wellFormedFrameBytes(): fc.Arbitrary<number[]> {
  return fc
    .tuple(
      fc.string({ maxLength: 40 }),
      fc.integer({ min: 0, max: 7 }),
      fc.constantFrom<"ETB" | "ETX">("ETB", "ETX"),
      fc.constantFrom<"upper" | "lower">("upper", "lower"),
    )
    .map(([text, fn, kind, checksumCase]) =>
      // Strip control bytes from the text so it stays inside one frame's payload.
      frame([...text].filter((c) => c.charCodeAt(0) > 0x1f).join(""), { fn, kind, checksumCase }),
    );
}

/** A stream that interleaves valid frames with arbitrary noise — the deep-path fuzz. */
function framesWithNoise(): fc.Arbitrary<Uint8Array> {
  return fc
    .array(
      fc.oneof(
        wellFormedFrameBytes(),
        fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 20 }),
      ),
      {
        minLength: 1,
        maxLength: 12,
      },
    )
    .map((parts) => Uint8Array.from(parts.flat()));
}

/** Assert a thrown value is one of the two sanctioned throws; rethrow anything else. */
function assertSanctionedLenient(err: unknown): void {
  if (err instanceof AstmParseError && err.code === FATAL_CODES.EMPTY_INPUT) return;
  throw err;
}

function assertWarningsWellFormed(
  warnings: readonly { code: string; position: { byteOffset: number } }[],
): void {
  for (const w of warnings) {
    expect(KNOWN_FRAME_CODES.has(w.code)).toBe(true);
    expect(Number.isFinite(w.position.byteOffset)).toBe(true);
  }
}

describe("fuzz: arbitrary bytes never crash the frame decoder (lenient)", () => {
  it("whole-buffer random noise: no throw, every warning is a known ASTM_FRAME_* code", () => {
    fc.assert(
      fc.property(randomBytes(), (bytes) => {
        try {
          const { warnings } = decodeAstmFrames(bytes);
          assertWarningsWellFormed(warnings);
        } catch (err) {
          assertSanctionedLenient(err);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("control-char-laden near-miss frames never crash", () => {
    fc.assert(
      fc.property(controlLadenBytes(), (bytes) => {
        try {
          const { warnings } = decodeAstmFrames(bytes);
          assertWarningsWellFormed(warnings);
        } catch (err) {
          assertSanctionedLenient(err);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("truncation at every prefix length of a real multi-frame stream never crashes", () => {
    // A valid two-frame record, then decode every truncated prefix — the classic frame/checksum
    // truncation stressor that must always degrade to a warning, never throw (lenient).
    const record = "R|1|^^^687|28.6|U/L||N||F\r";
    const full = Uint8Array.from([
      ...frame(record.slice(0, 12), { fn: 1, kind: "ETB" }),
      ...frame(record.slice(12), { fn: 2, kind: "ETX" }),
    ]);
    fc.assert(
      fc.property(fc.integer({ min: 1, max: full.length }), (len) => {
        const { warnings } = decodeAstmFrames(full.subarray(0, len));
        assertWarningsWellFormed(warnings);
      }),
      { numRuns: full.length },
    );
  });

  it("frames interleaved with noise (deep paths) never crash", () => {
    fc.assert(
      fc.property(framesWithNoise(), (bytes) => {
        try {
          const { warnings } = decodeAstmFrames(bytes);
          assertWarningsWellFormed(warnings);
        } catch (err) {
          assertSanctionedLenient(err);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("fuzz: strict mode only ever throws a sanctioned typed error", () => {
  it("random noise in strict mode throws only AstmFrameStrictError / EMPTY_INPUT", () => {
    fc.assert(
      fc.property(controlLadenBytes(), (bytes) => {
        try {
          decodeAstmFrames(bytes, { strict: true });
        } catch (err) {
          if (err instanceof AstmFrameStrictError) return;
          if (err instanceof AstmParseError && err.code === FATAL_CODES.EMPTY_INPUT) return;
          throw err;
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("fuzz is non-vacuous — the decoder actually engages", () => {
  it("a stream that always contains a well-formed frame yields at least one decoded frame", () => {
    fc.assert(
      fc.property(
        wellFormedFrameBytes(),
        fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 30 }),
        (goodFrame, noise) => {
          // Leading noise (no STX collisions matter — decoder resyncs at the next STX).
          const bytes = Uint8Array.from([...noise.filter((b) => b !== 0x02), ...goodFrame]);
          const { frames } = decodeAstmFrames(bytes);
          expect(frames.length).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("a valid frame's checksum recomputes to the declared value (verify path is real)", () => {
    fc.assert(
      fc.property(
        fc
          .string({ maxLength: 60 })
          .map((s) => [...s].filter((c) => c.charCodeAt(0) > 0x1f).join("")),
        (text) => {
          // fn = 1 is the in-sequence first frame, so a lone frame reassembles cleanly.
          const bytes = Uint8Array.from(frame(text, { fn: 1, kind: "ETX" }));
          const { frames, records } = decodeAstmFrames(bytes);
          expect(frames[0]?.checksum.valid).toBe(true);
          expect(frames[0]?.trusted).toBe(true);
          // Independent recompute of what the builder wrote.
          const span = [0x31, ...[...text].map((c) => c.charCodeAt(0)), 0x03];
          expect(hex2(def(frames[0]).checksum.computed)).toBe(hex2(checksumOf(span)));
          expect(records).toHaveLength(1);
        },
      ),
      { numRuns: 500 },
    );
  });
});
