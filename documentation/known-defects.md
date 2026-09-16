# The defect record

The defects `CLAUDE.md` carries under the heading below, in full. A backticked bare anchor here is
an anchor in [`agent-notes.md`](agent-notes.md), on the convention `CLAUDE.md` states at its top.

## Known defects live on `main`

Recorded so they survive independently of any backlog. **Numbers are stable**, and a closed entry is
kept, because the correction it records is usually the lesson. Full entries, with every measurement
and refuted formulation: `#defects`.

1. **CLOSED 2026-07-29.** Stream-scoped `patient()` / `results()` attributed one patient's results to
   another, silently; **the break is the fix, and "single-message streams are unaffected" is false**.
   **Within-message patient scoping is still open and must not be closed by guessing a hierarchy.**
   `#defect-1`
2. **Silencing CLOSED 2026-08-01; the MERGE is still open on purpose.** **Do not close it by
   inferring a header**: recognizing a mangled header means guessing a byte the sender did not send.
   `#defect-2`
3. **Open.** `msg.classification` is folded over the whole STREAM but documented per-message; derive
   the per-message answer with `classifyMessage(m.records)`. **`AstmStreamMessage` deliberately
   carries NO `classification` field**, so do not "complete the type" by adding one. `#defect-3`
4. **CLOSED 2026-08-05.** `ASTM_RECORD_DELIMITER_ROLE_COLLISION` is **a report, not a repair**: the
   declared set is still honored and **the default-path re-emit still launders it**, measured.
   `#defect-4`
5. **CLOSED 2026-08-03.** `serializeRecordChecked` asserts the first character written is the letter
   the record models. **Do not "simplify" that byte-level check into a rule over the four delimiter
   roles**, and **say it is a narrowing on a published package wherever the refusal is described.**
   `#defect-5`
6. **CLOSED 2026-08-03. It WAS a stop-the-line because its worst branch was SILENT.**
   `composeAstmFrames` throws `ASTM_FRAME_RESERVED_BYTE` with **no bytes-instead escape hatch**; the
   record layer is **deliberately untouched**, `CR`/`LF` and `ENQ`/`ACK`/`NAK`/`EOT` are deliberately
   **NOT** in the set, and **neither this refusal nor defect 7's is total**. `#defect-6`
7. **CLOSED 2026-08-02. Recorded as LOUD; the larger half was SILENT.** `ASTM_FRAME_UNENCODABLE_CHARACTER`
   now throws; **UTF-8 was considered and rejected**, the read side is **deliberately** Latin-1, and
   **a claim of "loud in every case" is a claim about the input space, not about the cases you ran.**
   `#defect-7`
8. **CLOSED 2026-08-02. It WAS a stop-the-line, and the UNITS decided it.** An escape sequence is now
   exactly three characters, split and decoder sharing one definition. **Scope the sentence to the
   character the code reports, never to "the record".** `#defect-8`
9. **CLOSED 2026-08-21; the CATALOG BYPASS was the safety-critical half**, not the label. **NO LOINC
   SHAPE TEST WAS ADDED AND NONE MAY BE**: every route is POSITIONAL, and a disagreement is
   REPORTED, never resolved. `#defect-9`
10. **Open, and deliberately PARTIAL, so the warning's ABSENCE certifies nothing.** A run of
    `ASTM_RECORD_FIELDS_UNSEPARATED` is not a sweep. **Not fixed on purpose**, and **if you ever make
    one of those "limits" tests go green by widening the guard, the prose in three published places
    has to move with it.** `#defect-10`
11. **CLOSED 2026-08-05, as a REPORT.** `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` fires
    **alongside**, not instead, and **the atom was NOT narrowed and the value is byte-identical**.
    **The laundering hop is NOT closed and must not be written as closed**: catch it on the **first**
    read. `#defect-11`
12. **CLOSED 2026-08-04.** `encodeLeaf` is now one left-to-right pass, the exact inverse of
    `decodeEscapes`. **Never quote any of the recorded figures without the space and the corpus
    constant they were measured against**, and **never replace the narrow "what is not guaranteed"
    prose with a positive guarantee that emit preserves every field tree.** `#defect-12`
13. **CLOSED 2026-08-03.** `ASTM_FRAME_INVALID_START_FRAME_NUMBER`; **clamping and modulo were both
    rejected**, do not "simplify" it to "refuse anything but 1", and **do not reintroduce a rule for
    what a standalone continuation does**. The record layer never reports the loss, so **read
    `frameWarnings`**. `#defect-13`
14. **Open, measured, pinned and disclosed 2026-08-04.** The header delimiter-declaration surplus
    drop stays, **it is all-or-nothing** and **fires with no `d` argument at all**, and **one
    recorded reason for it measured FALSE and must not be restated**. `#defect-14`
15. **CLOSED IN PART 2026-08-05, as a REPORT, and the MIRROR of defect 11. Read defect 17 for what is
    left.** `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT`; **the split is UNCHANGED and every byte is
    identical**, **a RECOGNIZED mnemonic body is excluded**, and **never write it as "the reading
    taken is conformant"**. `#defect-15`
16. **CLOSED 2026-08-05, as a MESSAGE ONLY.** **The fatal CODE is unchanged and no stream's
    disposition moved**, and **do not delete the unreachable branch.** `#defect-16`
17. **(a), (b), (c) AND THE TAIL RESIDUE ALL CLOSED as REPORTS by weighing the TAIL; the pair count
    stays REJECTED.** ONE predicate, wired per role, never widened into each other; **all 3 roles
    wired, NO fourth**, and 15's exclusion untouched. **NEVER write "a repeat or component boundary
    cannot move a modeled slot", nor "EVERY gained boundary moves a slot", nor "reads ONE more
    segment", nor any of the THREE ROLE COST CLAIMS unqualified.** **RECORDING a refuted universal is
    NOT correcting it: GREP EVERY RESTATEMENT, including WHAT-TO-DO prose.** **DO NOT RE-PROPOSE THE
    PAIR COUNT**, and remember a corpus that FIXES the tail reports a comforting zero. `#defect-17`

Two further defects were closed and folded away: `#defects-closed-elsewhere`.

**Before you touch `parse.ts`, `serialize.ts`, `escapes.ts`, `encode.ts`, `extractors.ts` or
`host-query.ts`, read the defect entries above and `CHANGELOG.md` `[Unreleased]`.**
