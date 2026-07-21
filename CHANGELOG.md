# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions and publishing are managed with [Changesets](https://github.com/changesets/changesets);
this file is maintained by hand (Changesets handles the version bump and publish only).

## [Unreleased]

The first pre-alpha release (`0.0.1`) will ship the initial public API surface. The package begins
its public history at `0.0.x`, per the cosyte version ladder (`0.0.x` until first alpha).

### Added

- Project scaffold from the shared `@cosyte/*` parser template: the canonical toolchain (TypeScript
  ES2023 + strict rigor via `@cosyte/tsconfig`, ESLint 10 + type-checked `typescript-eslint` via
  `@cosyte/eslint-config`, Prettier via `@cosyte/prettier-config`, Vitest 4 + v8 coverage via
  `@cosyte/vitest-config`, dual ESM + CJS build via `tsup` + `@cosyte/tsup-config`, `attw` publish
  gate), thin callers of the reusable `cosyte/.github` CI/release workflows, Changesets on the
  `0.0.x` ladder, and the property-based conformance harness from `@cosyte/test-utils`.
- **Record foundation (ASTM-1, roadmap Phase 1).** The record-content layer: parse an ASTM/CLSI-LIS02
  record stream and pull result value + units + flag in one line.
  - `parseAstmRecords(raw, opts?)` → an immutable, deeply-frozen `AstmMessage`; `results(msg)` /
    `patient(msg)` typed extractors.
  - **Delimiter self-declaration** — the four delimiters (field / repeat / component / escape) are
    read from each `H` record, never hardcoded, with ASTM's `\`=repeat and `&`=escape mapping.
  - **Escape codec** — `&F&`/`&S&`/`&R&`/`&E&` are decoded via escape-aware split-then-decode, so a
    value containing an escaped component delimiter reads as **one** component (the documented
    silent-misread class the OSS references exhibit). Re-escaping is deferred to the emit phase (P7).
  - Modeled records: `H` (delimiter provenance), `P` (identity — practice-assigned ID and
    laboratory-assigned ID kept **distinct**), `O` (accession + Universal Test ID), `R` (all 14
    fields; value / units / flags / status surfaced **raw**), `L`. Unknown record types surface as
    `unsupported` records with a warning, never dropped.
  - `/common` value layer: delimiter model, escape codec, precision-preserving `YYYYMMDDHHMMSS` date
    value (no-UTC, partial dates are not errors), Universal Test ID code-system provenance
    recognition (`[OSS-derived]` field order), the deep-freeze base, and the warning/fatal registry.
  - Fatal codes: `EMPTY_INPUT` (shared), `ASTM_RECORD_NO_HEADER`, `ASTM_RECORD_UNDECLARED_DELIMITERS`.
    Warning codes: `ASTM_RECORD_UNKNOWN_TYPE`, `ASTM_NONSTANDARD_DELIMITERS`,
    `ASTM_UNKNOWN_ESCAPE_SEQUENCE`, `ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT` — all carry stable code +
    value-free positional context.
  - **Fail-safe on an unescaped component delimiter in a result value:** the full raw value and the
    component split are both surfaced and an `ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT` warning fires — the
    primary `value` is never silently truncated to the first component.
  - `scripts/phi-scan.ts` extended toward the P-record loci (name + DOB, delimiter-aware); synthetic
    fixtures declared in `scripts/phi-allow-list.txt`.
- Public exports replace the scaffold stubs: `parseAstmRecords`, `results`, `patient`,
  `AstmParseError`, `AstmStrictError`, the record/value model types, and the `WARNING_CODES` /
  `FATAL_CODES` registries.
- **Safety-critical result semantics (ASTM-2, roadmap Phase 2).** The raw `R`-record letters that
  Phase 1 surfaced are now modeled into fail-safe semantics, under one rule — _never a confident wrong
  value_. The raw strings (`abnormalFlags`, `resultStatus`, `referenceRange`, `units`) still coexist
  with the modeled views; nothing is collapsed or reconciled.
  - **Abnormal flags (field 7) → HL7 Table 0078.** `interpretAbnormalFlag()` and the `flag` field on
    `ResultRecord` model the full value set: `L`/`H`, panic `LL`/`HH`, off-scale `<`/`>`, `N`, `A`/`AA`,
    the **directional** significant-change `U` (up) / `D` (down) — _not_ units/delta — `B`/`W`, and
    microbiology `S`/`R`/`I`. An **unrecognized** flag is surfaced as `meaning: "undefined"` with an
    `ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG` warning — **never dropped, never coerced to `normal`**.
  - **Result status (field 9).** `interpretResultStatus()` and the always-present `status` field model
    `F`/`C`/`P`/`R`/`S`/`I`/`X`, with **`C` correction** (`supersedes: true`) and **`X` cancel**
    (`cancelled: true`) so a superseded/cancelled result can **never** read as current — `isActiveFinal`
    is `true` only for a plain `F`. An **absent** status is typed `unspecified` (never assumed `final`);
    an unrecognized one is `undefined` + `ASTM_RECORD_UNDEFINED_RESULT_STATUS`.
  - **Reference range (field 6).** `parseReferenceRange()` and the `range` field parse `low-high`
    (closed), `<high` (open-low), and `>low` (open-high); bounds are surfaced as **verbatim numeric
    text** (never coerced to floats). The range is read from the **full field text**, so a
    component-delimited value (`low^high`) is preserved verbatim and read as `unparsed` — never
    truncated to a single bound. An unparseable range is `kind: "unparsed"` +
    `ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE` — **no bound is fabricated**. The exact delimiter is
    `[OSS-derived]` pending the purchased CLSI LIS02-A2 (roadmap §10 Q1).
  - **Units discipline (field 5).** A _numeric_ result value with no units raises
    `ASTM_RECORD_UNITS_ABSENT`; units are vendor free text (not UCUM) and are **never defaulted,
    guessed, or converted**.
  - New warning codes (registry extended, snapshot locked): `ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG`,
    `ASTM_RECORD_UNDEFINED_RESULT_STATUS`, `ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE`,
    `ASTM_RECORD_UNITS_ABSENT` — all value-free (code + record/field index only).

### Changed

- **Breaking (pre-alpha):** the archetype stub `parseAstm` / `ParsedAstm` is replaced by
  `parseAstmRecords` / `AstmMessage`; the placeholder `WARNING_CODES` / `FATAL_CODES` entries are
  replaced by the real Phase-1 registries.

### Deferred (later phases)

- Patient/order identity **depth**, the `C` comment record, and partial-timestamp hardening — Phase 3.
  Query (`Q`) + host-query flow and `M` / `S` surfaced verbatim — Phase 4. The E1381 framing layer
  (checksums, 240-split) — Phase 5+. Serialize / build — Phase 7.

### Deprecated

### Removed

### Fixed

### Security

[Unreleased]: https://github.com/cosyte/astm/commits/main
