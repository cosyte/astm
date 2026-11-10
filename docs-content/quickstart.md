---
id: quickstart
title: Quickstart
sidebar_label: Quickstart
description: "Parse an ASTM result stream, read a result and its warnings, decode a framed stream, and write records back out."
---

# Quickstart

This page takes you from an installed package to a parsed result, its warnings, a decoded frame
stream and records written back out. Every sample runs as it is: copy one into a `.ts` file in a
project with `@cosyte/astm` installed and run it. If you have not installed the package yet, start
with [Installation](./installation.md).

## Parse a result upload

An analyzer sends records separated by carriage returns: a header, a patient, an order, a result and
a terminator. `parseAstmRecords` reads them into an immutable message, and `results` returns its
result records:

```ts runnable
import { parseAstmRecords, results } from "@cosyte/astm";

// A de-framed ASTM record stream: header (declares the delimiters) + patient + order + result + end.
const raw = "H|\\^&\rP|1|PRAC|LAB\rO|1|ACC\rR|1|^^^687|28.6|U/L||N||F\rL|1|N\r";
const msg = parseAstmRecords(raw);

const first = results(msg)[0];
first?.value; // => "28.6"
```

The parser reads the four delimiters from the header (`|`, `\`, `^` and `&` here) rather than
assuming them, and decodes escape sequences before it splits a value.

## Read the status, flag and range

A result keeps every field as it arrived and adds a modeled view of the three that decide whether a
value can be acted on:

```ts runnable
import { parseAstmRecords, results } from "@cosyte/astm";

// A correction (status C) that supersedes a value sent earlier.
const raw = "H|\\^&\rO|1|ACC\rR|1|^^^687|30.1|U/L|10-40|H||C\rL|1|N\r";
const r = results(parseAstmRecords(raw))[0];

r?.status.meaning; // => "correction"
r?.status.isActiveFinal; // => false
r?.status.supersedes; // => true
r?.flag?.meaning; // => "above-normal"
r?.range?.kind; // => "closed"
r?.range?.low; // => "10"
```

`status.isActiveFinal` is `true` only for a plain `F`. A missing status reads `unspecified`, never
`final`; an unknown flag reads `undefined`, never `normal`. [Read a result
safely](./read-results.md) covers each case.

## Check the warnings

The parser is lenient: a deviation it can read past becomes a warning, not a thrown error. Each
warning has a stable code and a position, and never a value:

```ts runnable
import { parseAstmRecords } from "@cosyte/astm";

// A numeric result with an empty units field.
const raw = "H|\\^&\rR|1|^^^687|28.6||||F\rL|1\r";
const { warnings } = parseAstmRecords(raw);

warnings[0]?.code; // => "ASTM_RECORD_UNITS_ABSENT"
warnings[0]?.position; // => { recordIndex: 1, recordType: "R", fieldIndex: 5 }
```

Pass `{ strict: true }` to turn every warning into a thrown `AstmStrictError` instead. [Handle
warnings and fail fast](./handle-warnings.md) shows both, and [Warning and error
codes](./warning-codes.md) lists every code.

## Decode a framed stream

Off a serial line, and on many TCP links, each record travels in a frame:
`<STX>`, a frame number, the text, `<ETB>` or `<ETX>`, a two-character checksum, then `<CR><LF>`.
`decodeAstmFrames` verifies each checksum, and `parseFramedAstm` decodes the frames and parses the
records they carry in one call:

```ts runnable
import { decodeAstmFrames, parseFramedAstm, results } from "@cosyte/astm";

// One final (ETX) frame carrying the record text "L|1\r", with its correct checksum "3A".
const bytes = new Uint8Array([0x02, 0x31, 0x4c, 0x7c, 0x31, 0x0d, 0x03, 0x33, 0x41, 0x0d, 0x0a]);
decodeAstmFrames(bytes).frames[0]?.checksum.valid; // => true

// Three records, each in its own frame, as an analyzer sends them.
const frames = new TextEncoder().encode(
  "\u00021H|\\^&\r\u0003E5\r\n" +
    "\u00022R|1|^^^687|28.6|U/L||N||F\r\u000396\r\n" +
    "\u00023L|1\r\u00033C\r\n",
);
const { message, frameWarnings } = parseFramedAstm(frames);
frameWarnings.length; // => 0
results(message)[0]?.value; // => "28.6"
```

A frame whose checksum fails is reported in `frameWarnings` and its text never reaches the record
parser. [Decode a framed byte stream](./decode-framed-streams.md) has the details.

## Write records back out

`serializeAstmRecords` writes a message back as spec-clean text, and `buildAstmMessage` writes
records from values you supply. Neither invents a value:

```ts runnable
import { buildAstmMessage, parseAstmRecords, results, serializeAstmRecords } from "@cosyte/astm";

const raw = "H|\\^&\rP|1|PRAC|LAB\rR|1|^^^687|28.6|U/L||N||F\rL|1\r";
serializeAstmRecords(parseAstmRecords(raw)) === raw; // => true

const built = buildAstmMessage({
  records: [{ type: "R", universalTestId: ["", "", "", "687"], value: "28.6", units: "U/L" }],
});
results(parseAstmRecords(built))[0]?.status.meaning; // => "unspecified"
```

The built result reads back `unspecified` because we did not set a status, and the builder does
not default one. [Write records and frames](./write-records-and-frames.md) covers framing and the
cases emit refuses.

## Next

- [Receive results from an analyzer](./receive-results-from-an-analyzer.md): a tutorial that drives
  a whole framed transfer through the protocol receiver.
- [Read a stream that carries several messages](./read-several-messages.md), before you point a real
  feed at the flat accessors.
- [Map local codes to LOINC](./map-local-codes-to-loinc.md), [Read a timestamp without inventing a
  timezone](./read-dates.md) and [Write a vendor profile](./guides-vendor-profiles.md).
- [The parser archetype](./concepts-archetype.md) and [the two-layer
  architecture](./architecture.md), for the model behind the API.
