/**
 * Property-based conformance for the frame codec's headline safety claim:
 * **reassembling an N-frame record equals the single-frame form.** For arbitrary
 * record text, framing it whole (one `ETX` frame) and framing it split across many
 * `ETB`…`ETX` frames (each ≤ 240 bytes, correctly sequenced) must decode to
 * byte-identical reassembled record bytes — and a correctly-sequenced,
 * correctly-checksummed multi-frame stream must decode with **zero** warnings.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { decodeAstmFrames } from "../../src/index.js";
import { def, frame } from "../frames/_frame-builder.js";

const MAX_TEXT = 240;

/** Record text with no frame-control bytes, so it splits cleanly into frame payloads. */
function recordText(): fc.Arbitrary<string> {
  return fc
    .array(fc.integer({ min: 0x20, max: 0x7e }), { minLength: 1, maxLength: 900 })
    .map((codes) => codes.map((c) => String.fromCharCode(c)).join(""));
}

/** Split text into ≤ `size`-byte chunks and frame them as ETB…ETX with sequence numbers from 1. */
function splitIntoFrames(text: string, size: number): Uint8Array {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  if (chunks.length === 0) chunks.push("");
  const parts = chunks.map((chunk, idx) =>
    frame(chunk, {
      fn: (idx + 1) % 8, // starts at 1, rolls over 7 → 0
      kind: idx === chunks.length - 1 ? "ETX" : "ETB",
    }),
  );
  return Uint8Array.from(parts.flat());
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe("frame reassembly properties", () => {
  it("N-frame reassembly equals the single-frame form (any split size)", () => {
    fc.assert(
      fc.property(recordText(), fc.integer({ min: 1, max: MAX_TEXT }), (text, size) => {
        const single = decodeAstmFrames(Uint8Array.from(frame(text, { fn: 1, kind: "ETX" })));
        const multi = decodeAstmFrames(splitIntoFrames(text, size));

        // The single form is oversize when text > 240 (one frame), so compare records, not warnings.
        expect(single.records).toHaveLength(1);
        expect(multi.records).toHaveLength(1);
        expect(bytesEqual(def(multi.records[0]), def(single.records[0]))).toBe(true);
      }),
      { numRuns: 800 },
    );
  });

  it("a correctly-sequenced multi-frame stream (chunks ≤ 240) decodes with zero warnings", () => {
    fc.assert(
      fc.property(recordText(), fc.integer({ min: 1, max: MAX_TEXT }), (text, size) => {
        const { records, warnings } = decodeAstmFrames(splitIntoFrames(text, size));
        expect(warnings).toEqual([]); // no gap, no bad checksum, no oversize (chunks ≤ 240)
        expect(records).toHaveLength(1);
      }),
      { numRuns: 800 },
    );
  });

  it("every trusted frame's recomputed checksum matches its declared checksum", () => {
    fc.assert(
      fc.property(recordText(), fc.integer({ min: 1, max: MAX_TEXT }), (text, size) => {
        const { frames } = decodeAstmFrames(splitIntoFrames(text, size));
        for (const f of frames) {
          expect(f.trusted).toBe(true);
          expect(f.checksum.valid).toBe(true);
          expect(f.checksum.declared).toBe(f.checksum.computed);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("the decoded result and its frames reject mutation (immutable views)", () => {
    fc.assert(
      fc.property(recordText(), (text) => {
        const result = decodeAstmFrames(Uint8Array.from(frame(text, { fn: 1, kind: "ETX" })));
        // The arrays are frozen; a push must throw or be a no-op that does not grow them.
        const before = result.frames.length;
        expect(() => (result.frames as unknown[]).push({})).toThrow();
        expect(result.frames.length).toBe(before);
      }),
      { numRuns: 200 },
    );
  });
});
