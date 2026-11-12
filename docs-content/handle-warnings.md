---
id: handle-warnings
title: Handle warnings and fail fast
sidebar_label: Handle warnings
description: "Branch on a warning's stable code, log warnings safely, refuse every deviation with strict mode, and catch the errors a parse can throw."
---

# Handle warnings and fail fast

A lenient parse returns a message and a list of warnings. Each warning has a stable `code`, a
`position` (the record, field and component it concerns) and a `message` that is a fixed sentence.
None of them carries a value from the stream. This page shows what to do with them.

## Branch on a code

Compare `warning.code` with the registry constants. A code's name is part of the public contract, so
the branch will not drift:

```ts runnable
import { parseAstmRecords, WARNING_CODES } from "@cosyte/astm";

const { warnings } = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6||||F\rL|1\r");

const needsReview = warnings.some((w) => w.code === WARNING_CODES.ASTM_RECORD_UNITS_ABSENT);
needsReview; // => true
warnings[0]?.position; // => { recordIndex: 1, recordType: "R", fieldIndex: 5 }
```

The record layer's codes are in `WARNING_CODES`; the frame decoder's in `FRAME_WARNING_CODES`; the
transport's in `LTP_WARNING_CODES`; and the LOINC mapping's in `LIVD_WARNING_CODES`. [Warning and
error codes](./warning-codes.md) lists every one.

Two codes deserve a branch of their own on any real feed: `ASTM_RECORD_UNKNOWN_TYPE`, which can mean
two messages merged ([Read a stream that carries several
messages](./read-several-messages.md#check-for-an-unrecognized-record-before-you-trust-the-split)),
and `ASTM_RECORD_FIELDS_UNSEPARATED`, which means a record lost its fields ([How delimiters are read
and written](./delimiters.md#a-record-that-lost-its-fields)).

## What is safe to log

A warning is safe to log as it is. Its `message` is a fixed sentence, and its `position` is only indices (a record, field and component, or a frame number and byte offset):

```ts runnable
import { parseAstmRecords } from "@cosyte/astm";

const { warnings } = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6||||F\rL|1\r");
const lines = warnings.map((w) => `${w.code} ${w.message} ${JSON.stringify(w.position)}`);

lines[0]?.includes("28.6"); // => false
```

None of this package's own errors or warnings holds a snippet of the input, so logging a warning, a
thrown error's `code` or an error's `position` puts no patient data in a log. Log those, along with
message types, codes, counts, lengths and positions.

What does hold raw input is what the parse returns, and none of it is safe to log:

- the `raw` field of every parsed record field, of `PatientName` and of `AbnormalFlag`, which is the
  wire text exactly as received;
- the `text` of a decoded frame, which is the record bytes, even for a frame that failed its checksum;
- the `record` bytes of a `deliverRecord` action from the receiver;
- any value read off a `P` record (identifiers, name, birth date) or a `C` record's free text, and a
  whole message or record.

Read those into a variable or assert on them, and never pass them to `console.log` or any other
logger. [What it does with patient data](./patient-data.md) explains the difference.

## Refuse every deviation with strict mode

At an integration boundary you may want a deviation to stop the message instead. Parse with
`{ strict: true }`, and every warning becomes a thrown `AstmStrictError` that carries them all:

```ts runnable
import { AstmStrictError, parseAstmRecords } from "@cosyte/astm";

let refused: readonly string[] = [];
try {
  parseAstmRecords("H|\\^&\rR|1|^^^687|28.6||||F\rL|1\r", { strict: true });
} catch (err) {
  if (err instanceof AstmStrictError) refused = err.warnings.map((w) => w.code);
}
refused; // => ["ASTM_RECORD_UNITS_ABSENT"]
```

The frame decoder takes the same option and throws `AstmFrameStrictError`. A warning a vendor
profile expects is re-badged `PROFILE_QUIRK_APPLIED` and does not stop a strict parse, but no profile
can do that for a code that could cost you a value: [Write a vendor
profile](./guides-vendor-profiles.md#the-profile-safety-gate) explains the safety gate. Ask
`isSafetyCriticalCode(code)` when you need the answer for one code.

## Catch what always throws

Three conditions throw even in lenient mode, because there is nothing to parse into a message. Each
is an `AstmParseError` with a code from `FATAL_CODES`:

```ts runnable
import { AstmParseError, parseAstmRecords } from "@cosyte/astm";

const codes: string[] = [];
for (const raw of ["", "P|1\r", "H\r"]) {
  try {
    parseAstmRecords(raw);
  } catch (err) {
    if (err instanceof AstmParseError) codes.push(err.code);
  }
}
codes; // => ["EMPTY_INPUT", "ASTM_RECORD_NO_HEADER", "ASTM_RECORD_UNDECLARED_DELIMITERS"]
```

Read a thrown error's `code`, not its message, to tell these apart from an `AstmStrictError` and from
the accessors' `AstmAmbiguousStreamError`.

## Reference

- [`WARNING_CODES`](./api/README.md#warning_codes), [`FATAL_CODES`](./api/README.md#fatal_codes)
  and [`AstmRecordWarning`](./api/README.md#astmrecordwarning)
- [`AstmStrictError`](./api/README.md#astmstricterror),
  [`AstmParseError`](./api/README.md#astmparseerror) and
  [`isSafetyCriticalCode`](./api/README.md#issafetycriticalcode)
- [Warning and error codes](./warning-codes.md)
