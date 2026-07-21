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
import type { LivdCatalog } from "../../src/index.js";

/**
 * Phase-9 LIVD-aware LOINC recognition. The safety-critical contract: an additive,
 * advisory annotation layer that maps a consumer-supplied vendor-code → LOINC and
 * **never** guesses a LOINC (a wrong LOINC mis-identifies a test), never mutates
 * the raw reported code/value, and bundles no terminology data.
 */

const catalog: LivdCatalog = defineLivdCatalog([
  { vendorCode: "687", loinc: "1920-8", loincLongName: "Aspartate aminotransferase" },
  { vendorCode: "690", loinc: "1742-6", loincLongName: "Alanine aminotransferase" },
  // Two rows agreeing on the same LOINC — a consistent duplicate, still a single hit.
  { vendorCode: "700", loinc: "2345-7" },
  { vendorCode: "700", loinc: "2345-7", model: "cobas c311" },
  // Two rows disagreeing — an ambiguous code the layer must refuse to resolve.
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

  it("returns unmapped on a miss — never a fabricated LOINC", () => {
    expect(catalog.lookup("999")).toEqual({ status: "unmapped" });
  });

  it("matches verbatim (case-sensitive, no normalization)", () => {
    expect(catalog.lookup(" 687").status).toBe("unmapped");
  });
});

describe("applyLivd — additive LOINC annotation", () => {
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

  it("surfaces an inline wire LOINC from the wire, never overwritten by the catalog", () => {
    // Component 1 (LOINC slot) populated AND a local code present that maps elsewhere:
    // the wire LOINC dominates and is labeled source "wire", not derived.
    const msg = parseAstmRecords("H|\\^&\rR|1|1234-5^Gluc^LN^687|5|mmol/L||N||F\rL|1\r");
    const [a] = applyLivd(msg, catalog).annotations;
    expect(a?.mapping).toEqual({ status: "inline-loinc", loinc: "1234-5", source: "wire" });
    expect(a?.reportedCode).toBe("1234-5");
  });

  it("flags an unmapped code as unmapped + a value-free warning — no guessed LOINC", () => {
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^999|5|U/L||N||F\rL|1\r");
    const { annotations, warnings } = applyLivd(msg, catalog);
    expect(annotations[0]?.mapping).toEqual({ status: "unmapped" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(LIVD_WARNING_CODES.ASTM_LIVD_UNMAPPED_CODE);
    // The warning is value-free: position only, no code, no value, no LOINC.
    expect(warnings[0]?.position).toEqual({ recordIndex: 1, recordType: "R" });
    expect(JSON.stringify(warnings[0])).not.toContain("999");
  });

  it("flags an ambiguous code as ambiguous + a warning — never one chosen", () => {
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
    expect(warnings).toEqual([]); // no-code is not a mapping failure — nothing to warn about
  });

  it("annotates O (order) records too", () => {
    const msg = parseAstmRecords("H|\\^&\rO|1|ACC-42||^^^690|R\rL|1\r");
    const [a] = applyLivd(msg, catalog).annotations;
    expect(a?.recordType).toBe("O");
    expect(a?.mapping).toMatchObject({ status: "mapped", loinc: "1742-6" });
  });

  it("NEVER mutates the source message — the raw code and value are untouched", () => {
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
