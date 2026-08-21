# @cosyte/astm: Project Guide for Claude

> **The narrative lives in [`documentation/agent-notes.md`](documentation/agent-notes.md).** This
> file is the cursor, the rules, and the traps, one line each; **a bare `#anchor` below is an anchor
> in that file**, pointing at the section that records how it was measured, kept **verbatim**.
> Read that section before you touch the code it guards: these are clinical-safety
> lessons, and several record a claim that measured **false** after it shipped.
> The meta-repo bounds this file at write time (`.claude/hooks/doc-budget.mjs`, ADR 0023). **No
> number is written here on purpose**: read the entry, and treat headroom as slack to give back. A
> breach is relocation into the notes, **never** dropping a trap. `#claude-md-size`.

## Project

**`@cosyte/astm`**: a developer-focused ASTM parser + utility library for Node.js/TypeScript,
published under the Cosyte brand. One of the sibling `@cosyte/*` healthcare-standard parsers that
**mirror each other's API**: `@cosyte/hl7` is the reference; this repo deliberately copies its
shape.

**North star:** pull fields out of a real-world, vendor-quirky message in one line without reading
the spec. Full contract: "The standard parser archetype" in `documentation/conventions.md` upstream.

## Status

**Published, public, feature-complete.** `@cosyte/astm` is live on npm on the pre-alpha `0.0.x`
ladder; the repo is public. Both standing human gates are crossed, and every roadmap phase has
shipped (`ls src/` for the module layout).
**Full per-phase histories, with what each phase deliberately deferred and why:**
`#status-history`.

### Traps carried out of the status history

- **Never name a version in prose** here, in `README.md`, or in `docs-content/`. All four went stale
  once, and `docs-content/` reaches docs.cosyte.com inside an **immutable** tarball. Derive it:
  `npm view @cosyte/astm version` (`www.npmjs.com` 403s scripts). Why: `#status-history`.
- **`src/index.ts`'s exported `VERSION` is a different thing and IS bound** (`scripts/sync-version.mjs`
  in the release `version` script + an equality assertion in `test/sanity.test.ts`). Never "restore
  consistency" by re-pinning a number into prose. Why: `#status-history`.
- **Never claim a clause id for ASTM/CLSI behaviour this repo cannot read.** LIS02-A2 §5.4/§6.2 are
  withheld from CLSI's free sample and the paywalled editions were not read, so the forward-scoping
  rule for redeclared delimiters, the Latin-1 wire encoding, and the reserved-byte set are all
  **reasoned from this package's own reader**, not cited. The OSS corpus cannot ground them either
  (python-astm and senaite hardcode `|\^&`). Why: `#status-history`,
  `#defect-6`, `#defect-7`.
- **The profile safety gate is default-deny, and total over THREE registries**: every record,
  frame (`ASTM_FRAME_*`) and LTP (`ASTM_LTP_*`) code is safety-critical unless it is on
  `TOLERABLE_CODES`, and any new one is safety-critical **by default** until argued in. The fourth
  registry, `ASTM_LIVD_*`, sits **outside** the gate's universe by design (`src/terminology/warnings.ts`),
  so it is refused as _unknown_ rather than as _safety-critical_. **Never quote the tolerable list or
  its count here: read `src/profiles/safety.ts`.** Every snapshot written into prose has gone stale, which
  is why the relocated note's count is dated 2026-08-01 rather than current. **`ASTM_RECORD_UNKNOWN_TYPE` was removed from it 2026-08-01 and
  must not return**; `ASTM_UNPAIRED_ESCAPE_CHARACTER` was **added** 2026-08-02 by defect 8's fix. Why:
  `#status-history` and `#defect-8`.
- **The remedy when a tolerable code is the only report of a real loss is a SECOND, NARROWER code,
  not striking the first off.** Defects 4, 11 and 15 all had that shape, all closed that way
  2026-08-05: the three new codes are safety-critical by default and **must not be added to the
  list**, while the tolerable ones each stay on it, still
  true of the cases that cost nothing. Striking any off changes behaviour for every profile
  naming it and still leaves the loss reported by a code that fires where there is none. **Part 2
  has two named readers now** (`isSplittingDelimiter`, `isMnemonicBody`), the first of which the
  first refuter pass caught the file still denying. Why: `#defect-4`, `#defect-11`, `#defect-15`.
- **The admission test has TWO clauses, and the second is a claim about the whole library**: a
  tolerable code cannot alter, drop or fabricate an extracted value, **and nothing else in this
  package may read the condition the warning reports**. There is deliberately no automatic check for
  the second. **Re-derive the list whenever something new starts reading record structure.** Why:
  `#status-history`.
- **Do not re-derive that list by comparing a parse with a profile against one without.** The warning
  transform runs after the records are built, so that comparison is identical for every code and
  passes a code that should never be tolerable. Measure it on pairs that must fail, as
  `test/profiles/unknown-record-type-safety.test.ts` does. Why:
  `#status-history`.
- **The gate is enforced at two points and the second one is load-bearing.** `applyAstmProfile`
  re-checks `isSafetyCriticalCode` because `AstmProfile` is a plain interface and a hand-authored
  literal never passes through `defineAstmProfile`. Do not "simplify" it away as redundant. Why:
  `#defect-2`.
- **A profile never touches an extracted value.** It only re-badges a warning it expects to
  `PROFILE_QUIRK_APPLIED`; no warning is ever dropped, and a spec-clean message parses
  byte-identically with or without one. Why: `#status-history`.
- **Never author a named per-vendor profile without a public vendor-attributed quirk document.**
  cobas / Sysmex / ADVIA / Mindray / Snibe stay gated; firsthand inspection of the public corpus found
  the record layer spec-clean. Why: `#status-history`.
- **Never bundle LOINC / SNOMED / LIVD data, and never emit a guessed LOINC.** The catalog is
  consumer-supplied, the mapping is additive and advisory, a miss or a conflict is
  `unmapped`/`ambiguous` with a value-free warning. **The catalog answers for the analyte identity
  and the wire never does**, and this package performs **no LOINC validation of any kind**. Why:
  `#status-history`, `#defect-9`.
- **Never fabricate structure or a positive acknowledgement.** Checksums and frame numbers are
  computed, never faked; a frame the codec did not vouch for is `NAK`ed and never delivered; a builder
  emits only supplied values (an omitted result status reads `unspecified`, never `final`); an
  unrecognizable transport lead **defaults to framed and warns**, never a silent guess. Why:
  `#status-history`.
- **`Q` dominates: a `Q`-bearing message is never read as a result set**, and `M`/`S` are surfaced
  **verbatim**, never interpreted into clinical fields. Why:
  `#status-history` and `#defect-2`.
- **The differential vectors are captured, not vendored** (`python-astm` BSD `4170ce0c`, no reference
  code in the tree, CI needs no Python) and the **deliberate divergences are asserted on purpose**.
  Do not "fix" one to match. Why: `#status-history`.
- **Delimiters are re-read at every `H` and scoped forward**, and records already read keep the set
  they were read with. Why: `#status-history`.

## The shipped docs sidebar is a published contract

Full text, with the spine, the file names and the measurements: `#docs-sidebar`.

- **`docs-content/sidebars.json` is a public contract, not a local build detail**, and the asset it
  ships in is **immutable**: a bad sidebar is superseded by a later release, never corrected in
  place. It has shipped wrong once and rendered that way.
- **The spine is transcribed from upstream, not imported** (a parser repo cannot depend on the docs
  site), so the copies drift and **upstream is the source of truth**. Graded by
  `test/docs-sidebar-ia.test.ts`.
- **Categories are optional**, so `{"docs":["intro"]}` conforms: **never make the test demand a
  section**. **"API Reference" is injected by `cosyte/docs`, never authored here.**

## Known defects live on `main`

Recorded so they survive independently of any backlog. **Numbers are stable**, and a closed entry is
kept, because the correction it records is usually the lesson. Full entries, with every measurement
and refuted formulation: `#defects`.

1. **CLOSED 2026-07-29.** `patient()` / `results()` were stream-scoped, so pairing them attributed one
   patient's results to another on an ordinary two-message stream, silently. `messages()` now splits a
   stream; the flat extractors throw `AstmAmbiguousStreamError` rather than answering across patients.
   **The break is the fix. Never write "single-message streams are unaffected"**: a lone message
   carrying several `P` records now throws too. **Within-message patient scoping is still open and must
   not be closed by guessing a hierarchy**; multi-patient messages are real.
   `#defect-1`
2. **Silencing CLOSED 2026-08-01; the MERGE is still open on purpose.** A header the reader does not
   see as an `H` does not open a new message, so two messages merge. **Do not close it by inferring a
   header**: recognizing a mangled header means guessing a byte the sender did not send. Both
   downstream costs are closed without inferring the letter (`ASTM_RECORD_FIELDS_UNSEPARATED`, keyed
   on the **observed collapse** rather than on the mangled header; and `classifyMessage` declining to
   `indeterminate`). **The furthest-reaching variant is a `P`-less second message**, which
   `assertSinglePatient` cannot see. A header is exempt from `ASTM_RECORD_FIELDS_UNSEPARATED`
   **by construction, not by exception** (`tokenizeHeader` always yields type letter + declaration).
   `#defect-2`
3. **Open.** `msg.classification` is folded over the whole STREAM but documented per-message. The
   dangerous direction is closed (`Q` dominates) and the over-trigger warns. Derive the per-message
   answer with `classifyMessage(m.records)`. **`AstmStreamMessage` deliberately carries NO
   `classification` field**: that omission is the fix, not an oversight, so do not "complete the type"
   by adding one. `#defect-3`
4. **CLOSED 2026-08-05.** `readDelimiters` accepted a declaration it cannot reverse (`H|^^&`,
   `H|\&&`) and the only warning was the **tolerable** `ASTM_NONSTANDARD_DELIMITERS`, which every
   such set raises, so a gate-legal profile left strict **accepting** it. Now
   `ASTM_RECORD_DELIMITER_ROLE_COLLISION`, not tolerable, once per header that **changes** the set.
   **A report, not a repair**: the set is honored, `A^B^C^D` under `H|^^&` still reads as four
   repeats of one component, and **the default-path re-emit still launders it**, measured. **The field role is NOT in it** (that declaration does not resolve at all); it is the
   three pairs among the rest, **repeat/component, repeat/escape, component/escape**.
   `#defect-4`
5. **CLOSED 2026-08-03.** Emit could escape a record's own type letter away, and the worse branch was
   **silent**: a `P` came back as an **`R` record** whose value was the patient's lab ID, so
   `results()` returned a fabricated final result built out of patient identifiers.
   `serializeRecordChecked` now asserts the first character written is the letter the record models
   (`ASTM_EMIT_TYPE_LETTER_COLLISION`). **Do not "simplify" that byte-level check
   into a rule over the four delimiter roles**: a role list over-refuses, and the byte check survived
   the encoder being rewritten underneath it. **The `letter`+`E`+`letter` caveat is RETIRED.** **It is a
   transcoding condition firing with no `d` argument, so "pass the canonical set" is not a remedy.** The refusal is a **narrowing on a published package reaching the lenient-parse
   population**, **so say so wherever the refusal is described.**
   It promises a record re-reads as its own **type**, not that every field lands where it did, and
   `encodeComponent` / `serializeField` are **outside the check by construction** because they take
   no record. That is deliberate, not a gap to plug. `#defect-5`
6. **CLOSED 2026-08-03. It WAS a stop-the-line because its worst branch was SILENT**: an embedded
   `ETX` whose next two bytes happened to be a valid checksum made a short frame verify, merging the
   next record into a comment's free text and losing a result, `warnings: []` at both layers (`ETB`
   reaches the same silence by the other door). `composeAstmFrames` now throws
   `ASTM_FRAME_RESERVED_BYTE`, with **no bytes-instead escape hatch**. **The record layer is
   deliberately untouched**, measured. The three bytes are derived from what `decodeAstmFrames` reads
   as structure, **not**
   from a control-character class, so **`CR`/`LF` and `ENQ`/`ACK`/`NAK`/`EOT` are deliberately NOT in
   the set** (measured to round-trip byte-exactly inside a frame). Do not "complete" it to the control
   characters. **Neither this refusal nor defect 7's is total, and the bound is
   stated rather than left to be found:** both are on the declared `Uint8Array | string` signature, so
   a JavaScript caller passing some other typed array (a `Uint16Array`) still gets the old low-byte
   corruption from `Uint8Array.from`. **The two residues were measured separately and do not
   share an outcome:** defect 7's is silent; defect 6's is framed then lost at decode, silent
   **only** where the two bytes after it are the short frame's checksum, and
   `ASTM_FRAME_BAD_CHECKSUM` otherwise. Never write either refusal as covering it, and
   never "tidy" the scoped doc comment into an unqualified one: **a false sentence in a comment that
   compiles into `dist/index.d.ts` is worse than the silence it replaced.**
   `#defect-6`
7. **CLOSED 2026-08-02. Recorded as LOUD; the larger half was SILENT.** `charCodeAt(i) & 0xff`
   truncated every character to its low byte, so `GRAżYNA` **split across two fields** (`U+017C` low
   byte is the field separator), shifting every following
   field. `composeAstmFrames` now throws `ASTM_FRAME_UNENCODABLE_CHARACTER`; **UTF-8 was considered and
   rejected** (it picks a code page the sender never declared); the read side is **deliberately**
   Latin-1 (`String.fromCharCode` per byte), which is half the grounding. **The lesson generalizes past this
   defect: a claim of "loud in every case" is a claim about the input space, not about the cases you
   ran.** `#defect-7`
8. **CLOSED 2026-08-02. It WAS a stop-the-line, and the UNITS decided it**: a lone escape character
   opened a sequence that copied to end-of-record, so a canonical `R` read back with **units gone** and
   status `unspecified`, `warnings: []`, and emit re-escaped the garble into a spec-clean-looking line
   that re-parsed to the same wrong value. An escape sequence is now exactly three characters, split
   and decoder sharing one definition. **Scope the sentence to the character the code reports, never
   to "the record"**: the atom rule is unchanged, so an `&X&` whose body is a delimiter still swallows
   it (that is defect 11). **That is the third of FOUR times on this family that the claim, not the
   guard, was the defect** (defect 17 is the fourth). The mangled-header fixture now reports a
   **second, incidental** code because its declaration is read as data: **that is not a second
   reader of the mangled header, and nothing may start treating it as one.**
   `#defect-8`
9. **CLOSED 2026-08-21; the CATALOG BYPASS was the safety-critical half**, not the label:
   `mapTestId` returned on any non-empty first component before ever reaching `catalog.lookup`. The
   catalog is consulted whenever a vendor local code is present, keyed on **that code alone**; a
   first component is an `unvalidatedWireValue`, never a LOINC and **never the code a result is keyed
   on, with or without a catalog**, so `primaryCode()` now answers `undefined` where it answered
   `Glucose`. **NO LOINC SHAPE TEST WAS ADDED AND NONE MAY BE**: every route is POSITIONAL, so
   `Glucose` and `2345-7` there are identical. A disagreement is REPORTED, never resolved, and never
   computed against an ambiguous candidate list. `#defect-9`
10. **Open, and deliberately PARTIAL, so the warning's ABSENCE certifies nothing.**
    `ASTM_RECORD_FIELDS_UNSEPARATED` tests one delimiter role in its total form only. A foreign field
    separator that occurs anywhere in the line still splits on the wrong boundaries with zero warnings,
    **including inside a run of these warnings**, so a run is not a sweep. A differing repeat /
    component / escape role loses test identity or (defect 11, now reported) the value. **Not fixed on purpose**:
    widening means deciding which set a record ought to have had. **If you ever make one of those
    "limits" tests go green by widening the guard, the prose in three published places has to move with
    it.** `#defect-10`
11. **🩺 CLOSED 2026-08-05, as a REPORT.** `ASTM_UNKNOWN_ESCAPE_SEQUENCE` was the only report that a
    field separator was swallowed and it is tolerable, so strict under `referenceCorpus`
    **accepted** a record with no units and status `unspecified`. Now
    `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` fires **alongside** it, not instead, on the subset
    whose unrecognized body is one of the **three splitting roles** (not the escape role: nothing
    splits on it). **The atom was NOT narrowed and the value is byte-identical**, so nothing
    was repaired. **The laundering hop is NOT closed and must not be written as closed**: emit
    rewrites the sequence into mnemonics and generation 2 reads `warnings: []`, **correctly**, since
    those bytes say that value unambiguously. Catch it on the **first** read.
    `#defect-11`
12. **CLOSED 2026-08-04.** `encodeLeaf` ran as four chained whole-string substitutions, so an accepted
    set naming `E`/`F`/`S`/`R` in another role altered values: the space, the alphabet and every
    figure are in the notes (the committed test pins a **smaller** subspace on the same corpus, so
    **do not re-derive these figures from the test file's own space**), measured against the `STREAM`
    constant in `test/records/escape-mnemonic-roles.test.ts`. It is now one left-to-right
    pass, the exact inverse of `decodeEscapes`. **Never quote any of those figures without that space
    and that constant, because the corpus moves every one of them**, and name the corpus by a
    constant that is IN THE TREE. **"0 silent" is a weak measure here**; the tier that discriminates is
    strict-accepted-under-a-gate-legal-profile. **Never replace the narrow "what is not guaranteed"
    prose with a positive guarantee that emit preserves every field tree.**
    `#defect-12`
13. **CLOSED 2026-08-03.** `startFrameNumber` was documented `0`-`7` and unvalidated, and its worst
    branches were **silent** (`NaN`: four records in, zero out). It is now refused with `ASTM_FRAME_INVALID_START_FRAME_NUMBER`;
    **clamping and modulo were both rejected**, because the frame number is the decoder's only evidence
    that no frame was dropped. **Do not "simplify" it to "refuse anything but 1"**: the non-default
    start composes a continuation, measured byte-identical. **Do not reintroduce a rule for what a
    standalone continuation does: three successive formulations measured false, and the disposition at
    the ADR 0016 cap was a CUT, not a fourth rewrite.** The one statement that generalizes is that the
    record layer never reports the loss, so **read `frameWarnings`.** Its error message **names the
    value received, deliberately**, and is the one message in this class that quotes anything (a
    `startFrameNumber` is the caller's own option, never stream content): do not "fix" it to
    value-free. `#defect-13`
14. **Open, measured, pinned and disclosed 2026-08-04.** `serializeAstmRecords` silently drops a header
    delimiter-declaration surplus it could not read back: 31 of the 33 C0/`DEL` characters,
    `warnings: []`. **The behaviour stays, but one recorded reason for it measured FALSE and must not
    be restated**: 28 of the 31 round-trip byte-exactly through the frame layer. The reason that holds
    is the code site's own (never carry a control character rather than re-derive each layer's reserved
    list). **The drop is all-or-nothing**, and **it fires with no `d` argument at all**, so do not read
    it as "you have to pass a delimiter set to reach it". `#defect-14`
15. **🩺 CLOSED IN PART 2026-08-05, as a REPORT, and the MIRROR of defect 11. Read defect 17 for
    what is left.** A greedy leftmost atom can **GAIN** a boundary the sender escaped:
    `28.6&Z&|&U/L` reads value `28.6&Z&` and units `&U/L`,
    and both codes it raised were **tolerable**, so strict under a gate-legal profile **accepted** a
    value the bytes do not force. Now `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT`, not tolerable, once
    per competing alignment. **The split is UNCHANGED and every byte is identical**: the other
    alignment is a different guess with no more evidence behind it. **A RECOGNIZED mnemonic body is
    excluded**, because there the reading taken interprets a construct and the competitor **usually**
    interprets none. **Never write it as "the reading taken is conformant": it is not, and saying so
    was this slice's first refutation** (defect 17). **It does NOT reach through a re-emit** (measured),
    so catch it on the FIRST read. `#defect-15`
16. **CLOSED 2026-08-05, as a MESSAGE ONLY.** `readDelimiters`' field-collision branch is
    **unreachable** (the truncation rule answers first: 36 of 36, measured), so `H||^&` reported
    "too short" for a header that is not. `readDelimiterDeclaration` names which of the four
    conditions it was and the fatal says that.
    **The fatal CODE is unchanged and no stream's disposition moved**: a second fatal code was
    considered and **REJECTED**, as a breaking change bought for a sentence. **Do not delete the
    unreachable branch.** `#defect-16`
17. **🩺 (a), (b), (c) AND THE TAIL RESIDUE ALL CLOSED as REPORTS by weighing the TAIL; the
    pair count stays REJECTED.** ONE predicate, wired per role, never widened into each other: a
    contested alignment resuming on an escape character heading **NO sequence it can INTERPRET**
    (none, or an UNRECOGNIZED body). 15's exclusion untouched.
    (a) `28.6&F&|&U/L` gains a FIELD boundary: every later field shifts and the sender's `F` lands
    in the status slot, so units and status **`final`** are both FABRICATED on a tolerable code.
    `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS`. **Status still reads `final`; withholding the shifted
    slots was weighed and DEFERRED.**
    (b) `28.6&S&\&U/L` gains a REPEAT boundary. **Nothing shifts and the field is STILL read
    short**, because a field is modeled from `repeats[0]`: the value truncates and a UTID's
    components are DELETED. `ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD`, **reachable on the CANONICAL
    set**. It costs **NOT the units or status** (both read them empty): that reading measured FALSE.
    **Only the FIRST boundary reaches a modeled slot; at a LATER one it fires and nothing moves.**
    (c) `&F&^&GLU^L^687` gains a COMPONENT boundary. **Nothing leaves the record; slots MOVE one
    place**: a UTID's coding scheme and local code, a given name.
    `ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS`. **Repeat DROPS, component MOVES: a third code, not
    a wiring.** **EVERY boundary AT OR BEFORE the model's ARITY moves a slot, not just the first
    (UNLIKE (b)); PAST it nothing NAMED moves (a name models 3, a UTID 4), and in a LATER repeat
    nothing modeled moves. Fires in both.** **All 3 roles wired; NO fourth.**
    **🔴 FOUR INFERENCE ERRORS, EACH CAUGHT ONLY BY A SWEEP OR A REFUTER, TWO IN
    `dist/index.d.ts`. NEVER write "a repeat or component boundary cannot move a modeled slot", nor
    "EVERY gained boundary moves a slot" (a claim about the component LIST is not one about a
    MODELED SLOT, needing the ARITY), nor "reads ONE more segment", nor any of the THREE ROLE COST
    CLAIMS unqualified: a tail body EQUAL to the SPLIT delimiter TIES the counts, so NOTHING moves
    index (9 fields, 2 repeats, 3 components: BOTH). 55,296 tuples over 16 PAYLOAD SHAPES (committed
    axis; earlier corpora FIX it): 36,864 fire, 2,304 tie, 0 lack `..._SWALLOWED_BY_ESCAPE`, 0
    accepted before: over-reports, never under.**
    **🔴🔴 RECORDING a refuted universal is NOT correcting it: 3 artifacts held it, ~15
    surfaces still asserted it (3 RUNTIME MESSAGES), and the REWRITE grew a NEW one. GREP EVERY
    RESTATEMENT, incl. WHAT-TO-DO.**
    Each, 864 tuples: 192 fire, 64 move, **0 back, 0 escape-clean** (the pair count refused 48),
    disjoint. **CORPORA FIX AXES: SWEEP THEM** ((b)/(c) index; TAIL BODY 3,456: 2,304/528/0, 0 of
    384 clean). **ONE CONSTRUCT deep; no re-emit reaches any.**
    **⚖️ ONLY a RECOGNIZED tail is excluded (the ONLY ESCAPE-CLEAN one, ESCAPE ROLE DISTINCT): the whole over-refusal
    defence. "The bytes PREFER it" was the old reason: TRUE, NOT the question (these report a COST).
    🔴 THAT SILENCE IS A TRADE, NOT "nothing was lost"; a draft DROPPED that hedge from SIX
    surfaces and the ADVICE from a SEVENTH. On it the cost is `warnings: []`
    (`R|1|^^^687|28.6&F&|&F&U/L||||F` reads 9 fields and `final`). NEVER state the bound without it.**
    **▶ DO NOT RE-PROPOSE THE PAIR COUNT.** It is LOCAL, so it TIES on **well-formed** streams and
    refuses half of all escape-clean ones. **A corpus that FIXES the tail reports a comforting
    zero.**
    `#defect-17`

Two further defects were closed and folded away: `#defects-closed-elsewhere`.

**Before you touch `parse.ts`, `serialize.ts`, `escapes.ts`, `encode.ts`, `extractors.ts` or
`host-query.ts`, read the defect entries above and `CHANGELOG.md` `[Unreleased]`.**

## Tech Stack (the shared `@cosyte/*` standard)

Inherited from the published `@cosyte/*` config packages, never copied; source of truth is
`documentation/conventions.md` upstream. **Every item, and which package supplies it, is
`#tech-stack`. No second copy is kept here.**

- **The one trap: the `attw` script is `scripts/attw.mjs`, NOT the bare CLI**, which reports a missing
  `dist/` as "does not contain types" and **exits 0**. Guardrail below.

## Engineering Guardrails

The shared ones (no `any`, JSDoc on every public export, immutable by default, no `console.*`,
Postel's Law, fatal only for structural corruption, per-directory >= 90 coverage, and the rest) are
`#guardrails-shared`, verbatim. They bind here, and are not copied here.

### The two-file contract is gated

- **Pointers here are a backticked bare anchor, resolved in that file only by the link atop this
  one: lose it and every pointer goes at once.** `pnpm check:agent-notes`.
- **Never port a sibling's matcher, and never write a pointer into a changeset**:
  `#agent-notes-contract`.

### The `attw` gate: traps

Full text, with every measurement: `#attw`.

- **▶ `attw` says "does not contain types" and EXITS 0, so the `attw` script is a wrapper, not the
  bare CLI.** `getExitCode.js` opens with `if (!analysis.types) return 0`, so the problem list is
  never consulted and no `--profile`, `--ignore-rules` or config setting reaches it. For a package
  that ships types it means a **broken publish reported as a pass**. **A false green merges.**
- **The race only supplies the condition, and the defect is not the race** (`#attw`). So the answer
  is **not** a lock, a lease or a build queue: the gate must say its own inputs were missing,
  whatever removed them.
- **`scripts/attw.mjs` carries two nets that catch different things**: a preflight that every relative
  path `package.json` promises exists and is non-empty (catches the build window, names the file), and
  a post-check on the untyped sentence (catches declarations on disk but excluded from the tarball).
  Keep both.
- **Blinding options are refused BY OPTION NAME, wholesale, not by value** (`--quiet`, `--format`,
  `--config-path`, and a `.attw.json` setting either). Do not "tidy" that into value-parsing.
- **The refusal list is NOT a proof of closure and must never be written as one**
  (`--definitely-typed` suppresses the sentence by another mechanism and is deliberately not refused).
  The **preflight** is the net that does not depend on reading a string.
- **Do not write the repo count down here** (`#attw` carries the derivation). Every sibling still
  invoking the CLI keeps the false green, **including `config/scripts/parser-template/`, which new
  parser repos are minted from.**
- **Do not port a sibling's prose with its code, and never quote its timing**: `#attw-port`.

## Standing disciplines (every change)

Mirrors the three disciplines in the meta-repo's `documentation/conventions.md`, they bind here too:

1. **Documentation follows code**, a change to the public surface/stack/status isn't done until the
   docs are: this repo's docs content (`README.md`, `docs-content/`), the meta-repo
   `documentation/repos/astm.md` (bump its "last verified" date), and the `ecosystem-map.md`
   status table.
2. **Version + changelog**: a Changeset (`patch` on the `0.0.x` ladder) + a `CHANGELOG.md`
   `[Unreleased]` entry per meaningful change. Renaming a stable warning code is a **breaking change**.
3. **Crew + knowledgebase loop**: if this parser's public API or warning codes change, flag/update
   the matching `crew` healthcare skill + the KB product doc.
4. **No internal project bookkeeping on a public surface** (founder directive, 2026-07-27). Item
   identifiers (`ASTM-7`, `REAL-CORPUS`), phase and wave language, ADR numbers, meta-repo paths and
   "how this got built" commentary belong in the changeset, `CHANGELOG.md`, the commit, the PR and the
   roadmap. It is a **translation** at the boundary, not a deletion: **repair the head** when you strip
   an identifier off the front of a line. Gated by `pnpm check:no-internal-refs` (job id
   `no-internal-refs`, required on `main`). Full text:
   `#no-internal-refs`. Traps:
   - **Three source surfaces, three different answers.** `/** */` doc comments and string literals
     reach a consumer, so they are **gated**; `//` and plain `/* */` comments are **not**, and
     identifiers are **welcome** in them, because the convention says source comments are where
     identifiers belong.
   - **Do not justify that boundary from what reaches `dist/`.** Everything in `src/` is in the
     tarball (`dist/*.map` carries `sourcesContent`). The line is what a consumer is **shown**.
   - **Removing a doc comment to satisfy the gate is a regression, not a fix.**
   - **`phase` is the standard's word, not ours.** E1381/CLSI-LIS01 defines the protocol phase and
     `LtpState.phase` is an exported field. **Never re-key rule 2 on the bare word**, and never re-key
     rule 1 on the `WORD-N` shape (`ASTM-E1394`, `CLSI-LIS01`, `LIS02-A2`, `POCT1-A` and the `SPEC-7` /
     `ACC-42` sample ids are the reference material a reader came for).
   - **A zero from the gate is not a zero.** The worst finds were English sentences, not identifiers:
     prose that had **gone false** in the file every consumer receives. The reviewer owns half this
     rule.
5. **No em dash, anywhere** (founder directive, 2026-07-24), **including commit messages**. Gated by
   `pnpm check:no-emdash`: every tracked file, every tracked filename, the gate script itself, and
   on a PR the title, body and commit messages. Rewrite with a comma, a colon, a period, or
   **parentheses**. Full text: `#no-emdash`. Traps:
   - **Never re-encode the character.** The gate matches the entity, numeric-entity, URL and
     backslash-u forms; they are spelled out only inside `scripts/check-no-emdash.sh`, the one file
     excluded from its own scan.
   - **An em dash can be a semantic VALUE, and a bulk sweep destroys the meaning**: a dash meaning
     "governed by no standard" became a colon reading "unstated", and **nothing in CI could have
     caught it**. Convert table cells and list markers by hand first.
   - **Registry messages separate with a comma now; do not read that as "a comma is safe and a
     colon is not":** ASTM delimiters self-declare, so any character can be one. The pinned
     invariant is that a warning message is a **constant carrying no field data**
     (`test/records/multi-header-delimiters.test.ts`). Keep the test.
   - **Do not partition a scan on the NUL byte** (a real UTF-8 fixture embeds one and hid 8 em
     dashes): partition on **UTF-8 decodability**, never grep's `-I`. `#no-emdash`.
   - **The backslash-u arm is deliberately case-SENSITIVE** while the entity and URL arms are not: a
     case-blind arm there reds an ordinary Windows path. Do not "make it consistent".
   - **The gate is BOUNDED and the bound is written down**: no ES6 braced escape, no non-UTF-8
     encoding, and the script's own prose may hold an encoded form. All three are accepted, not
     oversights. **Do not widen the pattern to chase them.**
   - **The gate does not run on a Changesets "Version Packages" PR** (no workflow runs for
     `GITHUB_TOKEN`-authored events), so the push half catches a regression after the merge. **True of
     every gate in this repo.**
   - **`grep` in the dev container is a shell function wrapping ugrep** with `--ignore-files` forced
     on, so `dist/` is invisible to it. Measure with `/usr/bin/grep`. Both check scripts `unset -f` it
     and `check-no-emdash.sh` carries a **scanner visibility probe**. **Do not delete either.**
6. **A green PHI sweep is a claim about a corpus it OBSERVED: `WALK_ROOT_NAMES` UNION what git
   carries, never a list copied here.** Figures: `#phi-scan-scope`. Traps:
   - **ENUMERATION and DETECTION are separate holes, each "in addition to", never "instead of."**
     Roots alone buy the SSN/email floor; **`src/` was a root all along**: a record begins a LINE or
     a LITERAL, one assembled at run time is read by nobody.
   - **Anti-fabrication clauses, each pinned by a case that reds without it**: ONE left-to-right
     decode taking `\\` as a PAIR; a closed SOURCE-extension set (a `.astm` backslash is the REPEAT
     delimiter); delimiters read from the LINE view only; a second-field guard from
     `buildPatientLine`, **not any clause.**
   - **A sweep observing nothing REFUSES: exit 2, derived here, NEVER ported.** No count or floor of
     one sees it. **Path SETS clear DECOY bytes, an EMPTY index vacuously, so all mode READS the
     blobs; never normalize EOL first.** **`REPO_ROOT` is the scanner's file, not
     `process.cwd()`. Open: `--staged` is narrower.**
7. **`pnpm check` is `scripts/check-gate-coverage.ts`**: a fixed-name-list runner cannot see a gate
   outside its list, so **`test:fuzz`/`pack:docs` are INVISIBLE, not skipped** `#gate-coverage`
