---
"@cosyte/astm": patch
---

Report a competing escape alignment that shifted a result's units and status into slots the sender
did not write them in.

`ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS` fires when two escape alignments of the same bytes disagree
about a **field** boundary, the reading taken keeps it, and the escape character that reading resumes
on heads no escape sequence at all. The competing alignment is precisely the reading that uses that
character, to close its own sequence, so the boundary was bought with a byte the reading taken cannot
read. A gained field boundary shifts every later field one place.

That shift reaches modeled clinical slots, which is why this needed a code of its own. Measured on
the canonical set, `R|1|^^^687|28.6&F&|&U/L||||F` reads **nine** fields under the alignment taken and
**eight** under the other, so the sender's trailing `F` lands in field 9, the result status, under
the first and in no field at all under the second. The parse hands back units of `&U/L` and a status
of `final`, and both are consequences of the alignment rather than values the sender placed in those
slots. A downstream system reading `final` would act on a result these bytes do not say was
finalised. Before this code the only warning on that stream was `ASTM_UNPAIRED_ESCAPE_CHARACTER`,
which a profile may tolerate, so a strict parse under the widest legal profile accepted it.

The change is additive and the split is unchanged. The alignment taken is still the one taken and
every decoded byte is identical, including the status: taking the other alignment would be a
different guess with no more evidence behind it, on a package already on the registry. What is new is
that the shift is reported by a code no profile may tolerate. It fires **alongside**
`ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT` where that also applies, and is not a widening of it: that
code asks whether the codec's own vocabulary prefers the alignment taken *at* the contested position,
and this one asks what that alignment makes of the bytes *after* it. The earlier code's exclusions are
untouched.

Two bounds are deliberate and are stated rather than left to be found. It is wired to the **field**
separator only, because a gained repeat or component boundary divides one field and cannot move a
modeled slot; that case costs the value instead, and is not reported here. And the tail is weighed one
construct deep: where the escape character past the boundary heads a sequence this codec
**recognizes**, the alignment taken interprets it while the competing one would leave it bare, so the
bytes prefer the alignment taken (under a set naming the field separator `F`, `28.6&F&F&F&U/L` is that
separator escaped, written, and escaped again, which is entirely well formed and must not be refused);
and where it heads a sequence whose body is **unrecognized**, the alignment taken still consumes it
while the competing one would leave two escape characters bare, so the preference is stronger again.
That second case still shifts the fields and is silent here. It is measured and recorded as a residue,
not overlooked.

Measured on the strict-accepted-under-a-gate-legal-profile tier, because a warning-free read is
structurally unreachable for anything that could exhibit this. Against corpus constants committed with
the tests, over a declaration alphabet of eight characters, the three splitting roles, a body alphabet
of twelve and the three tails: 864 tuples, of which this code fires on 96 and moves **32** from
accepted to refused under a profile built from the whole tolerable allow-list, with **0** moving back.
It fires on **none** of the 96 escape-clean tuples in that corpus, and cannot: firing requires an
escape character heading no sequence, which this package already reports as a deviation of its own.
That is the property that separates it from a criterion measured on the same corpus and rejected,
which would have refused 48 of them.

It repairs nothing, and it does not survive a re-emit: the serializer rewrites the preserved
characters into recognized mnemonics, and that stream carries the alignment that was taken with no
competitor left in it, so a second-generation read is silent and correct about its own bytes. Catch it
on the first read of the wire bytes.

New public surface: `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS`, the `alignmentShiftedFields` warning
factory, the `ShiftedFieldsSink` type, and a trailing optional sink parameter on `splitEscapeAware`,
`tokenizeRecord` and `tokenizeHeader`.
