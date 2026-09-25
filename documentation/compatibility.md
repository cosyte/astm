# ASTM compatibility in detail

What `@cosyte/astm` covers, and the three readings that cost a field boundary. `README.md`
keeps each heading below and links it here.

### What it covers

- **Records (E1394 / LIS02-A2).** `H`/`P`/`O`/`R`/`C`/`Q`/`M`/`S`/`L` are read with per-header
  delimiter self-declaration and escape decode, so an escaped delimiter inside a value reads as one
  component. Result semantics are modeled and fail-safe: abnormal flags graded against the HL7 v3
  ObservationInterpretation code system, result status (a correction `C` or cancel `X` never reads as
  active-final), reference ranges kept verbatim, and a missing unit flagged rather than defaulted.
  Every interpreted flag and status reports the vocabulary it was graded against, recognized or not,
  so an unknown code is distinguishable from one the library has not caught up to; the status letter
  set reports that **no citable published source** binds it. The practice-, laboratory-, and third patient IDs stay
  distinct; a `C` comment attaches to its parent by position and an orphan is surfaced, never dropped;
  a partial timestamp is preserved and flagged, never zero-filled. A `Q`-bearing message is classified
  as a host query and is never read as a result set, and `M`/`S` vendor QC and calibration records are
  surfaced verbatim rather than interpreted into clinical fields.
- **Framing and transport (E1381 / LIS01-A2).** `decodeAstmFrames` turns a framed byte stream into
  frames plus reassembled record bytes: it verifies the modulo-256 checksum (a bad frame is surfaced
  untrusted and never merged), tracks frame-number sequencing (a gap is never silently bridged), and
  reassembles the 240-byte-limited multi-frame records. `detectFraming` routes framed streams (serial,
  cobas 4800, Iguana) from raw ones (cobas b121, framing dropped), and `ltpReduce` is a pure,
  socket-free `ENQ`/`ACK`/`NAK`/`EOT` receiver state machine that NAKs a frame the codec did not vouch
  for rather than fabricating an ACK. `parseFramedAstm` composes both layers at the edge.
- **Emit.** `serializeAstmRecords` and `buildAstmMessage` emit canonical `H|\^&` records with embedded
  delimiters re-escaped and nothing clinical fabricated; `composeAstmFrames` and `serializeFramedAstm`
  frame them with computed checksums, frame numbers, and the 240-byte split. Both layers round-trip by
  construction, and a delimiter set that fails any of the three conditions readback requires (one
  character per separator, no `CR`/`LF`, no two the same) is a typed error rather than bytes written
  and lost. Those three read the set alone, so each record is additionally checked against the set it
  is written with: a separator equal to a record's own type letter escapes that letter away and the
  record re-reads as a different record, which is `ASTM_EMIT_TYPE_LETTER_COLLISION` rather than
  output. That second check is about **transcoding**, not about which set you asked for, so it can
  fire with no delimiter argument at all: a stream read under a vendor's own set may carry a record
  whose type letter the canonical set escapes away, and `serializeFramedAstm` refuses it for the same
  reason. A frame carries **bytes**, so a record handed to `composeAstmFrames` as a `string` is one
  byte per character and a character above `U+00FF` is a typed error too: the encoder will not pick a
  character encoding for you, and it never quietly writes a different character than the one you gave
  it. Encode such content yourself and pass the `Uint8Array`. A raw `STX`, `ETB` or `ETX` **byte** in a
  record is a typed error as well, in either form: those three are what the decoder reads as the shape
  of a frame, framing has no escape sequence for them, and writing one through truncated the frame at
  that byte, silently losing a whole record whenever the two bytes after it happened to be the short
  frame's checksum. The **record** layer still carries them, because a returned string is not yet on a
  wire and a raw-transport consumer round-trips such a value exactly. `startFrameNumber` lets you
  compose one transfer across several calls, and `composeAstmFrames` checks it before it reads a
  record: a frame's number is a single ASCII digit, so a value that is not a whole number from `0` to
  `7` is a typed error rather than whatever byte the arithmetic truncated to. The round trip above is
  the **default** start; a non-default one writes a continuation of a sequence already in progress,
  and a continuation read on its own opens on a frame-sequence gap, so its first record is warned
  about and not emitted.
- **Vendor profiles.** `defineAstmProfile()` builds a provenance-backed profile whose tolerances
  downgrade _expected_, non-safety-critical deviations to a `PROFILE_QUIRK_APPLIED` warning without
  ever altering a value, behind a safety gate that refuses to tolerate any result value, flag,
  status, range, or units warning, any patient or comment context, any message-kind ambiguity, any
  unrecognized record type, and any frame or transport integrity warning. The gate runs when a
  profile is defined **and** again when a warning would be downgraded, so a profile assembled as a
  plain object rather than through `defineAstmProfile()` gets the same answer. A profile can never
  make a bad checksum "ok", a cancelled result read "final", or quiet the warning that says a
  message boundary went unrecognized. Named per-vendor profiles await a public, vendor-attributed
  quirk document.
- **Terminology, bring your own.** `applyLivd(msg, catalog)` maps an analyzer's local test code to a
  LOINC from a consumer-supplied IICC LIVD catalog as an additive, advisory annotation that never
  mutates the raw code or value and never guesses a LOINC. The catalog is consulted whenever a
  vendor local code is present and is keyed on that code alone; a value in the Universal Test ID's
  first component is carried verbatim as an **unvalidated wire value**, never validated, never
  reported as a LOINC, and never used as a lookup key. No LOINC, SNOMED, or LIVD dictionary is
  bundled: the package stays a structural recognizer and you bring the catalog.

### An unescaped ampersand does not cost you the rest of the record

An escape sequence is the escape character, **one** body character, and the escape character again
(`&F&` `&S&` `&R&` `&E&`). An escape character that heads no such sequence is not an escape: it is
read as the literal character it is, it opens no atom, and `ASTM_UNPAIRED_ESCAPE_CHARACTER` reports
it. So `R|1|^^^687|28.6&|U/L||N||F` reads a value of `28.6&` with units `U/L` and status `final`,
and `O&Brien` in a surname keeps the patient's birth date and sex.

The parser does not decide what the sender meant by the character: it keeps the byte that arrived
and says so. The spec-clean way to send a literal escape character is `&E&`, which is what this
package's serializer emits, so a stream it produced never trips the code. The code is **tolerable**,
so a vendor profile can expect it on a feed that sends bare ampersands and still parse
`{ strict: true }`.

**One escape shape still costs a field boundary, and it has a code of its own.** A real
three-character sequence is opaque by design, which is what keeps `&F&` one token under a set that
names `F` as a delimiter. So where the body is an **unrecognized** character that is itself a
delimiter in force (`&|&` under the canonical set)
that delimiter does not split, and every field after it shifts: `R|1|^^^687|28.6&|&U/L||||F` reads a
value of `28.6&|&U/L` with no units and status `unspecified`. That reading is unchanged, and
narrowing the atom to change it would break the guarantee the atom exists for. What such a record now
raises, alongside the tolerable `ASTM_UNKNOWN_ESCAPE_SEQUENCE`, is
`ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`, which **no profile may tolerate**, so a
`{ strict: true }` parse refuses it even under the shipped `referenceCorpus`. The narrower code fires
only where the unrecognized body is one of the three splitting roles in force. Two exclusions are
deliberate: the escape role, because nothing splits on it, and every **recognized** mnemonic, because
`&F&` under a set naming `F` as the repeat delimiter is the sender escaping the field separator on
purpose, and reporting that would report the escape mechanism working as a defect.

Read it as a report, not a repair. It also does not survive a re-emit: the serializer rewrites the
preserved sequence into recognized mnemonics, and that stream says the same value unambiguously, so a
second-generation read is silent and is right about its own bytes. The first read of the wire bytes
is where the condition exists to be caught.

**The mirror of it costs a boundary in the other direction, and it also has a code of its own.**
Sequences are matched greedily and leftmost, so the escape character that closes one cannot also open
the next. Where it could have, the same bytes carry two alignments that disagree by one boundary:
`R|1|^^^687|28.6&Z&|&U/L||||F` reads a value of `28.6&Z&` and units of `&U/L` under the alignment
taken, and reads as a single unsplit field carrying both under the other. Every byte is preserved and
the leftmost reading is kept (picking the other one would be a different guess with no more evidence
behind it), but the boundary it hands you is a choice, so it raises
`ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT`, which **no profile may tolerate**. Both codes the condition
raised before (`ASTM_UNKNOWN_ESCAPE_SEQUENCE` and `ASTM_UNPAIRED_ESCAPE_CHARACTER`) are tolerable, so
a strict parse under a profile naming them used to accept it. Two exclusions again. A **recognized**
mnemonic before the delimiter is silent, because the reading taken interprets a construct (`&F&` is
the sender escaping a separator, which is what the mechanism is for) while the competitor's body is a
delimiter character the codec usually cannot interpret, so its own vocabulary prefers the reading
taken. That is **not** the same as the reading taken being conformant, and the exclusion is wider
than that argument: `28.6&F&|&U/L` reads a value of `28.6|` and units of `&U/L` while raising only
the tolerable `ASTM_UNPAIRED_ESCAPE_CHARACTER`, and a declared set naming a mnemonic letter as a
splitting delimiter makes both alignments interpret one construct each with neither preferred. The
first of those is covered by a second code, below; the second is measured and recorded as an open
residue. The other exclusion is a delimiter with no escape character two positions past it, which is
no competing alignment at all. What does fire is a subset of what already raises
`ASTM_UNKNOWN_ESCAPE_SEQUENCE`. It does not survive a re-emit either, for the same reason as its
mirror: catch it on the first read.

**And where that gained boundary is a FIELD boundary, it moves a result's status, which is a
different question and so a different code.** The two alignments resume one character apart, so they
disagree about the bytes after the boundary, not only about it (they can resync later, and the
class where they do is named below). Where the escape character the
reading taken resumes on heads no sequence this reader can _interpret_ (none at all, or one whose
body is not a recognized mnemonic and is therefore preserved verbatim rather than read), that
reading bought the boundary with bytes it cannot read while the competing alignment is the one that
can use them. On the field separator that
matters clinically: `R|1|^^^687|28.6&F&|&U/L||||F` reads **nine** fields under the alignment taken
and **eight** under the other, so the sender's trailing `F` lands in field 9, the result status,
under the first and in no field at all under the second. The parse hands back units of `&U/L` and a
status of **`final`**, and both are consequences of the alignment rather than values the sender put
in those slots. That raises `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS`, which **no profile may
tolerate**; before it existed the only warning on that stream was the tolerable
`ASTM_UNPAIRED_ESCAPE_CHARACTER`, so a strict parse under a legal profile accepted it. The reading is
unchanged: it reports the shift rather than repairing it. It is wired to the **field** separator
only, because a gained repeat or component boundary divides one field and so moves no field-indexed
slot. **That bound is a choice, not a consequence**: components are modeled inside a field, so a
gained repeat or component boundary does reach a modeled slot, and each of those two has a code of
its own below. It stays silent in exactly one case,
where the trailing escape character heads a sequence this reader RECOGNIZES: that is the escape
mechanism working, and refusing it would refuse well-formed traffic. That is the only tail on which
a stream's escaping can be clean, and so the only exclusion, **wherever the escape role is a
character distinct from the three splitting roles**. Where a header names the escape character in a
splitting role too, these codes can fire with neither escape report beside them, and what refuses the
stream is `ASTM_RECORD_DELIMITER_ROLE_COLLISION` instead. **That silence is a trade
and not a claim that nothing was lost there**: the gained field boundary is exactly as real, and on
that tail it is `warnings: []`, so `R|1|^^^687|28.6&F&|&F&U/L||||F` reads nine fields against the
competing alignment's eight and hands back a status of `final` with nothing reported at all. Read
the raw line when an escape character sits next to a delimiter, whether or not anything fired.
**The shift has one measured exception, and it is named rather than left to be found**: where the
sequence past the boundary carries the field separator itself as its body, the reading taken holds
that character inside an opaque atom while the competing alignment splits on it, so the two readings
read the **same number** of fields in **different places**. `R|1|^^^687|28.6&F&|&|&U/L||||F` reads
nine fields under both, with the status `F` in field 9 under both, and what differs is the units.
The code still fires there, which is over-reporting relative to the field indexes and never
under-reporting, and that class costs no stream its disposition, because
`ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` has already refused it. It does not survive a re-emit
either: catch it on the first read.

**And where that gained boundary is a REPEAT boundary, nothing shifts and the field can still be
read short.** What the report says is that the field is read as more repeats than the competing
alignment gives it. A field's modeled value and components are taken from its **first repeat
alone**, so where the gained boundary is the **first** one everything past it stays on the wire,
stays in `repeats`, and leaves every modeled slot. On the canonical set, `R|1|^^^687|28.6&S&\&U/L|U/L||||F` reads a value of `28.6^`
and drops `&U/L`, and `R|1|&F&\&687|28.6|U/L||||F` reads a Universal Test ID of one component
holding a decoded field separator, so the local code `687` is in no modeled slot and the record is
left with no code to key on at all, only an unvalidated wire value nobody wrote. A patient name
loses its given and middle names the same way. That raises `ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD`, which **no profile may tolerate**;
before it existed the only warnings on those streams were tolerable ones, so a strict parse under a
legal profile accepted a truncated value and an emptied test identity. The reading is unchanged: it
reports the gained boundary rather than repairing it. **At a LATER boundary it fires and no modeled
slot moves**, because the first repeat is then the same under both readings; that is over-reporting
relative to the modeled slots and never under-reporting, and it is measured rather than assumed. Its
tail bound is the shift report's, for the same reason, and so is its one exclusion:
`28.6&R&\&R&U/L` is the repeat separator escaped, written, and escaped again, and refusing it would
refuse a well-formed stream. **That silence is a trade, not a claim that nothing was lost**:
`28.6&S&\&S&U/L` still reads a value of `28.6^` with `warnings: []`. **The truncation has the same
one exception as the shift**: where the sequence past the boundary carries the repeat separator
itself, the two readings read the same number of repeats in different places, so the field is not
read as more repeats at all, and that class was already refused by
`ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`. It is wired to the **repeat** separator only; a gained
**component** boundary reaches a modeled slot differently, and has its own code below. It does not
survive a re-emit either: catch it on the first read.

**And where that gained boundary is a COMPONENT boundary, nothing leaves the record and the slots
MOVE.** Components are modeled inside a field, so every component after the gained boundary sits
further right than the competing alignment puts it, by a displacement that is **not fixed**: one
place where the field carries a single contested construct, one more for each additional one, and
none at all on the tie class. Counting warnings does not give it. On the canonical set,
`R|1|&F&^&GLU^L^687|28.6|U/L||||F` reads a Universal Test ID of four components, so `L` is the coding
scheme and `687` the vendor's local code; the competing alignment reads three, and `687` is the
**coding scheme**. A code-system selector and a vendor's local code are not the same thing.
`P|1||MRN-0001||DOE&F&^&JANE^A||19700101|F` reads a given name of `&JANE` and a middle name of `A`,
where the competing alignment makes `A` the **given** name with no middle name at all. That raises
`ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS`, which **no profile may tolerate**; before it existed the
only warning on either stream was the tolerable `ASTM_UNPAIRED_ESCAPE_CHARACTER`, so a strict parse
under a legal profile accepted both. The reading is unchanged: it reports the moved slots rather than
repairing them. **Every gained boundary at or before the last modeled component index moves them,
not only the first**, because the shift propagates to the end of the component list, which is where
this differs from the repeat role. **Two bounds run the other way and it fires inside both**,
over-reporting and never under: past the last modeled index nothing named moves (a name models three
components, a Universal Test ID four), and inside a later repeat nothing modeled moves at all. Its
tail bound is the other two reports', for the same reason, and so is its one exclusion, **and that
silence is a trade rather than a claim that nothing was lost**: `&F&^&F&GLU^L^687` still reads one
component more than the competing alignment, with `warnings: []`. **A THIRD bound runs the other way
here, and unlike the two above it is about the bytes past the boundary rather than where the
boundary sits**: where the sequence past it carries the component separator itself, the two readings
read the same number of components in different places, so `DOE&F&^&^&JANE^A` reads three components
under both with `A` the middle name under both, and that class was already refused by
`ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`. What holds wherever any of the three codes fires is
that the two readings disagree and that both consume every byte, so neither is forced. It does not
survive a re-emit either: catch it on the first read. With this the three splitting roles are all
wired, and there is no fourth: nothing splits on the escape role.

### A header that names one character in two delimiter roles

ASTM messages are self-describing: the `H` record declares the four delimiters and a conformant
reader follows them. A declaration whose **field** separator is also one of the other three is
refused outright, because the four roles would be indistinguishable. A declaration where two of the
_remaining_ three agree is still read, because the stream is readable and refusing it would drop
records the sender did send, but the boundary between those two roles is no longer in the bytes.

Under `H|^^&`, where the repeat and component roles are both `^`, a field a canonical sender would
have written as two repeats of two components reads back as four repeats of one component each.
Under `H|\&&`, where the component and escape roles are both `&`, the same character splits
(`A&B` is two components) or opens an escape atom (`A&F&B` is the single component `A|B`) depending
only on what follows it.

Such a header now raises `ASTM_RECORD_DELIMITER_ROLE_COLLISION`, at the header that put the set into
force, once rather than once per colliding pair. A later header restating the set already in force
warns nothing, on the same rule that governs the other delimiter warnings. The code is **not** tolerable. That matters
because every such set is by definition non-canonical, so the only warning it used to raise was
`ASTM_NONSTANDARD_DELIMITERS`, which is tolerable: a profile expecting an ordinary vendor set left a
`{ strict: true }` parse accepting a declaration whose own field tree cannot be recovered. Emit has
always refused these sets (`ASTM_EMIT_INVALID_DELIMITERS`), which is how the gap first showed: a
message that parsed clean threw when it was serialized back against its own declared delimiters.
