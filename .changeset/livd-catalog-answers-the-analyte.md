---
"@cosyte/astm": minor
---

**BREAKING: a populated first component no longer bypasses your LIVD catalog, and is no longer reported as a LOINC.** The Universal Test ID's first component is a LOINC slot that the governing mapping guide puts out of scope for instrument traffic: the analyte arrives as a vendor-defined code, and a LOINC is what a consumer maps to afterwards. This package used to answer the analyte-identity question from that slot instead, tagging any non-empty first component as an inline LOINC candidate with no evidence at all and returning it without ever consulting the catalog, so a record reading `R|1|Glucose|28.6|U/L||N||F` reported a LOINC candidate of `Glucose`. That is defect 9 in this repo's register, and it is closed here.

The catalog is now consulted whenever a vendor local code is present, keyed on that code alone, and a first-component value is carried verbatim as a value this library does not vouch for. No shape test was added and none is coming: this package performs **no LOINC validation of any kind**, so `2345-7` and `Glucose` in component 1 are treated identically and the routing is positional throughout.

Public values REMOVED or RENAMED, with their replacements:

- `UniversalTestId.loincCandidate` is **removed**. Its replacement is `UniversalTestId.unvalidatedWireValue`: the same verbatim component 1 value, under a name that vouches for nothing.
- The `"inline-loinc-candidate"` provenance token is **removed** from `UniversalTestIdProvenance`. A record with a populated component 1 **and** a vendor local code is now `"local-code"`, because the local code is the identifier. A record with a populated component 1 and **no** vendor local code is the new token `"unvalidated-wire-value-only"`, which reports that the value was seen without claiming it is a code.
- The `LivdMapping` variant `{ status: "inline-loinc", loinc, source: "wire" }` is **removed**. There is no disposition that reports a wire value as a LOINC. Its positional replacement is the new variant `{ status: "no-vendor-code" }`, which says a populated component 1 arrived with no vendor local code to look up. The four retained dispositions (`mapped`, `unmapped`, `ambiguous`, `no-code`) keep their documented meanings exactly; only which inputs reach them changed.

Public values whose BEHAVIOR changed while keeping their name:

- `primaryCode()` now returns the vendor local code and nothing else. Where it used to answer with a first-component value it now returns `undefined`, which is the same absence it has always returned for a record carrying nothing usable, and which its callers already had to handle. This is a breaking change with no compile error behind it: audit every call site. The fail-safe direction is deliberate, it now reports no key rather than a key the library cannot vouch for.

Added:

- `LivdAnnotation.unvalidatedWireValue`: the verbatim first-component value, present on **every** disposition and absent only when component 1 is empty.
- `LivdAnnotation.wireValueDisagreesWithCatalog`: `true` if and only if the catalog vouched for exactly one LOINC, component 1 is populated, and the two are not byte-identical. `false` in every other case, never absent. It reports the difference and nothing else: both values stay surfaced, neither is marked correct, and no field says the difference was settled.
- `LivdAnnotation.reportedCode` is now always the code the catalog was actually consulted with, and is absent when nothing was looked up.

Two fail-safe corners are now stated and tested: a consumer catalog whose `lookup` throws propagates unchanged rather than reading as a catalog miss, and a hit whose LOINC is a zero-length string is reported as a miss rather than as a vouched-for empty LOINC.
