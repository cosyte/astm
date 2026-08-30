/**
 * Tier-3 golden-file round-trip (roadmap Phase 7). For every synthetic fixture,
 * assert **structural** round-trip through both emit layers:
 *
 *   1. record layer: `parse → serialize → re-parse` reproduces the decoded field
 *      tree (components/repeats) and every typed result view exactly; and
 *   2. framing layer: `serializeFramedAstm → parseFramedAstm` reproduces it too,
 *      with the frame codec vouching for every reassembled record (no warnings).
 *
 * Structural (not byte) equality is the right bar: emit **normalizes** to the
 * canonical delimiters and re-escapes embedded delimiters, so a fixture that used
 * an unknown escape or omitted a trailing `CR` is faithfully preserved in the
 * decoded *values* even when the wire bytes differ. All fixtures are synthetic
 * (declared in `scripts/phi-allow-list.txt`).
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ABNORMAL_FLAG_VOCABULARY,
  RESULT_STATUS_VOCABULARY,
  parseAstmRecords,
  parseFramedAstm,
  serializeAstmRecords,
  serializeFramedAstm,
  type AstmMessage,
} from "../../src/index.js";

const FIXTURE_DIR = join(import.meta.dirname, "..", "fixtures");
const fixtures = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".astm"));

/** The delimiter-independent structural projection of a message: every field's decoded repeat tree. */
function projection(msg: AstmMessage): unknown {
  return msg.records.map((r) => ({
    type: r.type,
    fields: r.fields.map((f) => f.repeats),
  }));
}

describe("Tier-3 golden round-trip (all synthetic fixtures)", () => {
  it("has fixtures to check", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const name of fixtures) {
    const raw = readFileSync(join(FIXTURE_DIR, name), "latin1");
    const original = parseAstmRecords(raw);
    const expected = projection(original);

    it(`${name}: record emit reproduces the decoded field tree`, () => {
      const reparsed = parseAstmRecords(serializeAstmRecords(original));
      expect(projection(reparsed)).toEqual(expected);
    });

    it(`${name}: record emit is idempotent`, () => {
      const once = serializeAstmRecords(original);
      const twice = serializeAstmRecords(parseAstmRecords(once));
      expect(twice).toBe(once);
    });

    it(`${name}: framed emit round-trips through the codec with no frame warnings`, () => {
      const framed = serializeFramedAstm(original);
      const rt = parseFramedAstm(framed);
      expect(rt.frameWarnings).toEqual([]);
      expect(projection(rt.message)).toEqual(expected);
    });
  }
});

/**
 * The vocabulary attribution is **interpretation output only**. It is reported
 * beside a modeled flag or status and must never reach the wire, so the emitted
 * bytes are exactly what they were before the attribution existed. The expected
 * strings below are written out literally rather than derived from the input, so
 * a byte that starts moving reds here.
 */
describe("the vocabulary attribution never reaches the wire", () => {
  const GOLDEN: ReadonlyArray<readonly [string, string, string]> = [
    [
      "recognized flag and status",
      "H|\\^&\rR|1|^^^900|4.2|U/L|3.5-5.0|H||F\rL|1\r",
      "H|\\^&\rR|1|^^^900|4.2|U/L|3.5-5.0|H||F\rL|1\r",
    ],
    [
      "the newly recognized HU",
      "H|\\^&\rR|1|^^^900|9.9|U/L|3.5-5.0|HU||F\rL|1\r",
      "H|\\^&\rR|1|^^^900|9.9|U/L|3.5-5.0|HU||F\rL|1\r",
    ],
    [
      "the newly recognized LU",
      "H|\\^&\rR|1|^^^900|0.1|U/L|3.5-5.0|LU||P\rL|1\r",
      "H|\\^&\rR|1|^^^900|0.1|U/L|3.5-5.0|LU||P\rL|1\r",
    ],
    [
      "an unrecognized flag and status (both warn, neither is rewritten)",
      "H|\\^&\rR|1|^^^900|4.2|U/L|3.5-5.0|QQ||ZZZ\rL|1\r",
      "H|\\^&\rR|1|^^^900|4.2|U/L|3.5-5.0|QQ||ZZZ\rL|1\r",
    ],
    [
      "an absent status stays absent on the wire (never written as F)",
      "H|\\^&\rR|1|^^^900|4.2|U/L|3.5-5.0|N\rL|1\r",
      "H|\\^&\rR|1|^^^900|4.2|U/L|3.5-5.0|N\rL|1\r",
    ],
  ];

  it.each(GOLDEN)("%s: emits byte-identical output", (_label, input, expectedBytes) => {
    expect(serializeAstmRecords(parseAstmRecords(input))).toBe(expectedBytes);
  });

  it.each(GOLDEN)("%s: no identifier, version or attribution text on the wire", (_l, input) => {
    const emitted = serializeAstmRecords(parseAstmRecords(input));
    expect(emitted).not.toContain(ABNORMAL_FLAG_VOCABULARY.system);
    expect(emitted).not.toContain(ABNORMAL_FLAG_VOCABULARY.version);
    expect(emitted).not.toContain(RESULT_STATUS_VOCABULARY.reason);
    expect(emitted).not.toContain("attributed");
    expect(emitted).not.toContain("vocabulary");
  });

  it("no fixture's emitted bytes carry any attribution text either", () => {
    for (const name of fixtures) {
      const raw = readFileSync(join(FIXTURE_DIR, name), "latin1");
      const emitted = serializeAstmRecords(parseAstmRecords(raw));
      expect(emitted).not.toContain(ABNORMAL_FLAG_VOCABULARY.system);
      expect(emitted).not.toContain(RESULT_STATUS_VOCABULARY.reason);
    }
  });
});
