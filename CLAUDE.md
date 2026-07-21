# @cosyte/astm — Project Guide for Claude

## Project

**`@cosyte/astm`** — a developer-focused ASTM parser + utility library for Node.js/TypeScript,
published under the Cosyte brand. Open-source (MIT). One of the sibling `@cosyte/*` healthcare-standard
parsers that **mirror each other's API** — `@cosyte/hl7` is the reference; this repo deliberately
copies its shape.

**North star (the archetype):** a developer can parse a real-world, vendor-quirky ASTM message
and pull useful fields out in one line — without reading the spec. Liberal on parse (quirks become
warnings), conservative on emit (always spec-clean). See `documentation/conventions.md` →
"The standard parser archetype" in the meta-repo for the full contract this repo must satisfy:
Postel's Law, the tiered tolerance model, stable warning codes, zero runtime deps, dual ESM + CJS,
immutability + explicit mutation, and the profile system.

## Status

- **Phase 7 shipped (ASTM-7): spec-clean serializers + builders — both layers now round-trip by
  construction.** `src/records/serialize.ts` + `src/records/build.ts` are the conservative inverse of the
  record parser; `src/frames/encode.ts` is the inverse of the frame codec; `serializeFramedAstm`
  composes both emit layers at the edge (the mirror of `parseFramedAstm`). **Record emit:**
  `serializeAstmRecords(msg | records)` / `serializeAstmRecord(record)` emit a `CR`-terminated stream
  with the **canonical** `H|\^&` delimiters (a non-canonical source is normalized — vendor-delimiter
  round-tripping is a Phase-8 profile concern), re-escaping every embedded `|`/`^`/`\`/`&` via
  `encodeComponent` (the exact inverse of the P1 escape codec — escape char first, then the three
  delimiters). The header's delimiter declaration is emitted **literally** (never escaped) and its data
  fields are reconstructed from `HeaderRecord.rawLine` (new additive field — the escape char living
  inside the `\^&` definition defeats the generic escape-aware tokenizer, so the raw header is the
  reliable source); `M`/`S` are re-emitted **byte-identically** from `rawLine`. **Frame emit:**
  `composeAstmFrames(records, opts?)` frames reassembled record bytes into `<STX> FN text <ETB|ETX> CS
<CR><LF>` — the modulo-256 checksum and the `0`–`7` frame number are **computed, never faked**;
  frame numbers run continuously (start `1`, roll over `7 → 0`); a record over **240** bytes is split
  `ETB…ETB…ETX`. **Never-fabricate discipline:** a builder emits only supplied values (an omitted result
  status reads back `unspecified`, never `final`; units/flags/IDs are never defaulted) — structure
  (record types, delimiters, per-type seq counters, the `L` terminator) is computed, not guessed. Two
  typed emit errors guard framing integrity: `AstmSerializeError` (`ASTM_EMIT_UNENCODABLE_VALUE` — a
  `CR`/`LF` in a value cannot be escaped) and `AstmFrameEncodeError` (`ASTM_FRAME_EMPTY_RECORD` — an
  empty record/list is never an empty frame). Round-trip is proven: the archetype `roundTripProperty`
  is live (serialize is the idempotent inverse of parse), Tier-3 golden files round-trip every synthetic
  fixture through both layers, and `decodeAstmFrames(composeAstmFrames(x)) ≡ x`. New exports:
  `serializeAstmRecords`, `serializeAstmRecord`, `serializeField`, `encodeComponent`, `AstmSerializeError`,
  `buildAstmMessage` (+ the `*Input` types), `composeAstmFrames`, `AstmFrameEncodeError`,
  `ComposeFramesOptions`, `serializeFramedAstm`. **Deferred:** the vendor profile system (P8), LIVD
  terminology (P9), release hardening (P10); and, as before, the socket/serial adapter + numeric
  timeout/retry timing (we model transitions, not timers).
- **Phase 6 shipped (ASTM-6): transport variants + the pure LTP protocol reducer — the framing layer is
  now feature-complete for decode.** `src/ltp/` sits above the frame codec with two pieces, no live I/O.
  `detectFraming(bytes, opts?)` auto-detects the transport reality from the leading byte: `STX`/`ENQ` ⇒
  **framed** (serial, and cobas 4800 / Iguana framed-over-TCP); a bare record letter ⇒ **raw** (cobas
  b121 raw-TCP, framing dropped); an unrecognizable lead **defaults to framed and warns**
  (`ASTM_LTP_AMBIGUOUS_TRANSPORT`), with an `override` for a Phase-8 profile — never a silent guess into
  data loss. `ltpReduce(state, event)` is a **pure, socket-free** receiver-side state machine
  (`ltpInitialState()` seeds it) over `enq`/`ack`/`nak`/`eot` + a codec-decoded `frame`, returning
  `{ state, actions, warnings }` — actions `sendAck`/`sendNak`/`sendEot`/`deliverRecord`; the consumer
  owns the wire and clock. It models LIS01-A2 establishment → transfer → termination as `neutral ⇄
transfer`, reassembles `ETB…ETX` runs, and tracks the `0`–`7` sequence. **ACK-failsafe (borrowed from
  `mllp`):** a frame the codec did not vouch for — bad checksum, unterminated, or out of sequence — is
  `NAK`ed, **never** a fabricated positive `ACK`, and **never** appended/delivered; a `NAK` drives
  retransmit, not acceptance (`ASTM_LTP_FRAME_REJECTED`). Duplicate frames are idempotently re-`ACK`ed;
  a partial record open at `EOT`/`ENQ`-restart is discarded, never delivered. A **third** warning
  registry `ASTM_LTP_*` (value-free — a code + at most a frame number). Properties: never `ACK` after an
  untrusted frame; a full `ENQ → frames → EOT` session reassembles exactly the source records; a raw-TCP
  stream equals its framed twin. **Deferred:** serialize/build (P7); the socket/serial adapter + exact
  numeric timeout/retry timing (we model transitions, not timers — open question §10).
- **Phase 5 shipped (ASTM-5): the E1381/CLSI-LIS01 frame codec — the low-level framing layer begins.**
  `src/frames/` decodes a framed byte stream (`<STX> FN text <ETB|ETX> CS <CR><LF>`) via
  `decodeAstmFrames(bytes, opts?)` → `{ records, frames, warnings }`: it verifies the **modulo-256
  checksum** (span = the byte after `STX` through the `ETB`/`ETX` terminator inclusive; emitted
  uppercase, **accepted lowercase**), tracks **frame-number `0`–`7` sequencing** (rolls over, starts at
  `1`), and **reassembles** the **240**-byte-limited multi-frame records (the 7 control bytes are not
  counted; `ETB` intermediate / `ETX` final). `parseFramedAstm` composes the two layers at the edge.
  **Fail-safe (byte-level):** a bad checksum → frame flagged `trusted: false`, **never merged** into a
  record (warn in lenient / thrown in strict — validation is real, the "checksums not validated" claim
  was refuted); a frame-number gap → warn, **never silently bridged**; an unterminated frame → warn,
  **no partial record invented**; an oversize (>240) frame → warn, never dropped. A second warning
  registry `ASTM_FRAME_*` (sharing only `EMPTY_INPUT` with the record layer; snapshot locked) —
  `ASTM_FRAME_BAD_CHECKSUM` / `ASTM_FRAME_SEQUENCE_GAP` / `ASTM_FRAME_UNTERMINATED` /
  `ASTM_FRAME_OVERSIZE`, every warning **value-free** (frame number + byte offset only). A **required
  `fast-check` fuzz gate** over the codec runs under `verify`. (The interactive LTP reducer
  (`ENQ`/`ACK`/`NAK`/`EOT`) shipped in P6, above; serialize/build is P7 — the codec decodes byte streams
  only, no live I/O.)
- **Phase 4 shipped (ASTM-4): query + host-query flow + `M`/`S` verbatim — the record-content layer is
  now feature-complete.** Pre-alpha `0.0.x`, not yet published to npm. `parseAstmRecords` reads
  `H`/`P`/`O`/`R`/`C`/`Q`/`M`/`S`/`L` with delimiter self-declaration and the escape codec (P1); the `R`
  record carries modeled, fail-safe result semantics alongside the raw fields (P2) — `flag` (HL7 Table
  0078, `undefined` never coerced to normal), `status` (a `C`/`X` never reads as active-final; absent →
  `unspecified`), and `range` (bounds verbatim). P3 adds full patient identity (the practice/lab/third
  IDs stay **distinct**, plus mother's maiden name), full order fields (priority/action/report,
  `[OSS-derived]` indices), the `C` **comment** record attached by position to its preceding
  `H`/`P`/`O`/`R` parent (an orphan → message root + `ASTM_RECORD_ORPHAN_COMMENT`, never dropped), and
  partial-timestamp hardening. P4 adds the `Q` **Request Information** record (starting/ending range ID +
  Universal Test ID + request-info status, all surfaced verbatim — the range structure, `ALL` keyword,
  and status code set are `[OSS-derived / paywalled]`, never guessed), the **host-query flow**
  (`msg.classification`: a `Q`-bearing message is a `host-query` request and is **never** read as a
  result set — the `Q` dominates, `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND` flags a `Q`+`R` contradiction),
  and `M`/`S` records surfaced **verbatim** (`record.rawLine`, byte-identical) — never interpreted into
  clinical fields. `src/common/` holds the value layer, `src/records/` the record layer. Deferred to
  later phases: the E1381 **framing** layer (P5+) and serialize/build (P7). The full sequence is in the
  meta-repo roadmap `operations/roadmaps/astm.md`.

## Tech Stack (the shared `@cosyte/*` standard)

This repo inherits the canonical toolchain by depending on the published `@cosyte/*` config packages,
not by copying files. The source of truth is the meta-repo's `documentation/conventions.md` — this is
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
  immutability, warning-code stability) — the format-specific arbitraries stay in this repo.
- **CI/CD:** thin callers of the reusable `cosyte/.github` workflows.
- **Runtime deps:** **Zero.** Node stdlib only.
- **License:** MIT.

## Engineering Guardrails

- No `any`. No unjustified `as` casts. Use `unknown` and narrow.
- JSDoc (with `@example`) on every public export — the JSDoc lint rule is an **error** on public
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

Mirrors the three disciplines in the meta-repo's `documentation/conventions.md` — they bind here too:

1. **Documentation follows code** — a change to the public surface/stack/status isn't done until the
   docs are: this repo's docs content (`README.md`, `docs-content/`), the meta-repo
   `documentation/repos/astm.md` (bump its "last verified" date), and the `ecosystem-map.md`
   status table.
2. **Version + changelog** — a Changeset (`patch` on the `0.0.x` ladder) + a `CHANGELOG.md`
   `[Unreleased]` entry per meaningful change. Renaming a stable warning code is a **breaking change**.
3. **Crew + knowledgebase loop** — if this parser's public API or warning codes change, flag/update
   the matching `crew` healthcare skill + the KB product doc.
