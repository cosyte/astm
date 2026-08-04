---
id: limitations
title: What it does, and does not do
sidebar_position: 1
---

# What `@cosyte/astm` does, and does not do

A lab result drives treatment. A parser that silently hands back a wrong value, unit, flag, status, or
patient ID can cause harm. So this page is deliberately blunt about the promise and its edges. Read it
before you rely on the library: the **API Reference** is always the exact truth of what a given
release ships; this page is the honest shape of the whole.

## The promise (narrow, on purpose)

`@cosyte/astm` is **liberal on decode, conservative on emit, and never returns a confident wrong
value.**

- **Liberal decode.** Real vendor quirks become typed, value-free **warnings** with stable codes and
  positional context (record + field/component index, or frame number + byte offset): not thrown
  errors and not silent data loss. A `{ strict: true }` mode escalates every tolerated deviation to a
  thrown error at an integration boundary.
- **Conservative emit.** The serializer always produces spec-clean output: canonical `H|\^&`
  delimiters, every embedded delimiter re-escaped, every checksum and frame number computed, never
  faked. A header declaration carrying characters beyond the three that hold a delimiter role
  keeps them rather than being truncated, since deleting bytes is the larger claim. Emit returns a
  plain string and has no warning channel, so what it cannot write reversibly is a typed error at the
  call: a value carrying a `CR`/`LF` no escape can encode, a delimiter set that fails one of the
  three conditions readback requires, and a record whose own type letter that set would escape away.
  Those refusals cover a record's **type**; they do not promise every field lands where it did: see
  the non-goals below.
- **Fail-safe on ambiguity.** A missing unit, an unrecognized abnormal flag, a corrected/cancelled
  result, a bad checksum, an unparseable range: each surfaces as a typed warning or error. The
  library refuses to guess a value into existence.

## What it does **not** do

These are **non-goals**, not missing features: naming them so nothing over-trusts the parser.

- **No live connection management.** The library decodes and encodes byte streams and provides a
  **pure** LTP protocol reducer (`ltpReduce`), but it does **not** own a serial port or a socket. The
  I/O adapter and the interactive **timeout / retransmit timing** are the consumer's. The standard's
  exact numeric timeouts and retry counts live in the paywalled body and are modeled as _transitions,
  not timers_.
- **No unit semantics.** Units are surfaced as vendor **free text**: **not UCUM**, not normalized,
  not convertible. A numeric value with no units raises `ASTM_RECORD_UNITS_ABSENT`; a missing unit is
  never defaulted or guessed.
- **No terminology dictionary.** LOINC and SNOMED are **not bundled** (see licensing below). The
  Universal Test ID's LOINC slot is _recognized_ when populated; vendor→LOINC mapping requires a
  **consumer-supplied** IICC LIVD catalog (`applyLivd`), and an unmapped code stays verbatim, never a
  fabricated LOINC.
- **No interpretation of `M` / `S` records.** Vendor-defined manufacturer / scientific records
  (QC, calibration, maintenance) are surfaced **verbatim** on `record.rawLine` and never parsed into
  clinical fields: a QC value must not read as a patient result.
- **No within-message patient scoping.** A message carrying **several** `P` records is not resolved
  into per-patient groups: `messages(msg)[n].patient` is `undefined` there and `patients` carries all
  of them, and `patient()` refuses rather than answering with the first. Deciding which `P` a given
  `R` files against would mean asserting a record hierarchy this project cannot ground (the clauses
  that define it are not in the freely available text), and guessing it is the wrong-patient failure
  by another route. Messages carrying several patients are real, chiefly on the download direction,
  so treat this as a boundary to handle rather than a case that will not arise.
- **No choice of character encoding.** A frame carries **bytes**, and nothing this library reads from
  an ASTM stream says which character encoding those bytes are in: that is out-of-band knowledge your
  instrument's interface document holds. So a record handed to `composeAstmFrames` as a `string` is
  read as one byte per character, and a character above `U+00FF` is **refused**
  (`ASTM_FRAME_UNENCODABLE_CHARACTER`) rather than encoded on a guess. To put content outside Latin-1
  on the wire, encode it yourself with the code page your instrument uses and pass the resulting
  `Uint8Array`, which `composeAstmFrames` writes through untouched. The record layer is unaffected:
  `serializeAstmRecords` returns a `string` and what you encode it with is yours to decide.
- **No way to put a frame-structure byte inside a frame.** `STX`, `ETB` and `ETX` are what the
  decoder reads as the shape of a frame, and framing has no escape sequence for them, so a record
  carrying one is refused (`ASTM_FRAME_RESERVED_BYTE`) rather than written as a frame that truncates
  at that byte. Passing the record as a `Uint8Array` does not route around it: the byte is
  unframable however it arrives. Which byte belongs in a clinical value is the sender's call, so the
  library refuses rather than substituting or deleting one. The **record** layer deliberately still
  carries such a byte in every modeled value, and round-trips it exactly: only framing reserves it.
  The one position that does not keep it is the surplus of a header's delimiter declaration, which is
  not a modeled value and from which every control character is dropped on emit. Measured, 31 of the
  33 C0/`DEL` characters can reach that surplus and all 31 cost it; `CR` and `LF` end the record while
  it is being read, so no surplus ever holds them. The **whole** surplus is dropped rather than the
  offending character alone, because a subsequence of an opaque run is a different run, and none of it
  is reported, because emit returns a plain string.
- **No clinical judgement.** The library reports the abnormal flag and result status faithfully; it
  does **not** decide whether a value is "critical" or act on a correction/cancel.
- **No proof that an arbitrary delimiter set round-trips.** Emit refuses a set that fails one of the
  three conditions readback requires, and refuses any record whose own type letter the set being
  written with would escape away (`ASTM_EMIT_TYPE_LETTER_COLLISION`), so an emitted stream re-reads
  as the same record **types**. The second refusal is a transcoding condition rather than a
  judgement on the set you passed, so it also fires with **no** delimiter argument: a record read
  under a vendor's own set can carry a type letter the canonical set escapes away, and
  `serializeFramedAstm` refuses it too. That is not a guarantee that every field lands where it did: an escape sequence whose
  body is itself a delimiter is read as one opaque atom, so that delimiter never becomes a boundary
  and the fields after it shift, reported on the parse side as `ASTM_UNKNOWN_ESCAPE_SEQUENCE`. The
  low-level `encodeComponent` and `serializeField` helpers take no record and so carry neither
  guarantee. If you emit against a set of your own choosing rather than the canonical one, verify the
  round-trip on your own traffic.
- **No vendor-proprietary quirks absent from public specs.** The profile engine fully supports named
  vendor profiles, but a named per-vendor built-in ships **only** when a public, vendor-attributed
  quirk document grounds it. Inspection of the public reference corpus found the record layer
  spec-clean, so no named vendor profiles are asserted. This is a deliberate abstention, not an
  omission.
- **No POCT1-A, no HL7 v2, no "extended" vendor dialects as first-class.** Those are separate
  standards. A vendor that emits HL7 v2 instead of ASTM uses `@cosyte/hl7`.

## The standard, and its "archived" status

The normative standards are **CLSI LIS01-A2** (the low-level transfer protocol, formerly ASTM
E1381-02) and **CLSI LIS02-A2** (message content, formerly ASTM E1394-97). Both CLSI editions are
administratively **ARCHIVED**, "no longer reviewed through the consensus process but technically
valid and retained", and there is **no successor**. Archived is **not** the same as obsolete: these
are the de-facto in-force specs that shipping 2026 analyzers (Roche cobas, Sysmex XN, Siemens ADVIA,
Mindray, Snibe) still implement. `@cosyte/astm` targets the second editions.

## Licensing posture

- **The library is MIT.** Zero runtime dependencies; Node stdlib only.
- **We parse the wire format and ship our own code.** The CLSI standards are copyrighted and
  purchase-gated. We never copy CLSI's descriptive prose into code, JSDoc, or docs. Code **values** we
  encode (the HL7 Table 0078 abnormal-flag letters, the result-status letters) are **facts**, not
  CLSI's copyrighted text.
- **LOINC and SNOMED are not bundled.** LOINC is © Regenstrief (attribution, no alteration, `X`-prefix
  for local codes); SNOMED redistribution is IHTSDO-governed. Bundling either is a licensing decision
  we do not make for you: bring your own catalog.
- **Differential-tested against a permissively-licensed reference.** Conformance is checked firsthand
  against **python-astm** (BSD-3-Clause) on the checksum, the field/component split, and a
  cross-implementation frame decode, capturing its outputs once and vendoring none of its code. Where we are deliberately
  stricter (escape decoding, checksum validation, `Q` support), the difference is asserted on purpose.

## HIPAA posture

`@cosyte/astm` is **HIPAA-capable, not HIPAA-compliant**: compliance is a property of a system, not a
library. The `P` record concentrates PHI (name, mother's maiden name, birthdate, sex, IDs) and `C`
free text can carry it. Fixtures are **synthetic-only**; warnings and errors carry **positional
context only, never a value**; and a format-specific PHI scanner gates every change. Never log a raw
payload.
