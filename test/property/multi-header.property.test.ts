/**
 * Property: **messages in one stream do not interfere.**
 *
 * A message runs `H` … `L` and each header declares the delimiters for the records that follow it,
 * so concatenating two messages must not change how either one reads — whatever delimiter sets they
 * declare. This is the invariant the forward-scoping decision rests on: a redeclaration governs the
 * records after it and never reinterprets bytes already consumed, so `parse(a + b)` must agree
 * record-for-record with `parse(a)` followed by `parse(b)`.
 *
 * The counterexample this pins shipped from `0.0.1` through `0.0.3`: with the whole stream read
 * under the first header's set, every record of `b` collapsed into one field.
 *
 * All generated content is synthetic — values are drawn from a fixed alphabet, never real data.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { parseAstmRecords, type AstmMessage } from "../../src/index.js";

/**
 * Candidate delimiter characters. Disjoint from {@link VALUE_CHARS}, so a generated value can never
 * accidentally contain a delimiter and force an escape — this property is about scoping, not escaping.
 */
const DELIM_CHARS = "|\\^&*~:#@!%+=";
const VALUE_CHARS = "ABCXYZ0123456789.-/";

/** Four distinct delimiter characters: field, repeat, component, escape. */
const delimiterSet = fc
  .uniqueArray(fc.constantFrom(...DELIM_CHARS.split("")), { minLength: 4, maxLength: 4 })
  .map(([field, repeat, component, escape]) => ({
    field: field as string,
    repeat: repeat as string,
    component: component as string,
    escape: escape as string,
  }));

const value = fc.stringMatching(
  new RegExp(`^[${VALUE_CHARS.replace(/[\\\-/]/gu, "\\$&")}]{0,6}$`, "u"),
);

/** A synthetic `H` … `L` message written in `d`. */
function buildMessage(
  d: { field: string; repeat: string; component: string; escape: string },
  rows: readonly (readonly string[])[],
): string {
  const header = `H${d.field}${d.repeat}${d.component}${d.escape}${d.field}${d.field}sender`;
  const body = rows.map(
    (cells, i) => `R${d.field}${String(i + 1)}${d.field}${cells.join(d.field)}`,
  );
  return [header, ...body, `L${d.field}1${d.field}N`].map((l) => `${l}\r`).join("");
}

/** The delimiter-independent shape of a parse: each record's type and its raw field texts. */
function shape(msg: AstmMessage): unknown {
  return msg.records.map((r) => ({ type: r.type, fields: r.fields.map((f) => f.raw) }));
}

const rows = fc.array(fc.array(value, { minLength: 1, maxLength: 4 }), {
  minLength: 1,
  maxLength: 3,
});

describe("messages in one stream do not interfere", () => {
  it("parses a concatenation exactly as it parses each message alone", () => {
    fc.assert(
      fc.property(delimiterSet, delimiterSet, rows, rows, (d1, d2, rowsA, rowsB) => {
        const a = buildMessage(d1, rowsA);
        const b = buildMessage(d2, rowsB);
        const combined = shape(parseAstmRecords(a + b));
        const separate = [
          ...(shape(parseAstmRecords(a)) as unknown[]),
          ...(shape(parseAstmRecords(b)) as unknown[]),
        ];
        expect(combined).toEqual(separate);
      }),
      { numRuns: Number(process.env["ASTM_FUZZ_RUNS"] ?? 300) },
    );
  });

  it("never merges a following message's fields, whatever the two sets are", () => {
    fc.assert(
      fc.property(delimiterSet, delimiterSet, rows, (d1, d2, rowsB) => {
        const stream = buildMessage(d1, [["A"]]) + buildMessage(d2, rowsB);
        const msg = parseAstmRecords(stream);
        // Every `R` in the second message models the cells it was written with, rather than
        // collapsing into a single field.
        const second = msg.records.slice(3);
        const rRecords = second.filter((r) => r.type === "R");
        expect(rRecords).toHaveLength(rowsB.length);
        rRecords.forEach((r, i) => {
          expect(r.fields).toHaveLength((rowsB[i]?.length ?? 0) + 2);
        });
      }),
      { numRuns: Number(process.env["ASTM_FUZZ_RUNS"] ?? 300) },
    );
  });
});
