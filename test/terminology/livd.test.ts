import { describe, expect, it } from "vitest";

import {
  applyLivd,
  defineLivdCatalog,
  lookupLivdForRecord,
  parseAstmRecords,
  results,
  orders,
  LIVD_WARNING_CODES,
} from "../../src/index.js";
import type { LivdAnnotation, LivdCatalog, LivdLookup, LivdMapping } from "../../src/index.js";

/**
 * Phase-9 LIVD-aware LOINC recognition. The safety-critical contract: an additive,
 * advisory annotation layer that maps a consumer-supplied vendor-code → LOINC and
 * **never** guesses a LOINC (a wrong LOINC mis-identifies a test), never mutates
 * the raw reported code/value, and bundles no terminology data.
 */

const catalog: LivdCatalog = defineLivdCatalog([
  { vendorCode: "687", loinc: "1920-8", loincLongName: "Aspartate aminotransferase" },
  { vendorCode: "690", loinc: "1742-6", loincLongName: "Alanine aminotransferase" },
  // Two rows agreeing on the same LOINC: a consistent duplicate, still a single hit.
  { vendorCode: "700", loinc: "2345-7" },
  { vendorCode: "700", loinc: "2345-7", model: "cobas c311" },
  // Two rows disagreeing: an ambiguous code the layer must refuse to resolve.
  { vendorCode: "800", loinc: "2160-0" },
  { vendorCode: "800", loinc: "38483-4" },
]);

describe("defineLivdCatalog", () => {
  it("indexes distinct vendor codes (not input rows)", () => {
    // 6 rows, 4 distinct vendor codes: 687, 690, 700 (x2), 800 (x2).
    expect(catalog.size).toBe(4);
  });

  it("maps a single-LOINC code", () => {
    expect(catalog.lookup("687")).toEqual({
      status: "mapped",
      loinc: "1920-8",
      loincLongName: "Aspartate aminotransferase",
    });
  });

  it("treats consistent duplicates as one mapped hit", () => {
    expect(catalog.lookup("700")).toEqual({ status: "mapped", loinc: "2345-7" });
  });

  it("refuses to choose between conflicting LOINCs (ambiguous, never guessed)", () => {
    const r = catalog.lookup("800");
    expect(r.status).toBe("ambiguous");
    if (r.status === "ambiguous") {
      expect([...r.candidates].sort()).toEqual(["2160-0", "38483-4"]);
    }
  });

  it("returns unmapped on a miss: never a fabricated LOINC", () => {
    expect(catalog.lookup("999")).toEqual({ status: "unmapped" });
  });

  it("matches verbatim (case-sensitive, no normalization)", () => {
    expect(catalog.lookup(" 687").status).toBe("unmapped");
  });
});

describe("applyLivd: additive LOINC annotation", () => {
  it("maps a local vendor code via the catalog, labeled derived", () => {
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
    const { annotations, warnings } = applyLivd(msg, catalog);
    expect(warnings).toEqual([]);
    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toMatchObject({
      recordType: "R",
      reportedCode: "687",
      provenance: "local-code",
      mapping: {
        status: "mapped",
        loinc: "1920-8",
        loincLongName: "Aspartate aminotransferase",
        source: "livd",
        derived: true,
      },
    });
  });

  it("consults the catalog for the vendor local code even when component 1 is populated", () => {
    // Component 1 populated AND a local code present: the local code is what the
    // catalog is consulted with, and the component 1 value rides along as a wire
    // value this library does not vouch for.
    const msg = parseAstmRecords("H|\\^&\rR|1|1234-5^Gluc^LN^687|5|mmol/L||N||F\rL|1\r");
    const [a] = applyLivd(msg, catalog).annotations;
    expect(a?.mapping).toMatchObject({ status: "mapped", loinc: "1920-8", derived: true });
    expect(a?.reportedCode).toBe("687");
    expect(a?.unvalidatedWireValue).toBe("1234-5");
  });

  it("flags an unmapped code as unmapped + a value-free warning: no guessed LOINC", () => {
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^999|5|U/L||N||F\rL|1\r");
    const { annotations, warnings } = applyLivd(msg, catalog);
    expect(annotations[0]?.mapping).toEqual({ status: "unmapped" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(LIVD_WARNING_CODES.ASTM_LIVD_UNMAPPED_CODE);
    // The warning is value-free: position only, no code, no value, no LOINC.
    expect(warnings[0]?.position).toEqual({ recordIndex: 1, recordType: "R" });
    expect(JSON.stringify(warnings[0])).not.toContain("999");
  });

  it("flags an ambiguous code as ambiguous + a warning: never one chosen", () => {
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^800|5|U/L||N||F\rL|1\r");
    const { annotations, warnings } = applyLivd(msg, catalog);
    expect(annotations[0]?.mapping.status).toBe("ambiguous");
    expect(warnings[0]?.code).toBe(LIVD_WARNING_CODES.ASTM_LIVD_AMBIGUOUS_MAPPING);
  });

  it("reports no-code when the record carries no usable test code", () => {
    const msg = parseAstmRecords("H|\\^&\rR|1||5|U/L||N||F\rL|1\r");
    const { annotations, warnings } = applyLivd(msg, catalog);
    expect(annotations[0]?.mapping).toEqual({ status: "no-code" });
    expect(annotations[0]?.reportedCode).toBeUndefined();
    expect(warnings).toEqual([]); // no-code is not a mapping failure: nothing to warn about
  });

  it("annotates O (order) records too", () => {
    const msg = parseAstmRecords("H|\\^&\rO|1|ACC-42||^^^690|R\rL|1\r");
    const [a] = applyLivd(msg, catalog).annotations;
    expect(a?.recordType).toBe("O");
    expect(a?.mapping).toMatchObject({ status: "mapped", loinc: "1742-6" });
  });

  it("NEVER mutates the source message: the raw code and value are untouched", () => {
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
    const before = JSON.stringify(msg);
    applyLivd(msg, catalog);
    expect(JSON.stringify(msg)).toBe(before);
    const r = results(msg)[0];
    expect(r?.universalTestId?.localCode).toBe("687"); // verbatim, unchanged
    expect(r?.value).toBe("28.6"); // the value the layer must never touch
  });

  it("with an empty catalog, every coded record is unmapped (BYO default posture)", () => {
    const empty = defineLivdCatalog([]);
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
    const { annotations, warnings } = applyLivd(msg, empty);
    expect(annotations[0]?.mapping).toEqual({ status: "unmapped" });
    expect(warnings).toHaveLength(1);
  });
});

// ── The catalog is authoritative for the analyte identity ────────────────────────────
//
// The governing format puts LOINC on the instrument wire out of scope: the analyte
// arrives as a vendor-defined code, and a LOINC is what a consumer maps to afterwards.
// So a populated component 1 never answers the analyte-identity question, never
// bypasses the consumer's catalog, and is never validated by this library. Where the
// two sources say different things, both are surfaced and neither is chosen.

/** The one-analyte catalog the criteria below are written against. */
const catalog6871920 = defineLivdCatalog([{ vendorCode: "687", loinc: "1920-8" }]);

/** A catalog that records every code it was consulted with, in order. */
function countingCatalog(inner: LivdCatalog): { catalog: LivdCatalog; lookups: string[] } {
  const lookups: string[] = [];
  return {
    catalog: {
      size: inner.size,
      lookup(vendorCode: string): LivdLookup {
        lookups.push(vendorCode);
        return inner.lookup(vendorCode);
      },
    },
    lookups,
  };
}

/** A stream whose single `R` record carries `utid` as its Universal Test ID. */
function stream(utid: string): string {
  return `H|\\^&\rR|1|${utid}|28.6|U/L||N||F\rL|1\r`;
}

/** Annotate a one-record stream and return that record's annotation plus the warnings. */
function annotate(raw: string, cat: LivdCatalog): { a: LivdAnnotation; warnings: string[] } {
  const { annotations, warnings } = applyLivd(parseAstmRecords(raw), cat);
  const [a] = annotations;
  if (a === undefined) throw new Error("expected exactly one annotation");
  return { a, warnings: warnings.map((w) => w.code) };
}

describe("the catalog is consulted whenever a vendor local code is present", () => {
  it("looks the VENDOR LOCAL CODE up, never the first component, and reports both", () => {
    const { catalog: counting, lookups } = countingCatalog(catalog6871920);
    const { a } = annotate(stream("Glucose^^^687"), counting);

    // The catalog answered, and its answer is the disposition.
    expect(a.mapping).toEqual({ status: "mapped", loinc: "1920-8", source: "livd", derived: true });
    // Exactly one lookup, of the vendor local code, and none of the first component.
    expect(lookups).toEqual(["687"]);
    expect(lookups).not.toContain("Glucose");
    // The wire value rides along, verbatim and unvouched, and the two differ.
    expect(a.unvalidatedWireValue).toBe("Glucose");
    expect(a.wireValueDisagreesWithCatalog).toBe(true);
  });

  it("reports the code it consulted the catalog with, verbatim", () => {
    const { a } = annotate(stream("Glucose^^^687"), catalog6871920);
    expect(a.reportedCode).toBe("687");
    // "Glucose" appears ONLY as the unvalidated first-component value.
    const shown = Object.entries(a).filter(([, v]) => v === "Glucose");
    expect(shown).toEqual([["unvalidatedWireValue", "Glucose"]]);
  });

  it("surfaces both values and chooses between them in no field", () => {
    const { a } = annotate(stream("2345-7^^^687"), catalog6871920);
    expect(a.mapping).toEqual({ status: "mapped", loinc: "1920-8", source: "livd", derived: true });
    expect(a.unvalidatedWireValue).toBe("2345-7");
    expect(a.wireValueDisagreesWithCatalog).toBe(true);
    // The whole public surface of the annotation: nothing names either value as the
    // resolved analyte identity, and nothing says the conflict was settled.
    expect(Object.keys(a).sort()).toEqual([
      "mapping",
      "provenance",
      "recordIndex",
      "recordType",
      "reportedCode",
      "unvalidatedWireValue",
      "wireValueDisagreesWithCatalog",
    ]);
    expect(Object.keys(a.mapping).sort()).toEqual(["derived", "loinc", "source", "status"]);
  });

  it("reports agreement as agreement, never as a disagreement", () => {
    const { a, warnings } = annotate(stream("1920-8^^^687"), catalog6871920);
    expect(a.mapping).toEqual({ status: "mapped", loinc: "1920-8", source: "livd", derived: true });
    expect(a.wireValueDisagreesWithCatalog).toBe(false);
    expect(warnings).toEqual([]);
  });

  it("labels a first component unvalidated whatever it looks like, and calls none a LOINC", () => {
    for (const wire of ["Glucose", "2345-7"]) {
      const { a } = annotate(stream(`${wire}^^^687`), catalog6871920);
      // Carried verbatim, under a name that vouches for nothing.
      expect(a.unvalidatedWireValue).toBe(wire);
      // No key of the annotation, and no key of the mapping, presents it as a LOINC.
      for (const [key, value] of Object.entries(a)) {
        if (value === wire) expect(key).toBe("unvalidatedWireValue");
      }
      expect(a.mapping.status).toBe("mapped");
      if (a.mapping.status === "mapped") expect(a.mapping.loinc).not.toBe(wire);
      expect(a.provenance).not.toMatch(/loinc/i);
    }
  });
});

describe("a vendor local code that is missing, missed, or ambiguous", () => {
  it("no vendor local code: says so, looks nothing up, and warns about no lookup", () => {
    // A catalog that WOULD answer for the first-component value, to prove it is never
    // used as a lookup key: the key is the vendor transmission code alone.
    const { catalog: counting, lookups } = countingCatalog(
      defineLivdCatalog([
        { vendorCode: "Glucose", loinc: "2345-7" },
        { vendorCode: "687", loinc: "1920-8" },
      ]),
    );
    const { a, warnings } = annotate(stream("Glucose"), counting);

    expect(lookups).toEqual([]);
    expect(a.mapping).toEqual({ status: "no-vendor-code" });
    expect(a.reportedCode).toBeUndefined();
    expect(a.unvalidatedWireValue).toBe("Glucose");
    expect(a.wireValueDisagreesWithCatalog).toBe(false);
    // No lookup happened, so neither warning that asserts one may be emitted.
    expect(warnings).not.toContain(LIVD_WARNING_CODES.ASTM_LIVD_UNMAPPED_CODE);
    expect(warnings).not.toContain(LIVD_WARNING_CODES.ASTM_LIVD_AMBIGUOUS_MAPPING);

    // Distinguishable from a vendor code that WAS looked up and missed, on the
    // disposition AND on more: that one reports a consulted code and warns.
    const miss = annotate(stream("Glucose^^^999"), counting);
    expect(a.mapping.status).not.toBe(miss.a.mapping.status);
    expect(miss.a.reportedCode).toBe("999");
    expect(miss.warnings).toEqual([LIVD_WARNING_CODES.ASTM_LIVD_UNMAPPED_CODE]);
  });

  it("a miss: reported as a miss, warned once, with the wire value still carried", () => {
    for (const cat of [catalog6871920, defineLivdCatalog([])]) {
      const { a, warnings } = annotate(stream("2345-7^^^999"), cat);
      expect(a.mapping).toEqual({ status: "unmapped" });
      expect(warnings).toEqual([LIVD_WARNING_CODES.ASTM_LIVD_UNMAPPED_CODE]);
      expect(a.unvalidatedWireValue).toBe("2345-7");
      // The catalog vouched for nothing, so there is nothing to disagree with.
      expect(a.wireValueDisagreesWithCatalog).toBe(false);
      // And no LOINC is reported at all: the first component is never promoted.
      expect(JSON.stringify(a.mapping)).not.toContain("2345-7");
    }
  });

  it("ambiguity: every candidate surfaced, none chosen, and the wire never selects", () => {
    const ambiguous = defineLivdCatalog([
      { vendorCode: "687", loinc: "1920-8" },
      { vendorCode: "687", loinc: "2345-7" },
    ]);
    const { a, warnings } = annotate(stream("2345-7^^^687"), ambiguous);
    expect(a.mapping.status).toBe("ambiguous");
    if (a.mapping.status === "ambiguous") {
      expect([...a.mapping.candidates].sort()).toEqual(["1920-8", "2345-7"]);
    }
    expect(a.unvalidatedWireValue).toBe("2345-7");
    expect(a.wireValueDisagreesWithCatalog).toBe(false);
    expect(warnings).toEqual([LIVD_WARNING_CODES.ASTM_LIVD_AMBIGUOUS_MAPPING]);

    // The outcome is IDENTICAL with an empty first component and with a first
    // component naming one of the candidates: nothing corroborates a candidate.
    const outcome = (utid: string): unknown => {
      const r = annotate(stream(utid), ambiguous).a;
      return { mapping: r.mapping, disagrees: r.wireValueDisagreesWithCatalog };
    };
    expect(outcome("2345-7^^^687")).toEqual(outcome("^^^687"));
    expect(outcome("2345-7^^^687")).toEqual(outcome("Glucose^^^687"));
  });
});

describe("no code at all is routed positionally, never by judging a value", () => {
  it("an absent field and a test-name-only field both report no code", () => {
    for (const raw of [
      "H|\\^&\rR|1||28.6|U/L||N||F\rL|1\r",
      "H|\\^&\rR|1|^Glucose||U/L||N||F\rL|1\r",
    ]) {
      const { a, warnings } = annotate(raw, catalog6871920);
      expect(a.mapping).toEqual({ status: "no-code" });
      expect(warnings).toEqual([]);
      expect(a.wireValueDisagreesWithCatalog).toBe(false);
      expect(a.unvalidatedWireValue).toBeUndefined();
    }
  });

  it("a populated FIRST component with no vendor code is a different outcome", () => {
    // Which components are populated decides the route. The content of component 1
    // never does: `Glucose` there is treated exactly as `2345-7` there.
    const noCode = annotate("H|\\^&\rR|1|^Glucose||U/L||N||F\rL|1\r", catalog6871920).a;
    for (const wire of ["Glucose", "2345-7"]) {
      const first = annotate(stream(wire), catalog6871920).a;
      expect(first.mapping).toEqual({ status: "no-vendor-code" });
      expect(first.mapping.status).not.toBe(noCode.mapping.status);
      expect(first.unvalidatedWireValue).toBe(wire);
      expect(noCode.unvalidatedWireValue).toBeUndefined();
    }
  });
});

describe("verbatim surfacing, and the never-fabricate rule", () => {
  it("surfaces a whitespace-only first component exactly as parsed", () => {
    const { catalog: counting, lookups } = countingCatalog(catalog6871920);
    const { a } = annotate(stream(" ^^^687"), counting);
    expect(lookups).toEqual(["687"]);
    expect(a.mapping).toEqual({ status: "mapped", loinc: "1920-8", source: "livd", derived: true });
    expect(a.unvalidatedWireValue).toBe(" ");
    expect(a.wireValueDisagreesWithCatalog).toBe(true);
  });

  it("leaves the parsed message deep-equal to what was parsed", () => {
    const msg = parseAstmRecords(stream("Glucose^^^687"));
    const before = structuredClone(msg);
    applyLivd(msg, catalog6871920);
    expect(msg).toEqual(before);
  });

  it("reports a catalog-vouched LOINC only when the catalog returned exactly that LOINC", () => {
    for (const utid of ["Glucose^^^687", "2345-7^^^687", "^^^687", " ^^^687", "1920-8^^^687"]) {
      const { a } = annotate(stream(utid), catalog6871920);
      if (a.mapping.status === "mapped") {
        expect(catalog6871920.lookup("687")).toMatchObject({ loinc: a.mapping.loinc });
      }
    }
  });
});

describe("every warning stays value-free and positional", () => {
  it("carries no test code, no reported value and no LOINC, in any field", () => {
    const ambiguous = defineLivdCatalog([
      { vendorCode: "687", loinc: "1920-8" },
      { vendorCode: "687", loinc: "2345-7" },
    ]);
    const streams: [string, LivdCatalog][] = [
      [stream("Glucose^^^687"), catalog6871920],
      [stream("2345-7^^^687"), catalog6871920],
      [stream("1920-8^^^687"), catalog6871920],
      [stream(" ^^^687"), catalog6871920],
      [stream("^^^687"), catalog6871920],
      [stream("2345-7^^^999"), catalog6871920],
      [stream("2345-7^^^687"), ambiguous],
      [stream("Glucose"), catalog6871920],
      ["H|\\^&\rR|1||28.6|U/L||N||F\rL|1\r", catalog6871920],
      ["H|\\^&\rR|1|^Glucose||U/L||N||F\rL|1\r", catalog6871920],
    ];
    let seen = 0;
    for (const [raw, cat] of streams) {
      for (const w of applyLivd(parseAstmRecords(raw), cat).warnings) {
        seen += 1;
        const serialized = JSON.stringify(w);
        for (const forbidden of ["687", "2345-7", "1920-8", "28.6"]) {
          expect(serialized).not.toContain(forbidden);
        }
        expect(w.position).toEqual({ recordIndex: 1, recordType: "R" });
      }
    }
    // A vacuous sweep would pass this test without observing a warning.
    expect(seen).toBeGreaterThan(0);
  });
});

describe("a consumer can tell every case apart mechanically", () => {
  /**
   * The closed discriminant, walked exhaustively. `switch-exhaustiveness-check` and
   * `tsc --noEmit` are what make this an assertion about the type rather than about
   * the five cases someone remembered to write.
   */
  function tell(m: LivdMapping): string {
    switch (m.status) {
      case "mapped":
        return `catalog vouched for ${m.loinc}`;
      case "unmapped":
        return "the lookup missed";
      case "ambiguous":
        return `ambiguous over ${m.candidates.length} candidates, none chosen`;
      case "no-vendor-code":
        return "no vendor local code to look up";
      case "no-code":
        return "no code at all";
    }
  }

  it("answers each question from the annotation, without parsing prose", () => {
    const ambiguous = defineLivdCatalog([
      { vendorCode: "687", loinc: "1920-8" },
      { vendorCode: "687", loinc: "2345-7" },
    ]);
    const cases: { utid: string; cat: LivdCatalog; expected: string; wire?: string }[] = [
      { utid: "^^^687", cat: catalog6871920, expected: "catalog vouched for 1920-8" },
      {
        utid: "2345-7^^^687",
        cat: catalog6871920,
        expected: "catalog vouched for 1920-8",
        wire: "2345-7",
      },
      { utid: "2345-7^^^999", cat: catalog6871920, expected: "the lookup missed", wire: "2345-7" },
      {
        utid: "2345-7^^^687",
        cat: ambiguous,
        expected: "ambiguous over 2 candidates, none chosen",
        wire: "2345-7",
      },
      {
        utid: "Glucose",
        cat: catalog6871920,
        expected: "no vendor local code to look up",
        wire: "Glucose",
      },
      { utid: "^Glucose", cat: catalog6871920, expected: "no code at all" },
    ];

    const seen = new Set<string>();
    for (const c of cases) {
      const { a } = annotate(stream(c.utid), c.cat);
      expect(tell(a.mapping)).toBe(c.expected);
      seen.add(a.mapping.status);
      // The two orthogonal facts, present on EVERY variant.
      expect(a.unvalidatedWireValue).toBe(c.wire);
      expect(typeof a.wireValueDisagreesWithCatalog).toBe("boolean");
    }
    // Every variant of the discriminant is covered by the table above.
    expect(seen.size).toBe(5);
  });

  it("carries the unvalidated wire value on a miss, a disagreement and an ambiguity alike", () => {
    const ambiguous = defineLivdCatalog([
      { vendorCode: "687", loinc: "1920-8" },
      { vendorCode: "687", loinc: "2345-7" },
    ]);
    expect(annotate(stream("2345-7^^^999"), catalog6871920).a.unvalidatedWireValue).toBe("2345-7");
    expect(annotate(stream("2345-7^^^687"), catalog6871920).a.unvalidatedWireValue).toBe("2345-7");
    expect(annotate(stream("2345-7^^^687"), ambiguous).a.unvalidatedWireValue).toBe("2345-7");
  });
});

describe("a hostile or unusable consumer catalog", () => {
  it("lets a catalog's own failure reach the caller, never dressed up as a miss", () => {
    const boom = new Error("consumer catalog exploded");
    const throwing: LivdCatalog = {
      size: 1,
      lookup(): LivdLookup {
        throw boom;
      },
    };
    const msg = parseAstmRecords(stream("Glucose^^^687"));
    const before = structuredClone(msg);
    expect(() => applyLivd(msg, throwing)).toThrow(boom);
    expect(msg).toEqual(before);
  });

  it("treats a hit whose LOINC is a zero-length string as a miss, never as vouched", () => {
    const emptyHit: LivdCatalog = {
      size: 1,
      lookup(): LivdLookup {
        return { status: "mapped", loinc: "" };
      },
    };
    const { a, warnings } = annotate(stream("Glucose^^^687"), emptyHit);
    expect(a.mapping).toEqual({ status: "unmapped" });
    expect(warnings).toEqual([LIVD_WARNING_CODES.ASTM_LIVD_UNMAPPED_CODE]);
    expect(a.wireValueDisagreesWithCatalog).toBe(false);
  });
});

describe("the disagreement fact has one definition and a value in every case", () => {
  it("is true only where the catalog vouched for one LOINC that the wire contradicts", () => {
    const ambiguous = defineLivdCatalog([
      { vendorCode: "687", loinc: "1920-8" },
      { vendorCode: "687", loinc: "2345-7" },
    ]);
    const noRow = defineLivdCatalog([]);
    const rows: { raw: string; cat: LivdCatalog; expected: boolean; why: string }[] = [
      {
        raw: stream("Glucose^^^687"),
        cat: catalog6871920,
        expected: true,
        why: "single hit, wire differs",
      },
      {
        raw: stream("2345-7^^^687"),
        cat: catalog6871920,
        expected: true,
        why: "single hit, wire differs",
      },
      { raw: stream(" ^^^687"), cat: catalog6871920, expected: true, why: "a space is populated" },
      { raw: stream("1920-8^^^687"), cat: catalog6871920, expected: false, why: "byte-identical" },
      { raw: stream("^^^687"), cat: catalog6871920, expected: false, why: "component 1 is empty" },
      {
        raw: stream("2345-7^^^687"),
        cat: noRow,
        expected: false,
        why: "a miss vouches for nothing",
      },
      { raw: stream("2345-7^^^687"), cat: ambiguous, expected: false, why: "no single LOINC" },
      { raw: stream("Glucose"), cat: catalog6871920, expected: false, why: "no vendor local code" },
      {
        raw: "H|\\^&\rR|1||28.6|U/L||N||F\rL|1\r",
        cat: catalog6871920,
        expected: false,
        why: "no code",
      },
      {
        raw: "H|\\^&\rR|1|^Glucose||U/L||N||F\rL|1\r",
        cat: catalog6871920,
        expected: false,
        why: "name only",
      },
    ];
    for (const row of rows) {
      const { a } = annotate(row.raw, row.cat);
      expect({ why: row.why, fact: a.wireValueDisagreesWithCatalog }).toEqual({
        why: row.why,
        fact: row.expected,
      });
      // Never absent, null or undefined for any variant.
      expect(a.wireValueDisagreesWithCatalog).not.toBeUndefined();
      expect(a.wireValueDisagreesWithCatalog).not.toBeNull();
    }
  });
});

describe("lookupLivdForRecord", () => {
  it("annotates one record in isolation", () => {
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^690|12|U/L||N||F\rL|1\r");
    const r = results(msg)[0];
    if (r === undefined) throw new Error("expected a result record");
    expect(lookupLivdForRecord(r, catalog).mapping).toMatchObject({
      status: "mapped",
      loinc: "1742-6",
    });
  });

  it("works on an order record", () => {
    const msg = parseAstmRecords("H|\\^&\rO|1|ACC||^^^687|R\rL|1\r");
    const o = orders(msg)[0];
    if (o === undefined) throw new Error("expected an order record");
    expect(lookupLivdForRecord(o, catalog).mapping).toMatchObject({ status: "mapped" });
  });
});

// ── One vendor analyte code, several LOINCs, and the units that tell them apart ───────
//
// The mapping guide describes one IVD Test Performed to many LOINCs as the ORDINARY
// case, and its own worked examples are the commonest chemistry analytes: a serum
// glucose reported as a mass concentration versus a substance concentration, and a
// urine analyte reported as a spot concentration versus a 24 hour excretion rate. The
// guide's remedy is a mapping per unit, and the `R` record already states its units on
// the wire, so units, and ONLY units, resolve the ambiguity here. The comparison is
// exact and case sensitive; nothing is normalized, converted, scaled or case folded,
// and every unit-selected answer says so rather than letting a consumer read a matched
// unit as a UCUM conformance claim this package does not make.

/** A one-record `R` stream with a chosen Universal Test ID and a chosen units field. */
function unitStream(utid: string, units: string): string {
  return `H|\\^&\rR|1|${utid}|5.5|${units}||N||F\rL|1\r`;
}

/** The guide's glucose case: one vendor code, mass concentration versus substance concentration. */
const glucoseCatalog = defineLivdCatalog([
  {
    vendorCode: "GLU",
    loinc: "2345-7",
    loincLongName: "Glucose [Mass/volume] in Serum or Plasma",
    vendorSpecimenDescription: "Serum or Plasma",
    vendorResultDescription: "Numeric mass concentration, mg/dL",
    representativeUnit: "mg/dL",
  },
  {
    vendorCode: "GLU",
    loinc: "14749-6",
    loincLongName: "Glucose [Moles/volume] in Serum or Plasma",
    vendorSpecimenDescription: "Serum or Plasma",
    vendorResultDescription: "Numeric substance concentration, mmol/L",
    representativeUnit: "mmol/L",
  },
]);

/** The guide's urine case: a spot concentration versus a 24 hour excretion rate. */
const urineCatalog = defineLivdCatalog([
  {
    vendorCode: "UNA",
    loinc: "2955-3",
    vendorSpecimenDescription: "Urine, random",
    representativeUnit: "mmol/L",
  },
  {
    vendorCode: "UNA",
    loinc: "2956-1",
    vendorSpecimenDescription: "Urine, 24 hour collection",
    representativeUnit: "mmol/(24.h)",
  },
]);

describe("a catalog entry carries the three LIVD attributes, verbatim", () => {
  it("accepts all three beside the vendor analyte code and preserves each byte for byte", () => {
    // Deliberately awkward text: leading and trailing spaces, doubled internal spaces,
    // and mixed case. Nothing may trim, collapse or case fold any of it.
    const specimen = "  Serum  or Plasma  ";
    const resultText = " Numeric  MASS concentration ";
    const unit = " mg/dL ";
    const cat = defineLivdCatalog([
      {
        vendorCode: "687",
        loinc: "1920-8",
        vendorSpecimenDescription: specimen,
        vendorResultDescription: resultText,
        representativeUnit: unit,
      },
    ]);
    expect(cat.lookup("687")).toEqual({
      status: "mapped",
      loinc: "1920-8",
      vendorSpecimenDescription: specimen,
      vendorResultDescription: resultText,
      representativeUnit: unit,
    });
    // And through the annotation layer, still byte for byte.
    const { a } = annotate(unitStream("^^^687", "U/L"), cat);
    expect(a.mapping).toMatchObject({
      vendorSpecimenDescription: specimen,
      vendorResultDescription: resultText,
      representativeUnit: unit,
    });
  });

  it("keeps each attribute optional, one at a time", () => {
    for (const partial of [
      { vendorSpecimenDescription: "Serum or Plasma" },
      { vendorResultDescription: "Binary: reactive / non-reactive" },
      { representativeUnit: "mg/dL" },
    ]) {
      const cat = defineLivdCatalog([{ vendorCode: "687", loinc: "1920-8", ...partial }]);
      expect(cat.lookup("687")).toEqual({ status: "mapped", loinc: "1920-8", ...partial });
    }
  });

  it("surfaces every candidate row's attributes on an ambiguous answer, verbatim", () => {
    const r = glucoseCatalog.lookup("GLU");
    expect(r.status).toBe("ambiguous");
    if (r.status !== "ambiguous") return;
    expect([...r.candidates]).toEqual(["2345-7", "14749-6"]);
    expect(r.candidateDetails).toEqual([
      {
        loinc: "2345-7",
        loincLongName: "Glucose [Mass/volume] in Serum or Plasma",
        vendorSpecimenDescription: "Serum or Plasma",
        vendorResultDescription: "Numeric mass concentration, mg/dL",
        representativeUnit: "mg/dL",
        unitQualified: true,
      },
      {
        loinc: "14749-6",
        loincLongName: "Glucose [Moles/volume] in Serum or Plasma",
        vendorSpecimenDescription: "Serum or Plasma",
        vendorResultDescription: "Numeric substance concentration, mmol/L",
        representativeUnit: "mmol/L",
        unitQualified: true,
      },
    ]);
  });
});

describe("the guide's own worked cases resolve on the reported units", () => {
  it("serum glucose: mass concentration and substance concentration, told apart by unit", () => {
    const massConcentration = annotate(unitStream("^^^GLU", "mg/dL"), glucoseCatalog).a;
    expect(massConcentration.mapping).toMatchObject({
      status: "mapped",
      loinc: "2345-7",
      representativeUnit: "mg/dL",
      derived: true,
      source: "livd",
    });

    const substanceConcentration = annotate(unitStream("^^^GLU", "mmol/L"), glucoseCatalog).a;
    expect(substanceConcentration.mapping).toMatchObject({
      status: "mapped",
      loinc: "14749-6",
      representativeUnit: "mmol/L",
    });

    // Two different LOINCs for the same vendor analyte code, and the ONLY thing that
    // differed between the two records is the units field.
    expect(massConcentration.reportedCode).toBe(substanceConcentration.reportedCode);
  });

  it("a urine analyte: a spot concentration and a 24 hour excretion rate", () => {
    expect(annotate(unitStream("^^^UNA", "mmol/L"), urineCatalog).a.mapping).toMatchObject({
      status: "mapped",
      loinc: "2955-3",
      vendorSpecimenDescription: "Urine, random",
    });
    expect(annotate(unitStream("^^^UNA", "mmol/(24.h)"), urineCatalog).a.mapping).toMatchObject({
      status: "mapped",
      loinc: "2956-1",
      vendorSpecimenDescription: "Urine, 24 hour collection",
    });
  });

  it("emits no ambiguity warning when the units settled it", () => {
    expect(annotate(unitStream("^^^GLU", "mg/dL"), glucoseCatalog).warnings).toEqual([]);
  });

  it("consults the catalog with the record's units, verbatim, and with nothing else", () => {
    const seen: (string | undefined)[] = [];
    const spy: LivdCatalog = {
      size: glucoseCatalog.size,
      lookup(vendorCode: string, reportedUnits?: string): LivdLookup {
        seen.push(reportedUnits);
        return glucoseCatalog.lookup(vendorCode, reportedUnits);
      },
    };
    annotate(unitStream("^^^GLU", " mg/dL "), spy);
    expect(seen).toEqual([" mg/dL "]);
  });
});

describe("a unit-selected answer states what the comparison was", () => {
  it("reports verbatim, case sensitive, and NOT a UCUM semantic comparison", () => {
    const { a } = annotate(unitStream("^^^GLU", "mg/dL"), glucoseCatalog);
    expect(a.mapping.status).toBe("mapped");
    if (a.mapping.status !== "mapped") return;
    const c = a.mapping.unitComparison;
    expect(c).toBeDefined();
    expect(c?.comparison).toBe("verbatim-case-sensitive");
    expect(c?.ucumSemantic).toBe(false);
    expect(c?.reportedUnits).toBe("mg/dL");
    expect(c?.representativeUnit).toBe("mg/dL");
    // Byte-equal by construction: that IS the comparison, and nothing else is claimed.
    expect(c?.representativeUnit).toBe(c?.reportedUnits);
    // The prose says the same three things a consumer would otherwise have to infer.
    expect(c?.note).toMatch(/verbatim/i);
    expect(c?.note).toMatch(/case sensitiv/i);
    expect(c?.note).toMatch(/NOT a UCUM semantic comparison/i);
    expect(Object.keys(c ?? {}).sort()).toEqual([
      "comparison",
      "note",
      "reportedUnits",
      "representativeUnit",
      "ucumSemantic",
    ]);
  });

  it("carries no unit comparison where no unit chose anything", () => {
    // One candidate LOINC: it is the answer because it is the only one, not because a
    // unit matched. Saying a unit selected it would be a claim the run did not make.
    const single = defineLivdCatalog([
      { vendorCode: "687", loinc: "1920-8", representativeUnit: "U/L" },
    ]);
    const { a } = annotate(unitStream("^^^687", "U/L"), single);
    expect(a.mapping.status).toBe("mapped");
    if (a.mapping.status !== "mapped") return;
    expect(a.mapping.unitComparison).toBeUndefined();
  });
});

describe("the refusal paths: every candidate surfaced, no LOINC chosen", () => {
  /** The candidate LOINCs of an ambiguous answer, or a marker naming what came back instead. */
  function refusal(raw: string, cat: LivdCatalog): { status: string; candidates: string[] } {
    const { a } = annotate(raw, cat);
    if (a.mapping.status !== "ambiguous") return { status: a.mapping.status, candidates: [] };
    return { status: "ambiguous", candidates: [...a.mapping.candidates] };
  }

  it("no candidate matches the reported units", () => {
    expect(refusal(unitStream("^^^GLU", "g/L"), glucoseCatalog)).toEqual({
      status: "ambiguous",
      candidates: ["2345-7", "14749-6"],
    });
    const r = glucoseCatalog.lookup("GLU", "g/L");
    expect(r.status === "ambiguous" && r.reason).toBe("no-candidate-matched-units");
    // Not one field of the refusal names a chosen LOINC.
    expect(Object.keys(r).sort()).toEqual(["candidateDetails", "candidates", "reason", "status"]);
  });

  it("more than one candidate matches the reported units", () => {
    // Rows that disagree on the LOINC while agreeing on the unit: picking one would be
    // a guess, so the answer is the refusal with both surfaced.
    const collision = defineLivdCatalog([
      { vendorCode: "DUP", loinc: "2345-7", representativeUnit: "mg/dL" },
      { vendorCode: "DUP", loinc: "14749-6", representativeUnit: "mg/dL" },
    ]);
    const r = collision.lookup("DUP", "mg/dL");
    expect(r.status).toBe("ambiguous");
    if (r.status !== "ambiguous") return;
    expect(r.reason).toBe("multiple-candidates-matched-units");
    expect([...r.candidates]).toEqual(["2345-7", "14749-6"]);
    expect(refusal(unitStream("^^^DUP", "mg/dL"), collision).candidates).toEqual([
      "2345-7",
      "14749-6",
    ]);
  });

  it("the record reported no units and the candidates differ only by unit", () => {
    for (const raw of [
      "H|\\^&\rR|1|^^^GLU|5.5|||N||F\rL|1\r", // an empty units field
      "H|\\^&\rR|1|^^^GLU|5.5\rL|1\r", // truncated before the units field
      "H|\\^&\rR|1|^^^GLU\rL|1\r", // truncated before the value too
      unitStream("^^^GLU", "   "), // whitespace only: not a unit
    ]) {
      expect(refusal(raw, glucoseCatalog)).toEqual({
        status: "ambiguous",
        candidates: ["2345-7", "14749-6"],
      });
      const { a } = annotate(raw, glucoseCatalog);
      expect(a.mapping.status === "ambiguous" && a.mapping.reason).toBe("no-reported-units");
    }
    // And the same when the catalog is asked directly with no units at all.
    const r = glucoseCatalog.lookup("GLU");
    expect(r.status === "ambiguous" && r.reason).toBe("no-reported-units");
  });

  it("an O record has no units field at all, so it reports no units reported", () => {
    const msg = parseAstmRecords("H|\\^&\rO|1|ACC-42||^^^GLU|R\rL|1\r");
    const [a] = applyLivd(msg, glucoseCatalog).annotations;
    expect(a?.recordType).toBe("O");
    expect(a?.mapping.status).toBe("ambiguous");
    if (a?.mapping.status !== "ambiguous") return;
    expect(a.mapping.reason).toBe("no-reported-units");
    expect([...a.mapping.candidates]).toEqual(["2345-7", "14749-6"]);
  });

  it("warns once per refusal, value-free, and never names a LOINC or a unit", () => {
    for (const raw of [
      unitStream("^^^GLU", "g/L"),
      unitStream("^^^GLU", ""),
      unitStream("^^^GLU", "MG/DL"),
    ]) {
      const { annotations, warnings } = applyLivd(parseAstmRecords(raw), glucoseCatalog);
      expect(annotations[0]?.mapping.status).toBe("ambiguous");
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.code).toBe(LIVD_WARNING_CODES.ASTM_LIVD_AMBIGUOUS_MAPPING);
      const serialized = JSON.stringify(warnings[0]);
      for (const forbidden of ["2345-7", "14749-6", "GLU", "mg/dL", "g/L", "5.5"]) {
        expect(serialized).not.toContain(forbidden);
      }
    }
  });
});

describe("a candidate with no usable representative unit is never selected on one", () => {
  /** Three rows that cannot be unit qualified, plus one that can. */
  const blanks = defineLivdCatalog([
    { vendorCode: "BLK", loinc: "1000-9", representativeUnit: "" },
    { vendorCode: "BLK", loinc: "1001-7", representativeUnit: "   " },
    { vendorCode: "BLK", loinc: "1002-5", vendorSpecimenDescription: "Serum or Plasma" },
    { vendorCode: "BLK", loinc: "1003-3", representativeUnit: "mg/dL" },
  ]);

  it("marks absent, empty and whitespace-only units as NOT unit qualified", () => {
    const r = blanks.lookup("BLK");
    expect(r.status).toBe("ambiguous");
    if (r.status !== "ambiguous") return;
    expect(r.candidateDetails?.map((c) => [c.loinc, c.unitQualified])).toEqual([
      ["1000-9", false],
      ["1001-7", false],
      ["1002-5", false],
      ["1003-3", true],
    ]);
    // The blank unit is still carried verbatim, exactly as the catalog spelled it.
    expect(r.candidateDetails?.[0]?.representativeUnit).toBe("");
    expect(r.candidateDetails?.[1]?.representativeUnit).toBe("   ");
    expect(r.candidateDetails?.[2]?.representativeUnit).toBeUndefined();
  });

  it("still surfaces every one of them among the candidates", () => {
    for (const reported of [undefined, "", "   ", "mg/dL", "g/L"]) {
      const r = blanks.lookup("BLK", reported);
      const candidates =
        r.status === "ambiguous" ? [...r.candidates] : r.status === "mapped" ? [r.loinc] : [];
      // The one exactly-matching row is answered; every other case surfaces all four.
      if (reported === "mg/dL") expect(candidates).toEqual(["1003-3"]);
      else expect(candidates).toEqual(["1000-9", "1001-7", "1002-5", "1003-3"]);
    }
  });

  it("is never chosen by a comparison against blank or whitespace-only reported units", () => {
    for (const reported of ["", "   ", "\t"]) {
      const r = blanks.lookup("BLK", reported);
      expect(r.status).toBe("ambiguous");
      if (r.status !== "ambiguous") return;
      // A blank on the wire reads as NO UNITS REPORTED, never as a unit that could
      // match a blank in the catalog.
      expect(r.reason).toBe("no-reported-units");
    }
  });

  it("does not compete with a qualified candidate that does match", () => {
    expect(blanks.lookup("BLK", "mg/dL")).toMatchObject({ status: "mapped", loinc: "1003-3" });
  });
});

describe("the comparison is verbatim: case and whitespace are differences", () => {
  it("refuses a candidate that differs only in letter case", () => {
    for (const reported of ["MG/DL", "Mg/dL", "mg/dl"]) {
      const r = glucoseCatalog.lookup("GLU", reported);
      expect(r.status).toBe("ambiguous");
      if (r.status === "ambiguous") expect(r.reason).toBe("no-candidate-matched-units");
    }
  });

  it("refuses a candidate that differs only in surrounding or internal whitespace", () => {
    for (const reported of [" mg/dL", "mg/dL ", " mg/dL ", "mg / dL", "mg/ dL"]) {
      const r = glucoseCatalog.lookup("GLU", reported);
      expect(r.status).toBe("ambiguous");
      if (r.status === "ambiguous") expect(r.reason).toBe("no-candidate-matched-units");
    }
  });

  it("matches a unit whose own spelling carries whitespace, byte for byte", () => {
    // Verbatim cuts both ways: a catalog unit that HAS a space matches a reported unit
    // spelling it identically, and refuses one that does not.
    const spaced = defineLivdCatalog([
      { vendorCode: "SPC", loinc: "1000-9", representativeUnit: "10*3/uL" },
      { vendorCode: "SPC", loinc: "1001-7", representativeUnit: "10 3/uL" },
    ]);
    expect(spaced.lookup("SPC", "10 3/uL")).toMatchObject({ status: "mapped", loinc: "1001-7" });
    expect(spaced.lookup("SPC", "103/uL").status).toBe("ambiguous");
  });

  it("never converts, scales, or normalizes either side", () => {
    // mg/L and ug/dL are a multiplicative scale factor apart; mol/L and mg/L are not.
    // Neither pair is equal here, because nothing is converted at all.
    const scaled = defineLivdCatalog([
      { vendorCode: "SCL", loinc: "1000-9", representativeUnit: "mg/L" },
      { vendorCode: "SCL", loinc: "1001-7", representativeUnit: "mol/L" },
    ]);
    for (const reported of ["ug/dL", "mmol/L", "MG/L", "mg/l"]) {
      expect(scaled.lookup("SCL", reported).status).toBe("ambiguous");
    }
  });

  it("never chooses on the specimen or result description, however exactly they match", () => {
    // Both are free text the mapping guide says is not to be parsed by automated
    // mapping software. A record cannot carry them at all, and nothing here reads them.
    const described = defineLivdCatalog([
      {
        vendorCode: "DSC",
        loinc: "1000-9",
        vendorSpecimenDescription: "Serum or Plasma",
        vendorResultDescription: "mg/dL",
      },
      {
        vendorCode: "DSC",
        loinc: "1001-7",
        vendorSpecimenDescription: "Urine",
        vendorResultDescription: "mmol/L",
      },
    ]);
    // The reported units are byte-identical to one row's RESULT DESCRIPTION, and to one
    // row's SPECIMEN description in the second case. Neither selects: no row is unit
    // qualified, so there is nothing to select on.
    for (const reported of ["mg/dL", "mmol/L", "Serum or Plasma", "Urine"]) {
      const r = described.lookup("DSC", reported);
      expect(r.status).toBe("ambiguous");
      if (r.status === "ambiguous") expect(r.reason).toBe("no-candidate-matched-units");
    }
  });
});

describe("a single candidate LOINC is answered whether or not the units agree", () => {
  const single = defineLivdCatalog([
    {
      vendorCode: "687",
      loinc: "1920-8",
      loincLongName: "Aspartate aminotransferase",
      representativeUnit: "U/L",
    },
  ]);

  it("answers mapped for agreeing, disagreeing, blank and absent units alike", () => {
    for (const units of ["U/L", "u/l", "IU/L", "", "   "]) {
      const { a, warnings } = annotate(unitStream("^^^687", units), single);
      expect(a.mapping).toMatchObject({ status: "mapped", loinc: "1920-8" });
      expect(warnings).toEqual([]);
    }
    // And on a record with no units field at all.
    expect(annotate("H|\\^&\rR|1|^^^687|5.5\rL|1\r", single).a.mapping).toMatchObject({
      status: "mapped",
      loinc: "1920-8",
    });
  });

  it("treats several rows agreeing on one LOINC as that one answer, units or not", () => {
    // Two rows, one LOINC, different representative units: still one candidate, so
    // still `mapped`. The first row's optional fields are the ones carried, exactly as
    // `loincLongName` has always been carried.
    const duplicated = defineLivdCatalog([
      { vendorCode: "700", loinc: "2345-7", representativeUnit: "mg/dL" },
      { vendorCode: "700", loinc: "2345-7", representativeUnit: "mmol/L" },
    ]);
    for (const units of ["mg/dL", "mmol/L", "g/L", ""]) {
      expect(duplicated.lookup("700", units)).toEqual({
        status: "mapped",
        loinc: "2345-7",
        representativeUnit: "mg/dL",
      });
    }
  });

  it("never turns an answer that was mapped into ambiguous", () => {
    // The pre-change catalog from the top of this file, walked with every unit shape a
    // record can carry. Its mapped codes stay mapped and its ambiguous code stays
    // ambiguous: adding units cannot move an answer across that line.
    for (const units of ["U/L", "mg/dL", "", "   "]) {
      expect(annotate(unitStream("^^^687", units), catalog).a.mapping.status).toBe("mapped");
      expect(annotate(unitStream("^^^700", units), catalog).a.mapping.status).toBe("mapped");
      expect(annotate(unitStream("^^^800", units), catalog).a.mapping.status).toBe("ambiguous");
      expect(annotate(unitStream("^^^999", units), catalog).a.mapping.status).toBe("unmapped");
    }
  });
});

describe("a catalog carrying none of the three attributes answers exactly as before", () => {
  /** The catalog shape every consumer has today: no specimen, no result text, no unit. */
  const plain = defineLivdCatalog([
    { vendorCode: "687", loinc: "1920-8", loincLongName: "Aspartate aminotransferase" },
    { vendorCode: "700", loinc: "2345-7" },
    { vendorCode: "700", loinc: "2345-7", model: "cobas c311" },
    { vendorCode: "800", loinc: "2160-0" },
    { vendorCode: "800", loinc: "38483-4" },
  ]);

  it("returns the pre-change object, key for key, for mapped, unmapped and ambiguous", () => {
    // Whatever units are supplied, including none at all.
    for (const units of [undefined, "", "   ", "mg/dL", "U/L"]) {
      expect(plain.lookup("687", units)).toEqual({
        status: "mapped",
        loinc: "1920-8",
        loincLongName: "Aspartate aminotransferase",
      });
      expect(Object.keys(plain.lookup("687", units)).sort()).toEqual([
        "loinc",
        "loincLongName",
        "status",
      ]);
      expect(plain.lookup("700", units)).toEqual({ status: "mapped", loinc: "2345-7" });
      expect(Object.keys(plain.lookup("700", units)).sort()).toEqual(["loinc", "status"]);
      expect(plain.lookup("999", units)).toEqual({ status: "unmapped" });
      expect(plain.lookup("800", units)).toEqual({
        status: "ambiguous",
        candidates: ["2160-0", "38483-4"],
      });
      // No candidateDetails and no reason: there is nothing new to say, so nothing new
      // is said, and an existing consumer's deep equality still holds.
      expect(Object.keys(plain.lookup("800", units)).sort()).toEqual(["candidates", "status"]);
    }
  });

  it("returns the pre-change annotation, key for key, through applyLivd", () => {
    const rows: { utid: string; expected: Record<string, unknown> }[] = [
      {
        utid: "^^^687",
        expected: {
          status: "mapped",
          loinc: "1920-8",
          loincLongName: "Aspartate aminotransferase",
          source: "livd",
          derived: true,
        },
      },
      { utid: "^^^999", expected: { status: "unmapped" } },
      { utid: "^^^800", expected: { status: "ambiguous", candidates: ["2160-0", "38483-4"] } },
      { utid: "Glucose", expected: { status: "no-vendor-code" } },
      { utid: "^Glucose", expected: { status: "no-code" } },
    ];
    for (const row of rows) {
      const { a } = annotate(unitStream(row.utid, "U/L"), plain);
      expect(a.mapping).toEqual(row.expected);
      expect(Object.keys(a.mapping).sort()).toEqual(Object.keys(row.expected).sort());
    }
  });

  it("keeps a mapped annotation's key set at the four it always had", () => {
    const { a } = annotate(unitStream("^^^700", "mg/dL"), plain);
    expect(Object.keys(a.mapping).sort()).toEqual(["derived", "loinc", "source", "status"]);
  });
});

describe("units that cannot be read leave the record annotated, never dropped", () => {
  it("annotates every R and O record of a malformed message without raising", () => {
    // A truncated result, a result with no units, one with an empty units field, a
    // result whose fields never separated, and an order. None of them can state units
    // this layer can compare, and every one still comes back as a typed annotation.
    const raw =
      "H|\\^&\r" +
      "R|1|^^^GLU\r" +
      "R|2|^^^GLU|5.5\r" +
      "R|3|^^^GLU|5.5|\r" +
      "R4^^^GLU5.5mg/dL\r" +
      "O|1|ACC-42||^^^GLU|R\r" +
      "L|1\r";
    const msg = parseAstmRecords(raw);
    let out: ReturnType<typeof applyLivd> | undefined;
    expect(() => {
      out = applyLivd(msg, glucoseCatalog);
    }).not.toThrow();
    // One annotation per R/O record, in wire order, none omitted.
    expect(out?.annotations.map((x) => x.recordType)).toEqual(["R", "R", "R", "R", "O"]);
    // Every one is a typed member of the closed discriminant, and none chose a LOINC.
    for (const x of out?.annotations ?? []) {
      expect(["mapped", "unmapped", "ambiguous", "no-vendor-code", "no-code"]).toContain(
        x.mapping.status,
      );
      expect(x.mapping.status).not.toBe("mapped");
    }
  });

  it("reads an unreadable units field as no units reported, not as a unit", () => {
    for (const raw of [
      "H|\\^&\rR|1|^^^GLU\rL|1\r",
      "H|\\^&\rR|1|^^^GLU|5.5\rL|1\r",
      "H|\\^&\rR|1|^^^GLU|5.5|\rL|1\r",
    ]) {
      const { a } = annotate(raw, glucoseCatalog);
      expect(a.mapping.status).toBe("ambiguous");
      if (a.mapping.status !== "ambiguous") return;
      expect(a.mapping.reason).toBe("no-reported-units");
    }
  });

  it("compares a garbled units field verbatim rather than trying to repair it", () => {
    // Text in the units slot that is not a unit is compared exactly as it stands,
    // matches nothing, and the answer is the refusal: nothing here attempts a repair.
    const { a } = annotate(unitStream("^^^GLU", "mg/dL and up"), glucoseCatalog);
    expect(a.mapping.status).toBe("ambiguous");
    if (a.mapping.status !== "ambiguous") return;
    expect(a.mapping.reason).toBe("no-candidate-matched-units");
  });
});

describe("the annotation adds the LIVD attributes and rewrites nothing on the wire", () => {
  it("leaves the reported code, value and units exactly as parsed", () => {
    const msg = parseAstmRecords(unitStream("Glucose^^^GLU", "mg/dL"));
    const before = structuredClone(msg);
    const { annotations } = applyLivd(msg, glucoseCatalog);
    expect(msg).toEqual(before);

    const r = results(msg)[0];
    expect(r?.universalTestId?.localCode).toBe("GLU");
    expect(r?.value).toBe("5.5");
    expect(r?.units).toBe("mg/dL");

    // The three attributes exist ONLY on the annotation, never on the record.
    expect(annotations[0]?.mapping).toMatchObject({
      vendorSpecimenDescription: "Serum or Plasma",
      vendorResultDescription: "Numeric mass concentration, mg/dL",
      representativeUnit: "mg/dL",
    });
    expect(JSON.stringify(msg)).not.toContain("Serum or Plasma");
    expect(JSON.stringify(msg)).not.toContain("Numeric mass concentration");
  });

  it("keeps a hand-written one-argument catalog working unchanged", () => {
    // The units are an OPTIONAL second parameter, so a consumer's own implementation
    // that never declared them still satisfies the interface and still answers.
    const oneArg: LivdCatalog = {
      size: 1,
      lookup(vendorCode: string): LivdLookup {
        return vendorCode === "GLU"
          ? { status: "mapped", loinc: "2345-7" }
          : { status: "unmapped" };
      },
    };
    const { a } = annotate(unitStream("^^^GLU", "mg/dL"), oneArg);
    expect(a.mapping).toEqual({
      status: "mapped",
      loinc: "2345-7",
      source: "livd",
      derived: true,
    });
  });
});
