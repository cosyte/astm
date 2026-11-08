# Release readiness: the pending changeset set, and the surface it would certify

This file is the audit behind the next release of `@cosyte/astm`. It records, for the pending
changeset set on this branch: what each changeset actually does to the public surface and what bump
that honestly is; the whole public export surface as the subject of the stability claim the `0.1.x`
line makes; every break a consumer would see; and what has to happen before anything publishes.

It was first taken for `0.1.0`. It was taken again on 2026-11-07 for the first set pending after
`0.1.0` published, and on 2026-11-08 for the first sets pending after `0.1.1`, after `0.1.2` and
after `0.1.3`, because `test/scripts/release-readiness.test.ts` fails on such a set until it is
audited and the published base is moved. The `0.1.0` audit as it stood when that version shipped is
this file at the `v0.1.0` tag, and the `0.1.1`, `0.1.2` and `0.1.3` audits are this file at the
`v0.1.1`, `v0.1.2` and `v0.1.3` tags. What it found that still matters to a consumer, the breaks `0.1.0` shipped, is
kept in section 4.

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

The published version is the `version` field of `package.json`, `0.1.3`, published on 2026-11-08
through npm trusted publishing. The pending set below is every file matching `.changeset/*.md`
other than `README.md` (`config.json` is the tool's configuration and carries no bump).

One changeset is pending, and it arrived carrying `patch`. It is applied as written, because its own
text and the change it documents both support `patch`, as read below. Reclassification runs in both
directions or it is not a reading, so the same rule that moved three `0.1.0` changesets up to
`minor` is what keeps this one at `patch`.

<!-- audit:begin -->

| pending changeset                | bump as written | applied bump |
| -------------------------------- | --------------- | ------------ |
| `classification-stream-scope.md` | `patch`         | `patch`      |

<!-- audit:end -->

Highest bump in the set: `patch`. Applied to the published `0.1.3`, Changesets resolves
`@cosyte/astm` to **`0.1.4`**.

### `classification-stream-scope.md`: `patch`

Its own text says the documentation of `AstmMessage.classification` and the types around it now
says the classification covers the whole stream, that one warning's message text changes from
"Message carried both" to "Stream carried both", and that classification, warning codes and every
other value are unchanged. Each claim was checked against the tree rather than taken from the text.

- **Why the release exists.** The doc comment on `AstmMessage.classification` called it "the
  host-query classification of this message", but `parseAstmRecords` folds `classifyMessage` over
  every record in the stream, so on a multi-message stream a `Q` in one message made the whole
  stream read as a host query while the published types said otherwise.
  `docs-content/guides-api-by-layer.md` already said it correctly. The JSDoc ships in
  `dist/index.d.ts` and `dist/index.d.cts`, so a consumer reading it in an editor sees the
  correction only once a version carries it.
- **What the tarball changes.** `package.json` ships `dist`, `README.md`, `LICENSE` and
  `CHANGELOG.md`. Between the `v0.1.3` tag and this branch four files under `src/` changed:
  `src/records/types.ts`, `src/records/host-query.ts` and `src/records/parse.ts` in comments only,
  and `src/common/warnings.ts` in comments and the one constant message string of
  `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND`. `tsup.config.ts` and `tsconfig.json` are unchanged.
  `package.json` changed in its scripts and dev dependencies only, and `pnpm-lock.yaml` in dev
  dependencies only. `CHANGELOG.md` gains the entry Changesets writes from this changeset.
- **What the build shows.** Built from this branch, `dist/index.mjs` and `dist/index.cjs` differ
  from the files in the published `0.1.3` tarball in the doc comment on that warning code, which
  the build keeps, and in the message string. `dist/index.d.ts` and `dist/index.d.cts` differ in
  doc comments only, and the file list of `dist/` is the same.
- **What the tests show.** `test/records/message-scoping.test.ts` pins the stream-wide behaviour: a
  two-message stream whose first message is a host query and whose second is a result upload
  classifies as `host-query` with `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND`, while
  `classifyMessage(m.records)` over `messages()` answers `host-query` and `results`; an unsupported
  record in one message withholds the kind for the whole stream; and on a single-message stream the
  two agree.

Measured against section 3's enumeration, it adds no value, removes none, renames none, and changes
no exported function's documented behaviour: the documentation now matches what the code always
did. No warning code moves, and a warning's message is value-free prose, not a contract. That is
what a `patch` claims, so `patch` is what it keeps.

## 2. Why no changeset in this set is classified `major`

No changeset in the set is `major`, and this is a decision rather than an omission.

`major` applied to a `0.x` version resolves to `1.0.0`. That is a different claim from the one being
made here and a different release from the one being prepared: it would take this package out of the
coordinated batch and assert a `1.0.0` stability guarantee nobody has decided to make. On the
pre-1.0 ladder the minor channel is where a break belongs, which is why the breaks `0.1.0` shipped
(section 4) went out as `minor` rather than being escalated as a version-class question. This set
carries no break at all.

If a future pending changeset's honest class ever is `major`, the rule is the opposite of a
convenience: leave its bump unapplied, record it in section 4 as a break candidate escalated to the
operator, and do not quietly write `minor` over it. A `major` silently downgraded to `minor` reads,
from the outside, exactly like a repo that had nothing to escalate.

## 3. The public export surface certified at `0.1.0`, unchanged in `0.1.1`, `0.1.2`, `0.1.3`, and `0.1.4`

The subject of the stability claim is the package's single public entry point, `src/index.ts`, and
the surface is everything it re-exports: values and types both. `package.json` publishes exactly one
entry (`.` plus `./package.json`), so this list is the whole declaration surface a consumer can
reach.

`src/index.ts` is unchanged since the `v0.1.0` tag, so the enumeration below is the one `0.1.0`
certified, and the test grades it against this branch's entry point, not against that tag.

Counts: **118 values, 102 types, 220 identifiers**. The enumeration below is compared against the
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

From `./common/date-conversion.js`:

- `toObject`
- `toISO`
- `toDate`

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
- `LIVD_CATALOG_IDENTITY_UNDECLARED`
- `livdUnmappedCode`
- `livdAmbiguousMapping`
- `livdCatalogMissingLoincVersion`

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

From `./common/date-conversion.js`:

- `DateParts`
- `ToDateOptions`

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
- `LivdCandidate`
- `LivdPublication`
- `LivdUnitComparison`
- `LivdAmbiguityReason`
- `LivdAnnotation`
- `LivdMapping`
- `LivdResult`
- `AstmLivdWarning`
- `AstmLivdCatalogWarning`
- `LivdCatalogIdentity`
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

**The surface enumerated above is certified as the public API of `@cosyte/astm` at `0.1.0`, and it
is carried unchanged into `0.1.1`, `0.1.2`, `0.1.3`, and `0.1.4`: it is settled, and it is stable enough for a consumer to depend
on.** Every identifier in it is a deliberate export with a documented contract, the record layer is
feature-complete, and no part of it is a placeholder waiting to be renamed. From `0.1.0` onward a
removal or a rename of anything on that list is a break with a real cost, to be surfaced and decided
rather than absorbed as a patch.

The certification is scoped, deliberately, and the scope is the whole of its honesty:

- It certifies the surface **as of this branch**. Against `0.1.0` that surface is identical:
  `src/index.ts` and every module behind it are unchanged apart from comments (section 1), so a
  consumer of `0.1.0` has no work to do to take `0.1.1`. Since `0.1.1` one doc comment under
  `src/` has changed and nothing else, so the same holds for `0.1.2`. Since `0.1.2` one pattern
  inside a private function has changed, classifying every value as before, so the same holds for
  `0.1.3`. Since `0.1.3` doc comments and one warning's message text have changed, so the same holds
  for `0.1.4`. The work a consumer of `0.0.22` had to do to take `0.1.0`
  is section 4, enumerated.
- It is a claim about names, shapes and documented contracts, not a promise that a warning code
  never gains a member or that a lenient parse never becomes more precise. Both are additive and
  both are governed by the profile safety gate rather than by this file.
- Known open defects stay open across this bump. A defect is a behaviour this package reports
  honestly and has not fixed; it is not an unsettled API.

<!-- certification:end -->

## 4. Break candidates

This set carries none. Section 1 found no public value added, removed, renamed or changed in
behaviour, so a consumer of `0.1.0` sees no break in `0.1.1`.

The ten entries below are the breaks `0.1.0` shipped, as a consumer of `0.0.22` sees them. They stay
here because `CHANGELOG.md` sends that consumer to this file for each migration. They were held for
the operator before `0.1.0`, the operator's direction of 2026-09-25 to publish `0.1.x` (section 6)
is what shipped them, and each **Status** line now says so.

Entries 1 to 4 are the public values the LIVD changeset removes or redefines, and `primaryCode()`
is the one that produces **no compile error at all**.

The ten candidates at a glance, so the decision has an index and not ten pages of prose. Each
one is argued in full under its own heading below, and the class after the dash is what a
consumer's BUILD does, not how severe the change is:

1. `UniversalTestId.loincCandidate` - removed: a compile error on every read.
2. The `"inline-loinc-candidate"` token of `UniversalTestIdProvenance` - removed: a compile error
   wherever the literal is written.
3. The `LivdMapping` variant `{ status: "inline-loinc" }` - removed: a compile error in an
   exhaustive switch.
4. `primaryCode()` - behaviour changed: **no compile error at all**; the answer moves at run time.
5. `LivdAnnotation.reportedCode` - meaning changed: no compile error.
6. `AbnormalFlag.vocabulary` and `ResultStatus.vocabulary` - required property added: a compile
   error only where a consumer constructs one of those values.
7. `AbnormalFlagCode` widened by `HU` and `LU` - union widened: a compile error in an exhaustive
   switch, plus a silent behaviour change for a feed sending either letter.
8. `LivdAnnotation.wireValueDisagreesWithCatalog` - required property added: a compile error only
   where a consumer constructs a `LivdAnnotation`.
9. `AbnormalFlagMeaning` widened by `"significantly-high"` and `"significantly-low"` - union
   widened: a compile error in an exhaustive switch over `AbnormalFlag.meaning`, plus the same
   silent behaviour change entry 7 reports, read off the meaning rather than off the letter.
10. `LivdWarningCode` widened by `"ASTM_LIVD_CATALOG_NO_LOINC_VERSION"` - union widened: a compile
    error in an exhaustive switch over the union, and nothing else.

### 1. `UniversalTestId.loincCandidate` (removed)

- **Effect a consumer sees:** a compile error on every read of the field. Loud, and the whole
  population is found by the type checker.
- **Migration:** read `UniversalTestId.unvalidatedWireValue`, which carries the same verbatim first
  component. The name is the point: the value is not validated, is not a LOINC, and is never the
  code a result is keyed on.
- **Status:** shipped in `0.1.0`, on the operator's direction of 2026-09-25 (section 6).

### 2. The `"inline-loinc-candidate"` token of `UniversalTestIdProvenance` (removed)

- **Effect a consumer sees:** a compile error wherever the literal is written, compared or switched
  over. A consumer with a non-exhaustive `if` chain instead sees a branch that stops firing, which
  is silent.
- **Migration:** a populated first component **with** a vendor local code now reports `"local-code"`,
  because the local code is the identifier; **without** one it reports the new token
  `"unvalidated-wire-value-only"`, which says the value was seen without claiming it is a code.
- **Status:** shipped in `0.1.0`, on the operator's direction of 2026-09-25 (section 6).

### 3. The `LivdMapping` variant `{ status: "inline-loinc" }` (removed)

- **Effect a consumer sees:** a compile error in an exhaustive switch over the mapping status; a
  dead branch, silently, in a non-exhaustive one.
- **Migration:** its positional replacement is `{ status: "no-vendor-code" }`, which reports that a
  populated first component arrived with no vendor local code to look up. The replacement is
  deliberately narrower: it carries no `loinc` and no `source`, because there is no disposition that
  reports a wire value as a LOINC. The four retained dispositions (`mapped`, `unmapped`,
  `ambiguous`, `no-code`) keep their documented meanings exactly.
- **Status:** shipped in `0.1.0`, on the operator's direction of 2026-09-25 (section 6).

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
- **Status:** shipped in `0.1.0`, on the operator's direction of 2026-09-25 (section 6). This is
  the entry to read first.

### 5. `LivdAnnotation.reportedCode` (meaning changed, name kept)

- **Effect a consumer sees:** no compile error. It is now always the code the catalog was actually
  consulted with, and is absent when nothing was looked up, so a consumer reading it as "the code we
  reported for this record" sees it go absent on records where no lookup happened.
- **Migration:** read `unvalidatedWireValue` for the verbatim first component, which is present on
  every disposition; read `reportedCode` only as "what the catalog was asked about".
- **Status:** shipped in `0.1.0`, on the operator's direction of 2026-09-25 (section 6).

### 6. `AbnormalFlag.vocabulary` and `ResultStatus.vocabulary` (required properties added)

- **Effect a consumer sees:** a compile error only where the consumer **constructs** one of these
  values themselves, typically a test double or a fixture, because a required property was added to
  an exported interface. Reading either type is unaffected and additive.
- **Migration:** build the property from the exported constants `ABNORMAL_FLAG_VOCABULARY` and
  `RESULT_STATUS_VOCABULARY` rather than writing a literal, so a stub tracks the library.
- **Status:** shipped in `0.1.0`, on the operator's direction of 2026-09-25 (section 6).

### 7. `AbnormalFlagCode` widened by `HU` and `LU`

- **Effect a consumer sees:** two effects, and the second is silent. A consumer with an exhaustive
  switch over the union gets a compile error for the two new members. A consumer branching on
  `recognized === false` for an `HU` or `LU` feed sees that branch stop firing: those letters are
  now recognized, with meanings `"significantly-high"` and `"significantly-low"`, and no longer
  produce a warning and a `"undefined"` meaning.
- **Migration:** handle the two codes. They are distinct from `H`/`L` (outside the interval), from
  `HH`/`LL` (critical) and from the directional `U`/`D`, all six of which keep their readings. The
  deprecated `H>` and `L<` stay unrecognized deliberately.
- **Status:** shipped in `0.1.0`, on the operator's direction of 2026-09-25 (section 6).

### 8. `LivdAnnotation.wireValueDisagreesWithCatalog` (required property added)

- **Effect a consumer sees:** a compile error only where the consumer **constructs** a
  `LivdAnnotation` themselves, typically a test double or a fixture, because a required property was
  added to an exported interface. It is entry 6's rule on a different interface. Reading an
  annotation is unaffected and additive: the property is present on every annotation the library
  produces, and is `false` in every case except a catalog that vouched for exactly one LOINC
  disagreeing with a populated component 1.
- **Migration:** take the annotation from `applyLivd`'s own output, or from `lookupLivdForRecord`
  for a single record, rather than constructing one by hand, so a stub tracks the library. Where a
  literal is unavoidable, `wireValueDisagreesWithCatalog: false` is the value every other
  disposition carries, and it must not be written `true` to mean "unknown": the field reports a
  measured disagreement and nothing else.
- **Status:** shipped in `0.1.0`, on the operator's direction of 2026-09-25 (section 6).

### 9. `AbnormalFlagMeaning` widened by `"significantly-high"` and `"significantly-low"`

The same changeset as entry 7, on the second exported type it widens. It is its own entry because
it is its own public value: `AbnormalFlagMeaning` is enumerated in section 3 in its own right, and
entry 7's compile error is over `AbnormalFlag.code` and does not reach a consumer who reads
`AbnormalFlag.meaning` instead.

- **Effect a consumer sees:** two effects, and the second is silent. `AbnormalFlagMeaning` is the
  declared type of `AbnormalFlag.meaning`, which is a **required** member, so every interpreted flag
  hands a consumer a value of this union whether or not they ever write the type's name. A consumer
  with an exhaustive `switch` over `AbnormalFlag.meaning` and a `never` sink gets a compile error
  for the two new members, the same shape entry 7 reports one type over. The silent effect is entry
  7's, read off the meaning rather than off the letter: an `HU` or `LU` feed that used to arrive as
  `"undefined"` now arrives as `"significantly-high"` or `"significantly-low"`, so a branch keyed on
  `meaning === "undefined"` stops firing for those records, and a non-exhaustive reader that handled
  the previous member list explicitly now routes them to whatever its fallback arm does.
- **Migration:** handle `"significantly-high"` and `"significantly-low"` wherever a meaning is read,
  and give each its own reading rather than folding it into a neighbour. They are a magnitude
  relative to an interval, so they are distinct from `"below-normal"` / `"above-normal"` (merely
  outside it), from `"critically-below-normal"` / `"critically-above-normal"` (critical), and from
  `"significant-change-down"` / `"significant-change-up"` (a change since the last result); all six
  of those keep the readings they had, and the sentinel `"undefined"` keeps its fail-safe meaning of
  a flag that was present and is not in the graded vocabulary. The type checker finds the whole
  population of the compile half. The silent half is not type-visible and is found by auditing what
  a consumer does with `meaning === "undefined"` (or with `recognized === false`) on a feed that
  sends either letter. There is no exported runtime list of meanings to iterate against, since
  `ABNORMAL_FLAG_CODES` lists the letters and not their readings, so the union itself is the
  enumeration a consumer tracks.
- **Status:** shipped in `0.1.0`, on the operator's direction of 2026-09-25 (section 6).

### 10. `LivdWarningCode` widened by `"ASTM_LIVD_CATALOG_NO_LOINC_VERSION"`

- **Effect a consumer sees:** a compile error in an exhaustive `switch` over the union with a
  `never` sink, and nothing else. There is no silent half: the new member is raised where a catalog
  is **defined**, never into the per-record stream `applyLivd` returns, so no existing branch over a
  warning that stream carries ever stops firing, no code, order or count in it moves, and a consumer
  who never reads `LivdCatalog.warnings` never meets the new member at all.
- **Migration:** handle `ASTM_LIVD_CATALOG_NO_LOINC_VERSION`, or narrow to the two per-record codes
  where that is what the branch is about. The warning it labels is a different shape from the
  per-record one, an `AstmLivdCatalogWarning`: it carries the catalog's declared identity and **no
  position**, because no record is implicated.
- **Why the union was widened rather than the type split:** `LIVD_WARNING_CODES` is documented as
  the registry of every terminology warning code, and `Object.values()` over it is documented as a
  stable snapshot of `LivdWarningCode`. Keeping the type in step with the registry is what makes
  that true; excluding the new member would leave a value in the registry that the type says cannot
  be there, which is a quieter break than this one.
- **Status:** shipped in `0.1.0`, on the operator's direction of 2026-09-25 (section 6).

The other two members the LIVD changeset adds to `LivdAnnotation` are **optional**
(`unvalidatedWireValue`, and `reportedCode`, which is entry 5 for its changed meaning rather than
for its declaration), as is the added `UniversalTestId.unvalidatedWireValue`. An optional member
added to an exported interface breaks no construction, so none of them is an entry here. The rule
that decides it is the declaration, not the changeset heading: a member a consumer must supply to
construct the value is a break, and a member they may omit is additive.

`livd-units-choose-between-candidates.md` contributes **no entry to this section at all**, and that
is a finding rather than an omission. Every member it adds to an exported interface is optional
(`LivdEntry`'s three LIVD attributes) or conditional on the answer (`unitComparison`,
`candidateDetails`, `reason`), so none of them breaks a construction; the second parameter it adds to
`LivdCatalog.lookup` is optional, so a hand-written catalog declaring only the vendor code still
satisfies the interface; and its three added types are new names that displace nothing. It widens no
existing union: `LivdAmbiguityReason` is a new type rather than a member added to a union a consumer
already switches over, and the `LivdMapping` discriminant keeps exactly the members it had. Nothing
it changes is visible to a consumer who does not populate a representative unit, which is what
sections 1 and 3 record as its being additive in both the source and the run-time direction.

`livd-catalog-says-which-loinc-version.md` contributes **entry 10 and nothing else**, and the rest of
what it adds is here for the same reason the paragraph above gives. `LivdCatalog.publication`,
`LivdCatalog.warnings` and `LivdAnnotation.catalogLoincVersion` are all optional or conditional, so
none of them breaks a construction and a catalog a consumer implemented by hand still satisfies the
interface; the second parameter it adds to `defineLivdCatalog` is optional, so the existing
single-argument call is unchanged; and its five added identifiers are new names that displace
nothing. The one union it widens is `LivdWarningCode`, which is entry 10.

## 5. Unresolved

An unresolved entry is a pending changeset that cannot be classified from its own text plus the
change it documents, recorded with the question that blocks it. **While any unresolved entry stands,
the stability certification in section 3 is withheld**, and the test grades that rule rather than
trusting this sentence.

**How to write one, and what the guard reads.** Write each unresolved entry as its own `- ` list
item inside the marked region below, naming the changeset and the question. The guard does not
depend on that shape: it reads the region as CLEAR only when the region opens with `None`, so any
other text in it, a bare sentence included, counts as unresolved, an empty region counts as
unresolved, and a bullet under a `None.` still counts. The bullet form is the readable one; the
rule is that saying nothing never reads as saying none.

<!-- unresolved:begin -->

None. The one pending changeset classifies from its own text, and the change it documents was
checked against the `v0.1.3` tag, against `src/index.ts` and the modules behind it, and against the
published `0.1.3` tarball.

<!-- unresolved:end -->

## 6. Publication

**Nothing in this file publishes anything, and the bump prepared here is not a release until the
release pipeline cuts it.**

- **How `0.1.0` came to publish.** Publication was blocked by the operator's decision of 2026-08-28
  until the release-frequency policy work landed (`S0161-release-frequency-policy` in the
  meta-repo). On 2026-09-25 the operator directed that every package be put on `0.1.x` and
  published, in these words: "I need every single package on v0.1.x and published." `0.1.0`
  published that day and shipped the breaks in section 4, each with its migration in `CHANGELOG.md`.
- **Why `0.1.1` was prepared.** On 2026-11-07 the operator registered npm trusted publishers for
  every `@cosyte` package and directed, in these words: "every package needs to be published so that
  the trusted publisher is marked as valid". `0.1.1` was that publish for this package.
- **Why `0.1.2` is prepared.** The same day the operator decided one standard for every repository
  and approved the releases of the repositories brought to it ("Finished repos, I approve runs"),
  patch versions only. That set was this package's README brought to that standard.
- **Why `0.1.3` was prepared.** On 2026-11-08 the code-scanning sweep found the pattern behind the
  units-absent warning quadratic on a long whitespace run in a result value. That set was the fix,
  released as a patch under the same approval.
- **Why `0.1.4` is prepared.** On 2026-11-08 the operator approved the library-defect fixes ("Library
  defects (Recommended)"), and one was the doc comment on `AstmMessage.classification` calling a stream-wide value
  a message's. The pending set is that correction, released as a patch under the same approval.
- **What merging a change here does.** `.github/workflows/release.yml` fires on a push to `main`
  and calls the shared release pipeline, which opens or updates the "Version Packages" pull request
  and parks the publish on the `release` environment gate. Merging that pull request and approving
  that gate belong to whoever runs the release, never to a change that edits this file.
- **So the honest reading** is: the pending set resolves to `0.1.4`, the surface it carries is the
  one `0.1.0` certified, and it carries no break. The version in `package.json` is still `0.1.3` and
  stays `0.1.3` until Changesets writes the next one.

### The follow-on the `0.1.0` bump created

The `0.1.0` audit recorded that this repository's guidance said a change ships with a changeset that
is `patch` on the `0.0.x` ladder, that the guidance would go stale the moment `0.1.0` published, and
that it must then be revised: a feature or an added public value is `minor`, a real fix is `patch`,
and on the `0.x` ladder a break ships in the minor channel and is surfaced for a decision before the
release rather than absorbed.

Checked again on 2026-11-07. `CLAUDE.md` has since been rewritten and states no bump rule, but
`.changeset/README.md` still told a contributor to pick `patch` to stay on the `0.0.x` ladder. It is
revised to the rule above in the same change as this audit.
