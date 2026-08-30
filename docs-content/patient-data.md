---
id: patient-data
title: What it does with patient data
sidebar_position: 3
---

# What `@cosyte/astm` does with patient data

ASTM instrument traffic carries protected health information. The `P` record concentrates it (name,
mother's maiden name, birthdate, sex, practice and lab identifiers), `C` free text can carry it, and
a result value with its flags is clinical data about a person. Before you put lab traffic through
this library, this page states exactly what it does with those bytes, so the decision is made on
what the code does rather than on a promise.

`@cosyte/astm` is **HIPAA-capable, not HIPAA-compliant**. Compliance is a property of a system, not
of a library, and the last section is the part of that system this package cannot do for you.

Every identifier on this page is invented.

## What it logs

**Nothing.** The library has no logger and no verbosity option, because it produces no output: it
writes nothing to standard output or standard error, and calls no logging API. What it gives you
instead is data you decide to log.

Warnings and errors carry **positional context only, never a value**. A position is the record's
ordinal index, its type letter, and the 1-based field and component indices; the message beside it
is a fixed constant. That is what makes a warning safe to log verbatim: it cannot leak a name, an
identifier, or a result.

```ts runnable
import { parseAstmRecords } from "@cosyte/astm";

const raw = "H|\\^&\rP|1|PRAC|LAB||DOE^JANE||20200101|F\rR|1|^^^687|28.6||||F\rL|1\r";
const warning = parseAstmRecords(raw).warnings[0];

warning?.code; // => "ASTM_RECORD_UNITS_ABSENT"
warning?.position; // => { recordIndex: 2, recordType: "R", fieldIndex: 5 }
```

The warning says a result in record 2 is missing its units. It does not say whose result, or what
the value was, and nothing in the object does.

There is exactly one deliberate exception, and it is not about your data: the error that refuses an
invalid `startFrameNumber` names the value it received, because that value is your own option
argument rather than anything read off the wire.

## What it retains

**Nothing between calls.** Parsing is a pure function of its input. It returns a message and keeps
no reference to it: there is no cache, no pool, no buffer that survives the call, and no
module-level store of anything read off a stream. The only module-level state the package has is the
default profile you may set yourself, and a profile holds vendor tolerance rules, never message
content. Drop your reference to a parsed message and the patient data goes with it.

What the message itself holds is the other half of that sentence, and it is the half worth knowing:
**a parsed message is a verbatim copy of what you gave it.** Every field keeps its exact wire text on
`field.raw`, and the header and the free-text records keep their whole line on `record.rawLine`. The
object graph is deeply frozen, so nothing can be redacted out of it in place. Treat a parsed message
as the payload it came from: do not put one in an error report, a crash dump, a snapshot test or a
support ticket.

## What it writes to disk

**Nothing.** The package imports no Node built-in at all: no file system, no sockets, no HTTP. It
cannot open a file, a port or a connection, and it reads no environment variable. Zero runtime
dependencies means there is no transitive package that could do any of it on the library's behalf
either.

It also does not own the serial line or the socket your analyzer is on. The library decodes and
encodes byte streams and gives you a pure transport reducer; the input and output adapter is yours,
which means every byte that reaches a disk, a wire or a screen got there through code you wrote. No
telemetry is collected and nothing is phoned home.

## What you still own

Everything at the edges, which is most of the compliance surface:

- **Transport security.** Serial or TCP, encryption in transit, and network segmentation between the
  analyzer and your service.
- **Storage.** Where a parsed message or a raw payload is persisted, how it is encrypted at rest, how
  long it is kept and how it is destroyed.
- **Logging discipline.** Never log a raw payload. Log the warning, not the record: the warning was
  designed to be safe to log, and the record was not.
- **Access control and audit.** Who may read a message, and the record of who did.
- **De-identification.** This package does not de-identify anything. It surfaces what the wire says,
  including the `P` record, verbatim.
- **Test data.** Keep fixtures synthetic. Real traffic in a test corpus is the most common way a
  patient identifier reaches a repository, and a repository is forever.

Read [What it does, and does not do](./limitations) for the rest of the boundary, including the
cases where a value the parser hands back is contested and the raw line is the thing to read.
