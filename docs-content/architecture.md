---
id: architecture
title: The two-layer architecture
sidebar_label: The two-layer architecture
description: "How the record layer (E1394) and the framing layer (E1381) stay independent, and the one point where they meet."
---

# The two-layer architecture

ASTM is not one standard but **two independent layers under one interface**, and `@cosyte/astm`
follows that split exactly. Understanding the boundary is the key to using the library well: you
decode the layers independently and compose them only at the one point they meet.

## Two standards, one domain

| Layer       | Standard                          | What it governs                                                                                                          | Entry points                                                   |
| ----------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| **Records** | ASTM E1394-97 → **CLSI LIS02-A2** | _Message content_: the `H`/`P`/`O`/`R`/`C`/`Q`/`L`/`S`/`M` record grammar with self-declaring delimiters                 | `parseAstmRecords`, `serializeAstmRecords`, `buildAstmMessage` |
| **Frames**  | ASTM E1381-02 → **CLSI LIS01-A2** | _Low-level transfer_: `STX`-framed records, modulo-256 checksum, frame numbers, the `ENQ`/`ACK`/`NAK`/`EOT` handshake    | `decodeAstmFrames`, `composeAstmFrames`, `ltpReduce`           |
| **Common**  | _None_                            | Shared vocabulary: the delimiter model, the escape codec, the date value, code-system provenance, the warning registries | `CANONICAL_DELIMITERS`, value types                            |

The two standards **share nothing but the domain and the payload boundary**. A frame carries record
bytes; a record knows nothing about frames. That is why the package is one repo, two composable
layers, and a thin common core.

## Decode the layers independently

Middleware often hands you **already-de-framed** record bytes (the framing was stripped upstream, or
the vendor drops framing over raw TCP entirely). In that case you never touch the frame layer:

```ts runnable
import { parseAstmRecords, results } from "@cosyte/astm";

// De-framed record bytes straight into the record parser.
const deFramedBytes = new TextEncoder().encode("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
const msg = parseAstmRecords(deFramedBytes);
results(msg)[0]?.value; // => "28.6"
```

When you receive a raw byte stream off a serial line or socket, the frame layer decodes it first, and
`parseFramedAstm` composes the two at the edge, only frames the framing layer _vouched for_ (checksum
verified, in sequence) ever reach the record parser:

```ts runnable
import { parseAstmRecords, parseFramedAstm, results, serializeFramedAstm } from "@cosyte/astm";

// Framed bytes, as they arrive off a serial line.
const framedBytes = serializeFramedAstm(
  parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r"),
);

const { message, frames, frameWarnings } = parseFramedAstm(framedBytes);
frames.length; // => 3
frameWarnings; // => []
results(message)[0]?.value; // => "28.6"
```

## The transport reality the frame layer handles

Over a serial line, records always arrive in full E1381 frames. Over TCP it **varies within a single
vendor**: some analyzers keep the full `ENQ`/`ACK` + `STX`/checksum framing, others drop all
low-level framing and stream records directly ("TCP itself ensures correctness"). `detectFraming`
auto-detects framed vs raw from the leading byte and **defaults to framed on an ambiguous lead** (with
a profile override): never a silent guess into data loss.

`ltpReduce` models the establishment → transfer → termination state machine as a **pure reducer** over
transport events, so it is deterministic and fully testable without a socket. The library never owns
the wire or the clock: it models the state transitions, and you drive them with your own I/O.

## Why this shape

- **Safety lives in the payload.** The record layer leads because that is where a wrong value, flag,
  status, or patient ID causes clinical harm, so it gets the earliest, most rigorous treatment.
- **Independent testing.** Each layer is fuzzed and property-tested on its own; the record tokenizer
  and the frame codec are separate byte-level surfaces with separate warning registries
  (`WARNING_CODES`, `FRAME_WARNING_CODES`, `LTP_WARNING_CODES`).
- **Composability.** A consumer takes exactly the layer they need. The two only meet in
  `parseFramedAstm` / `serializeFramedAstm`, and that seam is deliberately thin.

## How-to guides that apply this

- [Decode a framed byte stream](./decode-framed-streams.md): detect framing, decode frames, and parse
  only what they vouched for.
- [Drive the LTP receiver over your own connection](./drive-the-ltp-receiver.md): the protocol layer
  over your own I/O.
- [Write records and frames](./write-records-and-frames.md): the emit side of both layers.

[The parser archetype](./concepts-archetype.md) covers the model both layers share, and [Limitations](./limitations.md) the boundary of the whole.
