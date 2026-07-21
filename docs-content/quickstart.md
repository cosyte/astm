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

## Next

- [Core Concepts](./concepts-archetype) — the parser archetype and the tolerance model.
- **API Reference** — every export, generated from source.
