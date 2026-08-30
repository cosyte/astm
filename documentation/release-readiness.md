# Release readiness: the pending changeset set, and the surface it would certify

This file is the audit behind the next release of `@cosyte/astm`. It records, for the pending
changeset set on this branch: what each changeset actually does to the public surface and what bump
that honestly is; the whole public export surface as the subject of the stability claim a `0.1.0`
makes; every break a consumer would see, each awaiting a decision that is not made here; and the
precondition that is not met, so nothing publishes yet.

It is bookkeeping, not consumer documentation. It is deliberately not `README.md` and not
`docs-content/`: neither ships this file, and the internal identifiers below belong on the inside.

**What this file does not do.** It does not publish, tag, approve the release environment, or
retrigger anything. It does not decide any break. It does not touch `package.json` `version` or
`src/index.ts` `VERSION`: Changesets owns the bump, `scripts/sync-version.mjs` mirrors it into the
source, and `test/sanity.test.ts` fails if the two ever disagree. Hand-editing either is the exact
failure that test exists to catch.

`test/scripts/release-readiness.test.ts` grades the machine-checkable half of this file against the
tree: the pending set, the applied bumps, the enumerated surface, the unresolved list and the
certification. If this file goes stale, that test goes red rather than this prose going quietly
wrong.

## 1. The pending changeset audit

The published version is the `version` field of `package.json`, `0.0.22`, on the pre-alpha `0.0.x`
ladder. The pending set below is every file matching `.changeset/*.md` other than `README.md`
(`config.json` is the tool's configuration and carries no bump).

Both pending changesets arrived classified `patch`. Both are reclassified to `minor` here, each for
a reason taken from its own text. The bump lines are the only lines rewritten: no changeset's prose
was edited, no changeset was added on top of the set, and nothing was blanket-rewritten.

<!-- audit:begin -->

| pending changeset                                     | bump as written | applied bump |
| ----------------------------------------------------- | --------------- | ------------ |
| `livd-catalog-answers-the-analyte.md`                  | `patch`         | `minor`      |
| `say-which-vocabulary-a-letter-was-graded-against.md`  | `patch`         | `minor`      |

<!-- audit:end -->

Highest bump in the set: `minor`. Applied to the published `0.0.22`, Changesets resolves
`@cosyte/astm` to **`0.1.0`**.

### `livd-catalog-answers-the-analyte.md`: `minor`

Its own text, under the heading "Public values REMOVED or RENAMED, with their replacements",
removes three public values and changes the return of a fourth:

- `UniversalTestId.loincCandidate` is removed, replaced by `UniversalTestId.unvalidatedWireValue`.
- The `"inline-loinc-candidate"` token is removed from `UniversalTestIdProvenance`, replaced by
  `"local-code"` where a vendor local code is present and by the new `"unvalidated-wire-value-only"`
  where none is.
- The `LivdMapping` variant `{ status: "inline-loinc", loinc, source: "wire" }` is removed, replaced
  positionally by the new variant `{ status: "no-vendor-code" }`.
- Under "Public values whose BEHAVIOR changed while keeping their name", the exported `primaryCode()`
  returns the vendor local code and nothing else, so it now answers `undefined` where it used to
  answer with a first-component value.

It also adds public values: `LivdAnnotation.unvalidatedWireValue` and
`LivdAnnotation.wireValueDisagreesWithCatalog`.

A `patch` claims a change that adds nothing and removes nothing. This one removes three public
values, adds two, and changes what an exported function returns. A removal or a rename of a public
value is not a fix, whatever the defect behind it was, so `patch` was not an understatement of
severity but a false description of the change. `minor` is the honest class.

### `say-which-vocabulary-a-letter-was-graded-against.md`: `minor`

Its own text is headed "Added", and the values it adds are public: `AbnormalFlag.vocabulary` and
`ResultStatus.vocabulary` on two exported interfaces; the recognized abnormal flags `HU` and `LU`,
which widen the exported `AbnormalFlagCode` union to eighteen letters; and the new exports
`ABNORMAL_FLAG_CODES`, `ABNORMAL_FLAG_VOCABULARY`, `RESULT_STATUS_VOCABULARY`,
`describeVocabulary`, and the types `NamedVocabulary`, `UnattributedVocabulary` and
`VocabularyAttribution`. Every one of those is re-exported from the package entry point and appears
in the surface enumerated in section 3.

Its "Changed" section is narrower: two warning message strings now read their attribution from the
same constants the interpreted values read. Both warning codes are unchanged and both messages stay
value-free.

A feature that adds public values is `minor` by the same rule that keeps a real fix at `patch`. It
removes nothing, but it does not have to: the added public values are enough on their own.

## 2. Why no changeset in this set is classified `major`

Neither changeset is `major`, and this is a decision rather than an omission.

`major` applied to a `0.0.x` version resolves to `1.0.0`. That is a different claim from the one
being made here and a different release from the one being prepared: it would take this package out
of the coordinated batch and assert a `1.0.0` stability guarantee nobody has decided to make. On
the pre-1.0 ladder the minor channel is where a break belongs, which is why the breaks in
section 4 are shipped as `minor` and surfaced there rather than escalated as a version-class
question.

If a future pending changeset's honest class ever is `major`, the rule is the opposite of a
convenience: leave its bump unapplied, record it in section 4 as a break candidate escalated to the
operator, and do not quietly write `minor` over it. A `major` silently downgraded to `minor` reads,
from the outside, exactly like a repo that had nothing to escalate.

## 3. The public export surface certified at `0.1.0`

The subject of the stability claim is the package's single public entry point, `src/index.ts`, and
the surface is everything it re-exports: values and types both. `package.json` publishes exactly one
entry (`.` plus `./package.json`), so this list is the whole declaration surface a consumer can
reach.

Counts: **113 values, 94 types, 207 identifiers**. The enumeration below is compared against the
entry point by `test/scripts/release-readiness.test.ts`, which names every added and every removed
identifier when the two differ, so this list cannot go stale in silence.

### Values

<!-- surface:values:begin -->

Declared in the entry point itself:

- `VERSION`

From `./records/parse.js`:

- `parseAstmRecords`
- `AstmStrictError`
- `attachComments`

From `./records/serialize.js`:

- `serializeAstmRecords`
- `serializeAstmRecord`
- `serializeField`
- `encodeComponent`
- `AstmSerializeError`

From `./records/build.js`:

- `buildAstmMessage`

From `./records/extractors.js`:

- `results`
- `patient`
- `orders`
- `comments`
- `commentsFor`
- `query`

From `./records/messages.js`:

- `messages`
- `AMBIGUOUS_CODES`
- `AstmAmbiguousStreamError`

From `./records/host-query.js`:

- `classifyMessage`

From `./records/tokenize.js`:

- `fieldScalar`
- `tokenizeHeader`
- `tokenizeRecord`

From `./records/result-semantics.js`:

- `ABNORMAL_FLAG_CODES`
- `interpretAbnormalFlag`
- `interpretResultStatus`
- `parseReferenceRange`

From `./common/vocabulary.js`:

- `ABNORMAL_FLAG_VOCABULARY`
- `RESULT_STATUS_VOCABULARY`
- `describeVocabulary`

From `./common/errors.js`:

- `FATAL_CODES`
- `AstmParseError`

From `./common/warnings.js`:

- `WARNING_CODES`
- `unknownRecordType`
- `fieldsUnseparated`
- `nonStandardDelimiters`
- `unknownEscapeSequence`
- `unpairedEscapeCharacter`
- `ambiguousValueSplit`
- `undefinedAbnormalFlag`
- `undefinedResultStatus`
- `unparseableReferenceRange`
- `unitsAbsent`
- `orphanComment`
- `partialTimestamp`
- `uninterpretedQueryStatus`
- `ambiguousMessageKind`
- `delimitersRedeclared`
- `delimiterRoleCollision`
- `delimiterSwallowedByEscape`
- `ambiguousEscapeAlignment`
- `alignmentShiftedComponents`
- `alignmentShiftedFields`
- `alignmentTruncatedField`
- `unreadableRedeclaration`
- `profileQuirkApplied`

From `./common/delimiters.js`:

- `CANONICAL_DELIMITERS`
- `readDelimiters`
- `readDelimiterDeclaration`
- `isNonStandard`
- `hasCollidingRoles`

From `./common/escapes.js`:

- `decodeEscapes`
- `splitEscapeAware`

From `./common/dates.js`:

- `parseAstmDate`
- `astmDateToLocalISO`

From `./common/coding-system.js`:

- `recognizeUniversalTestId`
- `primaryCode`

From `./common/freeze.js`:

- `deepFreeze`

From `./profiles/index.js`:

- `defineAstmProfile`
- `AstmProfileDefinitionError`
- `astmProfiles`
- `getAstmProfile`
- `listAstmProfiles`
- `setDefaultAstmProfile`
- `getDefaultAstmProfile`
- `applyAstmProfile`
- `applyAstmProfileToWarnings`
- `resolveProfileTransport`
- `SAFETY_CRITICAL_CODES`
- `TOLERABLE_CODES`
- `ALL_ASTM_WARNING_CODES`
- `isSafetyCriticalCode`

From `./terminology/index.js`:

- `defineLivdCatalog`
- `applyLivd`
- `lookupLivdForRecord`
- `LIVD_WARNING_CODES`
- `livdUnmappedCode`
- `livdAmbiguousMapping`

From `./ltp/transport.js`:

- `detectFraming`

From `./ltp/reducer.js`:

- `ltpInitialState`
- `ltpReduce`

From `./ltp/warnings.js`:

- `LTP_WARNING_CODES`
- `ltpAmbiguousTransport`
- `ltpUnexpectedEvent`
- `ltpFrameRejected`

From `./ltp/constants.js`, each exported under the name on the left:

- `ASTM_ENQ`
- `ASTM_ACK`
- `ASTM_NAK`
- `ASTM_EOT`

From `./frames/decode.js`:

- `decodeAstmFrames`

From `./frames/encode.js`:

- `composeAstmFrames`
- `AstmFrameEncodeError`

From `./frames/compose.js`:

- `parseFramedAstm`
- `serializeFramedAstm`

From `./frames/checksum.js`:

- `computeChecksum`
- `toChecksumHex`
- `parseChecksumHex`

From `./frames/errors.js`:

- `AstmFrameStrictError`

From `./frames/warnings.js`:

- `FRAME_WARNING_CODES`
- `frameBadChecksum`
- `frameSequenceGap`
- `frameUnterminated`
- `frameOversize`

<!-- surface:values:end -->

### Types

<!-- surface:types:begin -->

From `./records/serialize.js`:

- `AstmSerializeErrorCode`

From `./records/build.js`:

- `AstmRecordInput`
- `MessageInput`
- `HeaderInput`
- `PatientInput`
- `PatientNameInput`
- `OrderInput`
- `ResultInput`
- `CommentInput`
- `QueryInput`
- `VerbatimInput`

From `./records/messages.js`:

- `AstmStreamMessage`
- `AmbiguousCode`

From `./records/result-semantics.js`:

- `AbnormalFlag`
- `AbnormalFlagCode`
- `AbnormalFlagMeaning`
- `ReferenceRange`
- `ReferenceRangeKind`
- `ResultStatus`
- `ResultStatusCode`
- `ResultStatusMeaning`

From `./common/vocabulary.js`:

- `NamedVocabulary`
- `UnattributedVocabulary`
- `VocabularyAttribution`

From `./records/types.js`:

- `AstmField`
- `AstmMessage`
- `AstmMessageClassification`
- `AstmMessageKind`
- `AstmParseOptions`
- `AstmRecord`
- `HeaderRecord`
- `PatientRecord`
- `PatientName`
- `OrderRecord`
- `ResultRecord`
- `CommentRecord`
- `QueryRecord`
- `ManufacturerRecord`
- `ScientificRecord`
- `TerminatorRecord`
- `UnsupportedRecord`

From `./common/errors.js`:

- `FatalCode`

From `./common/warnings.js`:

- `WarningCode`
- `AstmRecordWarning`

From `./common/position.js`:

- `AstmPosition`

From `./common/delimiters.js`:

- `Delimiters`
- `DelimiterReadResult`
- `DelimiterDeclarationFault`

From `./common/escapes.js`:

- `UnknownEscapeSink`
- `UnpairedEscapeSink`
- `SwallowedDelimiterSink`
- `AmbiguousAlignmentSink`
- `ShiftedComponentsSink`
- `ShiftedFieldsSink`
- `TruncatedFieldSink`

From `./common/dates.js`:

- `AstmDate`
- `AstmDatePrecision`

From `./common/coding-system.js`:

- `UniversalTestId`
- `UniversalTestIdProvenance`

From `./profiles/index.js`:

- `AstmProfile`
- `DefineAstmProfileOptions`
- `AstmQuirkTolerance`
- `AstmQuirkMatch`
- `AstmProfileProvenance`
- `AnyAstmWarningCode`

From `./terminology/index.js`:

- `LivdCatalog`
- `LivdEntry`
- `LivdLookup`
- `LivdAnnotation`
- `LivdMapping`
- `LivdResult`
- `AstmLivdWarning`
- `LivdWarningCode`

From `./ltp/transport.js`:

- `AstmFraming`
- `DetectFramingOptions`
- `DetectFramingResult`

From `./ltp/warnings.js`:

- `LtpWarningCode`
- `AstmLtpWarning`

From `./ltp/types.js`:

- `LtpPhase`
- `LtpState`
- `LtpEvent`
- `LtpAction`
- `LtpTransition`

From `./frames/encode.js`:

- `AstmFrameEncodeErrorCode`
- `ComposeFramesOptions`

From `./frames/compose.js`:

- `FramedAstmResult`

From `./frames/warnings.js`:

- `FrameWarningCode`
- `AstmFrameWarning`

From `./frames/position.js`:

- `AstmFramePosition`

From `./frames/types.js`:

- `AstmFrame`
- `FrameChecksum`
- `FrameTerminator`
- `FrameOptions`
- `DecodeAstmFramesResult`

<!-- surface:types:end -->

### The stability certification

<!-- certification:begin -->

**The surface enumerated above is certified as the public API of `@cosyte/astm` at `0.1.0`: it is
settled, and it is stable enough for a consumer to depend on.** Every identifier in it is a
deliberate export with a documented contract, the record layer is feature-complete, and no part of
it is a placeholder waiting to be renamed. From `0.1.0` onward a removal or a rename of anything on
that list is a break with a real cost, to be surfaced and decided rather than absorbed as a patch.

The certification is scoped, deliberately, and the scope is the whole of its honesty:

- It certifies the surface **as of this branch**, which includes the changes the pending set carries
  (the removals and the behaviour change in section 4 are already applied in `src/`). It is not a
  claim that no consumer of `0.0.22` has work to do; section 4 is that work, enumerated.
- It is a claim about names, shapes and documented contracts, not a promise that a warning code
  never gains a member or that a lenient parse never becomes more precise. Both are additive and
  both are governed by the profile safety gate rather than by this file.
- Known open defects are recorded in `CLAUDE.md` and in `documentation/agent-notes.md`, and they
  stay open across this bump. A defect is a behaviour this package reports honestly and has not
  fixed; it is not an unsettled API.

<!-- certification:end -->

## 4. Break candidates, awaiting the operator

Every entry below is a change a consumer of `0.0.22` will see. **None of them is decided here.**
The operator decides, per repo, before any release; this file surfaces them so that decision has
something to read. Nothing in this list may be read as approval, and nothing publishes until
section 5's precondition is met.

Four of the entries are the public values the LIVD changeset removes or redefines, and
`primaryCode()` is the one that produces **no compile error at all**.

### 1. `UniversalTestId.loincCandidate` (removed)

- **Effect a consumer sees:** a compile error on every read of the field. Loud, and the whole
  population is found by the type checker.
- **Migration:** read `UniversalTestId.unvalidatedWireValue`, which carries the same verbatim first
  component. The name is the point: the value is not validated, is not a LOINC, and is never the
  code a result is keyed on.
- **Status:** awaits the operator's decision before any release.

### 2. The `"inline-loinc-candidate"` token of `UniversalTestIdProvenance` (removed)

- **Effect a consumer sees:** a compile error wherever the literal is written, compared or switched
  over. A consumer with a non-exhaustive `if` chain instead sees a branch that stops firing, which
  is silent.
- **Migration:** a populated first component **with** a vendor local code now reports `"local-code"`,
  because the local code is the identifier; **without** one it reports the new token
  `"unvalidated-wire-value-only"`, which says the value was seen without claiming it is a code.
- **Status:** awaits the operator's decision before any release.

### 3. The `LivdMapping` variant `{ status: "inline-loinc" }` (removed)

- **Effect a consumer sees:** a compile error in an exhaustive switch over the mapping status; a
  dead branch, silently, in a non-exhaustive one.
- **Migration:** its positional replacement is `{ status: "no-vendor-code" }`, which reports that a
  populated first component arrived with no vendor local code to look up. The replacement is
  deliberately narrower: it carries no `loinc` and no `source`, because there is no disposition that
  reports a wire value as a LOINC. The four retained dispositions (`mapped`, `unmapped`,
  `ambiguous`, `no-code`) keep their documented meanings exactly.
- **Status:** awaits the operator's decision before any release.

### 4. `primaryCode()`: THE BREAK THAT PRODUCES NO COMPILE ERROR

- **Effect a consumer sees:** nothing at build time. The signature is unchanged and the name is
  unchanged; only the answer moves. It now returns the vendor local code and nothing else, so where
  it used to answer with a first-component value it returns `undefined`, which is the same absence
  it has always returned for a record carrying nothing usable. A consumer keying results on its
  return value gets `undefined` where they used to get a value, at run time, on real traffic.
- **Migration:** audit every call site. The old value is still available and still surfaced, as
  `unvalidatedWireValue`, for a consumer who wants it knowing this library does not vouch for it.
  The fail-safe direction is deliberate: reporting no key is safer than reporting a key the library
  cannot vouch for, because a right value under the wrong analyte is a wrong clinical result.
- **Status:** awaits the operator's decision before any release. This is the entry to read first.

### 5. `LivdAnnotation.reportedCode` (meaning changed, name kept)

- **Effect a consumer sees:** no compile error. It is now always the code the catalog was actually
  consulted with, and is absent when nothing was looked up, so a consumer reading it as "the code we
  reported for this record" sees it go absent on records where no lookup happened.
- **Migration:** read `unvalidatedWireValue` for the verbatim first component, which is present on
  every disposition; read `reportedCode` only as "what the catalog was asked about".
- **Status:** awaits the operator's decision before any release.

### 6. `AbnormalFlag.vocabulary` and `ResultStatus.vocabulary` (required properties added)

- **Effect a consumer sees:** a compile error only where the consumer **constructs** one of these
  values themselves, typically a test double or a fixture, because a required property was added to
  an exported interface. Reading either type is unaffected and additive.
- **Migration:** build the property from the exported constants `ABNORMAL_FLAG_VOCABULARY` and
  `RESULT_STATUS_VOCABULARY` rather than writing a literal, so a stub tracks the library.
- **Status:** awaits the operator's decision before any release.

### 7. `AbnormalFlagCode` widened by `HU` and `LU`

- **Effect a consumer sees:** two effects, and the second is silent. A consumer with an exhaustive
  switch over the union gets a compile error for the two new members. A consumer branching on
  `recognized === false` for an `HU` or `LU` feed sees that branch stop firing: those letters are
  now recognized, with meanings `"significantly-high"` and `"significantly-low"`, and no longer
  produce a warning and a `"undefined"` meaning.
- **Migration:** handle the two codes. They are distinct from `H`/`L` (outside the interval), from
  `HH`/`LL` (critical) and from the directional `U`/`D`, all six of which keep their readings. The
  deprecated `H>` and `L<` stay unrecognized deliberately.
- **Status:** awaits the operator's decision before any release.

## 5. Unresolved

An unresolved entry is a pending changeset that cannot be classified from its own text plus the
change it documents, recorded with the question that blocks it. **While any unresolved entry stands,
the stability certification in section 3 is withheld**, and the test grades that rule rather than
trusting this sentence.

<!-- unresolved:begin -->

None. Both pending changesets classify from their own text: each states, in its own words, which
public values it adds and which it removes, and both were checked against `src/index.ts` and the
modules behind it.

<!-- unresolved:end -->

## 6. Publication is blocked, and the bump is prepared rather than published

**Nothing here publishes anything, and the bump prepared on this branch is not a release.**

- **The precondition that is not met.** Publication is blocked until the release-frequency policy
  work lands (`S0161-release-frequency-policy` in the meta-repo). Until it does, nothing publishes,
  by the operator's own decision of 2026-08-28, which also declined the offered route of
  hand-approving the release environment to relieve deadline pressure.
- **What merging this branch does do.** `.github/workflows/release.yml` fires on a push to `main`
  and calls the shared release pipeline, which parks on the `release` environment gate. That is the
  current state of every merge into this repo and this work does not change it. This work must not
  approve, drain, retrigger or otherwise relieve that gate, and does not.
- **So the honest reading of this branch** is: the pending set now resolves to `0.1.0` instead of
  `0.0.23`, the surface that number would certify is on record, and the breaks a consumer would see
  are enumerated and waiting on a decision. The version in `package.json` is still `0.0.22` and will
  stay `0.0.22` until Changesets writes the next one.

### The follow-on this bump creates, recorded so it is not lost

`CLAUDE.md` standing discipline 2 currently says that a change ships with a Changeset that is
`patch` on the `0.0.x` ladder. That sentence is still correct today and is deliberately left alone
here: the repo is on `0.0.x` until `0.1.0` publishes, and rewriting the guidance first would make it
describe a ladder this repo is not on yet.

**It goes stale the moment `0.1.0` publishes, and must be revised then**, to say that a feature or
an added public value is `minor`, that a real fix is `patch`, and that on the `0.x` ladder a break
ships in the minor channel and is surfaced for a decision before the release rather than absorbed.
That revision is a separate change and is not made here.
