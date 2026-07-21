---
"@cosyte/astm": patch
---

LIVD-aware LOINC recognition — bring-your-own catalog, zero bundled terminology data (ASTM-9, roadmap
Phase 9). The new `src/terminology/` layer maps an analyzer's local test code (the vendor/local code in
the Universal Test ID on `R`/`O` records) to a standard **LOINC** via a **consumer-supplied** IICC LIVD
("LOINC to Vendor IVD") catalog — **additive, advisory, and never a guessed LOINC** (a wrong LOINC
mis-identifies a test, so this is safety-critical).

`defineLivdCatalog(entries)` builds an immutable, deeply-frozen catalog indexed by the **Vendor Analyte
Code** (the vendor transmission code the instrument sends — exactly the local code an ASTM analyzer puts
in the Universal Test ID), grounded firsthand on the IICC LIVD digital format / HL7 LIVD IG.
`catalog.lookup(code)` returns `mapped` (a single LOINC), `unmapped` (a miss), or `ambiguous` (a code
matching more than one **distinct** LOINC — surfaced with its candidates but **never resolved to one**).

`applyLivd(msg, catalog)` produces a **separate** layer of per-`R`/`O` `LivdAnnotation`s and **never
mutates, alters, or drops** the raw reported code/value (the never-alter discipline). A catalog hit is
labeled `derived: true` (`source: "livd"`); an inline LOINC already carried on the wire is surfaced
`source: "wire"` and is **never overwritten** by the catalog; a miss or conflict is `unmapped` /
`ambiguous` with a **value-free** warning — a LOINC is **never** fabricated.
`lookupLivdForRecord(record, catalog)` annotates a single record.

**No LOINC / SNOMED / LIVD data is bundled** (roadmap §5, verified firsthand): LOINC is © Regenstrief —
redistributable only _with its attribution notice_, not public-domain — and the public CDC LIVD file is
a **SARS-CoV-2-specific** publication that also carries separately-licensed SNOMED CT, not a
general-analyte public-domain catalog. The package stays a structural recognizer, not a dictionary; the
consumer supplies the LIVD data and owns its license obligations.

New `ASTM_LIVD_*` warning registry (`ASTM_LIVD_UNMAPPED_CODE`, `ASTM_LIVD_AMBIGUOUS_MAPPING`) — a
fourth, self-contained registry deliberately outside the profile safety gate's universe (a LIVD
non-mapping is a post-parse advisory, not a parse-time deviation a vendor profile could ever tolerate).
New exports: `defineLivdCatalog`, `applyLivd`, `lookupLivdForRecord`, `LIVD_WARNING_CODES`,
`livdUnmappedCode`, `livdAmbiguousMapping`, and the `LivdCatalog`, `LivdEntry`, `LivdLookup`,
`LivdAnnotation`, `LivdMapping`, `LivdResult`, `AstmLivdWarning`, `LivdWarningCode` types.
