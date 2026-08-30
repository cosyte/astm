import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { applyLivd, defineLivdCatalog, parseAstmRecords, results } from "../../src/index.js";
import type { LivdEntry } from "../../src/index.js";

/**
 * The Phase-9 headline safety properties, over arbitrary vendor codes and catalogs.
 * The whole layer exists to hold these, a wrong LOINC mis-identifies a test:
 *
 *   1. NEVER-FABRICATE: any LOINC in an annotation is one the catalog held for
 *      that exact vendor code. The layer never emits a LOINC from nowhere, and
 *      never promotes a value the wire carried into one.
 *   2. ADDITIVE / NEVER-MUTATE: applying LIVD never changes the parsed message.
 *   3. A `mapped` result is always `derived: true` from the catalog; an `unmapped`
 *      or `ambiguous` code never carries a chosen LOINC.
 *   4. A populated first component never changes the lookup outcome: the catalog is
 *      consulted with the vendor code alone, and the wire value rides alongside as
 *      an unvalidated value the library does not vouch for.
 *   5. ONE ANSWER, NEVER TWO: no catalog and record can ever yield two distinct
 *      LOINCs for one lookup. A record has exactly one annotation, that annotation
 *      names at most one LOINC, and an unsettled ambiguity names none as the ANSWER
 *      however many candidates it surfaces. That last part is asserted on the
 *      answer's own SHAPE (a closed set of allowed fields), never by searching its
 *      JSON for the token `"loinc"`: a refusal surfaces every candidate WITH its
 *      LOINC, so that token is present by design, and a search for it cannot tell a
 *      surfaced candidate from a chosen answer.
 *   6. A UNIT-SELECTED ANSWER'S UNIT IS THE RECORD'S: wherever a lookup reports that
 *      the units chose the LOINC, the chosen candidate's representative unit is
 *      byte-identical to the units that record reported. Verbatim, case sensitive,
 *      and never a UCUM semantic comparison.
 */

// A safe code alphabet (no ASTM delimiters) so the fixture stays well-formed.
const codeArb = fc.stringMatching(/^[A-Za-z0-9_-]{1,8}$/);
const loincArb = fc.stringMatching(/^[0-9]{1,5}-[0-9]$/);

const entryArb: fc.Arbitrary<LivdEntry> = fc.record({
  vendorCode: codeArb,
  loinc: loincArb,
});

/**
 * Unit spellings a record or a catalog can carry, delimiter-free so the fixture stays
 * well-formed. Deliberately includes case variants of one another, leading and
 * trailing whitespace, an empty string and a whitespace-only string, because those are
 * exactly the pairs a verbatim comparison must NOT treat as equal (and the blanks are
 * the ones that are not units at all).
 */
const unitArb = fc.constantFrom(
  "mg/dL",
  "MG/DL",
  " mg/dL",
  "mg/dL ",
  "mmol/L",
  "mmol/(24.h)",
  "U/L",
  "g/L",
  "10*3/uL",
  "",
  "   ",
);

/** An entry that may or may not be unit qualified, built without an explicit `undefined`. */
const unitEntryArb: fc.Arbitrary<LivdEntry> = fc
  .record({
    vendorCode: codeArb,
    loinc: loincArb,
    unit: fc.option(unitArb, { nil: undefined }),
  })
  .map(({ vendorCode, loinc, unit }) => ({
    vendorCode,
    loinc,
    ...(unit !== undefined ? { representativeUnit: unit } : {}),
  }));

/** One vendor code every generated row shares, so several candidates actually collide. */
const SHARED_CODE = "SHARED";

/**
 * Every field an `ambiguous` answer is allowed to carry. Not one of them names a
 * CHOSEN LOINC, so the closed set IS the never-chose assertion, and it is stricter
 * than naming the fields to forbid: a future field that named a choice fails this
 * property whatever it is called.
 */
const AMBIGUOUS_FIELDS: ReadonlySet<string> = new Set([
  "status",
  "candidates",
  "candidateDetails",
  "reason",
]);

/** A row for that one code: the shape that makes unit selection reachable at all. */
const sharedRowArb = fc
  .record({
    loinc: loincArb,
    unit: fc.option(unitArb, { nil: undefined }),
    specimen: fc.option(fc.constantFrom("Serum or Plasma", "Urine", "Whole blood"), {
      nil: undefined,
    }),
  })
  .map(({ loinc, unit, specimen }) => ({
    loinc,
    ...(unit !== undefined ? { representativeUnit: unit } : {}),
    ...(specimen !== undefined ? { vendorSpecimenDescription: specimen } : {}),
  }));

/** A one-record `R` stream carrying a vendor local code and a units field. */
function streamOf(code: string, units: string): string {
  return `H|\\^&\rR|1|^^^${code}|5.5|${units}||N||F\rL|1\r`;
}

describe("LIVD safety properties", () => {
  it("never fabricates a LOINC: every annotated LOINC is one the catalog held", () => {
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
        // unmapped / no-code carry no LOINC field at all: structurally impossible to leak one.
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

  it("a wire value in component 1 never displaces the catalog and is never a LOINC", () => {
    fc.assert(
      fc.property(
        loincArb,
        codeArb,
        fc.array(entryArb, { maxLength: 8 }),
        (wireValue, code, entries) => {
          const catalog = defineLivdCatalog(entries);
          const msg = parseAstmRecords(
            `H|\\^&\rR|1|${wireValue}^Name^LN^${code}|5|U/L||N||F\rL|1\r`,
          );
          const [a] = applyLivd(msg, catalog).annotations;
          if (a === undefined) throw new Error("expected exactly one annotation");
          // The lookup outcome is the catalog's, for the vendor code, whatever the
          // wire put in component 1, and the wire value is never promoted.
          expect(a.mapping.status).toBe(catalog.lookup(code).status);
          expect(a.reportedCode).toBe(code);
          expect(a.unvalidatedWireValue).toBe(wireValue);
          if (a.mapping.status === "mapped") {
            const held = new Set(entries.filter((e) => e.vendorCode === code).map((e) => e.loinc));
            expect(held.has(a.mapping.loinc)).toBe(true);
            // The fact is the byte difference between the two, and nothing more.
            expect(a.wireValueDisagreesWithCatalog).toBe(wireValue !== a.mapping.loinc);
          } else {
            // The catalog vouched for no single LOINC, so there is no disagreement.
            expect(a.wireValueDisagreesWithCatalog).toBe(false);
          }
        },
      ),
    );
  });

  it("one lookup yields at most one LOINC, over arbitrary catalogs and units", () => {
    fc.assert(
      fc.property(
        codeArb,
        unitArb,
        fc.array(unitEntryArb, { maxLength: 12 }),
        (code, units, entries) => {
          const catalog = defineLivdCatalog(entries);
          const msg = parseAstmRecords(streamOf(code, units));
          const { annotations } = applyLivd(msg, catalog);
          // One record, so one annotation: a record is never annotated twice, which is
          // the other way two LOINCs could reach a consumer for one lookup.
          expect(annotations).toHaveLength(1);
          const [a] = annotations;
          if (a === undefined) throw new Error("expected exactly one annotation");
          const m = a.mapping;

          // At most one LOINC is ever named as the answer, and an unsettled ambiguity
          // names none however many candidates it surfaces.
          const chosen = m.status === "mapped" ? [m.loinc] : [];
          expect(chosen.length).toBeLessThanOrEqual(1);
          if (m.status === "ambiguous") {
            // No field of the refusal names a chosen LOINC, asserted as a closed set
            // over the answer's own keys. A surfaced candidate carries its own `loinc`
            // because "every candidate surfaced" requires it, so the answer's JSON
            // legitimately holds that token and a string search cannot separate the
            // two. The key set can, and forbids `unitComparison` here too: nothing was
            // selected on a unit.
            const fields = Object.keys(m);
            expect(fields.filter((k) => !AMBIGUOUS_FIELDS.has(k))).toEqual([]);
            expect(fields).not.toContain("loinc");
            expect(fields).not.toContain("unitComparison");
            expect(m.candidates.length).toBeGreaterThan(1);
            // Every candidate is a LOINC the catalog really holds for this code, and
            // every LOINC named deeper in the answer is one of those candidates, so no
            // LOINC reaches a consumer through a refusal by any route.
            const held = new Set(entries.filter((e) => e.vendorCode === code).map((e) => e.loinc));
            for (const c of m.candidates) expect(held.has(c)).toBe(true);
            for (const d of m.candidateDetails ?? []) expect(m.candidates).toContain(d.loinc);
          }
          // And the annotation's disposition is the catalog's own for that code and
          // those units: nothing between the two re-decides it.
          expect(m.status).toBe(catalog.lookup(code, units).status);
        },
      ),
    );
  });

  it("a unit-selected answer's representative unit equals the units the record reported", () => {
    let selections = 0;
    fc.assert(
      fc.property(
        unitArb,
        fc.array(sharedRowArb, { minLength: 1, maxLength: 6 }),
        (units, rows) => {
          const entries = rows.map((r) => ({ vendorCode: SHARED_CODE, ...r }));
          const catalog = defineLivdCatalog(entries);
          const msg = parseAstmRecords(streamOf(SHARED_CODE, units));
          const [a] = applyLivd(msg, catalog).annotations;
          if (a === undefined) throw new Error("expected exactly one annotation");
          const m = a.mapping;
          if (m.status !== "mapped" || m.unitComparison === undefined) return;

          selections += 1;
          // What the record actually reported, read back off the parsed record rather
          // than off the string that produced it.
          const reported = results(msg)[0]?.units;
          expect(m.unitComparison.reportedUnits).toBe(reported);
          expect(m.unitComparison.representativeUnit).toBe(reported);
          expect(m.representativeUnit).toBe(reported);
          // The disclosure never varies: verbatim, case sensitive, not UCUM semantic.
          expect(m.unitComparison.comparison).toBe("verbatim-case-sensitive");
          expect(m.unitComparison.ucumSemantic).toBe(false);
          // And the catalog really holds that LOINC at that exact unit.
          expect(
            entries.some(
              (e) =>
                e.loinc === m.loinc &&
                e.representativeUnit === reported &&
                (e.representativeUnit ?? "").trim() !== "",
            ),
          ).toBe(true);
        },
      ),
    );
    // A vacuous run would satisfy the property above without ever selecting on a unit.
    expect(selections).toBeGreaterThan(0);
  });

  it("the wire value in component 1 is never a lookup key", () => {
    fc.assert(
      fc.property(loincArb, fc.array(entryArb, { maxLength: 8 }), (wireValue, entries) => {
        // A catalog that WOULD answer for the wire value, and a record with no
        // vendor code: the key is the vendor transmission code alone, so nothing
        // is looked up and no LOINC is reported.
        const catalog = defineLivdCatalog([...entries, { vendorCode: wireValue, loinc: "1920-8" }]);
        const msg = parseAstmRecords(`H|\\^&\rR|1|${wireValue}|5|U/L||N||F\rL|1\r`);
        const [a] = applyLivd(msg, catalog).annotations;
        if (a === undefined) throw new Error("expected exactly one annotation");
        expect(a.mapping).toEqual({ status: "no-vendor-code" });
        expect(a.reportedCode).toBeUndefined();
        expect(a.unvalidatedWireValue).toBe(wireValue);
        expect(a.wireValueDisagreesWithCatalog).toBe(false);
      }),
    );
  });
});
