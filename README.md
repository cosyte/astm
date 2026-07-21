# @cosyte/astm

> ASTM parser, serializer, and builder for Node.js and TypeScript — **lenient on parse,
> spec-clean on emit**.

`@cosyte/astm` is a zero-dependency TypeScript toolkit that follows the cosyte parser archetype: a lenient
parser that turns real-world, vendor-quirky input into **warnings** rather than failures, paired with
a serializer that always emits spec-clean output (Postel's Law). It mirrors the API shape of the
reference parser, [`@cosyte/hl7`](https://github.com/cosyte/hl7).

> **Status:** pre-alpha (`0.0.x`), not yet published to npm. Phase 1 ships the **record** layer
> (`H`/`P`/`O`/`R`/`L` read, delimiter self-declaration, escape decode); Phase 2 adds **safety-critical
> result semantics** — HL7 Table 0078 abnormal flags, result status (with correction `C` / cancel `X`),
> reference-range parsing, and the units-absent discipline; Phase 3 adds **identity depth, comments, and
> timestamp hardening** — the three distinct patient IDs, mother's maiden name, full order fields, the
> `C` comment record attached by position (orphans surfaced, never dropped), and partial timestamps
> preserved and flagged, never zero-filled. Phase 4 adds the **`Q` request-information record + the
> host-query flow** (a `Q`-bearing message is classified a request, **never** read as a result set) and
> the **`M`/`S` records surfaced verbatim** (vendor QC/calibration data, never interpreted into clinical
> fields) — the **record-content layer is now feature-complete**. Phase 5 adds the **E1381/CLSI-LIS01
> frame codec**: `decodeAstmFrames` decodes a framed byte stream into frames + reassembled record
> bytes, **verifies the modulo-256 checksum** (a bad frame is surfaced untrusted and never merged),
> tracks **frame-number sequencing** (a gap is never silently bridged), and **reassembles** the
> 240-byte-limited multi-frame records; `parseFramedAstm` composes the framing and record layers at the
> edge. Phase 6 adds the **transport layer**: `detectFraming` auto-detects framed (serial / cobas 4800 /
> Iguana) vs raw (cobas b121, framing dropped) streams, and `ltpReduce` is a **pure, socket-free**
> receiver-side `ENQ`/`ACK`/`NAK`/`EOT` state machine whose one rule mirrors `mllp`'s ACK-failsafe — a
> bad-checksum frame is **NAK**ed, never falsely **ACK**ed. Phase 7 adds the **spec-clean serializers +
> builders** — `serializeAstmRecords` / `buildAstmMessage` emit canonical `H|\^&` records (embedded
> delimiters re-escaped, nothing clinical fabricated) and `composeAstmFrames` / `serializeFramedAstm`
> frame them with **computed** checksums + frame numbers and the 240-byte split, so both layers
> round-trip by construction. Phase 8 adds the vendor **profile** system — `defineAstmProfile()` builds
> a provenance-backed profile whose quirk tolerances downgrade _expected_, non-safety-critical
> deviations to a `PROFILE_QUIRK_APPLIED` warning (values are never altered), guarded by a
> definition-time safety gate that refuses to tolerate any result value / flag / status / range /
> units, patient or comment context, message-kind, or frame / LTP integrity warning — a profile can
> never make a bad checksum "ok" or a cancelled result read "final." Named per-vendor profiles are
> deferred pending a public vendor-attributed quirk document. Phase 9 adds **LIVD-aware LOINC
> recognition** — `applyLivd(msg, catalog)` maps an analyzer's local test code to a standard **LOINC**
> from a **consumer-supplied** IICC LIVD catalog (`defineLivdCatalog`), as an **additive, advisory**
> annotation that never mutates the raw code/value and **never guesses a LOINC** (an unmapped or
> ambiguous code surfaces as such). No LOINC / SNOMED / LIVD dictionary is bundled — the package stays a
> structural recognizer, and the consumer brings their own catalog.

## Decode a framed byte stream

```ts
import { decodeAstmFrames, parseFramedAstm, results } from "@cosyte/astm";

// A raw ASTM byte stream off a serial line or socket.
const { records, frames, warnings } = decodeAstmFrames(framedBytes);
frames[0]?.checksum.valid; // the modulo-256 checksum verdict (emitted uppercase, accepted lowercase)
warnings; // ASTM_FRAME_* deviations, each with a frame number + byte offset (never the record bytes)

// Or compose both layers: decode frames → parse the trusted, reassembled records.
const { message } = parseFramedAstm(framedBytes);
results(message)[0]?.value; // only checksum-verified frames ever reach the record parser
```

A checksum mismatch, a sequence gap, an unterminated frame, and an oversize (>240) frame are each a
**warning** in the default lenient mode (surfaced, flagged, never silently trusted) and a thrown
`AstmFrameStrictError` under `{ strict: true }`.

## Drive the transport (framed vs raw) + the LTP protocol

ASTM transport is not uniform: **serial** always frames, but over **TCP it varies within a single
vendor** — the cobas 4800 and Iguana keep the full `ENQ`/`ACK` + `STX`/checksum framing, while the
cobas b121 drops it and streams de-framed record bytes directly. Detect which you have, then drive the
pure protocol reducer with your own socket I/O.

```ts
import {
  detectFraming,
  decodeAstmFrames,
  parseAstmRecords,
  ltpInitialState,
  ltpReduce,
} from "@cosyte/astm";

// 1. Route by the stream's leading byte (STX/ENQ ⇒ framed; a bare record letter ⇒ raw).
const { framing } = detectFraming(leadingBytes); // "framed" | "raw"  (override: { override: "raw" })
if (framing === "raw") {
  // cobas b121 raw-TCP: no handshake, no frames — parse the record bytes directly.
  parseAstmRecords(rawBytes);
}

// 2. Framed transport: drive the pure receiver-side state machine. YOU own the socket + clock.
let state = ltpInitialState();
function onControlOrFrame(event) {
  const { state: next, actions, warnings } = ltpReduce(state, event);
  state = next;
  for (const a of actions) {
    if (a.type === "sendAck") socket.write(Uint8Array.of(0x06)); // ACK  — only ever for a good frame
    if (a.type === "sendNak") socket.write(Uint8Array.of(0x15)); // NAK  — bad checksum ⇒ retransmit
    if (a.type === "deliverRecord") parseAstmRecords(a.record); // a complete, trusted record
  }
  void warnings; // ASTM_LTP_* — value-free (a code + at most a frame number)
}
// Feed events as you read them: { type: "enq" }, { type: "frame", frame: decodeAstmFrames(b).frames[0] }, …
```

The reducer is deterministic and fully testable without a socket. Its inviolable rule: a frame the
codec did not vouch for — bad checksum, unterminated, or out of sequence — yields `sendNak`, **never** a
fabricated `sendAck`, and is **never** appended to a record. A `NAK` drives retransmit, not acceptance.
The interactive contention/timeout/retransmit **timing** is the consumer's — this layer models the
state transitions, not the wall-clock timers.

## Install

```bash
npm install @cosyte/astm
```

## Parse

```ts
import { parseAstmRecords, results, patient } from "@cosyte/astm";

// A de-framed ASTM record stream (CR-delimited records; the header declares the delimiters).
const msg = parseAstmRecords(raw);

results(msg)[0]?.value; // the measured value, surfaced raw
results(msg)[0]?.units; // vendor free-text units (a missing unit is a warning, never a default)
patient(msg)?.practiceAssignedId; // kept distinct from laboratoryAssignedId (the misfiling guard)
msg.warnings; // stable, value-free positional tolerance warnings (never throws on quirks)
```

The parser is **lenient by default** — vendor quirks become warnings, not failures — and refuses to
produce a confident wrong value: an embedded escaped delimiter reads as one component, an unknown
record type is surfaced (never dropped), and a missing unit is flagged (never defaulted). A
`{ strict: true }` mode escalates every tolerated deviation to a thrown error.

## Map local codes to LOINC (LIVD, bring-your-own)

An analyzer sends a proprietary local test code in the Universal Test ID; a standard LOINC is mapped
downstream. Supply your own IICC LIVD ("LOINC to Vendor IVD") catalog and annotate a message — the
mapping is **additive and advisory**: it never touches the raw code or value, and an unmapped or
ambiguous code is surfaced as such, **never a guessed LOINC**.

```ts
import { parseAstmRecords, defineLivdCatalog, applyLivd } from "@cosyte/astm";

// Your LIVD catalog: the vendor transmission code (Vendor Analyte Code) → LOINC.
const catalog = defineLivdCatalog([{ vendorCode: "687", loinc: "1920-8", loincLongName: "AST" }]);

const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
const { annotations, warnings } = applyLivd(msg, catalog);

annotations[0]?.mapping; // { status: "mapped", loinc: "1920-8", loincLongName: "AST", source: "livd", derived: true }
warnings; // ASTM_LIVD_UNMAPPED_CODE / ASTM_LIVD_AMBIGUOUS_MAPPING (value-free) for codes with no single LOINC
```

**No LOINC / SNOMED / LIVD dictionary is bundled.** LOINC is © Regenstrief (redistributable only with
its attribution notice) and the public CDC LIVD file is SARS-CoV-2-specific and carries
separately-licensed SNOMED CT — so the package ships no terminology data and you bring the catalog (and
its license obligations).

> **Scope your catalog to the source device fleet.** The ASTM Universal Test ID carries no manufacturer
> to disambiguate against, so the catalog keys on the vendor transmission code alone. Two different
> instruments that reuse the same code for different analytes would both match — supply a catalog built
> for the analyzers you actually receive from. (Conflicting entries _within_ one catalog are caught and
> surfaced as `ambiguous`, never resolved to a guess.)

## The cosyte parser archetype

- **Postel's Law** — liberal parser (lenient default + warnings), conservative serializer (always
  spec-clean), so quirks don't propagate downstream on round-trip.
- **Tiered tolerance** — Tier 0/1 silent, Tier 2 warning + recovery (escalates in strict mode),
  Tier 3 fatal always.
- **Stable warning codes** — warnings carry stable string codes + positional context; consumers
  branch on `w.code`, so renaming a code is a breaking change.
- **Zero runtime dependencies** — Node stdlib only (healthcare integrations vet every dependency).
- **Dual ESM + CJS** — built with `tsup`, validated with `attw`.
- **Immutability** — parsed models are immutable; mutation is via explicit methods.
- **Profile system** — a `defineAstmProfile()` API for vendor quirks, with built-in profiles authored
  through the same public API. A profile only ever downgrades an _expected_, non-safety-critical warning
  to `PROFILE_QUIRK_APPLIED` (it never alters a value) and may force the raw-vs-framed transport; a
  default-deny safety gate refuses to tolerate any safety-critical deviation at definition time.
- **Terminology recognizer, not a dictionary** — LIVD-aware LOINC recognition is bring-your-own
  (`applyLivd` over a consumer-supplied catalog): additive, advisory, and never a guessed LOINC. No
  LOINC / SNOMED / LIVD data is bundled.

## License

MIT © Cosyte
