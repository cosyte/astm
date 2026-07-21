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

> **Status:** pre-alpha (`0.0.x`), not yet published to npm. The **record** layer reads
> `H`/`P`/`O`/`R`/`C`/`L` with delimiter self-declaration and escape decode (Phase 1), models
> safety-critical result semantics (Phase 2), and models patient/order identity depth, the `C` comment
> record attached by position, and partial-timestamp hardening (Phase 3). The E1381 framing layer and
> the serializer land in subsequent phases.

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

## Next

- Read the **API reference** for every export, generated from source.
