<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://cosyte.com/tile/cosyte-lockup-tile-on-dark-1200x300.png">
  <img alt="Cosyte: a plus mark set in two overlapping rounded squares, one solid and one outlined, beside the Cosyte wordmark" src="https://cosyte.com/tile/cosyte-lockup-tile-on-light-1200x300.png">
</picture>

# @cosyte/astm

> ASTM parser, serializer, and builder for Node.js and TypeScript: **lenient on parse,
> spec-clean on emit**.

`@cosyte/astm` is a zero-dependency TypeScript toolkit that follows the cosyte parser archetype: a lenient
parser that turns real-world, vendor-quirky input into **warnings** rather than failures, paired with
a serializer that always emits spec-clean output (Postel's Law). It mirrors the API shape of the
reference parser, [`@cosyte/hl7`](https://github.com/cosyte/hl7).

> **Status:** published on npm, on the pre-alpha `0.0.x` ladder. Both layers are
> feature-complete, but the public surface can still change within `0.0.x`, before `0.1.0`.

## What it covers

- **Records (E1394 / LIS02-A2).** `H`/`P`/`O`/`R`/`C`/`Q`/`M`/`S`/`L` are read with per-header
  delimiter self-declaration and escape decode, so an escaped delimiter inside a value reads as one
  component. Result semantics are modeled and fail-safe: HL7 Table 0078 abnormal flags, result status
  (a correction `C` or cancel `X` never reads as active-final), reference ranges kept verbatim, and a
  missing unit flagged rather than defaulted. The practice-, laboratory-, and third patient IDs stay
  distinct; a `C` comment attaches to its parent by position and an orphan is surfaced, never dropped;
  a partial timestamp is preserved and flagged, never zero-filled. A `Q`-bearing message is classified
  as a host query and is never read as a result set, and `M`/`S` vendor QC and calibration records are
  surfaced verbatim rather than interpreted into clinical fields.
- **Framing and transport (E1381 / LIS01-A2).** `decodeAstmFrames` turns a framed byte stream into
  frames plus reassembled record bytes: it verifies the modulo-256 checksum (a bad frame is surfaced
  untrusted and never merged), tracks frame-number sequencing (a gap is never silently bridged), and
  reassembles the 240-byte-limited multi-frame records. `detectFraming` routes framed streams (serial,
  cobas 4800, Iguana) from raw ones (cobas b121, framing dropped), and `ltpReduce` is a pure,
  socket-free `ENQ`/`ACK`/`NAK`/`EOT` receiver state machine that NAKs a frame the codec did not vouch
  for rather than fabricating an ACK. `parseFramedAstm` composes both layers at the edge.
- **Emit.** `serializeAstmRecords` and `buildAstmMessage` emit canonical `H|\^&` records with embedded
  delimiters re-escaped and nothing clinical fabricated; `composeAstmFrames` and `serializeFramedAstm`
  frame them with computed checksums, frame numbers, and the 240-byte split. Both layers round-trip by
  construction, and a delimiter set that fails any of the three conditions readback requires (one
  character per separator, no `CR`/`LF`, no two the same) is a typed error rather than bytes written
  and lost.
- **Vendor profiles.** `defineAstmProfile()` builds a provenance-backed profile whose tolerances
  downgrade _expected_, non-safety-critical deviations to a `PROFILE_QUIRK_APPLIED` warning without
  ever altering a value, behind a safety gate that refuses to tolerate any result value, flag,
  status, range, or units warning, any patient or comment context, any message-kind ambiguity, any
  unrecognized record type, and any frame or transport integrity warning. The gate runs when a
  profile is defined **and** again when a warning would be downgraded, so a profile assembled as a
  plain object rather than through `defineAstmProfile()` gets the same answer. A profile can never
  make a bad checksum "ok", a cancelled result read "final", or quiet the warning that says a
  message boundary went unrecognized. Named per-vendor profiles await a public, vendor-attributed
  quirk document.
- **Terminology, bring your own.** `applyLivd(msg, catalog)` maps an analyzer's local test code to a
  LOINC from a consumer-supplied IICC LIVD catalog as an additive, advisory annotation that never
  mutates the raw code or value and never guesses a LOINC. No LOINC, SNOMED, or LIVD dictionary is
  bundled: the package stays a structural recognizer and you bring the catalog.

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
vendor**, the cobas 4800 and Iguana keep the full `ENQ`/`ACK` + `STX`/checksum framing, while the
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
  // cobas b121 raw-TCP: no handshake, no frames, parse the record bytes directly.
  parseAstmRecords(rawBytes);
}

// 2. Framed transport: drive the pure receiver-side state machine. YOU own the socket + clock.
let state = ltpInitialState();
function onControlOrFrame(event) {
  const { state: next, actions, warnings } = ltpReduce(state, event);
  state = next;
  for (const a of actions) {
    if (a.type === "sendAck") socket.write(Uint8Array.of(0x06)); // ACK, only ever for a good frame
    if (a.type === "sendNak") socket.write(Uint8Array.of(0x15)); // NAK, bad checksum ⇒ retransmit
    if (a.type === "deliverRecord") parseAstmRecords(a.record); // a complete, trusted record
  }
  void warnings; // ASTM_LTP_*, value-free (a code + at most a frame number)
}
// Feed events as you read them: { type: "enq" }, { type: "frame", frame: decodeAstmFrames(b).frames[0] }, …
```

The reducer is deterministic and fully testable without a socket. Its inviolable rule: a frame the
codec did not vouch for (bad checksum, unterminated, or out of sequence) yields `sendNak`, **never** a
fabricated `sendAck`, and is **never** appended to a record. A `NAK` drives retransmit, not acceptance.
The interactive contention/timeout/retransmit **timing** is the consumer's: this layer models the
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

The parser is **lenient by default** (vendor quirks become warnings, not failures) and refuses to
produce a confident wrong value: an embedded escaped delimiter reads as one component, an unknown
record type is surfaced (never dropped), and a missing unit is flagged (never defaulted). A
`{ strict: true }` mode escalates every tolerated deviation to a thrown error.

### An unescaped ampersand does not cost you the rest of the record

An escape sequence is the escape character, **one** body character, and the escape character again
(`&F&` `&S&` `&R&` `&E&`). An escape character that heads no such sequence is not an escape: it is
read as the literal character it is, it opens no atom, and `ASTM_UNPAIRED_ESCAPE_CHARACTER` reports
it. So `R|1|^^^687|28.6&|U/L||N||F` reads a value of `28.6&` with units `U/L` and status `final`,
and `O&Brien` in a surname keeps the patient's birth date and sex.

The parser does not decide what the sender meant by the character: it keeps the byte that arrived
and says so. The spec-clean way to send a literal escape character is `&E&`, which is what this
package's serializer emits, so a stream it produced never trips the code. The code is **tolerable**,
so a vendor profile can expect it on a feed that sends bare ampersands and still parse
`{ strict: true }`.

**One escape shape still costs a field boundary, and it is a different code.** A real three-character
sequence is opaque by design, which is what keeps `&F&` one token under a set that names `F` as a
delimiter. So where the body is itself a delimiter (`&|&` under the canonical set) that delimiter
does not split, and every field after it shifts: `R|1|^^^687|28.6&|&U/L||||F` reads a value of
`28.6&|&U/L` with no units and status `unspecified`. It is never silent, but the only report is
`ASTM_UNKNOWN_ESCAPE_SEQUENCE`, which is **tolerable**, so a profile expecting that code (including
the shipped `referenceCorpus`) will let a `{ strict: true }` parse accept it. Narrowing the atom to
close this would break the guarantee the atom exists for, so it is written down rather than papered
over.

### Several messages in one stream

A message runs from its `H` header to its `L` terminator, so a stream can carry several. `messages()`
splits a parsed stream into them, and each entry carries only its own records, so a patient is only
ever paired with the results that message actually carried:

```ts
import { parseAstmRecords, messages } from "@cosyte/astm";

for (const m of messages(parseAstmRecords(raw))) {
  m.patient?.practiceAssignedId; // the P for THIS message
  m.results; // the Rs for THIS message
  m.delimiters; // the set THIS message's records were read with
}
```

The flat accessors above (`patient`, `results`, `orders`, `comments`, `query`) read the whole stream,
so they **throw** `AstmAmbiguousStreamError` on a stream they cannot answer for rather than answering
across patients:

- `ASTM_AMBIGUOUS_MULTI_MESSAGE` from any of the five, when the stream carries more than one message.
- `ASTM_AMBIGUOUS_MULTI_PATIENT` from `patient()` only, when a **single** message carries more than
  one `P` record. "The first `P`" is a guess about whose result it is, so it is refused there too.

**Both are breaking**, and the second one reaches single-message callers: a lone message carrying
several patients used to answer with the first of them. A stream that is one message with at most one
patient is unchanged, and so is a result-only message with no `P` at all, which still answers
`undefined`. `commentsFor()` is unchanged on every stream, because the parent record you hand it
already names the message.

Splitting reads each record's type letter, so check for an `ASTM_RECORD_UNKNOWN_TYPE` warning before
you trust the split. A header the reader does not recognize as a header, one carrying a stray leading
byte for instance, opens no message, and the messages either side of it merge back into one, so a
patient can end up holding results that arrived under a different header. The
parser warns on that record and a `{ strict: true }` parse refuses the stream. That warning is the
only report the merge produces, so a profile is not allowed to tolerate it: the code is refused when
a profile is defined, and a warning carrying it is not downgraded whatever profile is in force. Do
not gate on the warning count, though, because the records that merged in can raise warnings of
their own.

Delimiters are re-read at each header too, so if the unrecognized one declared a different set, the
records after it are read with the previous set and their fields can be lost rather than merely
misfiled. `ASTM_RECORD_FIELDS_UNSEPARATED` reports a record that suffered the total form of that:
the delimiters in force found no field separator in it at all, so the whole line read back as one
field and none of its modeled fields survived. On a result record that is the value, the units and
the status at once, so treat it as a lost result, not a formatting nit. The fields are never
reconstructed, because the set the sender used is unknown and guessing at it would invent data. The
code is safety-critical, and it does not need a mangled header to fire: a lone record written in
another set trips it too.

**Its absence does not certify that a record was read in its own set**, and this is the important
half. The check tests one of the four delimiter roles, the **field** separator, and only in its
total form, where no unescaped separator occurs in the line. Two classes of the same loss sit
outside it:

- A foreign set whose **field** separator happens to occur somewhere in the line still splits, on
  the wrong boundaries and in silence. A single stray `|` in an otherwise `*`-separated result loses
  the value, the units and the status with no warning at all, while the identical record without
  that one byte is reported. This also happens **inside** a run of these warnings, so even a run
  does not mean every record in it was checked.
- A set differing in the **repeat, component or escape** role usually splits into fields normally,
  and the damage then varies. A mis-split component can cost a test identity while the value and
  units survive. The escape role's worst case has **narrowed, not gone**: a bare escape character no
  longer merges the rest of the record (it reads as a literal and raises
  `ASTM_UNPAIRED_ESCAPE_CHARACTER`), but an `&X&` sequence whose body is a delimiter is an opaque
  atom, so that delimiter does not split and the value, the units and the status can still go
  together. That one is reported only by the tolerable `ASTM_UNKNOWN_ESCAPE_SEQUENCE`.

All are accepted limits, for two different reasons: widening the field-separator check would mean
deciding which set a record ought to have had, which is the same guess the parser declines to make
elsewhere, and narrowing the escape atom would break the guarantee it exists for. So they are
written down rather than papered over. Read the warning as "this record definitely lost its
fields", never as "no other record did". If
delimiter drift is a real risk on your feed, parse with `{ strict: true }`, which refuses both an
outright collapse and an unrecognized type letter, and treat `ASTM_RECORD_UNKNOWN_TYPE` as
invalidating what follows it rather than expecting this warning to enumerate the damage.

An unrecognized type letter also makes the message **kind** unknowable, because the letter that
could not be read may have been the very `Q` that decides it. `classification.kind` is
`indeterminate` in that case rather than `results` or `orders`, and `classification.hasUnrecognized`
says why. A `Q` that was read still wins outright.

## Map local codes to LOINC (LIVD, bring-your-own)

An analyzer sends a proprietary local test code in the Universal Test ID; a standard LOINC is mapped
downstream. Supply your own IICC LIVD ("LOINC to Vendor IVD") catalog and annotate a message, the
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
separately-licensed SNOMED CT, so the package ships no terminology data and you bring the catalog (and
its license obligations).

> **Scope your catalog to the source device fleet.** The ASTM Universal Test ID carries no manufacturer
> to disambiguate against, so the catalog keys on the vendor transmission code alone. Two different
> instruments that reuse the same code for different analytes would both match: supply a catalog built
> for the analyzers you actually receive from. (Conflicting entries _within_ one catalog are caught and
> surfaced as `ambiguous`, never resolved to a guess.)

## The cosyte parser archetype

- **Postel's Law**: liberal parser (lenient default + warnings), conservative serializer (always
  spec-clean), so quirks don't propagate downstream on round-trip.
- **Tiered tolerance**: Tier 0/1 silent, Tier 2 warning + recovery (escalates in strict mode),
  Tier 3 fatal always.
- **Stable warning codes**: warnings carry stable string codes + positional context; consumers
  branch on `w.code`, so renaming a code is a breaking change.
- **Zero runtime dependencies**: Node stdlib only (healthcare integrations vet every dependency).
- **Dual ESM + CJS**: built with `tsup`, validated with `attw`.
- **Immutability**: parsed models are immutable; mutation is via explicit methods.
- **Profile system**: a `defineAstmProfile()` API for vendor quirks, with built-in profiles authored
  through the same public API. A profile only ever downgrades an _expected_, non-safety-critical warning
  to `PROFILE_QUIRK_APPLIED` (it never alters a value) and may force the raw-vs-framed transport; a
  default-deny safety gate refuses to tolerate any safety-critical deviation at definition time.
- **Terminology recognizer, not a dictionary.** LIVD-aware LOINC recognition is bring-your-own
  (`applyLivd` over a consumer-supplied catalog): additive, advisory, and never a guessed LOINC. No
  LOINC / SNOMED / LIVD data is bundled.

## License

MIT © Cosyte
