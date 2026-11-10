---
id: delimiters
title: How delimiters are read and written
sidebar_label: How delimiters are read and written
description: "Why delimiters come from each header, what a changed or garbled header costs, what a record that lost its fields looks like, and what emit refuses."
---

# How delimiters are read and written

An ASTM message describes itself. Its `H` header names the four delimiters the records after it use:
the field separator, then the repeat, component and escape delimiters. `H|\^&` is the canonical set,
and an analyzer may declare another. This page explains how we read those declarations, what can go
wrong when one is changed or garbled, and what the serializer does on the way out.

## Each header scopes the records after it

The delimiters are read at every header and apply to the records that follow it, until the next
header. A stream can carry several messages, so it can carry several sets:

- **A header that restates the set in force** is normal and warns nothing.
- **A header that declares a different set** is followed: it and the records after it are read with
  the new set, and it raises `ASTM_RECORD_DELIMITERS_REDECLARED`. Records already read keep the set
  they were read with. A non-canonical set also raises `ASTM_NONSTANDARD_DELIMITERS`.
- **A later header whose declaration cannot be used** (too short, not a header, or naming the field
  separator in a second role) leaves the set in force unchanged and raises
  `ASTM_RECORD_UNREADABLE_REDECLARATION`. No set is guessed and no record is dropped.
- **A first header that cannot declare a set** is fatal: `ASTM_RECORD_UNDECLARED_DELIMITERS`.

Each message's own set is on its header (`header.delimiters`) and on its entry from `messages()`;
`msg.delimiters` is the first header's.

## A header that names one character in two roles

If a declaration names the field separator in another role, the four roles cannot be told apart and
the declaration is refused, as above. If two of the other three agree, the stream is still readable,
and refusing it would drop records the sender did send, so the set is read and honored. What is lost
is the boundary between those two roles, because the bytes no longer carry it.

Under `H|^^&`, where the repeat and component delimiters are both `^`, a field a canonical sender
would have written as two repeats of two components reads back as four repeats of one component
each. Under `H|\&&`, where the component and escape delimiters are both `&`, the same character
splits (`A&B` is two components) or opens an escape sequence (`A&F&B` is the single component `A|B`)
depending only on what follows it.

Such a header raises `ASTM_RECORD_DELIMITER_ROLE_COLLISION`, once at the header that put the set in
force, not once per colliding pair. A later header restating the same set warns nothing, on the same
rule as the other delimiter warnings. The code is not tolerable by any profile. Every such set is
non-canonical, so before this code existed the only warning was the tolerable
`ASTM_NONSTANDARD_DELIMITERS`, and a profile expecting an ordinary vendor set left a strict parse
accepting a declaration whose field tree cannot be recovered. Emit refuses the same sets
(`ASTM_EMIT_INVALID_DELIMITERS`), which is how the gap first showed: a message that parsed without
complaint threw when written back in its own delimiters.

A set naming the escape character as the field separator cannot be declared at all: the declaration
is the three characters after the field separator and stops at the next one, so such a header ends
itself one character short and is refused.

## A record that lost its fields

Because a header the parser does not recognize (one with a stray byte in front, say) does not change
the delimiters, the records after it are read with the previous set. When that set's field separator
does not occur in a record at all, the whole line reads back as one field and none of its modeled
fields survive. On a result, that is the value, the units and the status at once, and the result then
looks as though it simply never carried them.

```ts runnable
import { parseAstmRecords } from "@cosyte/astm";

// A result written with `*` as its field separator, inside a stream that declared `|`.
const msg = parseAstmRecords("H|\\^&\rR*1*^^^687*28.6*U/L****F\rL|1\r");
const r = msg.records[1];

msg.warnings.map((w) => w.code); // => ["ASTM_RECORD_FIELDS_UNSEPARATED"]
r?.type === "R" ? [r.value, r.units, r.status.meaning] : []; // => [undefined, undefined, "unspecified"]
```

The parser warns once for each such record, keeps the raw line whole, and never splits it again on a
set no header declared, because that would invent data. No profile may tolerate the code, and a
strict parse refuses it. It does not need a garbled header: a lone record written in another set
trips it too.

**The absence of this warning does not prove a record split correctly.** It tests one of the four
roles, the field separator, and only in its total form, where no unescaped separator occurs in the
line at all. Two classes of the same loss sit outside it:

- **A foreign set whose field separator happens to occur in the line** still splits, on the wrong
  boundaries and silently. One stray `|` in an otherwise `*`-separated result loses the value, the
  units and the status with no warning, while the same record without that byte is reported. This
  can happen to one record inside a run of these warnings, so a run does not mean every record in it
  was checked.
- **A set that differs in the repeat, component or escape role** usually splits into fields
  normally, and the damage varies. A mis-split component can cost a test identity while the value
  survives. An escape sequence whose body is an unrecognized character that is itself a delimiter in
  force is read as one opaque unit, so that delimiter does not split, and the value, the units and the
  status can go together; that case raises `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`. Its mirror,
  where the alignment taken lets a delimiter split that another alignment would have held, raises
  `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT`, with a narrower code for each role it reaches.
  [Coverage and compatibility](./concepts-coverage.md#an-unescaped-ampersand-does-not-cost-you-the-rest-of-the-record)
  explains the escape cases in full.

These are accepted limits. Widening the field-separator check would mean deciding which set a record
ought to have had, which is the guess the parser declines to make everywhere else, and narrowing the
escape rule would break the guarantee it exists for. So read `ASTM_RECORD_FIELDS_UNSEPARATED` as
"this record definitely lost its fields", never as "no other record did". If delimiter drift is a
real risk on your feed, parse with `{ strict: true }`, which refuses both an outright collapse and an
unrecognized type letter, and treat `ASTM_RECORD_UNKNOWN_TYPE` as making what follows it untrusted.

## On the way out

The serializer writes the canonical set unless you pass another, and it writes the whole stream in
one set. A message that arrived under a vendor set comes back with every record in the canonical set,
`M` and `S` records included, because a header that declared one set above records written in
another would collapse those records' fields when read again. `M` and `S` bytes are reproduced
exactly when they already read correctly under the set being written.

Only three characters of a declaration carry a role. A declaration that carries more keeps the extra
characters on emit, so `H|\^&#` comes back as `H|\^&#`, on the default canonical path too. Two things
drop them, and the second is not limited to changing sets. A message written in a different set from
the one it arrived in loses them, because they belonged to the declaration being replaced. And extra
characters that could not be read back as such are dropped on every path: ones that include the field
separator or any control character. Of the 33 C0 and `DEL` control characters, 31 can reach that
position and every one of them drops it; `CR` and `LF` end the record while it is read, so they never
get there. The whole run of extra characters is dropped, not only the offending one, because keeping
part of it would write a declaration nobody sent. Nothing reports this: emit returns a plain string.

### What emit refuses

A set you pass is checked before anything is written. Each delimiter must be exactly one character,
none may be `CR` or `LF`, and no two may be the same; otherwise the output could not be read back as
the records that produced it, and the call throws `AstmSerializeError` with
`ASTM_EMIT_INVALID_DELIMITERS`. This is stricter than the reader, which accepts a few declarations it
cannot reverse, so a message that parsed can be refused when you ask for it back in its own set. The
alternative was output that read back with a different field tree and said nothing.

Those conditions read the set alone, so they cannot see a collision that depends on the record being
written. A delimiter equal to a record's own type letter passes all three and then escapes that
letter away, so each record's line is also checked to start with the letter it models; one that does
not throws with `ASTM_EMIT_TYPE_LETTER_COLLISION`. Without that check the worst case was silent:
where the escape character was itself a record type letter, a `P` record came back as an `R` whose
value was the patient's laboratory ID, reported final, on a stream whose only warning was the
`ASTM_NONSTANDARD_DELIMITERS` an ordinary vendor stream carries too.

That second check is about changing sets, not about the set you asked for, so it can fire with no
set passed at all:

```ts runnable
import { AstmSerializeError, parseAstmRecords, serializeAstmRecords } from "@cosyte/astm";

// A vendor stream with one garbled line that begins with `|`.
const msg = parseAstmRecords("H#~*!\r|garbled\rL#1\r");

let code = "";
try {
  serializeAstmRecords(msg); // the default, canonical set
} catch (err) {
  if (err instanceof AstmSerializeError) code = err.code;
}
code; // => "ASTM_EMIT_TYPE_LETTER_COLLISION"
```

Written in the canonical set, that record's `|` would be escaped away, so `serializeAstmRecords` and
`serializeFramedAstm` both refuse it. The fix is to drop or repair the record whose type letter
cannot be written.

### What the refusals do not promise

Together the two refusals promise that every record reads back as its own type. They do not promise
that every field lands where it did. The escape cases above (a delimiter swallowed by an escape
sequence, and its mirror, where the alignment taken gains a boundary) are reported when the stream is
parsed, and writing the message out rewrites the preserved characters into recognized escape
sequences, so none of them reaches a second generation. Catch them on the first read. The low-level
`encodeComponent` and `serializeField` helpers take no record and carry neither guarantee. If you
write in a set of your own rather than the canonical one, check the round trip on your own traffic.

## How-to guides that apply this

- [Read a stream that carries several messages](./read-several-messages.md)
- [Handle warnings and fail fast](./handle-warnings.md)
- [Write records and frames](./write-records-and-frames.md)
