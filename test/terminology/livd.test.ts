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
