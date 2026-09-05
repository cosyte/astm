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

- **Never name a version in prose** here, in `README.md`, or in `docs-content/`: all four went stale
  once, and `docs-content/` ships inside an **immutable** tarball. Derive it with
  `npm view @cosyte/astm version`. `#status-history`.
- **`src/index.ts`'s exported `VERSION` is a different thing and IS bound** (`scripts/sync-version.mjs`
  plus an equality assertion in `test/sanity.test.ts`); never "restore consistency" by re-pinning a
  number into prose. `#status-history`.
- **Never claim a clause id for ASTM/CLSI behaviour this repo cannot read**: the paywalled editions
  were not read and the OSS corpus cannot ground them, so those rules are **reasoned from this
  package's own reader**, never cited. `#status-history`, `#defect-6`, `#defect-7`.
- **The profile safety gate is default-deny, and total over THREE registries**, with `ASTM_LIVD_*`
  **outside** its universe by design; a new code is safety-critical **by default** until argued in.
  **Never quote the tolerable list or its count here: read `src/profiles/safety.ts`.**
  `#status-history`, `#defect-8`.
- **The remedy when a tolerable code is the only report of a real loss is a SECOND, NARROWER code,
  not striking the first off.** `#defect-4`, `#defect-11`, `#defect-15`.
- **The admission test has TWO clauses, and the second is a claim about the whole library** with no
  automatic check: re-derive the list whenever something new starts reading record structure.
  `#status-history`.
- **Do not re-derive that list by comparing a parse with a profile against one without**: measure it
  on pairs that must fail, as `test/profiles/unknown-record-type-safety.test.ts` does.
  `#status-history`.
- **The gate is enforced at two points and the second one is load-bearing**: do not "simplify"
  `applyAstmProfile`'s re-check away as redundant. `#defect-2`.
- **A profile never touches an extracted value**: it only re-badges a warning it expects to
  `PROFILE_QUIRK_APPLIED`, and a spec-clean message parses byte-identically with or without one.
  `#status-history`.
- **Never author a named per-vendor profile without a public vendor-attributed quirk document.**
  `#status-history`.
- **Never bundle LOINC / SNOMED / LIVD data, and never emit a guessed LOINC**: **the catalog answers
  for the analyte identity and the wire never does**, and this package performs **no LOINC
  validation of any kind**. `#status-history`, `#defect-9`.
- **Never fabricate structure or a positive acknowledgement**: checksums and frame numbers are
  computed, an unvouched frame is `NAK`ed, a builder emits only supplied values, and an
  unrecognizable transport lead **defaults to framed and warns**. `#status-history`.
- **`Q` dominates: a `Q`-bearing message is never read as a result set**, and `M`/`S` are surfaced
  **verbatim**, never interpreted into clinical fields. `#status-history`, `#defect-2`.
- **The differential vectors are captured, not vendored**, and the **deliberate divergences are
  asserted on purpose**: do not "fix" one to match. `#status-history`.
- **Delimiters are re-read at every `H` and scoped forward**, and records already read keep the set
  they were read with. `#status-history`.

## The shipped docs sidebar is a published contract

Full text, with the spine, the file names and the measurements: `#docs-sidebar`.

- **`docs-content/sidebars.json` is a public contract, not a local build detail**, and the asset it
  ships in is **immutable**: a bad sidebar is superseded by a later release, never corrected in
  place. It has shipped wrong once and rendered that way.
- **The spine is transcribed from upstream, not imported**, so the copies drift and **upstream is
  the source of truth**. Graded by `test/docs-sidebar-ia.test.ts`.
- **Categories are optional**, so `{"docs":["intro"]}` conforms: **never make the test demand a
  section**. **"API Reference" is injected by `cosyte/docs`, never authored here.**

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

- **`attw` says "does not contain types" and EXITS 0, so the `attw` script is a wrapper, not the bare
  CLI**: `getExitCode.js` opens with `if (!analysis.types) return 0`, so a broken publish is reported
  as a pass and **a false green merges**.
- **The race only supplies the condition, and the defect is not the race**, so the answer is **not** a
  lock, a lease or a build queue: the gate must say its own inputs were missing, whatever removed them.
- **`scripts/attw.mjs` carries two nets that catch different things** (a path preflight and a
  post-check on the untyped sentence): **keep both**.
- **Blinding options are refused BY OPTION NAME, wholesale, not by value**; do not "tidy" that into
  value-parsing.
- **The refusal list is NOT a proof of closure and must never be written as one**; the **preflight**
  is the net that does not depend on reading a string.
- **Do not write the repo count down here**, and note every sibling still invoking the CLI keeps the
  false green, **including `config/scripts/parser-template/`**.
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
   identifiers, phase and wave language, ADR numbers, meta-repo paths and "how this got built"
   commentary belong in the changeset, `CHANGELOG.md`, the commit, the PR and the roadmap. It is a
   **translation** at the boundary, not a deletion: **repair the head** when you strip an identifier
   off the front of a line. Gated by `pnpm check:no-internal-refs`. Full text: `#no-internal-refs`.
   Traps:
   - **Three source surfaces, three different answers**: `/** */` doc comments and string literals
     are **gated**, while `//` and plain `/* */` comments are **not** and identifiers are welcome in
     them. **Do not justify that boundary from what reaches `dist/`**: everything in `src/` is in the
     tarball, and the line is what a consumer is **shown**.
   - **Removing a doc comment to satisfy the gate is a regression, not a fix.**
   - **`phase` is the standard's word, not ours**, and `LtpState.phase` is an exported field: never
     re-key rule 2 on the bare word, and never re-key rule 1 on the `WORD-N` shape.
   - **A zero from the gate is not a zero.** The worst finds were English sentences that had **gone
     false** in the file every consumer receives. The reviewer owns half this rule.
5. **No em dash, anywhere** (founder directive, 2026-07-24), **including commit messages**. Gated by
   `pnpm check:no-emdash`: every tracked file, every tracked filename, the gate script itself, and on
   a PR the title, body and commit messages. Rewrite with a comma, a colon, a period, or
   **parentheses**. Full text: `#no-emdash`. Traps:
   - **Never re-encode the character**: the entity, numeric-entity, URL and backslash-u forms are all
     matched, and are spelled out only inside `scripts/check-no-emdash.sh`.
   - **An em dash can be a semantic VALUE, and a bulk sweep destroys the meaning**, with **nothing in
     CI able to catch it**: convert table cells and list markers by hand first.
   - **Registry messages separate with a comma now; do not read that as "a comma is safe and a colon
     is not"**: the pinned invariant is that a warning message is a **constant carrying no field
     data** (`test/records/multi-header-delimiters.test.ts`). Keep the test.
   - **Do not partition a scan on the NUL byte**: partition on **UTF-8 decodability**, never grep's
     `-I`. `#no-emdash`.
   - **The backslash-u arm is deliberately case-SENSITIVE** while the entity and URL arms are not; do
     not "make it consistent".
   - **The gate is BOUNDED and the bound is written down** (no ES6 braced escape, no non-UTF-8
     encoding, and the script's own prose may hold an encoded form): **do not widen the pattern to
     chase them.**
   - **The gate does not run on a Changesets "Version Packages" PR**, so the push half catches a
     regression after the merge. **True of every gate in this repo.**
   - **`grep` in the dev container is a shell function wrapping ugrep** with `--ignore-files` forced
     on, so `dist/` is invisible to it. Measure with `/usr/bin/grep`. Both check scripts `unset -f`
     it and `check-no-emdash.sh` carries a **scanner visibility probe**. **Do not delete either.**
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
   - **A run that ENUMERATES a target and never READS it REFUSES at the same exit 2, and reports any
     hit it already found before refusing.** A withdrawn `--allow-fixture` target buys a refusal, not
     a clean verdict: the reconciliation is the enumeration half again, and it must never swallow a
     real hit.
7. **`pnpm check` is `scripts/check-gate-coverage.ts`**: a fixed-name-list runner cannot see a gate
   outside its list, so **`test:fuzz`/`pack:docs` are INVISIBLE, not skipped** `#gate-coverage`
