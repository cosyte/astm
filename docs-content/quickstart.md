---
id: quickstart
title: Quickstart
sidebar_position: 1
---

# Quickstart

Parse an ASTM/CLSI-LIS02 record stream and read a result in a few lines. `@cosyte/astm` is **lenient
by default** (Postel's Law): real-world, vendor-quirky input parses into an immutable message plus a
list of tolerance **warnings**, rather than throwing — and it never hands you a confident wrong value.

## Parse a result upload

```ts runnable
import { parseAstmRecords, results } from "@cosyte/astm";

// A de-framed ASTM record stream: header (declares the delimiters) + patient + order + result + end.
const raw = "H|\\^&\rP|1|PRAC|LAB\rO|1|ACC\rR|1|^^^687|28.6|U/L||N||F\rL|1|N\r";
const msg = parseAstmRecords(raw);

const first = results(msg)[0];
first?.value; // => "28.6"
```

`parseAstmRecords` reads the four delimiters **from the header** (never hardcoded), decodes embedded
escapes before splitting a value, and keeps the practice- and laboratory-assigned patient IDs
distinct. Each warning carries a **stable code** you can branch on:

```ts
import { parseAstmRecords, WARNING_CODES } from "@cosyte/astm";

const { warnings } = parseAstmRecords(raw);

for (const w of warnings) {
  if (w.code === WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE) {
    // an unrecognized record was surfaced as an unsupported record, not dropped
  }
}
```

> **About runnable examples.** The first block above is tagged ```` ```ts runnable ````: the docs
> build extracts it, runs it against the package, and asserts the `// =>` result — so a documented
> example can never silently drift from the code.

## Read a result safely — status, flag, range

A result carries the raw fields **and** a modeled, fail-safe view alongside them. The rule is *never
a confident wrong value*: a corrected or cancelled result never reads as active-final, an unrecognized
abnormal flag is never coerced to "normal", and an unparseable reference range never fabricates a
bound.

```ts runnable
import { parseAstmRecords, results } from "@cosyte/astm";

// A correction (status `C`) that supersedes a previously transmitted value.
const raw = "H|\\^&\rO|1|ACC\rR|1|^^^687|30.1|U/L|10-40|H||C\rL|1|N\r";
const r = results(parseAstmRecords(raw))[0];

r?.status.meaning; // => "correction"
```

The `status` object is **always present** (an absent status field is typed `unspecified`, never
assumed `final`), so `status.isActiveFinal` is a reliable boolean — `true` only for a plain `F`:

```ts
import { parseAstmRecords, results } from "@cosyte/astm";

const r = results(parseAstmRecords(raw))[0];

r?.status.isActiveFinal; // false — a correction is not active-final
r?.status.supersedes; // true — this value replaces a prior one
r?.flag?.meaning; // "above-normal" (HL7 Table 0078); an unknown flag → "undefined", never "normal"
r?.range?.kind; // "closed" (low "10", high "40"); an unparseable range → "unparsed", no invented bound
```

> Units are vendor **free text**, never UCUM. A *numeric* result value with no units raises an
> `ASTM_RECORD_UNITS_ABSENT` warning — a missing unit is flagged, never defaulted, guessed, or
> converted. The reference-range delimiter is `[OSS-derived]` (roadmap open question); anything that
> does not match `low-high` / `<high` / `>low` is surfaced verbatim.

## Tell a query apart from a result upload

A `Q` (request-information) record means the message is a **host-query request**, not a result set —
so it must never be read as one. `parseAstmRecords` classifies every message up front; gate on
`classification.isHostQueryRequest` before treating records as results.

```ts runnable
import { parseAstmRecords, query } from "@cosyte/astm";

// An H/P/Q/L host-query request asking for all tests on a specimen.
const raw = "H|\\^&\rP|1\rQ|1|^SPEC-7|^SPEC-7|ALL\rL|1\r";
const msg = parseAstmRecords(raw);

msg.classification.kind; // => "host-query"
```

The `Q` **dominates**: even a message that (anomalously) carries both a `Q` and an `R` is classified
`host-query` and flagged — a query is never silently read as a result upload. The `Q` record's range
IDs, the `ALL` keyword, and the request-information status codes are surfaced **verbatim** and flagged
`[OSS-derived]` (their exact structure is paywalled — see the roadmap), never guessed.

`M` (manufacturer) and `S` (scientific) records carry vendor-defined QC / calibration / maintenance
data. They are surfaced **verbatim** on `record.rawLine` and **never** interpreted into clinical
fields — a QC value must not be read as a patient result.

## Decode a framed byte stream

The record examples above assume **de-framed** record bytes. When you receive a raw ASTM byte stream
straight off a serial line or socket, it arrives wrapped in **E1381/CLSI-LIS01 frames** —
`<STX> FN text <ETB|ETX> CS <CR><LF>` — with a modulo-256 checksum and a frame number. `decodeAstmFrames`
verifies each checksum, tracks the frame-number sequence, and reassembles multi-frame records; a
bad-checksum frame is surfaced **flagged untrusted and never merged**, and a sequence gap is **never
silently bridged**.

```ts runnable
import { decodeAstmFrames } from "@cosyte/astm";

// One final (ETX) frame carrying the record text "L|1\r", with its correct checksum "3A".
const bytes = new Uint8Array([0x02, 0x31, 0x4c, 0x7c, 0x31, 0x0d, 0x03, 0x33, 0x41, 0x0d, 0x0a]);
const { frames } = decodeAstmFrames(bytes);

frames[0]?.checksum.valid; // => true
```

`parseFramedAstm` composes the two layers at the edge — decode the frames, then parse the trusted,
reassembled records into a message in one call. Only frames the framing layer vouched for reach the
record parser, so a corrupted frame can never become a confident wrong value:

```ts
import { parseFramedAstm, results } from "@cosyte/astm";

const { message, frames, frameWarnings } = parseFramedAstm(framedBytes);

frameWarnings; // bad checksum / sequence gap / unterminated / oversize — each with a frame number + offset
results(message)[0]?.value; // parsed from the reassembled, checksum-verified record bytes
```

> A checksum mismatch is a **warning** in the default lenient mode (the frame is kept for audit,
> flagged `trusted: false`, and excluded from `records`) and a thrown `AstmFrameStrictError` under
> `{ strict: true }`. The checksum is emitted uppercase but **accepted lowercase** — a real-vendor
> quirk. Frame warnings carry only a **frame number + byte offset**, never the record bytes.

## Serialize and build (emit)

Emit is the conservative inverse of parse. `serializeAstmRecords` turns a parsed
message back into a spec-clean, `CR`-terminated stream — always the **canonical**
`H|\^&` delimiters, every embedded delimiter re-escaped — so it round-trips:

```ts runnable
import { parseAstmRecords, serializeAstmRecords } from "@cosyte/astm";

const raw = "H|\\^&\rP|1|PRAC|LAB\rR|1|^^^687|28.6|U/L||N||F\rL|1\r";
serializeAstmRecords(parseAstmRecords(raw)); // => "H|\\^&\rP|1|PRAC|LAB\rR|1|^^^687|28.6|U/L||N||F\rL|1\r"
```

`buildAstmMessage` constructs a spec-clean stream from typed input — and **never
fabricates**. It emits only the values you supply; an omitted field stays empty,
never a defaulted clinical value. A result whose status you did not set reads back
as `unspecified`, never `final`:

```ts runnable
import { buildAstmMessage, parseAstmRecords, results } from "@cosyte/astm";

const raw = buildAstmMessage({
  records: [{ type: "R", universalTestId: ["", "", "", "687"], value: "28.6", units: "U/L" }],
});

results(parseAstmRecords(raw))[0]?.status.meaning; // => "unspecified"
```

Every value is escape-encoded on emit, so an embedded delimiter can never break
framing — a titre `1^40` is emitted as `1&S&40` and reads back as one component. A
value carrying a `CR`/`LF` (which no escape can encode) is refused with a typed
`AstmSerializeError` rather than a corrupted wire.

## Frame it for the wire

`composeAstmFrames` is the inverse of `decodeAstmFrames`: it wraps reassembled
record bytes into `<STX> FN text <ETB|ETX> CS <CR><LF>` frames, **computing** each
modulo-256 checksum and frame number and splitting any record over 240 bytes —
never faking either. `serializeFramedAstm` composes both emit layers at the edge:

```ts runnable
import { parseAstmRecords, serializeFramedAstm, parseFramedAstm, results } from "@cosyte/astm";

const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
const bytes = serializeFramedAstm(msg); // spec-clean framed stream

results(parseFramedAstm(bytes).message)[0]?.value; // => "28.6"
```

## Next

- [Core Concepts](./concepts-archetype) — the parser archetype and the tolerance model.
- **API Reference** — every export, generated from source.
