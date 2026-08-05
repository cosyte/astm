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

**▶ "ESCAPE-CLEAN" IS DEFINED WITHOUT THE ALIGNMENT CODE, DELIBERATELY, AND THAT IS WHAT MAKES THE
ZERO A MEASUREMENT.** It is the absence of `ASTM_UNKNOWN_ESCAPE_SEQUENCE`,
`ASTM_UNPAIRED_ESCAPE_CHARACTER` and `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`, and **not** of
`ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT`. Folding the alignment code in would make "no escape-clean
tuple is reported today" the shipped criterion agreeing with itself: unfailable by construction, in
a file whose entire lesson is that a structurally forced zero certifies nothing. The population is
the same 96 tuples either way, measured, so nothing is bought by the shortcut and the independence
is free. **Escape-clean says nothing about the decoded value**, which legitimately carries the
literal delimiter a sequence stood for: `&F&` decoding to the field separator is the mechanism
working, not a residue of it.

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
status **`final`**; the competing alignment hands back no units and status `unspecified`. The only
warning either way is the tolerable `ASTM_UNPAIRED_ESCAPE_CHARACTER`, so the widest gate-legal
profile accepts it. **A fabricated `final` on a result is the harm this repo exists to prevent.** The
entry above lists that `final` among the values read, which is why nobody noticed it is a
**consequence of the ambiguity** rather than something the sender wrote in that slot: the competing
alignment of the same bytes puts no status there at all. Running only the reading taken cannot show
that, and nothing had run the other one.

**▶ (b) DOES NOT COST THE UNITS OR THE STATUS, AND SAYING SO WAS AN ATTRIBUTION ERROR.** Under
`H|F^&` the contested delimiter is the **repeat** role, so the gained boundary cannot shift a field.
Measured, on `R|1|^^^687|28.6&S&F&U/L||||F`: **both** alignments read **8** fields, and under both
the units slot is empty and the status is `unspecified`, because that record has eight fields and
neither slot is one of them. The absence was decided by the record's own shape, not by the
alignment. **What the gained boundary does cost is the VALUE**: the reading taken splits the value
field into the two repeats `28.6^` and `&U/L`, every value extractor reads the first, and `&U/L`
leaves the result entirely, while the competing alignment reads one repeat carrying all of it. That
is a real silent loss and it is the thing a future criterion has to be validated against. Both
statements are now pinned in `test/records/alignment-criterion-population.test.ts`.

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
