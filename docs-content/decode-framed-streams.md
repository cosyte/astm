---
id: decode-framed-streams
title: Decode a framed byte stream
sidebar_label: Decode a framed stream
description: "Tell framed bytes from raw records, decode frames with their checksums and numbers, and parse only the records the frames vouched for."
---

# Decode a framed byte stream

Over a serial line, records always arrive in frames. Over TCP it depends on the analyzer: some keep
the full framing, and some send bare records. This page finds out which you have, decodes frames,
and parses the records they carry.

## Find out whether the stream is framed

`detectFraming` reads the leading byte. `STX` or `ENQ` means framed; a record type letter means raw:

```ts runnable
import { detectFraming } from "@cosyte/astm";

const framed = new Uint8Array([0x05]); // ENQ, the start of a transfer
const raw = new TextEncoder().encode("H|\\^&\rL|1\r");
const unclear = new TextEncoder().encode("??");

detectFraming(framed).framing; // => "framed"
detectFraming(raw).framing; // => "raw"
detectFraming(unclear).framing; // => "framed"
detectFraming(unclear).defaulted; // => true
detectFraming(unclear).warnings[0]?.code; // => "ASTM_LTP_AMBIGUOUS_TRANSPORT"
detectFraming(unclear, { override: "raw" }).framing; // => "raw"
```

On a leading byte it cannot place, it answers `framed`, sets `defaulted`, and warns, rather than
guessing quietly. When you know the analyzer, pass `override`, or set `transport` in a [vendor
profile](./guides-vendor-profiles.md). A raw stream goes straight to `parseAstmRecords`.

## Decode the frames

`decodeAstmFrames` returns the frames, the record bytes they carried, and the frame warnings:

```ts runnable
import { decodeAstmFrames } from "@cosyte/astm";

// One final (ETX) frame carrying the record text "L|1\r", with its correct checksum "3A".
const bytes = new Uint8Array([0x02, 0x31, 0x4c, 0x7c, 0x31, 0x0d, 0x03, 0x33, 0x41, 0x0d, 0x0a]);
const { frames, records, warnings } = decodeAstmFrames(bytes);

frames[0]?.frameNumber; // => 1
frames[0]?.terminator; // => "ETX"
frames[0]?.checksum.valid; // => true
frames[0]?.trusted; // => true
records.length; // => 1
warnings; // => []
```

- **The checksum** is the modulo-256 sum of the frame's bytes. It is written in upper case and
  accepted in lower case too, since some vendors send it that way.
- **A long record** arrives split across frames: each intermediate frame ends with `ETB` and the last
  with `ETX`. The decoder joins them back into one record.
- **Frame numbers** run 1 to 7, then 0, and around again. The decoder checks that each frame is the
  next one.

## Parse only what the frames vouched for

`parseFramedAstm` decodes the frames and parses the records in one call. Only frames that passed
every check reach the record parser:

```ts runnable
import { parseFramedAstm, results, serializeFramedAstm, parseAstmRecords } from "@cosyte/astm";

const framed = serializeFramedAstm(
  parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rR|2|^^^688|5.1|mmol/L||N||F\rL|1\r"),
);

// Change one byte of the first result on the way.
const damaged = framed.slice();
damaged[new TextDecoder("latin1").decode(framed).indexOf("28.6")] = 0x33;

const { message, frameWarnings } = parseFramedAstm(damaged);
frameWarnings.map((w) => w.code); // => ["ASTM_FRAME_BAD_CHECKSUM"]
results(message).map((r) => r.value); // => ["5.1"]
```

The damaged frame is kept in `frames` with `trusted: false`, for audit, and its text never reaches a
record. Read `frameWarnings` on every call: the record layer cannot report a record it never saw.

## Know what each frame warning means

| Code                      | What happened                                                    | What the decoder did                               |
| ------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| `ASTM_FRAME_BAD_CHECKSUM` | the checksum did not match the frame's bytes                     | kept the frame untrusted, merged nothing           |
| `ASTM_FRAME_SEQUENCE_GAP` | a frame number was not the next one, so a frame may be missing   | did not join records across the gap                |
| `ASTM_FRAME_UNTERMINATED` | a frame, or a record's run of frames, ended without its last end | kept the bytes untrusted, invented no record       |
| `ASTM_FRAME_OVERSIZE`     | a frame carried more than 240 bytes of text without a split      | kept it, and joined it if its checksum was correct |

Each warning carries a frame number and a byte offset, never the record bytes. In the default
lenient mode they are warnings; with `{ strict: true }` they are a thrown `AstmFrameStrictError` that
carries them.

## Reference

- [`detectFraming`](./api/README.md#detectframing),
  [`decodeAstmFrames`](./api/README.md#decodeastmframes) and
  [`parseFramedAstm`](./api/README.md#parseframedastm)
- [`AstmFrame`](./api/README.md#astmframe) and
  [`FRAME_WARNING_CODES`](./api/README.md#frame_warning_codes)
- [Drive the LTP receiver over your own connection](./drive-the-ltp-receiver.md)
