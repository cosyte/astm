<a href="https://cosyte.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cosyte.com/tile/cosyte-lockup-tile-on-dark-1200x300.png">
    <img alt="Cosyte: a plus mark set in two overlapping rounded squares, one solid and one outlined, beside the Cosyte wordmark" src="https://cosyte.com/tile/cosyte-lockup-tile-on-light-1200x300.png">
  </picture>
</a>

# @cosyte/astm

> ASTM parser, serializer, and builder for Node.js and TypeScript: **lenient on parse,
> spec-clean on emit**.

`@cosyte/astm` is a zero-dependency TypeScript toolkit that follows the cosyte parser archetype: a lenient
parser that turns real-world, vendor-quirky input into **warnings** rather than failures, paired with
a serializer that always emits spec-clean output (Postel's Law). It mirrors the API shape of the
reference parser, [`@cosyte/hl7`](https://github.com/cosyte/hl7).

> **Status:** published on npm, on the pre-alpha `0.0.x` ladder. Both layers are
> feature-complete, but the public surface can still change within `0.0.x`, before `0.1.0`.

## What it covers

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

## Decode a framed byte stream

```ts
import { decodeAstmFrames, parseFramedAstm, results } from "@cosyte/astm";

// A raw ASTM byte stream off a serial line or socket.
const { records, frames, warnings } = decodeAstmFrames(framedBytes);
frames[0]?.checksum.valid; // the modulo-256 checksum verdict (emitted uppercase, accepted lowercase)
warnings; // ASTM_FRAME_* deviations, each with a frame number + byte offset (never the record bytes)

// Or compose both layers: decode frames → parse the trusted, reassembled records.
const { message } = parseFramedAstm(framedBytes);
results(message)[0]?.value; // only checksum-verified frames ever reach the record parser
```

A checksum mismatch, a sequence gap, an unterminated frame, and an oversize (>240) frame are each a
**warning** in the default lenient mode (surfaced, flagged, never silently trusted) and a thrown
`AstmFrameStrictError` under `{ strict: true }`.

## Drive the transport (framed vs raw) + the LTP protocol

ASTM transport is not uniform: **serial** always frames, but over **TCP it varies within a single
vendor**, the cobas 4800 and Iguana keep the full `ENQ`/`ACK` + `STX`/checksum framing, while the
cobas b121 drops it and streams de-framed record bytes directly. Detect which you have, then drive the
pure protocol reducer with your own socket I/O.

```ts
import {
  detectFraming,
  decodeAstmFrames,
  parseAstmRecords,
  ltpInitialState,
  ltpReduce,
} from "@cosyte/astm";

// 1. Route by the stream's leading byte (STX/ENQ ⇒ framed; a bare record letter ⇒ raw).
const { framing } = detectFraming(leadingBytes); // "framed" | "raw"  (override: { override: "raw" })
if (framing === "raw") {
  // cobas b121 raw-TCP: no handshake, no frames, parse the record bytes directly.
  parseAstmRecords(rawBytes);
}

// 2. Framed transport: drive the pure receiver-side state machine. YOU own the socket + clock.
let state = ltpInitialState();
function onControlOrFrame(event) {
  const { state: next, actions, warnings } = ltpReduce(state, event);
  state = next;
  for (const a of actions) {
    if (a.type === "sendAck") socket.write(Uint8Array.of(0x06)); // ACK, only ever for a good frame
    if (a.type === "sendNak") socket.write(Uint8Array.of(0x15)); // NAK, bad checksum ⇒ retransmit
    if (a.type === "deliverRecord") parseAstmRecords(a.record); // a complete, trusted record
  }
  void warnings; // ASTM_LTP_*, value-free (a code + at most a frame number)
}
// Feed events as you read them: { type: "enq" }, { type: "frame", frame: decodeAstmFrames(b).frames[0] }, …
```

The reducer is deterministic and fully testable without a socket. Its inviolable rule: a frame the
codec did not vouch for (bad checksum, unterminated, or out of sequence) yields `sendNak`, **never** a
fabricated `sendAck`, and is **never** appended to a record. A `NAK` drives retransmit, not acceptance.
The interactive contention/timeout/retransmit **timing** is the consumer's: this layer models the
state transitions, not the wall-clock timers.

## Install

```bash
npm install @cosyte/astm
```

## Parse

```ts
import { parseAstmRecords, results, patient } from "@cosyte/astm";

// A de-framed ASTM record stream (CR-delimited records; the header declares the delimiters).
const msg = parseAstmRecords(raw);

results(msg)[0]?.value; // the measured value, surfaced raw
results(msg)[0]?.units; // vendor free-text units (a missing unit is a warning, never a default)
patient(msg)?.practiceAssignedId; // kept distinct from laboratoryAssignedId (the misfiling guard)
msg.warnings; // stable, value-free positional tolerance warnings (never throws on quirks)
```

The parser is **lenient by default** (vendor quirks become warnings, not failures) and refuses to
produce a confident wrong value: an embedded escaped delimiter reads as one component, an unknown
record type is surfaced (never dropped), and a missing unit is flagged (never defaulted). A
`{ strict: true }` mode escalates every tolerated deviation to a thrown error.

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

### Several messages in one stream

A message runs from its `H` header to its `L` terminator, so a stream can carry several. `messages()`
splits a parsed stream into them, and each entry carries only its own records, so a patient is only
ever paired with the results that message actually carried:

```ts
import { parseAstmRecords, messages } from "@cosyte/astm";

for (const m of messages(parseAstmRecords(raw))) {
  m.patient?.practiceAssignedId; // the P for THIS message
  m.results; // the Rs for THIS message
  m.delimiters; // the set THIS message's records were read with
}
```

The flat accessors above (`patient`, `results`, `orders`, `comments`, `query`) read the whole stream,
so they **throw** `AstmAmbiguousStreamError` on a stream they cannot answer for rather than answering
across patients:

- `ASTM_AMBIGUOUS_MULTI_MESSAGE` from any of the five, when the stream carries more than one message.
- `ASTM_AMBIGUOUS_MULTI_PATIENT` from `patient()` only, when a **single** message carries more than
  one `P` record. "The first `P`" is a guess about whose result it is, so it is refused there too.

**Both are breaking**, and the second one reaches single-message callers: a lone message carrying
several patients used to answer with the first of them. A stream that is one message with at most one
patient is unchanged, and so is a result-only message with no `P` at all, which still answers
`undefined`. `commentsFor()` is unchanged on every stream, because the parent record you hand it
already names the message.

Splitting reads each record's type letter, so check for an `ASTM_RECORD_UNKNOWN_TYPE` warning before
you trust the split. A header the reader does not recognize as a header, one carrying a stray leading
byte for instance, opens no message, and the messages either side of it merge back into one, so a
patient can end up holding results that arrived under a different header. The
parser warns on that record and a `{ strict: true }` parse refuses the stream. That warning is the
only report the merge produces, so a profile is not allowed to tolerate it: the code is refused when
a profile is defined, and a warning carrying it is not downgraded whatever profile is in force. Do
not gate on the warning count, though, because the records that merged in can raise warnings of
their own.

Delimiters are re-read at each header too, so if the unrecognized one declared a different set, the
records after it are read with the previous set and their fields can be lost rather than merely
misfiled. `ASTM_RECORD_FIELDS_UNSEPARATED` reports a record that suffered the total form of that:
the delimiters in force found no field separator in it at all, so the whole line read back as one
field and none of its modeled fields survived. On a result record that is the value, the units and
the status at once, so treat it as a lost result, not a formatting nit. The fields are never
reconstructed, because the set the sender used is unknown and guessing at it would invent data. The
code is safety-critical, and it does not need a mangled header to fire: a lone record written in
another set trips it too.

**Its absence does not certify that a record was read in its own set**, and this is the important
half. The check tests one of the four delimiter roles, the **field** separator, and only in its
total form, where no unescaped separator occurs in the line. Two classes of the same loss sit
outside it:

- A foreign set whose **field** separator happens to occur somewhere in the line still splits, on
  the wrong boundaries and in silence. A single stray `|` in an otherwise `*`-separated result loses
  the value, the units and the status with no warning at all, while the identical record without
  that one byte is reported. This also happens **inside** a run of these warnings, so even a run
  does not mean every record in it was checked.
- A set differing in the **repeat, component or escape** role usually splits into fields normally,
  and the damage then varies. A mis-split component can cost a test identity while the value and
  units survive. The escape role's worst case has **narrowed, not gone**: a bare escape character no
  longer merges the rest of the record (it reads as a literal and raises
  `ASTM_UNPAIRED_ESCAPE_CHARACTER`), but an `&X&` sequence whose body is an unrecognized character
  that is itself a delimiter in force is an opaque
  atom, so that delimiter does not split and the value, the units and the status can still go
  together. That one raises `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`, which is not tolerable,
  alongside the tolerable `ASTM_UNKNOWN_ESCAPE_SEQUENCE`. The split itself is unchanged. Its mirror,
  where the leftmost alignment lets a delimiter split that a competing alignment would have held,
  gains a boundary instead of losing one and raises `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT`, also
  not tolerable. Where that gained boundary is a **field** boundary and the reading taken resumes on
  an escape character heading no sequence it can interpret, every later field shifts and a
  result's units
  and status are read out of slots the other alignment does not put them in: that raises
  `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS`, not tolerable either. Where it is a **repeat** boundary
  nothing shifts, but the field is read out of its first repeat alone, so a gained first boundary
  truncates a value and costs a test identity or a patient name the components that sat after it:
  that raises `ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD`, not tolerable either. Where it is a
  **component** boundary nothing leaves the record and every component after it moves along the
  component list, so a coding scheme, a vendor local code or a given name is read out of a position the other
  alignment does not put it in: that raises `ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS`, not
  tolerable either.

All are accepted limits, for two different reasons: widening the field-separator check would mean
deciding which set a record ought to have had, which is the same guess the parser declines to make
elsewhere, and narrowing the escape atom would break the guarantee it exists for. So they are
written down rather than papered over. Read the warning as "this record definitely lost its
fields", never as "no other record did". If
delimiter drift is a real risk on your feed, parse with `{ strict: true }`, which refuses both an
outright collapse and an unrecognized type letter, and treat `ASTM_RECORD_UNKNOWN_TYPE` as
invalidating what follows it rather than expecting this warning to enumerate the damage.

An unrecognized type letter also makes the message **kind** unknowable, because the letter that
could not be read may have been the very `Q` that decides it. `classification.kind` is
`indeterminate` in that case rather than `results` or `orders`, and `classification.hasUnrecognized`
says why. A `Q` that was read still wins outright.

## Map local codes to LOINC (LIVD, bring-your-own)

An analyzer sends a proprietary local test code in the Universal Test ID; a standard LOINC is mapped
downstream. Supply your own IICC LIVD ("LOINC to Vendor IVD") catalog and annotate a message, the
mapping is **additive and advisory**: it never touches the raw code or value, and an unmapped or
ambiguous code is surfaced as such, **never a guessed LOINC**.

```ts
import { parseAstmRecords, defineLivdCatalog, applyLivd } from "@cosyte/astm";

// Your LIVD catalog: the vendor transmission code (Vendor Analyte Code) → LOINC.
const catalog = defineLivdCatalog([{ vendorCode: "687", loinc: "1920-8", loincLongName: "AST" }]);

const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
const { annotations, warnings } = applyLivd(msg, catalog);

annotations[0]?.mapping; // { status: "mapped", loinc: "1920-8", loincLongName: "AST", source: "livd", derived: true }
warnings; // ASTM_LIVD_UNMAPPED_CODE / ASTM_LIVD_AMBIGUOUS_MAPPING (value-free) for codes with no single LOINC
```

**Your catalog answers the analyte-identity question, and the wire never does.** The Universal Test
ID's first component is a LOINC slot, and the guide this catalog format comes from puts transmitting
LOINC directly from IVD instruments explicitly out of scope: the analyte arrives as a vendor-defined
code. So the lookup happens whenever a vendor local code is present, keyed on that code alone, and a
populated first component neither answers for it nor selects among candidates. **This package
performs no LOINC validation of any kind**: it never decides whether such a value "looks like" a
LOINC, so `Glucose` and `2345-7` there are treated identically. The value is carried verbatim as
`unvalidatedWireValue`, on every disposition, and is never reported as a LOINC.

```ts
const msg = parseAstmRecords("H|\\^&\rR|1|Glucose^^^687|28.6|U/L||N||F\rL|1\r");
const [a] = applyLivd(msg, catalog).annotations;

a?.mapping.status; // "mapped": your catalog vouched for 1920-8 (the lookup used "687")
a?.reportedCode; // "687": the code the catalog was consulted WITH, verbatim
a?.unvalidatedWireValue; // "Glucose": carried verbatim, vouched for by nothing
a?.wireValueDisagreesWithCatalog; // true: the two differ, and that is ALL this says
```

`mapping.status` is a closed discriminant, so a `switch` over it is exhaustive:

| `status`         | what happened                                                                            | warning                       |
| ---------------- | ---------------------------------------------------------------------------------------- | ----------------------------- |
| `mapped`         | your catalog vouched for exactly one LOINC for the vendor local code                     | none                          |
| `unmapped`       | the vendor local code was looked up and your catalog held no entry                       | `ASTM_LIVD_UNMAPPED_CODE`     |
| `ambiguous`      | several distinct LOINCs the reported units did not settle; all surfaced, **none chosen** | `ASTM_LIVD_AMBIGUOUS_MAPPING` |
| `no-vendor-code` | component 1 is populated and there is no vendor local code: nothing was looked up        | none                          |
| `no-code`        | the Universal Test ID carried no code at all                                             | none                          |

`unvalidatedWireValue` and `wireValueDisagreesWithCatalog` sit **beside** that discriminant and can
accompany any of its cases. `wireValueDisagreesWithCatalog` is `true` only where your catalog
vouched for exactly one LOINC, component 1 is populated, and the two are not byte-identical; it is
`false` everywhere else and is never absent, so an ordinary `R|1|^^^687|...` record ships no
standing false disagreement. **It reports the difference and nothing else**: both values stay
surfaced, neither is marked correct, neither is rewritten, and nothing here says the difference was
settled. Deciding which source to believe is a clinical judgement this library will not make for
you.

Two corners worth knowing before you write a catalog adapter: a `lookup` that **throws** propagates
to your caller unchanged rather than reading as a catalog miss (your crash must not be
indistinguishable from "this code is not in the catalog"), and a hit whose `loinc` is a zero-length
string is reported as a miss rather than as a vouched-for empty LOINC.

### One vendor code, several LOINCs: the units decide

One vendor analyte code mapping to several LOINCs is the **ordinary** case, not an edge: the guide
this catalog format comes from gives the commonest chemistry analytes as its own worked examples, a
serum glucose reported as a mass concentration versus a substance concentration, and a urine analyte
reported as a spot concentration versus a 24 hour excretion rate. Its remedy is a mapping per unit,
so a catalog row can carry a **representative unit of measure** beside the vendor code, and the
`R` record already states its units on the wire.

```ts
import { parseAstmRecords, defineLivdCatalog, applyLivd } from "@cosyte/astm";

const glucose = defineLivdCatalog([
  { vendorCode: "GLU", loinc: "2345-7", representativeUnit: "mg/dL" },
  { vendorCode: "GLU", loinc: "14749-6", representativeUnit: "mmol/L" },
]);

const msg = parseAstmRecords("H|\\^&\rR|1|^^^GLU|5.5|mmol/L||N||F\rL|1\r");
applyLivd(msg, glucose).annotations[0]?.mapping;
// { status: "mapped", loinc: "14749-6", representativeUnit: "mmol/L",
//   unitComparison: { comparison: "verbatim-case-sensitive", ucumSemantic: false, ... },
//   source: "livd", derived: true }
```

**The comparison is verbatim and case sensitive, and it is not UCUM.** A catalog saying `mg/dL` does
not match a feed saying `MG/DL`, and it never matches `g/L` however convertible the two are: nothing
is normalized, case folded, scaled or converted on either side. UCUM defines a case-insensitive
variant of every terminal symbol and requires a program claiming full conformance to compare unit
expressions by their **semantics**, so this is a deliberately limited choice, the only comparison
that cannot invent an equivalence. Because you could otherwise read a matched unit as a conformance
claim this package does not make, every unit-selected answer carries `unitComparison` saying exactly
what was compared.

Refusing still beats guessing, so all four of these are `ambiguous` with **every candidate surfaced
and no LOINC chosen**: the units match no candidate, they match more than one, the record reported no
units (absent, empty, or whitespace only) and the candidates differ only by unit, or the units could
not be read at all because the record was truncated or malformed. An unreadable units field reads as
"no units reported": you still get a typed annotation, never an exception and never a dropped record.
The answer's `reason` says which case it was, and `candidateDetails` carries each candidate row's
LOINC and LIVD attributes so a human can choose what this package will not.

A candidate whose `representativeUnit` is **absent, empty or whitespace only** is not unit qualified:
it is never selected by a unit comparison, and it is still surfaced among the candidates. And a
vendor code carrying exactly **one** candidate LOINC is answered whether or not the units agree, with
no `unitComparison`, because no unit chose anything there.

On a `mapped` answer, `representativeUnit` is provenance about the **catalog row** rather than a
restatement of what the record reported: where a code carries a single candidate LOINC across several
rows that spell the unit differently, the answer takes the first row's attributes, so that field can
name a unit the record did not report. **Only `unitComparison` says the two were equal**, and it is
present only where a unit actually chose between candidates. Branch on that field, not on this one.

Two attributes ride along and are **never matched on**: `vendorSpecimenDescription` and
`vendorResultDescription`. Both are free text, and the guide states directly that this information is
not intended to be parsed by software that automates the mapping, so they are stored and surfaced
verbatim for a human to read. Only the representative unit ever selects. All three attributes are
**optional**: a catalog carrying none of them answers exactly as it did before they existed, for
`mapped`, `unmapped` and `ambiguous` alike.

**No LOINC / SNOMED / LIVD dictionary is bundled.** LOINC is © Regenstrief (redistributable only with
its attribution notice) and the public CDC LIVD file is SARS-CoV-2-specific and carries
separately-licensed SNOMED CT, so the package ships no terminology data and you bring the catalog (and
its license obligations).

> **Scope your catalog to the source device fleet.** The ASTM Universal Test ID carries no manufacturer
> to disambiguate against, so the catalog keys on the vendor transmission code alone. Two different
> instruments that reuse the same code for different analytes would both match: supply a catalog built
> for the analyzers you actually receive from. (Conflicting entries _within_ one catalog are caught and
> surfaced as `ambiguous`, never resolved to a guess.)

## The cosyte parser archetype

- **Postel's Law**: liberal parser (lenient default + warnings), conservative serializer (always
  spec-clean), so quirks don't propagate downstream on round-trip.
- **Tiered tolerance**: Tier 0/1 silent, Tier 2 warning + recovery (escalates in strict mode),
  Tier 3 fatal always.
- **Stable warning codes**: warnings carry stable string codes + positional context; consumers
  branch on `w.code`, so renaming a code is a breaking change.
- **Zero runtime dependencies**: Node stdlib only (healthcare integrations vet every dependency).
- **Dual ESM + CJS**: built with `tsup`, validated with `attw`.
- **Immutability**: parsed models are immutable; mutation is via explicit methods.
- **Profile system**: a `defineAstmProfile()` API for vendor quirks, with built-in profiles authored
  through the same public API. A profile only ever downgrades an _expected_, non-safety-critical warning
  to `PROFILE_QUIRK_APPLIED` (it never alters a value) and may force the raw-vs-framed transport; a
  default-deny safety gate refuses to tolerate any safety-critical deviation at definition time.
- **Terminology recognizer, not a dictionary.** LIVD-aware LOINC recognition is bring-your-own
  (`applyLivd` over a consumer-supplied catalog): additive, advisory, and never a guessed LOINC. The
  catalog answers for the analyte identity, never the wire, and no LOINC validation of any kind is
  performed. No LOINC / SNOMED / LIVD data is bundled.

## License

MIT © Cosyte
