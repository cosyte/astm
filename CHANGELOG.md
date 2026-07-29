# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions and publishing are managed with [Changesets](https://github.com/changesets/changesets);
this file is maintained by hand (Changesets handles the version bump and publish only).

## [Unreleased]

### Added

- **`pnpm check:no-internal-refs` + a `no-internal-refs` CI job** (`PUBLIC-SURFACE-HYGIENE`,
  founder directive 2026-07-27). Internal only; no change to the published package surface. `astm` was
  the last parser with no gate on this rule at all, which is why the class had regrown. The script is
  ported from `ncpdp`'s copy (which carries three fixes `hl7`'s reference lacks: the `src/`
  string-literal pass, the plural `phases?` stem, and `/` in the ADR separator class) plus `cli`'s
  seventh rule, the prose roadmap citation, which neither `hl7` nor `ncpdp` has and which found the
  second-largest class here. Four surfaces are scanned against seven rules: public markdown +
  the npm `description`/`keywords`, `src/` doc comments, and `src/` string literals. The two prose
  surfaces are scanned line by line **and** paragraph-reflowed, so a violation that straddles a wrap
  is still caught; the npm metadata and the string-literal pass are line-scanned only. A multi-line
  template literal is not scanned at all, split or not, because the extractor needs both delimiters
  on one line. `//` comments, `CHANGELOG.md` and `.changeset/` are deliberately out of scope:
  the convention names them as where identifiers belong.

  Re-derived for this repo rather than copied: rule 2 now excludes E1381/CLSI-LIS01's own
  **protocol phases** (`protocol`, `three-`, `establishment`, `transfer`, `termination`, `neutral`,
  `idle`), because "phase" is the standard's word for the state of the line and `LtpState.phase` is an
  exported field. The cost is disclosed rather than papered over: because a lookbehind exempts the
  whole match, one of our own phases sitting behind one of those words is not caught (`the transfer
phase 8` passes while `Phase 8` reds). An arm keyed on a following digit was written, measured and
  removed, because the justification did not survive the corpus: the digit is usually the next
  clause's first token, so it red on `In the transfer phase 240 bytes is the maximum frame text` and
  on `a three-phase 400 V supply`, which are reference prose. Where a rule cannot be guarded, it is
  cut rather than hardened. And the `SPEC-7` /
  `ACC-42` synthetic example ids in every runnable sample are
  `WORD-N` exactly, so a shape-keyed rule would rewrite the sample a consumer copy-pastes. Both are
  asserted in negative self-tests, alongside `ASTM-E1394`, `CLSI-LIS01`, `LIS02-A2`, `POCT1-A`,
  `E1394-97` and `ICD-10-CM`. A further negative self-test pins **bare `§` section citations as
  deliberately unruled**, so closing that hole has to be a decision rather than a widening that lands
  by accident.

  The script also **refuses to run under a `grep` that cannot see its subject.** A scanner-visibility
  probe seeds a violation into a file containing a NUL byte and requires it to come back as either a
  hit or a stderr diagnostic; silence at exit 0 is a hard refusal, because a tool that skips a file
  produces output identical to a tool that read it and found it clean. This is not theoretical: the
  development container interposes a `grep` with `-I` forced, which drops such input without a word.
  An interposed shell function is also `unset` rather than assumed absent. Both directions are
  proven — an `-I`-forcing `grep` ahead of it on `PATH` makes the gate refuse, and an exported `grep`
  function is neutralised. The companion `-G` (basic-regex) hazard needs no separate guard: every
  positive self-test uses alternation, so a BRE-forced `grep` fails them and refuses.

  Known gaps, stated rather than discovered later: a bare `P\d+` label (`(P7)`) is not caught, because
  a general `P\d+` rule has corrupted ICD-10-CM codes in a sibling; `phase` at the end of a clause is
  not caught; bare `§` section citations are deliberately unruled; and `dist/` is build output this
  script cannot read, so it gates dist's source, not dist. Fourteen `P\d+` lines and the falsehoods
  below were found by hand, not by a rule.

### Fixed

- **`parseAstmRecords` now reads the delimiters from every `H` record, not only the first, so a
  stream carrying more than one message no longer silently loses fields** (`ASTM-SECOND-HEADER-COLLAPSE`;
  shipped `0.0.1` through `0.0.3`, `PRE-EXISTING`, not a regression). This is the same silent field
  collapse as `ASTM-MIXED-DELIMITER-EMIT` one layer over, on the **parse** side, which is why #21 did
  not narrow it: #21 fixed what we write, and a stream arriving with two headers is mis-read on the
  way **in**, before any of that runs.

  A message runs `H` … `L`, so one stream may carry several back to back and each header declares the
  delimiters for the records that follow it. Delimiters were read only from `records[0]` and applied
  to the whole stream, so every record after a redeclaring header **collapsed into a single field,
  with zero warnings**, and `{ strict: true }` accepted it. Measured by execution on `dc09a3a` before
  the fix: in a two-message stream whose second header declared `*~:#`, the second result — value
  `99.9`, units `mmol/L`, abnormal flag `H`, status `F` — came back with `value`, `units`, `flag` and
  `resultStatus` **all absent** and `status` reading `unspecified`. On the analyzer↔LIS path that is a
  lost result with no signal to the caller.

  **The decision, and its grounding.** Delimiters are now scoped **forward from each header**: a later
  `H` governs itself and the records after it, until the next `H`. The asymmetry with the emit bug is
  real — on emit the library was corrupting its own output, so re-encoding was unambiguously safe,
  whereas on parse the bytes are the sender's and a second `H` is legal. What settles it is that
  forward scoping is the **only** reading that never reinterprets bytes already consumed: records
  before a redeclaration keep the set they were read with, so the two sets never disagree about the
  same bytes. "First header wins forever" is the collapse itself; "last header wins retroactively"
  would require re-reading records already delivered.

  **Evidence, labelled.** The message unit is `H` … `L` — _verified primary_: LIS02-A2 §2 makes the
  message a **bounded unit**, one record type opening it and another closing it, which is why a second
  `H` begins a new message rather than corrupting the current one. Read directly in CLSI's own free
  sample of the document. (Stated in our own words on purpose. We may read and cite the standard but
  never reproduce its prose, and `CHANGELOG.md` ships inside the npm tarball — an earlier draft of
  this entry quoted the clause verbatim and was caught in review.) That a header may follow a
  terminator to start another message — _verified secondary_, two independent restatements of the
  terminator clause (Roche cobas b 121 ASTM interface description; Genaux, _Introduction to ASTM
  Message Formats_, 2024).
  That a header's delimiters govern "the message" — _verified secondary_ (Genaux; Stratford Software
  interface spec), which leans per-message but **does not address a redeclaration that changes the
  set**. **We could not reach the normative text on that specific question**: LIS02-A2 §5.4
  (Delimiters) and §6.2 (Delimiter Definition) are precisely the clauses withheld from the free
  sample, and E1394-97 and LIS01-A2 stayed paywalled. So the forward-scoping rule is recorded as a
  **reasoned choice, not a citation** — no clause number is claimed for it, and we do not assert the
  standard is silent either, because that would need the same evidence.

  The OSS reference corpus cannot ground this one and is reported as a negative result rather than
  dressed up: `kxepal/python-astm` and `senaite.astm` both hardcode `|\^&` as module constants, never
  read the header's declaration at all, and neither tracks `H` … `L` boundaries — so differential
  testing against them is uninformative here.

  **Behaviour.** A redeclaration that **changes** the set is honored and raises
  `ASTM_RECORD_DELIMITERS_REDECLARED`. A header that merely **restates** the set in force is a no-op
  and raises nothing — several messages in one delimiter set is an ordinary shape, and warning on it
  would be noise. A later header whose declaration is **unusable** (too short, or a field separator
  that also names another role) keeps the set already in force and raises
  `ASTM_RECORD_UNREADABLE_REDECLARATION`; a set is never guessed and no record is dropped. The same
  condition on the _first_ header remains the `ASTM_RECORD_UNDECLARED_DELIMITERS` fatal — there is no
  earlier set to fall back to, and that is pinned by a test so it cannot be softened by accident.

  **Surface.** Two new stable warning codes (`ASTM_RECORD_DELIMITERS_REDECLARED`,
  `ASTM_RECORD_UNREADABLE_REDECLARATION`) with `delimitersRedeclared` / `unreadableRedeclaration`
  factories, both **safety-critical** by the profile gate's default-deny rule, so no profile can quiet
  them (asserted). `HeaderRecord.delimiters` now reports the set **that** header put into force rather
  than always the first header's; `AstmMessage.delimiters` is unchanged and stays the first header's.
  The sites that _stated_ the old single-header rule were swept — the `parseAstmRecords` JSDoc, the
  module header, `HeaderRecord`/`AstmMessage` type docs, `readDelimiters` (whose doc comment said the
  caller escalates an unusable declaration to the fatal, true only of the first header now), and
  `docs-content/quickstart.md` — because on #21 the refuter's first pass was refused for exactly the
  opposite failure: correct code shipped behind documentation that steered consumers the wrong way.
  The `readDelimiters` comment also said it returns `{ ok: false }` when it has always returned
  `undefined`; that was already wrong before this slice and is corrected in the same paragraph.

  **Deliberately left for their own slices** (both recorded with this item, both **emit**-side, and
  both turning on questions this one does not answer): a delimiter declaration **longer than three
  characters** still loses its extra bytes on emit — what a fourth declaration byte even means is
  unresolved by the same withheld clauses — and `serializeAstmRecords(msg, d)` still does **not
  validate a caller-supplied `d`**, so a malformed set emits a stream this library's own parser then
  rejects or mis-reads, with no typed error. Neither is touched here; folding an emit-side change into
  a parse-side fix would have widened the diff without answering either question.

  **Strict-mode boundary, disclosed as a sample and not a census.** Measured base-build vs head-build
  over 216,699 synthetic streams (the 11 repo fixtures, 464 single-header streams, and multi-header
  pairs across a sampled sweep of delimiter sets): **394 moved accepted→rejected, 0 the other way.**
  All 11 fixtures and all 464 single-header streams were **unchanged**, in strict mode and in their
  lenient warning lists — which matches the code path, since the new warnings can only be raised at an
  `H` record that is not `records[0]`.

- **`serializeAstmRecords` no longer emits a mixed-delimiter stream that silently loses fields on the
  next read** (`ASTM-MIXED-DELIMITER-EMIT`; shipped since `0.0.1`, `PRE-EXISTING`, not a regression).
  Emit normalized the header to the canonical `H|\^&` set but re-emitted `M` (manufacturer) and `S`
  (scientific) records byte-for-byte from `rawLine`. For a message that arrived under a vendor
  delimiter set the output was therefore **non-conformant**: a canonical header above `M`/`S` rows
  still written in the original delimiters. Re-parsing that output **collapsed every field of those
  rows into one, with zero warnings** — on the analyzer↔LIS path, a lost result or a lost
  patient/specimen identifier with no signal to the caller. Verified by execution before and after,
  not by inspection: a five-field `M` row round-tripped to one field.

  **The semantics chosen, and why.** The two candidates were to re-encode every record to the
  delimiters the header declares, or to refuse/warn on a message whose records disagree.
  **Re-encoding was chosen.** It is what the serializer already promises — one spec-clean stream in
  the declared set — and a mixed-delimiter stream is not spec-clean. Emit returns a `string` and has
  no warning channel, so a warning could only have been ignored while the corrupt stream still
  shipped, and a refusal would have rejected messages this library successfully parsed, a harder
  break on a published package. The invariant that had to hold either way is that **a round-trip
  never silently loses a field, in either direction**; it is now pinned by a property over arbitrary
  declared delimiter sets, which fails against the old code. `M`/`S` are reproduced byte-for-byte
  **only when a reader using the emit delimiters would recover exactly the fields the record models**,
  so bytes change for exactly the streams that were being corrupted and for no others. The reasoning
  is recorded at the site in `src/records/serialize.ts`.

- **Editing a modeled `H` field and re-serializing no longer silently keeps the original value**
  (`PRE-EXISTING`, found in the same pass). The header was emitted by re-tokenizing its preserved
  `rawLine`, so the model was bypassed on emit. It is now emitted from `HeaderRecord.fields` like
  every other record type. The delimiter declaration itself is still never taken from the model — it
  always states the delimiters actually being emitted with, because a declaration that disagrees with
  the records around it is the very corruption above.

- **`HeaderRecord.fields` now holds the header's real fields.** The generic escape-aware tokenizer
  reads the escape character sitting _literally_ inside the delimiter declaration as an unterminated
  escape and swallows the remainder of the record, so a canonical header modeled as **two** fields
  (`H` and everything else merged) instead of one per field. A header-aware `tokenizeHeader` takes the
  declaration verbatim as one opaque field and tokenizes the data portion normally; it is exported
  alongside `tokenizeRecord`. This is what made emitting the header from its model possible.

  **A `strict` consumer will observe one side effect, stated rather than left to be discovered.**
  The old tokenizer read the declaration's literal escape char as an unterminated escape and raised a
  spurious `ASTM_UNKNOWN_ESCAPE_SEQUENCE` on some headers, which `{ strict: true }` rejected. Those
  warnings are gone, so a few messages that previously threw now parse. Measured over ~40,000
  differential messages: 1,176 moved from rejected to accepted, **0** moved the other way, and every
  warning delta is confined to `recordIndex 0` — no warning on any other record is added or dropped.

  Three `PRE-EXISTING` neighbours were found while grading this and are deliberately **not** fixed
  here, to keep the slice the size of its item: `parseAstmRecords` reads delimiters only from the
  first header, so a **second `H` mid-stream that redeclares them** still yields the same silent
  field collapse (parse-side, not emit-side — the emitter faithfully reproduces what parse modeled)
  — **since fixed, see the parse-side entry above**;
  a delimiter declaration longer than three characters silently loses its extra bytes on emit; and
  `serializeAstmRecords(msg, d)` does not validate a caller-supplied `d`, so a malformed set (a
  multi-char delimiter, an empty escape, a `field`/`escape` collision) emits a stream this library's
  own parser then rejects or mis-reads, with no typed error.

- **The type documentation shipped in `dist/index.d.ts` no longer understates the library.** The
  entry-point module documentation ended by calling serialize and build deferred, on a tree that exports
  `serializeAstmRecords`, `buildAstmMessage`, `composeAstmFrames` and `serializeFramedAstm`, and the
  record-types module documentation described only `H`/`P`/`O`/`R`/`L` as modeled, naming
  result-flag/status semantics, comment, query, `M`/`S`, framing and serialization as still to come,
  when all of them are modeled. Both
  blocks are carried verbatim in `dist/index.d.ts` and `dist/index.d.cts`, which is what an installer
  receives. (They are module-level blocks that bind to no exported symbol, so they sit in the
  declaration text rather than in any symbol's editor tooltip.) Every affected block now describes
  what the code does. 18 source files changed; no runtime behaviour, export, type or warning code is
  affected.
- **The fatal-error taxonomy is now accurate about what `err.code` can hold.** `FATAL_CODES`
  documented itself as later growing the frame codec's own `ASTM_FRAME_*` fatals. `FatalCode` is a
  closed three-value union and the frame codec does not widen it: it reuses `EMPTY_INPUT` for an
  empty stream, and its own thrown errors are separate types with their own discriminants
  (`AstmFrameEncodeError` carries `ASTM_FRAME_EMPTY_RECORD`; `AstmFrameStrictError` carries the
  rejected warnings rather than a `code`). Narrowing an `AstmParseError` on `code` will only ever
  see one of the three.
- **The serializer's round-trip note now names the cases that do not round-trip.** It claimed
  serialization emits from the decoded component tree. Three record types do not: `H`, `M` and `S`
  are emitted from their preserved `rawLine`, so an edit to their modeled `fields` is silently not
  reflected on emit -- editing a header field and re-serializing keeps the original value, with no
  warning. `M`/`S` additionally keep whatever delimiters they arrived with, so a non-canonical
  `M`/`S` row does not come back as separate fields. Normalization to `H|\^&` is also skipped when a
  delimiter set is passed explicitly. All of it is now stated next to the round-trip claim it
  bounds, and `serializeAstmRecords` gained the `@param d` its siblings already had.

- **The published documentation sidebar now follows the shared section order.** The shipped
  `docs-content/sidebars.json` carried a category named "About" holding the "what it does and does not
  do" page. That label is not one of the sections the documentation site recognises (Overview,
  Installation, Quickstart, Core Concepts, Guides, API Reference, Troubleshooting), so `docs.cosyte.com`
  rendered this package with a section no other `@cosyte/*` package has. The page now sits under
  **Troubleshooting**, beside the troubleshooting guide that already links to it, matching how
  `@cosyte/mllp` files the same page. The page's own URL is unchanged, so existing links to it still
  resolve. Both released documentation bundles (`v0.0.1` and `v0.0.2`) carry the old layout and cannot
  be changed, because a release asset is immutable once published; this correction reaches readers with
  the next release.
- **The status note no longer quotes a version number that a release makes wrong.** `README.md`,
  `docs-content/intro.md` and `docs-content/installation.md` each opened with "published on npm at
  `0.0.1`" while the package was at `0.0.2`. Nothing bound those sentences to the manifest, so every
  publish falsified them, and the two documentation pages ship inside the release bundle the
  documentation site re-fetches forever. They now say the package is published and name the `0.0.x`
  pre-alpha ladder, and leave the exact version to the registry, where it cannot go stale. The
  exported `VERSION` constant is unaffected: it is generated from `package.json` at release time and
  asserted equal to it.

## [0.0.2] - 2026-07-27

### Fixed

- **Publish status corrected across the public surface.** `@cosyte/astm` has been published on npm at
  `0.0.1` since 2026-07-22 and the repository is public, but `README.md`, `docs-content/intro.md`, and
  `docs-content/installation.md` each still opened with "pre-alpha (`0.0.x`), not yet published to
  npm" (and the installation page told readers to consume the package from source instead). Those
  three status blocks, plus the project guide, now state the real published version. The install
  instructions no longer describe a package that does not exist.
- **`VERSION` no longer lies about the release.** The published `0.0.1` exported `VERSION === "0.0.0"`
  while `package.json` read `0.0.1`, which the documented install smoke test (print `VERSION`) surfaces
  directly to an installer. The constant is corrected to `0.0.1`, `scripts/sync-version.mjs` now
  rewrites it from `package.json` inside the release `version` script, and `test/sanity.test.ts`
  asserts the two agree so a skipped sync fails the build instead of shipping. The declaration is now
  annotated `: string` (matching `@cosyte/hl7`), so the emitted type is `string` rather than the
  version literal.
- Removed `cosyte-astm-0.0.0.tgz`, a 307 KB `pnpm pack` artifact committed to the repository root that
  carried a stale `0.0.0` `dist/`, and added `*.tgz` to `.gitignore` so pack output cannot be
  committed again.

### Changed

- The `README.md` status block is replaced by a "What it covers" summary of the record, framing and
  transport, emit, profile, and terminology layers. Per the public-surface rule, a README describes
  what the software does, not our internal phase numbering; the ASTM designations `E1381` and `E1394`
  are reference material and stay. Same removal of internal cross-references a reader cannot follow
  from `docs-content/limitations.md` and `docs-content/quickstart.md`, leaving the surrounding
  sentences intact.
- The released `0.0.1` entries now sit under a dated `## [0.0.1] - 2026-07-22` heading with a link to
  its tag, instead of sitting under `[Unreleased]` behind a sentence saying `0.0.1` "will ship".

## [0.0.1] - 2026-07-22

The first pre-alpha release. The package begins its public history at `0.0.x`, per the cosyte version
ladder (`0.0.x` until first alpha).

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
- **Patient/order identity depth, comments, and partial-timestamp hardening (ASTM-3, roadmap Phase 3).**
  The misfiling-prevention slice: model the identity that a result files against, and the context that
  qualifies it.
  - **Full patient (`P`) identity.** The **practice-assigned ID (field 3)**, the **laboratory-assigned
    ID (field 4)**, and a **third patient ID (field 5)** are modeled as **distinct** fields that never
    collapse into one — conflating them is the primary result-misfiling path. Adds mother's maiden name
    (field 7) alongside the existing name components (field 6), birthdate (field 8), and sex (field 9).
  - **Full order (`O`).** `priority` (field 6), `actionCode` (field ~12), and `reportType` (field ~26)
    are surfaced **verbatim** on top of the existing specimen/accession + Universal Test ID. The `~`
    field indices and the code sets are `[OSS-derived]` (paywalled) — never mapped to a guessed meaning.
  - **The `C` (comment) record.** Modeled as `source` (field 3), `text` (field 4, component-capable —
    the full text is surfaced plus the component split, never truncated), and `commentType` (field 5).
    Each comment is **attached by position** to the immediately-preceding `H`/`P`/`O`/`R` parent
    (`parentIndex`); consecutive comments share that parent. **Fail-safe:** an **orphan** comment with no
    valid parent is attached to the message root (`attachedToRoot: true`) with an
    `ASTM_RECORD_ORPHAN_COMMENT` warning — **never silently dropped**. New extractors `comments(msg)` /
    `commentsFor(msg, record)` / `orders(msg)`, and the pure `attachComments()` attachment pass.
  - **Comment-type codes are `[OSS-derived]`.** `I` (instrument) is the only value seen in the
    permissively-licensed real transcripts; `G`/`T`/`P` are defined only in the paywalled CLSI LIS02-A2
    and are **not** interpreted — `commentType` is surfaced raw, never mapped to a guessed meaning.
  - **Partial-timestamp hardening.** A `YYYYMMDDHHMMSS` value with an odd digit run that truncates a
    two-digit component (lengths 5/7/9/11/13) sets `AstmDate.truncated`, is preserved verbatim in `raw`,
    and stops at the last **complete** component — the dangling digit is **never zero-filled into a
    fabricated time**. A caller surfaces this as a value-free `ASTM_RECORD_PARTIAL_TIMESTAMP` warning
    (P field 8, R fields 12/13). No timezone is modeled — times stay instrument-local, never assumed UTC.
  - New warning codes (registry extended, snapshot locked): `ASTM_RECORD_ORPHAN_COMMENT`,
    `ASTM_RECORD_PARTIAL_TIMESTAMP` — value-free (code + record/field index only).
  - `scripts/phi-scan.ts` extended toward the mother's-maiden locus (P field 7), on top of the existing
    name (field 6) + DOB (field 8) detection; synthetic fixtures declared in `scripts/phi-allow-list.txt`.
- **Query (`Q`) + host-query flow + `M`/`S` surfaced verbatim (ASTM-4, roadmap Phase 4).** Completes the
  record grammar — **the record-content layer is now feature-complete.**
  - **The `Q` (Request Information) record.** Modeled at the public ASTM E1394 field positions:
    `startingRangeId` (field 3) and `endingRangeId` (field 4) surfaced as the **full verbatim field**
    (never truncated to a component), the Universal Test ID (field 5, same caret structure as `O`/`R`),
    and `requestInformationStatus` (field 13) surfaced **verbatim**. The range component structure, the
    `ALL` universal-query keyword (`queriesAllTests`), and the request-information status code set are
    all **`[OSS-derived / paywalled]`** (roadmap §10 Q3) — surfaced, flagged, and **never interpreted or
    guessed**. New `query(msg)` extractor.
  - **The host-query flow.** Every message is classified up front (`msg.classification`): an `H/P/Q/L`
    **request** is `host-query`, an `R`-bearing message is `results`, an `O`-only message is `orders`,
    else `indeterminate`. **Fail-safe:** the `Q` **dominates** — a `Q`-bearing message is a request and
    is **never** read as a result set, even when a result record is also present (a contradiction flagged
    with `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND`). Gate on `classification.isHostQueryRequest`. Pure
    `classifyMessage(records)` exported.
  - **`M` (manufacturer) + `S` (scientific) records surfaced verbatim.** Vendor-defined free-form
    QC / calibration / maintenance data, preserved byte-for-byte on `record.rawLine` and **never**
    interpreted into typed clinical fields — a QC value can never be read as a patient result. Round-trip
    byte-identical.
  - New warning codes (registry extended, snapshot locked): `ASTM_RECORD_UNINTERPRETED_QUERY_STATUS`
    (a Q request-information status surfaced verbatim; the code set is paywalled, so it is passed through
    uninterpreted) and `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND` — both value-free (code + position only).
  - `AstmMessage` gains a `classification` field; `AstmRecord` gains `QueryRecord` / `ManufacturerRecord`
    / `ScientificRecord` members (an unknown type letter is still an `UnsupportedRecord`, never dropped).
- **E1381/CLSI-LIS01 frame codec (ASTM-5, roadmap Phase 5).** The **low-level framing layer** begins —
  a separate, independent layer from the record layer, sharing only the payload boundary. `src/frames/`
  decodes a framed byte stream into frames + reassembled record bytes; `src/common/` and `src/records/`
  are untouched.
  - `decodeAstmFrames(bytes, opts?)` → `{ records: readonly Uint8Array[]; frames: readonly AstmFrame[];
warnings: readonly AstmFrameWarning[] }`. A frame is `<STX> FN text <ETB|ETX> CS <CR><LF>`.
  - **Modulo-256 checksum** over the bytes after `STX` up to and **including** the `ETB`/`ETX`
    terminator, two hex chars — **verified on decode, emitted uppercase, accepted lowercase** (a real
    vendor quirk). `computeChecksum` / `toChecksumHex` / `parseChecksumHex` exported.
  - **Frame-number `0`–`7` sequencing** (rolls over `7 → 0 → 1`, starts at `1`) and **multi-frame record
    reassembly** — text is capped at **240 bytes** (the seven control bytes are **not** counted), `ETB`
    is intermediate / `ETX` final. `parseFramedAstm(bytes, opts?)` composes the framing and record layers
    at the edge (decode → reassemble trusted records → `parseAstmRecords`).
  - **Fail-safe (byte-level, safety-critical):** a **checksum mismatch** surfaces the frame flagged
    `trusted: false` and **never merges** it into a record (default warn in lenient / thrown in strict —
    the "checksums are routinely not validated" claim was _refuted_: we validate); a **frame-number gap**
    warns and is **never silently bridged**; an **unterminated** frame surfaces the partial bytes
    untrusted and **invents no partial record**; an **oversize** (>240) frame is flagged, never dropped.
  - New `ASTM_FRAME_*` warning registry (a **second** registry alongside `ASTM_RECORD_*`, sharing only
    the `EMPTY_INPUT` fatal; snapshot locked): `ASTM_FRAME_BAD_CHECKSUM`, `ASTM_FRAME_SEQUENCE_GAP`,
    `ASTM_FRAME_UNTERMINATED`, `ASTM_FRAME_OVERSIZE` — every warning **value-free**, carrying a **frame
    number + byte offset** only, never the record bytes a frame holds. `{ strict: true }` throws
    `AstmFrameStrictError`.
  - **Fuzz gate (required, part of `verify`):** a `fast-check` target over the codec — arbitrary /
    truncated / mixed / control-char-laden bytes never crash, hang, or OOM; they degrade to a typed
    error or a value-free warning. Plus property tests: N-frame reassembly equals the single-frame form,
    and every trusted frame's recomputed checksum matches its declared value.
  - New types/exports: `AstmFrame`, `FrameChecksum`, `FrameTerminator`, `FrameOptions`,
    `DecodeAstmFramesResult`, `FramedAstmResult`, `AstmFramePosition`, `AstmFrameWarning`,
    `FrameWarningCode`, `FRAME_WARNING_CODES`.
- **Transport variants + pure LTP protocol reducer (ASTM-6, roadmap Phase 6).** The **LTP protocol
  layer** — `src/ltp/` — sits above the frame codec: transport auto-detection plus a deterministic,
  socket-free session state machine. No live I/O: the consumer owns the wire and clock; this layer
  decides.
  - **Transport auto-detection.** `detectFraming(bytes, opts?)` → `{ framing: "framed" | "raw";
defaulted: boolean; warnings }`. A leading `STX`/`ENQ` ⇒ **framed** (serial, and the cobas 4800 /
    iNTERFACEWARE Iguana framed-over-TCP reality); a leading bare record letter (`H`/`P`/`O`/`R`/`C`/
    `Q`/`M`/`S`/`L`) ⇒ **raw** (the cobas b121 raw-TCP reality — framing dropped, records streamed
    directly). An unrecognizable lead **defaults to framed and warns**
    (`ASTM_LTP_AMBIGUOUS_TRANSPORT`), never guessing silently into data loss; an `override` forces the
    mode (the Phase-8 profile hook).
  - **Pure receiver-side reducer.** `ltpReduce(state, event)` → `{ state, actions, warnings }`, seeded
    by `ltpInitialState()`. Events are the four LTP control signals (`enq`/`ack`/`nak`/`eot`) plus a
    codec-decoded `frame`; actions are `sendAck` / `sendNak` / `sendEot` / `deliverRecord`. It models
    the LIS01-A2 establishment → transfer → termination phases as `neutral ⇄ transfer`, reassembling
    `ETB…ETX` runs into delivered records and tracking the `0`–`7` frame sequence.
  - **ACK-failsafe (safety-critical, borrowed from `mllp`).** A frame the codec did not vouch for — a
    **bad checksum**, an **unterminated** frame, or one **out of sequence** — is answered with `NAK`,
    **never** a fabricated positive `ACK`, and its bytes are **never** appended to a record or
    delivered. A `NAK` drives **retransmit, not acceptance** (`ASTM_LTP_FRAME_REJECTED`). A duplicate
    of the last-accepted frame is idempotently re-`ACK`ed without re-appending; a partial record open
    on an `EOT` or `ENQ` restart is discarded, never delivered as if whole.
  - New `ASTM_LTP_*` warning registry (a **third** registry alongside `ASTM_RECORD_*` / `ASTM_FRAME_*`;
    value-free, carrying at most a frame number): `ASTM_LTP_AMBIGUOUS_TRANSPORT`,
    `ASTM_LTP_UNEXPECTED_EVENT`, `ASTM_LTP_FRAME_REJECTED`.
  - Property tests: the reducer **never emits `ACK` after an untrusted frame**; a full `ENQ → frames →
EOT` session **reassembles exactly the source records**; a **raw-TCP stream equals its framed
    twin**. Plus the transport-control control bytes `ASTM_ENQ` / `ASTM_ACK` / `ASTM_NAK` / `ASTM_EOT`.
  - New types/exports: `detectFraming`, `AstmFraming`, `DetectFramingOptions`, `DetectFramingResult`,
    `ltpInitialState`, `ltpReduce`, `LtpPhase`, `LtpState`, `LtpEvent`, `LtpAction`, `LtpTransition`,
    `AstmLtpWarning`, `LtpWarningCode`, `LTP_WARNING_CODES`, `ltpAmbiguousTransport`,
    `ltpUnexpectedEvent`, `ltpFrameRejected`.
- **Spec-clean serializers + builders — both layers (ASTM-7, roadmap Phase 7).** The **emit** side: the
  conservative inverse of the parser and the frame codec, so **round-trip fidelity holds by
  construction**. Postel's Law's second half — liberal on parse, strict on emit.
  - **Record serializer.** `serializeAstmRecords(msg | records)` and `serializeAstmRecord(record)` emit a
    `CR`-terminated stream with the **canonical** `H|\^&` delimiters and every embedded delimiter
    re-escaped. `encodeComponent()` is the exact inverse of the Phase-1 escape codec — the escape char is
    encoded **first** (`&` → `&E&`), then the field / component / repeat delimiters (`&F&`/`&S&`/`&R&`) —
    so a value containing a delimiter (a titre `1^40` → `1&S&40`) can never break framing and reads back
    as **one** component. A source parsed with **non-canonical** delimiters is **normalized** to the
    canonical set on emit (vendor-delimiter round-tripping is a Phase-8 profile concern). The header's
    delimiter declaration is emitted **literally** (never escaped); `M`/`S` records are re-emitted
    **byte-identically** from `rawLine`.
  - **Message builder.** `buildAstmMessage(input)` constructs a spec-clean stream from typed input under
    the **never-fabricate** discipline: it emits **only** the values the caller supplied — an omitted
    field is left empty, **never a defaulted clinical value** (an unset result status reads back as
    `unspecified`, never `final`; units / abnormal flags / patient IDs are never defaulted). The
    **structure** — record type letters, the canonical delimiter declaration, per-record-type sequence
    counters, the `L` terminator — is **computed, not guessed** (a sequence number may be overridden).
  - **Frame encoder.** `composeAstmFrames(records, opts?)` is the exact inverse of `decodeAstmFrames`:
    it wraps reassembled record bytes into `<STX> FN text <ETB|ETX> CS <CR><LF>` frames with the
    modulo-256 **checksum** and the `0`–`7` **frame number** **computed** (never accepted-as-given or
    faked; emitted uppercase), numbered continuously across the stream (start `1`, roll over `7 → 0`),
    and every record over **240** text bytes **split** `ETB…ETX` (the seven control bytes never counted).
    `serializeFramedAstm(msg | records)` composes both emit layers at the edge — the mirror of
    `parseFramedAstm`.
  - **Framing-integrity guards (typed errors, conservative emit).** A value carrying a `CR`/`LF` — which
    no ASTM escape can encode — is refused with an `AstmSerializeError` (`ASTM_EMIT_UNENCODABLE_VALUE`)
    rather than emitted into a corrupted wire; an empty record or empty record list is an
    `AstmFrameEncodeError` (`ASTM_FRAME_EMPTY_RECORD`), never an empty frame.
  - **Round-trip proven.** The shared archetype `roundTripProperty` is now **live** (serialize is the
    idempotent inverse of parse); Tier-3 golden files round-trip every synthetic fixture through both the
    record and framing layers (structural equality of the decoded field tree, zero frame warnings); and
    `decodeAstmFrames(composeAstmFrames(x)).records ≡ x`.
  - `HeaderRecord` gains an additive `rawLine` field (the escape char living inside the `\^&` definition
    defeats the generic escape-aware tokenizer, so the raw header is the reliable source for both
    delimiter reading and re-serialization). New exports: `serializeAstmRecords`, `serializeAstmRecord`,
    `serializeField`, `encodeComponent`, `AstmSerializeError`, `buildAstmMessage` (+ `AstmRecordInput`,
    `MessageInput`, `HeaderInput`, `PatientInput`, `PatientNameInput`, `OrderInput`, `ResultInput`,
    `CommentInput`, `QueryInput`, `VerbatimInput`), `composeAstmFrames`, `AstmFrameEncodeError`,
    `ComposeFramesOptions`, `serializeFramedAstm`.
- **Vendor profile system — engine + registry + quirk tolerance + definition-time safety gate
  (ASTM-8, roadmap Phase 8).** `src/profiles/` mirrors the sibling `@cosyte/hl7` `defineProfile` /
  `@cosyte/ccda` `defineCcdaProfile` shape: `name` / `lineage` / `describe()` / `extends`-merge, a
  provenance-backed built-in registry, a runtime tolerance transform, and a definition-time safety gate.
  - `defineAstmProfile(opts)` builds a frozen, immutable profile declaring the **non-safety-critical**
    warning codes a class of streams is expected to trip (each with a grounded `rationale`), plus an
    optional `transport` override (`"framed"`/`"raw"`) — the raw-vs-framed-TCP knob a consumer feeds to
    `detectFraming(bytes, { override })` for a stream whose leading byte would auto-detect the wrong way.
  - **A profile never alters an extracted value.** The transform (`applyAstmProfileToWarnings`, run last
    in `parseAstmRecords`) only ever re-badges a warning it _expects_ to the new `PROFILE_QUIRK_APPLIED`
    code (flagged `expected: true`, carrying the original `toleratedCode` and position) — Postel's Law
    with a receipt: nothing is dropped, and a spec-clean message parses byte-identically with or without
    a profile.
  - **The safety gate is default-deny and total.** Only four benign, value-preserving record codes are
    tolerable (`ASTM_RECORD_UNKNOWN_TYPE`, `ASTM_NONSTANDARD_DELIMITERS`, `ASTM_UNKNOWN_ESCAPE_SEQUENCE`,
    `ASTM_RECORD_UNINTERPRETED_QUERY_STATUS`); **every other code across all three registries — record,
    frame (`ASTM_FRAME_*`), and LTP (`ASTM_LTP_*`) — is safety-critical and refused at definition time**
    with an `AstmProfileDefinitionError`. A profile therefore can never make a bad checksum "ok," a
    cancelled result read "final," or quiet a wrong value / flag / status / range / units / patient or
    comment context / message-kind ambiguity. Any warning code added in a future phase is
    safety-critical **by default** until deliberately added to the allow-list.
  - `parseAstmRecords(raw, { profile })` accepts an explicit profile; `{ profile: null }` opts out of
    the process-scoped default (`setDefaultAstmProfile`); an `expected` quirk does **not** escalate in
    `strict` mode. `AstmMessage` gains an additive `profile?: { name, lineage }` attribution.
  - **Built-ins:** `astmProfiles.default` (tolerates nothing) + `astmProfiles.referenceCorpus` — a
    **non-vendor**, evidence-backed profile grounded firsthand in the redistributable OSS reference
    corpus (`kxepal/python-astm` `codec.py` (BSD) + `senaite.astm`, which split on raw delimiters and
    never un-escape `&F&`/`&S&`/`&R&`/`&E&`), tolerating only the resulting non-standard-escape
    _syntactic_ noise (the value is preserved byte-for-byte). **Named per-vendor profiles**
    (cobas / Sysmex / …) are **deferred** (`REAL-CORPUS`): the engine fully supports them, but no public
    vendor-attributed quirk document grounds a named one.
  - New warning code `PROFILE_QUIRK_APPLIED` (record registry). New exports: `defineAstmProfile`,
    `AstmProfileDefinitionError`, `astmProfiles`, `getAstmProfile`, `listAstmProfiles`,
    `setDefaultAstmProfile`, `getDefaultAstmProfile`, `applyAstmProfile`, `applyAstmProfileToWarnings`,
    `resolveProfileTransport`, `profileQuirkApplied`, `SAFETY_CRITICAL_CODES`, `TOLERABLE_CODES`,
    `ALL_ASTM_WARNING_CODES`, `isSafetyCriticalCode`, and the `AstmProfile`, `DefineAstmProfileOptions`,
    `AstmQuirkTolerance`, `AstmQuirkMatch`, `AstmProfileProvenance`, `AnyAstmWarningCode` types.
- **LIVD-aware LOINC recognition — bring-your-own catalog, zero bundled terminology data (ASTM-9,
  roadmap Phase 9).** The `src/terminology/` layer maps an analyzer's local test code (the Universal
  Test ID's vendor/local code on `R`/`O` records) to a standard LOINC via a **consumer-supplied** IICC
  LIVD ("LOINC to Vendor IVD") catalog — **additive, advisory, and never a guessed LOINC** (a wrong
  LOINC mis-identifies a test).
  - `defineLivdCatalog(entries)` builds an immutable, frozen catalog indexed by the **Vendor Analyte
    Code** (the vendor transmission code the instrument sends), grounded firsthand on the IICC LIVD
    digital format / HL7 LIVD IG; `catalog.lookup(code)` returns `mapped` (one LOINC), `unmapped` (a
    miss), or `ambiguous` (a code matching more than one distinct LOINC — surfaced, **never resolved**).
  - `applyLivd(msg, catalog)` produces a **separate** layer of per-`R`/`O` `LivdAnnotation`s and never
    mutates, alters, or drops the raw reported code/value; a catalog hit is labeled `derived: true`
    (`source: "livd"`), an inline LOINC already on the wire is surfaced `source: "wire"` (never
    overwritten by the catalog), and a miss/conflict is `unmapped`/`ambiguous` with a **value-free**
    warning — a LOINC is **never** fabricated. `lookupLivdForRecord(record, catalog)` annotates one
    record.
  - **No LOINC / SNOMED / LIVD data is bundled** (roadmap §5). Firsthand: LOINC is © Regenstrief —
    redistributable only _with its attribution notice_, not public-domain; and the public CDC LIVD file
    is a **SARS-CoV-2-specific** publication that also carries separately-licensed SNOMED CT, not a
    general-analyte, public-domain catalog. The package stays a structural recognizer, not a dictionary:
    the consumer supplies the LIVD data (and owns its license obligations).
  - New `ASTM_LIVD_*` warning registry (`ASTM_LIVD_UNMAPPED_CODE`, `ASTM_LIVD_AMBIGUOUS_MAPPING`) — a
    fourth, self-contained registry, deliberately outside the profile safety gate's universe (a LIVD
    non-mapping is a post-parse advisory, not a parse-time deviation a profile could tolerate). New
    exports: `defineLivdCatalog`, `applyLivd`, `lookupLivdForRecord`, `LIVD_WARNING_CODES`,
    `livdUnmappedCode`, `livdAmbiguousMapping`, and the `LivdCatalog`, `LivdEntry`, `LivdLookup`,
    `LivdAnnotation`, `LivdMapping`, `LivdResult`, `AstmLivdWarning`, `LivdWarningCode` types.
- **Release hardening (ASTM-10, roadmap Phase 10 — the final phase).** Publish-readiness for the now
  feature-complete parser: coverage, fuzz, firsthand differential testing, the full docs spine, and a
  proven release shape. No new runtime API.
  - **Differential conformance vs [python-astm][pa]** (BSD-3-Clause reference codec, commit
    `4170ce0c`), grounded **firsthand** in `test/differential/`: outputs captured once from the
    reference (`generate-reference-vectors.py` → `reference-vectors.json`; **no reference code
    vendored**), then asserted against `@cosyte/astm` on three shared paths — the **modulo-256
    checksum**, the **record field/component split** (escape-free, non-header), and a
    **cross-implementation frame decode** (python encodes + splits → our decoder verifies every
    checksum and reassembles the exact record bytes). The **deliberate divergences** are asserted on
    purpose: we un-escape `&F&`/`&S&`/`&R&`/`&E&` (python leaves them literal), we validate the frame
    checksum (python does not verify on decode), and we classify the `Q` host-query (python has no
    model). CI needs no Python — only the captured JSON.
  - **Per-directory ≥ 90 coverage gating extended to the whole `src/` surface** — `frames`, `ltp`,
    and `terminology` now gate per-dir alongside `common`/`records`/`profiles` (on top of the global
    gate), so the release bar holds directory by directory, not just in aggregate.
  - **Record-tokenizer fuzz** (`test/property/records-fuzz.property.test.ts`) — the companion to the
    frame-codec fuzz: arbitrary / truncated / delimiter- and escape-laden input into
    `parseAstmRecords` never crashes, hangs, or OOMs; lenient mode only ever throws a sanctioned
    Tier-3 fatal, strict only `AstmStrictError`, and every warning carries a registered code. Both
    fuzz suites scale via `ASTM_FUZZ_RUNS`, driven up nightly by a scheduled **Fuzz** workflow
    (`.github/workflows/fuzz.yml`) and runnable on demand via `pnpm test:fuzz`.
  - **Publish dry-run proven release-shaped:** `attw` all-green (per-condition ESM/CJS types), a new
    `smoke` gate (`scripts/smoke.mjs`) that imports the **built** ESM and requires the **built** CJS
    entry and parses a result through each (now wired into `verify.sh`), and an `npm publish
--dry-run` pack inspection (10 files — `dist/` + `README`/`LICENSE`/`CHANGELOG`/`package.json`,
    no `src` or tests). Zero runtime dependencies; MIT.
  - **Full Diátaxis docs spine + honesty docs.** New `docs-content/limitations.md` (**What it does —
    and does not do**: no live I/O, units are verbatim free text not UCUM, no bundled terminology
    dictionary, `M`/`S` verbatim, the archived-standard status, and the MIT-vs-CLSI license posture)
    and `docs-content/architecture.md` (the two independent layers and their payload boundary); the
    **Guides** page is now real how-to recipes (was a placeholder), and the intro / troubleshooting /
    concepts status blocks are refreshed to the feature-complete state. Every ` ```ts runnable `
    example is executed by the doc/code-agreement gate.

[pa]: https://github.com/kxepal/python-astm

### Changed

- **Breaking (pre-alpha):** the archetype stub `parseAstm` / `ParsedAstm` is replaced by
  `parseAstmRecords` / `AstmMessage`; the placeholder `WARNING_CODES` / `FATAL_CODES` entries are
  replaced by the real Phase-1 registries.

### Deferred (later phases)

- **Named per-vendor profiles** (cobas / Sysmex / ADVIA / Mindray / Snibe) stay `REAL-CORPUS`-gated —
  the Phase-8 engine supports them (tolerate + transport override), but no public vendor-attributed
  quirk document grounds a named one. **No bundled terminology
  dictionary** — LIVD-aware LOINC recognition is bring-your-own by design (Phase 9); the package ships
  no LOINC / SNOMED / LIVD data and mapping quality is the consumer's catalog. The LTP reducer remains
  a pure state machine — no live I/O: wiring it to a real `SerialPort`/`net.Socket` (and the
  interactive contention/timeout/retransmit **timing**) is a thin consumer adapter, and the standard's
  exact numeric timeouts / retry counts are deferred (we model transitions, not timers).

[Unreleased]: https://github.com/cosyte/astm/commits/main
[0.0.2]: https://github.com/cosyte/astm/releases/tag/v0.0.2
[0.0.1]: https://github.com/cosyte/astm/releases/tag/v0.0.1
