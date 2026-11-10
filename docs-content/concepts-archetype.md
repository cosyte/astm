---
id: concepts-archetype
title: The parser archetype
sidebar_label: The parser archetype
description: "The model every Cosyte parser shares: a lenient parse, a strict emit, an immutable model, warnings with stable codes, and profiles."
---

# The parser archetype

`@cosyte/astm` follows the model every Cosyte parser shares, so what you learn here carries over to
the others. `@cosyte/hl7` is the reference implementation, and this package follows its shape.

## Lenient parse, strict emit

The parser is liberal in what it accepts and the serializer is conservative in what it writes. A
vendor quirk or a tolerated deviation does not fail a parse; it becomes a warning. Anything the
serializer writes is spec-clean, so a quirk read on the way in is not passed on downstream. A
`{ strict: true }` option turns every tolerated deviation into a thrown error, for callers who want
the parse to stop instead.

## Three tiers of deviation

Every deviation the parser meets falls into one of three tiers:

- **Spec-clean.** No deviation and no warning.
- **Recoverable.** A quirk the parser can read past. It returns a warning with a stable code and a
  position, and carries on. It is never thrown, unless `strict` is set.
- **Fatal.** Input with nothing to parse into a message: empty input, a stream that does not start
  with a header, or a first header that cannot declare its delimiters. Always thrown, even in
  lenient mode.

## Stable warning and fatal codes

Warnings and fatal errors carry stable codes, and you branch on them, so a code's name is part of
the public contract: renaming or removing one is a breaking change. Each registry is an object whose
keys equal their values, so `Object.values(...)` gives the full set.

There is one registry per layer: `WARNING_CODES` for the records, `FRAME_WARNING_CODES` for the frame
codec, `LTP_WARNING_CODES` for the transport, and `LIVD_WARNING_CODES` for the LOINC mapping, plus
`FATAL_CODES` for what always throws. [Warning and error codes](./warning-codes.md) lists every one.

## Values, never in a warning

A warning or an error carries a position (record, field and component indices, or a frame number and
byte offset) and a fixed message, and never a value from the stream. That is what makes a warning
safe to log, and it is why [What it does with patient data](./patient-data.md) can say the library
logs nothing that identifies anyone.

## An immutable model

A parsed message is deeply frozen. It is safe to hand across a pipeline without copying, and nothing
downstream can change it in place.

## Profiles for vendor quirks

A profile records the deviations one instrument is documented to make, so that its expected warnings
are marked as expected while every other warning stays as it was. Built-in profiles are written with
the same public API you use. A profile never changes a value, and a safety gate refuses to let one
quiet any deviation that could cost a value. [Write a vendor profile](./guides-vendor-profiles.md)
shows how.

## No runtime dependencies

The package depends on nothing at run time and imports no Node.js built-in, because a healthcare
integration has to vet every dependency it takes. It ships ESM and CommonJS builds, checked with
`attw` so each resolves to its own types.

## How-to guides that apply this

- [Handle warnings and fail fast](./handle-warnings.md)
- [Write a vendor profile](./guides-vendor-profiles.md)
- [Write records and frames](./write-records-and-frames.md)
