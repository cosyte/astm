# @cosyte/astm: agent notes

The narrative half of this repo's `CLAUDE.md`, relocated here **verbatim** on 2026-08-04 so that
`CLAUDE.md` fits the write-time bound the meta-repo puts on a submodule's always-read guide (its
entry in `REPO_CLAUDE`, `.claude/hooks/doc-budget.mjs`, argued in ADR 0023: a per-repo ratchet whose
entries are lowered as relocations land). **No number for it is quoted in either file on purpose**;
read the entry: the bound that preceded it was quoted into documents and went stale inside a day,
which is the failure this split exists to fix. Nothing was deleted. Every trap that lived in a paragraph here
still lives in `CLAUDE.md` as a one-line imperative that points back at its section, and the
reasoning, the measurements and the refuted claims are all below, word for word.

Read this file when a `CLAUDE.md` line tells you to, and before you touch the code it guards. These
are clinical-safety lessons: each paragraph cost a defect to learn, and several record a claim that
was measured **false** after it shipped. Correct the record here rather than dropping it.

**Corrections are ANNOTATIONS, not edits.** Every paragraph below is the text as it stood, so a
correction is added beside the claim (in a `> **Correction, <date>:**` block) rather than rewritten
over it. That is the house pattern this repo already uses: an entry that measured false is annotated,
not removed, because the correction is usually the lesson.

## Contents

- [The shipped docs sidebar is a published contract](#the-shipped-docs-sidebar-is-a-published-contract)
- [Status](#status) (the shipped-phase histories, and the version-in-prose trap)
- [Known defects live on `main`](#known-defects-live-on-main-recorded-here-so-they-survive-independently-of-any-backlog) (one section each; the count is not written down, because it moves)
- [Engineering Guardrails](#engineering-guardrails) (the `attw` wrapper)
- [Standing disciplines (every change)](#standing-disciplines-every-change) (public-surface bookkeeping, and the em dash gate)
- [The shared engineering guardrails](#the-shared-engineering-guardrails-relocated-verbatim-from-claudemd-2026-08-07) and one `attw` trap, both relocated out of `CLAUDE.md` 2026-08-07
- [The two-file contract, and why the matcher had to be re-derived here](#the-two-file-contract-and-why-the-matcher-had-to-be-re-derived-here) (both sibling matchers score zero on this tree)
- [The PHI sweep has two halves](#the-phi-sweep-has-two-halves-and-one-of-them-is-not-the-other) (scan roots, the source-embedded view, the observation rule)
- [`pnpm check`: a local gate run that says what it did not do](#pnpm-check-a-local-gate-run-that-says-what-it-did-not-do)

<a id="docs-sidebar"></a>

## The shipped docs sidebar is a published contract

`docs-content/` is tarred verbatim into the `docs-content.tar.gz` release asset that `cosyte/docs`
ingests, so **`docs-content/sidebars.json` is a public contract, not a local build detail**, and a
released asset is **immutable**: the docs pipeline re-fetches it forever, so a bad sidebar can only be
superseded by a later release, never corrected in place. `v0.0.1` and `v0.0.2` both shipped a
top-level category labelled **"About"**, which is not on the section spine `cosyte/docs` enforces in
`scripts/check-ia-conformance.ts` (Overview, Installation, Quickstart, Core Concepts, Guides, API
Reference, Troubleshooting). `v0.0.2` is the current route, so it rendered at `/astm/` on the live
site, and it was the **only** such violation across the 15 released version slots in the ecosystem.

`test/docs-sidebar-ia.test.ts` transcribes that spine and grades the file this repo ships. Two things
about it are load-bearing:

- **Categories are optional.** The rule is "if you have it, label it canonically and order it
  canonically", so the minimal `{"docs":["intro"]}` conforms. Never make it demand a section.
- **"API Reference" is injected by `cosyte/docs`, never authored here.** It is inserted just before
  Troubleshooting when the package ships a source bundle, which this one does.

The spine is transcribed rather than imported because a parser repo cannot depend on the docs site.
That means the two copies can drift; the upstream file is the source of truth.

<a id="status-history"></a>

## Status

The cursor (published, public, feature-complete, on the `0.0.x` ladder) is in `CLAUDE.md`. What
follows is the full status text as it stood, including the shipped-phase histories for every phase
of the roadmap.

- **Published.** The repo is **public** and `@cosyte/astm` is **live on npm**, on the pre-alpha
  `0.0.x` ladder (first published 2026-07-22). **This line deliberately no longer names a version,
  and neither do `README.md`, `docs-content/intro.md` or `docs-content/installation.md`.** All four
  read `at 0.0.1` until 2026-07-28, having been corrected by hand days earlier: the release that
  bumped the package to `0.0.2` falsified every one of them within hours, because nothing binds a
  hand-written version in prose to the manifest the release bumps. A pinned version in shipped
  narrative is stale by construction on the next publish, and `intro.md`/`installation.md` ship
  inside `docs-content.tar.gz`, so the stale claim reaches `docs.cosyte.com` and stays there: a
  released tarball is immutable and the docs pipeline re-fetches it forever. What a reader needs is
  that the package **is** published and which ladder it is on; the exact number is on the registry,
  where it cannot go stale. **Re-verify with `npm view @cosyte/astm version`.** `www.npmjs.com`
  returns 403 to scripted requests, so it is not a usable check: use the registry.
  `src/index.ts`'s exported `VERSION` is a different thing and IS bound, by
  `scripts/sync-version.mjs` in the release `version` script plus an equality assertion in
  `test/sanity.test.ts`. Do not "restore consistency" by re-pinning a number into the prose.
- **Phase 10 shipped (ASTM-10): release hardening, the final roadmap phase. The parser is
  feature-complete.** No new runtime API; this phase is coverage, fuzz, differential testing, docs, and
  a proven release shape. **Differential conformance vs `python-astm`** (BSD, commit `4170ce0c`),
  grounded **firsthand** in `test/differential/`: its outputs were captured once
  (`generate-reference-vectors.py` → `reference-vectors.json`; **no reference code vendored**, CI needs
  no Python) and asserted against ours on three shared paths: the modulo-256 checksum, the record
  field/component split (escape-free, non-header), and a cross-implementation frame decode (python
  encodes + splits → our decoder verifies every checksum and reassembles the exact bytes). The
  **deliberate divergences** are asserted on purpose (we un-escape `&F&`/`&S&`/`&R&`/`&E&`, we validate the
  checksum on decode, we classify the `Q` host-query; python does none). **Per-dir ≥ 90 coverage** now
  gates the whole `src/` (`frames`/`ltp`/`terminology` added to `common`/`records`/`profiles`). A
  **record-tokenizer fuzz** joins the frame-codec fuzz; both scale via `ASTM_FUZZ_RUNS`, run nightly by
  a scheduled **Fuzz** workflow (`.github/workflows/fuzz.yml`) and on demand via `pnpm test:fuzz`.
  **Publish dry-run proven:** `attw` green, a new `smoke` gate (`scripts/smoke.mjs`, in `verify.sh`)
  exercising the built ESM + CJS entries, and an `npm publish --dry-run` clean 10-file tarball. **Full
  Diátaxis docs spine + honesty docs**: `docs-content/limitations.md` (what it does / does not do +
  license posture) and `architecture.md` (the two-layer model), real how-to guides, refreshed status
  blocks. **Founder-gated tail (crossed 2026-07-22):** the repo was flipped public and
  `@cosyte/astm@0.0.1` was published to npm (`dist-tags.latest` = `0.0.1`). Both were the standing
  human stops; both are done.
- **Phase 9 shipped (ASTM-9): LIVD-aware LOINC recognition, bring-your-own catalog, zero bundled
  terminology data.** `src/terminology/` maps an analyzer's local test code to a LOINC via a
  **consumer-supplied** IICC LIVD catalog, additive, advisory, never a guessed LOINC.
  `defineLivdCatalog` / `applyLivd` / `lookupLivdForRecord`; the raw code/value is never mutated, an
  inline wire LOINC is never overwritten, and a miss/conflict is `unmapped`/`ambiguous` with a
  value-free warning. **No LOINC/SNOMED/LIVD data is bundled.** Fourth warning registry `ASTM_LIVD_*`
  (`ASTM_LIVD_UNMAPPED_CODE`, `ASTM_LIVD_AMBIGUOUS_MAPPING`), outside the profile safety gate.
- **Phase 8 shipped (ASTM-8): the vendor profile system, engine + registry + quirk-tolerance
  transform + a definition-time safety gate.** `src/profiles/` mirrors the sibling `@cosyte/hl7`
  `defineProfile` / `@cosyte/ccda` `defineCcdaProfile` shape. `defineAstmProfile(opts)` builds a frozen,
  provenance-backed profile (`name` / `lineage` / `describe()` / `extends`-merge) that declares the
  **non-safety-critical** warning codes a class of real-world ASTM streams is expected to trip, plus an
  optional `transport` override (the raw-vs-framed-TCP knob a consumer feeds to
  `detectFraming(bytes, { override })`). **A profile never touches an extracted value**: the runtime
  transform (`applyAstmProfileToWarnings`, run last in `parseAstmRecords`) only ever re-badges a warning
  it _expects_ to `PROFILE_QUIRK_APPLIED` (flagged `expected`, carrying the original `toleratedCode`);
  a spec-clean message parses byte-identically with or without a profile, and no warning is ever
  dropped. **The safety gate is default-deny and total** (`src/profiles/safety.ts`): a short,
  explicitly derived list of benign, value-preserving record codes is tolerable
  (`ASTM_NONSTANDARD_DELIMITERS`, `ASTM_UNKNOWN_ESCAPE_SEQUENCE`,
  `ASTM_UNPAIRED_ESCAPE_CHARACTER`, `ASTM_RECORD_UNINTERPRETED_QUERY_STATUS`); **every other code
  across all three registries (record, frame `ASTM_FRAME_*`, and LTP `ASTM_LTP_*`) is
  safety-critical and refused at definition time**, so a profile can never make a bad checksum "ok,"
  a cancelled result read "final," or quiet a wrong value / flag / status / range / units / patient
  or comment context / message-kind ambiguity. Any new warning code is safety-critical **by default**
  until deliberately added to the allow-list.
  **▶ THE LIST WAS FOUR AND IS NOW THREE: `ASTM_RECORD_UNKNOWN_TYPE` WAS REMOVED
  (`ASTM-UNKNOWN-RECORD-REMERGE`, 2026-08-01), and the reason generalizes.** The admission test was
  one clause, "cannot alter, drop, or fabricate an extracted value", which that code still passes.
  It stopped being benign anyway, because `messages()` made a record's **type letter** load-bearing
  for segmentation, so an unrecognized letter became a report that a message boundary may have been
  missed while the allow-list still called it harmless. **The test now has a second clause: nothing
  else in this package may read the condition the warning reports**, and that clause is a claim
  about the whole library which can stop being true without anyone touching `safety.ts`. It is a
  review obligation, not a mechanical one, and there is deliberately no automatic check for it (see
  the note at the foot of that file). **Re-derive the list whenever something new starts reading
  record structure**, and note the direction of the failure is safe: default-deny means a new code
  is refused until argued in, so the risk is confined to the three named above. The re-derivation
  itself is measured in `test/profiles/unknown-record-type-safety.test.ts`: each survivor is checked
  by reading the same logical stream with the reported condition present and absent, on both
  structural readers. **Do not re-measure it by comparing a parse with a profile against one
  without**, which is what an earlier draft did and what the refuter deleted: the warning transform
  runs after the records are built, so that comparison is identical for every code and passes for a
  code that should never be tolerable. The comparison is exercised on pairs that must fail.

  > **Correction, 2026-08-04 (`CLAUDE-MD-AUDIT`):** "the list was four and is now three", and the
  > "three named above", are a snapshot of **2026-08-01** and are not the list today.
  > `ASTM_UNPAIRED_ESCAPE_CHARACTER` was **added** to `TOLERABLE_CODES` on 2026-08-02 by defect 8's
  > fix. On the date of this annotation the members are `ASTM_NONSTANDARD_DELIMITERS`,
  > `ASTM_UNKNOWN_ESCAPE_SEQUENCE`, `ASTM_UNPAIRED_ESCAPE_CHARACTER` and
  > `ASTM_RECORD_UNINTERPRETED_QUERY_STATUS`, and this annotation deliberately states **no count**
  > either, because a count is the shape that went stale here: `src/profiles/safety.ts` is the only
  > thing that carries the list. The paragraph enumerates all four correctly two
  > sentences earlier and then miscounts them, which is why **no count for this list may be quoted
  > anywhere: read `src/profiles/safety.ts`.** Nothing else in the paragraph changes: the removal of
  > `ASTM_RECORD_UNKNOWN_TYPE` stands, the two-clause admission test stands, and the direction of the
  > failure is still safe because the gate is default-deny. Found by the `conformance-refuter`
  > grading this relocation.

  **The gate is enforced twice, and the second point is the load-bearing one**: `applyAstmProfile`
  re-checks `isSafetyCriticalCode` before downgrading, because `AstmProfile` is a plain interface
  and a hand-authored literal never passes through `defineAstmProfile`. See known defect 2.
  `parseAstmRecords(raw, { profile })` accepts an explicit profile (`null` opts out of the process
  default set via `setDefaultAstmProfile`); an expected quirk does **not** escalate in `strict` mode.
  **Built-ins:** `astmProfiles.default` (tolerates nothing) + `astmProfiles.referenceCorpus`, a
  **non-vendor**, evidence-backed profile grounded firsthand in the redistributable OSS reference corpus
  (`kxepal/python-astm` `codec.py` (BSD) + `senaite.astm`, which split on raw delimiters and never
  un-escape `&F&`/`&S&`/`&R&`/`&E&`), tolerating only the resulting non-standard-escape _syntactic_
  noise (the value is preserved byte-for-byte). New warning code `PROFILE_QUIRK_APPLIED`; new exports:
  `defineAstmProfile`, `AstmProfileDefinitionError`, `astmProfiles`, `getAstmProfile`,
  `listAstmProfiles`, `set/getDefaultAstmProfile`, `applyAstmProfile`, `applyAstmProfileToWarnings`,
  `resolveProfileTransport`, `profileQuirkApplied`, `SAFETY_CRITICAL_CODES`, `TOLERABLE_CODES`,
  `ALL_ASTM_WARNING_CODES`, `isSafetyCriticalCode`, and the `AstmProfile*` types.
  **Deferred:** **named per-vendor profiles** (cobas / Sysmex / ADVIA / Mindray / Snibe) stay
  `REAL-CORPUS`-gated, the engine fully _supports_ them (tolerate + transport override), but no public
  vendor-attributed quirk document grounds a named one, and firsthand inspection of the public corpus
  (python-astm, senaite `sysmex_xn550` / `cobas_c111` transcripts) found the record layer spec-clean
  (canonical `|\^&`, standard record grammar), so none are authored. (LIVD terminology and release
  hardening, P9/P10, have since shipped; see the entries above.)

- **Phase 7 shipped (ASTM-7): spec-clean serializers + builders, both layers now round-trip by
  construction.** `src/records/serialize.ts` + `src/records/build.ts` are the conservative inverse of the
  record parser; `src/frames/encode.ts` is the inverse of the frame codec; `serializeFramedAstm`
  composes both emit layers at the edge (the mirror of `parseFramedAstm`). **Record emit:**
  `serializeAstmRecords(msg | records)` / `serializeAstmRecord(record)` emit a `CR`-terminated stream
  with the **canonical** `H|\^&` delimiters (a non-canonical source is normalized, vendor-delimiter
  round-tripping is a Phase-8 profile concern), re-escaping every embedded `|`/`^`/`\`/`&` via
  `encodeComponent` (the exact inverse of the P1 escape codec, escape char first, then the three
  delimiters). The header's delimiter declaration is emitted **literally** (never escaped) and its data
  fields are reconstructed from `HeaderRecord.rawLine` (new additive field, the escape char living
  inside the `\^&` definition defeats the generic escape-aware tokenizer, so the raw header is the
  reliable source); `M`/`S` are re-emitted **byte-identically** from `rawLine`.
  **▶ BOTH OF THOSE LAST TWO CLAUSES WERE FIXED 2026-07-29 (`ASTM-MIXED-DELIMITER-EMIT`): read
  `CHANGELOG.md` `[Unreleased]` before touching `serialize.ts`.** Emitting `M`/`S` verbatim while
  normalizing the header produced a **mixed-delimiter, non-conformant stream**, and re-parsing it
  **silently collapsed every field of those rows into one, with zero warnings**: shipped since
  `0.0.1`. `M`/`S` now go out verbatim **only when a reader using the emit delimiters would recover
  exactly the fields the record models**, and are re-encoded from the decoded tree otherwise; the
  header is emitted from `HeaderRecord.fields` (so a model edit is no longer silently dropped), and a
  header-aware `tokenizeHeader` builds those fields correctly at parse time instead of merging the
  whole record into one field. `rawLine` is still carried on `H`/`M`/`S` as provenance. The chosen
  semantics, re-encode rather than refuse/warn, and the reasoning are recorded at the site.
  **▶ TWO MORE EMIT GAPS WERE CLOSED 2026-07-29 (`ASTM-EMIT-RESIDUALS`), the two #21 and #22 both
  deferred.** A delimiter declaration longer than the three characters that carry a role now **keeps
  its surplus** on emit instead of silently truncating `H|\^&#` to `H|\^&`; and a caller-supplied
  delimiter set is **validated before any bytes are written** (one character each, no `CR`/`LF`, all
  four distinct) with a failing set now a typed `AstmSerializeError` carrying the new
  `ASTM_EMIT_INVALID_DELIMITERS` code (`AstmSerializeError.code` is now a union, exported as
  `AstmSerializeErrorCode`). A typed error rather than a warning **because emit returns a bare
  `string`**: the same house rule that drove #21's choice, applied to a case where re-encoding is not
  available. This is stricter than the reader: see known defect 2 below.
  **Frame emit:**
  `composeAstmFrames(records, opts?)` frames reassembled record bytes into `<STX> FN text <ETB|ETX> CS
<CR><LF>`: the modulo-256 checksum and the `0`–`7` frame number are **computed, never faked**;
  frame numbers run continuously (start `1`, roll over `7 → 0`); a record over **240** bytes is split
  `ETB…ETB…ETX`. **Never-fabricate discipline:** a builder emits only supplied values (an omitted result
  status reads back `unspecified`, never `final`; units/flags/IDs are never defaulted), structure
  (record types, delimiters, per-type seq counters, the `L` terminator) is computed, not guessed. Two
  typed emit errors guard framing integrity: `AstmSerializeError` (`ASTM_EMIT_UNENCODABLE_VALUE`, a
  `CR`/`LF` in a value cannot be escaped) and `AstmFrameEncodeError` (`ASTM_FRAME_EMPTY_RECORD`, an
  empty record/list is never an empty frame). Round-trip is proven: the archetype `roundTripProperty`
  is live (serialize is the idempotent inverse of parse), Tier-3 golden files round-trip every synthetic
  fixture through both layers, and `decodeAstmFrames(composeAstmFrames(x)) ≡ x`. New exports:
  `serializeAstmRecords`, `serializeAstmRecord`, `serializeField`, `encodeComponent`, `AstmSerializeError`,
  `buildAstmMessage` (+ the `*Input` types), `composeAstmFrames`, `AstmFrameEncodeError`,
  `ComposeFramesOptions`, `serializeFramedAstm`. **Deferred:** the vendor profile system (P8), LIVD
  terminology (P9), release hardening (P10); and, as before, the socket/serial adapter + numeric
  timeout/retry timing (we model transitions, not timers).
- **Phase 6 shipped (ASTM-6): transport variants + the pure LTP protocol reducer, the framing layer is
  now feature-complete for decode.** `src/ltp/` sits above the frame codec with two pieces, no live I/O.
  `detectFraming(bytes, opts?)` auto-detects the transport reality from the leading byte: `STX`/`ENQ` ⇒
  **framed** (serial, and cobas 4800 / Iguana framed-over-TCP); a bare record letter ⇒ **raw** (cobas
  b121 raw-TCP, framing dropped); an unrecognizable lead **defaults to framed and warns**
  (`ASTM_LTP_AMBIGUOUS_TRANSPORT`), with an `override` for a Phase-8 profile, never a silent guess into
  data loss. `ltpReduce(state, event)` is a **pure, socket-free** receiver-side state machine
  (`ltpInitialState()` seeds it) over `enq`/`ack`/`nak`/`eot` + a codec-decoded `frame`, returning
  `{ state, actions, warnings }`: actions `sendAck`/`sendNak`/`sendEot`/`deliverRecord`; the consumer
  owns the wire and clock. It models LIS01-A2 establishment → transfer → termination as `neutral ⇄
transfer`, reassembles `ETB…ETX` runs, and tracks the `0`–`7` sequence. **ACK-failsafe (borrowed from
  `mllp`):** a frame the codec did not vouch for (bad checksum, unterminated, or out of sequence) is
  `NAK`ed, **never** a fabricated positive `ACK`, and **never** appended/delivered; a `NAK` drives
  retransmit, not acceptance (`ASTM_LTP_FRAME_REJECTED`). Duplicate frames are idempotently re-`ACK`ed;
  a partial record open at `EOT`/`ENQ`-restart is discarded, never delivered. A **third** warning
  registry `ASTM_LTP_*` (value-free, a code + at most a frame number). Properties: never `ACK` after an
  untrusted frame; a full `ENQ → frames → EOT` session reassembles exactly the source records; a raw-TCP
  stream equals its framed twin. **Deferred:** serialize/build (P7); the socket/serial adapter + exact
  numeric timeout/retry timing (we model transitions, not timers, open question §10).
- **Phase 5 shipped (ASTM-5): the E1381/CLSI-LIS01 frame codec, the low-level framing layer begins.**
  `src/frames/` decodes a framed byte stream (`<STX> FN text <ETB|ETX> CS <CR><LF>`) via
  `decodeAstmFrames(bytes, opts?)` → `{ records, frames, warnings }`: it verifies the **modulo-256
  checksum** (span = the byte after `STX` through the `ETB`/`ETX` terminator inclusive; emitted
  uppercase, **accepted lowercase**), tracks **frame-number `0`–`7` sequencing** (rolls over, starts at
  `1`), and **reassembles** the **240**-byte-limited multi-frame records (the 7 control bytes are not
  counted; `ETB` intermediate / `ETX` final). `parseFramedAstm` composes the two layers at the edge.
  **Fail-safe (byte-level):** a bad checksum → frame flagged `trusted: false`, **never merged** into a
  record (warn in lenient / thrown in strict, validation is real, the "checksums not validated" claim
  was refuted); a frame-number gap → warn, **never silently bridged**; an unterminated frame → warn,
  **no partial record invented**; an oversize (>240) frame → warn, never dropped. A second warning
  registry `ASTM_FRAME_*` (sharing only `EMPTY_INPUT` with the record layer; snapshot locked),
  `ASTM_FRAME_BAD_CHECKSUM` / `ASTM_FRAME_SEQUENCE_GAP` / `ASTM_FRAME_UNTERMINATED` /
  `ASTM_FRAME_OVERSIZE`, every warning **value-free** (frame number + byte offset only). A **required
  `fast-check` fuzz gate** over the codec runs under `verify`. (The interactive LTP reducer
  (`ENQ`/`ACK`/`NAK`/`EOT`) shipped in P6, above; serialize/build is P7, the codec decodes byte streams
  only, no live I/O.)
- **Phase 4 shipped (ASTM-4): query + host-query flow + `M`/`S` verbatim, the record-content layer is
  now feature-complete.** `parseAstmRecords` reads
  `H`/`P`/`O`/`R`/`C`/`Q`/`M`/`S`/`L` with delimiter self-declaration and the escape codec (P1).
  **▶ DELIMITER SCOPING CHANGED 2026-07-29 (`ASTM-SECOND-HEADER-COLLAPSE`): read `CHANGELOG.md`
  `[Unreleased]` before touching `parse.ts`.** Delimiters were read **only from the first header** and
  applied to the whole stream, so a second `H` that redeclared them made **every following record
  collapse into one field, with zero warnings**, accepted by `strict`: shipped `0.0.1`–`0.0.3`. This
  is `ASTM-MIXED-DELIMITER-EMIT` one layer over, on the **parse** side, which is why #21 did not
  narrow it. A message runs `H` … `L`, so the active set is now re-read at **every** `H` and scoped
  **forward** (records already read keep the set they were read with, the only reading that never
  reinterprets consumed bytes). A changed set warns `ASTM_RECORD_DELIMITERS_REDECLARED`; a restated
  set is a silent no-op; an unusable later declaration keeps the set in force and warns
  `ASTM_RECORD_UNREADABLE_REDECLARATION` (the same condition on the **first** header is still the
  `ASTM_RECORD_UNDECLARED_DELIMITERS` fatal, pinned by a test). **The forward-scoping rule is a
  reasoned choice, NOT a citation**: LIS02-A2 §5.4/§6.2 are withheld from CLSI's free sample and the
  normative text on redeclaration was not reachable; do not add a clause number for it. The OSS corpus
  cannot ground it either (python-astm and senaite both hardcode `|\^&` and never read the
  declaration). The `R`
  record carries modeled, fail-safe result semantics alongside the raw fields (P2): `flag` (HL7 Table
  0078, `undefined` never coerced to normal), `status` (a `C`/`X` never reads as active-final; absent →
  `unspecified`), and `range` (bounds verbatim). P3 adds full patient identity (the practice/lab/third
  IDs stay **distinct**, plus mother's maiden name), full order fields (priority/action/report,
  `[OSS-derived]` indices), the `C` **comment** record attached by position to its preceding
  `H`/`P`/`O`/`R` parent (an orphan → message root + `ASTM_RECORD_ORPHAN_COMMENT`, never dropped), and
  partial-timestamp hardening. P4 adds the `Q` **Request Information** record (starting/ending range ID +
  Universal Test ID + request-info status, all surfaced verbatim, the range structure, `ALL` keyword,
  and status code set are `[OSS-derived / paywalled]`, never guessed), the **host-query flow**
  (`msg.classification`: a `Q`-bearing message is a `host-query` request and is **never** read as a
  result set, the `Q` dominates, `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND` flags a `Q`+`R` contradiction),
  and `M`/`S` records surfaced **verbatim** (`record.rawLine`, byte-identical), never interpreted into
  clinical fields. `src/common/` holds the value layer, `src/records/` the record layer. Deferred to
  later phases: the E1381 **framing** layer (P5+) and serialize/build (P7). The full sequence is in the
  meta-repo roadmap `operations/roadmaps/astm.md`.

<a id="defects"></a>

## Known defects live on `main` (recorded here so they survive independently of any backlog)

These are recorded here so they survive independently of any backlog. Each entry keeps its number,
so `CLAUDE.md` and every commit that cites "defect N" still resolves. A closed entry is kept, not
deleted: the correction it records is usually the lesson.

<a id="defect-1"></a>

### Defect 1: `patient()` / `results()` were scoped to the stream, not the message (CLOSED 2026-07-29)

**CLOSED 2026-07-29 by `ASTM-PATIENT-RESULT-MISATTRIBUTION`**, was: `patient()` and `results()`
scoped to the STREAM, not to a message, a wrong-patient path. On a stream carrying several
messages `patient(msg)` returned the **first** `P` in the whole stream while `results(msg)`
returned **every** `R` in it, so pairing the two (exactly what `README.md`'s north-star one-liner
does) attributed one patient's results to another, reproducing on an **ordinary same-delimiter
two-message stream** with **zero** warnings and no `strict` objection. Found by the
`conformance-refuter` grading `ASTM-SECOND-HEADER-COLLAPSE` and correctly not folded into it: the
fix is a public-surface **addition**, not a bug fix.
**▶ THE FIX IS DELIBERATELY BREAKING: read `CHANGELOG.md` `[Unreleased]` before touching
`extractors.ts`.** `messages(msg)` splits a parsed stream into its `H` … `L` messages, each
carrying only its own records; `patient`, `results`, `orders`, `comments` and `query` now throw
`AstmAmbiguousStreamError` (`ASTM_AMBIGUOUS_MULTI_MESSAGE`) on a multi-message stream rather than
answering across patients, and `patient()` also throws `ASTM_AMBIGUOUS_MULTI_PATIENT` on a single
message carrying several `P` records, the same guess one level down. The break is the fix: the
callers it breaks are the population that was being silently corrupted. **Note the second break
reaches SINGLE-message callers**, a lone message carrying several patients used to answer with
the first of them, so never write "single-message streams are unaffected"; the true statement is
that one message carrying at most one `P` is unchanged, as is a `P`-less result-only message.
`commentsFor()` is unchanged because its parent record already names the message.
**Still open, deliberately deferred to its own slice: within-message patient scoping**, which `P`
an `R` files against when one message carries several. The clauses that would ground it (the
message-level structure diagram and the `P` sequence-number rule) are withheld from CLSI's free
sample and paywalled, so the layer declines rather than inventing a rule: `patient` is `undefined`
and `patients` carries all of them. **Multi-patient messages are real** (an openly-published
vendor interface grammar makes the patient group repeatable on the **download** direction, which
is precisely the direction the OSS test corpora do not cover) so this is a deferral with a known
shape, not a claim the case does not arise. Do not close it by guessing a hierarchy.

<a id="defect-2"></a>

### Defect 2: An unrecognized type letter re-merges two messages (silencing CLOSED 2026-08-01, merge still open)

**A record whose type letter is not recognized as `H` re-merges two messages. The SILENCING was
closed 2026-08-01 by `ASTM-UNKNOWN-RECORD-REMERGE`; the MERGE itself is still open, on purpose.**
Message grouping keys on the `H` letter, in lockstep with the delimiter scoping, so a header the
reader does not see as a header (a stray byte before it, for instance) does not open a new
message: the two messages merge and one message's patient acquires the next message's results.
`PRE-EXISTING` (reproduces on `b1b46fc`, where the flat accessors misattributed unconditionally).
**What changed:** `ASTM_RECORD_UNKNOWN_TYPE` was on the profile safety gate's **tolerable**
allow-list, so a consumer profile tolerating it re-badged the only signal to
`PROFILE_QUIRK_APPLIED` and `{ strict: true }` then accepted the stream. It is now
safety-critical, so no profile reaches it and a strict parse of a merged stream throws whatever
profile is in force. Measured, both directions, in
`test/profiles/unknown-record-type-safety.test.ts`.
**▶ THE GATE IS NOW ENFORCED AT TWO POINTS, AND THE SECOND ONE IS LOAD-BEARING.** `AstmProfile`
is a plain exported interface whose own docs say hand-authoring is supported, so an object
literal naming a safety-critical code type-checks with no cast, and both a per-call `profile`
option and `setDefaultAstmProfile` accept one **without re-running the factory**. A
definition-time-only gate therefore guarded a door with a second entrance, and the refuter walked
through it: a hand-authored profile reproduced the full defect on the fixed tree. `applyAstmProfile`
now re-checks `isSafetyCriticalCode` before downgrading anything. It **declines rather than
throws**, so a hand-authored profile still parses and the original warning simply survives. Do not
"simplify" that check away as redundant with `defineAstmProfile`: it is the only one of the two
that a hand-authored profile passes through.
**▶ BOTH DOWNSTREAM COSTS WERE CLOSED 2026-08-02 by `ASTM-TYPE-LETTER-SECOND-READER`, NEITHER BY
INFERRING THE LETTER. Read `CHANGELOG.md` `[Unreleased]` before touching `parse.ts` or
`host-query.ts`.**
**(a) The value loss.** Delimiters are re-read at each `H`, keyed on the same letter, so an
unrecognized header does not re-scope them either. Where it declared a different set, the merged
tail was tokenized with the previous header's delimiters: measured, a `99.9 mmol/L` final result
read back with no value, no units and status `unspecified`, filed under the first message's
patient, with `ASTM_RECORD_UNKNOWN_TYPE` as the only report. New code
`ASTM_RECORD_FIELDS_UNSEPARATED` (+ exported factory `fieldsUnseparated`) now fires once per
record that carries content beyond its type letter and still yields exactly **one** field, which
means the set in force is not that record's set. **The detector is keyed on the OBSERVED collapse,
not on the mangled header** (identifying that header is itself the guess), so it is strictly
wider: it also closed the same silent collapse reachable with **no** mangled header at all, which
parsed with zero warnings through `0.0.8`. **Reported, never repaired** (re-splitting on a set no
header declared invents data); the raw line is surfaced intact. Safety-critical by construction,
so `strict` refuses and no profile reaches it. A header is exempt **by construction**, not by
exception: `tokenizeHeader` always yields type letter + declaration, and a header is read with the
set it declares itself. Measured in `test/records/unseparated-fields.test.ts`, which carries the
must-not-fire negative controls (conformant stream, bare `L`, a recognized redeclaring header, a
self-consistent non-canonical set, and this package's own serializer output).
**(b) The classification fail-safe.** `classifyMessage` counts `Q`/`R`/`O` by letter, so the
documented "`Q` dominates, a query is never read as a result set" guarantee held only while every
letter was legible: `H|\^&` + a mangled `Q` + an `R` classified `kind: "results"`,
`isHostQueryRequest` false, and `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND` vanished with the `Q` it was
counting. The letter is **still never inferred**; the classifier declines the positive answer
instead. An `unsupported` record with no `Q` read alongside it now yields
`kind: "indeterminate"`, and the new `AstmMessageClassification.hasUnrecognized` reports why. **A
`Q` that WAS read still dominates** (an unreadable letter can only add a kind, never remove a
query already on the wire), and `hasQuery`/`hasResults`/`hasOrders` stay truthful. This is a
**behavior change** for a consumer branching on `kind` or `isHostQueryRequest`, in the fail-safe
direction; a stream whose every letter is legible is unchanged. It remains a different defect from
#3 below (that one is per-message scoping of a correct fold; this was the fold reading a letter it
could not recognize).
**What is still open, and why it is not a "fix it next" item.** The lenient parse still merges,
and merging is not obviously the wrong answer: recognizing a mangled header _as_ a header means
guessing at a byte the sender did not send, and that guess would split the stream a different way
just as silently. A warning plus a strict refusal is the honest disposition, so **do not close
this by inferring a header.** The residual exposure is a lenient consumer that reads warnings and
does not act on this code; the README, the quickstart, `messages()` and the warning's own message
text all now say so.
**The variant that reaches furthest is the `P`-less second message.** `assertSinglePatient`
catches the merge when the second message carries its own `P` (two `P` in one message throws).
It cannot see a **result-only** second message: the merged message still holds exactly one `P`,
so `patient()` and `results()` both answer without objecting and the first patient silently owns
the second message's results. That is the fixture pinned in the test file above.
Found by the `conformance-refuter` grading `ASTM-PATIENT-RESULT-MISATTRIBUTION` 2026-07-29.

<a id="defect-3"></a>

### Defect 3: `msg.classification` is folded over the whole stream but documented per-message (open)

**`msg.classification` is folded over the whole STREAM but documented as per-message.**
`src/records/types.ts` describes it as the classification of "this message"; `classifyMessage`
folds every record in the stream, so on a multi-message stream a `Q` in one message reports as
host-query for all of them (with `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND` when an `R` is also
present). The dangerous direction is closed (`Q` dominates, so a query never reads as a result
set) and the over-trigger warns, which is why this is not a stop-the-line. `PRE-EXISTING`.
`AstmStreamMessage` deliberately carries no `classification`; `classifyMessage(m.records)` derives
the per-message answer and is documented on `queries`. Found by the `conformance-refuter` grading
`ASTM-PATIENT-RESULT-MISATTRIBUTION` 2026-07-29.

<a id="defect-4"></a>

### Defect 4: The reader accepts delimiter declarations it cannot reverse, and says nothing (CLOSED 2026-08-05)

**The parser reads delimiter declarations it cannot reverse, and says nothing.** `readDelimiters`
checks only that the field separator differs from the other three, so a header declaring `H|^^&`
(repeat === component) or `H|\&&` (component === escape) parses with **zero warnings**, and the
resulting set cannot carry a field tree back out, because the boundary between two roles sharing a
character is unrecoverable. Emit **now refuses** such a set
(`ASTM_EMIT_INVALID_DELIMITERS`, `ASTM-EMIT-RESIDUALS`), which is what makes the hole visible from
the outside: `serializeAstmRecords(msg, msg.delimiters)` throws on a message that parsed clean.
Whether the reader should warn (and under which code) is the open question; it is **parse**-side,
`PRE-EXISTING`, and was deliberately not folded into the emit slice that surfaced it.
**Deferred again, explicitly, by `ASTM-FRAME-BYTE-RESIDUALS`:** that slice is the frame layer's
string-to-bytes step, and this is the record layer's **reader**, one layer up and on the other
side. Its open question is also a **new warning code on the parse path**, which lands on the
profile safety gate and therefore on every consumer profile: a behaviour change wanting its own
argument, not a rider on a byte-level encoder fix.
**Deferred again, explicitly, by `ASTM-FRAME-RESIDUALS` 2026-08-03** (the `startFrameNumber`
slice): that one refuses an **encoder option** whose domain is a single byte on the wire and which
no profile can see; this one adds a **parse-path warning code**, which every consumer profile has
to be re-derived against. Same repo, opposite blast radius. It still wants its own slice.
Found while grading `ASTM-EMIT-RESIDUALS` 2026-07-29.

**CLOSED 2026-08-05 by `ASTM-FRAME-RESIDUALS`, as a REPORT and not as a refusal.** The declaration
is still read and honored and no record is dropped, because refusing it would drop records the
sender did send; what is new is `ASTM_RECORD_DELIMITER_ROLE_COLLISION`, raised at the header that
put the set into force, once rather than once per colliding pair, and **not** on `TOLERABLE_CODES`.
**A later header restating the colliding set already in force warns nothing** (the `sameDelimiters`
early return in `adoptRedeclaredDelimiters`), on the same rule as every other delimiter warning: a
first draft of this entry said "once per header that declares such a set", the refuter measured two
declaring headers producing one warning, and the sentence was the defect.

**▶ THE FIELD ROLE IS NOT IN IT, AND SAYING "FOUR ROLES" HERE IS WRONG.** A declaration naming the
field separator in another role does not resolve at all (`readDelimiters` returns `undefined`), so
it is the `ASTM_RECORD_UNDECLARED_DELIMITERS` fatal on the first header and
`ASTM_RECORD_UNREADABLE_REDECLARATION` on a later one. What this code covers is the **three**
unordered pairs among the rest, enumerated: **repeat/component, repeat/escape, component/escape**.

**▶ THE MEASURE IS STRICT-ACCEPTED-UNDER-A-GATE-LEGAL-PROFILE, AND "SILENT" WAS NEVER AVAILABLE
HERE.** Every colliding set is by definition non-canonical, so it always raised the tolerable
`ASTM_NONSTANDARD_DELIMITERS`: `warnings: []` was structurally unreachable for the whole class, so
"it is never silent" was true and discriminated nothing. Measured over the committed corpus
constants `DELIMITER_ALPHABET` and `sweepStream` in `test/records/delimiter-role-collision.test.ts`
(the twelve characters `|` `\` `^` `&` `~` `:` `#` `*` `!` `@` `$` `%`, one header plus one
terminator): of the 20,736 four-role tuples, **15,972 resolve**, of which **4,092 collide** and
**11,880 do not**. Under a gate-legal profile tolerating `ASTM_NONSTANDARD_DELIMITERS` plus
`{ strict: true }`, **4,092 of the 4,092 were accepted on `3107273` and 0 are now**, while all
11,880 non-colliding sets are accepted exactly as before. The base figure was measured against
`origin/main`'s `src/`, not inferred. **Every count here is derived from the alphabet constant in
the test itself**, so moving the alphabet moves the numbers.

**▶ THE DEFAULT-PATH RE-EMIT LAUNDERS IT, AND THIS IS NOT CLOSED EITHER.** Measured: `H|^^&` with
`R|1|^^^687|A^B^C^D|...` parses with the new code, and `serializeAstmRecords(msg)` with **no**
delimiter argument emits `R|1|\\\687|A\B\C\D|...`, which re-parses with `warnings: []` carrying the
same mis-structured tree (the `687` test identity still stranded in the fourth repeat). Same shape as
defect 11's laundering hop, and the same disposition: generation 1 is loud and non-tolerable, and
that is the catch point. Do not write either as closed. `PRE-EXISTING` in every part but the gen-1
warning. Recorded by the `conformance-refuter`, pass 2, 2026-08-05.

**▶ IT IS A REPORT, NOT A REPAIR, AND THE PROSE MUST NOT DRIFT INTO CLAIMING OTHERWISE.** Under
`H|^^&` the field `A^B^C^D` still reads back as four repeats of one component each, `components`
still holds only `A`, and `serializeAstmRecords(msg, msg.delimiters)` still throws
`ASTM_EMIT_INVALID_DELIMITERS`. Measured on `H|\&&` (component and escape both `&`): `A&B` splits
into two components while `A&F&B` reads as the single component `A|B`, so the same character means
two different things depending on what follows it. Both are pinned.

<a id="defect-5"></a>

### Defect 5: Emit escaped a record's own type letter away (CLOSED 2026-08-03)

**CLOSED 2026-08-03 by `ASTM-FRAME-RESIDUALS`. It was recorded as a LOUD defect and its worse
branch was SILENT: the third time an astm loudness note has been measured false.** Was: emitting
with `field: "R"` escaped the `R` record's own type letter away (it is just another leaf to
`encodeLeaf`), so the line went out as `&F&R1R…` and re-read as an **unsupported** record, one
result in, zero out of `results()`. `PRE-EXISTING`, byte-identical on `7253098`.
**▶ WHAT THE OLD ENTRY GOT WRONG.** It described only the branch where the escape character is
_not_ a record type letter. `encodeLeaf` writes an escaped character as escape + mnemonic +
escape, so when the escape character **is** a type letter the escaped type letter begins with a
real letter and `ASTM_RECORD_UNKNOWN_TYPE` never fires. Measured: a `P` record emitted with
`field: "P"`, `escape: "R"` comes back as an **`R` record** whose `value` is the patient's
laboratory ID, `units` the practice-assigned ID, `resultStatus` `F`, so `results()` returns a
**fabricated final result built out of patient identifiers**. Its only warning is
`ASTM_NONSTANDARD_DELIMITERS`, which a **clean** non-canonical stream carries too and which is on
the safety gate's tolerable allow-list: over 3,690 emits across nine record-set shapes, 750
streams read back as different records and **303 of them were accepted by `{ strict: true }`**
under a gate-legal profile. That allow-list entry argues "a record's type letter is the first
character of its line" is read before tokenization: true of the parse, no protection when the
**emit** chose the character. The entry is annotated, not removed, and its severity is defect 11's
question, not this slice's.
**▶ THE FIX IS DERIVED FROM THE READER AND CHECKED ON THE BYTES. Read `CHANGELOG.md`
`[Unreleased]` before touching `serialize.ts`.** `parseAstmRecords` takes a record's type from
`line.charAt(0)`, so `serializeRecordChecked` now asserts the first character it wrote is the
letter the record models, and raises `ASTM_EMIT_TYPE_LETTER_COLLISION` (third member of
`AstmSerializeErrorCode`) otherwise, carrying `recordIndex` and quoting nothing from the record. **Testing the output rather than listing dangerous roles is
what makes a type letter equal to the ESCAPE character fall out as accepted with no special
case**: it is written starting with that letter, so the record re-reads as its own type.
**▶ THE `letter`+`E`+`letter` CAVEAT IS RETIRED, BECAUSE THE EXCEPTION IT NAMED WAS CLOSED
(`ASTM-FRAME-RESIDUALS` follow-up, defect 12, 2026-08-04).** It used to read "do NOT restate that
as `letter`+`E`+`letter`, which the refuter measured false", and it was right at the time:
`encodeLeaf` protected the escape character it introduced but not the `E`/`F`/`S` mnemonics, so
under `{ field: "E", escape: "R" }` an `R` encoded to `RRFRR` and its type field decoded back to
`RER`. The encoder is a single left-to-right pass now, so that set encodes to `RER` and decodes
back to `R`, and the shape holds for every set. **Do not "simplify" the check into a rule over the
four roles even so**; a role list would refuse sets that work, and the byte-level check is what
let this guard survive the encoder being rewritten underneath it without a single change. Biconditional with the old
serializer losing a type letter over **137,632** delimiter sets: zero over-refusal, zero
under-refusal. **No clause claimed**; grounding is this package's own reader.
**What it does NOT promise, and the prose says so in five places:** a record re-reads as its own
**type**, not that every field lands where it did (defect 11's atom is untouched), and
`encodeComponent`/`serializeField` take no record so they are outside the check by construction.
Pinned in `test/records/type-letter-collision.test.ts`, asserted on what the old serializer
produced, rebuilt from the shipped `serializeField` so nothing is transcribed twice.
**▶ IT IS A TRANSCODING CONDITION AND FIRES WITH NO `d` ARGUMENT. The first draft of this entry
and four shipped surfaces said "pass the canonical set instead", which is not a remedy.** A stream
whose header declares a vendor set and which carries one garbled line beginning `|` parses to an
unsupported record whose type letter is `|`, and the **default canonical** emit escapes it away:
`serializeAstmRecords(msg)`, `serializeAstmRecord(record)` and `serializeFramedAstm(msg)` all
refuse it, where base emitted a record whose `rawType` came back as `&`. The refuter fuzzed 300,000
streams on the default path: 2,316 new throws, 621 of which base genuinely relabeled a modeled
record type. That is a narrowing on a published package reaching the lenient-parse population, so
say so wherever the refusal is described.
Originally found by the `conformance-refuter` grading `ASTM-EMIT-RESIDUALS` 2026-07-29; the silent
branch and the transcoding reach found by `ASTM-FRAME-RESIDUALS` 2026-08-03.

<a id="defect-6"></a>

### Defect 6: A raw `STX` / `ETX` / `ETB` in a value truncated the frame (CLOSED 2026-08-03)

**CLOSED 2026-08-03 by `ASTM-RAW-ETX-SWALLOWS-A-RECORD`. It WAS a stop-the-line, and the reason
is that its worst branch was SILENT.** Was: emit rejected `CR`/`LF` in a component and nothing
else, so a value carrying `STX`/`ETX`/`ETB` passed `serializeAstmRecord` and truncated the frame
body in `composeAstmFrames`. `PRE-EXISTING`.
**▶ THE ENTRY ONCE SAID "A WARNING DOES FIRE AND NO VALUE IS MIS-READ, WHICH IS WHY THIS IS NOT A
STOP-THE-LINE". THAT WAS MEASURED FALSE** by the `conformance-refuter` grading
`ASTM-FRAME-BYTE-RESIDUALS` 2026-08-02, and the correction is what re-ranked it. It held only
while the two bytes after the embedded control character failed to be that truncated frame's
checksum. When they **are**, the short frame verifies, the tail is skipped as inter-frame bytes
(`decode.ts` resumes at `termIndex + 3`), the next frame number is still in sequence, and nothing
warns: a `C` comment ending `…HEMOLYZED` + `ETX` + the two matching characters reassembled without
its terminating `CR`, so the following `R` **merged into the comment's free text**
(`"SPECIMEN SLIGHTLY HEMOLYZEDR"`) and a `28.6 U/L` result **disappeared**, `warnings: []` at both
layers. **An embedded `ETB` reaches the same silence by the OTHER DOOR, which this entry did not
have:** it leaves the record open, so the _next_ record's text is appended to the truncated one
and two records read back as one, every field of the result hanging off the comment.
**▶ THE FIX REFUSES AT THE FRAME LAYER, AND THE RECORD LAYER IS DELIBERATELY UNTOUCHED. Read
`CHANGELOG.md` `[Unreleased]` before touching `encode.ts`.** `composeAstmFrames` throws
`ASTM_FRAME_RESERVED_BYTE` (third member of `AstmFrameEncodeErrorCode`, with `recordIndex` +
`characterIndex`, value-free) for a record carrying `STX`/`ETB`/`ETX`, in **either** accepted
form: unlike the `U+00FF` refusal beside it there is **no bytes-instead escape hatch**, because
the byte is unframable however it arrives.
**The cost this slice turned on was whether to refuse it in `serializeAstmRecord`, and the answer
is no, measured.** In every modeled value, all three bytes round-trip through
parse → serialize → parse byte for byte, value/units/status intact, byte-stable, `warnings: []`
on both generations, so refusing would take a byte a raw-transport consumer genuinely supplied.
**That is a claim about VALUES and the refuter narrowed it to one:** the surplus of a header's
delimiter declaration is not a modeled value, and `declarationResidual` drops any control
character from it silently, so `H|\^&` + `ETX` emits without the byte, `warnings: []`,
byte-stable. `PRE-EXISTING`, argued at its own site, and now the better disposition of the two
(carrying it through would turn a spec-clean header into a refused stream). Pinned, so the scoped
sentence stays measured. The byte becomes structure only when a frame is built, and
`composeAstmFrames` is the total gate on that route including `serializeFramedAstm`.
**The three bytes are derived from what `decodeAstmFrames` READS as structure, not from a
control-character class**: `CR`/`LF` are deliberately absent (read only _after_ the checksum; a
record's own `CR` sits inside frame text on every stream this encoder writes) and
`ENQ`/`ACK`/`NAK`/`EOT` are absent too (structure only _between_ frames, measured to round-trip
byte-exactly inside one). **No clause is claimed**: LIS02-A2 stayed withheld, and the grounding is
this repo's own decoder.
Both silent branches and the loud ones are pinned in `test/frames/reserved-structure-byte.test.ts`,
asserted on **what the old encoder produced** (rebuilt with the test-only `frame()` builder, so
nothing is transcribed twice), with a biconditional property: a Latin-1 record is refused **if and
only if** it carries one of the three, and is otherwise reproduced byte for byte.
**One residue, stated rather than left to be found, and pinned:** the check compares elements
against the three byte values, so a JavaScript caller passing some other typed array is not
reached. A `Uint16Array` element of `0x0103` is not `0x03`, is not refused, and
`Uint8Array.from` then writes its low byte as an `ETX` anyway. Measured on `0x0102`/`0x0103`/
`0x0117`: framed, then lost at decode. Same out-of-signature residue already recorded under
defect 7, unchanged in either direction.

<a id="defect-7"></a>

### Defect 7: The frame encoder truncated every character to its low byte (CLOSED 2026-08-02)

**CLOSED 2026-08-02 by `ASTM-FRAME-BYTE-RESIDUALS`. It was recorded as a LOUD defect and the
larger half of it was SILENT.** Was: `src/frames/encode.ts` wrote `input.charCodeAt(i) & 0xff`,
truncating every character to its low byte.
**▶ WHAT THE OLD ENTRY GOT WRONG, because it generalized from the code points it happened to
measure.** It said the truncation "fails **loudly** in every case measured (a typed error or a
warning, never a silent mis-read)", and that was true of `U+0102`/`U+0103`/`U+0117`/`U+010D`,
which land on `STX`/`ETX`/`ETB`/`CR`. But a code point's low byte is usually an **ordinary
character**, and then nothing objects at all. Measured on the canonical set, all three with
`warnings: []` at **both** layers: `28.6|μmol/L` read back `28.6` in `¼mol/L` (units silently
changed); `ŁUKASZ` read back `AUKASZ`; and `GRAżYNA` read back **split across two fields**
(`U+017C` low byte is `0x7C`, the field separator), shifting every following field along so
`patient().sex` answered `19800101` and the birth date was gone. That last one is **silent
re-read divergence with a different field tree**, the dangerous direction the house invariant
names. The lesson generalizes past this defect: **a claim of "loud in every case" is a claim
about the input space, not about the cases you ran.**
**▶ THE FIX REFUSES, AND THE GROUNDING IS FIRSTHAND WITH NO CLAUSE CLAIMED. Read `CHANGELOG.md`
`[Unreleased]` before touching `encode.ts`.** `composeAstmFrames` throws
`ASTM_FRAME_UNENCODABLE_CHARACTER` (new code on `AstmFrameEncodeError`, whose `code` is now a
union exported as `AstmFrameEncodeErrorCode`, plus a `characterIndex`) rather than substituting a
character. Two grounds, both readable: this package's **own** byte-to-string boundary is already
Latin-1 on the read side (`parseAstmRecords` decodes `String.fromCharCode` per byte, deliberately)
and the encoder is documented as the decoder's exact inverse, so a code point the decoder can
never produce is outside the codec's domain; and `kxepal/python-astm` (BSD) threads `encoding`
through its whole codec with `ENCODING = 'latin-1'` in `astm/constants.py`, so the wire code page
is caller-supplied out-of-band knowledge there too. **UTF-8 was considered and rejected**: it
picks a code page the sender never declared, which is the same guess this library refuses
everywhere else. **Do not add a clause id**: LIS02-A2 stayed withheld and the paywalled editions
were not read.
**The refusal removes no capability** (`composeAstmFrames` already took `Uint8Array`, and bytes
are written through untouched) and the **record** layer is deliberately untouched, because
`serializeAstmRecords` returns a `string`, which is not yet bytes. Measured and pinned in
`test/frames/unencodable-character.test.ts`, which asserts on what the OLD encoder produced, not
merely on the new throw, and carries the property "either refuse the record string or reproduce
it byte for byte" **with its bound written in**: a record already carrying a raw `STX`/`ETX`/`ETB`
is excluded, because it is refused for the other reason. That bound was written when defect 6 was
open and the encoder framed such a record as given; defect 6 closed 2026-08-03, and the exclusion
now only keeps the two refusals from being read as one. A non-vacuity block asserts the
reproduction half actually reaches high bytes and the 240-byte split rather than counting runs,
and it earned its keep immediately: the first generator crossed the split **zero** times in 2,000
cases, so the property's own wording was carrying more than the evidence did.
**One residue, stated rather than left to be found:** the guard is on the `string` branch of
`toBytes`, so a JavaScript caller passing some other typed array (a `Uint16Array`) still gets the
old low-byte corruption from `Uint8Array.from`: measured, each element is written as its low byte
and a `Uint16Array` carrying `U+03BC` reads back `¼`, `warnings: []`. That is outside the declared
`Uint8Array | string` signature and no TypeScript consumer can reach it. The doc comment is scoped
to the two accepted forms **and says what happens to any other typed array**, rather than implying
the refusal covers it: a first draft of that sentence claimed the elements "are not treated as
bytes", which is false, and a false sentence in a comment that compiles into `dist/index.d.ts` is
worse than the silence it replaced. `PRE-EXISTING`. Originally found by
the `conformance-refuter` grading `ASTM-EMIT-RESIDUALS` 2026-07-29; the residue and the thin
generator both found by the `conformance-refuter` grading `ASTM-FRAME-BYTE-RESIDUALS` 2026-08-02.

<a id="defect-8"></a>

### Defect 8: An unpaired escape character swallowed the record tail (CLOSED 2026-08-02)

**CLOSED 2026-08-02 by `ASTM-UNESCAPED-ESCAPE-SWALLOWS-TAIL`. It WAS a stop-the-line, and the
measurement is why.** Was: `splitEscapeAware` / `decodeEscapes` (`src/common/escapes.ts`) scanned
forward for the next escape character with no bound, so a lone escape character opened a sequence
that never closed and copied to end-of-record, and **there was no warning code for the
condition**. `R|1|^^^687|28.6&|U/L||N||F` read back `value` = `28.6&|U/L||N||F` with **units
gone, abnormal flag gone, and status `unspecified` rather than `final`**, `warnings: []`;
`P|1||LAB-0001||O&BRIEN^JANE||19800101|F` lost **birthDate and sex**, `warnings: []`. Emit then
re-escaped the garble into `28.6&E&&F&U/L&F&&F&N&F&&F&F`: a spec-clean-looking line encoding the
corrupted tree, re-parsing to the same wrong value, byte-stable across further trips: **silent
re-read divergence**, with no malformed delimiter set at all. `PRE-EXISTING`, reproduced
byte-identically on `064c078`.
**▶ THE VERDICT WAS STOP-THE-LINE, AND IT IS THE UNITS THAT DECIDE IT.** The bar is a wrong dose,
a wrong identifier, or a value silently dropped from a lab result. A lenient consumer got `28.6`
out of `parseFloat(value)` and **no units at all** on a wholly canonical stream with an empty
warnings array: a lab number with its units silently removed is a wrong result, not a formatting
nit. Status `final` reading `unspecified` and the flag going missing are fail-safe on their own;
they are not what carried the verdict. Do not restate the verdict more broadly than that.
**▶ THE FIX IS A BOUND, AND IT INFERS NOTHING. Read `CHANGELOG.md` `[Unreleased]` before touching
`escapes.ts`.** An escape sequence is now exactly three characters (escape, **one** body
character, escape), all the four mnemonics ever need, and the split and the decoder share one
definition of it, because a split that disagrees with its decoder is the mis-read class that file
exists to prevent. An escape character heading no sequence is the literal character it is; the
value keeps the byte that arrived and nothing is invented to close a sequence the sender did not
open. New **tolerable** code `ASTM_UNPAIRED_ESCAPE_CHARACTER` + factory `unpairedEscapeCharacter`
report it. Tolerable, not safety-critical, and the reason is a property of the **parse**: reading
the character as a literal is unconditional, so tolerating the code changes no byte of the value.
The bound also killed a non-local behavior worth remembering: under the old scan two bare
ampersands in one record paired **across** the field separator between them, so whether a field
kept its value depended on an unrelated later field.
**▶ WHAT IT DID NOT CLOSE, AND THE FIRST DRAFT OF THIS ENTRY CLAIMED IT HAD.** The atom rule is
unchanged, so an `&X&` sequence whose body **is** a delimiter still swallows that delimiter:
`R|1|^^^687|28.6&|&U/L||||F` still reads `28.6&|&U/L` with no units and status `unspecified`.
That is **defect 11 below**, it is reported (never silent) under a tolerable code, and it must
not be closed by narrowing the atom, which is what keeps `&F&` one token under a set naming `F`
as a delimiter. The refuter caught this as prose overreach in eight places including two shipped
consumer surfaces and one false runtime warning message. **That is the third time on this defect
family that the claim, not the guard, was the defect. Scope the sentence to the character the
code reports; never to "the record".**
**▶ THE MANGLED-HEADER FIXTURE NOW REPORTS TWO CODES, AND THE SECOND ONE IS INCIDENTAL.**
`test/profiles/unknown-record-type-safety.test.ts`'s ` H|\^&|…` is not tokenized as a header, so
its declaration is read as data and its `&` is genuinely unpaired. That is **not** a second reader
of the mangled header, and nothing may start treating it as one: a mangled header whose
declaration carried no escape character reports only `ASTM_RECORD_UNKNOWN_TYPE`, and the merge is
identical either way. `MANGLED_CODES` in that file carries the note.
Found by the `conformance-refuter` grading `ASTM-TYPE-LETTER-SECOND-READER` 2026-08-02.

<a id="defect-9"></a>

### Defect 9: `inline-loinc-candidate` is asserted with no LOINC evidence (open)

**`inline-loinc-candidate` is asserted with no LOINC evidence.**
`src/common/coding-system.ts` tags **any** non-empty first component as an inline LOINC candidate
with no format check, so the very ordinary `R|1|Glucose|28.6|U/L||N||F` reports
`provenance: "inline-loinc-candidate"` with `loincCandidate: "Glucose"`, and `primaryCode()`
returns `"Glucose"`. That is a code-system provenance claim on evidence that does not support it,
in a package whose whole discipline is never to guess a code system. `PRE-EXISTING`, untouched by
`ASTM-TYPE-LETTER-SECOND-READER`. **Deferred again, explicitly, by
`ASTM-UNESCAPED-ESCAPE-SWALLOWS-TAIL`:** it is a different module and a different question (what
shape counts as LOINC evidence, and what `provenance` should say when nothing does), and
answering it inside an escape-codec slice is how a fix outgrows the thing it fixes. It still wants
its own slice. Found by the `conformance-refuter` grading it, 2026-08-02.

<a id="defect-10"></a>

### Defect 10: `ASTM_RECORD_FIELDS_UNSEPARATED` is deliberately partial, so its absence certifies nothing (open)

**`ASTM_RECORD_FIELDS_UNSEPARATED` is deliberately PARTIAL, so its absence certifies nothing,
and two classes of the same value loss stay silent.** The check is one test on one of the four
delimiter roles, the **field** separator, and only in its total form (that separator occurs
nowhere in the line). **(a)** A foreign set whose **field** separator happens
to occur anywhere in the line still splits, on the wrong boundaries:
`R*1*^^^688*99.9*mmol/L**H**F|` (one stray `|`) loses value, units and status with **zero**
warnings, and the identical record without that one byte **is** reported. **This happens INSIDE
a run of these warnings too**, so a run is not a sweep of the records it spans: measured, a
collapsed tail fired at records 3, 4 and 6 and **not** at record 5, whose value/units/status
were gone. **(b)** A set differing in the **repeat / component / escape** role usually splits
into fields normally, and the damage varies. A `:`-component record under the canonical set
keeps its value and units but loses its test identity, silently. **An ESCAPE character occurring
literally in a record was much worse and cost the value: that was defect 8, and only its BARE
form is closed. An `&X&` whose body is a delimiter still swallows it (defect 11, closed 2026-08-05
as a report, so the swallow is unchanged; where the body is UNRECOGNIZED it is no longer reported
only by a tolerable code, and where the body is a RECOGNIZED mnemonic whose letter holds a delimiter
role it is reported by NO code, deliberately), so the escape role stays on this list, narrowed.**
**A repeat-role instance of (b), measured 2026-08-05 while grading defect 11's fix:** under `H|F^&`
the ordinary `F` (final) result status letter is itself the repeat delimiter, so
`R|1|^^^687|28.6|U/L||N||F` reads `status: unspecified` with the value and units intact, warning only
`ASTM_NONSTANDARD_DELIMITERS`, and a default-path re-emit writes a `\\` into the status field that
generation 2 reads with `warnings: []`. The entry enumerated a component-role instance and not this
one. An earlier draft of this entry wrongly described the whole
role group as splitting "perfectly" and costing only a test identity, which is the same
misdiagnosis (misattribution, not value loss) that item existed to correct; a later draft
wrongly struck the escape role off entirely. Both remaining halves `PRE-EXISTING`. **Not fixed
on purpose:** widening the check means
deciding which set a record _ought_ to have had, which is the same guess the parser declines
everywhere else. Both are **pinned** in `test/records/unseparated-fields.test.ts` under "the
limits", and the boundary is stated on the warning code, in `README.md` and in the quickstart.
**If you ever make one of those tests go green by widening the guard, the prose in all three
places has to move with it.** Found by the `conformance-refuter` grading
`ASTM-TYPE-LETTER-SECOND-READER` 2026-08-02.

<a id="defect-11"></a>

### Defect 11: `ASTM_UNKNOWN_ESCAPE_SEQUENCE` is tolerable while being the only report that a field separator was swallowed (CLOSED 2026-08-05)

**🩺 `ASTM_UNKNOWN_ESCAPE_SEQUENCE` IS TOLERABLE WHILE BEING THE ONLY REPORT THAT A FIELD
SEPARATOR WAS SWALLOWED.** `splitEscapeAware` treats an `&X&` triple as an opaque atom, so where
`X` is itself a delimiter that delimiter never becomes a boundary. Measured on the canonical
set: `R|1|^^^687|28.6&|&U/L||||F` reads `value` = `28.6&|&U/L` with **no units and status
`unspecified` rather than `final`**, and the sole warning is `ASTM_UNKNOWN_ESCAPE_SEQUENCE` --
which is on `TOLERABLE_CODES`, and the shipped `referenceCorpus` profile tolerates it, so
`{ strict: true }` **accepts** the record. `PRE-EXISTING` (byte-identical on `064c078`).
**▶ IT IS NOT A STOP-THE-LINE, and the reason is exactly one thing: the FIRST parse of the wire
bytes warns.** An ingest-time consumer reading warnings is told. A warned mis-read ranks below a
silent one, consistently with defects 6 and 7 as they stood when each was measured. **Do not add "and the round trip is stable" to
that argument** (an earlier draft of this entry did): the round trip is stable, and stability is
what makes this WORSE, not better. Measured, head and base alike, the emit path launders it in
one hop: generation 1 warns `ASTM_UNKNOWN_ESCAPE_SEQUENCE` and reads `28.6&|&U/L`; it serializes
to the spec-clean `R|1|^^^687|28.6&E&&F&&E&U/L||||F`; generation 2 reads the same wrong value
with `warnings: []` and `{ strict: true }` **accepts** it. That is the same signature defect 8
was called a stop-the-line for, one re-emit away. It does not carry the verdict here only
because the harm needs a re-emit and a re-ingest rather than a single read. **It is why this
defect should be scheduled rather than parked.**
**▶ THE ADMISSION ARGUMENT IN `src/profiles/safety.ts` IS WRONG FOR THIS CASE AND SAYS SO NOW.**
It reasons that the split "has already finished dividing before any body is decoded", which is
true and beside the point: the atom decision **is** the split, so the condition this code
reports is a lost field boundary, failing part 1 of the two-clause test on the _reading_ rather
than on the value. `ASTM-UNESCAPED-ESCAPE-SWALLOWS-TAIL` re-derived the allow-list and did not
re-read this entry against it; the entry is annotated rather than removed.
**▶ DO NOT CLOSE IT BY NARROWING THE ATOM.** The atom is what keeps `&F&` one token under a set
that names `F` as a delimiter, and `test/records/unpaired-escape.test.ts` pins that. The real
question is what should report it and at what severity, and that is a behavior change for every
consumer profile naming the code, so it wants its own slice. Pinned in
`test/records/unseparated-fields.test.ts` and `test/records/unpaired-escape.test.ts`. Found by
the `conformance-refuter` grading `ASTM-UNESCAPED-ESCAPE-SWALLOWS-TAIL` 2026-08-02.

**CLOSED 2026-08-05 by `ASTM-FRAME-RESIDUALS`, and closed as a REPORT.** The atom was **not**
narrowed, the split is unchanged, and the decoded value is byte-identical: `28.6&|&U/L`, no units,
status `unspecified`, exactly as before. What is new is
`ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`, raised **alongside** `ASTM_UNKNOWN_ESCAPE_SEQUENCE`
rather than instead of it, on the subset where the unrecognized body is one of the three splitting
roles in force. It is not on `TOLERABLE_CODES`, so `{ strict: true }` under the shipped
`referenceCorpus` now refuses that record.

**▶ THE TOLERABLE CODE WAS KEPT ON THE LIST DELIBERATELY.** Striking
`ASTM_UNKNOWN_ESCAPE_SEQUENCE` off would change behaviour for every profile naming it while still
leaving the loss reported by a code that also fires on bodies that cost nothing. What was scoped
away in `src/profiles/safety.ts` is a **claim**, not a guard: its bullet now says the questionable
half is carried by a separate, non-tolerable code.

**▶ THE ESCAPE ROLE IS EXCLUDED ON PURPOSE, AND SO IS EVERY RECOGNIZED MNEMONIC.** Nothing splits
on the escape character, so `&&&` costs no boundary; and `&F&` under a set naming `F` as the repeat
delimiter is the sender escaping the field separator on purpose, so reporting a swallowed repeat
boundary there would report the escape mechanism working as a defect. Both are pinned.

**▶ THE LAUNDERING HOP IS NOT CLOSED, AND MUST NEVER BE WRITTEN AS CLOSED.** Emit still rewrites
the preserved sequence into recognized mnemonics (`28.6&E&&F&&E&U/L`), and generation 2 reads
`warnings: []` with the same wrong value. That is **correct** about generation 2's own bytes, which
say that value unambiguously; the misreading is inherited from generation 1. So the catch point is
the first read of the wire bytes, and there is no guard on the round trip.

**▶ MEASURED, base against head, over the committed constants `BODY_ALPHABET` and `bodyStream` in
`test/records/swallowed-delimiter.test.ts`** (the same twelve characters as escape bodies in one
spec-clean result record, whose field layout is identical in all twelve cases so the only variable
is the reporting): **3 of the 12 raise the new code, enumerated as `|`, `\` and `^`**, the field,
repeat and component roles of the canonical set. Under `referenceCorpus` plus `{ strict: true }`,
**12 of 12 were accepted on `3107273` and 9 are now**.

<a id="defect-12"></a>

### Defect 12: Chained substitutions in `encodeLeaf` altered the values they emitted (CLOSED 2026-08-04)

**CLOSED 2026-08-04 by `ASTM-RECORD-EMIT-RESIDUALS`. It was FIXED rather than disclosed, so the
planned widening of the "what is not guaranteed" prose was deliberately NOT made.** Was:
`encodeLeaf` ran as four chained whole-string substitutions (escape, then field, component,
repeat) and each pass could see what the previous ones had written, so it protected the escape
character it introduced but **not** the `E`/`F`/`S`/`R` mnemonics, and an accepted set naming one
of those letters in another role altered values. `PRE-EXISTING`, byte-identical on `4bb62f1`.
**▶ THE RECORDED FIGURES WERE NOT RE-DERIVABLE AND ARE REPLACED, NOT REPRODUCED.** The old entry
read "11,510 of 69,360 accepted sets" with a largest bucket of 8,204, from a sweep whose alphabet,
corpus and acceptance filter were never written down; none of the three is recoverable, so those
numbers were retired rather than re-asserted. Re-measured over a fully stated space: P(18,4) = 73,440 four-role
sets over the alphabet `|` `\` `^` `&` `E` `F` `S` `R` `*` `~` `:` `#` `+` `@` `!` `$` `%` `/`
(the four canonical delimiters, the four mnemonic letters, a common vendor set and neutral
punctuation), against **exactly the `STREAM` constant in
`test/records/escape-mnemonic-roles.test.ts`**, a synthetic ten-record
`H`/`P`/`O`/`R`/`R`/`R`/`C`/`M`/`S`/`L` message parsing `warnings: []`: 23,040 refused,
**50,400 accepted, 10,450 diverging at field-tree level, 9,287 of those reporting nothing outside
`TOLERABLE_CODES`**, so a gate-legal profile plus `{ strict: true }` accepted an altered value.
**Write the space down with any figure you quote here, and name the corpus by a constant that is
IN THE TREE.** The reason this entry's predecessor had to be discarded is that nobody wrote the
space down; the reason THIS entry was refuted on its second pass is that its first draft quoted
figures from an eight-record corpus that existed only in a scratch file and then described it as
`STREAM` plus rows, which was false in both directions. The corpus moves every one of these four
numbers: the same alphabet against the eight-record message gives 12,240 / 61,200 / 14,170 /
12,623. **A corpus you cannot point at is a figure you cannot re-derive.**
**▶ "0 SILENT" RE-MEASURED TRUE AND IS A WEAK MEASURE, WHICH IS THE MORE USEFUL FINDING.** Zero of
the 10,450 re-parsed with `warnings: []`. But a non-canonical set **always** reports
`ASTM_NONSTANDARD_DELIMITERS`, and that code is itself tolerable, so `warnings: []` was
unreachable for any set capable of exhibiting this defect: the measure could not have come out
otherwise. The "0 silent, so not stop-the-line" reasoning therefore rested on a measure with no
discriminating power. **The tier that discriminates is strict-accepted-under-a-gate-legal-profile**,
and on that tier this was 9,287 of 50,400. Do not re-run "is it silent" on a non-canonical set
and read the answer as reassurance.
**▶ THE FIX IS ONE LEFT-TO-RIGHT PASS, AND THE PROPERTY IS EXACTNESS, NOT SPEED. Read
`CHANGELOG.md` `[Unreleased]` before touching `serialize.ts`.** Each character is read once and
written either as itself or as a whole `escape` + mnemonic + `escape` triple, and nothing the
encoder writes is examined again, which makes it the **exact** inverse of `decodeEscapes` rather
than approximately so. Measured both directions: bytes change for **exactly** the 10,450 sets that
were diverging (0 diverging with unchanged bytes, 0 changed without having diverged), so a
canonical stream and any set naming none of the four mnemonic letters is byte-identical. The
accept/refuse partition is unchanged across all 73,440 sets. **No clause claimed**; the grounding
is this package's own decoder. Pinned in `test/records/escape-mnemonic-roles.test.ts`, which
transcribes the four chained substitutions (nothing shipped still reproduces them) and **checks
that transcription against the shipped encoder on all 1,680 sets where the two must agree**, so it
cannot decay into a strawman; 8 of its assertions are red on `4bb62f1`. **Five pin the emitted bytes as LITERALS**, each derived in a comment beside it, because every other assertion in that file reads the stream back through this package's own parser: a round trip cannot catch an encoder and a decoder that agree with each other and are both wrong. Two of the five are red on base, and the three that are green there are the point (a canonical set, a vendor set naming no mnemonic, and a set naming `F` as its ESCAPE role, which the chained encoder happened to get right): naming a mnemonic is necessary for the defect, not sufficient. **The committed test pins
a 12-character subspace** (P(12,4) = 11,880) rather than the 18, because the full space costs
roughly a minute of suite time for no new region: the extra six characters are neutral punctuation
already represented. **The corpus is identical**, so the test and the sweep differ by alphabet
alone.
**What the slice deliberately did NOT do.** The shipped "what is not guaranteed" prose still names
only defect 11's atom, and that was left alone on purpose: the second residual it would have been
widened to name is now closed, and the sentence it already carries is true. Do not read its
narrowness as an oversight, and do not replace it with a positive guarantee that emit preserves
every field tree: that is a claim about the whole input space, and this repo has been refuted on
that shape repeatedly, including three times on the single paragraph defect 13 records.

<a id="defect-13"></a>

### Defect 13: `startFrameNumber` was documented `0`-`7` and unvalidated (CLOSED 2026-08-03)

**CLOSED 2026-08-03 by `ASTM-FRAME-RESIDUALS`. The loudness claim held, but the recorded byte was
wrong and there WAS a silent branch the 31-case sweep could not see.** Was:
`composeAstmFrames`'s `startFrameNumber` was documented `0`–`7` and **unvalidated**, so whatever
`FN_ZERO + value` truncated to went into the frame-number position. `PRE-EXISTING`,
byte-identical on `64c2fd5`.
**▶ TWO CORRECTIONS TO THE OLD ENTRY, BOTH MEASURED.** (1) It said `NaN` emits **a space**. It
emits a **`NUL`**, and the difference is the whole outcome: a space is an ordinary inter-frame
byte the decoder skips, while the `NUL` goes into **every** frame, so `decodeAstmFrames` reads no
frame number anywhere, warns `ASTM_FRAME_SEQUENCE_GAP` on every frame and emits **none** of the
records (four in, zero out; `parseFramedAstm` throws on empty input). `Infinity` and `-Infinity`
behave identically; `-1` really does emit `/`. (2) "No silent branch was found" was true of those
31 cases and false as a property: a value that **truncates back onto a digit** is accepted
silently and behaves as some other start. `1.5` and `257` each emit the byte-for-byte stream a
`startFrameNumber` of `1` emits. The sweep could not see it because it only varied start value x
message shape over integers.
**▶ THE FIX IS A DOMAIN CHECK DERIVED FROM WHAT A FRAME CAN CARRY, RUN BEFORE `composeAstmFrames`
READS A RECORD.
Read `CHANGELOG.md` `[Unreleased]` before touching `encode.ts`.** New
`ASTM_FRAME_INVALID_START_FRAME_NUMBER` (fourth member of `AstmFrameEncodeErrorCode`): the option
must be a whole number `0`–`7`, the modulo-8 sequence the decoder reads and rolls over.
**Clamping and modulo were both rejected on one argument:** either picks a frame number the
caller did not ask for, and the frame number is the decoder's only evidence that no frame was
dropped, so a stream numbered from a value nobody chose is one whose sequence check certifies the
wrong thing. The refusal precedes `composeAstmFrames`'s record loop so it never depends on caller
data **on that entry point only** (the refuter's finding: `serializeFramedAstm` serializes every
record first, so an unserializable record is refused ahead of it there, and the four surfaces
that said "before any record is read" without naming a function are now scoped). **Its message
names the value received**, which is deliberate and is the one message in this class that quotes
anything: a `startFrameNumber` is the caller's own option, never stream content.
**▶ THE `0`–`7` DOMAIN WAS KEPT BECAUSE THE NON-DEFAULT START HAS A REAL USE, MEASURED RATHER
THAN ASSUMED. Do NOT "simplify" this to `refuse anything but 1` on the reasoning that nothing
else decodes standalone.** It composes a **continuation**: `composeAstmFrames(head)` joined with
`composeAstmFrames(tail, { startFrameNumber: n })`, `n` the number after the last frame `head`
used, is **byte-identical** to one call over the whole list and decodes `warnings: []`, rollover
included. Pinned in `test/frames/start-frame-number.test.ts`.
**What the fix does NOT do, and it is documented on the option instead:** a continuation decoded
**on its own** opens on a sequence gap, so the decoder drops that first record and
`parseFramedAstm` behaves in a way NO SHIPPED SURFACE NOW STATES A RULE FOR, and getting to that
took three refuter passes on one paragraph.
**▶ 🩺 THE SAME PARAGRAPH WAS WRONG IN THREE SUCCESSIVE FORMULATIONS, EACH TIME BY GENERALIZING A
MEASUREMENT, AND THAT IS THE FINDING WORTH CARRYING.** The base entry's "the failure code varies
with the message shape, so a caller cannot key on one" was TRUE; this slice deleted it (pass 2
caught that); its replacement, "`parseFramedAstm` throws under `ASTM_RECORD_NO_HEADER` or
`EMPTY_INPUT`", was a **new unqualified universal**; and ITS replacement, "where a _later_ record
is an `H` it does not fail at all", was **falsified by this slice's own committed test** two
blocks below the sentence (pass 3). Measured on this tree: `["L","H|\^&","P"]` at start 4
**returns**, 3 in and 2 out, `message.warnings` `[]`; `["L","H|\^","P"]` **throws**
`ASTM_RECORD_UNDECLARED_DELIMITERS` with a later `H` present; `["H","P","H","L"]` **throws**
`ASTM_RECORD_NO_HEADER` with a later `H` present. The governing condition is "the first
**surviving** record is a usable `H`" (`parse.ts` tests `first.charAt(0)`), which is not the same
predicate, and `message.warnings` is empty only for THAT FIXTURE: survivors carrying a `Z` warn
`ASTM_RECORD_UNKNOWN_TYPE`, survivors carrying an `&X&` atom warn `ASTM_UNKNOWN_ESCAPE_SEQUENCE`.
**▶ THE DISPOSITION AT THE ADR 0016 CAP WAS A CUT, NOT A FOURTH REWRITE.** The shipped surfaces
now offer **no rule** for what follows: they say the outcome varies with the message shape, that
it may throw under more than one code or return a message one record short, and that the one
statement which does generalize is that **the record layer never reports the loss**
(`parseFramedAstm` hands the record parser only the frames the codec vouched for, so
`message.warnings` carries what the survivors warrant and nothing about the record that did not
survive). The operative instruction is **read `frameWarnings`**. Do not reintroduce a shape rule
here; three have now measured false. The documented-valid `0` has always behaved this way; it is a
cost of the option, not a defect in the caller's records. **Nothing returns the
number to continue from and the frame count is not it once a record splits**, so the supported
computation (`decode the part, read the last frame's number, + 1 mod 8`) is written on the option
and in the quickstart, with the note that its `?? 0` fallback cannot fire on a part this encoder
composed (a frame lacks a number only when the stream ends right after its `STX`; verified against
every `frameNumber`-omitting path in `decode.ts`).
**`PRE-EXISTING`, recorded not fixed (pass 2, minor):** `serializeFramedAstm`'s round-trip
sentence is now scoped to the default start but stays unqualified on the **record**-layer axis
(defects 11/12 residuals), where `composeAstmFrames`'s own JSDoc does carry the "what is still
not guaranteed" caveat. It belongs to the record-layer residual slice with defect 12.
Old bytes and new refusal both pinned, rebuilt with the test-only `frame()` builder so nothing is
transcribed twice, with a biconditional property (refused **iff** not a whole number in `0`–`7`);
14 of 32 new tests red against `64c2fd5`.
**Its sibling minor was NOT closed with it and is now defect 14 below**, measured, pinned and
disclosed by `ASTM-RECORD-EMIT-RESIDUALS` 2026-08-04 without a behaviour change.
Also closed here, from the same item: **three `{@link}` targets that did not name a symbol
declared in the published `.d.ts`** (`QuirkTolerance` → `AstmQuirkTolerance` in
`src/profiles/types.ts`; `FIRST_FRAME_NUMBER`, which this package does not export, on the
`startFrameNumber` doc that was rewritten anyway; and a bare `warnings` on `AstmMessage.profile`,
meaning the sibling member, which the refuter found and which resolves only for a tool that
resolves against the enclosing declaration). **The recorded claim is now "names a symbol declared
in that file", not "resolves"** -- resolution is resolver-dependent and the universal was
unqualified.

<a id="defect-14"></a>

### Defect 14: A header's delimiter-declaration surplus is silently dropped on emit (open, measured and pinned)

**The sibling minor of defect 13 is NOT fixed and is now MEASURED, PINNED AND DISCLOSED
(`ASTM-RECORD-EMIT-RESIDUALS`, 2026-08-04).** `serializeAstmRecords` silently drops a header
delimiter-declaration surplus that could not be read back as one. **The recorded "all 31 C0/DEL
characters" re-measured TRUE**, and re-measuring confirmed it rather than
correcting it, as it did for one half of defect 13: probing one character at a time in the surplus of an otherwise spec-clean
`H|\^&` header, **31 of the 33** C0/`DEL` characters reach `declarationResidual` and are dropped,
each with `warnings: []` and no error. The two that do not are `CR` and `LF`, which **never reach
the rule at all** because they end the record while it is being read, so no surplus ever holds
them. (Beware the instrument: a first pass read `DEL` as absent from the modeled surplus because
`JSON.stringify` does not escape it. It is present, and it is dropped.)
**The behaviour is unchanged and stays unchanged**, but **one recorded reason for it measured
false and must not be restated.** "Carrying them through breaks the record or the frame layer" is
true of `STX`/`ETX`/`ETB` (refused as `ASTM_FRAME_RESERVED_BYTE`) and of `CR`/`LF` (which cannot
reach the surplus anyway); the **other 28 of the 31 round-trip byte-exactly through
`composeAstmFrames` into `decodeAstmFrames` with `warnings: []`**, and all 31 round-trip at the
record layer. So the evidence would equally support carrying them through with `composeAstmFrames`
as the total gate, which is the disposition defect 6 chose for values. What keeps the drop is the
reason the code site gives and not the frame-layer one: rather than enumerate the bytes each layer
happens to reserve and re-derive that list every time a layer is added, no control character is
carried. Refusing was also rejected, because it would turn a spec-clean header into a refused
stream on a published package over bytes whose meaning is unresolved. **Newly written down: the drop is all-or-nothing**,
so a surplus of `#` + `US` + `$` loses the `#` and the `$` too, and that is the only
non-inventing answer available, because a subsequence of an opaque run is a different run rather
than a shorter version of the same one. Also newly written down: the field-delimiter arm of that
rule is unreachable from a header parsed under the set **being emitted**, because the reader ends
the declaration at the first field delimiter. **Do not read that as "you have to pass a delimiter
set to reach it".** It is a transcoding condition, like `ASTM_EMIT_TYPE_LETTER_COLLISION`, so it
fires with **no `d` argument at all**: a stream whose second header declares a different set has
that header's whole line read as its declaration, and emitting canonically drops the lot. Measured
on the default path, `PRE-EXISTING`: `H|\^&|||FIRST` / `P|1||LAB-0001` / `H*\^&|Q|||SECOND` /
`L|1|N` emits a second header of bare `H|\^&`, losing its `Q` and `SECOND`. The parse warns
`ASTM_RECORD_FIELDS_UNSEPARATED` (safety-critical, so strict refuses) and
`ASTM_RECORD_DELIMITERS_REDECLARED`, which is why it is not a stop-the-line.
**The published surfaces that stated the preservation rule without its exception are widened, not
rewritten**: `docs-content/quickstart.md` attached the control-character drop to the transcoding
case alone (it fires on the **default canonical path** too), and the `serializeAstmRecords` /
`serializeAstmRecord` doc comments plus `serialize.ts`'s own module doc block, all of which
compile into `dist/index.d.ts`, were unqualified. (A first draft said "three surfaces" and the
module doc made it four; the count is dropped rather than corrected, because it was load-bearing
for nothing.) Pinned in `test/records/declaration-surplus-residual.test.ts`, which **passes on
`4bb62f1` by design**: it measures behaviour this slice does not change, and its job is to stop
the sentences drifting back to the unqualified form.

<a id="defect-15"></a>

### Defect 15: a greedy leftmost atom can GAIN a boundary the sender escaped (CLOSED 2026-08-05)

**The mirror of defect 11, and it survived defect 11's fix on purpose.** `splitEscapeAware` matches
escape sequences greedily, left to right, so an earlier triple can consume the escape character that
would have opened a later one. Measured on the canonical set, head and base alike:
`R|1|^^^687|28.6&Z&|&U/L||||F` reads `value` = `28.6&Z&` and `units` = `&U/L`, status `final`. The
`&Z&` atom consumed the `&` that would have started `&|&`, so the field separator **did** split, one
boundary more than the bytes' author wrote. The two warnings raised,
`ASTM_UNKNOWN_ESCAPE_SEQUENCE` and `ASTM_UNPAIRED_ESCAPE_CHARACTER`, are **both on
`TOLERABLE_CODES`**, so `{ strict: true }` under a gate-legal profile accepts it.

**`ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` correctly stays silent here**, and that is not a gap in
defect 11's fix: nothing was swallowed. This is the opposite condition, a boundary gained rather than
lost, and what should report it, and whether the greedy match is the right one at all, is a different
question with a different blast radius. `PRE-EXISTING` (identical on `3107273`). **Not a
stop-the-line**, because it needs a non-conformant `&|&` escaping form to bite and two warnings do
fire, but both of those are tolerable, so the same argument that made defect 11 worth scheduling
applies here. Found by the `conformance-refuter` grading `ASTM-FRAME-RESIDUALS` 2026-08-05.

**CLOSED IN PART 2026-08-05 by `ASTM-FRAME-RESIDUALS`, and closed as a REPORT, on defect 11's shape.
Read defect 17 for what is left**: the class where the leftmost triple's body is a **recognized**
mnemonic is outside the new code, deliberately, and is still strict-accepted under a gate-legal
profile. The
split is unchanged, the leftmost alignment is still the one taken, and every decoded byte is
identical: `28.6&Z&` and `&U/L`, exactly as before. What is new is
`ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT`, raised **alongside** the tolerable codes rather than
instead of them, whenever the escape character closing an **unrecognized** sequence could instead
have opened one whose body is the delimiter that split. It is not on `TOLERABLE_CODES`, so
`{ strict: true }` refuses that record under any gate-legal profile.

**▶ THE OTHER ALIGNMENT WAS CONSIDERED AND REJECTED, AND THAT IS THE WHOLE DESIGN.** Reading
`28.6&Z&|&U/L` as `28.6&Z` plus the atom `&|&` plus `U/L` is not more defensible than reading it
leftmost: it is a different guess, with no more evidence behind it, and taking it would move values
on a package that is already published. The bytes carry two readings and the parser is not entitled
to pick between them silently, which is what it was doing. So it keeps the reading it had and says
the boundary is a choice.

**▶ TWO EXCLUSIONS, BOTH DELIBERATE, AND THE FIRST IS THE ONE THAT KEEPS IT OFF CONFORMANT
STREAMS.** Where the earlier sequence's body is a **recognized mnemonic** nothing is reported, and
the reason is not symmetry: under `28.6&F&|&U/L` the leftmost reading is an escaped field separator
followed by a real one, which is the escape mechanism working, while the competing alignment needs
both an unpaired escape character and an unrecognized body to exist at all. Measured: that stream
raises only the tolerable `ASTM_UNPAIRED_ESCAPE_CHARACTER` and reads `28.6|`. And where the
character two positions past the delimiter is not the escape character there is no competing
alignment at all, so an ordinary escaped value followed by an ordinary boundary stays silent. A
consequence worth stating: the new code is a strict subset of the streams that already raise
`ASTM_UNKNOWN_ESCAPE_SEQUENCE`, so it can never fire on a stream a conformant sender produced.

**▶ IT DOES NOT REACH THROUGH A RE-EMIT, THE SAME RESIDUE ITS SIBLING DISCLOSED.** Emit rewrites the
preserved characters into recognized mnemonics (`28.6&E&Z&E&|&E&U/L`), and generation 2 reads
`28.6&Z&` and `&U/L` with `warnings: []`. That is **correct** about generation 2's own bytes, which
carry the reading that was taken with no competitor left in them; the choice is inherited from
generation 1. So the catch point is the first read of the wire bytes, and there is no guard on the
round trip. Never write it as closed.

**▶ MEASURED, over the committed constants `ALIGNMENT_ALPHABET` and `neutralStream` in
`test/records/escape-alignment-ambiguity.test.ts`.** The tier is
**strict-accepted-under-a-gate-legal-profile**, because "0 silent" is structurally unreachable here:
an unrecognized escape body always raises a tolerable code. The instrument is a profile built **from**
`TOLERABLE_CODES` itself, so it is the widest tolerance the safety gate can permit. Twelve characters
(the four mnemonics, the three splitting roles, the escape role, four non-delimiters) swept in both
positions of the pair that decides this, on a comment record chosen so no result-semantics warning
masks the count: **144 tuples, 24 raise the new code** (the eight unrecognized bodies against the
three splitting roles), and strict acceptance goes **108 to 93**, the 15 that moved being exactly the
tuples the new code fired on, which is **not** the same as the 24 that fire: the other 9 were already
refused by `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`. A second figure for the `R` fixture's own
corpus stood here for one gate pass and is **deleted rather than restated**, because it named no
committed constant, was not re-derivable from the sweep it claimed to be, and the explanation
attached to it could not have produced it. There is one corpus for this defect and it is the one
named above. **Do not quote any of these figures without the alphabet and the carrier record, because
both move every one of them.**

<a id="defect-16"></a>

### Defect 16: `readDelimiters`'s field-collision branch is unreachable, and the fatal it produces names the wrong reason (CLOSED 2026-08-05)

`readDelimiters` ends with a check that the field separator is not also the repeat, component or
escape character. **That branch cannot be reached.** A field separator appearing in any of those
three positions sits at index 2, 3 or 4 of the record, so `indexOf(field, 2)` returns at most 4, the
delimiter definition is at most two characters, and the `definition.length < 3` check has already
returned `undefined`. The **outcome** is right in all three cases, and defect 4's closure documents
it correctly ("that declaration does not resolve at all"). What is wrong is the message a consumer
sees: `H||^&` raises the `ASTM_RECORD_UNDECLARED_DELIMITERS` fatal reading "Header record is too
short to declare the four delimiters", for a header that is not short. `PRE-EXISTING`.

**Do not "fix" it by deleting the branch.** It is the statement of an invariant that the length check
happens to enforce first, and the two are not the same rule: a change to how the definition field is
bounded could separate them again. The fix, when it is taken, is the fatal's message and probably a
second fatal reason code, which is a published-surface change and wants its own slice. Found by the
`conformance-refuter` grading `ASTM-FRAME-RESIDUALS` 2026-08-05.

**CLOSED 2026-08-05 by `ASTM-FRAME-RESIDUALS`, as a MESSAGE ONLY.** `readDelimiterDeclaration` is
`readDelimiters` with the reason kept (`not-a-header`, `record-too-short`, `definition-truncated`,
`field-separator-reused`), and the first header's fatal carries the message for the reason it
actually hit. `H||^&` now reads "declares fewer than three delimiter-definition characters before its
next field separator" instead of "is too short". `readDelimiters` itself is untouched in behaviour
and in signature.

**▶ THE SECOND FATAL CODE THIS ENTRY PREDICTED WAS CONSIDERED AND REJECTED.** Splitting
`ASTM_RECORD_UNDECLARED_DELIMITERS` in two would move the code a consumer switches on for a stream
whose disposition is already right, which is a breaking change bought for a sentence. One code and
four messages keeps the stable thing stable and fixes the thing that was wrong. If a future reason
ever wants a **different disposition** rather than a different sentence, that is when it earns a
code.

**▶ THE UNREACHABLE BRANCH STAYS, AND THE UNREACHABILITY IS NOW MEASURED RATHER THAN ARGUED.** Over
the committed constants `FIELD_SEPARATOR_ALPHABET` and `DEFINITION_POSITIONS` in
`test/common/delimiter-declaration-faults.test.ts` (twelve candidate field separators, each placed in
each of the three definition positions): **36 of 36 classify as `definition-truncated` and 0 as
`field-separator-reused`**, and none resolves. That is the invariant the truncation rule enforces on
the branch's behalf, pinned so a change to how the definition field is bounded shows up as a test
moving rather than as a branch quietly becoming live.

**▶ ONE MORE WRONG REASON WAS FOUND WHILE FIXING THIS ONE, AND FIXED WITH IT.** The reader asked
about the length before the type letter, so `readDelimiterDeclaration("P|1")` answered
`record-too-short`: a `P` record reported as a short header, which is the same wrong-reason class.
The type letter is asked first now. No caller's outcome changed (`readDelimiters` returns
`undefined` either way, and the first record's type is checked before this function is reached), so
this is the reason a direct caller is given, not a disposition.

<a id="defect-17"></a>

### Defect 17: the alignment report excludes a recognized mnemonic body, wider than its own argument (open, measured and pinned)

**Open, `PRE-EXISTING`, disclosed by the `conformance-refuter` grading defect 15's fix 2026-08-05,
and left open on purpose.** `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT` fires only where the leftmost
triple's body is **unrecognized**. The argument for that exclusion is which alignment this codec's
own vocabulary supports: a recognized body means the reading taken interprets a construct while the
competitor's body is a delimiter character it usually cannot interpret. **The exclusion is wider than
that argument, in two measured ways, and neither is closed.**

**▶ (a) A RECOGNIZED BODY DOES NOT MAKE THE READING TAKEN CONFORMANT.** Measured on the canonical
set: `R|1|^^^687|28.6&F&|&U/L||||F` reads `value` = `28.6|` (a result value holding a raw field
separator) and `units` = `&U/L`, status `final`, and the **only** warning is
`ASTM_UNPAIRED_ESCAPE_CHARACTER`, which is tolerable, so the widest gate-legal profile plus
`{ strict: true }` **accepts** it. The same bytes also read as one unsplit field. The leftmost
reading interprets one construct and carries one deviation; the competitor interprets none and
carries two. It is preferred, but it is not clean, and the difference is one field boundary. Same for
`&S&`, `&R&` and `&E&` in that position. Contrast `28.6&F&|&E&U/L`, which raises **nothing at all**:
there the leftmost reading is genuinely conformant, so silence there is not a residue.

**▶ (b) WHERE THE DECLARED SET NAMES A MNEMONIC LETTER AS A SPLITTING DELIMITER, NOTHING PREFERS
EITHER ALIGNMENT, AND IT IS STILL SILENT.** Measured under `H|F^&`, where `F` is the repeat
delimiter: `R|1|^^^687|28.6&S&F&U/L||||F` reads `value` = `28.6^` with **no units** and status
`unspecified`, because the gained repeat boundary put the rest of the field in a second repeat. Both
alignments interpret exactly one recognized construct (`&S&` one way, `&F&` the other) and carry one
bare escape character, so the vocabulary argument does not pick a winner here at all. Warnings are
`ASTM_NONSTANDARD_DELIMITERS` and `ASTM_UNPAIRED_ESCAPE_CHARACTER`, both tolerable, so this is
strict-accepted too. It is the harm signature of defect 11, reached by the opposite door.

**THE `because` IN THAT PARAGRAPH IS WRONG AND IS CORRECTED BELOW ("what each gained boundary
actually costs"), kept here verbatim rather than rewritten.** The missing units and the
`unspecified` status are decided by the record's own eight-field shape and read the same under
**both** alignments; what the gained repeat boundary costs is the **value**, which it truncates to
`28.6^`. The same correction strengthens (a): its gained **field** boundary shifts every later field
and **fabricates** the `final` it reports.

**▶ WHY IT WAS NOT FOLDED INTO DEFECT 15'S SLICE.** Covering either means a **different criterion**
(counting the constructs each alignment interprets, rather than asking whether one was recognized),
and swapping criteria changes which streams a package already on the registry refuses under
`{ strict: true }`. That is a narrowing on a published surface and it wants its own measurement of
the population it moves, not a fourth pass bolted onto a slice that had already converged. Both cases
are **pinned** in `test/records/escape-alignment-ambiguity.test.ts` so the behaviour cannot drift
without a test moving, and both are named in the shipped docs rather than left for a consumer to
discover. **Do not close this by widening the mnemonic test in place**: read the residues first, and
measure the population before and after, on the same
strict-accepted-under-a-gate-legal-profile tier.

### Defect 17, continued: the criterion that was measured, and REJECTED (2026-08-05)

**That measurement was taken by `ASTM-FRAME-RESIDUALS` and its answer was no.** The criterion the
entry above names, and the one anybody reading it will reach for, is a **count over the contested
pair**: each alignment takes exactly one triple at the contested position, so score the leftmost side
one where its body is a recognized mnemonic and the competing side one where the **delimiter** is,
and report unless the leftmost side reads strictly more. It closes (b), and **it is not shippable**,
and both halves of that are now measured and committed as
`test/records/alignment-criterion-population.test.ts`. **Nothing in this package's behaviour was
changed by that slice.** The criterion lives in the test as a predicate; the package is measured,
never modified, because what is being measured is which streams a **published** package refuses.

**▶ IT REFUSES STREAMS WHOSE ESCAPING IS ENTIRELY WELL-FORMED, WHICH IS WHAT KILLED IT.** The
counterexample, pinned in the test: under `HF\^&`, where `F` is the **field** separator, the value
`28.6&F&F&F&U/L` is the sender escaping that separator, then the separator, then escaping it again.
The leftmost alignment interprets **two** recognized sequences and leaves no escape character bare;
the competing alignment interprets one, leaves two bare, and puts a raw separator inside the value.
Nothing about that is a tie. The parse raises no escape deviation at all, only the tolerable
`ASTM_NONSTANDARD_DELIMITERS`. The count still reads one against one and would refuse it, under a
code no profile may tolerate. **The same sentence that justified silence became the justification for
firing, with no argument in between**, which is this family's recurring failure: the claim, not the
guard, is the defect.

**▶ WHY, AND IT GENERALIZES: THE COUNT IS LOCAL AND THE DISAGREEMENT IS NOT.** The two alignments
consume different numbers of bytes at the contested position (the leftmost resumes at `i+4`, the
competitor at `i+5`), so they disagree about **every byte after the boundary**, not only about the
pair. That tail is exactly what separates (b) from the counterexample: in (b) the escape character
past the boundary heads nothing and is a deviation, in the counterexample it heads a recognized
sequence. **Any criterion that closes (b) without over-refusing has to weigh the tail**, which is a
materially larger reader than one comparison, and it will move the population again and want its own
measurement. That is the shape of the next attempt, and it is a slice of its own.

**▶ THE MEASUREMENT, AND THE AXIS THE FIRST CORPUS DID NOT HAVE.** Committed constants
`DECLARATION_ALPHABET` (`F` `S` `R` `E` `~` `:` `#` `*`), `SPLITTING_ROLES` (field, repeat,
component), `BODY_ALPHABET` (defect 15's twelve) and **`TAIL_SUFFIXES`** (the escape character past
the boundary heading nothing, heading a recognized sequence, heading an unrecognized one), on the
same comment-record carrier: **864 tuples**. Tier: strict-accepted-under-a-gate-legal-profile, the
instrument built from `TOLERABLE_CODES` itself, because "0 silent" is structurally unreachable here.
Every figure derives from those constants inside the assertion that uses it. **576 are reported
today, 720 would be under the candidate. 288 are strict-accepted, 144 would be. 144 tuples move,
0 move back. 48 of the 144 are escape-clean**, which is **exactly half** of the 96 escape-clean
tuples in the corpus, and **0 escape-clean tuples are reported today**. The candidate is a strict
superset of what fires today, so its failure is over-refusal and never a lost report.

**▶ THE FIRST CORPUS FOR THIS QUESTION FIXED THE TAIL TO A BARE ESCAPE CHARACTER AND THEREFORE
CONTAINED NO ESCAPE-CLEAN STREAM AT ALL.** It measured 288 tuples, 48 moved, and reported no
over-refusal, because it could not hold one. **A measurement whose corpus cannot contain the
counterexample certifies nothing**, and this one was caught by the `conformance-refuter` grading the
slice rather than by the sweep. The committed file now asserts up front that its corpus **does**
contain escape-clean streams and that the two criteria **do** disagree somewhere, so a corpus that
loses either property fails loudly instead of reporting a comforting zero. It also transcribes the
candidate and checks it against the shipped reader on every tuple where the two must agree, so no
delta can be an artifact of the transcription.

**▶ WHAT SURVIVED OF THE CANDIDATE'S CASE, and it is worth keeping for the next attempt.** The
population it moves is unreachable without a **mnemonic letter declared as a splitting delimiter**,
so every moved tuple also raises `ASTM_NONSTANDARD_DELIMITERS` and **no canonical-set stream is in
question either way**. A canonical control in the same file sweeps the three canonical splitting
roles against the same bodies and tails and finds the two criteria identical tuple for tuple. Defect
15's own figures (144 tuples, 24 firing, 108 strict-accepted against 93) are untouched for the same
reason: on that corpus the count reduces to the recognition test exactly.

**▶ "ESCAPE-CLEAN" IS DEFINED WITHOUT THE ALIGNMENT CODE, DELIBERATELY, THOUGH THAT DOES NOT MAKE
THE ZERO FREE.** It is the absence of `ASTM_UNKNOWN_ESCAPE_SEQUENCE`,
`ASTM_UNPAIRED_ESCAPE_CHARACTER` and `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`, and **not** of
`ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT`, so it does not consult the criterion it is used to judge.
The population is the same 96 tuples either way, measured, so the independence costs nothing.
**But "no escape-clean tuple is reported today" is still entailed rather than observed, one layer
down, and it must not be read as evidence about the shipped criterion**: the alignment sink is gated
on a non-mnemonic body, and the same body always drives the unknown-escape sink, so a stream raising
the alignment code can never be escape-clean. What the zero does discriminate is the **candidate**
from the shipped criterion, which is what this file needs it for. **Escape-clean also says nothing
about the decoded value**, which legitimately carries the literal delimiter a sequence stood for:
`&F&` decoding to the field separator is the mechanism working, not a residue of it.

<a id="defect-17-harm"></a>

### Defect 17: what each gained boundary actually costs, corrected 2026-08-05

**Both harm statements this entry carried were wrong about the mechanism, and the second was wrong
about the outcome.** They were corrected by the `conformance-refuter` grading the measurement slice,
against runs of both alignments of both fixtures. **Do not restore either earlier wording.** The
distinction that governs is **which delimiter role the gained boundary belongs to**: a gained
**field** boundary shifts every later field and can therefore move data between modeled slots, while
a gained **repeat** or **component** boundary divides one field and can do nothing outside it.

**▶ (a) IS WORSE THAN IT WAS RECORDED, AND THE WORD IS FABRICATED.** Under the canonical set,
`R|1|^^^687|28.6&F&|&U/L||||F` gains a **field** boundary, so the record reads **9** fields where
the competing alignment reads 8, and every field after the gain is shifted one place: the sender's
own trailing `F` lands in the **result status** slot. The reading taken hands back units `&U/L` and
status **`final`**; the competing alignment hands back no units and status `unspecified`. The reading
taken raises only the tolerable `ASTM_UNPAIRED_ESCAPE_CHARACTER`, so the widest gate-legal profile
accepts it. **Nothing is claimed here about what the competing alignment would raise**: it is a
reading nobody's bytes produce, so its warning set is not a measurement of anything, and the entry
above already records that it carries two deviations to the reading taken's one.
**A fabricated `final` on a result is the harm this repo exists to prevent.** The
entry above lists that `final` among the values read, which is why nobody noticed it is a
**consequence of the ambiguity** rather than something the sender wrote in that slot: the competing
alignment of the same bytes puts no status there at all. Running only the reading taken cannot show
that, and nothing had run the other one.

**▶ (b) DOES NOT COST THE UNITS OR THE STATUS, AND SAYING SO WAS AN ATTRIBUTION ERROR.** Under
`H|F^&` the contested delimiter is the **repeat** role, so the gained boundary cannot shift a field.
Measured, on `R|1|^^^687|28.6&S&F&U/L||||F`: **both** alignments read **8** fields, and under both
the units slot is empty and the status is `unspecified`. **The reason that generalizes is the repeat
role**, not the field count: the units slot is present and empty in this record and the status slot
is absent, and neither fact is anything the gained boundary could have changed, because a repeat
boundary divides one field and reaches nothing outside it. **What the gained boundary does cost is the VALUE**: the reading taken splits the value
field into the two repeats `28.6^` and `&U/L`, every value extractor reads the first, and `&U/L`
leaves the result entirely, while the competing alignment reads one repeat carrying all of it. That
is a real silent loss and it is the thing a future criterion has to be validated against. Both
statements are now pinned in `test/records/alignment-criterion-population.test.ts`.

<a id="tech-stack"></a>

### The shared `@cosyte/*` toolchain, per item

Relocated verbatim from `CLAUDE.md` 2026-08-05 to make room for a trap. This repo inherits the
canonical toolchain by depending on the published `@cosyte/*` config packages, not by copying files.
The source of truth is the meta-repo's `documentation/conventions.md`; this is a summary.

- **Language:** TypeScript (strict, full rigor set incl. `noUncheckedIndexedAccess`) via
  `@cosyte/tsconfig`. **Target ES2023**, `NodeNext`. TypeScript 5.9.x, exact-pinned.
- **Build:** dual ESM + CJS + `.d.ts` via `tsup` (`@cosyte/tsup-config`); `attw` is a publish gate
  (per-condition types: `.d.ts` for `import`, `.d.cts` for `require`). The `attw` script is
  **`scripts/attw.mjs`, not the bare CLI**, because the CLI reports a missing `dist/` as "does not
  contain types" and **exits 0**.
- **Node:** **>= 22** (CI matrix 22 + 24).
- **Package manager:** `pnpm@10`.
- **Lint/format:** **ESLint 10** + unified `typescript-eslint` (type-checked) via
  `@cosyte/eslint-config`; Prettier via `@cosyte/prettier-config`. Lint at `--max-warnings=0`.
- **Testing:** **Vitest 4** + v8 coverage (`@cosyte/vitest-config`), per-directory >= 90 gates; the
  property-based conformance invariants come from `@cosyte/test-utils` (round-trip, lenient-mode,
  immutability, warning-code stability), the format-specific arbitraries stay in this repo.
- **CI/CD:** thin callers of the reusable `cosyte/.github` workflows.
- **Runtime deps:** **Zero.** Node stdlib only.
- **License:** MIT.

<a id="claude-md-size"></a>

### How `CLAUDE.md` stays small, relocated here 2026-08-05 to make room for a trap

Kept verbatim from that file's header, which was compressed rather than reasoned about again.
**Nothing has ever been deleted from this notes file: the 2026-08-04 split and every relocation
since moved narrative here and left the traps there.** The per-repo `REPO_CLAUDE` ratchet is a
ratchet rather than a budget because **the real cost is tokens per worker, not bytes on disk**, so
headroom in an entry is slack to give back and never room to spend. The remedy for a breach is
always to move more narrative into this file, **never** to drop a trap to get green.

### Defect 17(a): CLOSED 2026-08-05, as a REPORT, by weighing the TAIL rather than the pair

**What shipped, and it is a second code rather than a criterion swap.**
`ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS`, not tolerable, fires where two escape alignments disagree
about a **field** boundary, the reading taken keeps it, and the escape character that reading resumes
on **heads no escape sequence at all**, which is exactly the character the competing alignment needs
to close its own triple. `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT` is **untouched**: its
recognized-body exclusion is exactly as it was, and the two fire alongside each other where both
apply. **They ask different questions, which is the whole reason this is a second code**: that one
asks whether this codec's vocabulary prefers the reading taken _at_ the contested position, this one
asks what the reading taken makes of the bytes _after_ the boundary. Widening the first to answer the
second is the move that was rejected.

**▶ WHY THE TAIL AND NOT THE PAIR.** The alignments resume one character apart (leftmost at `i+4`,
the competitor at `i+5`), so they disagree about the whole tail, and the pair is a tie in both the
harm case and the counterexample. One construct past the boundary separates them: in defect 17(a) the
escape character there heads nothing and is a deviation this package already reports; in the
counterexample it heads a recognized sequence. **The tail is weighed ONE CONSTRUCT DEEP, not to end
of record, and that bound is the residue below rather than a claim that it is enough.**

**▶ IT IS A REPORT, NOT A REPAIR, AND THE STATUS STILL READS `final`.** The split is unchanged and
every decoded byte is identical. **Withholding the shifted slots was weighed and DEFERRED**, not
overlooked: declining to model a slot changes an extracted value for every consumer of a package
already on the registry, the shift reaches every field after the boundary and not only the status (so
scoping it to the status alone would be arbitrary and scoping it to all of them cascades into
`ASTM_RECORD_UNITS_ABSENT`), and it wants its own measurement of the population it moves. What the
report does close is the tier this repo measures on: a gate-legal profile no longer accepts it.

**▶ THE BOUND ON THE ROLE IS A CHOICE, NOT A CONSEQUENCE, AND THE FIRST DRAFT WROTE IT AS A
CONSEQUENCE AND WAS REFUTED FOR IT.** Wired to the **field** split only. A gained repeat or component
boundary divides one field and reaches nothing outside it, so it moves no **field-indexed** slot: the
units and the status stay put. **It does not follow that it moves no modeled slot at all.** Components
are modeled _inside_ a field, so a gained **component** boundary shifts them exactly as a gained field
boundary shifts fields. That is **defect 17(c)**, `PRE-EXISTING`, measured byte-identical on this
slice's base, reported by **nothing** (only the tolerable `ASTM_UNPAIRED_ESCAPE_CHARACTER` fires, so a
gate-legal profile accepts it), and pinned in `test/records/alignment-shifted-fields.test.ts`:

- `R|1|&F&^&GLU^L^687|28.6|U/L||||F`: the Universal Test ID reads coding scheme `L` and local code
  `687` under the alignment taken, and `687` as the **coding scheme** under the competing one. A
  vendor's local code and a code-system selector are not the same thing.
- `P|1||MRN-0001||DOE&F&^&JANE^A||19700101|F`: the patient's given name reads `&JANE` under one
  alignment and `A` under the other, with no middle name at all under the second.

**Closing 17(c) means wiring this sink to another split, which is a DIFFERENT CRITERION and wants its
own population measurement**, exactly as this one did. Do not fold it in. On the repeat role what is
lost is the **value**, which is defect 17(b) and is **still open** too.

**▶ THE SENTENCE THAT WAS REFUTED, KEPT VERBATIM SO IT IS NOT REWRITTEN BACK IN.** "A gained repeat or
component boundary divides one field and reaches nothing outside it, **so it cannot move a modeled
slot**." The first clause is true; the inference is false; and it had reached `dist/index.d.ts`, which
is the exact failure defect 6 records ("a false sentence in a comment that compiles into
`dist/index.d.ts` is worse than the silence it replaced"). **Third time in this family that the claim,
not the guard, was the defect.**

**▶ THE RESIDUE, MEASURED AND NAMED.** Where the escape character past the boundary heads a sequence
whose body is **unrecognized**, the field shift is just as real and this is **silent**. The reason it
is excluded rather than covered: the reading taken still consumes that character as a sequence head
and carries one unreadable body, while the competing alignment would leave **two** escape characters
bare, so the bytes prefer the reading taken more strongly there, not less. Firing would report a
boundary the bytes prefer. Pinned in `test/records/alignment-shifted-fields.test.ts`
(`28.6&F&|&Z&U/L`: 9 fields against 8, `isActiveFinal` true, all codes tolerable, still accepted).

**▶ THE MEASUREMENT, on the same 864-tuple corpus and constants the rejected criterion was measured
on** (`DECLARATION_ALPHABET`, `SPLITTING_ROLES`, `BODY_ALPHABET`, `TAIL_SUFFIXES`, re-committed in
`test/records/alignment-shifted-fields.test.ts`), tier
strict-accepted-under-a-gate-legal-profile, every figure derived from a constant inside its
assertion. **Fires on 96. Moves 32 accepted -> refused. 0 move back. Fires on 0 of the 96
escape-clean tuples, and cannot**, because firing requires an escape character heading no sequence,
which is itself `ASTM_UNPAIRED_ESCAPE_CHARACTER`. **The rejected criterion refused 48 of those 96.**
That contrast is the whole case for this criterion over that one. The 32 that move are exactly the
population the alignment code's recognized-body exclusion left silent, and every one of them raised
only tolerable codes before.

**▶ THE BASE UNDER THE REJECTED CRITERION'S FIGURES MOVED, AND IT WAS RE-DERIVED RATHER THAN
RE-QUOTED.** `test/records/alignment-criterion-population.test.ts` measured 288 strict-accepted and
144 moving; with this code shipped those became **256** and **128**, and with defect 17(b)'s code
shipped after it they are **224** and **112**, expressed as formulas over the same constants rather
than re-typed (`tailRoles` is 2 now, not 1). Its headline finding is **unchanged** (48 escape-clean tuples
over-refused), because this code fires on no clean tail. And
`test/records/escape-alignment-ambiguity.test.ts` now **holds this code out** of its tier explicitly,
so defect 15's 144/24/108/93/15 are still the numbers that slice measured rather than numbers that
quietly went stale. **Never quote either set against a different sha.**

**▶ WHAT DID NOT CHANGE, so it is not read in.** No tolerable code was struck off. No stream's
**values** moved. It does **not** reach through a re-emit: emit rewrites the preserved characters
into recognized mnemonics and generation 2 is silent and correct about its own bytes. **Catch it on
the FIRST read; a clean re-read is not evidence.**

### Defect 17(b): CLOSED 2026-08-05, as a REPORT, by the SAME tail test on the repeat split

**What shipped.** `ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD`, not tolerable, fires on **exactly the
predicate 17(a) uses**, wired to the **repeat** split instead of the field split. One predicate, two
sinks, and that is structural rather than a comment: `splitEscapeAware` calls both from the same
`if`, because the split does not know which delimiter role it is being taken on and the role is what
decides the cost. The caller wires the sink that names its role.

**▶ WHY A SECOND CODE AND NOT A WIRING OF THE FIRST.** `ShiftedFieldsSink`'s whole claim is that a
modeled slot changed hands because every later field moved. On the repeat role **nothing moves**: the
units slot and the result-status slot are read out of the same field numbers under either alignment.
Reusing the code would have made its published sentence false, and a false sentence in
`dist/index.d.ts` is the failure this family has already committed once.

**▶ THE HARM, AND IT IS WIDER THAN THE DEFECT'S NAME.** A field's modeled reading is
`repeats[0]` (`toField` in `src/records/tokenize.ts`), so a gained **first** repeat boundary takes
**everything after it out of every modeled slot** while leaving it on the wire and in `repeats`.
**Both costs are reachable on the CANONICAL set**, which the rejected pair-count criterion's
population was not:

- **The value truncates.** `R|1|^^^687|28.6&S&\&U/L|U/L||||F` reads value `28.6^`; `&U/L` leaves the
  result. This is the case the defect was named for.
- **A modeled component list is DELETED, not shifted.** `R|1|&F&\&687|28.6|U/L||||F` reads a
  Universal Test ID whose `components` is `["|"]`: one component holding a **decoded field
  separator**, tagged `inline-loinc-candidate`, with the local code `687` in no modeled slot at all.
  `P|1||MRN-0001||DOE&S&\&JANE^A||19700101|F` reads a last name and **no given or middle name**.
  This half is what 17(a)'s sink could not reach, because components are modeled _inside_ a field.

Both raised only tolerable codes before (`ASTM_UNPAIRED_ESCAPE_CHARACTER`, plus
`ASTM_NONSTANDARD_DELIMITERS` where the set is not canonical), so the widest gate-legal profile plus
`{ strict: true }` accepted a truncated value and a fabricated test identity.

**▶ THE CLAIM IS BOUNDED TO THE FIRST BOUNDARY, AND THE FIRST DRAFT WROTE IT UNBOUNDED AND WAS
REFUTED FOR IT.** The sink is called for a contested repeat boundary at **any** repeat index, and
only the first one reaches a modeled slot. At a later one the first repeat is identical under both
alignments, so the value and the components read the same either way and only the repeat structure
after the first differs: `R|1|^^^687|5.0\28.6&S&\&U/L|U/L||||F` reads value `5.0` under both, and
**this fires and refuses it anyway.** That is deliberate (the boundary is still one the bytes do not
force, and a consumer reading `repeats` is still reading an alignment guess) and it is
**over-reporting relative to the modeled slots, never under-reporting**. **The remedy taken was to
CORRECT THE CLAIM and MEASURE THE AXIS, not to grow the guard**: gating the sink on repeat index 0
is a behaviour change on a published package and would want its own measurement. The axis is now a
second sweep beside the main corpus (same alphabets, boundary moved off the front of the field):
**96 fire, 32 move, 0 back, 0 escape-clean, and on all 96 the first repeat is unchanged between the
alignments.** **The main 864-tuple corpus fixes that axis** (its carrier contests the first
boundary), which is the same failure its own `TAIL_SUFFIXES` doc warns about, applied to a different
axis. It was left fixed on purpose so its figures stay comparable with the two measurements before
it, and the axis is measured beside it rather than folded into it.

**▶ IT IS A REPORT, NOT A REPAIR.** The split is unchanged, every decoded byte is identical, and
`repeats` still carries the bytes past the boundary. Picking the other alignment is a different guess
with no more evidence, on a published package. **Withholding the truncated field was NOT weighed
here and is not implied by this slice**: it is the same class as 17(a)'s deferred withholding and
wants the same measured slice of its own.

**▶ THE MEASUREMENT, on the same 864-tuple corpus and the same constants as both measurements before
it** (`DECLARATION_ALPHABET`, `SPLITTING_ROLES`, `BODY_ALPHABET`, `TAIL_SUFFIXES`, re-committed in
`test/records/alignment-truncated-field.test.ts`), tier
strict-accepted-under-a-gate-legal-profile, every figure derived from a constant inside its
assertion. **Fires on 96. Moves 32 accepted -> refused. 0 move back. Fires on 0 of the 96
escape-clean tuples, and cannot**, because firing requires an escape character heading no sequence,
which is itself `ASTM_UNPAIRED_ESCAPE_CHARACTER`. **The rejected pair count refused 48 of those 96.**
Identical shape to 17(a)'s figures, on a disjoint column: the two codes never fire on the same tuple.
**And unlike the rejected criterion's population, this one is NOT confined to a set naming a mnemonic
letter as a delimiter**: the canonical repeat separator reaches it, 12 of 108 canonical tuples swept.

**▶ THE RESIDUE, MEASURED AND NAMED, and it is 17(a)'s residue exactly.** Where the escape character
past the boundary heads a sequence whose body is **unrecognized**, the truncation is just as real and
this is **silent** (`28.6&S&\&Z&U/L` reads `28.6^` with only tolerable codes, still accepted). The
reading taken consumes that character as a sequence head while the competing alignment would leave
**two** bare, so the bytes prefer the reading taken more strongly there, not less. Firing would
report a boundary the bytes prefer.

**▶ WHAT WAS STILL OPEN AND WAS NOT TAKEN HERE.** **17(c)**, the gained **component** boundary, was
untouched by this slice and stayed `PRE-EXISTING`. It is a different cost, and the difference is
worth keeping straight: a gained repeat boundary **drops** components out of the record, a gained
component boundary **moves** them one slot along (`687` read as a coding scheme, `A` read as a middle
name). Closing it meant wiring a sink to a third split, which is another criterion and took its own
population measurement: **it has since been closed, and its section follows this one.** **Defect 9**
was not touched either and is still open.

**▶ THREE PRE-EXISTING MEASUREMENT FILES WERE RE-DERIVED, NOT RE-CUT, AND THE THIRD WAS ONLY
FOUND BY THE GATE.** `test/records/alignment-shifted-fields.test.ts` was missed on the first pass:
its `acceptedBefore` held out only the shift code, so for the 32 repeat-column tuples it silently
stopped meaning what it says, and a comment in it read "It is a different defect and stays open" of
the defect this slice closes. It now holds the later code out of **both** sides through a named
constant, and asserts the closure rather than describing it as open. The other two:
`test/records/escape-alignment-ambiguity.test.ts` now holds **both** later tail codes out of its tier
through one named constant, so defect 15's 144/24/108/93/15 are still that slice's numbers, and it
gained a parallel delta for this code (12 fires on the repeat column, 4 moving, disjoint from the
shift report's field column). `test/records/alignment-criterion-population.test.ts` had its `shift*`
constants generalized to `tailRoles = 2`, and **its "leaves the open case open" test is now
"names the case it left open, WHICH A TAIL-WEIGHING CRITERION HAS SINCE CLOSED"**, asserting the same
bytes read the same way and a gate-legal profile no longer accepting them, with the pair count's
counterexample still accepted beside it. **The rejected criterion is still rejected and still ships
nowhere.**

**▶ A FOURTH THING THE GATE CAUGHT, and it is a house-convention break worth naming.** Every new
wire example in `README.md`, `docs-content/` and `CHANGELOG.md` first landed with a **doubled**
backslash inside an inline code span, where Markdown does no escape processing, so the bytes a
reader would copy did **not** raise the code they were offered as the reproduction of. The base tree
writes `H|\^&` with one backslash inline and doubles it only inside fenced TypeScript. It came from
writing those files through a script rather than by hand. **`docs-content/` ships in an immutable
tarball**, so this is the class of error that is corrected only by superseding a release.

**▶ WHAT DID NOT CHANGE, so it is not read in.** No tolerable code was struck off. No stream's
**values** moved. `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT`'s recognized-body exclusion is exactly as
it was. It does **not** reach through a re-emit: emit rewrites the preserved characters into
recognized mnemonics and generation 2 is silent and correct about its own bytes. **Catch it on the
FIRST read; a clean re-read is not evidence.**

<a id="defect-17c"></a>

### Defect 17(c): CLOSED 2026-08-05, as a REPORT, by the SAME tail test on the component split

**What shipped, and it is a third code rather than a widening of either of the other two.**
`ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS`, not tolerable, fires on exactly the predicate 17(a) and
17(b) fire on (a contested alignment whose reading resumes on an escape character heading no
sequence) wired to the **component** split. That completes the family: field, repeat, component are
the three roles a split is taken on, and **there is no fourth, because nothing splits on the escape
role.** One predicate, three sinks, called from the same `if` in `splitEscapeAware`, because the
split cannot know which role it is being taken on and the caller can.

**▶ THIS IS THE DEFECT THE FALSE SENTENCE CREATED, SO CLOSING IT CLOSES THAT LOOP.** 17(a)'s first
draft justified its role bound as a consequence: "a gained repeat or component boundary divides one
field and reaches nothing outside it, **so it cannot move a modeled slot**." The first clause is
true; the inference is false, because **components are modeled INSIDE a field**; and it had reached
`dist/index.d.ts`. It was filed as 17(c) with a committed pin rather than reworded away, and this
slice is the pin being discharged. **The trap stays in `CLAUDE.md` verbatim: never write that
sentence again.**

**▶ WHAT A GAINED COMPONENT BOUNDARY COSTS, AND IT IS A THIRD THING.** Nothing shifts between fields
and nothing leaves the record. Every component after the gained boundary sits one place further right
than the competing alignment puts it, and the slots that indexes into are named. Both reachable on
the **canonical** set:

- `R|1|&F&^&GLU^L^687|28.6|U/L||||F` reads a Universal Test ID of four components, so `L` is the
  coding scheme and `687` the vendor's local code. The competing alignment reads three, and `687` is
  the **coding scheme**. A code-system selector and a vendor's local code are not the same thing.
- `P|1||MRN-0001||DOE&F&^&JANE^A||19700101|F` reads a given name of `&JANE` and a middle name of `A`.
  The competing alignment makes `A` the **given** name, with no middle name at all.

Before this code the only warning on either stream was the **tolerable**
`ASTM_UNPAIRED_ESCAPE_CHARACTER`, so the widest gate-legal profile plus `{ strict: true }` accepted
both. `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT` is silent on both, by its recognized-body exclusion,
which is untouched: that is the silence this closes.

**▶ IT IS A REPORT, NOT A REPAIR.** The split is unchanged, every decoded byte is identical, and the
components read are the components that were always read. **Withholding the moved slots was weighed
and DEFERRED**, for 17(a)'s reason: declining to model a slot changes an extracted value for every
consumer of a package already on the registry.

**▶ 🔴 THE ASYMMETRY WITH 17(b) IS THE PART THAT IS NOT GUESSABLE, AND THE FIRST DRAFT GOT IT WRONG
IN THE SAME INFERENCE SHAPE THIS DEFECT EXISTS TO RETIRE.** On the repeat role only the **first**
gained boundary reaches a modeled slot, because a field is modeled out of `repeats[0]`. Here the
shift propagates to the end of the component list, so a gained boundary moves a modeled slot
**wherever it sits AT OR BEFORE THE LAST MODELED COMPONENT INDEX**. **Pass 1 wrote that as "EVERY
gained boundary in a repeat moves those slots", which is FALSE**, across every surface the slice
wrote, including `dist/index.d.ts`, `README.md` and the immutable `docs-content/` tarball: first
clause true (the
reading taken does read exactly one component more, wherever the boundary sits), inference false (it
does not follow that a NAMED slot moved). **A model reads a FIXED number of components: a patient
name three (last, first, middle), a Universal Test ID four.** Measured counterexample, canonical set,
FIRST repeat, and it is one of the 32 that move accepted -> refused:
`P|1||MRN-0001||DOE^JANE^A^SFX&F&^&X||19700101|F` fires, and the name reads `DOE` / `JANE` / `A`
under **both** alignments. UTID twin: `R|1|A^B^C^D^GLU&F&^&L|28.6|U/L||||F` fires, and the LOINC
candidate, test name, coding scheme and local code are `A` / `B` / `C` / `D` under both.

**So TWO bounds run the other way and the report fires inside both**, over-reporting and never under,
the direction this package errs in: past the last modeled component index nothing NAMED moves, and
inside a **later repeat** nothing modeled moves at all (again because `components` is `repeats[0]`).
Narrowing to either would change which streams a published package refuses and wants its own
measurement, so both bounds are written down instead. **The lesson is the one 17(c) was opened on,
arriving from the other side: "the components all shift" is a claim about the LIST, and a claim about
a MODELED SLOT needs the model's own arity. Correct the claim, do not grow the guard.**

**▶ THE MEASUREMENT, on the same 864-tuple corpus and the same committed constants as the three
before it** (`DECLARATION_ALPHABET`, `SPLITTING_ROLES`, `BODY_ALPHABET`, `TAIL_SUFFIXES`,
re-committed in `test/records/alignment-shifted-components.test.ts`), tier
strict-accepted-under-a-gate-legal-profile, every figure derived from a constant inside its
assertion. **Fires on 96. Moves 32 accepted -> refused. 0 move back. Fires on 0 of the 96
escape-clean tuples, and cannot**, because firing requires an escape character heading no sequence,
which is itself `ASTM_UNPAIRED_ESCAPE_CHARACTER`. **The rejected pair-count criterion refused 48 of
those 96.** The column is **disjoint from both** earlier tail reports, asserted on the shared corpus
rather than reasoned from the wiring. Identical shape to 17(a)'s and 17(b)'s figures, on the third
disjoint column.

**▶ 🩺 THE INDEX AXES WERE SWEPT BESIDE THE CORPUS, WHICH IS THE REUSABLE PART.** The 864-tuple
corpus puts the contested construct at the head of the field every time, so it fixes both index axes
by design and a criterion measured only there inherits the blind spot. Two sweeps beside it: across
every component position of the first repeat the reading taken reads exactly **one component more**
than the competing alignment, so the harm is not bounded to the first boundary; and the identical
alphabet re-run with a clean first repeat in front of the contested construct gives the **same column
and the same delta (96 fire, 32 move, 0 back, 0 escape-clean)** while on **all 96** the modeled
component list is identical under both alignments. That is the over-reporting bound stated as a
measurement rather than as prose.

**▶ THE RESIDUE, MEASURED AND NAMED, and it is 17(a)'s and 17(b)'s residue exactly.** Where the escape
character past the boundary heads a sequence whose body is **unrecognized**, the slots move just the
same and this is **silent** (`&F&^&Z&GLU^L^687` reads four components against the competing
alignment's three, raises only the tolerable `ASTM_UNKNOWN_ESCAPE_SEQUENCE`, and is still accepted).
The reading taken consumes that character as a sequence head and carries one unreadable body, while
the competing alignment would leave **two** bare, so the bytes prefer the reading taken more strongly
there, not less. Firing would report a boundary the bytes prefer. And where the tail heads a
**recognized** sequence, `&F&^&F&GLU` is a field separator escaped, a component separator written and
a field separator escaped again: **zero warnings of any kind**, entirely well formed, and refusing it
is the over-refusal that sank the pair-count criterion.

**▶ FOUR PRE-EXISTING MEASUREMENT FILES WERE RE-DERIVED, NOT RE-CUT.**
`test/records/alignment-criterion-population.test.ts` had `tailRoles` generalized from a literal `2`
to `SPLITTING_ROLES.length`, which is the ceiling: all three roles are wired, so that constant cannot
grow again. `test/records/escape-alignment-ambiguity.test.ts` holds all three tail codes out of its
tier through one named constant, so defect 15's 144/24/108/93/15 are still that slice's numbers, and
it gained a third parallel delta (one column, every body, four moving, asserted disjoint from the
other two columns). `test/records/alignment-shifted-fields.test.ts` generalized its single held-out
constant to a list. And `test/records/alignment-truncated-field.test.ts` **had the defect its own
notes warned about**: its `acceptedNow` was a live parse while `acceptedBefore` held out one code, so
this code's column would silently have stopped meaning what it says. Both sides now hold the later
code out through a named constant. **Applying that file's own recorded lesson before it bit a second
time is the point: a claim inherited from the file you are editing is not evidence, and neither is a
tier that was correct when it was written.**

**▶ THE TWO PINS BECAME CLOSURE ASSERTIONS RATHER THAN BEING DELETED.** Both 17(a)'s and 17(b)'s
files carried a `stays silent on a gained COMPONENT boundary` test asserting the streams raised only
a tolerable code and were accepted. Those now assert the code fires and the tier refuses, while still
asserting **their own** code's silence, so each file's silence stays a statement about that code
rather than a stale claim that nothing reports the stream.

**▶ THE NEGATIVE CONTROL WAS RUN, NOT JUST DECLARED.** The measurement harness was pointed at the
wrong code (the field-role report in place of the component-role one) and at the wrong fixture
(17(a)'s field-role harm case in place of the component-role one), and **failed loudly both times**
(7 and 4 assertions respectively). A harness that cannot fail against the wrong input is not
measuring anything. **The arity bound carries its own two-sided control**, which pass 2 required
after catching the first version being one-sided: both `NAME_ARITY` and `UTID_ARITY` are perturbed
up **and** down and each of the four perturbations fails. **A prefix of the component list truncated
at the same constant on both sides is NOT a test of that constant**: it stays green when the arity
is understated, because it stops short of where the two lists differ. Read the model's own named
slots instead. The `maximalTolerance` profile is the standing control, built by spreading this
package's own `TOLERABLE_CODES` so a copy pointed at a sibling parser fails on the spread.

**▶ `astm/CLAUDE.md` WAS OVER ITS ENTRY BY 279 BYTES AND WAS BROUGHT BACK BY RELOCATION, NOT BY
RAISING THE CEILING.** What moved: defect 12's figure recitation (P(18,4) = 73,440, the 18-character
alphabet, P(12,4) = 11,880, 9,287 of 50,400), which **already existed verbatim in this file** and was
replaced there by a pointer to it, with **all four of that entry's traps kept** (do not re-derive
from the test file's own space; never quote a figure without the space and a corpus constant in the
tree; "0 silent" is weak here; never replace the "what is not guaranteed" prose with a positive
guarantee). Entry 17's own connective prose was tightened, its shared measurement line folded to
cover all three branches, and the pair-count worked example (`HF\^&` / `28.6&F&F&F&U/L`) relocated
here, where it already stood, leaving the imperative behind. **No trap was dropped from either
entry, and the ceiling was not raised:** that is a deliberate act needing its own commit and its own
argument, and it is not this slice's to take. **Do not write the current byte count here**: it was
recorded once and was stale within the same slice, twice over, because two refuter passes each moved
the file. **Derive it: `wc -c astm/CLAUDE.md` against that repo's `REPO_CLAUDE` entry.** The next
append there relocates first.

### Defect 17, the tail residue: CLOSED 2026-08-06, by asking whether the tail can be READ

**What shipped, and it is neither a fourth code nor a criterion swap.**
`ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS`, `ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD` and
`ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS` keep their names, their claims, their roles and their
tolerability. The one predicate the three share moved from `!isEscapeSequenceAt(text, i + 4, escape)`
to a named `headsInterpretableSequence(text, i + 4, escape)`, negated: a contested boundary is
reported unless the escape character the reading taken resumes on heads a triple whose body is one of
the **four recognized mnemonics**. Two tails now satisfy it where one did:

- **It heads no sequence at all**, kept as a bare literal, `ASTM_UNPAIRED_ESCAPE_CHARACTER`. Reported
  before, reported now.
- **It heads a sequence whose body is unrecognized**, preserved verbatim and never guessed at,
  `ASTM_UNKNOWN_ESCAPE_SEQUENCE`. **This is the residue three slices disclosed and left open.**

**▶ THE CORRECTION IS TO THE REASON, NOT TO THE GUARD, AND THAT IS THE REUSABLE PART.** All three
slices recorded the same ground for the silence: in the residue case the competing alignment would
leave **two** escape characters bare while the reading taken carries one unreadable body, so the
bytes prefer the reading taken **more strongly** there, not less, and firing "would report a boundary
the bytes prefer." **That comparison is true, and it is not the question these codes ask.** They
report a **cost**, a modeled slot decided by a boundary the bytes do not force, and the cost is
identical under both tails, which is now measured rather than reasoned about. **Consuming a triple is
not interpreting one**: an unrecognized body is preserved verbatim precisely because this codec
cannot read it, which is why the package already reports it. A reading that resumes on one has bought
its boundary with bytes it cannot read exactly as a reading that resumes on a bare escape character
has. **The preference argument also fails to separate the two cases in the direction it was used**:
on `28.6&F&|&U/L`, the case that already fired, the reading taken carries one deviation and the
competing alignment three, so the bytes prefer the reading taken there too.

**▶ WHAT STAYS SILENT IS ONE TAIL, AND IT CARRIES THE WHOLE OVER-REFUSAL DEFENCE.** Where the escape
character heads a sequence this codec **recognizes**, the reading taken interprets a construct and
nothing is reported: `28.6&F&F&F&U/L` under a set naming the field separator `F` is that separator
escaped, written, and escaped again. That is the **only** tail on which a stream's escaping can be
clean at all, so it is the only exclusion that could ever protect conformant traffic. The widened
predicate **cannot** refuse an escape-clean stream, by construction rather than by luck: every
position it now rejects already raises `ASTM_UNPAIRED_ESCAPE_CHARACTER` or
`ASTM_UNKNOWN_ESCAPE_SEQUENCE`. That is the property the rejected pair-count criterion did not have
(it refused 48 of the 96 escape-clean tuples of the shared corpus), and it is the reason the tail axis
could be widened from one value to two without re-opening that question. **The pair count was not
re-proposed and still ships nowhere.**

**▶ 🔴 THAT REMAINING SILENCE IS A TRADE, NOT A CLAIM THAT NOTHING WAS LOST, AND THE FIRST DRAFT OF
THIS SLICE DROPPED THAT HEDGE FROM SIX SURFACES.** The base text said the excluded tail *"still shifts
the fields and is the recorded residue"*; the draft replaced it with *"that is the escape mechanism
working"* and stopped there, in `README.md`, `docs-content/limitations.md`,
`docs-content/troubleshooting.md`, the module doc and three sink docs in `src/common/escapes.ts`, and
the three code entries in `src/common/warnings.ts` (`dist/index.d.ts` and the immutable
`docs-content/` tarball among them). **The refuter caught it on pass 1 and it is exactly defect 6's
and defect 12's recorded traps**: never tidy a scoped caveat into an unqualified one, and never
replace narrow "what is not guaranteed" prose with a positive guarantee. Half the old sentence was
legitimately retired (the unrecognized tail now reports); the other half is still true.
**On the excluded tail the cost is not merely under-reported, it is `warnings: []`**, measured on the
canonical set and now pinned in `test/records/alignment-unrecognized-tail.test.ts` rather than left
to prose: `R|1|^^^687|28.6&F&|&F&U/L||||F` reads **nine** fields against the competing alignment's
eight and hands back `status.isActiveFinal: true` with an empty warning list;
`28.6&S&\&S&U/L` reads a value of `28.6^` with `^U/L` in no modeled slot; `&F&^&F&GLU^L^687` reads
four components against three, so `687` is a vendor local code under one reading and the **coding
scheme** under the other. All three are `PRE-EXISTING` and reproduce byte-identically on `4569591`.
**Closing them is the over-refusal that sank the pair count, so the answer is disclosure, not a
wider guard, and the hedge must travel with the bound on every surface that states it.**

**▶ 🔴 A SEVENTH SURFACE WAS FOUND ON THE SECOND REVIEW PASS, AND IT WAS THE *ADVICE*, NOT THE
HEDGE.** `docs-content/troubleshooting.md` carried the hedge in its three code sections but still
told the reader to "treat a **bare** escape character next to a delimiter as worth reading the raw
line for". **That advice does not reach the case it sits next to.** The one tail still silent is
`&F&|&F&`, where the escape character next to the delimiter heads a *recognized* sequence and is
therefore **not bare**, so a reader following that sentence literally skips exactly the stream
nothing reports. Every sibling surface had already dropped the word (`README.md`,
`docs-content/limitations.md`, the sink docs, `src/common/warnings.ts`, the changeset). The lesson is
narrower than the one above and worth keeping separately: **when a bound is widened, re-read the
*what-to-do* sentences as well as the *what-it-means* ones.** The prose that stated the rule was
correct on that page; the prose that told a reader what to do about it had gone false, which is the
`no-internal-refs` rule 4 finding class ("the worst finds were English sentences") arriving on a
different gate. Fixed by scoping the advice to any escape character next to a delimiter, whether or
not anything fired, and by carrying the trade sentence into that paragraph too.

**▶ A THIRD READER OF `ASTM_UNKNOWN_ESCAPE_SEQUENCE`'S CONDITION LANDED AND IS NAMED IN
`src/profiles/safety.ts`.** `headsInterpretableSequence` asks the mnemonic test about the tail body,
so an unrecognized body there now decides whether one of the three tail codes fires. Admissibility is
unchanged (what it raises is not tolerable), but the entry said "two readers" and would have gone
stale silently. **Re-derive that list whenever something new starts reading record structure**: this
is the second time the count has grown.

**▶ WHY ONE PREDICATE AND NOT THREE MORE CODES.** The three codes differ in what the gained boundary
**costs** in their role: a field shift, a first-repeat truncation, a component move. The tail flavour
is not a difference in cost, only in how strongly the bytes prefer the reading, so a fourth, fifth and
sixth code would have made three claims already made and left a consumer switching on six. Renaming or
splitting a stable code is breaking; widening the predicate behind it is a narrowing on the strict path
only, which is exactly what the three slices before it were.

**▶ THE MEASUREMENT, ON THE SAME 864-TUPLE CORPUS AND THE SAME COMMITTED CONSTANTS AS THE FOUR
MEASUREMENTS BEFORE IT**, tier strict-accepted-under-a-gate-legal-profile, every figure derived from a
constant inside its own assertion. Each code now **fires on 192** where it fired on 96, **moves 64**
accepted -> refused where it moved 32, **moves 0 back**, and fires on **0 of the 96 escape-clean
tuples** exactly as before. The two reported tails contribute **equally** (32 moved each), asserted per
tail so that neither half of a column can be carrying the other. The three columns stay disjoint. Each
of the three measurement files replaced its single `"a bare escape character"` literal with a named
`REPORTED_TAILS` constant and its `*Tails = 1` with `REPORTED_TAILS.length`, and each file's
"stays silent on the unrecognized tail" pin became a **closure assertion** rather than being deleted.
`test/records/alignment-criterion-population.test.ts` had `tailTails` generalized from a literal `1`
to `TAIL_SUFFIXES.length - cleanTails`, **which is its ceiling**: the remaining tail is the
escape-clean one, and refusing it is the over-refusal that file exists to record.

**▶ 🩺 THE AXIS THE SHARED CORPUS FIXES, SWEPT BESIDE IT, AND IT IS A NEW ONE.** That corpus varies
whether the tail is bare, recognized or unrecognized, but its `TAIL_SUFFIXES` uses **one character**
(`Z`) as the unrecognized body, so it can say nothing about which bodies the widened criterion fires
on. `test/records/alignment-unrecognized-tail.test.ts` crosses `DECLARATION_ALPHABET`,
`SPLITTING_ROLES` and `BODY_ALPHABET` with the same alphabet as the **tail** body: **3,456 tuples**,
**2,304 fire**, **528 move**, **0 back**, **384 escape-clean with 0 refused**. Every tuple's observed
disposition is asserted against a predicate **derived from those alphabets** rather than against a
count, because a count can be right for the wrong reason. The moved population is narrower than the
firing one for a derivable reason worth keeping: where the tail body is itself a **splitting delimiter
in force**, `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` had already refused the stream, so it fires
and does not move.

**▶ 🔴 THE UNIVERSAL THIS SWEEP REFUTED, IN ITS OWN FIRST DRAFT, AND IT IS THE SAME SHAPE THE FAMILY
KEEPS COMMITTING.** The obvious claim is *"the reading taken reads exactly ONE more segment than the
competing alignment"*, and the first draft of the sweep asserted it. **It is FALSE.** Where the tail
sequence's body is the delimiter the split is being taken on, the reading taken keeps that character
inside an opaque atom while the competing alignment splits on it, so the two readings produce the
**same number** of segments in **different places**: under `H~\^&`, `28.6&F&~&~&U/L` reads
`28.6&F&` + `&~&U/L` against the competitor's `28.6&F&~&` + `&U/L`. That is **144 of the 2,304**
firing tuples, and the predicate for it (`tailBody === declaration`) is derived rather than fitted.
What holds on all 2,304 is that the two readings **disagree** and that both **consume every byte**, so
neither is forced. **The draft was caught by the sweep and not by the gate**, unlike the three before
it, each of which a refuter caught after it reached `dist/index.d.ts`. The lesson is unchanged and
now has a third instance: **a claim about the split is not a claim about the segment COUNT.**

**▶ 🔴🔴 AND THE SWEEP CATCHING IT WAS NOT ENOUGH: THE REFUTER CAUGHT THAT THE CORRECTION NEVER LEFT
THE TEST FILE. THIS IS THE MOST REUSABLE THING IN THIS ENTRY.** The draft recorded the refuted
universal in the test, in `CLAUDE.md` and in the changeset, and then left every **claim** the three
codes make about their own role standing unqualified. Widening the predicate widened the firing
population past the point where those claims hold, and they were false in `dist/index.d.ts`, in the
immutable `docs-content/` tarball, and in **three runtime warning messages**:

- `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS`: *"every later field is one place further right"*. On the
  canonical set `R|1|^^^687|28.6&F&|&|&U/L||||F` reads **nine** fields under **both** readings, with
  the sender's `F` in field 9 under both and `isActiveFinal: true` either way. No index moves; what
  differs is the units (`&|&U/L` against `&U/L`).
- `ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD`: *"the field is read as more repeats than the other reading
  gives it"*. `28.6&F&\&\&U/L` reads **two** repeats under both.
- `ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS`: *"every later component sits one place further right"*.
  `DOE&F&^&^&JANE^A` reads **three** components under both, with `A` the middle name under both.

**The remedy is the CLAIM, not the GUARD, for the fourth time in this family.** Narrowing the
predicate to exclude the class is forbidden (it changes which streams a published package refuses)
and would be the wrong fix anyway: the boundary is still one the bytes do not force, and the two
readings still disagree about the contents. So the three codes now **name the exception** wherever
they state their cost, and the direction is stated as over-reporting relative to the indexes and
never under-reporting.

**▶ THE CLASS IS BOUNDED, AND THAT BOUND IS WHY THE OVER-REPORT COSTS NOTHING.** A tail body equal to
the delimiter being split on is a **splitting delimiter in force**, so
`ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` had already refused the record. **The measurement is
committed, and it had to be**: the first draft quoted "36,864 firing tuples crossed with four
payload prefixes and four suffixes" with those prefixes and suffixes living only in a scratch file,
which is the exact defect the entry above records against defect 12 ("name the corpus by a constant
that is IN THE TREE"), on `CHANGELOG.md` and a changeset. The axis is now
`PAYLOAD_PREFIXES` and `PAYLOAD_SUFFIXES` in `test/records/alignment-unrecognized-tail.test.ts`,
crossed with the four alphabets the file already swept, so the carrier shape is not held fixed the
way every earlier corpus in this family held it: **55,296 tuples, 36,864 fire, 2,304 are the class,
0 lack that code, 0 were accepted before**, and the class is exactly `tailBody === the delimiter
being split on` with **0** counterexamples in either direction. Every figure derives from those six
constants inside its own assertion. The modeled slots are pinned separately, against the competing
alignment rather than against a remembered figure.

**▶ 🔴🔴🔴 AND THE CORRECTION ITSELF GREW A NEW UNIVERSAL, WHICH THE SECOND REFUTER PASS CAUGHT.**
The rewritten runtime messages opened *"The two readings disagree about **every byte** after this
point"*. **False on the very class the same sentence then names**: on
`R|1|^^^687|28.6&F&|&|&U/L||||F` the two readings **resync**, and fields 6 to 9 are byte-identical
and index-identical under both. So the repair for one over-broad claim was written as another
over-broad claim, three clauses earlier in the same string. The form that survives every sweep is the
narrow one the `⚠️` blocks already used: **"the two readings disagree, and both consume every byte,
so neither is forced."** Four further copies of the same "disagree about every byte / about the whole
tail" phrasing were standing in `README.md`, `src/common/escapes.ts`,
`docs-content/troubleshooting.md` and two measurement files, and were scoped with it.

**▶ THE SECOND PASS ALSO CAUGHT A COMPANION-CODE CLAIM THAT THE WIDENING FALSIFIED, IN
`dist/index.d.ts`.** All three warning factories said *"It fires alongside
`ASTM_UNPAIRED_ESCAPE_CHARACTER`"* unconditionally. That was **true of the old predicate**, which
required a bare escape character at `i+4`; on the half this slice added the tail is a complete
triple and **no unpaired character exists in the record at all**, which the slice's own new test
asserts three times. It now names both companions and says which one depends on the tail. **This is
the same shape as the cost claims**: a sentence true of the narrow predicate, left standing over the
wider one, on the surface a consumer receives.

**▶ 🔴🔴🔴🔴 AND A THIRD PASS FOUND SEVEN MORE OF THE SAME SENTENCE, WHICH IS THE ADR 0016 CAP AND
THE END OF THE GATE.** After both rounds above, the unqualified cost claims were still standing in
`src/records/tokenize.ts` (three `@param` texts), `src/common/escapes.ts` (two `@param` texts) and
`src/profiles/safety.ts` (the repeat and component paragraphs, plus "Two bounds run the other way"
where there are now three), **and `CHANGELOG.md` claimed they had moved "on every surface that
carries one"**. All seven reach `dist/index.d.ts`. The refuter graded it `INTRODUCED` **major** and
said explicitly **"Not a blocker"**, because the direction is over-reporting and every tie-class
record is already refused by the untolerable `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`, so no value
is silently wrong.

**The remedy was taken as a CUT, not a fourth rewrite**, which is the disposition
`#defect-13` already records for the ADR 0016 cap. The `@param` texts no longer paraphrase the cost
at all: they name the sink and stop, so the claim lives in **one** place per role instead of three.
Only `safety.ts`, which argues admissibility rather than pointing, kept a scoped restatement.
**Three refuter passes, three REFUTED verdicts, every one of them on a SENTENCE and none on the
guard.** The predicate survived every attack in all three passes, including exhaustive sweeps of
1,000,000 and 72,500,000 texts. **That asymmetry is the finding of this slice: a one-line predicate
change cost about twenty prose corrections across eleven files, and the prose is where every defect
was.**

**▶ TWO `PRE-EXISTING` HOLES THE THIRD PASS NAMED, BACKLOGGED, NOT CLOSED HERE.** (1) The companion
universal ("every position this rejects is one the package already reports") is **false where the
declaration names the escape character in a splitting role too**: `H|\FF` raises a tail code with
neither escape companion, and the base does the same, 586/586 shared. Scoped in place to "wherever
the escape role is a character distinct from the three splitting roles"; the collision itself is
already `ASTM_RECORD_DELIMITER_ROLE_COLLISION`. (2) "One place further right" **understates where a
second contested construct follows and the competing alignment re-phases**: `A&Z&|&BX&Z&|&F&C` reads
three fields against one. Breaks identically at base. Both want their own slice.
**BOTH CLOSED 2026-08-07 in their own slice; see `#defect-17-claim-residuals` below.**

**▶ THE GENERAL RULE, WHICH IS WHAT TO CARRY FORWARD.** **Recording a refuted universal in the test
that refuted it is not the same as correcting the claims that rested on it**, and **the correction is
itself a claim that has to be swept.** Three artifacts recorded it (test, `CLAUDE.md`, changeset) and
around fifteen surfaces still asserted it; the rewrite of three of them grew a new one. When a sweep
refutes a universal, **grep for every restatement of that universal before the slice is done**, then
**grep your own replacement the same way**. Treat the runtime warning **messages** as first-class
surfaces: they are the sentence an operator reads at three in the morning, and no gate in this repo
reads them for truth. And **widening a predicate falsifies more than the cost claims**: it can
falsify which OTHER codes are said to fire beside it.

**▶ THE NEGATIVE CONTROLS WERE RUN, NOT DECLARED, AND ONE OF THEM WAS VACUOUS ON THE FIRST TRY.** The
mnemonic-set perturbation is two-sided (overstate and understate), because a one-sided control passes
when the constant is understated. Its first version overstated the set with `Z`, **a character the
corpus never uses as a tail body**, so the perturbed predicate could not disagree with anything and the
control was vacuous: it now perturbs with `~`, asserted to be in the swept alphabet. The harness is also
pointed at the wrong role's code and fails there. The `maximalTolerance` profile remains the standing
control, built by spreading this package's own `TOLERABLE_CODES` so a copy pointed at a sibling parser
fails on the spread.

**▶ THE OTHER FOUR THE REFUTER FOUND, SMALLER AND ALL ON CONSUMER SURFACES.** (1) A quoted
reproduction that did not reproduce, in `escapes.ts` and `docs-content/limitations.md`: the
nine-fields-against-eight figure was attached to the FRAGMENT `28.6&F&|&F&U/L`, which reads **two**
fields, instead of to the record `R|1|^^^687|28.6&F&|&F&U/L||||F`. The file's own comment says a
quoted reproduction that does not reproduce is worse than no example, and it shipped one anyway.
(2) The pending `shifted-components-alignment` changeset's **lead sentence** still defined the code
by the narrow tail; both changesets land in the same release, so the generated note would have
defined it narrowly at the top and widened it three paragraphs down. `CHANGELOG.md` had the
parenthetical at exactly that position for all three codes and the changeset was missed.
(3) `referenceCorpus`'s rationale **string** kept "which is much of this corpus" while narrowing what
it modified from "a sequence of its own, recognized or not" to "a sequence this reader RECOGNIZES":
unmeasured, and pointing the wrong way, since that corpus is defined by a stack that never writes
recognized mnemonics at all. It now says the frequency is not measured and must not be guessed at.
(4) Two of the three measurement files' HEADERS still stated the retired criterion while their bodies
were rewritten, so a maintainer re-deriving from either header re-derives the base one.

**▶ WHAT DID NOT CHANGE, so it is not read in.** No code was added, removed or renamed, and **no public
surface moved at all**: no new type, factory or parameter. No tolerable code was struck off and none was
added. No split changed and no stream's **values** moved. `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT`'s
recognized-body exclusion is exactly as it was. It still does **not** reach through a re-emit: emit
rewrites the preserved characters into recognized mnemonics and generation 2 is silent and correct about
its own bytes. **Catch it on the FIRST read; a clean re-read is not evidence.**

**▶ A PRE-EXISTING RESIDUE THE SECOND PASS MEASURED AND THIS SLICE DOES NOT AMPLIFY.** "One place
further right" **understates by one per extra contested boundary**: `&&&|&F&|&` split on `|` reads
three segments against the competing alignment's one. Measured at 415 such texts in a 72.5M sweep,
and **every one of them already fires under the BASE predicate**, with **0** reaching the reports
only through this widening. So it is `PRE-EXISTING`, it is a direction the codes under-state rather
than over-state (they still fire, and the reader is still told to read the raw line), and it wants
its own slice rather than a clause bolted onto this one.

**▶ WHAT IS STILL OPEN AND WAS NOT TAKEN HERE.** **Withholding the shifted, truncated or moved slots**
stays deferred, for the reason 17(a) recorded: declining to model a slot changes an extracted value for
every consumer of a package already on the registry, and it wants its own measured slice.
**`ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD` still fires where no field is truncated** (only a first
contested repeat boundary reaches a modeled slot); that is a decision, not a defect, and renaming a
stable code is breaking. **Defect 9** was not touched and is still open.

**▶ `astm/CLAUDE.md` WAS BROUGHT BACK UNDER ITS ENTRY BY RELOCATION, NOT BY RAISING THE CEILING.**
Entry 17's replacement ran 438 bytes over 9 bytes of headroom. What moved, each already carried here in
full and each leaving its trap behind in that file: defect 12's account of why the predecessor entry's
figures were discarded and why this entry was refuted on its second pass (kept above under
`#defect-12`, at greater length than the clause removed); defect 12's parenthetical explaining why
`warnings: []` was unreachable for a non-canonical set (same section); defect 16's mechanism sentence
for why the field-collision branch is unreachable (kept above under `#defect-16`, with the index
arithmetic the clause only summarized); and the "all ten roadmap phases, through release hardening"
phrasing in **Status** (kept under `#status-history`).

**A SECOND round was needed when the refuter's finding added the claim-correction trap to entry 17**,
and it is recorded because the shape repeats: an entry grows again when the slice that wrote it is
graded. What moved the second time, all of it either derivable on the spot or already carried here in
full: the `src/` module listing in **Status** (derive it, `ls src/`); the `test/profiles/` and
`test/records/` fixture PATHS in defects 8 and 12 (the constant names stay, because "name the corpus
by a constant that is IN THE TREE" is the trap and the path is not); the "(measured, in the notes)"
and "(the fuzz figures are in the notes)" parentheticals in defects 4 and 5, which duplicated the
`#defect-4` / `#defect-5` anchors those entries already end with; and wording compression in the
**Project**, **Tech Stack**, **Engineering Guardrails**, **docs sidebar** and defect 6/16 prose that
changed no instruction. **Defect 8's "the third time on this family that the claim, not the guard,
was the defect" was corrected to name FOUR**, which is the one place a count went stale from this
slice rather than being relocated.

**No trap was dropped in either round and the ceiling was not
raised:** raising it is a deliberate act needing its own commit and its own argument. **Do not write
the current byte count here**: it was recorded once before and was stale within the same slice, twice
over. **Derive it: `wc -c astm/CLAUDE.md` against that repo's `REPO_CLAUDE` entry.**

<a id="defect-17-claim-residuals"></a>

### Defect 17's two claim residues, closed 2026-08-07

Both were named by the third refuter pass on the tail-residue slice, tagged `PRE-EXISTING`, and
backlogged there rather than closed. Neither was ever a guard defect. **No guard moved in this slice
either**: no code added, removed or renamed, no split changed, no extracted value moved, no stream's
disposition changed, and no public surface moved. **These are residues OF defect 17, not a new
occurrence**, so defect 8's count of the times the claim rather than the guard was the defect is
unchanged and must not be bumped for this slice.

**▶ (1) THE COMPANION UNIVERSAL, AND THE CORPORA ALL FIXED THE AXIS THAT BREAKS IT.** The three tail
codes rest on one defence against over-refusal: firing requires an escape character heading no
sequence this codec can interpret, and the package already reports each of those, so a stream whose
escaping raises nothing can never be refused. Every corpus in this family declares its swept
character into one of the three splitting roles and **leaves the escape role at `&`**, so none of
them could see a declaration naming the escape character in a splitting role too. There one byte both
opens a sequence and ends a segment, the split claims it first, and neither escape report ever sees a
sequence to raise: **a tail code fires with neither companion.** Measured exhaustively over all four
role assignments during the build, and pinned on the committed corpus so every figure quoted anywhere
is re-derivable from the tree (`alignment-companion-universal.test.ts` asserts its own): **distinct
arm 2,304 tuples, 1,536 fire, 0 orphans; collides arm 1,008 tuples, 648 fire, 288 orphans; 0 orphan in
either arm lacking `ASTM_RECORD_DELIMITER_ROLE_COLLISION`** (which is not tolerable). So the defence survives in the
form it was needed in, **no stream whose escaping AND whose declaration are both clean is refused by
a tail code**, and not in the form it was written in.

**🔴 THE REPLACEMENT IS SCOPED TO THE STREAM AND IS FALSE PER MESSAGE, WHICH IS THE SHARP EDGE AND
WAS NOT IN THE BACKLOG LINE.** The collision is reported **once per set change, not once per
record**. A second header re-declaring the same colliding set raises nothing while the tail codes in
its message fire again, so a consumer scoping warnings to a message sees one of the three codes
standing entirely alone, with no companion and no collision in that message's own record range.
Measured: on a two-message stream the collision sits at `recordIndex` 0 and the second message's tail
code at `recordIndex` 5 with nothing beside it. **Never write the replacement without its scope.**

**Also measured, because "three splitting roles" reads as three reachable collisions:** the **field**
role cannot collide with the escape role at all. The declaration is the three characters after the
field separator and **stops at the next occurrence of that separator**, so such a header terminates
itself one character short and is refused outright. The collides arm therefore has **two** roles.

**The orphan class is a run, not an independent tail axis**, which is why the two arms of the corpus
are deliberately different shapes: on a colliding set the escape character and the splitting
delimiter are the same byte, so the body and tail axes collapse into the length of the run of that
byte. Sweeping the collides arm on the distinct arm's shape holds its only real axis fixed and
reports a comforting zero, which is the mistake this file exists to correct. **A run of 5 fires as an
orphan and a run of 7 does not**, so the class is a property of the geometry and not of the
declaration alone.

**▶ (2) "ONE PLACE FURTHER RIGHT" IS A FLOOR, NOT A FIGURE, AND IT IS WRONG IN BOTH DIRECTIONS.**
The tie class (offset **zero**) was already named and measured. The other direction was not: every
corpus in this family carries **exactly one contested construct per record**. The competing reading
resumes a character further on at each contested position, so it falls further out of step and the
gap widens **once per construct**. `A&Z&|&BX&Z&|&F&C` reads **three** fields against **one**, and a
chain of n constructs displaces by **n**, measured to n = 6.

**🔴 THE NUMBER OF WARNINGS IS NOT THE DISPLACEMENT EITHER, IN EITHER DIRECTION, AND THIS IS THE PART
A READER WOULD HAVE GUESSED WRONG.** Over **3,072** firing tuples on a two-construct corpus:
**1,568** carry **one** warning on a displacement of **two** (a gained boundary whose tail is a
recognized mnemonic is excluded from the report and still displaces, which is the standing
over-refusal defence doing exactly what it is for), and **320** carry **two** warnings on a
displacement of **one** (one of the constructs is a tie). **A consumer cannot recover the offset by
counting, and every corrected surface says to read the raw line instead.**

**The harm is not academic and it is two-directional, on one code.** On
`R|1|^^^687|28.6&F&|&Z&U/L||||F` the sender's trailing `F` lands **in** the status slot and reads
`final`, which is the fabrication `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS` was written for. On
`R|1|^^^687|28.6&Z&|&BX&Z&|&F&U/L||||F` the same displacement runs **twice**, the `F` **overshoots**
the status slot, and the status reads `unspecified`. Same code, opposite outcomes, and the retired
sentence about the size of the displacement is what a reader would have used to tell them apart.

**▶ 🔴 THE FIRST PASS OF THIS SLICE WAS REFUTED, AND ON EXACTLY THE TRAP THE ITEM NAMES. READ THIS
BEFORE THE NEXT CLAIM CORRECTION.** Two things went wrong and both generalize.

**(a) THE MAGNITUDE WAS PARAPHRASED IN THREE VOCABULARIES AND THE FIRST SWEEP ONLY KNEW ONE.** A
newline-folded grep for `one place further right` finds a fraction of the claim. The same fact was
also written **"shifts every later field one place"** and **"moves one slot along"**, and those two
carried most of the surviving copies: **nineteen** across `escapes.ts`, `warnings.ts` (including the
three `WARNING_CODES` **registry entries**, which are the primary surface a consumer reads, and the
three runtime messages), `safety.ts`, `reference-corpus.ts` (a runtime **string**), `parse.ts`,
`tokenize.ts`, `README.md`, and **all three** of `docs-content/troubleshooting.md`, `quickstart.md`
and `limitations.md`, the last two of which the first pass never touched and which ship in the
**immutable** docs tarball. **SWEEP THE FACT, NOT THE PHRASE: enumerate every wording the fact has
ever been written in before grepping, and grep each.**

**(b) THE CORRECTION ASSERTED ITS OWN COMPLETENESS AND WAS FALSE WHEN WRITTEN.** The new paragraph
said "THIS IS THE ONE PLACE IN THE PACKAGE THAT STATES IT" while eight other places still stated it,
two of them **in the same doc comment**. **A completeness claim is itself a claim, it is the easiest
kind to falsify, and it buys nothing.** The wording now says what the other surfaces do (name the
KIND of cost) rather than asserting a count of where the magnitude appears.

**(c) A THIRD, SMALLER ONE: THE CORRECTION FOR HOLE 1 WAS PUT ON A PRIVATE FUNCTION** and reached no
consumer, while the retired universal stood on four **exported** doc comments. **Check that a
correction lands in `dist/index.d.ts` when the sentence it replaces does.**

**▶ THE SINK RULE, AS APPLIED AFTER THE REFUTATION.** Every other surface names the **KIND** of cost
(fields shift, the field truncates, components move along the list) and leaves the **MAGNITUDE** to
one paragraph, on the **exported** `ShiftedFieldsSink`, which all three warning factories already
point at. Both corrections live there, so both reach `dist/index.d.ts`. That removed restatements
rather than adding a qualifier to each, which is the whole point of the rule.

**🔴 "AT LEAST ONE PLACE" WAS REJECTED AS THE REPLACEMENT WORDING, AND IT WAS THE OBVIOUS ONE.** It
**contradicts the tie class named in the same sentence**, where the displacement is zero, and the
predecessor's hedge ("usually one place") was at least internally consistent. The refuter caught it
on the runtime messages. Every corrected surface now says the displacement is **not fixed** and names
its **three** values (zero on the tie class, one on a single construct, one more per additional
construct). The three runtime **messages** cannot point at a symbol, so they carry that in full and
tell the operator that counting these warnings does not give the displacement. No gate in this repo
reads a message for truth.

**▶ RED BEFORE, GREEN AFTER, AGAINST THE RETIRED ASSERTIONS VERBATIM.** Both holes were pinned by
running the committed assertions that encoded them on the swept axes:
`alignment-shifted-fields.test.ts`'s `leftmost.length === competing.length + 1` reads **10 against an
expected 9**, and `alignment-unrecognized-tail.test.ts`'s companion assertion reads **false**. Both
files now **scope** those assertions to the corpus that measures them rather than stating them as
universals; neither assertion was deleted, because each is still true of its own fixture and that is
the point.

**▶ THE MEASUREMENT FILES AND THEIR CONTROLS.** `test/records/alignment-companion-universal.test.ts`
and `test/records/alignment-offset-rephasing.test.ts`, each sweeping the axis its family's corpora
hold fixed. Both carry the standing `maximalTolerance` control, built by spreading this package's own
`TOLERABLE_CODES` so a copy pointed at a sibling parser fails on the spread. The companion file adds
a two-sided perturbation (the collides arm re-run with the escape role moved back to `&`, which must
empty the orphan class) and a wrong-role control; the offset file adds a wrong-delimiter-role control
and asserts the transcribed competing split reproduces its input bytes. **One control was caught
vacuous during the build**: the corpus carrier originally hardcoded `&` as the escape character while
the collides arm declared another, so that arm carried no escape sequences at all and reported zero
orphans. **A corpus that builds its payload from anything other than the declared set is measuring a
different package.**

**▶ THREE `PRE-EXISTING` LINES THE THREE PASSES NAMED, BACKLOGGED, NOT CLOSED HERE.** (1) The
unqualified retired universal ("the only tail on which a stream can be escape-clean at all") survives
verbatim in **three test comments**: `alignment-shifted-components.test.ts`,
`alignment-shifted-fields.test.ts` and `alignment-truncated-field.test.ts`. Not shipped, false in the
same way the nine corrected surfaces were. (2) `alignment-companion-universal.test.ts` wires only
`repeat` and `component`, so the **`ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS` orphan population is never
measured by the corpus whose zeros certify the correction** (pass 3 found 128 such orphans by its own
sweep and confirmed the claim holds on them, so this is coverage, not falsity). (3) The three figures
the changelog and changeset quote from `alignment-offset-rephasing.test.ts` (**3,072 / 1,568 / 320**)
are asserted only as `toBeGreaterThan(0)` there, so they can drift with the suite staying green;
`alignment-companion-universal.test.ts` pins its own with `toHaveLength` and is the pattern to copy.

**▶ 🔴 THE SHAPE WARNING PASS 3 LEFT, WHICH IS WORTH MORE THAN ITS FINDINGS.** Each of the three
passes found one more **claim about a claim** ("this is the one place that states it", "the only
figures any surface may quote", "neither speaks for the other"), none of which any test can hold
true. **That is a shape problem, not a hardening problem.** The rule that falls out of it, and it is
the one to carry into the next claim correction on this family: **when a claim-about-coverage is
wrong, DELETE it rather than repair it.** A repair is a fourth assertion of the same kind. The last
one was deleted rather than rewritten, on pass 3's own recommendation.

**▶ WHAT WAS DELIBERATELY NOT TAKEN, all still open.** Withholding the shifted, truncated or moved
slots (changes an extracted value on a published package and cascades into
`ASTM_RECORD_UNITS_ABSENT`); narrowing `ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD`, which still fires
where no field is truncated (renaming a stable code is breaking, and narrowing changes which streams
a published package refuses); and **defect 9**. **The pair-count criterion stays REJECTED over 864
tuples and must not be re-proposed.**

<a id="alignment-corpus-blind-spot"></a>

### The three measurement holes those corrections left, closed 2026-08-07

All three were named by the refuter passes on the slice above, tagged `PRE-EXISTING`, and backlogged
there. **No guard moved here either**: no runtime code is added, removed or renamed, no split
changes, no extracted value moves, no stream's disposition changes, and no exported surface moves.

**▶ 🔴 (1) THE CORPUS CERTIFYING THE COMPANION CORRECTION OBSERVED ONE OF ITS THREE CODES ZERO
TIMES, AND THE REASON IS A SECOND AXIS NOBODY HAD SEPARATED.** The correction is stated over all
three tail codes. `alignment-companion-universal.test.ts` wired `COLLIDABLE_ROLES` to `repeat` and
`component`, correctly, because the field role cannot collide with the escape role at all. **But the
role the collision is IN and the role the gained boundary is ON are different axes**, and only the
first was being swept. Both arms carried the contested construct inside a single field of the
carrier, so no field boundary was ever in contest, and
`ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS` was observed **zero** times across all 3,312 tuples. That zero
is now an assertion, not a remark: it reds if either arm ever starts reaching the field split.

**The field code is reachable as an orphan even though the field ROLE is not collidable**, which is
the part that reads as a contradiction until the two axes are separated. The collision sits in the
repeat or component role, where it is expressible; the boundary the two readings disagree about is
on the **field separator**, which the swept character never is. `H|F^F` declares `F` as the repeat
separator **and** as the escape character; on `C|1|I|FFF|F|G` the reading taken closes `FFF`, takes
the `|`, and resumes on a trailing `F` that heads no interpretable sequence, while the competing
reading opens its triple a character later and swallows the `|` whole. The field code fires, and the
repeat split has already claimed every one of those bytes, so **neither escape reporter has anything
to raise.**

Two field arms, pinned: **distinct 1,296 tuples, 432 fire, 0 orphans; collides 1,296 tuples, 360
fire, 144 orphans.** All 144 carry `ASTM_RECORD_DELIMITER_ROLE_COLLISION` and are refused by the
widest gate-legal profile before and after, so **no stream's disposition changed.** The union
assertions now read over all four arms and on the wider **`anyTail`** population rather than on the
one code each arm was built to observe: reading them on the per-arm code would let a tuple raising a
code its arm was not aimed at out through the same door this slice is closing.

**The payload is built from the DECLARED escape character**, which is this file's own standing trap:
an arm emitting a character the header did not declare into the escape role carries no escape
sequences and reports a comforting zero. That is why perturbing the field arm back to a distinct
escape role perturbs its bytes too, and why the control is stated as two-sided.

**▶ 🩺 (2) THREE FIGURES WERE ASSERTED AS "MORE THAN ZERO", AND THE PROOF THAT MATTERS IS THE
CONTROL, NOT THE PIN.** `alignment-offset-rephasing.test.ts` bounded its firing population, its
under-stating class and its over-stating class below by one. **Measured: shrinking that corpus's
`BODY_ALPHABET` by one character halves it (3,072 firing tuples become 1,617) and the pre-slice file
passes 12 of 12.** With the figures pinned the same perturbation reds six assertions, each naming
its own new value. **A lower bound of one is not a pin, and this is what that costs.**

Pinned: **3,072 firing, 1,568 at one warning on a displacement of two, 320 at two warnings on a
displacement of one, 64 in the tie class**, plus the **whole joint distribution** of report count
against displacement, which is the strongest form available and makes every counting claim in the
file falsifiable in one place.

**🔴 PINNING THE TABLE FOUND SOMETHING NONE OF THE THREE FIGURES CARRIED, AND IT WAS FOUND BY BEING
WRONG FIRST.** The table was first written with a `reports=0 offset=0` cell of 1,024, by assuming
the non-reporting tuples were the undisplaced ones. **There is no such cell.** The 1,024 split
**128** at a displacement of one and **896** at two: **every tuple this code says nothing about is
displaced anyway.** That is the recognized-tail exclusion behaving as intended, and it is a **third**
direction in which counting warnings fails, this one silent. **`reports` counts one code only, so
this is not a claim that those streams raise nothing at all** (several raise an escape deviation of
their own); do not restate it as `warnings: []`.

**▶ (3) THE RETIRED UNIVERSAL, AND THE SITES THIS SLICE CHANGED.** The backlog line named
`alignment-shifted-components`, `alignment-shifted-fields` and `alignment-truncated-field`. Changed
here: those three, plus `alignment-unrecognized-tail.test.ts` and
`alignment-criterion-population.test.ts`, which state the same fact in different words, plus the
corollary about the escape companion at the "refuses NOT ONE escape-clean stream" tests in the first
three, plus one parenthetical in `CLAUDE.md`. **Sites, not a count of the fact.**

**Each was CUT or SCOPED, never re-qualified in its own words.** A qualifier written fresh at each
site is a fresh paraphrase of one fact, which is the sink rule's exact failure mode. What stands in
each place instead is that file's **own** bound, which is a fact about its constants and can be
checked by reading them (it holds the escape role at `&`), plus a pointer to the file that measures
what the bound is worth. The scoping wording is copied verbatim in shape from
`alignment-unrecognized-tail.test.ts`, where the preceding slice had already established it.

**🔴 THE `escapes.ts` SITE THE REFUTER NAMED, AND THE PREMISE FOR DEFERRING IT WAS ITSELF WRONG.**
`src/common/escapes.ts` stated the parent universal unqualified at the predicate's own implementation
site ("so a stream whose escaping is entirely well formed can never be refused by it"), several
hundred lines below the scoped doc comments on `ShiftedFieldsSink`. The first remedy draft deferred
it as a shipped surface whose correction would move `dist/index.d.ts`. **Measured, that was false on
both counts**: it is a `//` comment, which this repo's own rule 4 says is ungated because it is not
what a consumer is shown, and the string appears **zero** times in `dist/index.d.ts`. So it was
scoped here, at no cost to any published surface. **Check which kind of comment a sentence is before
deferring it for being shipped.**

**The same check retired a claim-about-a-claim in the same file.** The doc block on the
private `headsInterpretableSequence` read "this is the single place that says what happens there",
which `README.md` and
`docs-content/limitations.md` had already falsified, and which this slice would have falsified again.
**DELETED, not repaired**, per the standing rule, and it too is absent from `dist/index.d.ts`.

The earlier `[Unreleased]` changelog paragraph is kept as written, marked with where it is scoped
later in the same release, because the measurement that entry records starts from it.

**▶ 🛑 THIS SLICE WAS REFUTED TWICE ON THE SAME SENTENCE SHAPE, AND BOTH ARE WORTH CARRYING.** Pass 1:
the first draft said the universal "WAS IN FIVE TEST COMMENTS, NOT THE THREE THAT WERE RECORDED",
said it had swept the **fact**, and said `src/` was already scoped. **All three were completeness
claims and the third was measurably false**, with unqualified counter-instances standing in files
this slice had already edited. **The corollary is a different wording of the same fact** ("and it
cannot", "structurally out of reach", "on no escape-clean stream at all"), and a sweep keyed on
"only" near "escape-clean" cannot see it.

**Pass 2: the REMEDY falsified three more of them, and that is the part that generalizes.** Scoping
the `escapes.ts` comment was right, but surviving sentences said the slice was confined to
`test/` and that `src/` was byte-identical, so **the fix turned the slice's own record false.** **An
enumeration of where a change lives is a claim that every later edit can break, and it buys
nothing.** Both dispositions were **DELETION**, per the standing rule, never a longer list: what
stands is the testable half (no guard, no behaviour, no exported surface) and the sites, with no
total anywhere. **Never write a total here, and never enumerate the directories you touched.**

**▶ THE MEASUREMENT AND ITS NEGATIVE CONTROL.** Every figure above was taken by a script importing
`src/index.ts` directly, and each was re-run against `@cosyte/hl7`'s entry point, where both scripts
fail outright rather than reporting a number. `alignment-companion-universal.test.ts` keeps the
standing `maximalTolerance` control built by spreading this package's own `TOLERABLE_CODES`, so a
copy pointed at a sibling parser fails on the spread; **`alignment-offset-rephasing.test.ts` has no
such control and never did.** Its controls are the transcribed competing split, which must reproduce
its input bytes, and the wrong-delimiter-role measurement.

<a id="defects-closed-elsewhere"></a>

### Two further defects, closed and folded away

Two further defects once on this list (the `>3`-char declaration losing its surplus on emit, and
`serializeAstmRecords(msg, d)` not validating a caller-supplied `d`) were recorded with
`ASTM-MIXED-DELIMITER-EMIT` (#21), left again by `ASTM-SECOND-HEADER-COLLAPSE` (#22), and **both
closed by `ASTM-EMIT-RESIDUALS`**: read `CHANGELOG.md` `[Unreleased]` for the dispositions chosen
(preserve the surplus; refuse an unusable set with a typed error) and why.

<a id="guardrails"></a>

## Engineering Guardrails

The short rules stay in `CLAUDE.md`. This is the one guardrail whose reasoning is measurement rather
than style.

<a id="attw"></a>

### `attw` says "does not contain types" and exits 0, so the `attw` script is a wrapper, not the bare CLI

- **▶ `attw` SAYS "does not contain types" AND EXITS 0, SO THE `attw` SCRIPT IS A WRAPPER, NOT THE
  BARE CLI.** `getExitCode.js` in `@arethetypeswrong/cli` (0.18.4, read in this repo's own
  `node_modules`) opens with `if (!analysis.types) return 0`. An untyped package is a legitimate npm
  package, so "no types at all" is a description, not a problem, and the problem list is never
  consulted. No `--profile`, `--ignore-rules` or config setting reaches that early return. For a
  package that ships types it means the declarations were **not in the tarball**, which is a broken
  publish reported as a pass. A false red costs an hour; **a false green merges.**
  **The race only supplies the condition, and the defect is not the race.** Reproduced here at
  `0.0.9` with **zero** concurrency, both printing the sentence and exiting 0: `rm -rf dist`, and
  `rm -f dist/index.d.ts dist/index.d.cts`. The second is the realistic window, and it is the
  **build** that opens it: timed on one real `tsup` run of this package, the `.mjs`/`.cjs` entries
  landed at 1,176 ms and the `.d.ts`/`.d.cts` at 3,063 ms, so `dist/` held JS and no declarations for
  **1,887 ms**. A concurrent build or `clean` in the same working tree lands the gate in it. So the
  answer is **not** a lock, a lease or a build queue: the gate must be able to say its own inputs
  were missing, whatever removed them. **Do not quote the sibling's 4.95s here**; that figure is
  `terminology`'s build, and this number was measured on this one.
  `scripts/attw.mjs` carries **two nets, and they catch different things**: a preflight that every
  relative path `package.json` promises (`main`, `module`, `types`, `typings`, every string leaf of
  `exports`) exists and is non-empty, which catches the build window and _names the missing file_;
  and a post-check on `attw`'s untyped sentence, which catches what the preflight structurally
  cannot, declarations present on disk but excluded from the tarball by `files`/`.npmignore`. **No
  instance of that second case is on record here.**
  **The post-check reads a string, so what would hide that string is refused**, not tolerated. **Four**
  routes were **measured on an untyped pack** to hand back exit 0: `--quiet` (printed nothing at all),
  `--format json` (the JSON render omits the sentence), a `.attw.json` setting either (`readConfig()`
  applies it after argv), and **`--config-path <file>` where that file sets either**. That last one
  carries a qualifier worth keeping: `--config-path` at a path that does **not** exist blinds nothing,
  because `readConfig` swallows the `ENOENT` and the sentence still prints. It is refused because the
  `.attw.json` check reads one fixed filename and cannot see a config pointed elsewhere. The refusal is
  **by option name, wholesale, not by value**: a harmless `--format` value blinds nothing and is
  refused anyway, which is the deliberate trade against value-parsing them. Other arguments are
  forwarded, so `--profile node16` still works.
  **The refusal list is NOT a proof of closure, and must never be written as one.**
  `--definitely-typed <tarball>` merges an external types tarball, which makes `analysis.types` truthy
  and suppresses the sentence by a different mechanism. It is deliberately not refused: it is equally
  true of the bare CLI, so it is not a regression, and no exit 0 was obtained through it here. The
  **preflight** is the net that does not depend on reading a string.
  `test/scripts/attw-gate.test.ts` pins both nets against the real binary, **including the upstream
  exit-0 itself**, so an `attw` upgrade that reworks the wording or fixes the exit code reds the
  suite instead of letting the net go quietly slack. It also pins a **negative control** on a
  well-formed package, and that a real `attw` failure still fails: a gate that only ever fails is not
  a gate, and one that swallows the status is not one either.
  **This is a per-repo script.** The fix shipped first in `@cosyte/terminology`; this repo is a port,
  and every sibling that still invokes the CLI directly keeps the false green, including
  `config/scripts/parser-template/`, which new parser repos are minted from, so a port that skips the
  template leaves the defect being re-born. **Do not write the repo count down here**: derive it with
  `/usr/bin/grep -rl '"attw":' --include=package.json --exclude-dir=node_modules .` from the tree
  root. **And do not port the sibling's prose with its code.** Every measured claim above was re-taken
  here, and the first draft of this file shipped two that were not: it repeated the sibling's
  "`--config-path` is refused by inference" while its own test file claimed the opposite, and it
  asserted that "two numbers differ from the sibling" when only one did. Both were caught by the
  refuter grading the port, which is the same failure a sibling port was refuted for. **Exactly one
  figure here differs from the sibling's: the build window** (1,887 ms measured on this package, against
  the 4.95 s recorded for `terminology`). The measured-versus-inferred split now differs too, but
  because it was **re-measured here and moved**, not because the sibling's was wrong: `--config-path`
  is measured on this tree, and `terminology` still records it as inferred.

<a id="disciplines"></a>

## Standing disciplines (every change)

Disciplines 1 to 3 are one line each and stay in `CLAUDE.md`. These two carry the measurements.

<a id="no-internal-refs"></a>

### 4. No internal project bookkeeping on a public surface

4. **No internal project bookkeeping on a public surface** (founder directive, 2026-07-27). What a
   consumer reads (`README.md`, `docs-content/`, the npm `description`, a release body, a JSDoc
   block their editor renders on hover, a message string their log prints) says what the software
   does and what changed. Item identifiers (`ASTM-7`, `REAL-CORPUS`), phase and wave language, ADR
   numbers, meta-repo paths, prose citations of the roadmap and "how this got built" commentary
   belong in the changeset, `CHANGELOG.md`, the commit, the PR and the roadmap. It is a
   **translation** at the boundary, not a deletion, and when you strip an identifier off the front of
   a line, **repair the head**: a fragment reads worse than the text it replaced. Gated by
   `pnpm check:no-internal-refs` (job id `no-internal-refs`, required on `main`).

   **Three source surfaces, three different answers.** `/** */` doc comments compile into
   `dist/index.d.ts` / `.d.cts` and render in a consumer's editor, so they are **gated**, and on
   this repo they were the whole of the backlog. String literals reach a consumer as message text, so
   they are **gated too**. `//` and plain `/* */` comments are **not gated** and identifiers are
   **welcome** in them, because **the convention says source comments are a place identifiers
   belong.** That is the whole reason. **Do not justify this boundary from what reaches `dist/`**:
   two attempts to in a sibling were both false and both caught by a refuter. Measured here: `dist`
   is `files[0]`, there is no `.npmignore`, and `dist/*.map` carries every tracked source byte in
   `sourcesContent`, so **everything in `src/` is in the tarball**. The line is not what reaches a
   consumer's disk (all of it does) but what a consumer is **shown**. Removing a doc comment to
   satisfy the gate is a **regression**, not a fix.

   **The collision that bites hardest here is `phase`, and it is the standard's word, not ours.**
   E1381 / CLSI-LIS01 defines the line's **protocol phase** (establishment, transfer, termination)
   and `LtpState.phase` is an exported field of a published type. Rule 2 carries lookbehinds for all
   of them. Never re-key it on the bare word, and never re-key rule 1 on the `WORD-N` shape: `ASTM-7`
   is ours, but `ASTM-E1394`, `CLSI-LIS01`, `LIS02-A2`, `POCT1-A` and the `SPEC-7` / `ACC-42`
   synthetic ids in every runnable example are the reference material a reader came for.

   **The gate catches identifiers, not English sentences about our process, so the reviewer owns half
   the rule, and that half is where the harm was.** The worst finds on this tree were not
   identifiers at all: the entry point's own doc comment said "Serialize/build is deferred" while the
   serializer was exported, and `AstmMessage` said framing and serialization were still to come while
   both shipped. Stale phase prose does not merely leak process; **it goes false**, and it went false
   in the file every consumer receives. A zero from the gate is not a zero.

<a id="no-emdash"></a>

### 5. No em dash, anywhere

5. **No em dash, anywhere** (founder directive, 2026-07-24; `knowledgebase/06-brand/voice-and-tone.md`).
   U+2014 is banned outright across every cosyte surface, **including commit messages**. Gated by
   `pnpm check:no-emdash` (`.github/workflows/no-emdash.yml`), which scans every tracked file, every
   tracked **filename**, and the gate script itself, plus, on a pull request, the PR title, the PR
   body, and the branch's commit messages, because this repo squash-merges and those three compose
   the message that lands. Rewrite with a comma, a colon, a period, or **parentheses**. **Never re-encode the character**: the gate matches the HTML entity, numeric-entity, URL
   and backslash-u forms as well as the literal. They are spelled out only in `PATTERN` inside
   `scripts/check-no-emdash.sh`, which is the one file excluded from its own scan, because naming
   them anywhere else is itself a violation. This paragraph tripped the gate on its first draft.

   **This repo arrived last and dirtiest.** The gate landed with a sweep of **1,129** occurrences
   across **108 of 142** tracked files, including the published npm `description` and the
   `docs-content/` pages that reach docs.cosyte.com. Four things learned doing it:
   - **An em dash can be a semantic VALUE, and a bulk sweep destroys the meaning.**
     `docs-content/architecture.md`'s layer table used a bare dash in the **Standard** column to mean
     _this layer is governed by no standard_. A rule-based rewrite turned it into a stray colon, so
     the cell read "unstated" instead of "none" on the page whose whole job is honest disclosure, and
     **nothing in CI could have caught it**. The same defect has already shipped in a sibling. Grep
     for the character as a table cell or a list marker and convert those **by hand** first.
   - **Rewriting the warning-registry separator as a colon turned a PHI/value test red.** A colon
     is the **component** delimiter in `test/records/multi-header-delimiters.test.ts`'s fixture, and
     its `[*~:#]` assertion checks that no warning message contains one of that fixture's delimiter
     characters. Every registry message separates with a comma now (the count is not written down here, because it moves with every code that lands). **Do not read that as "a comma
     is safe and a colon is not":** ASTM delimiters self-declare, so any character can be a
     delimiter, and `.`, `/`, `(` and `)` already appear in registry messages. The invariant the
     assertion actually pins is that a warning message is a **constant carrying no field data**,
     which is what makes it value-free. Keep the test.
   - **Do not partition a scan on the NUL byte.** `test/records/parse.test.ts` is a genuine UTF-8
     TypeScript file that embeds a literal NUL in a hostile-bytes fixture, and it held **8** em
     dashes. A NUL-partitioned census missed all eight and reported a total 8 short. Partition on
     **UTF-8 decodability** instead, and never on grep's `-I` heuristic.
   - **The gate is BOUNDED, and the bound is written down rather than implied.** It matches the
     literal codepoint plus the HTML entity, numeric entity, URL and backslash-u spellings. The
     entity and URL arms are case-insensitive; the backslash-u arm is deliberately case-SENSITIVE,
     because no language spells the character with a capital `U` at that length, and a case-blind
     arm there reds an ordinary Windows path instead. It does **not**
     match the ES6 braced escape, it does **not** match a non-UTF-8 encoding (CP1252 `0x97`,
     UTF-16), and the script's own prose can still hold an _encoded_ form, because only the literal
     arm is scanned against itself. All three are accepted, not oversights: the rule is about prose
     people write, and fixture bytes are grounded data. Do not widen the pattern to chase them.
   - **The gate does not run on a Changesets "Version Packages" PR.** GitHub does not start workflow
     runs for `GITHUB_TOKEN`-authored events, so the `pull_request` half never fires there and the
     `push: branches:[main]` half catches a regression _after_ the merge rather than before it. This
     is true of every gate in this repo, not just this one.
   - **`grep` in the dev container is a shell function wrapping ugrep** with `-G --ignore-files -I`
     forced on, and `--ignore-files` honours `.gitignore`, so `dist/` is invisible to it. Measure
     with `/usr/bin/grep`, never a bare one. Both `check-no-emdash.sh` and `check-no-internal-refs.sh`
     `unset -f` it, and `check-no-emdash.sh` additionally carries a **scanner visibility probe** that
     refuses when the scanner reports nothing about a NUL-bearing probe file. `unset` fixes the shim
     we know about; the probe catches the next one nobody has seen. Do not delete either.

<a id="guardrails-shared"></a>

### The shared engineering guardrails, relocated verbatim from `CLAUDE.md` 2026-08-07

Relocated to make room for a trap. They bind here; they are not astm-specific, which is why they
are the ones that moved.

- No `any`. No unjustified `as` casts. Use `unknown` and narrow.
- JSDoc (with `@example`) on every public export: the JSDoc lint rule is an **error** on public
  exports, so this is enforced, not optional.
- Immutable by default. Mutation only via explicit methods.
- No `console.*` in library code. Throw typed errors or return results.
- Short, testable functions over big parsing blobs.
- Postel's Law: parser is liberal (lenient default + warnings), serializer is conservative (always
  emits spec-clean output).
- Fatal errors only for unrecoverable structural corruption (Tier-3 codes). Everything else is a
  warning with a stable code + positional context.
- Coverage: per-directory >= 90% on all four metrics (`pnpm test:coverage`).

<a id="attw-port"></a>

### Relocated verbatim from `CLAUDE.md` 2026-08-07 to make room for a trap

Part of the `attw` gate's trap list; it belongs with `#attw`.

- **Do not port the sibling's prose with its code.** Re-take every measured claim here; a first draft
  shipped two that were not, and the refuter caught both. **Never quote a sibling's timing**: `#attw`
  carries this package's own.

<a id="agent-notes-contract"></a>

## The two-file contract, and why the matcher had to be re-derived here

`scripts/check-agent-notes.ts` checks the contract between `CLAUDE.md` and this file: that every
pointer resolves, that no section a pointer reaches is empty, and that this file stays reachable from
the one every worker reads. The teeth are `test/scripts/agent-notes.test.ts`, so it rides the
required `ci / verify` matrix rather than adding a fourth workflow that would have to be made a
required context separately. Reporting is not gating. **Which contexts are actually required is not
written down**: read it with `gh api repos/cosyte/astm/rulesets`.

**IT ASSERTS NO UNIVERSAL, DELIBERATELY.** The two-file split landed across the cosyte tree, but
several repos carry no `documentation/agent-notes.md` at all, so a gate phrased as "every repo has
these two files" would be an overclaim its own siblings disprove. **No list and no count of those
repos is written here**, because the set moves as repos gain the record. Derive it from the meta-repo
checkout: `for d in $(git submodule status | awk '{print $2}'); do [ -e "$d/documentation/agent-notes.md" ] || echo "$d"; done`.

### The measurement, which is the whole reason this is not a port

**BOTH SIBLING MATCHERS SCORE ZERO ON THIS TREE.** Counted before anything was written, across
every tracked file:

- the **path-qualified** form (this file's full path, then the anchor) that `ccda` and `mllp` write:
  **none**;
- the **basename-qualified** form (this file's basename, then the anchor) that `terminology` writes
  and calls its bare form: **none**;
- a **third spelling neither sibling gate matches**, a backtick-quoted anchor with **no filename at
  all**, resolved by the rule `CLAUDE.md` states in its opening blockquote: **all of them**.

A verbatim port would have reported "all resolving" over a corpus it never opened, which is the
defect this gate class has now produced twice. The count is printed on every run and is deliberately
not written down here. Both sibling forms are matched anyway, so a pointer pasted in from a sibling
is checked from its first day; the **live** form going to zero is a **refusal**, because that is what
the ported-matcher defect looks like from inside. The converse is not: zero of either sibling form is
the normal state here.

**AND THE MATCHER WAS ONLY HALF OF IT. THE ANCHOR SPACE IS NOT GITHUB HEADING SLUGS.** Every
resolving pointer here resolves to an **explicit `<a id>` tag**, and **not one** resolves to a
heading slug: the headings carry long titles with dates and status in them, so their computed slugs
look nothing like the short stable names the pointers use. A gate that accepted only heading slugs,
which is what the siblings check, would have reported **every pointer in this repository as
dangling**. Both kinds are accepted, because both render as link targets on GitHub.

### The vacuity the positive control caught, which no green would have shown

An early draft treated an explicit anchor and the heading it precedes as two separate sections. On
this tree that made the empty-section assertion **vacuous rather than wrong**, which is worse: the
anchor looked like an empty section (its body is the heading line) and the heading looked
unreferenced (no pointer spells its slug), so the pass skipped **both**, and a deliberately emptied
section still printed `OK`. Only a positive control found it.

Measured layout, uniform across every anchor: a bare tag alone on a line, one blank line, then a
heading. **No count is written here** (the run prints one): the first draft of this paragraph said
"36", and the same commit added the thirty-seventh. So an anchor is **not a section**; it is the stable **name** of the section the heading
opens, and the two are bound into one unit. **Prove a matcher non-vacuous with a positive control
before believing any green** is the general form, and this is the local instance of it.

### The one declared non-pointer, and why an unexercised skip refuses

`CLAUDE.md`'s opening blockquote **defines** the pointer syntax, and to define it the sentence has to
spell a pointer-shaped token as a placeholder. It names no section. Nothing structural separates it
from a real pointer, so it is declared in the script as an exact file-and-anchor pair with its
reason, in the same shape `scripts/check-gate-coverage.ts` uses next door: **a disclosure, printed on
every run, not a suppression.** Two rules matter more than the entry, and **the declaration is pinned
to the one occurrence it describes**, so both are refusals:

- **An exemption that matches nothing is a refusal, not a pass.** A skip nobody exercises is how an
  exclusion list goes phantom, the prose describing a thing that no longer exists. Reword the
  placeholder and the gate stops rather than passing.
- **An exemption that matches MORE than its one sentence is also a refusal**, and this one fired
  during the gate's own build. The trap line added to `CLAUDE.md` announcing the gate **spelled the
  placeholder** while describing the pointer form, and the exemption **silently absorbed it**,
  attaching a reason about the opening blockquote to a bullet three hundred lines away. Nothing went
  red. An exclusion that can quietly widen is the phantom defect arriving from the other side. The
  remedy in prose is to **say "a backticked bare anchor" rather than writing one**.

### The defect CI caught that the local run structurally could not

**A LOCAL GREEN BEFORE `git add` MEANS LESS THAN A CI GREEN, AND THIS GATE IS THE SHARPEST CASE OF
IT IN THE REPO.** The corpus is `git ls-files`, so a **new** file is invisible to it until it is
staged. `scripts/verify.sh` ran green on this very change while both new files were still untracked;
CI checked out a tree where they were tracked and went red on both Node versions.

What it found: **the gate's own test file spells pointers in its fixtures**, and being tracked, those
fixtures were scanned against the **real** record exactly as a pointer in `CLAUDE.md` would be. The
run reported **four dangling pointers naming three distinct anchors**, none of which exists in the
record. The gate was right; the test file was wrong.

The remedy is the rule the checker already applies to itself, extended to its test: **build the
pointer, never spell it.** Both files construct pointer strings at run time from a backtick written
as an escape, so neither contains one literally, and a test pins that so a later edit cannot undo it.
**The alternative, exempting those two paths, is the exclusion list this gate refuses to have**, and
it would hide a genuinely broken pointer written in a test.

**The general form, which is this repo's known shape: re-run a corpus-scanning gate AFTER staging,
never only before.** Any check whose corpus comes from the index has it.

### The corpus, the encoding, and what a green does not mean

The corpus is `git ls-files`, **reconciled as sets**: every tracked path is opened or the run
refuses, so a clean run's read count equals the tracked count. **There is no exclusion list, no
binary skip and no NUL skip, and here that is not a style preference:** this repository tracks
**NUL-bearing prose-bearing TypeScript sources, most of them tests**, which a NUL partition would
drop in silence. This repo's own em-dash gate records that hazard. **No count is written here**, for
the reason above. Derive it with `git ls-files -z | xargs -0 grep -laP '\x00'`.

**Two flags in that line are load-bearing and both fail silently.** `-a`: without it grep treats a
NUL-bearing file as binary and prints nothing, so the derivation reads as "none". **`-z` is a
record-separator switch, not a NUL filter**: it makes NUL the separator, so `grep -lz .` matches
every non-empty file and cannot find NUL-bearing ones at all. That second one is the trap, because
`-z` reads like a NUL flag and the sibling `check-no-emdash.sh` uses it for its real purpose.

**EVERY TRACKED FILE IS SCANNED, AND THAT INCLUDES SURFACES THAT LEAVE THE REPO.** A backticked
anchor written into `README.md`, `docs-content/` or a `src/` comment is a live pointer that has to
resolve, and `docs-content/` and `src/` are both tarred **verbatim** into **immutable** release
assets, so a pointer archived there freezes the anchor it names exactly as one in `CHANGELOG.md`
does. They are clean today, so this is latent rather than live, and it is the same mechanism that
made the gate's own test file red. **Reference a section by title on any surface that ships**: the
rule is the surface, not the list, because the list will go stale and the rule will not.

**The encoding rule is one sentence and must not be restated as a list of encodings: a pointer is
matched if and only if the file spells it in ASCII bytes.** A Windows-1252 file is matched, a UTF-16
file is not, and both directions are pinned by test. **UTF-7 IS matched**, because RFC 2152 permits
the `#` directly; a sibling's first draft filed it as unmatched and nearly propagated that.

A green does **not** mean every trap has a pointer (recognising "a trap" is a judgement about prose,
and the class no grep can see is the trap phrased as a **deliberate omission**, which carries no
identifier), nor that a section's prose is accurate or its trap closed. **A pointer is not a
closure.** An unreferenced anchor is legitimate and is reported rather than failed. **Disclosed
rather than guarded:** an anchor inside an HTML comment would be counted here and render nothing on
GitHub; this file contains no HTML comment today, so that is latent rather than live.

**One hazard follows from having no exclusion list: never write a pointer into a changeset summary.**
The summary becomes the `CHANGELOG.md` entry, that file is tracked, and a pointer archived there
freezes the anchor it names forever, because renaming the section would red this gate on a published
record nobody may hand-edit. Reference a section by **title** in a changeset, never by anchor.

<a id="phi-scan-scope"></a>

## The PHI sweep has two halves, and one of them is not the other

Landed 2026-08-07. Every figure below is from this repo, re-derived here; **no sibling's residual
list was ported, and the answer differed from all of them.**

### What the sweep used to read

Roots were `src` and `test/fixtures`, and the walk exempts `.md`. Measured against `git ls-files`:

Measured on `1e16cda`, the commit before this slice, so the figures do not move when the slice adds
files. `T` is `git ls-files`, and the base scope is `src/` plus `test/fixtures/` less `.md`:

| | files | command |
|---|---|---|
| tracked | 165 | `git ls-files \| wc -l` |
| observed by the all-mode walk | 59 | the base scope, above |
| **scanned by NEITHER route** | **106** | `T` less the base scope |
| of those, under `test/` | **66** | `git ls-files test/ \| grep -v ^test/fixtures/` |
| of those 66, containing the two characters `P\|` | **33** | that list, `xargs /usr/bin/grep -l 'P\|'` |
| observed after the widening | **132** | the new scope, less `.md` |

**The 33 is a count of files CONTAINING the two characters, not of files the detector reads.** The
two are different numbers and conflating them is how the first draft of this table said 31: a
detector-shaped count moves with every guard, and a `grep` count does not.

The roots are `WALK_ROOT_NAMES` in `scripts/phi-scan.ts`; they are not written down here, because a
copied list is a second thing to keep true. `docs-content/` is deliberately not one, and the command
that answers what that costs is written beside the roots.

### The half that enumeration does not buy

**Enumerating a file is not reading it.** The record detector splits on newlines and asks whether a
line begins with `P`. This package writes most of its ASTM streams as `.ts` string literals whose
record separator is the two characters `\` and `r`, so every one of them arrived as a single line
beginning with a quote or a space and the detector returned without looking. **That was true inside
`src/` too, which has been a walk root all along:** a JSDoc `@example` carrying a patient name and a
birthdate was read by nobody.

So a second **source-embedded view** decodes the escape sequences a source file uses to embed the
stream, and the detector runs over it **in addition to** the raw bytes. Both halves shipped
together; shipping the roots alone would have bought the SSN/email floor and nothing else.

The delta here is **not** the same as the one a sibling measured by naming the bytes directly:
pointing the base scanner at one of these files by path also exited 0, because the base could not
read the literal either. **Both halves were open in this repo.**

### The anti-fabrication clauses, and why each exists

- **The decode is ONE left-to-right pass and consumes `\\` as a pair.** A chained or global
  substitution rewrites an escaped backslash followed by `r` into a real carriage return, and any
  `P|` after it then begins a line and is reported as a patient the file never contained. Pinned by
  a case that is green on the shipped decoder and **red on a copy with the pair arm removed**.
- **The decoded view runs only on a closed set of SOURCE extensions.** Under the canonical
  declaration the backslash is the **repeat delimiter**, so decoding a `.astm` fixture would splice
  a record boundary into the middle of a repeat. Pinned by a case that is green on the shipped set
  and **red on a copy with `.astm` admitted to it**.
- **A line that merely starts with `P` is not a patient record.** The first run reported four
  patient names out of `check-no-internal-refs.sh`, whose `PROJECT_PREFIXES='A|B|C|...'` alternation
  starts with the letter and separates on the default field delimiter. The guard is the second
  field, taken from **this package's own builder** (`buildPatientLine` writes the sequence number
  there unconditionally) and **not claimed off any clause of any standard**. Its bound: a patient
  record whose second field is not a short digit run is not read.
- **A token still carrying `${` is source syntax, not a value.** The decoded view decodes escapes;
  it does not evaluate expressions. Its bound: **a name assembled at run time is outside this scan**
  and is the reviewer's to read.

### Observation, per root and overall

The scanner had no rule that a sweep observing zero targets must refuse, so a tree with the roots
gone printed `OK: no hits` and exited 0. Now `refuseUnobserved` refuses when **a declared root
observed zero files**, when **the invocation as a whole observed zero**, and when **git tracks
in-scope files under a root that the walk did not observe**.

Both clauses are needed and neither implies the other. A **count** cannot see any of it, because a
count counts the roots that did exist; a per-root **floor of one** cannot see a root emptied of all
but one file, which is what the `git ls-files` reconciliation catches. Cases pin: a missing root, an
**empty** root, a **dangling** link root (`existsSync` follows the link and answers false, so the
walk returns before `readdirSync`), a root that is a **regular file**, a healthy total hiding an
unopened root, and a tracked file gone from the worktree.

**Exit 2, derived from this scanner's own contract** (0 clean, 1 hits, 2 invocation error), not
ported: siblings differ, one exiting 2 and another 1 for the same condition. The regular-file root
previously raised an uncaught `ENOTDIR`, which exits **1**, the one code that means "hits found".

### Two more things this slice changed, and one it did not

- **`REPO_ROOT` is derived from the scanner's own file location, never `process.cwd()`,** and every
  `git` subprocess is pinned to it. Run from a parent checkout the old scanner walked that tree,
  read that tree's allow-list, and reported clean about a package it never opened. Pinned by a
  negative control that runs this package's scanner with its cwd set to another repo.
- **The scanner's own test file composes its violator values rather than writing them.** The sweep
  now reads that file, and its negative corpus is the one place violator shapes legitimately live.
  Composing keeps the floor absolute: **no allow-list entry, no whole-file bypass, nothing
  weakened.**
- **NOT changed, and stated so it is not mistaken for closed: the `--staged` predicate is narrower
  than the walk's roots.** A commit staging only `test/**/*.test.ts` or `scripts/**` is not blocked
  by the pre-commit hook; the widened corpus is caught in CI instead. Widening it decides what a
  **commit** is blocked on rather than what the scanner can see, so it is not a rider on the walk.

### Reconciling path SETS is not reading BYTES (2026-08-11)

The rule above compares **the paths the walk observed against the paths git carries**. That is a
statement about names, and a working tree can satisfy it completely while the bytes git carries say
something else. All mode now reads **the blob behind every index entry**, as a **UNION** with the
walk and never as a replacement: no root was narrowed, no clause dropped, and a file the walk reads
is still read off disk with exactly the views it had. The mechanism is written out **once**, at
`buildTargetsForIndex` in `scripts/phi-scan.ts`; nothing here restates it.

**Four states, each reproduced on the base commit before anything was written, each exiting `0` with
`[phi-scan] OK: no hits` over a synthetic stream carrying a patient name, a mother's maiden name, a
birthdate and a dashed SSN:**

| state | why neither route saw it |
|---|---|
| **decoy content at a tracked path** | the walk read the clean file on disk, and the reconciliation only asked whether a file was *there* |
| **a tracked path outside every walk root** | `WALK_ROOT_NAMES` is three names and the reconciliation only looks **within** them, so it cannot notice a corpus it was never pointed at |
| **a tracked symlink or gitlink outside every walk root** | `walk()` classifies entries **inside** a root; git carries a link's **target path**, itself a PHI surface |
| **an empty index** | every clause of the reconciliation is satisfied for free by having nothing to reconcile against |

**And one state a sibling's list names that was ALREADY closed here, so this route must not be
credited with it: a tracked file absent from the working tree under a declared root.** That is the
second clause of `refuseUnobserved`, which this repo has had since 2026-08-07 and which is stronger
than the reference's per-root floor of one. **The re-derivation mattered: the states this closes
here are not the states it closed there.**

**18 tracked non-markdown files sit outside all three walk roots** in this repo and neither route
had ever opened one. One carried a token the floor fires on: the published contact address in
`package.json`. Already public in every release's registry metadata and **not PHI**, declared as
`EMAILDOMAIN cosyte.com` **with its cost written beside it** (an `EMAILDOMAIN` entry is **global and
route-blind**, so it exempts that domain everywhere, on every route, forever).

**The positive control is the whole point of the slice, not a formality.** A green over a corpus
nobody opened is the defect, so a case showing the scanner passing proves nothing. The committed
control takes **this package's own `package.json`, byte for byte**, puts it at the same
out-of-every-walk-root path in a throwaway tree, and then **strikes the declaration**: the same
corpus reds at exit 1 naming `package.json`. The green is therefore earned by the declaration rather
than by the file never being opened, and a third case shows the base scanner exiting **0** on the
undeclared address, because no route reached the path at all.

**17 cases; 10 are red on a copy of the shipped scanner with the index route removed.** The other
**seven are green on both BY DESIGN** and saying otherwise would be false: the two empty-index cases
(a separate clause, in `main`), the does-not-credit-a-root negative control, the union regression
control (a hit found by the walk is reported **once**, because the byte comparison skips a blob
already scanned), the healthy-tree control, the `--staged`/`paths` scope control, and the premise.
**SEVEN of the ten are red behaviourally; THREE abort on the fragment guard**, because they build
their own base copy with `variantIn` and removing the route moves the fragment out from under them.
**Of those three, two would still fail behaviourally if the guard passed, and exactly ONE would
not** (the case showing the base scanner never opening the manifest, whose whole subject is the base
copy). Recorded at this precision because "ten red" reads as ten behavioural reds, and because an
auditor re-running the mutation the paragraph invites them to run sees three guard aborts rather
than one. **An earlier draft of this sentence said "one", and it was corrected by the pass-2 gate:
the remedy written to close a claim-wider-than-its-measurement finding had grown another one.**

**Two things the pass-1 gate found, both claim defects rather than code defects, both fixed before
the merge, and both worth carrying:**

- **A justification comment asserted a universal about the input space**, the same shape as defect
  17's four inference errors: it said a path the walk never reached "still has the same bytes on
  disk", to explain why the re-staging sentence is withheld for `INDEX_ORIGIN`. False of a path
  deleted or edited in the working tree, reproduced both ways. The **behaviour is right and did not
  change**; the reason did. The true one is that the sweep **never looked**, so it withholds a
  sentence it cannot measure rather than asserting agreement it did not observe.
- **The empty-index refusal fired BEFORE the walk was scanned**, which made the run strictly worse
  than the superseded scanner's for one input: an empty index with a PHI-bearing fixture on disk
  exited **1** naming every locus before, and **2** naming nothing after. `A REFUSAL MUST NOT
  SWALLOW A REAL HIT` is the rule the index route already carried, and it applies to that clause for
  the same reason. It is now refused after the walk loop, hits printed first, exit still 2.

**The five axes that do not transfer, re-derived here rather than ported:**

- **Exit codes.** `0` clean, `1` hits, `2` refusal, unchanged. Every new refusal is an
  `InvocationError` returning 2. A top-level backstop was added because **an uncaught throw exits 1**,
  and 1 is the one code a caller reads as evidence: an allocation failure in the object-store read
  must not impersonate a finding.
- **`--staged` scope.** Deliberately **unchanged**, and the reason is not a red-lock: this repo has
  no mode-blind violator exemption to unscope. It is a **HOOK** decision, because it changes what a
  **commit** is blocked on, and that is a separate slice.
- **EOL normalization.** Does **not** fire here, measured rather than assumed: no `.gitattributes`
  in the tree at all, `core.autocrlf` and `core.eol` both unset, Linux CI. Under `eol=crlf` every
  blob would diverge from its file, so the skip stops firing and every count doubles. **Fail-safe,
  and it must NOT be answered by normalizing before comparing:** that compares a derived form, and a
  decoy differing only in what the normalizer erases would be skipped, which reopens the escape.
- **Gitlinks.** None tracked. **But the index is not uniformly `100644`: THREE entries are
  `100755`**, so narrowing `REGULAR_BLOB_MODES` to `{100644}` would red-lock the repo. The count of
  `100644` entries is deliberately **not** written here: it moves with every commit, including the
  one carrying this sentence, and a figure that is wrong the moment it lands is worse than none.
  Derive both: `git ls-files -s | awk '{print $1}' | sort | uniq -c`. A repo with a real submodule
  cannot use this route unmodified, which is fail-closed and deliberate.
- **Roots and exclusions.** Three roots, `.md` excluded from **both** routes, gitignore **not**
  consulted on the index route (a tracked file git carries is content whatever `.gitignore` says),
  one allow-list addition.

**The `.md` exemption is applied LAST, to readable entries only, and that ordering is a hole rather
than a style point.** It is a **name** exemption, and a name is no evidence at all about what is on
the other side of a link. A tracked symlink named `hidden.md` whose target path names a patient is
refused here; applied first it would have been excused.

**The residual, measured rather than reasoned: working-tree bytes at a path outside every walk root
are read by neither route, whether or not git tracks the path.** The walk reads three declared roots
and this route reads what the **index** carries, so the two miss the same place from opposite sides.
PHI edited into a tracked out-of-root file and left unstaged is not read; an untracked file out
there is not read at all. **Both halves are base-identical**; what is new is that the claim is
written down. Closing it means a third enumeration of the untracked working tree, with its own
refusal semantics, and it is not this.

**One simplification came with it:** `trackedUnder` no longer shells out per root. Two independent
answers to "what does git track" are two things that can disagree about the corpus, so the
reconciliation and the index route now read **one** `git ls-files -s -z`.

<a id="phi-scan-parameters"></a>

## The PHI scanner reduced to parameters, and the three the engine still lacks

Derived 2026-08-11, against `@cosyte/script-utils/phi-scan` **0.0.2**. **Nothing here has shipped.**
The branch carrying it is `phi-scan-adopt-engine` and it is deliberately unmerged: the standing
instruction is that **all process lives in the engine and is parameterized**, and two things this
repo's scanner does are process rather than ASTM vocabulary. This section is the derivation and the
engine ask, written down so the adoption is a re-run rather than a re-derivation.

### The blunt answer: YES, `astm` reduces completely, conditional on three engine parameters

Every one of the 1,823 lines is either the machinery the engine already owns, a value in the tables
below, or one of the three asks in the last subsection. **There is no fourth thing.** The quirk that
looked most likely to resist, ASTM self-declaring its delimiters inside the message, reduces
cleanly, and it reduces *better* than a per-repo hook would: HL7 v2 (`MSH|^~\&`) and X12 (`ISA` at
fixed offsets) are the same shape with different numbers, so one parameter serves three repos.

### The five axes, as data

| axis | value | note |
|---|---|---|
| 1 `exitCodes` | `{ clean: 0, hits: 1, refuse: 2 }` | this repo's own contract. **Never ported in or out.** |
| 2 `scanRoots` | `["."]` | **a widening, not a restatement.** See below. |
| 2 `excludedPaths` | empty | this repo excludes no path: its own scanner test **composes** every violator value rather than writing one. |
| 2 `isWalkReadable` | engine default | the shared `.md` exemption, which is the boundary this scanner already had. |
| 3 `isStagedReadable` | `test/fixtures/**` plus `src/**.ts` | **unchanged, deliberately.** Widening it decides what a **commit** is blocked on: a hook decision, on its own evidence. |
| 4 `regularBlobModes` | engine default | `{100644, 100755}`. **Three tracked entries are `100755`**, so narrowing to `{100644}` red-locks the repo. |
| 5 EOL | no parameter | dedup is BY CONTENT. Checked, not assumed: no `.gitattributes`, `core.autocrlf` and `core.eol` unset, Linux CI. |
| (not an axis) `repoRoot` | the scanner's own file | the engine defaults to `process.cwd()`, and this repo has a pinned negative control against exactly that. **Must be set explicitly.** |

**`scanRoots` must become `["."]`, and it is the one axis whose value CHANGES.** The superseded
scanner declared `["src", "test", "scripts"]` while its hand-written index route read the blob
behind **every** index entry, root or not. The engine does not work that way: its union half, its
index refusals and its `--staged` containment check all key on `isUnderScanRoot`. Measured on this
tree: **18 tracked non-markdown files sit outside those three names**, and they are read today, so
carrying the three names across would have narrowed the corpus while looking like a faithful port.
`["."]` keeps them read, and the engine prunes gitignored directories during descent, so `dist/`,
`coverage/` and `node_modules/` cost nothing.

**Both mandated pre-checks pass, measured against the candidate rather than reasoned:**

- **No root is `./`-prefixed.** `["."]` is the repository root, which the engine normalises to `.`
  and short-circuits, not the `./src` spelling that walks correctly while matching no index path.
  The positive control is that an index-keyed rule still fires: the union half reported a hit at
  `src/fixture.ts (as git carries it)`, so the roots are not silently empty.
- **`isStagedReadable` admits nothing outside `scanRoots`.** With `["."]` nothing can be outside.
  Positive control for the escape itself: a **staged mode-120000 entry** under `test/fixtures/` is
  **refused at exit 2**, not enumerated and read with the link's target path handed to the detector
  as content. The refusal does **not** echo the link target, which is itself a PHI surface.

### The detector, as vocabulary

Records split on `CR` / `LF` / `CRLF`; a record's type is its first character.

**Delimiters, self-declared:** read from the first record whose type letter is `H`. Field separator
is the character at offset 1; the declaration is the slice from offset 2 to the next occurrence of
that field separator, and is used only when it is at least 3 characters; the component separator is
the declaration's second character. Fallback when no `H` declares one: field `|`, component `^`.
**The scanner takes the FIRST declaration only**, where the library re-reads at every `H` and scopes
forward. That gap is pre-existing and is recorded rather than closed here.

**The one record type read, `P`, and its loci:**

| field (1-based) | kind | locus reported | rule |
|---|---|---|---|
| 2 | *structural guard* | (none) | must match `^\d{0,6}$`. A line that merely starts with `P` is not a patient record. |
| 6 | name | `P-6 (name)` | split on the component separator; each token checked against `allow.names`, upper-cased. |
| 7 | name | `P-7 (mother's-maiden)` | as field 6. |
| 8 | dob | `P-8 (dob)` | must match `^\d{4,}$`; compared to `allow.dobs` **verbatim**. |

**Token rules for the name kind:** a token shorter than 2 characters is not read (a bare middle
initial or a bare delimiter, which the escape-alignment fixtures produce; declaring one would exempt
that character repository-wide forever), and a token containing `${` is source syntax rather than a
value.

**Three of the five detector kinds are deliberately absent here: MRN / member id, address, and
phone.** The green is scoped to what is present, and that scoping is written where the scanner
reports it. `ID` entries exist in the allow-list format and are consumed today only by the engine's
own SSN floor.

**Source-embedded view, the only data it needs:** the extension allow-list
`.ts .tsx .js .mjs .cjs .json .py`. **`.astm` is deliberately absent**, and that absence is the
anti-fabrication clause: under the canonical declaration the backslash is the **repeat** delimiter,
so decoding a wire fixture would splice a record boundary into the middle of a repeat and report a
patient name the fixture does not contain.

### The three the engine must grow

**1. Own the source-embedded view.** Nothing about it is ASTM. Every sibling writes its fixtures as
source string literals, so every sibling needs it: decode the escape sequences in ONE left-to-right
pass consuming `\\` as a pair, split additionally on the three quote characters, run the caller's
detector over the result **in addition to** the raw bytes, and dedupe by hit identity. Parameter:
the extension set. **Default it CONSERVATIVELY and never to this repo's set.** `.json` belongs in
`astm`'s allow-list and must **not** be in a shared default, because `fhir`'s **wire format is
JSON** and decoding it is the same fabrication hazard `.astm` is excluded for here.

**2. Give a detector the target's own path.** `DetectContext` carries only the reported LOCUS, so a
union-half target arrives as `<path> (as git carries it)` and `extname` over it answers with the
tail of the origin label. Minimal, additive, non-breaking: a `targetPath` field (and `origin`)
beside `path`. **This is measured, not anticipated.** On a tracked `.ts` whose committed blob
carries a patient name and a birthdate as a string literal and whose working-tree copy is clean, the
superseded scanner exits **1** with three hits and the port onto 0.0.2 prints `[phi-scan] OK: no
hits` at exit **0**. If ask 1 lands, this repo no longer needs it; the gap is generic and worth
closing anyway.

**3. A self-declaring-delimiter reader.** Parameterized by: the declaring record's type letter, the
field-separator offset, the declaration slice bounds, the minimum declaration length, the component
offset within the declaration, and the fallback set. ASTM, HL7 v2 and X12 are the same shape with
different numbers.

### One consequence that will hit all thirteen, and costs one line each

**Adoption breaks every throwaway-repo test harness in the fleet.** `test/scripts/phi-scan.test.ts`
copies `scripts/phi-scan.ts` into a temporary repository and runs it there, which worked while the
scanner was zero-import. It now carries a bare specifier, so the copy dies with
`Cannot find module '@cosyte/script-utils/phi-scan'`. Measured on this branch: **18 failed, 13
passed**, and the 13 that pass are the paths-mode cases that run the scanner in place. **None of the
18 is a detector regression**, which was checked rather than assumed: the two that read like
detector cases fail on the same resolution error. The remedy is one line in the harness (link
`node_modules` into the throwaway root), and it is the same line in all thirteen, so it belongs in
the template rather than in thirteen separate diffs.

**And one design constraint that comes out of this repo's data rather than its code, worth more
than the three asks: the `dob` kind must NOT normalise dates.** It must match a declared regex and
compare to `allow.dobs` **verbatim**. This repo's allow-list carries `2020010`, a deliberately
**truncated 7-digit** synthetic DOB pinning the partial-timestamp fixture. Any engine `dob` kind
that parses a date, or normalises `YYYYMMDD` against `YYYY-MM-DD`, silently drops that declaration
and every fixture behind it.

<a id="gate-coverage"></a>

## `pnpm check`: a local gate run that says what it did not do

Landed 2026-08-07, in the same slice and for the same reason.

The meta-repo's local runner walks a **fixed list of script names** and prints what it ran and what
it skipped. Over this repo that read **12 ran, 14 skipped, and green.** The 14 enumerate as
`gen:all`, `check`, `verify:contrast`, `check:copy-drift`, `check:og-cards`, `brand:check`,
`check:brand-lock`, `check:published-urls`, `check:docs-token-drift`, `test` (deliberate: coverage
runs it), `test:build`, `og:build`, `size`, `verify:exports`. **One was deliberate and the other
thirteen were skipped because the repo defined no such script**, which for a parser repo was correct
for all thirteen, and the runner's own policy expects only `test:coverage`, `build` and `attw`, all
three of which ran. This slice defines `check`, so the same runner now reports **13 ran, 13
skipped.**

**So the 14 are not the defect.** The defect is the class the list cannot show at all: a gate this
repo runs in CI under a name no fixed list has heard of is not skipped, it is **invisible**, because
a name absent from a list is indistinguishable from a repo with no such gate. This repo has two:
the nightly `test:fuzz` job over the two byte-level surfaces, and the `pack:docs` artifact build the
release pipeline runs. Neither carries a `check:`/`verify:` prefix, so the runner's unladdered-script
warning cannot see them either.

`scripts/check-gate-coverage.ts` is derived from **this repo's own files** rather than from any
runner's list, and it is wired to `check` on purpose: that is a name the runner already walks, so
one of the 14 silent skips is now a step that runs and can go red. It asserts that every command
this repo's workflows run is reachable as `pnpm run <script>` or is **declared with the reason it is
not**, that every `run-<x>: true` input passed to a shared pipeline has the `<x>` script the pipeline
will call, and that the two prefix-less gates above still exist. **Every declared-unreachable entry
is printed on every run**, so "a local gate run means less than CI" is a sentence a reader is shown
rather than one they have to derive.

**Its bound, stated so its green is not read as wider than it is:** it asserts nothing about the
SHARED pipelines this repo calls. Their ladders are not in this tree to read, so a gate added there
is outside every check in the file. `grep -h 'uses: cosyte' .github/workflows/*.yml` names what is
delegated.
