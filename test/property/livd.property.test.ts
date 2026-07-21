import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { applyLivd, defineLivdCatalog, parseAstmRecords } from "../../src/index.js";
import type { LivdEntry } from "../../src/index.js";

/**
 * The Phase-9 headline safety properties, over arbitrary vendor codes and catalogs.
 * The whole layer exists to hold these — a wrong LOINC mis-identifies a test:
 *
 *   1. NEVER-FABRICATE: any LOINC in an annotation was either on the wire
 *      (inline slot) or present in the catalog for that exact code. The layer
 *      never emits a LOINC from nowhere.
 *   2. ADDITIVE / NEVER-MUTATE: applying LIVD never changes the parsed message.
 *   3. A `mapped` result is always `derived: true` from the catalog; an `unmapped`
 *      or `ambiguous` code never carries a chosen LOINC.
 */

// A safe code alphabet (no ASTM delimiters) so the fixture stays well-formed.
const codeArb = fc.stringMatching(/^[A-Za-z0-9_-]{1,8}$/);
const loincArb = fc.stringMatching(/^[0-9]{1,5}-[0-9]$/);

const entryArb: fc.Arbitrary<LivdEntry> = fc.record({
  vendorCode: codeArb,
  loinc: loincArb,
});

describe("LIVD safety properties", () => {
  it("never fabricates a LOINC: every annotated LOINC is from the wire or the catalog", () => {
    fc.assert(
      fc.property(codeArb, fc.array(entryArb, { maxLength: 12 }), (code, entries) => {
        const catalog = defineLivdCatalog(entries);
        const msg = parseAstmRecords(`H|\\^&\rR|1|^^^${code}|5|U/L||N||F\rL|1\r`);
        const [a] = applyLivd(msg, catalog).annotations;
        if (a === undefined) throw new Error("expected exactly one annotation");
        const m = a.mapping;

        if (m.status === "mapped") {
          expect(m.derived).toBe(true);
          expect(m.source).toBe("livd");
          // The chosen LOINC must be one the catalog actually holds for this code.
          const held = new Set(entries.filter((e) => e.vendorCode === code).map((e) => e.loinc));
          expect(held.has(m.loinc)).toBe(true);
        } else if (m.status === "ambiguous") {
          // Ambiguous surfaces candidates but chooses none; every candidate is a real held LOINC.
          const held = new Set(entries.filter((e) => e.vendorCode === code).map((e) => e.loinc));
          for (const c of m.candidates) expect(held.has(c)).toBe(true);
          expect(m.candidates.length).toBeGreaterThan(1);
        }
        // unmapped / no-code carry no LOINC field at all — structurally impossible to leak one.
      }),
    );
  });

  it("the mapping matches the catalog's own lookup for the reported code", () => {
    fc.assert(
      fc.property(codeArb, fc.array(entryArb, { maxLength: 12 }), (code, entries) => {
        const catalog = defineLivdCatalog(entries);
        const msg = parseAstmRecords(`H|\\^&\rR|1|^^^${code}|5|U/L||N||F\rL|1\r`);
        const [a] = applyLivd(msg, catalog).annotations;
        if (a === undefined) throw new Error("expected exactly one annotation");
        // With a bare local code (no inline slot), the annotation status tracks the raw lookup.
        expect(a.mapping.status).toBe(catalog.lookup(code).status);
      }),
    );
  });

  it("is additive: applying LIVD never mutates the parsed message", () => {
    fc.assert(
      fc.property(codeArb, fc.array(entryArb, { maxLength: 12 }), (code, entries) => {
        const catalog = defineLivdCatalog(entries);
        const msg = parseAstmRecords(`H|\\^&\rR|1|^^^${code}|5|U/L||N||F\rL|1\r`);
        const before = JSON.stringify(msg);
        applyLivd(msg, catalog);
        expect(JSON.stringify(msg)).toBe(before);
      }),
    );
  });

  it("an inline wire LOINC is surfaced from the wire and never overwritten by the catalog", () => {
    fc.assert(
      fc.property(
        loincArb,
        codeArb,
        fc.array(entryArb, { maxLength: 8 }),
        (wireLoinc, code, entries) => {
          const catalog = defineLivdCatalog(entries);
          const msg = parseAstmRecords(
            `H|\\^&\rR|1|${wireLoinc}^Name^LN^${code}|5|U/L||N||F\rL|1\r`,
          );
          const [a] = applyLivd(msg, catalog).annotations;
          if (a === undefined) throw new Error("expected exactly one annotation");
          expect(a.mapping).toEqual({ status: "inline-loinc", loinc: wireLoinc, source: "wire" });
        },
      ),
    );
  });
});
