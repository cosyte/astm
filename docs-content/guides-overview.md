---
id: guides-overview
title: Guides
sidebar_position: 1
---

# Guides

Task-oriented recipes ("how do I X?") for `@cosyte/astm`. Each is a short, copy-pasteable answer to
one real integration question. For a guided first read, start with the [Quickstart](./quickstart); for
the boundaries of what the library promises, read [What it does, and does not do](./limitations).

## Tell a corrected or cancelled result apart from a final one

A result's `status` is **always present** and fail-safe: a correction (`C`) or cancel (`X`) never
reads as active-final, and an absent status is `unspecified`, never assumed `final`. Gate on it before
you treat a value as current:

```ts runnable
import { parseAstmRecords, results } from "@cosyte/astm";

const raw = "H|\\^&\rO|1|ACC\rR|1|^^^687|30.1|U/L|10-40|H||C\rL|1\r";
const r = results(parseAstmRecords(raw))[0];

r?.status.isActiveFinal; // => false
```

`status.supersedes` is `true` for a correction (this value replaces a prior one): branch on it to
decide what to store, and never let a superseded value read as current.

## Fail fast at an integration boundary

The parser is lenient by default. When you want a tolerated deviation to be a hard error instead
(at the edge of your system, before bad data flows in), re-parse with `{ strict: true }`:

```ts
import { parseAstmRecords, AstmStrictError } from "@cosyte/astm";

try {
  parseAstmRecords(raw, { strict: true });
} catch (err) {
  if (err instanceof AstmStrictError) {
    // err.warnings holds every deviation that would have been tolerated in lenient mode
  }
}
```

## Branch on a specific vendor quirk

Every tolerated deviation is a warning with a **stable code**. Match on `WARNING_CODES` to decide
whether to tolerate, log, or reject a specific quirk, the code is part of the public contract, so
this branch will not silently drift:

```ts
import { parseAstmRecords, WARNING_CODES } from "@cosyte/astm";

const { warnings } = parseAstmRecords(raw);

for (const w of warnings) {
  if (w.code === WARNING_CODES.ASTM_RECORD_UNITS_ABSENT) {
    // a numeric result arrived without units: flag it for review, never default the unit
  }
}
```

## Decode a stream when you do not know if it is framed

Serial is always framed; over TCP some vendors keep framing and some drop it. `detectFraming` reads
the leading byte and defaults to **framed** on an ambiguous lead (never a silent guess), and a profile
can force the transport when you know the vendor:

```ts
import { detectFraming } from "@cosyte/astm";

const { framing, defaulted, warnings } = detectFraming(bytes);
// framing: "framed" | "raw". An ambiguous lead → framing "framed", defaulted true,
// and one ASTM_LTP_AMBIGUOUS_TRANSPORT warning. Pass { override: "raw" } to force it.
```

## Map a local test code to LOINC

Analyzers transmit a proprietary **local** code; LOINC is mapped downstream. Supply your own IICC LIVD
catalog and `applyLivd` annotates the message **additively**, it never touches the raw code or value
and never guesses a LOINC:

```ts runnable
import { parseAstmRecords, defineLivdCatalog, applyLivd } from "@cosyte/astm";

const catalog = defineLivdCatalog([{ vendorCode: "687", loinc: "1920-8", loincLongName: "AST" }], {
  publisher: "Example Diagnostics",
  publicationVersion: "LIVD-2026-01-A",
  loincVersion: "2.78",
  loincCopyright:
    "This content LOINC® is copyright © 1995 Regenstrief Institute, Inc. and the LOINC Committee, and available at no cost under the license at http://loinc.org/terms-of-use",
});
const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
const annotation = applyLivd(msg, catalog).annotations[0];

annotation?.mapping.status; // => "mapped"
annotation?.catalogLoincVersion; // => "2.78"
catalog.publication?.publisher; // => "Example Diagnostics"
catalog.warnings?.length; // => 0
```

The catalog is consulted whenever a vendor local code is present, and is keyed on that code alone. A
value in the Universal Test ID's first component is carried verbatim as `unvalidatedWireValue`, is
never used as a lookup key, and is never reported as a LOINC: this package performs **no LOINC
validation of any kind**, so it never decides what such a value "looks like".

### Say which publication the mapping came from

The four optional elements beside the rows describe the **publication**, not any one row: who
published it, which publication version it is, which version of LOINC the mapping was made against,
and the LOINC copyright statement. The LOINC version rides onto **every** annotation the catalog
produces as `catalogLoincVersion`, whatever the lookup answered, so a mapping records what it was
made against and can be reproduced later.

**The LOINC license requires a statement of attribution and notice that LOINC content is
copyrighted**, and `loincCopyright` is where your statement rides, so it travels beside the mappings
it applies to rather than living in a document somewhere else.

Declaring no LOINC version is allowed and **nothing refuses**: the catalog is built and every lookup
answers exactly as it would have. `catalog.warnings` then carries one value-free
`ASTM_LIVD_CATALOG_NO_LOINC_VERSION` warning, whose message is a constant and whose `catalog` field
names your publication from what you declared, or says positively that you declared no identity.

**And the limits, beside the capability.** This package validates **none** of this metadata: not the
LOINC version, not the publisher, not the publication version, not the copyright text. It performs
no LOINC validation of any kind, so each value is stored and surfaced exactly as you supplied it,
and `catalogLoincVersion` never means a LOINC was checked against that version. **Carrying an
attribution statement is not discharging the obligation to make one**: the terminology data and its
license obligations stay yours, and this package makes no statement on your behalf.

## Round-trip a payload

Parse, inspect, and re-emit spec-clean output. The serializer is the conservative inverse of the
parser, so a parsed message round-trips through canonical delimiters with every embedded delimiter
re-escaped:

```ts runnable
import { parseAstmRecords, serializeAstmRecords } from "@cosyte/astm";

const raw = "H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r";
serializeAstmRecords(parseAstmRecords(raw)) === raw; // => true
```

## More

- [Vendor profiles](./guides-vendor-profiles): tolerating a documented quirk, and the safety gate
  that bounds what a profile may tolerate.
- [Quickstart](./quickstart): the one-line parse and every emit path.
- [The two-layer architecture](./architecture): records vs frames, and when you need each.
- [What it does with patient data](./patient-data): logging, retention and what stays yours.
- **API Reference**: every shipped export, generated from source.
