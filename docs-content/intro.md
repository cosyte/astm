---
id: intro
title: Getting started
sidebar_position: 1
---

# @cosyte/astm

Parse real-world, vendor-quirky ASTM and pull fields out in one line — without reading the spec.
`@cosyte/astm` is a zero-dependency TypeScript toolkit following the cosyte parser archetype: a lenient
parser, an immutable model, a spec-clean serializer, and a profile system for vendor quirks. It
mirrors the API shape of the reference parser, `@cosyte/hl7`.

> **Status:** pre-alpha (`0.0.x`), not yet published to npm — but **feature-complete** and in release
> hardening. The **record** layer reads `H`/`P`/`O`/`R`/`C`/`Q`/`M`/`S`/`L` with delimiter
> self-declaration and escape decode, safety-critical result semantics, patient/order identity depth,
> the `C` comment record, and host-query classification. The E1381/CLSI-LIS01 **framing** layer
> decodes framed byte streams with a pure LTP transport reducer, the **spec-clean serializers +
> builders** round-trip both layers by construction, the vendor **profile** system tolerates
> documented quirks without ever touching a value, and **LIVD**-aware LOINC recognition maps local
> codes from a bring-your-own catalog. Read [What this library does — and does not do](./limitations)
> before you rely on it: the promise is narrow and honest.

## Install

```bash
npm install @cosyte/astm
```

## Parse a message

```ts
import { parseAstmRecords, results } from "@cosyte/astm";

const msg = parseAstmRecords(raw);

results(msg)[0]?.value; // the measured value, surfaced raw
msg.warnings; // stable, positional tolerance warnings
```

The parser is **lenient by default** — vendor quirks become warnings, not failures (Postel's Law) —
and refuses to produce a confident wrong value. A `{ strict: true }` mode escalates every tolerated
deviation to a thrown error.

## Host-query vs result upload

On many analyzers the host-query mode is first-class (on the Roche cobas 4800 it is mandatory): the
instrument sends an `H/P/Q/L` **request** and the LIS answers with orders. Misreading a query as a
result upload breaks the order flow, so a `Q`-bearing message is classified explicitly — and **never**
read as a result set.

```ts
import { parseAstmRecords } from "@cosyte/astm";

const request = parseAstmRecords("H|\\^&\rP|1\rQ|1|^SPEC-7||ALL\rL|1\r");

request.classification.kind; // => "host-query"
request.classification.isHostQueryRequest; // => true
```

`M` (manufacturer) and `S` (scientific) records — vendor-defined QC / calibration / maintenance data —
are surfaced **verbatim** and never interpreted into clinical fields; their exact wire bytes are on
`record.rawLine`.

## Next

- Read the **API reference** for every export, generated from source.
