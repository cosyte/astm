---
id: write-records-and-frames
title: Write records and frames
sidebar_label: Write records and frames
description: "Serialize a parsed message, build records from values you supply, frame them for the wire, and handle each case emit refuses."
---

# Write records and frames

Emit is the strict half of the library: whatever it writes reads back as the records that produced
it, and when it cannot promise that, it throws a typed error instead of writing. This page writes
records as text, builds them from values, frames them, and handles each refusal.

## Serialize a parsed message

`serializeAstmRecords` writes a message back as text with the canonical delimiters `H|\^&`, every
record ended by `CR`:

```ts runnable
import { parseAstmRecords, serializeAstmRecords } from "@cosyte/astm";

const raw = "H|\\^&\rP|1|PRAC|LAB\rR|1|^^^687|28.6|U/L||N||F\rL|1\r";
serializeAstmRecords(parseAstmRecords(raw)) === raw; // => true

// A literal escape character is written the spec-clean way.
serializeAstmRecords(parseAstmRecords("H|\\^&\rP|1||||O&BRIEN^PAT\rL|1\r")); // => "H|\\^&\rP|1||||O&E&BRIEN^PAT\rL|1\r"
```

A canonical message that was already spec-clean comes back byte for byte. Otherwise the bytes can
differ with nothing lost: emit writes the spec-clean form of what was read, so the bare `&` the
parser kept as a literal comes back as `&E&`.

To write a message back in the delimiters it arrived in, pass them as the second argument:

```ts runnable
import { parseAstmRecords, serializeAstmRecords } from "@cosyte/astm";

const vendor = parseAstmRecords("H#~*!\rR#1#***687#28.6#U/L##N##F\rL#1\r");

serializeAstmRecords(vendor); // => "H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r"
serializeAstmRecords(vendor, vendor.delimiters); // => "H#~*!\rR#1#***687#28.6#U/L##N##F\rL#1\r"
```

Every record is written in the one set the header declares, `M` and `S` records included, so a
stream never declares one set and uses another. [How delimiters are read and
written](./delimiters.md#on-the-way-out) covers what that means for vendor sets.

## Build records from values

`buildAstmMessage` writes records from typed input. It writes only the values you give it: an
omitted field stays empty, and nothing clinical is filled in for you.

```ts runnable
import { buildAstmMessage, parseAstmRecords, results } from "@cosyte/astm";

const text = buildAstmMessage({
  header: { fields: ["", "", "analyzer^1"] },
  records: [
    { type: "P", practiceAssignedId: "PRAC-0001" },
    {
      type: "R",
      universalTestId: ["", "", "", "687"],
      value: "28.6",
      units: "U/L",
      resultStatus: "F",
    },
    { type: "R", universalTestId: ["", "", "", "688"], value: "1^40" },
  ],
  terminationCode: "N",
});

text; // => "H|\\^&|||analyzer^1\rP|1|PRAC-0001\rR|1|^^^687|28.6|U/L||||F\rR|2|^^^688|1&S&40\rL|1|N\r"
results(parseAstmRecords(text)).map((r) => [r.value, r.status.meaning]); // => [["28.6", "final"], ["1^40", "unspecified"]]
```

Every value is escaped on the way out, so the titre `1^40` is written `1&S&40` and reads back as one
value. The second result has no status because we gave none, and it reads back `unspecified`, not
`final`.

## Frame records for the wire

`composeAstmFrames` wraps records in frames, computing each checksum and frame number and splitting
any record longer than 240 bytes across frames. `serializeFramedAstm` serializes a message and frames
it in one call:

```ts runnable
import { parseAstmRecords, parseFramedAstm, results, serializeFramedAstm } from "@cosyte/astm";

const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
const bytes = serializeFramedAstm(msg);

bytes[0]; // => 0x02
results(parseFramedAstm(bytes).message)[0]?.value; // => "28.6"
```

## Continue one transfer across several calls

Pass `startFrameNumber` to carry the frame sequence on from an earlier call. Read the number to start
from off the last frame you wrote; the count of frames is not it, because a long record takes more
than one:

```ts runnable
import { composeAstmFrames, decodeAstmFrames } from "@cosyte/astm";

const records = ["H|\\^&\r", "R|1|^^^687|28.6|U/L||N||F\r", "L|1\r"];
const head = composeAstmFrames(records.slice(0, 2));
const next = ((decodeAstmFrames(head).frames.at(-1)?.frameNumber ?? 0) + 1) % 8;
const tail = composeAstmFrames(records.slice(2), { startFrameNumber: next });

const whole = composeAstmFrames(records);
next; // => 3
Uint8Array.from([...head, ...tail]).every((b, i) => b === whole[i]); // => true
```

The joined parts are byte for byte what one call writes. The value must be a whole number from `0`
to `7`, because a frame number is one ASCII digit.

A continuation is not the start of a transfer. Read on its own, a stream that starts at any number
but `1` opens on a sequence gap, and the decoder does not deliver its first record. What
`parseFramedAstm` does after that depends on the message: it may throw, or return a message one record
short, and the record layer cannot report a record it never saw. Read `frameWarnings`, and leave the
option alone unless you are continuing a sequence.

## Handle what emit refuses

Emit returns a plain string or byte array, with nowhere to put a warning, so each case it cannot
write faithfully is a thrown error with a `code`:

```ts runnable
import {
  AstmFrameEncodeError,
  AstmSerializeError,
  buildAstmMessage,
  composeAstmFrames,
} from "@cosyte/astm";

function codeOf(write: () => unknown): string | undefined {
  try {
    write();
  } catch (err) {
    if (err instanceof AstmSerializeError || err instanceof AstmFrameEncodeError) return err.code;
  }
  return undefined;
}

codeOf(() => buildAstmMessage({ records: [{ type: "R", value: "a\rb" }] })); // => "ASTM_EMIT_UNENCODABLE_VALUE"
codeOf(() => composeAstmFrames(["R|1|^^^687|一|U/L\r"])); // => "ASTM_FRAME_UNENCODABLE_CHARACTER"
codeOf(() => composeAstmFrames(["R|1|^^^687|a\u0003b|U/L\r"])); // => "ASTM_FRAME_RESERVED_BYTE"
codeOf(() => composeAstmFrames(["L|1\r"], { startFrameNumber: 8 })); // => "ASTM_FRAME_INVALID_START_FRAME_NUMBER"
```

| Code                                    | Cause                                                                        | What to do                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `ASTM_EMIT_UNENCODABLE_VALUE`           | a value holds `CR` or `LF`, which no escape sequence can carry               | remove the line break from the value                          |
| `ASTM_EMIT_INVALID_DELIMITERS`          | the delimiter set is not one character each, holds `CR`/`LF`, or repeats one | pass a set that meets all three                               |
| `ASTM_EMIT_TYPE_LETTER_COLLISION`       | a record's type letter would be escaped away under the set being written     | repair or drop that record                                    |
| `ASTM_FRAME_EMPTY_RECORD`               | an empty record list, or a record with no bytes                              | pass at least one record with content                         |
| `ASTM_FRAME_UNENCODABLE_CHARACTER`      | a record given as a string holds a character above `U+00FF`                  | encode it with your instrument's code page and pass the bytes |
| `ASTM_FRAME_RESERVED_BYTE`              | a record holds `STX`, `ETB` or `ETX`, which only mark frame structure        | remove the byte from the value                                |
| `ASTM_FRAME_INVALID_START_FRAME_NUMBER` | `startFrameNumber` is not a whole number from `0` to `7`                     | pass the number after the last frame you wrote                |

A frame carries bytes, and nothing in an ASTM stream says which character encoding they are in, so
we refuse a character above `U+00FF` rather than choose an encoding for you. `composeAstmFrames`
takes a `Uint8Array` and writes it through untouched. A reserved byte has no such way round: it
cannot be framed whatever form it arrives in. The record layer still carries one, so
`serializeAstmRecords` writes it, and a raw-transport consumer that never frames gets it back byte
for byte.

The two delimiter refusals promise that every record reads back as its own type. They do not promise
that every field lands where it did, for reasons [How delimiters are read and
written](./delimiters.md#what-the-refusals-do-not-promise) explains. The low-level `encodeComponent`
and `serializeField` helpers take no record, so neither refusal applies to them.

## Reference

- [`serializeAstmRecords`](./api/README.md#serializeastmrecords),
  [`buildAstmMessage`](./api/README.md#buildastmmessage) and
  [`MessageInput`](./api/README.md#messageinput)
- [`composeAstmFrames`](./api/README.md#composeastmframes),
  [`serializeFramedAstm`](./api/README.md#serializeframedastm) and
  [`ComposeFramesOptions`](./api/README.md#composeframesoptions)
- [`AstmSerializeError`](./api/README.md#astmserializeerror) and
  [`AstmFrameEncodeError`](./api/README.md#astmframeencodeerror)
