---
"@cosyte/astm": patch
---

Correct two false claims the contested-alignment codes rested on, both on consumer surfaces. No
guard moves: no code is added, removed or renamed, no split changes, no extracted value moves, and
no stream's disposition changes.

**The companion universal is false where the declaration names the escape character in a splitting
role too.** The three tail codes rest on a defence against over-refusal: firing requires an escape
character heading no sequence this codec can interpret, and the package already reports each of
those, so a stream whose escaping raises nothing can never be refused. That was written as a
universal over the whole firing population. On a set that names the escape character in a splitting
role, one byte both opens a sequence and ends a segment, the split claims it first, and neither
escape report ever sees a sequence to raise: a tail code fires with neither companion. Measured on a
committed corpus that pins its own figures: a distinct arm of 2,304 tuples where 1,536 fire and 0 are
orphans, and a colliding arm of 1,008 tuples where 648 fire and 288 are orphans, with 0 orphan in
either arm lacking `ASTM_RECORD_DELIMITER_ROLE_COLLISION`, which no profile may tolerate. The defence
survives in the form it was needed in (no stream whose escaping and whose declaration are both clean
is refused by a tail code) and not in the form it was written in. That replacement is scoped to the
stream and does not hold per message: the collision is reported once per set change rather than once
per record, so a second header re-declaring the same colliding set raises nothing while the tail
codes in its message fire again, leaving a consumer that scopes warnings to a message looking at one
of the three codes standing alone. The field role cannot collide with the escape role at all: the
declaration is the three characters after the field separator and stops at the next one, so such a
header terminates itself one character short and is refused.

**"One place further right" understates.** It is a floor, not a figure. It was already known to be
wrong in one direction, the tie class, where the offset is zero; it is wrong in the other direction
too. The competing reading resumes a character further on at each contested position, so it falls
further out of step and the gap widens once per contested construct. `A&Z&|&BX&Z&|&F&C` reads three
fields against one, and a chain of n constructs displaces by n, measured to n = 6. The number of
warnings is not the displacement either, in either direction: over 3,072 firing tuples on a
two-construct corpus, one warning sits on a displacement of two in 1,568 of them, and two warnings
sit on a displacement of one in 320. A consumer cannot recover the offset by counting. One code
covers two opposite outcomes: on `R|1|^^^687|28.6&F&|&Z&U/L||||F` the sender's trailing `F` lands in
the status slot and reads as `final`, while on `R|1|^^^687|28.6&Z&|&BX&Z&|&F&U/L||||F` the same
displacement runs twice, the `F` overshoots, and the status reads `unspecified`.

Every other surface now names the kind of cost and leaves the magnitude to one paragraph, because a
paraphrase at each sink is a separate claim that goes stale on its own. Both corrected statements
live on the exported `ShiftedFieldsSink`, which the three warning factories already point at. The
magnitude was being paraphrased in three different vocabularies ("one place further right", "shifts
every later field one place", "moves one slot along"); a newline-folded grep over all three found
nineteen restatements across the source, the registry entries, the runtime messages, the README and
the shipped docs, and all of them are corrected. "At least one place" was rejected as the replacement
wording because it contradicts the tie class, where the displacement is zero: the surfaces say the
displacement is not fixed, name its three values, and tell the operator that counting warnings does
not give it.
