---
id: read-several-messages
title: Read a stream that carries several messages
sidebar_label: Read several messages
description: "Split a record stream into its messages with messages(), so a patient is only ever paired with the results their own message carried."
---

# Read a stream that carries several messages

A message runs from its `H` header to its `L` terminator, and one stream can carry several back to
back, each with its own patient. Read such a stream with `messages()`, never with the flat accessors.

## Split the stream with messages()

```ts runnable
import { messages, parseAstmRecords } from "@cosyte/astm";

const two =
  "H|\\^&\rP|1|PRAC-1\rR|1|^^^687|10.0|U/L||N||F\rL|1|N\r" +
  "H|\\^&\rP|1|PRAC-2\rR|1|^^^688|99.9|U/L||H||F\rL|1|N\r";

// "PRAC-1" and "PRAC-2" are synthetic patient IDs, asserted here and never printed.
const pairs = messages(parseAstmRecords(two)).map(
  (m) => `${String(m.patient?.practiceAssignedId)}:${String(m.results[0]?.value)}`,
);
pairs; // => ["PRAC-1:10.0", "PRAC-2:99.9"]
```

Each entry has its own `header`, `delimiters`, `records`, `patient`, `patients`, `results`,
`orders`, `comments` and `queries`, so a result is only ever read beside the patient of the message
that carried it. `messages()` never throws, and on an ordinary single-message stream it returns one
entry.

## Expect the flat accessors to refuse

`patient()`, `results()`, `orders()`, `comments()` and `query()` read the whole stream. On a stream
they cannot answer for, they throw `AstmAmbiguousStreamError` rather than answer across patients:

```ts runnable
import { AstmAmbiguousStreamError, parseAstmRecords, results } from "@cosyte/astm";

const two =
  "H|\\^&\rP|1|PRAC-1\rR|1|^^^687|10.0|U/L||N||F\rL|1|N\r" +
  "H|\\^&\rP|1|PRAC-2\rR|1|^^^688|99.9|U/L||H||F\rL|1|N\r";

let code = "";
try {
  results(parseAstmRecords(two));
} catch (err) {
  if (err instanceof AstmAmbiguousStreamError) code = err.code;
}
code; // => "ASTM_AMBIGUOUS_MULTI_MESSAGE"
```

- `ASTM_AMBIGUOUS_MULTI_MESSAGE`, from any of the five, when the stream carries more than one
  message.
- `ASTM_AMBIGUOUS_MULTI_PATIENT`, from `patient()` only, when a single message carries more than one
  `P` record. "The first patient" would be a guess about whose result it is.

The error carries `code`, `messageCount`, `patientCount` and a `position`, and never a value, so it
is safe to log. A stream that is one message with at most one patient is answered as before, and a
result-only message with no `P` answers `patient()` with `undefined`. `commentsFor()` never throws
this error, because the record you pass it already names its message.

## Handle a message with several patients

Inside one message, `messages()` does not decide which `P` a result belongs to. `patient` is
`undefined` there, and `patients` holds them all:

```ts runnable
import { messages, parseAstmRecords } from "@cosyte/astm";

const raw =
  "H|\\^&\rP|1|PRAC-1\rR|1|^^^687|10.0|U/L||N||F\rP|2|PRAC-2\rR|1|^^^688|9|U/L||N||F\rL|1\r";
const [m] = messages(parseAstmRecords(raw));

// "PRAC-1" and "PRAC-2" are synthetic patient IDs.
m?.patient; // => undefined
m?.patients.map((p) => p.practiceAssignedId); // => ["PRAC-1", "PRAC-2"]
```

Assigning each result to the `P` before it means asserting a record hierarchy we cannot ground in
the freely available text of the standard, so we leave that decision to you. Messages like this are
real, mostly on the download direction, so plan for them.

## Classify each message on its own

`msg.classification` is folded over the whole stream, so a `Q` in any message makes the whole stream
read as a host query. Classify each message with `classifyMessage`:

```ts runnable
import { classifyMessage, messages, parseAstmRecords } from "@cosyte/astm";

const raw =
  "H|\\^&\rP|1\rQ|1|^SPEC-7||ALL\rL|1\r" + "H|\\^&\rP|1|PRAC-2\rR|1|^^^688|99.9|U/L||H||F\rL|1|N\r";
const msg = parseAstmRecords(raw);

msg.classification.kind; // => "host-query"
messages(msg).map((m) => classifyMessage(m.records).kind); // => ["host-query", "results"]
msg.warnings.map((w) => w.code); // => ["ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND"]
```

## Check for an unrecognized record before you trust the split

Splitting reads each record's type letter. A header the parser does not recognize as one, such as
one with a stray byte in front, opens no message, and the messages on either side of it merge, so a
patient can end up beside results from a different header:

```ts runnable
import { messages, parseAstmRecords } from "@cosyte/astm";

const raw =
  "H|\\^&\rP|1|PRAC-1\rR|1|^^^687|10.0|U/L||N||F\rL|1|N\r" +
  "xH|\\^&\rP|1|PRAC-2\rR|1|^^^688|99.9|U/L||H||F\rL|1|N\r";
const msg = parseAstmRecords(raw);

messages(msg).length; // => 1
msg.warnings.some((w) => w.code === "ASTM_RECORD_UNKNOWN_TYPE"); // => true
msg.classification.kind; // => "indeterminate"
```

`ASTM_RECORD_UNKNOWN_TYPE` is the only report of that merge. Look for the code itself rather than
counting warnings, because the merged records can raise warnings of their own. No profile may
tolerate it, and a `{ strict: true }` parse refuses the stream. The same unrecognized letter makes
the message kind unknowable, since it may have been the `Q`, so the kind is `indeterminate`.

A header the parser did not recognize also does not change the delimiters, so the records after it
can be read with the previous set. [How delimiters are read and written](./delimiters.md) covers what
that costs and which warnings report it.

## Reference

- [`messages`](./api/README.md#messages), [`AstmStreamMessage`](./api/README.md#astmstreammessage)
  and [`classifyMessage`](./api/README.md#classifymessage)
- [`AstmAmbiguousStreamError`](./api/README.md#astmambiguousstreamerror) and
  [`AMBIGUOUS_CODES`](./api/README.md#ambiguous_codes)
- [Warning and error codes](./warning-codes.md)
