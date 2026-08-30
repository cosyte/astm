---
id: quickstart
title: Quickstart
sidebar_position: 1
---

# Quickstart

Parse an ASTM/CLSI-LIS02 record stream and read a result in a few lines. `@cosyte/astm` is **lenient
by default** (Postel's Law): real-world, vendor-quirky input parses into an immutable message plus a
list of tolerance **warnings**, rather than throwing, and it never hands you a confident wrong value.

## Parse a result upload

```ts runnable
import { parseAstmRecords, results } from "@cosyte/astm";

// A de-framed ASTM record stream: header (declares the delimiters) + patient + order + result + end.
const raw = "H|\\^&\rP|1|PRAC|LAB\rO|1|ACC\rR|1|^^^687|28.6|U/L||N||F\rL|1|N\r";
const msg = parseAstmRecords(raw);

const first = results(msg)[0];
first?.value; // => "28.6"
```

`parseAstmRecords` reads the four delimiters **from the header** (never hardcoded), decodes embedded
escapes before splitting a value, and keeps the practice- and laboratory-assigned patient IDs
distinct. Each warning carries a **stable code** you can branch on:

### More than one message in a stream

A message runs from its `H` header to its `L` terminator, so a stream can carry several back to
back, and each header declares the delimiters for the records that follow it. If a later header
declares a **different** set, those records are read with the new set and you get an
`ASTM_RECORD_DELIMITERS_REDECLARED` warning pointing at that header; records already read keep the
set they were read with. A header that simply restates the delimiters already in use is normal and
warns nothing. If a later header's declaration is unusable, the delimiters already in force are kept
and you get `ASTM_RECORD_UNREADABLE_REDECLARATION`: no set is ever guessed and no record is dropped.

A declaration that names **one character in two roles** is a third case. If the field separator is
one of the other three, the declaration is unusable and the two rules above apply. If two of the
remaining three agree, the set is read and honored, but the boundary between those two roles is gone
from the bytes, and you get `ASTM_RECORD_DELIMITER_ROLE_COLLISION` at that header. Under `H|^^&`, for
instance, a field a canonical sender would have written as two repeats of two components reads back
as four repeats of one component each. That code is **not** tolerable: every such set is
non-canonical, so before it existed the only warning was the tolerable `ASTM_NONSTANDARD_DELIMITERS`
and a profile expecting an ordinary vendor set left a strict parse accepting it. Emit refuses the
same sets (`ASTM_EMIT_INVALID_DELIMITERS`).

Read each header's own set from `header.delimiters`; `msg.delimiters` is the first header's.

### Reading a stream that carries several messages

Use `messages()`. It splits a parsed stream into the messages it actually contains, so a patient and
a result are only ever paired inside the message that carried both:

```ts runnable
import { parseAstmRecords, messages } from "@cosyte/astm";

const two =
  "H|\\^&\rP|1|PRAC-1\rR|1|^^^687|10.0|U/L||N||F\rL|1|N\r" +
  "H|\\^&\rP|1|PRAC-2\rR|1|^^^688|99.9|U/L||H||F\rL|1|N\r";

const pairs = messages(parseAstmRecords(two)).map(
  (m) => `${m.patient?.practiceAssignedId}:${m.results[0]?.value}`,
);
pairs.join(" "); // => "PRAC-1:10.0 PRAC-2:99.9"
```

Each entry carries its own `header`, `delimiters`, `records`, `patient`, `patients`, `results`,
`orders`, `comments`, and `queries`. `messages()` never throws, and on an ordinary single-message
stream it yields exactly one entry.

> **The flat accessors refuse a stream they cannot answer for.** `patient()`, `results()`,
> `orders()`, `comments()`, and `query()` read the whole stream, so on a multi-message stream they
> throw `AstmAmbiguousStreamError` (`ASTM_AMBIGUOUS_MULTI_MESSAGE`) instead of answering across
> patients. `patient()` also throws (`ASTM_AMBIGUOUS_MULTI_PATIENT`) when a single message carries
> more than one `P`, because "the first `P`" is a guess about whose result it is. **That second one
> reaches single-message callers**: a lone message carrying several patients used to answer with the
> first of them, and now refuses. A stream that is one message with at most one patient is unchanged,
> as is a result-only message with no `P`, which still answers `undefined`. `commentsFor()` works on
> any stream: the parent record you hand it already names the message.

> **Check for an `ASTM_RECORD_UNKNOWN_TYPE` warning before you trust a split.** Grouping reads each
> record's type letter, so a header the reader does not recognize as a header, one carrying a stray
> leading byte for instance, opens no message and the messages either side of it merge, so a patient
> can end up holding results that arrived under a different header. The parser
> reports that record as an unsupported record and warns, and a `{ strict: true }` parse refuses the
> stream outright. That warning is the only report the merge produces, so a profile is **not**
> allowed to tolerate it: naming it in `tolerate` throws from `defineAstmProfile()`, and a warning
> carrying it is not downgraded whatever profile is in force. Match on the code rather than gating
> on the warning count, because the records that merged in can raise warnings of their own. Reading
> it as cosmetic noise is what puts a patient back next to somebody else's result.

```ts
import { parseAstmRecords, WARNING_CODES } from "@cosyte/astm";

const { warnings } = parseAstmRecords(raw);

for (const w of warnings) {
  if (w.code === WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE) {
    // an unrecognized record, surfaced as an unsupported record and not dropped.
    // If it was a header, this stream has one fewer message than it looks like.
  }
  if (w.code === WARNING_CODES.ASTM_RECORD_FIELDS_UNSEPARATED) {
    // this record did not split: treat its modeled fields as lost, not as absent.
  }
}
```

> **`ASTM_RECORD_FIELDS_UNSEPARATED` means a record lost its fields, not that it was formatted
> oddly.** Delimiters are re-read at each header, so a header the reader did not recognize does not
> re-scope them, and the records after it are read with the previous set. When that set's field
> separator does not occur in a record at all, the whole line comes back as one field and none of its
> modeled fields survive. On a result record that costs the value, the **units** and the **status**
> together, and the result then reads as though it simply never carried them. The parser warns once
> per affected record, surfaces the raw line intact, and **never** re-splits it on a set no header
> declared, because that would invent data. A `{ strict: true }` parse refuses, and no profile may
> tolerate the code. This does not need a mangled header to happen: a lone record written in another
> set trips it too.
>
> **The absence of this warning is not a guarantee that a record split correctly**, and that is the
> half worth carrying away. It tests one of the four delimiter roles, the **field** separator, and
> only in its total form, where no unescaped separator occurs in the line. Two classes of the same
> loss sit outside it. A foreign set whose **field** separator happens to appear somewhere in the
> line still splits, on the wrong boundaries and silently: one stray `|` inside an otherwise
> `*`-separated result loses the value, the units and the status with **no** warning, and this can
> happen to one record **inside** a run of these warnings, so a run does not mean every record in it
> was checked. And a set differing in the **repeat, component or escape** role usually splits into
> fields normally, with the damage varying: a mis-split component can cost a test identity while the
> value survives, and an `&X&` sequence whose body is an unrecognized character that is itself a
> delimiter in force is an opaque atom, so that
> delimiter does not split and the value, units and status can go together. A bare escape character
> is no longer in that group (it reads as a literal and raises `ASTM_UNPAIRED_ESCAPE_CHARACTER`);
> the atom case remains, and now raises `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`, which is not
> tolerable, alongside the tolerable `ASTM_UNKNOWN_ESCAPE_SEQUENCE`. Its mirror, where the leftmost
> alignment lets a delimiter split that a competing alignment would have held, gains a boundary
> instead of losing one and raises `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT`, also not tolerable.
> Where that gained boundary is a **field** boundary and the reading taken resumes on an escape
> character heading no sequence it can interpret, every later field shifts, so a result's
> units and status
> are read out of slots the other alignment does not put them in and a status can read `final` where
> the sender wrote nothing in that slot: `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS`, not tolerable
> either. Where it is a **repeat** boundary nothing shifts, and the field can still be read short,
> because its modeled value and components come from its first repeat alone: a gained **first**
> boundary truncates a value and costs a Universal Test ID or a patient name the components that sat
> after it. That is `ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD`, not tolerable either. Where it is a
> **component** boundary nothing leaves the record and no field number changes, and every component
> after it moves along the component list, so a test identity's coding scheme and local code, and a patient's
> given and middle names, are read out of positions the other alignment does not put them in. That is
> `ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS`, not tolerable either, and it completes the set: those
> three are the three roles a split is taken on. **All three shift claims have one measured
> exception**: where the sequence past the boundary carries the splitting delimiter itself as its
> body, the two readings read the same number of segments in different places, so nothing moves
> index and what differs is the contents; the codes still fire there, and that class was already
> refused by `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`. All are
> accepted limits: widening the field-separator check would mean deciding which set a record ought
> to have had, which is a guess this parser does not make, and narrowing the escape atom would break
> the guarantee it exists for, so the boundary is documented instead. If delimiter drift is a real
> risk on your feed, parse with
> `{ strict: true }`, which
> refuses both an outright collapse and an unrecognized type letter, and treat
> `ASTM_RECORD_UNKNOWN_TYPE` as invalidating what follows it rather than expecting this warning to
> enumerate the damage.

> **About runnable examples.** The first block above is tagged ` ```ts runnable `: the docs
> build extracts it, runs it against the package, and asserts the `// =>` result, so a documented
> example can never silently drift from the code.

## Read a result safely: status, flag, range

A result carries the raw fields **and** a modeled, fail-safe view alongside them. The rule is _never
a confident wrong value_: a corrected or cancelled result never reads as active-final, an unrecognized
abnormal flag is never coerced to "normal", and an unparseable reference range never fabricates a
bound.

```ts runnable
import { parseAstmRecords, results } from "@cosyte/astm";

// A correction (status `C`) that supersedes a previously transmitted value.
const raw = "H|\\^&\rO|1|ACC\rR|1|^^^687|30.1|U/L|10-40|H||C\rL|1|N\r";
const r = results(parseAstmRecords(raw))[0];

r?.status.meaning; // => "correction"
```

The `status` object is **always present** (an absent status field is typed `unspecified`, never
assumed `final`), so `status.isActiveFinal` is a reliable boolean, `true` only for a plain `F`:

```ts
import { parseAstmRecords, results } from "@cosyte/astm";

const r = results(parseAstmRecords(raw))[0];

r?.status.isActiveFinal; // false, a correction is not active-final
r?.status.supersedes; // true, this value replaces a prior one
r?.flag?.meaning; // "above-normal"; an unknown flag → "undefined", never "normal"
r?.range?.kind; // "closed" (low "10", high "40"); an unparseable range → "unparsed", no invented bound
```

Both interpreted views also say **what they were graded against**, present whether or not the letter
was recognized, so an unknown code is distinguishable from one this library has not caught up to:

```ts
import { parseAstmRecords, results } from "@cosyte/astm";

const r = results(parseAstmRecords(raw))[0];

r?.flag?.vocabulary.attributed; // true: the flag letters have a named code system
r?.flag?.vocabulary.system; // its identifier
r?.flag?.vocabulary.version; // the version THIS LIBRARY compared against, not what the sender meant
r?.status.vocabulary.attributed; // false: no citable published source binds the status letters
r?.status.vocabulary.reason; // fixed prose saying so
```

> Units are vendor **free text**, never UCUM. A _numeric_ result value with no units raises an
> `ASTM_RECORD_UNITS_ABSENT` warning: a missing unit is flagged, never defaulted, guessed, or
> converted. The reference-range delimiter is `[OSS-derived]`; anything that
> does not match `low-high` / `<high` / `>low` is surfaced verbatim. Flag recognition is exact-match
> after trimming, so `hu` is not `HU`; see the limitations page for the vocabularies and the
> eighteen letters recognized.

## Tell a query apart from a result upload

A `Q` (request-information) record means the message is a **host-query request**, not a result set,
so it must never be read as one. `parseAstmRecords` classifies every message up front; gate on
`classification.isHostQueryRequest` before treating records as results.

```ts runnable
import { parseAstmRecords, query } from "@cosyte/astm";

// An H/P/Q/L host-query request asking for all tests on a specimen.
const raw = "H|\\^&\rP|1\rQ|1|^SPEC-7|^SPEC-7|ALL\rL|1\r";
const msg = parseAstmRecords(raw);

msg.classification.kind; // => "host-query"
```

The `Q` **dominates**: even a message that (anomalously) carries both a `Q` and an `R` is classified
`host-query` and flagged, a query is never silently read as a result upload.

That rule is a count of record type letters, so it holds only while every letter was legible. If any
record's type is unsupported and no `Q` was read, the kind is **withheld**: `classification.kind` is
`indeterminate` rather than `results` or `orders`, and `classification.hasUnrecognized` is `true`.
The unreadable letter may have been the `Q`, and answering `results` over it is exactly the
misreading this rule exists to prevent, so the parser declines to answer instead of guessing which
letter was sent. The `hasQuery` / `hasResults` / `hasOrders` counts stay truthful throughout, so a
caller that wants the raw tally still has it, and `isHostQueryRequest` being `false` is not a warrant
that a message is a result set: read `kind` for that. A `Q` that **was** read still dominates, since
an unreadable letter can only add a kind, never remove the query already on the wire.

The `Q` record's range
IDs, the `ALL` keyword, and the request-information status codes are surfaced **verbatim** and flagged
`[OSS-derived]` (their exact structure is paywalled), never guessed.

`M` (manufacturer) and `S` (scientific) records carry vendor-defined QC / calibration / maintenance
data. They are surfaced **verbatim** on `record.rawLine` and **never** interpreted into clinical
fields: a QC value must not be read as a patient result.

## Decode a framed byte stream

The record examples above assume **de-framed** record bytes. When you receive a raw ASTM byte stream
straight off a serial line or socket, it arrives wrapped in **E1381/CLSI-LIS01 frames**
(`<STX> FN text <ETB|ETX> CS <CR><LF>`) with a modulo-256 checksum and a frame number. `decodeAstmFrames`
verifies each checksum, tracks the frame-number sequence, and reassembles multi-frame records; a
bad-checksum frame is surfaced **flagged untrusted and never merged**, and a sequence gap is **never
silently bridged**.

```ts runnable
import { decodeAstmFrames } from "@cosyte/astm";

// One final (ETX) frame carrying the record text "L|1\r", with its correct checksum "3A".
const bytes = new Uint8Array([0x02, 0x31, 0x4c, 0x7c, 0x31, 0x0d, 0x03, 0x33, 0x41, 0x0d, 0x0a]);
const { frames } = decodeAstmFrames(bytes);

frames[0]?.checksum.valid; // => true
```

`parseFramedAstm` composes the two layers at the edge: decode the frames, then parse the trusted,
reassembled records into a message in one call. Only frames the framing layer vouched for reach the
record parser, so a corrupted frame can never become a confident wrong value:

```ts
import { parseFramedAstm, results } from "@cosyte/astm";

const { message, frames, frameWarnings } = parseFramedAstm(framedBytes);

frameWarnings; // bad checksum / sequence gap / unterminated / oversize, each with a frame number + offset
results(message)[0]?.value; // parsed from the reassembled, checksum-verified record bytes
```

> A checksum mismatch is a **warning** in the default lenient mode (the frame is kept for audit,
> flagged `trusted: false`, and excluded from `records`) and a thrown `AstmFrameStrictError` under
> `{ strict: true }`. The checksum is emitted uppercase but **accepted lowercase**: a real-vendor
> quirk. Frame warnings carry only a **frame number + byte offset**, never the record bytes.

## Serialize and build (emit)

Emit is the conservative inverse of parse. `serializeAstmRecords` turns a parsed
message back into a spec-clean, `CR`-terminated stream: always the **canonical**
`H|\^&` delimiters, every embedded delimiter re-escaped, so it round-trips:

```ts runnable
import { parseAstmRecords, serializeAstmRecords } from "@cosyte/astm";

const raw = "H|\\^&\rP|1|PRAC|LAB\rR|1|^^^687|28.6|U/L||N||F\rL|1\r";
serializeAstmRecords(parseAstmRecords(raw)); // => "H|\\^&\rP|1|PRAC|LAB\rR|1|^^^687|28.6|U/L||N||F\rL|1\r"
```

Canonical means canonical for the **whole** stream. A message that arrived under a vendor delimiter
set comes back with every record in the canonical set, including the free-form `M` and `S` rows: the
header can never declare one set while the rows below it use another, because re-reading that stream
would collapse those rows' fields into one. `M`/`S` bytes are reproduced exactly as they arrived
whenever they are already in the delimiters being emitted. A canonical message that was already
spec-clean comes back byte-for-byte. Bytes can still differ without anything being lost: emit writes
the spec-clean form of what was read, so a value the parser kept as a literal is escaped on the way
out, and `O&BRIEN` comes back as `O&E&BRIEN`.

Pass a second argument to emit against a different set: `serializeAstmRecords(msg, msg.delimiters)`
puts a message back out in the delimiters it arrived under, and the header declares that set. Only
three characters of a header's declaration carry a role (repeat, component, escape); a declaration
that carries more keeps the surplus on emit rather than losing it, so `H|\^&#` comes back as
`H|\^&#`. That holds on the default canonical path too: normalizing replaces the four roles, and the
surplus holds none of them.

Two things drop a surplus, and the second one is **not** confined to transcoding. A message emitted
into a _different_ delimiter set than the one it arrived under loses it, because the surplus belonged
to the declaration being replaced. And a surplus that could not be read back as a surplus is dropped
on **every** path, the default canonical one included: that means a surplus carrying the field
separator, or carrying any control character. Of the 33 C0 and `DEL` characters, 31 can reach a
surplus and every one of them costs it; the other two are `CR` and `LF`, which end the record as it is
read, so no surplus ever holds them. **The whole surplus goes, not just the offending character**, so
`H|\^&#` plus a control character plus `$` comes back as plain `H|\^&`. Keeping part of it would mean
emitting a declaration nobody wrote. Nothing reports it: emit returns a plain string.

The set you pass is checked before any bytes are written. Each separator must be exactly one
character, none may be a `CR`/`LF`, and no two may be the same character: otherwise the stream
could not be read back as the records that produced it, and emit returns a plain string with no
channel to warn you. A set that fails is an `AstmSerializeError` with code
`ASTM_EMIT_INVALID_DELIMITERS`. This is stricter than the reader, which tolerates a few
declarations it cannot reverse, so a message that parsed can still be refused when you ask for it
back in its own set: the alternative was output that read back with a different field tree and
said nothing.

Those three conditions read the **set** and nothing else, so they cannot see a collision that depends
on which record is being written. A separator equal to a record's own type letter passes all three
and then escapes that letter away, so each record's emitted line is checked separately to start with
the letter the record models; one that does not is an `AstmSerializeError` with code
`ASTM_EMIT_TYPE_LETTER_COLLISION`. Without it the corruption was **silent** in its worst branch:
where the escape character is itself a record type letter, the escaped letter starts with a real one,
so a `P` record came back as an `R` whose `value` was the patient's laboratory ID, reported `F` for
final, on a stream whose only warning was the `ASTM_NONSTANDARD_DELIMITERS` a clean non-canonical
stream carries too.

This one is a **transcoding** check, not a judgement on the set you asked for, so it fires with no
delimiter argument at all. A stream whose header declares a vendor set and which carries one garbled
line beginning `|` parses to an unsupported record whose type letter is `|`; emitting it on the
default canonical path would escape that `|` away, so `serializeAstmRecords(msg)` refuses it, and so
does `serializeFramedAstm(msg)`. "Emit against the canonical delimiters" is therefore not a way
around it: the fix is to drop or repair the record whose type letter cannot be written.

What the two refusals together promise is that every record re-reads as its own **type**. They do not
promise that every field lands where it did: an escape sequence whose body is an unrecognized
character that is itself a delimiter in force is
read as one opaque atom, so that delimiter never becomes a boundary and the fields after it shift.
That is reported on the parse side as `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`, which no profile
may tolerate, alongside the tolerable `ASTM_UNKNOWN_ESCAPE_SEQUENCE`, and its mirror (a delimiter the
leftmost alignment let split where a competing alignment would have held it) as
`ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT`, with `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS` on the subset
of that where the gained boundary is a **field** boundary and the reading taken resumes on an escape
character heading no sequence it can interpret, so a result's units and status move with it, and
`ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD` on the subset where it is a **repeat** boundary, where no
field moves and the field it divides is instead read out of its first repeat alone, and
`ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS` on the subset where it is a **component** boundary, where
nothing leaves the record and every component after it moves along the component list, so a coding
scheme or a given name is read out of a position the other alignment does not put it in. Emitting
normalizes all
of them away rather than preserving them, so none reaches a second generation: catch them on the
first read. The low-level
`encodeComponent` and `serializeField` helpers take no record and carry neither guarantee. If you
emit against a set of your own rather than the canonical one, check the round-trip on your own
traffic.

`buildAstmMessage` constructs a spec-clean stream from typed input, and **never
fabricates**. It emits only the values you supply; an omitted field stays empty,
never a defaulted clinical value. A result whose status you did not set reads back
as `unspecified`, never `final`:

```ts runnable
import { buildAstmMessage, parseAstmRecords, results } from "@cosyte/astm";

const raw = buildAstmMessage({
  records: [{ type: "R", universalTestId: ["", "", "", "687"], value: "28.6", units: "U/L" }],
});

results(parseAstmRecords(raw))[0]?.status.meaning; // => "unspecified"
```

Every value is escape-encoded on emit, so an embedded delimiter can never break
framing: a titre `1^40` is emitted as `1&S&40` and reads back as one component. A
value carrying a `CR`/`LF` (which no escape can encode) is refused with a typed
`AstmSerializeError` rather than a corrupted wire.

## Frame it for the wire

`composeAstmFrames` is the inverse of `decodeAstmFrames`: it wraps reassembled
record bytes into `<STX> FN text <ETB|ETX> CS <CR><LF>` frames, **computing** each
modulo-256 checksum and frame number and splitting any record over 240 bytes:
never faking either. `serializeFramedAstm` composes both emit layers at the edge:

```ts runnable
import { parseAstmRecords, serializeFramedAstm, parseFramedAstm, results } from "@cosyte/astm";

const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
const bytes = serializeFramedAstm(msg); // spec-clean framed stream

results(parseFramedAstm(bytes).message)[0]?.value; // => "28.6"
```

A frame carries **bytes**, so a record passed as a `string` is read as one byte per
character. A character above `U+00FF` has no byte to stand for, and nothing this
library reads from an ASTM stream says which character encoding to turn it into, so
it is refused with `ASTM_FRAME_UNENCODABLE_CHARACTER` rather than quietly written as
a different character. To frame content outside Latin-1, encode it with the code page your
instrument uses and pass the `Uint8Array`: `composeAstmFrames` takes bytes directly
and writes them through untouched.

A record carrying a raw `STX`, `ETB` or `ETX` byte is refused too, with
`ASTM_FRAME_RESERVED_BYTE`, and that one has **no** bytes-instead escape hatch: those three
are what the decoder reads as the shape of a frame, and framing has no escape sequence to
hide one behind. Writing it through truncated the frame at that byte, and it was not
reliably loud: where the two following bytes happened to be the short frame's checksum, the
truncated frame verified and a whole record was absorbed into the previous one with no
warning from either layer. Take the byte out of the value before framing. The **record**
layer still carries it: `serializeAstmRecords` returns a string, and a raw-transport
consumer that never frames anything round-trips such a value byte for byte.

To compose one transfer across several calls, pass `startFrameNumber` to continue the
sequence where the previous call left off: joining the results is byte-identical to
composing the whole list in one call, rollover included. It has to be a whole number
from `0` to `7`, because a frame's number is a single ASCII digit, and
`composeAstmFrames` checks it before it reads a record
(`ASTM_FRAME_INVALID_START_FRAME_NUMBER`). Nothing returns the number to continue
from, and the frame count is not it once a record splits, so read it off the part you
just composed: `((decodeAstmFrames(part).frames.at(-1)?.frameNumber ?? 0) + 1) % 8`.

Note what a continuation is not: read on its own, a stream that starts anywhere but
`1` opens on a sequence gap, so the decoder does not emit that first record. What
`parseFramedAstm` does after that varies with the message shape: it may throw, and it
may return a message one record short. The record layer never reports the loss, because
it only ever sees the records that survived, so **read `frameWarnings`**. Leave the
option alone unless you are genuinely continuing a sequence.

## Map a local code to LOINC (LIVD, bring-your-own)

An analyzer transmits a proprietary **local** test code in the Universal Test ID; a
standard **LOINC** is mapped downstream. Supply your own IICC LIVD catalog and
`applyLivd` annotates the message: **additively**. It never touches the raw code or
value, and it **never guesses a LOINC**: an unmapped or ambiguous code is surfaced as
such (a wrong LOINC would mis-identify the test). No terminology data is bundled: you
bring the catalog.

```ts runnable
import { parseAstmRecords, defineLivdCatalog, applyLivd } from "@cosyte/astm";

const catalog = defineLivdCatalog([{ vendorCode: "687", loinc: "1920-8", loincLongName: "AST" }]);
const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");

applyLivd(msg, catalog).annotations[0]?.mapping.status; // => "mapped"
```

A code the catalog does not hold stays verbatim and is reported `unmapped` with a
value-free `ASTM_LIVD_UNMAPPED_CODE` warning, never a fabricated LOINC:

```ts runnable
import { parseAstmRecords, defineLivdCatalog, applyLivd } from "@cosyte/astm";

const catalog = defineLivdCatalog([{ vendorCode: "687", loinc: "1920-8" }]);
const msg = parseAstmRecords("H|\\^&\rR|1|^^^999|5|U/L||N||F\rL|1\r");

applyLivd(msg, catalog).annotations[0]?.mapping.status; // => "unmapped"
```

### Your catalog answers, and the wire never does

The Universal Test ID's first component is a LOINC slot, and the guide this catalog
format comes from puts transmitting LOINC directly from IVD instruments explicitly out
of scope: the analyte arrives as a vendor-defined code. So the lookup runs whenever a
vendor local code is present, keyed on that code alone, and a populated first component
never answers instead of it. **This package performs no LOINC validation of any kind**,
so it never decides whether such a value "looks like" a LOINC: `Glucose` and `2345-7`
there are treated identically. The value is carried verbatim as `unvalidatedWireValue`,
never reported as a LOINC, and never used as a lookup key.

```ts runnable
import { parseAstmRecords, defineLivdCatalog, applyLivd } from "@cosyte/astm";

const catalog = defineLivdCatalog([{ vendorCode: "687", loinc: "1920-8" }]);
const msg = parseAstmRecords("H|\\^&\rR|1|Glucose^^^687|28.6|U/L||N||F\rL|1\r");
const [a] = applyLivd(msg, catalog).annotations;

a?.reportedCode; // => "687"
a?.unvalidatedWireValue; // => "Glucose"
a?.wireValueDisagreesWithCatalog; // => true
```

`wireValueDisagreesWithCatalog` says the two differ and **nothing else**: both values
stay surfaced, neither is marked correct, neither is rewritten, and nothing claims the
difference was settled. It is `true` only where your catalog vouched for exactly one
LOINC, the first component is populated, and the two are not byte-identical; `false`
everywhere else, and never absent.

With no vendor local code there is nothing to look up, so nothing is looked up. The
record reports that, rather than reporting the wire value as a code:

```ts runnable
import { parseAstmRecords, defineLivdCatalog, applyLivd } from "@cosyte/astm";

const catalog = defineLivdCatalog([{ vendorCode: "687", loinc: "1920-8" }]);
const msg = parseAstmRecords("H|\\^&\rR|1|Glucose|28.6|U/L||N||F\rL|1\r");
const [a] = applyLivd(msg, catalog).annotations;

a?.mapping.status; // => "no-vendor-code"
a?.reportedCode; // => undefined
a?.unvalidatedWireValue; // => "Glucose"
```

## Next

- [Core Concepts](./concepts-archetype): the parser archetype and the tolerance model.
- **API Reference**: every export, generated from source.
