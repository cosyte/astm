---
"@cosyte/astm": patch
---

Vendor profile system — engine + registry + quirk tolerance + a definition-time safety gate (ASTM-8,
roadmap Phase 8). `src/profiles/` mirrors the sibling `@cosyte/hl7` `defineProfile` / `@cosyte/ccda`
`defineCcdaProfile` shape (`name` / `lineage` / `describe()` / `extends`-merge, a provenance-backed
built-in registry, a runtime tolerance transform, and a definition-time safety gate).
`defineAstmProfile(opts)` builds a frozen, immutable profile that declares the **non-safety-critical**
warning codes a class of real-world ASTM streams is expected to trip — each with a grounded
`rationale` — plus an optional `transport` override (`"framed"`/`"raw"`), the raw-vs-framed-TCP knob a
consumer feeds to `detectFraming(bytes, { override })`.

**A profile never alters an extracted value.** The runtime transform (`applyAstmProfileToWarnings`, run
last in `parseAstmRecords`) only ever re-badges a warning it *expects* to the new
`PROFILE_QUIRK_APPLIED` code (flagged `expected: true`, carrying the original `toleratedCode` and
position) — nothing is dropped, and a spec-clean message parses byte-identically with or without a
profile. **The safety gate is default-deny and total:** only four benign, value-preserving record codes
are tolerable (`ASTM_RECORD_UNKNOWN_TYPE`, `ASTM_NONSTANDARD_DELIMITERS`, `ASTM_UNKNOWN_ESCAPE_SEQUENCE`,
`ASTM_RECORD_UNINTERPRETED_QUERY_STATUS`); **every other code across all three registries — record,
frame (`ASTM_FRAME_*`), and LTP (`ASTM_LTP_*`) — is safety-critical and refused at definition time**
with an `AstmProfileDefinitionError`, so a profile can never make a bad checksum "ok," a cancelled
result read "final," or quiet a wrong value / flag / status / range / units / patient or comment
context / message-kind ambiguity. Any warning code added in a future phase is safety-critical **by
default** until deliberately added to the allow-list.

`parseAstmRecords(raw, { profile })` accepts an explicit profile; `{ profile: null }` opts out of the
process-scoped default (`setDefaultAstmProfile`); an `expected` quirk does **not** escalate in `strict`
mode. `AstmMessage` gains an additive `profile?: { name, lineage }` attribution.

**Built-ins:** `astmProfiles.default` (tolerates nothing) + `astmProfiles.referenceCorpus` — a
**non-vendor**, evidence-backed profile grounded firsthand in the redistributable OSS reference corpus
(`kxepal/python-astm` `codec.py` (BSD) + `senaite.astm`, which split on raw delimiters and never
un-escape `&F&`/`&S&`/`&R&`/`&E&`), tolerating only the resulting non-standard-escape *syntactic* noise
(the value is preserved byte-for-byte). **Named per-vendor profiles** (cobas / Sysmex / …) are
**deferred** (`REAL-CORPUS`): the engine fully supports them, but no public vendor-attributed quirk
document grounds a named one, and firsthand inspection of the public corpus found the record layer
spec-clean.

New warning code `PROFILE_QUIRK_APPLIED`. New exports: `defineAstmProfile`, `AstmProfileDefinitionError`,
`astmProfiles`, `getAstmProfile`, `listAstmProfiles`, `setDefaultAstmProfile`, `getDefaultAstmProfile`,
`applyAstmProfile`, `applyAstmProfileToWarnings`, `resolveProfileTransport`, `profileQuirkApplied`,
`SAFETY_CRITICAL_CODES`, `TOLERABLE_CODES`, `ALL_ASTM_WARNING_CODES`, `isSafetyCriticalCode`, and the
`AstmProfile`, `DefineAstmProfileOptions`, `AstmQuirkTolerance`, `AstmQuirkMatch`,
`AstmProfileProvenance`, `AnyAstmWarningCode` types. Deferred: LIVD terminology (P9), release hardening
(P10).
