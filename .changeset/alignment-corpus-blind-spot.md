---
"@cosyte/astm": patch
---

Close the three measurement holes the contested-alignment claim corrections left behind. No guard
moves and no public surface moves: the change is test coverage, pinned figures, and doc comments
inside `test/`. No runtime code is added, removed or renamed, no split changes, no extracted value
moves, and no stream's disposition changes.

**The corpus that certifies the companion correction never observed one of the three codes it
certifies.** Which splitting role a declaration puts the swept character in decides where the
collision is; which delimiter the contested reading gains its boundary on decides which of the three
tail codes fires. Those are independent axes, and both arms of that corpus held the second one fixed
by keeping the contested construct inside a single field of the carrier. Measured, the corpus
observes `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS` zero times, which the file now asserts rather than
leaves to be noticed. Two field arms sweep the missing axis: the collision stays in the repeat or
component role, where it is expressible, while the gained boundary is on the field separator, which
the swept character never is. That is what puts a field-code orphan in reach even though the field
role cannot collide with the escape role at all. The arms pin their own figures: a distinct arm of
1,296 tuples where 432 fire and 0 are orphans, and a colliding arm of 1,296 tuples where 360 fire
and 144 are orphans. Every one of those 144 carries `ASTM_RECORD_DELIMITER_ROLE_COLLISION`, which no
profile may tolerate, and is refused by the widest gate-legal profile before and after, so no
stream's disposition changes. `H|F^F` carrying `C|1|I|FFF|F|G` is one of them, written out in full
so the class is reproducible without the sweep. The assertions that carry the correction now read
over all four arms, and over the wider population of any tail code firing rather than only the one
code each arm was built to observe.

**Three figures could drift with the suite staying green.** The report-count corpus asserted its
firing population, its under-stating class and its over-stating class as "more than zero", so a
corpus that had quietly lost nine tenths of each would still have passed. They are pinned now
(3,072 firing tuples, 1,568 carrying one warning on a displacement of two, 320 carrying two warnings
on a displacement of one, 64 in the tie class), together with the whole joint distribution of report
count against displacement, so a cell that moves reds the suite and names itself. Pinning the table
surfaced a fact none of the three figures carried: there is no cell at zero reports and zero
displacement. Every tuple this code says nothing about is displaced anyway, by one or by two. That
is the standing exclusion for a recognized tail behaving as intended, and it is a third direction in
which counting warnings fails, this one silent.

**The retired universal, and the sites this release changed.** The three test files that were
recorded, plus `alignment-unrecognized-tail.test.ts` and `alignment-criterion-population.test.ts`,
which word the same fact differently, plus the corollary about the escape companion at the "refuses
NOT ONE escape-clean stream" tests in the first three. Each is cut or scoped rather than re-qualified
in fresh words: the unqualified sentence is gone, the corpus's own bound (it holds the escape role at
`&`) is stated in its place, and what that bound is worth is named at the file that measures it
instead of being paraphrased again. The predicate's own implementation site in
`src/common/escapes.ts` is scoped too, and the claim one paragraph above it that it was "the single
place that says what happens there" is deleted rather than repaired, having already been false
against the README. Neither string reaches `dist/index.d.ts`, and no behaviour, no warning code and
no documented surface moves.
