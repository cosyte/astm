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
- **No terminology dictionary, and no LOINC validation of any kind.** LOINC and SNOMED are **not
  bundled** (see licensing below). Vendor→LOINC mapping requires a **consumer-supplied** IICC LIVD
  catalog (`applyLivd`), keyed on the vendor local code alone, and an unmapped code stays verbatim,
  never a fabricated LOINC. A value in the Universal Test ID's LOINC slot is surfaced verbatim as an
  **unvalidated wire value**: this package never checks it, never reports it as a LOINC, and never
  keys a result on it, so a first component that really is a LOINC is still only a value the library
  does not vouch for. It ships no LOINC table and could not check one if it wanted to.
- **No UCUM conformance: the unit comparison is verbatim and case sensitive.** Where a vendor code
  carries several candidate LOINCs, the candidate whose catalog `representativeUnit` is exactly equal
  to the units the record reported is selected, and that equality is a plain string comparison.
  Nothing is normalized, case folded, scaled or converted on either side, so `MG/DL` does not match
  `mg/dL`, `mg/L` never matches `ug/dL`, and a unit differing only in whitespace is a different unit.
  UCUM defines a case-insensitive variant of every terminal symbol and requires a program declaring
  full conformance to compare unit expressions by their **semantics**; this package declares no such
  conformance, and every unit-selected answer carries a `unitComparison` saying so rather than
  letting a matched unit read as a claim that was never made. A unit that matches no candidate,
  matches more than one, or is missing or unreadable leaves the answer `ambiguous` with every
  candidate surfaced and no LOINC chosen.
- **A `mapped` answer's `representativeUnit` is the catalog row's, not the record's.** It is
  provenance about the row the answer came from, and where a code carries a single candidate LOINC
  across several rows spelling the unit differently the answer takes the first row's attributes, so
  that field can name a unit the record did not report. Only `unitComparison` asserts the two were
  equal, and it is present only where a unit actually chose between candidates.
- **No matching on the vendor specimen or result description.** Both are carried verbatim beside the
  representative unit and surfaced for a human to read, and neither is ever compared against
  anything: the guide states directly that this information is not intended to be parsed by software
  that automates the mapping, so choosing on it would be a string guess.
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
- **No claim that a letter set is current.** The record grammar is frozen; the vocabularies whose
  letters travel in it are not. So every interpreted flag and status says what it was graded
  against, and one of the two answers is "nothing". See "Which vocabulary a letter was graded
  against" below.
- **No proof that an arbitrary delimiter set round-trips.** Emit refuses a set that fails one of the
  three conditions readback requires, and refuses any record whose own type letter the set being
  written with would escape away (`ASTM_EMIT_TYPE_LETTER_COLLISION`), so an emitted stream re-reads
  as the same record **types**. The second refusal is a transcoding condition rather than a
  judgement on the set you passed, so it also fires with **no** delimiter argument: a record read
  under a vendor's own set can carry a type letter the canonical set escapes away, and
  `serializeFramedAstm` refuses it too. That is not a guarantee that every field lands where it did: an escape sequence whose
  body is an unrecognized character that is itself a delimiter in force is read as one opaque atom,
  so that delimiter never becomes a boundary
  and the fields after it shift, reported on the parse side as
  `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` (not tolerable) alongside the tolerable
  `ASTM_UNKNOWN_ESCAPE_SEQUENCE`. Its mirror is outside the guarantee too: sequences are matched
  leftmost, so one can end where another could have begun and the delimiter between them splits
  where the competing alignment would have held it, gaining a boundary rather than losing one and
  reported as `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT` (also not tolerable). Where that gained
  boundary is a **field** boundary and the reading taken resumes on an escape character heading no
  sequence this reader can _interpret_ (none at all, or one whose body is not a recognized mnemonic
  and is therefore kept verbatim rather than read), every later field shifts and a
  result's units and **status** are read out of slots the competing alignment does not put them in,
  up to a status of `final` the sender never wrote there; that is
  `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS` (not tolerable either). It stays silent in exactly one
  case, where that trailing escape character heads a sequence this reader RECOGNIZES, which is the
  escape mechanism working and the only tail on which a stream's escaping can be clean, **wherever
  the escape role is a character distinct from the three splitting roles**. Where a header names the
  escape character in a splitting role too, these codes can fire with neither escape report beside
  them, and `ASTM_RECORD_DELIMITER_ROLE_COLLISION` is what refuses the stream. **That
  silence is a trade and not a claim that nothing was lost there**: the gained boundary is exactly as
  real, and on that tail it is `warnings: []`, so `R|1|^^^687|28.6&F&|&F&U/L||||F` reads nine fields
  against the competing alignment's eight with a status of `final` and nothing reported at all,
  `28.6&S&\&S&U/L` reads a value of `28.6^`, and `&F&^&F&GLU^L^687` reads one component more. Read
  the raw line when an escape character sits next to a delimiter, whether or not anything fired.
  **The shift itself has one measured exception, on all three roles**: where the sequence past the
  boundary carries the splitting delimiter itself as its body, the reading taken holds that
  character inside an opaque atom while the competing alignment splits on it, so the two readings
  read the **same number** of segments in **different places** and nothing moves index. The three
  codes still fire there, which is over-reporting and never under-reporting, and that class costs no
  stream its disposition, because `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` has already refused
  it. What holds wherever any of the three fires is that the two readings disagree and that both
  consume every byte. Where that
  gained
  boundary is a **repeat** boundary nothing shifts, and the field can still be read short: its
  modeled value and components come from its first repeat alone, so where the gained boundary is the
  **first** one `28.6&S&\&U/L` reads a value of `28.6^` and a Universal Test ID of `&F&\&687` reads
  one component holding a decoded field separator, with the local code in no modeled slot. That is
  `ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD` (not tolerable either), on the same tail bound; at a later
  boundary it fires and nothing modeled moves, which is over-reporting and never under-reporting. A gained
  **component** boundary reaches a modeled slot differently again, moving it along the component list
  rather than dropping it, so `&F&^&GLU^L^687` reads `687` as a vendor local code under the alignment taken
  and as the **coding scheme** under the other, and `DOE&F&^&JANE^A` reads `A` as a middle name under
  one and as the **given** name under the other. That is
  `ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS` (not tolerable either), on the same tail bound; there
  every gained boundary at or before the last modeled component index moves those slots and not only
  the first, while past that index (a name models three components, a test identity four) and inside
  a later repeat it fires and nothing named moves. **None of these
  reports survives emitting**: this package rewrites the preserved characters into recognized mnemonics, so
  a re-emitted stream carries the reading that was taken with nothing ambiguous left in it. The
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

## Which vocabulary a letter was graded against

The `R` record carries two single-letter vocabularies, the **abnormal flag** (field 7) and the
**result status** (field 9). The record grammar around them is archived and frozen; the vocabularies
themselves are maintained elsewhere, on other bodies' schedules. A parser that reports a letter as
`"undefined"` without saying what it compared against therefore hides a staleness: you cannot tell a
code **no published vocabulary defines** from a code **this library has not caught up to**.

So every interpreted flag and status carries a `vocabulary` attribution, present whether or not the
letter was recognized, and the two answers are deliberately different.

- **Abnormal flags are attributed.** They are graded against the HL7 v3 ObservationInterpretation
  code system, identifier `http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation`,
  version `4.0.0`, which carries the concepts kept aligned with the HL7 v2 Table 0078 interpretation
  codes. Read `flag.vocabulary.system` and `flag.vocabulary.version` rather than copying the strings.
  **That version says what this library compared against; it is not a claim about which version the
  sender meant**, and it is not a conformance statement about your instrument.
- **Result statuses are attributed to nothing, and say so.** `status.vocabulary.attributed` is
  always `false` and `status.vocabulary.reason` carries the fixed prose explaining why: the
  normative text that would bind that letter set is purchase-gated and has not been read here. A
  neighbouring HL7 table exists whose letters partly agree, and adopting it would be an assertion
  nothing in the public record supports, so this library declines to cite a source it cannot stand
  behind. **An unattributed set is not an absent attribution**: `attributed: false` is a positive
  statement, distinguishable from a field that is simply missing, and it never carries an identifier.

The eighteen abnormal-flag letters recognized are `L`, `H`, `LL`, `HH`, `<`, `>`, `N`, `A`, `AA`,
`U`, `D`, `B`, `W`, `S`, `R`, `I`, `HU` and `LU`; `ABNORMAL_FLAG_CODES` is the list itself. Other
concepts in that code system are deliberately **not** adopted, including the deprecated `H>` and
`L<` whose replacements `HU` and `LU` are. Recognition is **exact match** after the surrounding
whitespace is trimmed: `hu` is not `HU`, and the case variant is reported unrecognized rather than
widened in. Anything outside the list is surfaced verbatim, reported unrecognized, and **never
coerced to `normal`**, exactly as an unrecognized status is never coerced to `final`.

None of this reaches the wire: the attribution is interpretation output, and a parsed-then-serialized
record emits the same bytes it always did.

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
  encode (the abnormal-flag letters graded against HL7 v3 ObservationInterpretation, the
  result-status letters graded against nothing citable) are **facts**, not CLSI's copyrighted text.
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
