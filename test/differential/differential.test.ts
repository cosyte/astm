/**
 * Differential conformance test against **python-astm** — the BSD-licensed reference ASTM/CLSI-LIS02
 * codec (https://github.com/kxepal/python-astm, commit `4170ce0c`). This is the advantage the
 * roadmap calls out (§6): a permissively-licensed reference corpus exists, so `@cosyte/astm` can be
 * differentially tested against a second, independent implementation — not just against its own
 * fixtures.
 *
 * The reference outputs in `reference-vectors.json` were captured **firsthand** from python-astm by
 * `generate-reference-vectors.py` (no reference code is vendored — only its outputs, once, pinned to a
 * commit). This suite runs `@cosyte/astm` over the same inputs and asserts agreement on the paths the
 * two implementations share, then asserts the places we are **deliberately stricter** — where a naive
 * codec silently produces a wrong value and we do not.
 *
 * Three agreement corpora:
 *  1. **Checksum** — the modulo-256 frame checksum over identical spans. The single most
 *     safety-critical byte-level computation; a wrong checksum means a corrupted value is trusted or a
 *     clean one rejected.
 *  2. **Record field/component split** — the tokenizer's `|`/`\`/`^` splitting on escape-free,
 *     non-header records (the paths both codecs implement identically).
 *  3. **Cross-implementation frame decode** — python-astm *encodes and splits* a record into frames;
 *     our decoder verifies every checksum, follows the frame sequence, and **reassembles the exact
 *     original bytes**. Encode/decode agreement across two implementations, grounded firsthand.
 *
 * And the documented divergences (our correctness edge): escape decoding, the header delimiter
 * declaration, and — separately — checksum validation and `Q` support that python-astm omits.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CANONICAL_DELIMITERS,
  computeChecksum,
  decodeAstmFrames,
  parseAstmRecords,
  results,
  tokenizeRecord,
  toChecksumHex,
} from "../../src/index.js";

interface ReferenceVectors {
  readonly _provenance: {
    readonly reference: string;
    readonly referenceCommit: string;
    readonly license: string;
    readonly encoding: string;
  };
  readonly checksums: ReadonlyArray<{ readonly spanHex: string; readonly checksum: string }>;
  readonly records: ReadonlyArray<{ readonly line: string; readonly fields: string[][][] }>;
  readonly splits: ReadonlyArray<{
    readonly textHex: string;
    readonly size: number;
    readonly chunksHex: readonly string[];
  }>;
}

const here = dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(
  readFileSync(join(here, "reference-vectors.json"), "utf8"),
) as ReferenceVectors;

/** latin1 hex → bytes (the wire encoding python-astm uses). */
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** latin1 bytes → string. */
function bytesToLatin1(bytes: Iterable<number>): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

describe("differential vs python-astm — provenance", () => {
  it("captures the pinned reference commit and license", () => {
    expect(vectors._provenance.reference).toBe("kxepal/python-astm");
    expect(vectors._provenance.referenceCommit).toBe("4170ce0c56567298e55b797d22357d9437087f94");
    expect(vectors._provenance.license).toBe("BSD-3-Clause");
    // Non-vacuity: the corpora are actually populated.
    expect(vectors.checksums.length).toBeGreaterThan(0);
    expect(vectors.records.length).toBeGreaterThan(0);
    expect(vectors.splits.length).toBeGreaterThan(0);
  });
});

describe("differential vs python-astm — modulo-256 checksum agreement", () => {
  it.each(vectors.checksums)(
    "checksum of span %#: our computeChecksum === python make_checksum",
    (c) => {
      const bytes = hexToBytes(c.spanHex);
      // python's make_checksum sums every byte of the span; our computeChecksum sums [start, endInclusive].
      const ours = toChecksumHex(computeChecksum(bytes, 0, bytes.length - 1));
      expect(ours).toBe(c.checksum);
    },
  );
});

describe("differential vs python-astm — record field/component split agreement", () => {
  it.each(vectors.records)("splits $line identically to decode_record", (rec) => {
    const fields = tokenizeRecord(rec.line, CANONICAL_DELIMITERS);
    // Normalize our fields to the same repeats[components[str]] shape the reference captured.
    const ours = fields.map((f) => f.repeats.map((rep) => rep.map((c) => c)));
    expect(ours).toEqual(rec.fields);
  });
});

describe("differential vs python-astm — cross-implementation frame decode", () => {
  it.each(vectors.splits)(
    "python encodes+splits (size $size) → our decoder reassembles the exact record and every checksum agrees",
    (s) => {
      const stream = hexToBytes(s.chunksHex.join(""));
      const { records, frames, warnings } = decodeAstmFrames(stream);

      // No frame-layer complaint: our checksum-verify agrees with python's checksum-emit, and the
      // frame sequence python numbered is the one we expect.
      expect(warnings).toEqual([]);
      expect(frames.length).toBe(s.chunksHex.length);
      expect(frames.every((f) => f.trusted)).toBe(true);

      // The reassembled record bytes equal python's original input text exactly.
      const reassembled = bytesToLatin1(
        records.reduce<number[]>((acc, r) => {
          acc.push(...r);
          return acc;
        }, []),
      );
      expect(reassembled).toBe(bytesToLatin1(hexToBytes(s.textHex)));

      // Independent per-chunk checksum agreement (STX FN … term CS CS CR LF → span is [1, len-5]).
      for (const chunkHex of s.chunksHex) {
        const b = hexToBytes(chunkHex);
        const ours = toChecksumHex(computeChecksum(b, 1, b.length - 5));
        const theirs = String.fromCharCode(b[b.length - 4] ?? 0, b[b.length - 3] ?? 0);
        expect(ours).toBe(theirs);
      }
    },
  );
});

describe("differential vs python-astm — where @cosyte/astm is deliberately stricter", () => {
  it("un-escapes an embedded &S& that python-astm leaves literal (the silent-misread fix)", () => {
    // python-astm has no escape decode: `Some&S&Note` stays literal, and were it a value carrying an
    // escaped component delimiter it would mis-split downstream. We un-escape BEFORE splitting, so the
    // value reads as one component with a real `^`.
    const line = "R|1|^^^687|Some&S&Note|U/L";
    const fields = tokenizeRecord(line, CANONICAL_DELIMITERS);
    // Field 3 (the R-record value) is a single component with the escape resolved to `^`.
    expect(fields[3]?.components).toEqual(["Some^Note"]);
    // python-astm (reference) leaves it literal — recorded here as the known divergence.
    expect(fields[3]?.components).not.toEqual(["Some&S&Note"]);
  });

  it("validates the frame checksum python-astm computes but does not verify on decode", () => {
    // A single ETX frame whose declared checksum is deliberately wrong. python-astm decode_frame does
    // not verify the checksum; we flag the frame untrusted and never merge it into a record.
    const good = decodeAstmFrames(
      Uint8Array.from([0x02, 0x31, 0x4c, 0x7c, 0x31, 0x0d, 0x03, 0x33, 0x41, 0x0d, 0x0a]),
    );
    expect(good.frames[0]?.checksum.valid).toBe(true);

    const bad = decodeAstmFrames(
      // same frame, checksum "00" instead of the correct "3A"
      Uint8Array.from([0x02, 0x31, 0x4c, 0x7c, 0x31, 0x0d, 0x03, 0x30, 0x30, 0x0d, 0x0a]),
    );
    expect(bad.frames[0]?.checksum.valid).toBe(false);
    expect(bad.frames[0]?.trusted).toBe(false);
    expect(bad.records).toHaveLength(0); // never merged
    expect(bad.warnings.map((w) => w.code)).toContain("ASTM_FRAME_BAD_CHECKSUM");
  });

  it("classifies a Q-bearing message as a host-query — a record type python-astm has no model for", () => {
    const msg = parseAstmRecords("H|\\^&\rP|1\rQ|1|^SPEC-7|^SPEC-7|ALL\rL|1\r");
    expect(msg.classification.kind).toBe("host-query");
    // And a Q message is never read as a result set.
    expect(results(msg)).toHaveLength(0);
  });
});
