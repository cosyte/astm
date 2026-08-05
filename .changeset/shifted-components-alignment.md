---
"@cosyte/astm": patch
---

Report components a competing escape alignment moved one slot along.

`ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS` fires where two escape alignments of the same bytes
disagree about a **component** boundary, the reading taken keeps it, and the escape character that
reading resumes on heads no sequence at all. No profile may tolerate it, so `{ strict: true }`
refuses a stream carrying it whatever profile is in force. It completes the set: the three roles a
split is taken on are field, repeat and component, and all three are now wired to this one tail test.

Nothing shifts between fields and nothing leaves the record. Components are modeled inside a field,
so every component after the gained boundary sits one place further right than the competing
alignment puts it, and the slots that indexes into are named things. On the canonical set,
`R|1|&F&^&GLU^L^687|28.6|U/L||||F` reads a Universal Test ID whose coding scheme is `L` and whose
vendor local code is `687`, where the competing alignment reads one component fewer and `687` is the
coding scheme. `P|1||MRN-0001||DOE&F&^&JANE^A||19700101|F` reads a given name of `&JANE` and a middle
name of `A`, where the competing alignment makes `A` the given name with no middle name at all.
Before this code the only warning on either stream was the tolerable `ASTM_UNPAIRED_ESCAPE_CHARACTER`,
so the widest legal profile plus `{ strict: true }` accepted both.

Additive and a report, not a repair: the split is unchanged, every decoded byte is identical, and the
components read are the components that were always read. Every gained boundary in a repeat moves
those slots and not only the first, because the shift propagates to the end of the component list;
inside a later repeat nothing modeled moves and it fires anyway, which is over-reporting relative to
those slots and never under-reporting. The tail is weighed one construct deep, so a stream where the
escape character past the boundary heads a sequence of its own is left alone: refusing those would
refuse well-formed traffic. It does not survive a re-emit, so catch it on the first read of the wire
bytes.

This is a narrowing on a published package, on the strict path only: a lenient parse of the same
stream returns the same records, with the same values, and one more warning on them. New public
surface: the code, the `alignmentShiftedComponents` warning factory, the `ShiftedComponentsSink`
type, and a further trailing optional sink parameter on `splitEscapeAware`, `tokenizeRecord` and
`tokenizeHeader`.
