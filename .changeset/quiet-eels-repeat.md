---
"@cosyte/astm": patch
---

Report a field a competing escape alignment read short.

`ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD` fires where two escape alignments of the same bytes disagree
about a **repeat** boundary, the reading taken keeps it, and the escape character that reading
resumes on heads no sequence at all. It is on the profile safety gate, so `{ strict: true }` refuses
a stream carrying it whatever profile is in force.

Nothing shifts, and that is not the same as nothing being lost. No field-indexed slot moves, which
is why the field-shift report could not see this. What it reports is that the field is read as more
repeats than the competing alignment gives it. Where that gained boundary is the first one in the
field it reaches a modeled slot, because a field's modeled value and its components are taken from
its first repeat alone, so everything past the boundary stays in `repeats` and leaves every modeled
slot. Both costs are reachable on the canonical set: `R|1|^^^687|28.6&S&\&U/L|U/L||||F` reads a value of `28.6^` and
drops `&U/L`, and `R|1|&F&\&687|28.6|U/L||||F` reads a Universal Test ID of one component holding a
decoded field separator, so the local code `687` is in no modeled slot and the identity comes back
as a LOINC candidate nobody wrote. A patient name loses its given and middle names the same way.
Before this code the only warnings on those streams were tolerable ones, so the widest gate-legal
profile plus `{ strict: true }` accepted them.

At a later boundary it fires and no modeled slot moves, because the first repeat is then identical
under both readings. That is over-reporting relative to those slots and never under-reporting, and
it is measured rather than assumed.

It is a report, not a repair: the split is unchanged and every decoded byte is identical. It is
wired to the repeat separator only, and the tail is weighed one construct deep, so a stream whose
escaping is well formed (`28.6&R&\&R&U/L`, the repeat separator escaped, written and escaped again)
is untouched. Measured over the same 864-tuple corpus as the two reports before it: fires on 96,
moves 32 from accepted to refused, moves 0 back, and fires on none of the 96 escape-clean tuples. A
second sweep with the contested boundary off the front of the field gives the same 96 / 32 / 0 / 0,
and on all 96 the first repeat is unchanged between the two alignments.

New public surface: the code, the `alignmentTruncatedField` warning factory, the
`TruncatedFieldSink` type, and a further trailing optional sink parameter on `splitEscapeAware`,
`tokenizeRecord` and `tokenizeHeader`. A lenient parse is unchanged.
