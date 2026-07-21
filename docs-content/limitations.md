---
id: limitations
title: What it does — and does not do
sidebar_position: 1
---

# What `@cosyte/astm` does — and does not do

A lab result drives treatment. A parser that silently hands back a wrong value, unit, flag, status, or
patient ID can cause harm. So this page is deliberately blunt about the promise and its edges. Read it
before you rely on the library — the **API Reference** is always the exact truth of what a given
release ships; this page is the honest shape of the whole.

## The promise (narrow, on purpose)

`@cosyte/astm` is **liberal on decode, conservative on emit, and never returns a confident wrong
value.**

- **Liberal decode.** Real vendor quirks become typed, value-free **warnings** with stable codes and
  positional context (record + field/component index, or frame number + byte offset) — not thrown
  errors and not silent data loss. A `{ strict: true }` mode escalates every tolerated deviation to a
  thrown error at an integration boundary.
- **Conservative emit.** The serializer always produces spec-clean output — canonical `H|\^&`
  delimiters, every embedded delimiter re-escaped, every checksum and frame number computed, never
  faked.
- **Fail-safe on ambiguity.** A missing unit, an unrecognized abnormal flag, a corrected/cancelled
  result, a bad checksum, an unparseable range — each surfaces as a typed warning or error. The
  library refuses to guess a value into existence.

## What it does **not** do

These are **non-goals**, not missing features — naming them so nothing over-trusts the parser.

- **No live connection management.** The library decodes and encodes byte streams and provides a
  **pure** LTP protocol reducer (`ltpReduce`), but it does **not** own a serial port or a socket. The
  I/O adapter and the interactive **timeout / retransmit timing** are the consumer's. The standard's
  exact numeric timeouts and retry counts live in the paywalled body and are modeled as *transitions,
  not timers*.
- **No unit semantics.** Units are surfaced as vendor **free text** — **not UCUM**, not normalized,
  not convertible. A numeric value with no units raises `ASTM_RECORD_UNITS_ABSENT`; a missing unit is
  never defaulted or guessed.
- **No terminology dictionary.** LOINC and SNOMED are **not bundled** (see licensing below). The
  Universal Test ID's LOINC slot is *recognized* when populated; vendor→LOINC mapping requires a
  **consumer-supplied** IICC LIVD catalog (`applyLivd`), and an unmapped code stays verbatim — never a
  fabricated LOINC.
- **No interpretation of `M` / `S` records.** Vendor-defined manufacturer / scientific records
  (QC, calibration, maintenance) are surfaced **verbatim** on `record.rawLine` and never parsed into
  clinical fields — a QC value must not read as a patient result.
- **No clinical judgement.** The library reports the abnormal flag and result status faithfully; it
  does **not** decide whether a value is "critical" or act on a correction/cancel.
- **No vendor-proprietary quirks absent from public specs.** The profile engine fully supports named
  vendor profiles, but a named per-vendor built-in ships **only** when a public, vendor-attributed
  quirk document grounds it. Inspection of the public reference corpus found the record layer
  spec-clean, so no named vendor profiles are asserted — this is a deliberate abstention, not an
  omission (the public-only policy, ADR 0018).
- **No POCT1-A, no HL7 v2, no "extended" vendor dialects as first-class.** Those are separate
  standards. A vendor that emits HL7 v2 instead of ASTM uses `@cosyte/hl7`.

## The standard, and its "archived" status

The normative standards are **CLSI LIS01-A2** (the low-level transfer protocol, formerly ASTM
E1381-02) and **CLSI LIS02-A2** (message content, formerly ASTM E1394-97). Both CLSI editions are
administratively **ARCHIVED** — "no longer reviewed through the consensus process but technically
valid and retained" — and there is **no successor**. Archived is **not** the same as obsolete: these
are the de-facto in-force specs that shipping 2026 analyzers (Roche cobas, Sysmex XN, Siemens ADVIA,
Mindray, Snibe) still implement. `@cosyte/astm` targets the second editions.

## Licensing posture

- **The library is MIT.** Zero runtime dependencies; Node stdlib only.
- **We parse the wire format and ship our own code.** The CLSI standards are copyrighted and
  purchase-gated. We never copy CLSI's descriptive prose into code, JSDoc, or docs. Code **values** we
  encode — the HL7 Table 0078 abnormal-flag letters, the result-status letters — are **facts**, not
  CLSI's copyrighted text.
- **LOINC and SNOMED are not bundled.** LOINC is © Regenstrief (attribution, no alteration, `X`-prefix
  for local codes); SNOMED redistribution is IHTSDO-governed. Bundling either is a licensing decision
  we do not make for you — bring your own catalog.
- **Differential-tested against a permissively-licensed reference.** Conformance is checked firsthand
  against **python-astm** (BSD-3-Clause) — checksum, field/component split, and cross-implementation
  frame decode — capturing its outputs once, vendoring none of its code. Where we are deliberately
  stricter (escape decoding, checksum validation, `Q` support), the difference is asserted on purpose.

## HIPAA posture

`@cosyte/astm` is **HIPAA-capable, not HIPAA-compliant** — compliance is a property of a system, not a
library. The `P` record concentrates PHI (name, mother's maiden name, birthdate, sex, IDs) and `C`
free text can carry it. Fixtures are **synthetic-only**; warnings and errors carry **positional
context only, never a value**; and a format-specific PHI scanner gates every change. Never log a raw
payload.
