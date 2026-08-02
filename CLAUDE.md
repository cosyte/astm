# @cosyte/astm: Project Guide for Claude

## Project

**`@cosyte/astm`**: a developer-focused ASTM parser + utility library for Node.js/TypeScript,
published under the Cosyte brand. Open-source (MIT). One of the sibling `@cosyte/*` healthcare-standard
parsers that **mirror each other's API**: `@cosyte/hl7` is the reference; this repo deliberately
copies its shape.

**North star (the archetype):** a developer can parse a real-world, vendor-quirky ASTM message
and pull useful fields out in one line, without reading the spec. Liberal on parse (quirks become
warnings), conservative on emit (always spec-clean). See `documentation/conventions.md` →
"The standard parser archetype" in the meta-repo for the full contract this repo must satisfy:
Postel's Law, the tiered tolerance model, stable warning codes, zero runtime deps, dual ESM + CJS,
immutability + explicit mutation, and the profile system.

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

## Status

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
  dropped. **The safety gate is default-deny and total** (`src/profiles/safety.ts`): three benign,
  value-preserving record codes are tolerable (`ASTM_NONSTANDARD_DELIMITERS`,
  `ASTM_UNKNOWN_ESCAPE_SEQUENCE`, `ASTM_RECORD_UNINTERPRETED_QUERY_STATUS`); **every other code
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
  to leave the message partition identical whether or not a profile downgrades it.
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

## Known defects live on `main` (recorded here so they survive independently of any backlog)

1. **CLOSED 2026-07-29 by `ASTM-PATIENT-RESULT-MISATTRIBUTION`**, was: `patient()` and `results()`
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
2. **A record whose type letter is not recognized as `H` re-merges two messages. The SILENCING was
   closed 2026-08-01 by `ASTM-UNKNOWN-RECORD-REMERGE`; the MERGE itself is still open, on purpose.**
   Message grouping keys on the `H` letter, in lockstep with the delimiter scoping, so a header the
   reader does not see as a header (a stray byte before it, for instance) does not open a new
   message: the two messages merge and one message's patient acquires the next message's results.
   `PRE-EXISTING` (reproduces on `b1b46fc`, where the flat accessors misattributed unconditionally).
   **What changed:** `ASTM_RECORD_UNKNOWN_TYPE` was on the profile safety gate's **tolerable**
   allow-list, so a consumer profile tolerating it re-badged the only signal to
   `PROFILE_QUIRK_APPLIED` and `{ strict: true }` then accepted the stream. It is now
   safety-critical, so no definable profile reaches it and a strict parse of a merged stream throws
   whatever profile is in force. Measured, both directions, in
   `test/profiles/unknown-record-type-safety.test.ts`.
   **▶ THE TYPE LETTER HAS A SECOND LOAD-BEARING READER, FOUND WHILE RE-DERIVING THE ALLOW-LIST.**
   `classifyMessage` counts `Q`/`R`/`O` by letter, so an unrecognized `Q` defeats the "`Q` dominates,
   a query is never read as a result set" fail-safe: `H|\^&` + a mangled `Q` + an `R` classifies as
   `kind: "results"`, `isHostQueryRequest` false, and the `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND`
   warning vanishes with the `Q` it was counting. Measured, pinned in the same test file. **Not
   fixed, deliberately**, and it is a different defect from #3 below (that one is per-message
   scoping of a correct fold; this one is the fold reading a letter it could not recognize). Fixing
   it means inferring the intended letter, which is the guess this package declines to make.
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
3. **`msg.classification` is folded over the whole STREAM but documented as per-message.**
   `src/records/types.ts` describes it as the classification of "this message"; `classifyMessage`
   folds every record in the stream, so on a multi-message stream a `Q` in one message reports as
   host-query for all of them (with `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND` when an `R` is also
   present). The dangerous direction is closed (`Q` dominates, so a query never reads as a result
   set) and the over-trigger warns, which is why this is not a stop-the-line. `PRE-EXISTING`.
   `AstmStreamMessage` deliberately carries no `classification`; `classifyMessage(m.records)` derives
   the per-message answer and is documented on `queries`. Found by the `conformance-refuter` grading
   `ASTM-PATIENT-RESULT-MISATTRIBUTION` 2026-07-29.
4. **The parser reads delimiter declarations it cannot reverse, and says nothing.** `readDelimiters`
   checks only that the field separator differs from the other three, so a header declaring `H|^^&`
   (repeat === component) or `H|\&&` (component === escape) parses with **zero warnings**, and the
   resulting set cannot carry a field tree back out, because the boundary between two roles sharing a
   character is unrecoverable. Emit **now refuses** such a set
   (`ASTM_EMIT_INVALID_DELIMITERS`, `ASTM-EMIT-RESIDUALS`), which is what makes the hole visible from
   the outside: `serializeAstmRecords(msg, msg.delimiters)` throws on a message that parsed clean.
   Whether the reader should warn (and under which code) is the open question; it is **parse**-side,
   `PRE-EXISTING`, and was deliberately not folded into the emit slice that surfaced it.
   Found while grading `ASTM-EMIT-RESIDUALS` 2026-07-29.
5. **A delimiter that collides with a record's type letter corrupts the record, and the emit-side
   delimiter check does not catch it.** Emitting with `field: "R"` escapes the `R` record's own type
   letter away (it is just another leaf to `encodeLeaf`), so the line goes out as `&F&R1R…` and
   re-reads as an **unsupported** record, one result in, zero out of `results()`. It passes all
   three emit rules (one char each, no `CR`/`LF`, all distinct), which is why those rules are
   documented as **necessary, not sufficient** rather than as a readback guarantee.
   `PRE-EXISTING`: reproduces byte-identically on `7253098`, before any of `ASTM-EMIT-RESIDUALS`.
   Not fixed there deliberately: the rule that would catch it has to be _derived_ (it is not simply
   "no delimiter may be a type letter", the real condition is that a record's type letter must
   survive emit unescaped), and deriving it inside a slice about two other gaps is how a fix outgrows
   the thing it fixes. Found by the `conformance-refuter` grading `ASTM-EMIT-RESIDUALS` 2026-07-29.
6. **Any raw control character in a _value_ survives record emit and then breaks the frame layer.**
   Emit rejects `CR`/`LF` in a component and nothing else, so a value carrying `STX`/`ETX`/`ETB`
   passes `serializeAstmRecord`, truncates the frame body in `composeAstmFrames`, and makes
   `parseFramedAstm` drop the whole record behind an `ASTM_FRAME_BAD_CHECKSUM`. A warning does fire
   and no value is mis-_read_ (a record is refused, not garbled) which is why this is not a
   stop-the-line. `PRE-EXISTING`; the surplus half of this was closed by `ASTM-EMIT-RESIDUALS`
   (`declarationResidual` drops any control character), the **value** half was not. Found by the
   `conformance-refuter` grading `ASTM-EMIT-RESIDUALS` 2026-07-29.
7. **The frame encoder truncates every character to its low byte, so a non-control character can
   become a frame control byte.** `src/frames/encode.ts` writes `input.charCodeAt(i) & 0xff`, which
   means `U+0102`/`U+0103`/`U+0117` land on the wire as `STX`/`ETX`/`ETB` and `U+010D` as `CR`.
   Framing then breaks: `parseFramedAstm` throws `ASTM_RECORD_NO_HEADER`, or a field is displaced into
   an `unsupported` record. It fails **loudly** in every case measured (a typed error or a warning,
   never a silent mis-read) which is why it is not a stop-the-line. `PRE-EXISTING`: it reproduces on
   base through a _value_, which no emit-side guard touches. Note this is also the limit of
   `ASTM-EMIT-RESIDUALS`'s control-character rule for the header's surplus, which is keyed on the
   character class and therefore cannot see a truncation. **The fix is a byte-level encoder decision
   (refuse a non-Latin-1 code point? encode UTF-8?) and belongs in its own slice.** Found by the
   `conformance-refuter` grading `ASTM-EMIT-RESIDUALS` 2026-07-29.

Two further defects once on this list (the `>3`-char declaration losing its surplus on emit, and
`serializeAstmRecords(msg, d)` not validating a caller-supplied `d`) were recorded with
`ASTM-MIXED-DELIMITER-EMIT` (#21), left again by `ASTM-SECOND-HEADER-COLLAPSE` (#22), and **both
closed by `ASTM-EMIT-RESIDUALS`**: read `CHANGELOG.md` `[Unreleased]` for the dispositions chosen
(preserve the surplus; refuse an unusable set with a typed error) and why.

## Tech Stack (the shared `@cosyte/*` standard)

This repo inherits the canonical toolchain by depending on the published `@cosyte/*` config packages,
not by copying files. The source of truth is the meta-repo's `documentation/conventions.md`: this is
a summary.

- **Language:** TypeScript (strict, full rigor set incl. `noUncheckedIndexedAccess`) via
  `@cosyte/tsconfig`. **Target ES2023**, `NodeNext`. TypeScript 5.9.x, exact-pinned.
- **Build:** dual ESM + CJS + `.d.ts` via `tsup` (`@cosyte/tsup-config`); `attw` is a publish gate
  (per-condition types: `.d.ts` for `import`, `.d.cts` for `require`).
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

## Engineering Guardrails

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
- Coverage: per-directory >= 90% (lines/branches/functions/statements), enforced by
  `pnpm test:coverage`.

## Standing disciplines (every change)

Mirrors the three disciplines in the meta-repo's `documentation/conventions.md`, they bind here too:

1. **Documentation follows code**, a change to the public surface/stack/status isn't done until the
   docs are: this repo's docs content (`README.md`, `docs-content/`), the meta-repo
   `documentation/repos/astm.md` (bump its "last verified" date), and the `ecosystem-map.md`
   status table.
2. **Version + changelog**: a Changeset (`patch` on the `0.0.x` ladder) + a `CHANGELOG.md`
   `[Unreleased]` entry per meaningful change. Renaming a stable warning code is a **breaking change**.
3. **Crew + knowledgebase loop**: if this parser's public API or warning codes change, flag/update
   the matching `crew` healthcare skill + the KB product doc.
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
     characters. All 22 registry messages separate with a comma now. **Do not read that as "a comma
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
