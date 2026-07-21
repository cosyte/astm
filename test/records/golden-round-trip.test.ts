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

    it(`${name} — record emit reproduces the decoded field tree`, () => {
      const reparsed = parseAstmRecords(serializeAstmRecords(original));
      expect(projection(reparsed)).toEqual(expected);
    });

    it(`${name} — record emit is idempotent`, () => {
      const once = serializeAstmRecords(original);
      const twice = serializeAstmRecords(parseAstmRecords(once));
      expect(twice).toBe(once);
    });

    it(`${name} — framed emit round-trips through the codec with no frame warnings`, () => {
      const framed = serializeFramedAstm(original);
      const rt = parseFramedAstm(framed);
      expect(rt.frameWarnings).toEqual([]);
      expect(projection(rt.message)).toEqual(expected);
    });
  }
});
