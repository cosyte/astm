/**
 * Map an analyzer's local test codes to LOINC with your own LIVD catalog.
 *
 * `@cosyte/astm` bundles no LOINC data and never guesses a LOINC. You supply the catalog (here, three
 * synthetic rows in the LIVD shape), and `applyLivd` annotates each order and result record. A code
 * with one candidate is `mapped`; a code with several candidates is settled only by the units the
 * record reported, compared verbatim; a code the catalog does not hold is `unmapped` and warned
 * about. The raw record is never changed.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/map-local-codes-to-loinc.ts
 */

import assert from "node:assert/strict";

import { applyLivd, defineLivdCatalog, parseAstmRecords } from "@cosyte/astm";

const catalog = defineLivdCatalog(
  [
    { vendorCode: "687", loinc: "1920-8", loincLongName: "AST", representativeUnit: "U/L" },
    // One vendor glucose code, two LOINCs: the reported units decide between them.
    {
      vendorCode: "GLU",
      loinc: "2345-7",
      loincLongName: "Glucose (mass)",
      representativeUnit: "mg/dL",
    },
    {
      vendorCode: "GLU",
      loinc: "14749-6",
      loincLongName: "Glucose (moles)",
      representativeUnit: "mmol/L",
    },
  ],
  { publisher: "Example Diagnostics", loincVersion: "2.78" },
);

const msg = parseAstmRecords(
  "H|\\^&\r" +
    "R|1|^^^687|28.6|U/L|10-40|N||F\r" +
    "R|2|^^^GLU|5.1|mmol/L|3.9-5.5|N||F\r" +
    "R|3|^^^999|12|s||N||F\r" +
    "L|1|N\r",
);

const { annotations, warnings } = applyLivd(msg, catalog);
for (const a of annotations) {
  const loinc = a.mapping.status === "mapped" ? a.mapping.loinc : "(none)";
  console.log(`Local code ${String(a.reportedCode)}: ${a.mapping.status}, LOINC ${loinc}`);
}
console.log(
  "Warnings:",
  warnings.map((w) => w.code),
);

// The checks that make this file a test: `pnpm examples` fails if any of them does not hold.
assert.deepEqual(
  annotations.map((a) => [
    a.reportedCode,
    a.mapping.status,
    a.mapping.status === "mapped" ? a.mapping.loinc : undefined,
  ]),
  [
    ["687", "mapped", "1920-8"],
    ["GLU", "mapped", "14749-6"],
    ["999", "unmapped", undefined],
  ],
);
assert.ok(annotations.every((a) => a.catalogLoincVersion === "2.78"));
assert.deepEqual(
  warnings.map((w) => w.code),
  ["ASTM_LIVD_UNMAPPED_CODE"],
);
