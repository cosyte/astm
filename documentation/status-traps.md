# Status history traps

The traps `CLAUDE.md` carries under the heading below, in full. A backticked bare anchor here is
an anchor in [`agent-notes.md`](agent-notes.md), on the convention `CLAUDE.md` states at its top.

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
- **The LIVD unit comparison is VERBATIM and CASE SENSITIVE and it is NOT UCUM, and `unitComparison`
  says so ON THE OUTPUT: do not "tidy" that field away as redundant with the docs.** Nothing is
  normalized, case folded, scaled or converted on either side, **blank is not a unit on either
  side**, and the specimen and result descriptions are stored and surfaced but **NEVER matched on**.
  A SINGLE candidate LOINC is answered whether or not the units agree and carries NO
  `unitComparison`, and the added answer fields are **conditional**: do not make them unconditional.
  **A `mapped` answer's `representativeUnit` is the catalog ROW's, not the record's.** **The
  refusal's never-chose rule is a CLOSED KEY SET, never a search of its JSON for a `loinc` token**,
  which reds about one unseeded run in six. `#livd-units`.
- **Never fabricate structure or a positive acknowledgement**: checksums and frame numbers are
  computed, an unvouched frame is `NAK`ed, a builder emits only supplied values, and an
  unrecognizable transport lead **defaults to framed and warns**. `#status-history`.
- **`Q` dominates: a `Q`-bearing message is never read as a result set**, and `M`/`S` are surfaced
  **verbatim**, never interpreted into clinical fields. `#status-history`, `#defect-2`.
- **The differential vectors are captured, not vendored**, and the **deliberate divergences are
  asserted on purpose**: do not "fix" one to match. `#status-history`.
- **Delimiters are re-read at every `H` and scoped forward**, and records already read keep the set
  they were read with. `#status-history`.
