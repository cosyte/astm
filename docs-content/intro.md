---
id: intro
title: Overview
sidebar_label: Overview
description: "What @cosyte/astm does with laboratory-instrument ASTM traffic, who it is for, what it does not do, and where to go next."
---

# @cosyte/astm

`@cosyte/astm` is our TypeScript library for ASTM laboratory-instrument traffic. It parses,
serializes and builds the records an analyzer sends (ASTM E1394, now CLSI LIS02-A2), decodes and
composes the frames they travel in (ASTM E1381, now CLSI LIS01-A2), and maps an analyzer's local
test codes to LOINC from a catalog you supply. It has no runtime dependencies and follows the same
shape as our HL7 v2 parser, `@cosyte/hl7`: a lenient parser, an immutable model, a serializer that
writes only spec-clean output, and vendor profiles.

> **Status:** published on npm, and the public API is settled and stable: the exported names,
> options, return shapes, and warning codes are the surface a release keeps. Before the first major version every release
> is a patch, and a breaking or narrowing change ships as a patch whose changelog entry states the
> change and what a caller must do. Two surfaces are still moving, both
> additively: the built-in profile registry and the warning and error code sets.
> Read the version you have with `npm view @cosyte/astm version`.

## Who it is for

Developers who connect laboratory analyzers to a laboratory information system or to middleware:
reading result uploads and host queries off a serial line or a TCP connection, answering them, and
moving the values on. You do not need to have read the standard to use it.

## What it does

- **Reads records.** `H`, `P`, `O`, `R`, `C`, `Q`, `M`, `S` and `L` records, with the delimiters
  taken from each header and escape sequences decoded before a value is split. A result's flag,
  status and reference range are modeled with fail-safe defaults: a correction never reads as
  final, an unknown flag never reads as normal, and an unreadable range never gets an invented
  bound.
- **Warns instead of failing.** A vendor deviation becomes a warning with a stable code and a
  position, never a value. `{ strict: true }` turns every warning into a thrown error.
- **Never pairs data across patients.** A stream can carry several messages, and the accessors that
  read the whole stream refuse one they cannot answer for rather than answer across patients.
- **Decodes and composes frames.** Checksums are verified and computed, frame numbers are tracked,
  and a frame the codec cannot vouch for never reaches a record.
- **Models the transfer protocol.** `ltpReduce` is a pure receiver state machine for the
  `ENQ`/`ACK`/`NAK`/`EOT` handshake; you own the connection.
- **Writes spec-clean output.** The serializer writes canonical delimiters and re-escapes every
  value, and the builder writes only the values you supply.
- **Maps local codes to LOINC from your catalog**, additively, and never guesses a LOINC.

```ts runnable
import { parseAstmRecords, results } from "@cosyte/astm";

const raw = "H|\\^&\rP|1|PRAC|LAB\rO|1|ACC\rR|1|^^^687|28.6|U/L||N||F\rL|1|N\r";
const r = results(parseAstmRecords(raw))[0];

r?.value; // => "28.6"
r?.units; // => "U/L"
r?.status.isActiveFinal; // => true
```

## What it is not

- **Not a connection manager.** It owns no serial port, socket or timer.
- **Not a terminology service.** No LOINC, SNOMED or LIVD data is bundled, and units are compared as
  written, not as UCUM.
- **Not a clinical judgment.** It reports a flag and a status faithfully and does not decide what a
  value means for a patient.
- **Not a compliance product.** It does not log, store or send anything, and what it does with
  patient data is on [What it does with patient data](./patient-data.md).

[Limitations](./limitations.md) states the boundary in full. Read it before you
rely on the library.

## Where to go next

- [Installation](./installation.md), then the [Quickstart](./quickstart.md).
- [Receive results from an analyzer](./receive-results-from-an-analyzer.md): a framed transfer, from
  the first byte to a result, step by step.
- The how-to guides, starting with [Read a result safely](./read-results.md).
- [The API reference](./api/README.md), generated from the source.
