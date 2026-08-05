# @cosyte/astm: Project Guide for Claude

> **The narrative lives in [`documentation/agent-notes.md`](documentation/agent-notes.md).** This
> file is the cursor, the rules, and the traps, one line each. Every trap below ends in a pointer to
> the section that records how it was measured, kept **verbatim**: read that section before you touch
> the code it guards. These are clinical-safety lessons, and several of them record a claim that was
> measured **false** after it shipped. Nothing has ever been deleted from it: the 2026-08-04 split
> and every relocation since moved narrative to the notes and left the traps here.
> The meta-repo bounds this file at write time through **its entry in `REPO_CLAUDE`**
> (`.claude/hooks/doc-budget.mjs`, argued in ADR 0023), a per-repo ratchet whose entries are
> **lowered as relocations land**. **No number for it is written here on purpose**: read the entry,
> and treat headroom in it as slack to give back rather than a budget to spend, because the real cost
> is tokens per worker, not bytes on disk. The remedy for a breach is to move more narrative into the
> notes file, **never** to drop a trap.

## Project

**`@cosyte/astm`**: a developer-focused ASTM parser + utility library for Node.js/TypeScript,
published under the Cosyte brand. Open-source (MIT). One of the sibling `@cosyte/*` healthcare-standard
parsers that **mirror each other's API**: `@cosyte/hl7` is the reference; this repo deliberately
copies its shape.

**North star (the archetype):** a developer can parse a real-world, vendor-quirky ASTM message
and pull useful fields out in one line, without reading the spec. Liberal on parse (quirks become
warnings), conservative on emit (always spec-clean). See `documentation/conventions.md` →
"The standard parser archetype" in the meta-repo for the full contract this repo must satisfy:
Postel's Law, the tiered tolerance model, stable warning codes, zero runtime deps, dual ESM + CJS,
immutability + explicit mutation, and the profile system.

## Status

**Published, public, feature-complete.** `@cosyte/astm` is live on npm on the pre-alpha `0.0.x`
ladder (first published 2026-07-22); the repo is public. Both standing human gates are crossed. All
ten roadmap phases have shipped, through release hardening. `src/` is `common/` (values), `records/`,
`frames/`, `ltp/`, `profiles/`, `terminology/`.
**Full per-phase histories, with what each phase deliberately deferred and why:**
`documentation/agent-notes.md#status-history`.

### Traps carried out of the status history

- **Never name a version in prose** here, in `README.md`, or in `docs-content/`. All four read
  `at 0.0.1` for days after `0.0.2` shipped, and `docs-content/` reaches docs.cosyte.com inside an
  **immutable** tarball. Derive it: `npm view @cosyte/astm version`. `www.npmjs.com` returns 403 to
  scripted requests, so it is not a usable check. Why: `documentation/agent-notes.md#status-history`.
- **`src/index.ts`'s exported `VERSION` is a different thing and IS bound** (`scripts/sync-version.mjs`
  in the release `version` script + an equality assertion in `test/sanity.test.ts`). Never "restore
  consistency" by re-pinning a number into prose. Why: `documentation/agent-notes.md#status-history`.
- **Never claim a clause id for ASTM/CLSI behaviour this repo cannot read.** LIS02-A2 §5.4/§6.2 are
  withheld from CLSI's free sample and the paywalled editions were not read, so the forward-scoping
  rule for redeclared delimiters, the Latin-1 wire encoding, and the reserved-byte set are all
  **reasoned from this package's own reader**, not cited. The OSS corpus cannot ground them either
  (python-astm and senaite hardcode `|\^&`). Why: `documentation/agent-notes.md#status-history`,
  `#defect-6`, `#defect-7`.
- **The profile safety gate is default-deny, and total over THREE registries**: every record,
  frame (`ASTM_FRAME_*`) and LTP (`ASTM_LTP_*`) code is safety-critical unless it is on
  `TOLERABLE_CODES`, and any new one is safety-critical **by default** until argued in. The fourth
  registry, `ASTM_LIVD_*`, sits **outside** the gate's universe by design (`src/terminology/warnings.ts`),
  so it is refused as _unknown_ rather than as _safety-critical_. **Never quote a count for the
  tolerable list: read `src/profiles/safety.ts`.** As of 2026-08-04 it is
  `ASTM_NONSTANDARD_DELIMITERS`, `ASTM_UNKNOWN_ESCAPE_SEQUENCE`, `ASTM_UNPAIRED_ESCAPE_CHARACTER`,
  `ASTM_RECORD_UNINTERPRETED_QUERY_STATUS`. **`ASTM_RECORD_UNKNOWN_TYPE` was removed from it
  2026-08-01 and must not return**; `ASTM_UNPAIRED_ESCAPE_CHARACTER` was **added** 2026-08-02 by
  defect 8's fix, which is why the relocated note's "the list was four and is now three" is a
  snapshot of 2026-08-01 and not the list today. Why:
  `documentation/agent-notes.md#status-history` and `#defect-8`.
- **The remedy when a tolerable code is the only report of a real loss is a SECOND, NARROWER code,
  not striking the first off.** Defects 4, 11 and 15 all had that shape, all closed that way
  2026-08-05: the three new codes are safety-critical by default and **must not be added to the
  list**, while `ASTM_NONSTANDARD_DELIMITERS`, `ASTM_UNKNOWN_ESCAPE_SEQUENCE` and
  `ASTM_UNPAIRED_ESCAPE_CHARACTER` stay on it, still
  true of the cases that cost nothing. Striking any off changes behaviour for every profile
  naming it and still leaves the loss reported by a code that fires where there is none. **Part 2
  has two named readers now** (`isSplittingDelimiter`, `isMnemonicBody`), the first of which the
  first refuter pass caught the file still denying. Why: `#defect-4`, `#defect-11`, `#defect-15`.
- **The admission test has TWO clauses, and the second is a claim about the whole library**: a
  tolerable code cannot alter, drop or fabricate an extracted value, **and nothing else in this
  package may read the condition the warning reports**. There is deliberately no automatic check for
  the second. **Re-derive the list whenever something new starts reading record structure.** Why:
  `documentation/agent-notes.md#status-history`.
- **Do not re-derive that list by comparing a parse with a profile against one without.** The warning
  transform runs after the records are built, so that comparison is identical for every code and
  passes a code that should never be tolerable. Measure it on pairs that must fail, as
  `test/profiles/unknown-record-type-safety.test.ts` does. Why:
  `documentation/agent-notes.md#status-history`.
- **The gate is enforced at two points and the second one is load-bearing.** `applyAstmProfile`
  re-checks `isSafetyCriticalCode` because `AstmProfile` is a plain interface and a hand-authored
  literal never passes through `defineAstmProfile`. Do not "simplify" it away as redundant. Why:
  `#defect-2`.
- **A profile never touches an extracted value.** It only re-badges a warning it expects to
  `PROFILE_QUIRK_APPLIED`; no warning is ever dropped, and a spec-clean message parses
  byte-identically with or without one. Why: `documentation/agent-notes.md#status-history`.
- **Never author a named per-vendor profile without a public vendor-attributed quirk document.**
  cobas / Sysmex / ADVIA / Mindray / Snibe stay gated; firsthand inspection of the public corpus found
  the record layer spec-clean. Why: `documentation/agent-notes.md#status-history`.
- **Never bundle LOINC / SNOMED / LIVD data, and never emit a guessed LOINC.** The catalog is
  consumer-supplied, the mapping is additive and advisory, a miss or a conflict is
  `unmapped`/`ambiguous` with a value-free warning. Why: `documentation/agent-notes.md#status-history`.
- **Never fabricate structure or a positive acknowledgement.** Checksums and frame numbers are
  computed, never faked; a frame the codec did not vouch for is `NAK`ed and never delivered; a builder
  emits only supplied values (an omitted result status reads `unspecified`, never `final`); an
  unrecognizable transport lead **defaults to framed and warns**, never a silent guess. Why:
  `documentation/agent-notes.md#status-history`.
- **`Q` dominates: a `Q`-bearing message is never read as a result set**, and `M`/`S` are surfaced
  **verbatim**, never interpreted into clinical fields. Why:
  `documentation/agent-notes.md#status-history` and `#defect-2`.
- **The differential vectors are captured, not vendored** (`python-astm` BSD `4170ce0c`, no reference
  code in the tree, CI needs no Python) and the **deliberate divergences are asserted on purpose**.
  Do not "fix" one to match. Why: `documentation/agent-notes.md#status-history`.
- **Delimiters are re-read at every `H` and scoped forward**, and records already read keep the set
  they were read with. Why: `documentation/agent-notes.md#status-history`.

## The shipped docs sidebar is a published contract

Full text: `documentation/agent-notes.md#docs-sidebar`.

- **`docs-content/sidebars.json` is a public contract, not a local build detail.** `docs-content/` is
  tarred verbatim into the release asset `cosyte/docs` ingests, and **a released asset is immutable**:
  a bad sidebar can only be superseded by a later release, never corrected in place. `v0.0.1` and
  `v0.0.2` both shipped a non-canonical top-level "About" and it rendered live at `/astm/`.
- **The section spine is Overview, Installation, Quickstart, Core Concepts, Guides, API Reference,
  Troubleshooting**, enforced upstream by `scripts/check-ia-conformance.ts` and transcribed here by
  `test/docs-sidebar-ia.test.ts`.
- **Categories are optional.** The rule is "if you have it, label it canonically and order it
  canonically", so the minimal `{"docs":["intro"]}` conforms. **Never make the test demand a section.**
- **"API Reference" is injected by `cosyte/docs`, never authored here.**
- **The spine is transcribed, not imported** (a parser repo cannot depend on the docs site), so the
  two copies can drift and **the upstream file is the source of truth**.

## Known defects live on `main`

Recorded so they survive independently of any backlog. **Numbers are stable**, and a closed entry is
kept rather than deleted, because the correction it records is usually the lesson. Full entries, with
every measurement and every refuted formulation:
`documentation/agent-notes.md#defects`. **A bare `#anchor` below is an anchor in that file**, which
is where every entry's own record lives.

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
   repeats of one component, and **the default-path re-emit still launders it** (measured, in the
   notes). **The field role is NOT in it** (that declaration does not resolve at all); it is the
   three pairs among the rest, **repeat/component, repeat/escape, component/escape**.
   `#defect-4`
5. **CLOSED 2026-08-03.** Emit could escape a record's own type letter away, and the worse branch was
   **silent**: a `P` came back as an **`R` record** whose value was the patient's lab ID, so
   `results()` returned a fabricated final result built out of patient identifiers.
   `serializeRecordChecked` now asserts the first character written is the letter the record models
   (`ASTM_EMIT_TYPE_LETTER_COLLISION`). **Do not "simplify" that byte-level check
   into a rule over the four delimiter roles**: a role list over-refuses, and the byte check survived
   the encoder being rewritten underneath it. **The `letter`+`E`+`letter` caveat is RETIRED.** **It is
   a transcoding condition and fires with no `d` argument, so "pass the canonical set instead" is not
   a remedy.** The refusal is a **narrowing on a published package reaching the lenient-parse
   population** (the fuzz figures are in the notes), **so say so wherever the refusal is described.**
   It promises a record re-reads as its own **type**, not that every field lands where it did, and
   `encodeComponent` / `serializeField` are **outside the check by construction** because they take
   no record. That is deliberate, not a gap to plug. `#defect-5`
6. **CLOSED 2026-08-03. It WAS a stop-the-line because its worst branch was SILENT**: an embedded
   `ETX` whose following two bytes happened to be a valid checksum made a short frame verify, merging
   the next record into a comment's free text and losing a result, `warnings: []` at both layers. An
   embedded `ETB` reaches the same silence by the other door. `composeAstmFrames` now throws
   `ASTM_FRAME_RESERVED_BYTE`, with **no bytes-instead escape hatch**. **The record layer is
   deliberately untouched**, measured. The three bytes are derived from what `decodeAstmFrames` reads
   as structure, **not**
   from a control-character class, so **`CR`/`LF` and `ENQ`/`ACK`/`NAK`/`EOT` are deliberately NOT in
   the set** (measured to round-trip byte-exactly inside a frame). Do not "complete" it to the control
   characters. **Neither this refusal nor defect 7's is total, and the bound is
   stated rather than left to be found:** both are on the declared `Uint8Array | string` signature, so
   a JavaScript caller passing some other typed array (a `Uint16Array`) still gets the old low-byte
   corruption from `Uint8Array.from`. **The two residues were measured separately and do not share an
   outcome:** defect 7's is silent, while defect 6's is framed and then lost at decode, silent
   **only** where the two bytes
   after it happen to be the short frame's checksum and reported as
   `ASTM_FRAME_BAD_CHECKSUM` otherwise. Never write either refusal as covering it, and
   never "tidy" the scoped doc comment into an unqualified one: **a false sentence in a comment that
   compiles into `dist/index.d.ts` is worse than the silence it replaced.**
   `#defect-6`
7. **CLOSED 2026-08-02. Recorded as LOUD; the larger half was SILENT.** `charCodeAt(i) & 0xff`
   truncated every character to its low byte, so `28.6|μmol/L` read back in `¼mol/L` and `GRAżYNA`
   **split across two fields** (`U+017C` low byte is the field separator), shifting every following
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
   it (that is defect 11). **That is the third time on this family that the claim, not the guard, was
   the defect.** The mangled-header fixture in `test/profiles/unknown-record-type-safety.test.ts` now
   reports a **second, incidental** code because its declaration is read as data: **that is not a
   second reader of the mangled header, and nothing may start treating it as one.**
   `#defect-8`
9. **Open.** `inline-loinc-candidate` is asserted with no LOINC evidence: any non-empty first component
   is tagged, so `Glucose` reports as a LOINC candidate. **Do not answer it inside another module's
   slice**; it wants its own. `#defect-9`
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
    whose unrecognized body is one of the **three splitting roles** (the escape role is excluded:
    nothing splits on it). **The atom was NOT narrowed and the value is byte-identical**, so nothing
    was repaired. **The laundering hop is NOT closed and must not be written as closed**: emit
    rewrites the sequence into mnemonics and generation 2 reads `warnings: []`, **correctly**, since
    those bytes say that value unambiguously. Catch it on the **first** read.
    `#defect-11`
12. **CLOSED 2026-08-04.** `encodeLeaf` ran as four chained whole-string substitutions, so an accepted
    set naming `E`/`F`/`S`/`R` in another role altered values: over P(18,4) = 73,440 four-role sets
    on the 18-character alphabet **enumerated in the notes** (the committed test pins the
    12-character subspace, P(12,4) = 11,880, on the same corpus, so **do not re-derive these figures
    from the test file's own space**), against the `STREAM` constant in
    `test/records/escape-mnemonic-roles.test.ts`, 9,287 of the 50,400 accepted sets were
    strict-accepted under a gate-legal profile with an altered field tree. It is now one left-to-right
    pass, the exact inverse of `decodeEscapes`. **Never quote any of those figures without that space
    and that corpus constant, because the corpus moves every one of them**, and name the corpus by a
    constant that is IN THE TREE: the predecessor entry's numbers were discarded because nobody wrote
    the space down, and this entry was refuted on its second pass for describing a scratch-file corpus
    as `STREAM`. **"0 silent" is a weak measure here** (a
    non-canonical set always reports `ASTM_NONSTANDARD_DELIMITERS`, which is tolerable, so
    `warnings: []` was unreachable); the tier that discriminates is
    strict-accepted-under-a-gate-legal-profile. **Never replace the narrow "what is not guaranteed"
    prose with a positive guarantee that emit preserves every field tree.**
    `#defect-12`
13. **CLOSED 2026-08-03.** `startFrameNumber` was documented `0`-`7` and unvalidated, and its worst
    branches were **silent** (`NaN` emitted a `NUL` into every frame: four records in, zero out).
    It is now refused with `ASTM_FRAME_INVALID_START_FRAME_NUMBER`;
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
    delimiter-declaration surplus it could not read back: 31 of the 33 C0/`DEL` characters, each with
    `warnings: []`. **The behaviour stays, but one recorded reason for it measured FALSE and must not
    be restated**: 28 of the 31 round-trip byte-exactly through the frame layer. The reason that holds
    is the code site's own (never carry a control character rather than re-derive each layer's reserved
    list). **The drop is all-or-nothing**, and **it fires with no `d` argument at all**, so do not read
    it as "you have to pass a delimiter set to reach it". `#defect-14`

15. **🩺 CLOSED 2026-08-05, as a REPORT, and the MIRROR of defect 11.** A greedy leftmost atom can
    **GAIN** a boundary the sender escaped: `28.6&Z&|&U/L` reads value `28.6&Z&` and units `&U/L`,
    and both codes it raised were **tolerable**, so strict under a gate-legal profile **accepted** a
    value the bytes do not force. Now `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT`, not tolerable, once
    per competing alignment. **The split is UNCHANGED and every byte is identical**: the other
    alignment is a different guess with no more evidence behind it. **A RECOGNIZED mnemonic is
    excluded on purpose** (`&F&` before a real separator is the escape mechanism working, and only
    the competitor is non-conformant there), and so is a delimiter with no escape character two
    positions on, which is no competitor at all. **It does NOT reach through a re-emit** (measured),
    so catch it on the FIRST read. `#defect-15`
16. **CLOSED 2026-08-05, as a MESSAGE ONLY.** `readDelimiters`' field-collision branch is
    **unreachable** (such a separator ends the definition where it appears, so the truncation rule
    answers first: 36 of 36, measured), so `H||^&` reported "too short" for a header that is not.
    `readDelimiterDeclaration` names which of the four conditions it was and the fatal says that.
    **The fatal CODE is unchanged and no stream's disposition moved**: a second fatal code was
    considered and **REJECTED**, as a breaking change bought for a sentence. **Do not delete the
    unreachable branch.** `#defect-16`

Two further defects (a `>3`-char declaration losing its surplus on emit, and an unvalidated
caller-supplied delimiter set) were closed: `documentation/agent-notes.md#defects-closed-elsewhere`.

**Before you touch `parse.ts`, `serialize.ts`, `escapes.ts`, `encode.ts`, `extractors.ts` or
`host-query.ts`, read that file's defect entries above and `CHANGELOG.md` `[Unreleased]`.**

## Tech Stack (the shared `@cosyte/*` standard)

This repo inherits the canonical toolchain by depending on the published `@cosyte/*` config packages,
not by copying files. The source of truth is the meta-repo's `documentation/conventions.md`: this is
a summary.

- **Language:** TypeScript (strict, full rigor set incl. `noUncheckedIndexedAccess`) via
  `@cosyte/tsconfig`. **Target ES2023**, `NodeNext`. TypeScript 5.9.x, exact-pinned.
- **Build:** dual ESM + CJS + `.d.ts` via `tsup` (`@cosyte/tsup-config`); `attw` is a publish gate
  (per-condition types: `.d.ts` for `import`, `.d.cts` for `require`). The `attw` script is
  **`scripts/attw.mjs`, not the bare CLI**: see the guardrail below, because the CLI reports a
  missing `dist/` as "does not contain types" and **exits 0**.
- **Node:** **>= 22** (CI matrix 22 + 24).
- **Package manager:** `pnpm@10`.
- **Lint/format:** **ESLint 10** + unified `typescript-eslint` (type-checked) via
  `@cosyte/eslint-config`; Prettier via `@cosyte/prettier-config`. Lint at `--max-warnings=0`.
- **Testing:** **Vitest 4** + v8 coverage (`@cosyte/vitest-config`), per-directory >= 90 gates; the
  property-based conformance invariants come from `@cosyte/test-utils` (round-trip, lenient-mode,
  immutability, warning-code stability), the format-specific arbitraries stay in this repo.
- **CI/CD:** thin callers of the reusable `cosyte/.github` workflows.
- **Runtime deps:** **Zero.** Node stdlib only.
- **License:** MIT.

## Engineering Guardrails

- No `any`. No unjustified `as` casts. Use `unknown` and narrow.
- JSDoc (with `@example`) on every public export: the JSDoc lint rule is an **error** on public
  exports, so this is enforced, not optional.
- Immutable by default. Mutation only via explicit methods.
- No `console.*` in library code. Throw typed errors or return results.
- Short, testable functions over big parsing blobs.
- Postel's Law: parser is liberal (lenient default + warnings), serializer is conservative (always
  emits spec-clean output).
- Fatal errors only for unrecoverable structural corruption (Tier-3 codes). Everything else is a
  warning with a stable code + positional context.
- Coverage: per-directory >= 90% (lines/branches/functions/statements), enforced by
  `pnpm test:coverage`.

### The `attw` gate: traps

Full text, with every measurement: `documentation/agent-notes.md#attw`.

- **▶ `attw` says "does not contain types" and EXITS 0, so the `attw` script is a wrapper, not the
  bare CLI.** `getExitCode.js` opens with `if (!analysis.types) return 0`, so the problem list is
  never consulted and no `--profile`, `--ignore-rules` or config setting reaches it. For a package
  that ships types it means a **broken publish reported as a pass**. A false red costs an hour; **a
  false green merges.**
- **The race only supplies the condition, and the defect is not the race.** Reproduced with zero
  concurrency; timed on **one** real `tsup` run of this package, `dist/` held JS and no declarations
  for 1,887 ms (an n=1 measurement, not a standing property of every build). So the answer is **not**
  a lock, a lease or a build queue: the gate must be able to say its own inputs were missing, whatever
  removed them.
- **`scripts/attw.mjs` carries two nets that catch different things**: a preflight that every relative
  path `package.json` promises exists and is non-empty (catches the build window, names the file), and
  a post-check on the untyped sentence (catches declarations on disk but excluded from the tarball).
  Keep both.
- **Blinding options are refused BY OPTION NAME, wholesale, not by value** (`--quiet`, `--format`,
  `--config-path`, and a `.attw.json` setting either). Do not "tidy" that into value-parsing.
- **The refusal list is NOT a proof of closure and must never be written as one**
  (`--definitely-typed` suppresses the sentence by another mechanism and is deliberately not refused).
  The **preflight** is the net that does not depend on reading a string.
- **Do not write the repo count down here.** Derive it:
  `/usr/bin/grep -rl '"attw":' --include=package.json --exclude-dir=node_modules .` from the tree
  root. Every sibling still invoking the CLI keeps the false green, **including
  `config/scripts/parser-template/`, which new parser repos are minted from.**
- **Do not port the sibling's prose with its code.** Re-take every measured claim here; a first draft
  shipped two that were not, and the refuter caught both. **Do not quote `terminology`'s 4.95 s**:
  the build window here is 1,887 ms, measured on this package.

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
   `documentation/agent-notes.md#no-internal-refs`. Traps:
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
     stale phase prose in `src/index.ts` and `AstmMessage` had **gone false** in the file every
     consumer receives. The reviewer owns half this rule.
5. **No em dash, anywhere** (founder directive, 2026-07-24), **including commit messages**. Gated by
   `pnpm check:no-emdash`, which scans every tracked file, every tracked filename, the gate script
   itself, and on a PR the title, body and commit messages. Rewrite with a comma, a colon, a period, or
   **parentheses**. Full text: `documentation/agent-notes.md#no-emdash`. Traps:
   - **Never re-encode the character.** The gate matches the entity, numeric-entity, URL and
     backslash-u forms; they are spelled out only inside `scripts/check-no-emdash.sh`, the one file
     excluded from its own scan.
   - **An em dash can be a semantic VALUE, and a bulk sweep destroys the meaning.** A bare dash meaning
     "governed by no standard" became a stray colon reading "unstated", on the page whose job is honest
     disclosure, and **nothing in CI could have caught it**. Convert table cells and list markers by
     hand first.
   - **All 22 registry messages separate with a comma now, but do not read that as "a comma is safe and
     a colon is not":** ASTM delimiters self-declare, so any character can be one. The invariant pinned
     by `test/records/multi-header-delimiters.test.ts` is that a warning message is a **constant
     carrying no field data**. Keep the test.
   - **Do not partition a scan on the NUL byte.** A genuine UTF-8 test file embeds a literal NUL and
     held 8 em dashes a NUL-partitioned census missed. Partition on **UTF-8 decodability**, never on
     grep's `-I` heuristic.
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
