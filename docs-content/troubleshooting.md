---
id: troubleshooting
title: Troubleshooting
sidebar_position: 1
---

# Troubleshooting

Common symptoms when integrating `@cosyte/astm`, and how to read what the parser is telling you.

## The parse "succeeded" but the result looks wrong

`@cosyte/astm` is lenient: it recovers from vendor quirks rather than throwing. That means a surprising
result usually comes with an explanation in `warnings`. Inspect them first:

```ts
const { warnings } = parseAstmRecords(raw);

for (const w of warnings) {
  console.warn(w.code, w.message, w.position);
}
```

Each warning carries a **stable code** (`WARNING_CODES`) and positional context. If a deviation
should be a hard failure for your integration, re-parse with `{ strict: true }` to have it thrown
instead.

## A parse threw

Only **Tier-3 fatal** conditions (`FATAL_CODES`) throw in lenient mode: these mark input the parser
cannot recover into a structured result. In `{ strict: true }` mode, any tolerated deviation throws
too. Catch and inspect the error's code to tell the two apart.

## An accessor threw `AstmAmbiguousStreamError`

The parse succeeded; an accessor refused to answer. `patient()`, `results()`, `orders()`,
`comments()` and `query()` read the **whole stream**, so they cannot answer for a stream that does
not determine one answer, and refusing is the point: the alternative is one patient's results
attributed to another. Two codes:

- **`ASTM_AMBIGUOUS_MULTI_MESSAGE`**: the stream carries more than one `H` … `L` message. Read each
  message's own records instead:

  ```ts
  for (const m of messages(msg)) {
    m.patient;
    m.results;
  }
  ```

- **`ASTM_AMBIGUOUS_MULTI_PATIENT`** (from `patient()` only): one message carries several `P`
  records, so "the patient" is not determined. Read `messages(msg)[n].patients` for all of them.

The error carries `code`, a value-free `position` pointing at where the ambiguity became visible, and
`messageCount` / `patientCount`. It never carries an identifier or a value, so it is safe to log.
`commentsFor()` never throws this: the parent record you hand it already names the message.

## Warning messages and logs

Warning `message` fields are safe to log: they **never contain PHI**. Never log the raw payload
itself; it may carry protected health information.

## A value came back without units, or a flag as "undefined"

That is the fail-safe design, not a bug. A numeric result with no units raises
`ASTM_RECORD_UNITS_ABSENT` and the unit is left empty: never defaulted or guessed. An abnormal flag
the parser does not recognize is surfaced as `"undefined"`, never coerced to `"normal"`. An
unparseable reference range is surfaced verbatim with no invented bound. In every case the library
refuses to hand you a confident wrong value: inspect the warning and decide.

## `ASTM_UNPAIRED_ESCAPE_CHARACTER`: a value carries a bare ampersand

An escape sequence is the escape character, **one** body character, and the escape character again
(`&F&` `&S&` `&R&` `&E&`). An escape character that heads no such sequence is not an escape: it is
kept as the literal character it is and opens no atom. So `R|1|^^^687|28.6&|U/L||N||F` gives you a
value of `28.6&` with its units and its `final` status intact, and `O&Brien` in a surname leaves the
birth date and sex where they are.

The warning says the sender did not write the character the spec-clean way, which is `&E&`. The
parser does not guess which it meant: it keeps the byte that arrived and reports it. If your feed
does this routinely, the code is **tolerable**, so a vendor profile can expect it and let you keep
parsing `{ strict: true }`. Emitting is unaffected: this package always writes a literal escape
character as `&E&`, so a stream it produced never raises the code.

**This warning is about one character, not about the record.** A three-character sequence is opaque
by design (that is what keeps `&F&` one token under a set naming `F` as a delimiter), so a sequence
whose body is an unrecognized character that is itself a delimiter in force swallows that delimiter:
`R|1|^^^687|28.6&|&U/L||||F` reads a value
of `28.6&|&U/L` with no units and status `unspecified`. That case raises
`ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` as well as `ASTM_UNKNOWN_ESCAPE_SEQUENCE`. Only the
second of those is tolerable, so a strict parse refuses the record whatever profile is in force. A
**recognized** mnemonic is outside it, deliberately: `&F&` under a set naming `F` as the repeat
delimiter is the sender escaping the field separator on purpose, and it raises neither code. The
reading itself is unchanged, and it does not survive a re-emit: this package rewrites the preserved
sequence into recognized mnemonics, and the resulting stream says that value unambiguously, so a
second-generation read is silent. Catch it on the first read of the wire bytes.

## Two escape sequences could have been aligned differently

`ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT` says the same bytes carry two readings that disagree about
one field, repeat or component boundary. Sequences are matched greedily and leftmost, so the escape
character closing one cannot also open the next. Where it could have, and where the body it would
have held is the delimiter that split, one alignment ends a field there and the other holds that
delimiter inside an opaque atom and ends nothing. `R|1|^^^687|28.6&Z&|&U/L||||F` reads a value of
`28.6&Z&` and units of `&U/L` under the alignment taken, and reads as a single unsplit field under
the other.

The leftmost reading is kept and every byte is preserved. Taking the other alignment would be a
different guess with no more evidence behind it, so what this reports is that the boundary you were
handed is a choice, not that it is wrong. It is not tolerable, so a strict parse refuses the record
whatever profile is in force. Two cases are outside it, deliberately. A **recognized** mnemonic
before the delimiter is silent, because the reading taken interprets a construct (`&F&` is an escaped
separator, which is what the mechanism is for) while the competitor's body is a delimiter character
the parser usually cannot interpret, so it prefers the reading taken. **That is not a promise that
the reading taken is conformant**, and two cases fall in the gap. The first, on the field separator,
is now covered by a second code, described in the next section. The second is covered only where that
code reaches: a declared set naming a mnemonic letter as a splitting delimiter leaves both alignments
interpreting one construct each with **neither preferred**, and on the field separator with a bare
escape character past the boundary the next section's code now fires. Everywhere else, meaning a
repeat or component role, or an escape character past the boundary that heads a sequence of its own,
**nothing reports it at all** (on the repeat separator with a bare escape character past the
boundary, the section after next now fires). Treat a bare escape character next to a
delimiter as worth reading the raw line for, **whether or not either code fired**. The other excluded
case is a delimiter with no escape character two positions past it, which is no competing alignment
at all. What does fire is a subset of what already raises `ASTM_UNKNOWN_ESCAPE_SEQUENCE`. Like its
mirror above it does not survive a re-emit: catch it on the first read of the wire bytes. **What to
do:** ask the sender to escape a literal escape character as `&E&`, which removes the competing
alignment at the source.

## A competing alignment shifted every field after it, and a result status with them

`ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS` answers a different question about the same position as the
code above: not whether the parser's own vocabulary prefers the alignment taken, but what that
alignment makes of the bytes **after** the boundary. The two readings resume one character apart, so
they disagree about the whole rest of the record. Where the escape character the reading taken
resumes on heads no sequence at all, that reading bought a field boundary with a byte it cannot read,
while the competing alignment is exactly the reading that can use it, as the close of its own
sequence.

**On the field separator that matters clinically, because a gained field boundary shifts every later
field one place.** `R|1|^^^687|28.6&F&|&U/L||||F` reads **nine** fields under the alignment taken and
**eight** under the other, so the sender's trailing `F` is read out of field 9, the result status,
under the first and out of no field at all under the second. The parse hands back units of `&U/L` and
a status of `final`, and both are consequences of the alignment rather than values the sender placed
in those slots. **Do not act on a `final` from a record carrying this code.** Before this code
existed the only warning on that stream was the tolerable `ASTM_UNPAIRED_ESCAPE_CHARACTER`, so a
strict parse under the widest legal profile accepted it.

The reading is unchanged: this reports the shift, it does not repair it, because taking the other
alignment would be a different guess with no more evidence behind it. It is not tolerable, so a
strict parse refuses the record whatever profile is in force, and it fires alongside the code above
rather than instead of it.

Two bounds, both deliberate, and **neither is a promise that nothing was lost outside it**. It is
wired to the **field** separator only, because a gained repeat or component boundary divides one
field and so moves no field-indexed slot: the units and the status stay put. That is a choice, not a
consequence. Components are modeled _inside_ a field, so a gained **component** boundary does move a
modeled slot: in `R|1|&F&^&GLU^L^687|28.6|U/L||||F` the Universal Test ID reads a coding scheme of
`L` and a local code of `687` under the alignment taken, and `687` as the **coding scheme** under the
other, and `DOE&F&^&JANE^A` reads `&JANE` as a first name under one alignment and `A` under the other.
Nothing reports that: only the tolerable `ASTM_UNPAIRED_ESCAPE_CHARACTER` fires, so a strict parse
under a legal profile accepts it. It is a separate open condition, disclosed here rather than left to
be found, and wiring this code to another delimiter role would be a different criterion needing its
own measurement. On the repeat role the cost is the **value** and the field's components, reported
by its own code in the next section. And where the
escape character past the boundary heads a
sequence, recognized or not, it stays silent, because the reading taken is then the one making sense
of those bytes: under a set naming the field separator `F`, `28.6&F&F&F&U/L` is that separator
escaped, written, and escaped again, which is entirely well formed. The case where that trailing
sequence has an unrecognized body still shifts the fields and is still silent here. Like the codes
above it does not survive a re-emit: catch it on the first read of the wire bytes. **What to do:**
read the raw line, and ask the sender to escape a literal escape character as `&E&`.

## A competing alignment split one field into repeats, so its value and identity read short

`ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD` asks the same question as the code above, on the **repeat**
separator instead. Nothing shifts there: the units slot and the result-status slot are read out of
the same field numbers under either alignment, which is exactly why the shift report cannot see it.
What it reports is that **the field is read as more repeats than the competing alignment gives it**.
Where that gained boundary is the **first** one in the field it reaches a modeled slot, because a
field's modeled value and its components are taken from its first repeat alone: everything past the
boundary stays on the wire, stays in `repeats`, and leaves every modeled slot.

Both costs are reachable on the **canonical** set, so no unusual declaration is needed:

- **The value truncates.** `R|1|^^^687|28.6&S&\&U/L|U/L||||F` reads a value of `28.6^`, and
  `&U/L` leaves the result entirely. The competing alignment reads one repeat carrying all of it.
- **A modeled identity empties.** `R|1|&F&\&687|28.6|U/L||||F` reads a Universal Test ID of one
  component holding a decoded field separator, so the local code `687` is in no modeled slot at all
  and the identity comes back as a LOINC candidate the sender never wrote. `DOE&S&\&JANE^A` reads
  a last name and **no given or middle name**.

Before this code existed the only warnings on those streams were tolerable ones, so a strict parse
under the widest legal profile accepted a truncated value and an emptied test identity. The reading
is unchanged: this reports the truncation, it does not repair it, and it fires alongside the codes
above rather than instead of them.

**At a later boundary this fires and nothing modeled moves**, because the first repeat is then the
same under both readings and only the repeat structure after it differs. That is deliberate and
measured: the boundary is still one the bytes do not force, and a consumer reading `repeats` is
still reading an alignment guess. Relative to the modeled slots it is over-reporting, never
under-reporting, so **check `repeats` on the field the warning names rather than assuming the value
is wrong**.

Two further bounds, both deliberate. It is wired to the **repeat** separator only: a gained **component**
boundary reaches a modeled slot too, and differently, moving it one slot along rather than dropping
it, which is the separate open condition described in the section above. And the tail bound is that
section's, for the same reason: where the escape character past the boundary heads a sequence,
recognized or not, this stays silent, because `28.6&R&\&R&U/L` is the repeat separator escaped,
written, and escaped again, and refusing it would refuse a well-formed stream. The unrecognized-tail
case still truncates and is still silent here. Like the codes above it does not survive a re-emit:
catch it on the first read of the wire bytes. **What to do:** read the raw line, check `repeats` on
the field the warning names before trusting its value, and ask the sender to escape a literal escape
character as `&E&`.

## A header declared one character in two delimiter roles

`ASTM_RECORD_DELIMITER_ROLE_COLLISION` says the `H` record named the same character in two of the
repeat, component and escape roles, so the boundary between those two roles is not in the bytes. The
declaration is still honored and no record is dropped: under `H|^^&` a field a canonical sender would
have written as two repeats of two components reads back as four repeats of one component each.

The code is **not** tolerable, deliberately. Every such set is by definition non-canonical, so before
this code existed the only warning it raised was the tolerable `ASTM_NONSTANDARD_DELIMITERS`, and a
profile expecting an ordinary vendor set left a strict parse accepting it. Emit refuses the same sets
with `ASTM_EMIT_INVALID_DELIMITERS`, so `serializeAstmRecords(msg, msg.delimiters)` throws on such a
message. If you own the sending side, fix the declaration; if you do not, treat the affected
records' repeat and component structure as unrecoverable rather than as read.

## A framed stream lost a frame, or a checksum is wrong

The frame layer validates every modulo-256 checksum and tracks the frame-number sequence. A
bad-checksum frame is flagged `trusted: false` and **never merged** into a record (a warning in
lenient mode, a thrown `AstmFrameStrictError` in strict); a sequence gap is warned and **never
silently bridged**. Read `frameWarnings` from `parseFramedAstm`: each carries a frame number and byte
offset, never the record bytes.

## `ASTM_FRAME_RESERVED_BYTE`: emit refused a record carrying `STX`, `ETB` or `ETX`

`composeAstmFrames` (and `serializeFramedAstm` through it) throws an `AstmFrameEncodeError` with this
code when a record holds one of the three bytes the framing reads as structure. There is no option to
force it and no bytes-instead escape hatch, because the byte is unframable however it arrives: a
frame's text ends at the first `ETB`/`ETX` after its `STX`, and framing has no escape sequence to hide
one behind. Written through, it truncated the frame at that byte, which was **not** reliably loud:
where the next two bytes happened to be the short frame's checksum, the truncated frame verified and a
whole record was absorbed into the previous one with an empty `warnings` array at both layers.

`recordIndex` and `characterIndex` locate it in your own data (the error never carries the bytes).
Remove or replace the byte in the value before framing: which byte belongs in a clinical value is your
call, not the library's. If you do not frame at all, nothing changes for you: `serializeAstmRecords`
returns a string and round-trips such a value byte for byte.

## `ASTM_FRAME_INVALID_START_FRAME_NUMBER`: emit refused a `startFrameNumber`

`composeAstmFrames` (and `serializeFramedAstm` through it) throws an `AstmFrameEncodeError` with this
code when `options.startFrameNumber` is not a whole number from `0` to `7`. A frame's number is a
single ASCII digit, so there is nothing else to write it as. The message names the value received: it
is your own option, not stream content. `composeAstmFrames` checks it before it reads a record, so on
that entry point the refusal never depends on your data. `serializeFramedAstm` serializes every record
first, so a record that cannot be serialized at all is refused before this check runs on that route.

It used to be written through unchecked, which is why the check exists. `-1` put a `/` in the
frame-number position; `NaN` and either infinity put a `NUL` there in **every** frame, after which the
decoder recognised no frame number at all and emitted none of the records. Values that truncated back
onto a digit were quieter and no better: `1.5` and `257` each produced the exact stream a
`startFrameNumber` of `1` produces, so the option silently accepted what it documented as invalid.

The whole `0`-`7` range is still accepted, because a non-default start has a real use: composing one
transfer across several calls. Continue the sequence at the number after the last frame the previous
call used, and joining the results is byte-identical to composing the whole list in one call. What a
continuation is **not** is the start of a transfer: read on its own, a stream that starts anywhere but
`1` opens on a sequence gap and the decoder does not emit that first record.

What `parseFramedAstm` does after that **varies with the message shape**. It may throw, under more
than one code, and it may return a message that is simply one record short. What does hold is that
the **record layer never reports the loss**: `parseFramedAstm` hands the record parser only the frames
the codec vouched for, so `message.warnings` carries what the surviving records warrant and nothing
about the record that did not survive. **Read `frameWarnings`.** If you are not continuing a sequence,
do not set the option.

To find the number to continue from, decode the part you just composed and read its last frame's
number: `((decodeAstmFrames(part).frames.at(-1)?.frameNumber ?? 0) + 1) % 8`. The number of frames is
not the same thing once a record has split across several of them. A frame carries no number only
when the stream ends immediately after its `STX`, which is not something `composeAstmFrames` writes,
so that fallback never fires on a part it composed.

## Known limitations

`@cosyte/astm` is feature-complete across both layers, but its promise is deliberately narrow. See
[What it does, and does not do](./limitations) for the full, honest boundary: no live I/O, units are
verbatim free text (not UCUM), no bundled terminology dictionary (LIVD is bring-your-own), and `M`/`S`
records are surfaced verbatim, never interpreted.

The **API Reference** always reflects exactly what this release ships: treat it as the source of
truth over any prose above.
