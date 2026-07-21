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

### Changed

- **Breaking (pre-alpha):** the archetype stub `parseAstm` / `ParsedAstm` is replaced by
  `parseAstmRecords` / `AstmMessage`; the placeholder `WARNING_CODES` / `FATAL_CODES` entries are
  replaced by the real Phase-1 registries.

### Deferred (later phases)

- **Named per-vendor profiles** (cobas / Sysmex / ADVIA / Mindray / Snibe) stay `REAL-CORPUS`-gated —
  the Phase-8 engine supports them (tolerate + transport override), but no public vendor-attributed
  quirk document grounds a named one; LIVD-aware LOINC recognition (Phase 9), and release hardening
  (Phase 10). The LTP reducer remains a pure state machine — no live I/O: wiring it to a real
  `SerialPort`/`net.Socket` (and the interactive contention/timeout/retransmit **timing**) is a thin
  consumer adapter, and the standard's exact numeric timeouts / retry counts are deferred (we model
  transitions, not timers).

### Deprecated

### Removed

### Fixed

### Security

[Unreleased]: https://github.com/cosyte/astm/commits/main
