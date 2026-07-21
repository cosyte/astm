/**
 * Property-based conformance for the LTP protocol reducer's headline claims:
 *
 * 1. **The reducer never emits `ACK` after a bad-checksum (untrusted) frame** — the
 *    ACK-failsafe. For any reachable transfer state and any untrusted frame, the
 *    only control action is `sendNak`, the record set does not grow, and the
 *    sequence counter does not advance.
 * 2. **A full `ENQ → frames → EOT` session reassembles the right records** — for any
 *    list of records framed with a continuous frame-number sequence, folding
 *    `[enq, ...frames, eot]` through the reducer yields exactly the source record
 *    bytes (byte-for-byte), in order.
 * 3. **A raw-TCP stream yields the same records as its framed twin** — concatenating
 *    the reducer's reassembled records equals the raw (de-framed) byte stream a
 *    cobas-b121-style peer would have sent, which `detectFraming` classifies as raw.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { detectFraming, ltpInitialState, ltpReduce } from "../../src/index.js";
import type { AstmFrame, LtpEvent } from "../../src/index.js";
import { frameOf, runSession, concatBytes, bytesEqual } from "../ltp/_events.js";

/** Safe record text: printable ASCII with no frame-control bytes, leading with a record letter. */
function recordText(): fc.Arbitrary<string> {
  const letter = fc.constantFrom(..."HPORCQMSL");
  const body = fc
    .array(fc.integer({ min: 0x20, max: 0x7e }), { minLength: 0, maxLength: 60 })
    .map((codes) => codes.map((c) => String.fromCharCode(c)).join(""));
  return fc.tuple(letter, body).map(([l, b]) => l + b);
}

/** A trusted, untrusted-checksum frame for the failsafe property. */
function untrustedFrame(): fc.Arbitrary<AstmFrame> {
  return fc
    .tuple(
      recordText(),
      fc.integer({ min: 0, max: 7 }),
      fc.constantFrom<"ETB" | "ETX">("ETB", "ETX"),
    )
    .map(([text, fn, kind]) => frameOf(text, { fn, kind, forceChecksum: 0xff }))
    .filter((f) => !f.trusted);
}

/**
 * Frame a list of records with a **continuous** frame-number sequence starting at 1
 * and a bounded per-frame split size, returning the frame events plus the source
 * record bytes.
 */
function frameRecords(
  records: readonly string[],
  size: number,
): { events: LtpEvent[]; sources: Uint8Array[] } {
  const events: LtpEvent[] = [];
  const sources: Uint8Array[] = [];
  let fn = 1;
  for (const rec of records) {
    const chunks: string[] = [];
    for (let i = 0; i < rec.length; i += size) chunks.push(rec.slice(i, i + size));
    if (chunks.length === 0) chunks.push("");
    chunks.forEach((chunk, idx) => {
      const kind = idx === chunks.length - 1 ? "ETX" : "ETB";
      events.push({ type: "frame", frame: frameOf(chunk, { fn, kind }) });
      fn = (fn + 1) % 8;
    });
    sources.push(new TextEncoder().encode(rec));
  }
  return { events, sources };
}

describe("LTP reducer properties", () => {
  it("never emits ACK after an untrusted (bad-checksum) frame", () => {
    fc.assert(
      fc.property(untrustedFrame(), (frame) => {
        const state = ltpReduce(ltpInitialState(), { type: "enq" }).state;
        const step = ltpReduce(state, { type: "frame", frame });
        expect(step.actions.map((a) => a.type)).toEqual(["sendNak"]);
        expect(step.state.records).toHaveLength(0);
        expect(step.state.expectedFrame).toBe(state.expectedFrame); // never advanced
      }),
    );
  });

  it("a full ENQ → frames → EOT session reassembles exactly the source records", () => {
    fc.assert(
      fc.property(
        fc.array(recordText(), { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 1, max: 240 }),
        (records, size) => {
          const { events, sources } = frameRecords(records, size);
          const { state } = runSession([{ type: "enq" }, ...events, { type: "eot" }]);
          expect(state.phase).toBe("neutral"); // EOT returned us to neutral
          expect(state.records).toHaveLength(sources.length);
          state.records.forEach((rec, i) => {
            expect(bytesEqual(rec, sources[i] ?? new Uint8Array(0))).toBe(true);
          });
        },
      ),
    );
  });

  it("a raw-TCP stream equals its framed twin, and detects as raw", () => {
    fc.assert(
      fc.property(
        fc.array(recordText(), { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 1, max: 240 }),
        (records, size) => {
          const { events, sources } = frameRecords(records, size);
          const { state } = runSession([{ type: "enq" }, ...events, { type: "eot" }]);
          const framedReassembled = concatBytes(state.records);
          const rawTwin = concatBytes(sources); // what a cobas b121 streams directly

          expect(bytesEqual(framedReassembled, rawTwin)).toBe(true);
          // The raw twin leads with a record letter, so the detector routes it to the record parser.
          expect(detectFraming(rawTwin).framing).toBe("raw");
        },
      ),
    );
  });
});
