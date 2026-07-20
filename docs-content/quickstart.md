---
id: quickstart
title: Quickstart
sidebar_position: 1
---

# Quickstart

Parse a ASTM payload and read the result in a few lines. `@cosyte/astm` is **lenient by default**
(Postel's Law): real-world, vendor-quirky input parses into a value plus a list of tolerance
**warnings**, rather than throwing.

## Parse a payload

```ts runnable
import { parseAstm } from "@cosyte/astm";

// Replace this with a real ASTM message once the parser lands; on clean input the lenient
// parser recovers nothing, so `warnings` is empty.
const { value, warnings } = parseAstm("");

warnings; // => []
```

`parseAstm` always returns a `{ value, warnings }` pair. Each warning carries a **stable code**
you can branch on without it churning between releases:

```ts
import { parseAstm, WARNING_CODES } from "@cosyte/astm";

const { warnings } = parseAstm(raw);

for (const w of warnings) {
  if (w.code === WARNING_CODES.EXAMPLE_TOLERATED_DEVIATION) {
    // handle the tolerated deviation
  }
}
```

> **About runnable examples.** The first block above is tagged ```` ```ts runnable ````: the docs
> build extracts it, runs it against the package, and asserts the `// =>` result — so a documented
> example can never silently drift from the code. Tag a fence `runnable` only once its `// =>`
> assertions match the shipped behavior; leave illustrative fragments as a plain ```` ```ts ```` block.

## Next

- [Core Concepts](./concepts-archetype) — the parser archetype and the tolerance model.
- **API Reference** — every export, generated from source.
