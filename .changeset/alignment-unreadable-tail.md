---
"@cosyte/astm": patch
---

Report a contested escape alignment whose tail this reader cannot read, not only one it cannot
consume.

`ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS`, `ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD` and
`ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS` keep their names, their claims and their roles. The one
predicate behind all three now fires where the escape character the reading taken resumes on heads
**no sequence this reader can interpret**: it heads none at all (kept as a bare literal, reported as
`ASTM_UNPAIRED_ESCAPE_CHARACTER`), or it heads one whose body is not a recognized mnemonic (preserved
verbatim and never guessed at, reported as `ASTM_UNKNOWN_ESCAPE_SEQUENCE`). The second case was
silent.

The cost is the same one in both. On the canonical set `R|1|^^^687|28.6&F&|&Z&U/L||||F` reads nine
fields against the competing alignment's eight and hands back a status of `final` the sender put in
no slot; `28.6&S&\&Z&U/L` reads a value of `28.6^` and loses the rest; `&F&^&Z&GLU^L^687` reads `687`
as a vendor local code where the competing alignment reads it as the coding scheme. Each raised only
the tolerable `ASTM_UNKNOWN_ESCAPE_SEQUENCE` before, so the widest legal profile plus
`{ strict: true }` accepted all three. Consuming a triple is not interpreting one.

Exactly one tail is still excluded, and it is the one that matters: where the escape character heads
a sequence this reader recognizes, the reading taken interprets a construct and nothing is reported.
`28.6&F&F&F&U/L` under a set naming the field separator `F` is that separator escaped, written, and
escaped again, entirely well formed. That is the only tail on which a stream's escaping can be clean
at all, so the widened predicate cannot refuse a stream whose escaping is working: every position it
now rejects already raises an escape deviation of its own.

That remaining silence is a trade and not a claim that nothing was lost there. On the excluded tail
the gained boundary is exactly as real, and there it is `warnings: []` rather than merely
under-reported: `R|1|^^^687|28.6&F&|&F&U/L||||F` reads nine fields against the competing alignment's
eight and hands back a status of `final`, `28.6&S&\&S&U/L` reads a value of `28.6^`, and
`&F&^&F&GLU^L^687` reads one component more. Read the raw line when an escape character sits next to
a delimiter, whether or not anything fired.

Still a report, not a repair: no split changed, every decoded byte is identical, no code became
tolerable and none was struck off, and it does not survive a re-emit, so catch it on the first read
of the wire bytes.

**What the three codes CLAIM about their role did have to move, and it moved on every surface that
carries one.** Widening the predicate widened the firing population past the point where each code's
cost claim held everywhere. Where the sequence past the contested boundary carries **the splitting
delimiter itself** as its body, the reading taken holds that character inside an opaque atom while
the competing alignment splits on it, so the two readings return the **same number** of segments in
**different places**: nothing moves index, and what differs is the contents.
`R|1|^^^687|28.6&F&|&|&U/L||||F` reads nine fields under both with the status `F` in field 9 under
both; `28.6&F&\&\&U/L` reads two repeats under both; `DOE&F&^&^&JANE^A` reads three components
under both with `A` the middle name under both. So "every later field is one place further right",
"the field is read as more repeats than the other reading gives it" and "every later component sits
one place further right" were each false there, including in three runtime warning messages. All
three now name the exception. Measured in `test/records/alignment-unrecognized-tail.test.ts` against
constants committed with it, `DECLARATION_ALPHABET` and `SPLITTING_ROLES` and `BODY_ALPHABET` and
`TAIL_BODY_ALPHABET` crossed with `PAYLOAD_PREFIXES` and `PAYLOAD_SUFFIXES` so the carrier shape is
not held fixed: 55,296 tuples, 36,864 fire, 2,304 are that class, 0 of those lack
`ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`, and 0 were accepted before this release, so the
codes over-report relative to the indexes there and never under-report, and the class costs no
stream its disposition. What holds on every firing tuple is that the two readings disagree and that
both consume every byte, so neither is forced.

Measured on the same tier and the same committed corpus constants as the three measurements before
it. On the shared 864-tuple corpus each code now fires on 192 where it fired on 96, moves 64 from
accepted to refused where it moved 32, moves 0 back, and fires on 0 of the 96 escape-clean tuples
exactly as before. The axis that corpus fixes, the body of the tail sequence, is swept beside it over
3,456 tuples: 2,304 fire, 528 move, 0 move back, and 0 of the 384 escape-clean tuples are refused.
The sweep also refuted an obvious universal, which is recorded rather than dropped: the reading taken
does **not** always read one more segment than the competing alignment. Where the tail body is the
delimiter being split on, both readings produce the same number of segments in different places
(`28.6&F&~&~&U/L` under `H~\^&`), which is 144 of the 2,304. What holds everywhere is that the two
readings disagree and that both consume every byte.

This is a narrowing on a published package, on the strict path only: a lenient parse of the same
stream returns the same records, with the same values, and one more warning on them. No public
surface was added, removed or renamed.
