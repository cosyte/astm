---
id: map-local-codes-to-loinc
title: Map local test codes to LOINC
sidebar_label: Map local codes to LOINC
description: "Map an analyzer's local test codes to LOINC from an IICC LIVD catalog you supply, read every outcome, and record which publication the mapping came from."
---

# Map local test codes to LOINC

An analyzer sends its own local test code in a result's Universal Test ID, and LOINC is mapped
later. `applyLivd` does that mapping from an IICC LIVD ("LOINC to Vendor IVD") catalog you supply.
It adds an annotation beside each record, never changes the record's code or value, and never
guesses a LOINC. We bundle no LOINC, SNOMED or LIVD data, so the catalog and its license
obligations are yours.

## Build a catalog and annotate a message

```ts runnable
import { applyLivd, defineLivdCatalog, parseAstmRecords } from "@cosyte/astm";

const catalog = defineLivdCatalog([{ vendorCode: "687", loinc: "1920-8", loincLongName: "AST" }]);
const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rR|2|^^^999|5|U/L||N||F\rL|1\r");
const { annotations, warnings } = applyLivd(msg, catalog);

annotations[0]?.mapping; // => { status: "mapped", loinc: "1920-8", loincLongName: "AST", source: "livd", derived: true }
annotations[1]?.mapping.status; // => "unmapped"
warnings.map((w) => w.code); // => ["ASTM_LIVD_UNMAPPED_CODE"]
```

`applyLivd` annotates each `R` and `O` record. The lookup is keyed on the vendor code alone, matched
exactly and case sensitively. A code the catalog does not hold stays as sent, with an `unmapped`
answer and a value-free `ASTM_LIVD_UNMAPPED_CODE` warning.

## Read every outcome

`mapping.status` is a closed set, so a `switch` over it covers every case:

| `status`         | What happened                                                                       | Warning                       |
| ---------------- | ----------------------------------------------------------------------------------- | ----------------------------- |
| `mapped`         | your catalog vouched for exactly one LOINC for the vendor code                      | none                          |
| `unmapped`       | the vendor code was looked up and your catalog held no entry                        | `ASTM_LIVD_UNMAPPED_CODE`     |
| `ambiguous`      | several LOINCs that the reported units did not settle; all are listed, none chosen  | `ASTM_LIVD_AMBIGUOUS_MAPPING` |
| `no-vendor-code` | the first component is filled and there is no vendor code, so nothing was looked up | none                          |
| `no-code`        | the Universal Test ID carried no code at all                                        | none                          |

## Let the catalog answer, not the wire

The first component of the Universal Test ID is a LOINC slot, but the guide the LIVD format comes
from puts sending LOINC directly from instruments out of its scope: the analyte arrives as a vendor
code. So the lookup runs whenever a vendor code is present, keyed on that code, and a filled first
component never answers instead of it. We perform no LOINC validation of any kind, so `Glucose` and
`2345-7` in that slot are treated the same way: carried as `unvalidatedWireValue`, never reported as
a LOINC, and never used as a key.

```ts runnable
import { applyLivd, defineLivdCatalog, parseAstmRecords } from "@cosyte/astm";

const catalog = defineLivdCatalog([{ vendorCode: "687", loinc: "1920-8" }]);
const msg = parseAstmRecords(
  "H|\\^&\rR|1|Glucose^^^687|28.6|U/L||N||F\rR|2|Glucose|28.6|U/L||N||F\rL|1\r",
);
const [withCode, withoutCode] = applyLivd(msg, catalog).annotations;

withCode?.mapping.status; // => "mapped"
withCode?.reportedCode; // => "687"
withCode?.unvalidatedWireValue; // => "Glucose"
withCode?.wireValueDisagreesWithCatalog; // => true

withoutCode?.mapping.status; // => "no-vendor-code"
withoutCode?.reportedCode; // => undefined
```

`wireValueDisagreesWithCatalog` says the two differ and nothing more: both values stay, neither is
marked right, and neither is rewritten. It is `true` only where your catalog vouched for exactly one
LOINC, the first component is filled, and the two are not identical; it is `false` everywhere else
and never absent. Which source to believe is a clinical judgment we leave to you.

## Choose between LOINCs by unit

One vendor code mapping to several LOINCs is the ordinary case: the LIVD guide's own worked examples
include a serum glucose reported as a mass concentration or as a substance concentration. Give each
row a `representativeUnit`, and the units the result reports choose between them:

```ts runnable
import { applyLivd, defineLivdCatalog, parseAstmRecords } from "@cosyte/astm";

const glucose = defineLivdCatalog([
  { vendorCode: "GLU", loinc: "2345-7", representativeUnit: "mg/dL" },
  { vendorCode: "GLU", loinc: "14749-6", representativeUnit: "mmol/L" },
]);
const msg = parseAstmRecords(
  "H|\\^&\rR|1|^^^GLU|5.5|mmol/L||N||F\rR|2|^^^GLU|99|MG/DL||N||F\rL|1\r",
);
const [byUnit, noMatch] = applyLivd(msg, glucose).annotations.map((a) => a.mapping);

byUnit?.status === "mapped" ? byUnit.loinc : undefined; // => "14749-6"
byUnit?.status === "mapped" ? byUnit.unitComparison?.comparison : undefined; // => "verbatim-case-sensitive"
byUnit?.status === "mapped" ? byUnit.unitComparison?.ucumSemantic : undefined; // => false

noMatch?.status === "ambiguous" ? noMatch.reason : undefined; // => "no-candidate-matched-units"
noMatch?.status === "ambiguous" ? [...noMatch.candidates] : []; // => ["2345-7", "14749-6"]
```

The comparison is verbatim and case sensitive, and it is not UCUM. Nothing is normalized, case
folded, scaled or converted on either side, so `MG/DL` does not match `mg/dL`, and `g/L` never
matches `mg/dL` however convertible they are. UCUM asks a program claiming full conformance to
compare units by their meaning; we make no such claim, and every answer a unit chose says so in
`unitComparison`.

When a unit cannot decide, the answer is `ambiguous`, with every candidate listed and no LOINC
chosen: the units match no candidate, match more than one, or were not reported or not readable
(absent, empty, whitespace only, or lost to a malformed record). `reason` says which, and
`candidateDetails` carries each candidate row so a person can choose.

A few rules about the unit attributes:

- A candidate whose `representativeUnit` is absent, empty or whitespace only is never chosen by a
  unit, and is still listed among the candidates.
- A vendor code with exactly one candidate LOINC is answered whether or not the units agree, with no
  `unitComparison`, because no unit chose anything.
- On a `mapped` answer, `representativeUnit` describes the catalog row, not the record. Where several
  rows give the same LOINC with the unit spelled differently, the answer takes the first row's
  attributes. Only `unitComparison` says the record's units matched; branch on that.
- `vendorSpecimenDescription` and `vendorResultDescription` are carried as written and never matched
  on: the LIVD guide says that text is not meant to be parsed by software that automates the
  mapping.

All three attributes are optional, and a catalog with none of them answers as if they did not exist.

## Say which publication the mapping came from

Four optional values describe the publication the rows came from: who published it, its version,
the LOINC version the mapping was made against, and the LOINC copyright statement.

```ts runnable
import { applyLivd, defineLivdCatalog, parseAstmRecords } from "@cosyte/astm";

const catalog = defineLivdCatalog([{ vendorCode: "687", loinc: "1920-8", loincLongName: "AST" }], {
  publisher: "Example Diagnostics",
  publicationVersion: "LIVD-2026-01-A",
  loincVersion: "2.78",
  loincCopyright:
    "This content LOINC® is copyright © 1995 Regenstrief Institute, Inc. and the LOINC Committee, and available at no cost under the license at http://loinc.org/terms-of-use",
});
const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");

applyLivd(msg, catalog).annotations[0]?.catalogLoincVersion; // => "2.78"
catalog.publication?.publisher; // => "Example Diagnostics"
catalog.warnings?.length; // => 0
```

The LOINC version rides on every annotation the catalog produces, whatever the lookup answered, so a
stored mapping records what it was made against. The LOINC license requires a statement of
attribution and notice that LOINC content is copyrighted, and `loincCopyright` keeps your statement
beside the mappings it covers.

Leaving out the LOINC version is allowed: the catalog is built and answers as before, and
`catalog.warnings` holds one value-free `ASTM_LIVD_CATALOG_NO_LOINC_VERSION` warning.

We validate none of these four values. Each is stored as you supplied it, and `catalogLoincVersion`
never means a LOINC was checked against that version. Carrying an attribution statement is not
making one: the license obligations stay yours.

## Scope the catalog to your analyzers

The Universal Test ID carries no manufacturer, so the catalog is keyed on the vendor code alone. Two
different instruments that use the same code for different analytes would both match. Build the
catalog for the analyzers you actually receive from. Conflicting rows within one catalog are caught
and answered `ambiguous`.

## Write your own catalog

`LivdCatalog` is an interface, so you can implement `lookup` against your own terminology service
instead of calling `defineLivdCatalog`. Two rules apply to such a catalog: a `lookup` that throws
reaches your caller unchanged, so your own failure is never read as "not in the catalog"; and a hit
whose `loinc` is an empty string is treated as a miss.

## Reference

- [`defineLivdCatalog`](./api/README.md#definelivdcatalog), [`applyLivd`](./api/README.md#applylivd)
  and [`lookupLivdForRecord`](./api/README.md#lookuplivdforrecord)
- [`LivdCatalog`](./api/README.md#livdcatalog), [`LivdMapping`](./api/README.md#livdmapping),
  [`LivdAnnotation`](./api/README.md#livdannotation) and
  [`LivdPublication`](./api/README.md#livdpublication)
- [`LIVD_WARNING_CODES`](./api/README.md#livd_warning_codes)
