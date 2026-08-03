# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions and publishing are managed with [Changesets](https://github.com/changesets/changesets);
this file is maintained by hand (Changesets handles the version bump and publish only).

## [Unreleased]

### Fixed

- **`composeAstmFrames` wrote an out-of-range `startFrameNumber` straight into the frame-number
  position, so a value that was not a frame number produced a stream whose records the decoder
  refused to emit** (`ASTM-FRAME-RESIDUALS`, defect 13). `PRE-EXISTING`, byte-identical on `64c2fd5`.
  The option is now checked before `composeAstmFrames` reads a record, and refused with the new code
  `ASTM_FRAME_INVALID_START_FRAME_NUMBER` (a fourth member of `AstmFrameEncodeErrorCode`) unless it is
  a whole number from `0` to `7`.

  **What went out instead, measured on this package's own round trip.** A frame's number is one ASCII
  digit, written as `FN_ZERO + n`, and nothing checked `n`. `-1` put a `/` in the frame-number
  position, and `NaN`, `Infinity` and `-Infinity` each put a `NUL` there in **every** frame of the
  stream, after which `decodeAstmFrames` recognised no frame number at all, warned
  `ASTM_FRAME_SEQUENCE_GAP` on every frame, and emitted **none** of the records: a whole four-record
  message in, zero out, and `parseFramedAstm` throwing on empty input. **The recorded defect said an
  out-of-range value writes a non-digit byte and named a space for `NaN`. It is a `NUL`**, which is
  the difference between an ordinary inter-frame byte the decoder skips and a byte that costs the
  stream every one of its records.

  **The quieter half is why the check covers the whole domain rather than the ends.** Values that
  truncated back onto a digit were accepted silently and behaved as some other start value: `1.5` and
  `257` each produced the byte-for-byte stream a `startFrameNumber` of `1` produces. The option
  documented `0`-`7` and enforced neither bound nor integrality in either direction.

  **The domain is derived from what a frame can carry, and the refusal is not a clamp.** The writable
  numbers are exactly the whole numbers `0`-`7`, the modulo-8 sequence `decodeAstmFrames` reads and
  rolls over. Clamping or taking a modulo would pick a frame number the caller did not ask for, and
  the frame number is the decoder's only evidence that no frame was dropped, so a stream numbered from
  a value nobody chose is a stream whose sequence check certifies the wrong thing. The refusal is
  raised before `composeAstmFrames` reads a record, so on that entry point it never depends on the
  caller's data (`serializeFramedAstm` serializes every record first, so a record that cannot be
  serialized at all is refused ahead of it on that route). Its message names the value received: that
  value is the caller's own option, not stream content, and nothing from the records reaches it.

  **The whole `0`-`7` range is still accepted, because a non-default start has a real use that was
  measured rather than assumed.** It composes a **continuation** of a transfer already in progress:
  `composeAstmFrames(head)` joined with `composeAstmFrames(tail, { startFrameNumber: n })`, where `n`
  is the number after the last frame `head` used, is **byte-identical** to composing the whole list in
  one call and decodes with an empty warnings array, across the `7 → 0` rollover included. Narrowing
  the option to `1` would have removed that.

  **What a continuation is not, now stated on the option rather than guarded against.** Read on its
  own, a stream that starts anywhere but `1` opens on a sequence gap; the decoder never bridges a gap
  silently, so it warns and does not emit that first record. **What `parseFramedAstm` does after that
  varies with the message shape, and no rule is offered for it:** it may throw, under more than one
  code (`ASTM_RECORD_NO_HEADER`, `EMPTY_INPUT` and `ASTM_RECORD_UNDECLARED_DELIMITERS` were each
  measured), and it may return a message one record short. **The one statement that generalizes is
  that the record layer never reports the loss**, because `parseFramedAstm` hands the record parser
  only the frames the codec vouched for, so `message.warnings` carries what the surviving records
  warrant and nothing about the record that did not survive. Read `frameWarnings`. Nothing returns the number to continue a sequence from either, and the frame count
  is not it once a record splits, so the supported computation is named on the option. The
  documented-valid `0` has always behaved that way. It is the cost of the option, not a defect in the
  caller's records, and it is why `1` is the default.

  **This is a narrowing on a published package, in a small population.** `1.5` and `257` used to
  produce a working stream, the byte-for-byte start-at-`1` one, and now throw. Every value the check
  turns away was already outside what the option documented: a frame number, a whole number `0`-`7`.

  Both the old bytes and the new refusal are pinned in `test/frames/start-frame-number.test.ts`,
  asserted on what the old encoder produced (rebuilt with the test-only `frame()` builder, so nothing
  is transcribed twice), with a biconditional property: a value is refused **if and only if** it is
  not a whole number in `0`-`7`. 14 of the 32 new tests are red against `64c2fd5`.

- **Three `{@link}` targets in the published `.d.ts` did not name a symbol declared there**
  (`ASTM-FRAME-RESIDUALS`, the sibling minors). `QuirkTolerance` is `AstmQuirkTolerance` (twice, in
  `src/profiles/types.ts`); the `startFrameNumber` doc linked `FIRST_FRAME_NUMBER`, which this
  package does not export, and that sentence was rewritten and no longer links it; and
  `AstmMessage.profile` linked a bare `warnings`, meaning its sibling member, which resolves only for
  a tool that resolves against the enclosing declaration. Every `{@link}` target in
  `dist/index.d.ts` now names a symbol declared in that file.

- **A delimiter set colliding with a record's type letter emitted a stream that read back as
  DIFFERENT records, and in its silent branch it fabricated a final lab result out of patient
  identifiers** (`ASTM-FRAME-RESIDUALS`, defect 5). `PRE-EXISTING`, byte-identical on `7253098`,
  before any of `ASTM-EMIT-RESIDUALS`. `serializeAstmRecords` / `serializeAstmRecord` now throw
  `AstmSerializeError` with the new code `ASTM_EMIT_TYPE_LETTER_COLLISION` (a third member of
  `AstmSerializeErrorCode`), carrying the `recordIndex` and quoting nothing from the record: not the
  value, and not the type letter either, which on an unsupported record is a byte off the wire.

  **The recorded defect said the record "re-reads as an unsupported record, one result in, zero out".
  That describes one branch of two, and the branch it does not describe is silent.** A record's type
  letter is just another leaf to the escape encoder, so a set naming that letter escapes it away: an
  `R` record emitted with `field` = `R` goes out as `&F&R1R…`, reads back as `unsupported`, and
  `ASTM_RECORD_UNKNOWN_TYPE` does fire. But the encoder writes an escaped character as
  escape + mnemonic + escape, so **when the escape character is itself a record type letter the
  escaped type letter begins with a real letter** and no unknown-type warning fires at all. Measured:
  a `P` record emitted with `field` = `P` and `escape` = `R` comes back as an `R` record whose
  `value` is the patient's laboratory ID, whose `units` are the practice-assigned identifier, and
  whose `resultStatus` is `F`, so `results()` returns a fabricated **final** result built out of
  patient identifiers. The stream's only warning is `ASTM_NONSTANDARD_DELIMITERS`, which is what a
  **clean** non-canonical stream carries too and which is on the profile safety gate's tolerable
  allow-list, so `{ strict: true }` accepts it under a profile the gate permits. That allow-list
  entry reasons that "a record's type letter is the first character of its line" is read before any
  delimiter-driven tokenization: true of the parse, and no protection when the **emit** is what chose
  that character.

  **The rule is derived from the reader and checked on the bytes, not on the delimiter set.**
  `parseAstmRecords` takes a record's type from `line.charAt(0)`, so the condition emit has to meet
  is that the first character it writes is the letter the record models. Testing the output rather
  than enumerating dangerous roles is what makes a type letter equal to the **escape** character fall
  out as accepted without a special case: it is written starting with that letter, so the record
  re-reads as its own type. The familiar `letter` + `E` + `letter` shape is not general and the guard
  does not rely on it: the encoder protects the escape character it introduces but not the `E`/`F`/`S`
  mnemonics, so under `{ field: "E", escape: "R" }` an `R` encodes to `RRFRR` and its type field
  decodes back to `RER`, not `R`. What holds across every such set is the only thing checked, the
  first character written. Measured over 137,632
  delimiter sets (two roles at a time, every printable ASCII character each, against a stream
  carrying one record of every modeled type plus an unsupported one), the refusal is
  **biconditional** with the old serializer losing a type letter: zero over-refusals and zero
  under-refusals. Over a second sweep of 3,690 emits across nine record-set shapes, 750 streams
  previously read back as something other than the records that produced them, **303 of them accepted
  by `{ strict: true }`**; all 750 are now refused and the remaining 2,940 are byte-unchanged.

  This is a **narrowing on a published package**, in exactly the cases that were being corrupted.
  **It is a transcoding condition, not a judgement on the set the caller passed, so it fires with no
  delimiter argument at all** and "emit against the canonical delimiters" is not a remedy for it: a
  stream whose header declares a vendor set and which carries one garbled line beginning `|` parses
  to an unsupported record whose type letter is `|`, and the canonical set escapes that `|` away, so
  `serializeAstmRecords(msg)`, `serializeAstmRecord(record)` and `serializeFramedAstm(msg)` all
  refuse it where the base emitted a record whose `rawType` came back as `&`. Callers passing a set
  explicitly (`serializeAstmRecords(msg, msg.delimiters)`) reach it too. The three
  set-level conditions are unchanged and still raise `ASTM_EMIT_INVALID_DELIMITERS`; this is a
  separate, per-record check because whether a set collides depends on which record is being written.
  **What it does not promise, stated rather than left to be found:** it guarantees a record re-reads
  as its own **type**, not that every field lands where it did (an escape sequence whose body is a
  delimiter is still an opaque atom, reported on the parse side as `ASTM_UNKNOWN_ESCAPE_SEQUENCE`),
  and `encodeComponent` / `serializeField` take no record, so a caller assembling a line out of them
  is outside the check. Pinned in `test/records/type-letter-collision.test.ts`, asserted on what the
  old serializer produced, rebuilt from the shipped `serializeField` so nothing is transcribed twice.
  **No clause is claimed**: LIS02-A2 §5.4/§6.2 stay withheld from CLSI's free sample and the
  paywalled editions were not read; the grounding is this package's own reader.

- **A raw `STX`, `ETB` or `ETX` byte in a value was framed as given, and in its worst branch a whole
  result record disappeared into the previous record's text with `warnings: []` at BOTH layers**
  (`ASTM-RAW-ETX-SWALLOWS-A-RECORD`). `PRE-EXISTING`, shipped since the frame encoder did.
  `composeAstmFrames` now throws `AstmFrameEncodeError` with the new code `ASTM_FRAME_RESERVED_BYTE`
  (a third member of `AstmFrameEncodeErrorCode`), carrying `recordIndex` and `characterIndex` and
  never the bytes.

  **The recorded reason for deferring this said it "fails loudly". That was false, and the
  correction is what re-ranked it.** A frame's text ends at the first `ETB`/`ETX` after its `STX`, so
  an embedded one truncates the frame there, and the two bytes that follow are then read as that
  short frame's checksum. When they match, the truncated frame **verifies**, `decode.ts` resumes at
  `termIndex + 3` and skips the rest of the record as inter-frame bytes, and the next frame number is
  still in sequence. Measured on this package's own round trip: a `C` comment ending `…HEMOLYZED` +
  `ETX` + the two matching characters reassembled without its terminating `CR`, so the following `R`
  merged into the comment's free text (`"SPECIMEN SLIGHTLY HEMOLYZEDR"`) and a `28.6 U/L` result
  vanished, `results()` returning `[]` where the input carried one. **An embedded `ETB` reaches the
  same silence by the other door**, which the defect record did not have: it leaves the record open,
  so the _next_ record's text is appended to the truncated one and two records read back as one, with
  every field of the result hanging off the comment. The precondition is a coincidence in the two
  bytes that follow: they must both read as hex digits and must equal the truncated frame's checksum,
  which is about 1 in 34,600 for uniform-random bytes (1 in 256 once they are hex digits, which is
  where the earlier 1-in-256 figure came from), and trivially constructible on purpose. That bounds
  the likelihood, not the harm.
  Both silent branches, and the loud ones, are pinned in `test/frames/reserved-structure-byte.test.ts`
  asserted on what the old encoder produced, so a weakened guard reds a test rather than passing
  unnoticed.

  **The refusal has no bytes-instead escape hatch, unlike the `U+00FF` one beside it.** A
  `Uint8Array` is checked too, because the byte is unframable however it arrives: framing has no
  escape sequence for it, and emit has no warning channel, so the only alternatives to refusing are
  substituting a byte the sender did not send or dropping one they did. The three bytes are derived
  from what `decodeAstmFrames` actually reads as structure, not from a control-character class:
  `CR`/`LF` are deliberately absent (they are read only _after_ a frame's checksum, and a record's own
  `CR` sits inside frame text on every stream this encoder writes), and `ENQ`/`ACK`/`NAK`/`EOT` are
  absent too (structure only _between_ frames; measured to round-trip byte-exactly inside one).
  **No clause is claimed:** LIS02-A2 §5.4/§6.2 are withheld from CLSI's free sample and the paywalled
  editions were not read. The grounding is this library's own decoder, in this repo.

  **The record layer is deliberately UNCHANGED, and that was the cost this slice turned on.**
  Refusing the byte in `serializeAstmRecord` would refuse a byte the caller genuinely supplied, for
  consumers who never frame anything. Measured, in every modeled value: all three
  bytes round-trip through parse → serialize → parse byte for byte, value, units and status intact,
  byte-stable, `warnings: []` on both generations. The byte becomes structure only when a frame is
  built, and `composeAstmFrames` is the total gate on that route, including through
  `serializeFramedAstm`. `CR`/`LF` remain the record layer's own refusal, because they end a _record_.

  **That claim is about VALUES, and one position on a record line is not a value.** The surplus of a
  header's delimiter declaration drops any control character silently on emit, so a header that
  arrived as `H|\^&` + `ETX` goes back out without it, `warnings: []`, byte-stable, and the
  round-trip is not byte-exact there. `PRE-EXISTING` and deliberately unchanged: that rule is argued
  at `declarationResidual` and long predates the frame-layer refusal, and it is the better of the two
  dispositions now, since carrying the byte through would turn a spec-clean header into a refused
  stream. Pinned in `test/frames/reserved-structure-byte.test.ts` so the scoped sentence stays
  measured. Found by the `conformance-refuter` grading this slice.

  **What this does not close.** A delimiter colliding with a record's type letter still frames and
  de-frames byte-exactly and re-reads as a different record; framing integrity is not record-layer
  readback. And a caller reaching `composeAstmFrames` from JavaScript with some other typed array is
  still outside the declared signature, and **this guard does not reach that route either**: the
  check compares elements against the three byte values, so a `Uint16Array` element of `0x0103` is
  not one of them and is not refused, while `Uint8Array.from` later takes its low byte and writes an
  `ETX` after all. Measured on all three (`0x0102`/`0x0103`/`0x0117`): framed, then lost at decode
  with a bad checksum or an unterminated frame. That is the same out-of-signature residue already
  recorded for the low-byte truncation, unchanged here in either direction, and stated rather than
  left to be found. Pass a `Uint8Array` or a string.

- **A symbolic link under a scan root read CLEAN on BOTH of the PHI scanner's enumerating routes, so
  a link pointing at a file full of real identifiers passed the gate twice over**
  (`PHI-SCAN-SYMLINK-BLIND-ON-BOTH-ROUTES`). Development tooling only: `scripts/phi-scan.ts` ships in
  no tarball and the package's public surface is unchanged.

  Reproduced on `8e8012d` before any fix, with a synthetic name-bearing payload (an ASTM `P` record
  carrying a patient name, a mother's maiden name and a birthdate, plus a dashed SSN and an email at
  a non-test domain) placed outside the walk roots and a link to it at `src/leak.ts`. `pnpm phi-scan`
  printed `OK: no hits` and exited **0**; `pnpm phi-scan --staged`, after `git add`, printed
  `OK: no hits` and exited **0**. Naming the link's target explicitly on the command line reported
  **six** hits and exited 1, so the payload was always detectable, and detectable by this package's
  own structured `P`-record detectors rather than only by the cross-cutting SSN/email floor. The two
  routes simply never looked at it.

  The two blindnesses are separate mechanisms and needed separate fixes. The walk enumerates
  `Dirent.isFile()`, which is an **lstat** answer, so a link is neither a file nor a directory and
  fell out of the loop with no record that anything had been skipped, and `isDirectory()` answers
  false for a linked directory too, so a whole subtree could disappear the same way. The `--staged`
  route reads content with `git show :<path>`, and **git stores a symbolic link as its target path
  under mode `120000`**, so it was handed the target's path text and scanned that. That second route
  is this repo's `pre-commit` hook, which is exactly where the claim that `--staged` covers a link
  would have been trusted.

  **Neither route is made to follow the link.** Following would read bytes the enumeration does not
  control (outside the repo, a loop, a device, a FIFO that blocks the gate forever) and git does not
  carry those bytes anyway, so a hit on them would be a claim about something no commit contains.
  Instead the enumeration is narrowed: an entry under a scan root that is not a regular file
  **refuses the scan** (exit 2, the existing "could not complete" code), naming every offender rather
  than the first. The walk classifies by `Dirent` (symbolic link, FIFO, socket, block device,
  character device); `--staged` now reads `git diff --cached --raw -z` instead of `--name-only` so
  the destination mode is visible, and refuses mode `120000` and `160000` (a gitlink) wherever that
  route's own path scope reaches them. A `--raw` record that does not parse refuses as well, rather
  than being skipped into a silently shortened list.

  **`T` (typechange) is in the `--diff-filter`, and leaving it out would have made the mode check
  unreachable whenever the file being replaced was already tracked.** Replacing a **tracked** regular
  file with a link is neither an add nor a modify: git raises `:100644 120000 <sha> <sha> T`, so
  `--diff-filter=AM` deletes the record before any mode can be read. Measured on git 2.39.5 on this
  tree: with `AM` the raw output for that stage is empty, and the unfixed scanner passed that stage
  green. Typechange carries a single path, exactly like `A` and `M`, so admitting it costs the record
  stride nothing, and it means the reverse typechange, a link replaced by a real file, is now scanned
  as the ordinary file it became.

  **A refusal names the entry's own repo-relative path and an engine-owned token for its kind, and
  never the link target**, because a target path is text off the working tree and can itself carry
  PHI. That is asserted rather than argued: the pinning payload and the target's own filename both
  carry a synthetic person name, and every refusal message is checked to contain none of it. 10 of
  the file's 30 cases are red on `8e8012d`.

  **What this does not cover, stated narrowly, each measured.** Explicit-path mode already read
  through a link and reported the target's hits; it is unchanged. The `--staged` path scope is
  unchanged, still `test/fixtures/**` and `src/**.ts`, so a staged link outside it is still not
  looked at; narrowing what a scope admits is not widening the scope. That scope also bounds the
  gitlink half: a submodule staged at `test/fixtures/nested` is refused, while one at `src/nested` is
  a directory name that fails the `.ts` suffix and is not looked at. `R` (rename) and `C` (copy) are
  still **not** enumerated by `--staged` at all, so a staged rename that also appends PHI passes that
  route; pre-existing, unchanged here, and admitting it needs the two-path record shape handled,
  which is a scope decision rather than this one. A tracked file **absent from the worktree** is
  still caught at `git add` time only.

  **And this scanner still has no rule that a sweep observing ZERO targets must refuse**, which is
  worth naming rather than leaving to be discovered. Measured: run from a tree with no `src/` and no
  `test/fixtures/`, all-mode prints `OK: no hits` and exits 0, so a clean report can be a report
  about a tree the scan never looked at, and **nothing backstops it**: the all-mode sweep is the
  route with the hole, so it cannot be its own compensating control, and neither the `pre-commit`
  hook nor CI asserts that the sweep observed anything. Five of the sibling scanners carry that rule
  (`ccda`, `hl7`, `mllp`, `ncpdp`, `synth`) and the rest, this one included, do not; do not read that
  as a majority practice. It is unchanged by this slice in either direction, and adding it is its own
  slice, because the threshold is a judgement about this repo's corpus rather than a consequence of
  anything here.

  **The enumerate-then-read race is deliberately NOT closed here, and the deferral is measured
  rather than assumed.** The scanner still has no tolerance for a file that vanishes between
  enumeration and read, so a transient appearing under a walk root can refuse a whole sweep (exit 2,
  fails closed). This repo's walk roots are `test/fixtures/` and `src/`, and nothing was observed
  landing in either: polling both roots continuously across a real `pnpm build` saw only the tracked
  corpus, while `tsup.config.bundled_*.mjs` (the transient that blocked a sibling's publish) appeared
  at the **repo root**, which is not a walk root here. This repo's own suite writes its throwaway
  trees under the OS temp directory, not under a scan root. So the shape is present and its trigger
  is not, which makes closing it a separate slice with its own argument rather than a rider on a PHI
  blindness fix. It is a different defect and it fails in the safe direction.

- **The frame encoder no longer writes a different character than the one it was handed**
  (`ASTM-FRAME-BYTE-RESIDUALS`, closing known defect 7). `composeAstmFrames` turned a record given
  as a `string` into bytes with `charCodeAt(i) & 0xff`, so any character above `U+00FF` was replaced
  by its low byte. That low byte is another perfectly ordinary character, which is why the
  substitution was **silent**: it reached the wire, checksummed clean, and came back with an empty
  warnings array from **both** layers.

  Measured, on this package's own round trip, three shapes on the canonical set:
  - `R|1|^^^687|28.6|μmol/L||N||F` read back `28.6` in `¼mol/L` (`U+03BC` low byte `0xBC`). A lab
    number whose **units** silently changed.
  - `P|1||LAB-0001||ŁUKASZ^JAN||19800101|M` read back the name spelled `AUKASZ` (`U+0141` low byte
    `0x41`).
  - `P|1||LAB-0001||GRAżYNA^ANNA||19800101|F` read back as **ten fields where the record models
    nine** (`U+017C` low byte `0x7C`, the field separator). Every field after the split shifted one
    along, so `patient().sex` answered `19800101` and the birth date was gone. That is **silent
    re-read divergence**: a different field tree, `warnings: []` at both layers.

  The known-defect entry said this class fails loudly in every case measured, and for the cases it
  had measured that was true: they all truncated onto `STX`/`ETX`/`ETB`/`CR`. Nothing had measured a
  code point whose low byte is an ordinary character, and that is the larger and quieter class.

  **The disposition is a refusal, and it invents nothing.** `composeAstmFrames` now throws
  `AstmFrameEncodeError` with the new `ASTM_FRAME_UNENCODABLE_CHARACTER` code, carrying the record
  index and the character's index, never the character and never its code point. The alternative,
  encoding as UTF-8, was **considered and rejected**: turning a character into bytes requires a
  character encoding, this library reads no character-set declaration from any ASTM record, and
  picking one would be a guess at bytes the caller never supplied, in a package that declines to
  infer a delimiter set, a record type letter or a code system. Emit also has no warning channel, so
  a warning could only have been ignored while the wrong bytes still shipped. That is the same
  argument already written for `ASTM_EMIT_UNENCODABLE_VALUE` and `ASTM_EMIT_INVALID_DELIMITERS`.

  **What grounds the Latin-1 boundary**, since no clause is claimed for it and none was read. Two
  things, both firsthand. (1) This package's own byte-to-string boundary is already Latin-1, on the
  read side, deliberately: `parseAstmRecords` decodes with one `String.fromCharCode` per byte "so
  every byte survives 1:1". The encoder is documented as the exact inverse of the decoder, and the
  decoder can never produce a code point above `U+00FF`, so a string carrying one is outside the
  codec's domain by construction. (2) The redistributable OSS reference implementation
  (`kxepal/python-astm`, BSD) parameterizes the codec on `encoding` throughout
  (`encode(records, encoding=ENCODING, ...)` / `decode(data, encoding=ENCODING)`) and defines
  `ENCODING = 'latin-1'` in `astm/constants.py`: the wire code page there is caller-supplied
  out-of-band knowledge with a latin-1 default, not something a reader discovers from the stream.
  **The normative text was not reachable and no clause is cited**: LIS02-A2 is withheld from CLSI's
  free sample and E1394-97 / LIS01-A2 are paywalled, so this is a reasoned choice, exactly as the
  delimiter-scoping and surplus-declaration choices before it were.

  **The refusal removes no capability.** `composeAstmFrames` already accepted `Uint8Array`, so a
  consumer who knows their instrument's code page encodes with their own encoder and passes bytes,
  which are written through untouched. A stream whose every character is Latin-1 is byte-identical
  to before, the full `0x00`–`0xFF` range included. The **record** layer is deliberately unchanged:
  `serializeAstmRecords` returns a `string`, which is not yet bytes, so the caller keeps the choice.

  **Stated no wider than it was measured.** This closes the string-to-bytes step only. It is not a
  claim that every accepted record reads back: a record already carrying a raw `STX`/`ETX`/`ETB`
  byte is framed as given and re-decodes wrong (known defect 6), which this change does not touch.
  **Both** of that defect's branches are now pinned as out of scope in
  `test/frames/unencodable-character.test.ts`, the warned one and the **silent** one: where the two
  bytes following the embedded control character happen to be that truncated frame's checksum, the
  short frame verifies and a whole result record is absorbed into the previous record's text with
  `warnings: []` at both layers. That branch was found grading this change, reproduces byte-identically
  on the base, and is why known defect 6's "it fails loudly" ranking was withdrawn rather than restated. A surrogate pair needs no
  separate rule, each half being above `U+00FF` itself. New export `AstmFrameEncodeErrorCode`;
  `AstmFrameEncodeError.code` is now that union and gains a `characterIndex`. The property "either
  refuse the record string or reproduce it byte for byte" is asserted over 2,000 generated cases,
  with its bound written into the test and a non-vacuity check that both sides of it are reached.

- **The `attw` publish gate now fails when the packed tarball carries no types, where the CLI exits
  `0`** (`ATTW-FALSE-GREEN-PORT`). The `attw` script was the bare `attw --pack .`.
  `@arethetypeswrong/cli` opens `getExitCode()` with `if (!analysis.types) return 0`, returning
  before it ever reads the problem list, because an untyped package is a legitimate npm package and
  the CLI treats "no types at all" as a description rather than a problem. No `--profile`,
  `--ignore-rules` or config setting reaches that branch. For a package that ships types the same
  result means the declarations were **not in the tarball**, which is a broken publish reported as a
  pass. A false red costs an hour; a false green merges.

  Measured on this package at `0.0.9`, on a quiet box with **no** concurrency, both states printing
  "This package does not contain types." and exiting `0`: `rm -rf dist`, and
  `rm -f dist/index.d.ts dist/index.d.cts`. The second is the realistic one, and the trigger is the
  build rather than any race: timed on one real `tsup` run here, `dist/index.mjs` and
  `dist/index.cjs` appeared at 1,176 ms and `dist/index.d.ts` and `dist/index.d.cts` at 3,063 ms, a
  **1,887 ms window** in which `dist/` held JS and no declarations. A concurrent build or `clean` in
  the same working tree lands the gate in that window. This is deliberately **not** answered with a
  lock or a build queue: the gate has to be able to report that its own inputs were missing,
  whatever removed them.

  `attw` is now `node scripts/attw.mjs`, which keeps two nets because they catch different things. A
  **preflight** checks that every relative path `package.json` promises (`main`, `module`, `types`,
  `typings`, and every string leaf of `exports`) exists and is non-empty, and names the missing file
  rather than leaving it to be inferred. A **post-check** promotes `attw`'s untyped sentence to a
  failure, catching what the preflight structurally cannot: declarations present on disk but
  excluded from the tarball by `files` or an `.npmignore`. No instance of that second case is on
  record in this repo. Because the post-check reads a printed string, the routes that would hide it
  are refused rather than tolerated: `--quiet`, `--format`, a `.attw.json` setting either, and
  `--config-path` at a file setting either were each measured here to restore the exact exit `0`. The
  refusal is by option name, wholesale, not by value, and the list is a record of what is closed
  rather than a proof that the post-check cannot be blinded at all: `--definitely-typed` suppresses
  the sentence by making the analysis typed, is equally true of the bare CLI, and is deliberately not
  refused. The preflight is the net that reads no string. Other arguments are forwarded, so
  `--profile node16` still works. `test/scripts/attw-gate.test.ts` pins the upstream exit `0` itself,
  so an `attw` upgrade that fixes it or rewords the sentence reds the suite instead of letting the
  net go quietly slack, and it carries a negative control plus a real `attw` failure, because a gate
  that only ever fails is not a gate and one that swallows the status is not one either. **No
  runtime code changed and the built output is identical.**

### Added

- **`ASTM_RECORD_FIELDS_UNSEPARATED`: a record that lost its fields no longer loses them in
  silence** (`ASTM-TYPE-LETTER-SECOND-READER`, finding 2, the one that outranked the other).
  A record carries its type letter and then its fields, separated by the field delimiter the header
  declared, so a record that carries content beyond its type letter and still yields exactly **one**
  field contains no field separator at all: the delimiters in force are not the set that record was
  written with. Every modeled field of it is then absent. On an `R` that is the **value, the units
  and the status at once**, and the result reads back as though it simply never carried them.

  The reachable route is a header whose type letter the reader could not recognize. Delimiters are
  re-read at every `H`, keyed on that same letter, so an unrecognized header does not re-scope them
  and the whole following message is tokenized with the previous header's set. Measured: a
  `99.9 mmol/L` final result read back with no value, no units and status `unspecified`, filed under
  the previous message's patient, with the unrecognized-type warning as the **only** report on the
  stream. That warning says a letter was unreadable; it never said a value had gone.

  The detector is keyed on the **observed collapse**, not on that one cause of it, because
  identifying the mangled header would itself require guessing which byte the sender meant. It
  therefore also fires on the same silent collapse reached without any mangled header at all, which
  reproduced on the previous release with **zero** warnings: a lone record written in another set
  (`H|\^&` then `R*1*:::688*99.9*mmol/L**H**F`) parsed clean and answered `undefined` for the value.

  **Reported, never repaired.** The fields are not re-split on a set no header declared, because
  that would invent data; the raw line is surfaced intact and nothing is dropped. One warning per
  affected record, each at its own position and carrying no field data. The code is **safety-critical
  by construction** (the forbidden set is computed as every known code minus the tolerable
  allow-list), so no profile can quiet it and `{ strict: true }` refuses. A header is exempt by
  construction rather than by exception: it is always read with the set it declares itself. Content
  after the type letter that is entirely whitespace is excluded, since no field is at stake there.

  **Deliberately partial, and its absence certifies nothing.** This tests one of the four delimiter
  roles, the **field** separator, and only in its total form, where that separator occurs nowhere in
  the line. Two classes of the same loss stay silent and are documented as such on the code, in
  `README.md` and in the quickstart rather than left to be inferred. A foreign set whose **field**
  separator happens to occur anywhere in the line still splits, on the wrong boundaries: one stray
  `|` inside an otherwise `*`-separated result loses the value, the units and the status with no
  warning, and this can happen to one record **inside** a run of these warnings, so a run is not a
  sweep of the records it spans. A set differing in the **repeat, component or escape** role usually
  splits into fields normally, with the damage varying: a mis-split component can cost a test
  identity while the value survives, but an **escape** character occurring literally in a record
  merges every field after it and costs the value, the units and the status together (a lone `&`
  under the canonical set leaves a nine-field `R` reading as four, in silence). All of them
  reproduce identically on the previous release, and the last is recorded as a defect in its own
  right. Widening the check would mean deciding which set a record ought to have had, which is the
  same guess declined above, so the boundary is written down instead of chased.

  The exported factory `fieldsUnseparated` joins the record registry, and `WARNING_CODES` goes from
  15 members to 16. **That a record's fields are separated by the declared field delimiter is read
  off this package's own emit contract and off every fixture in this repository, not off a normative
  sentence, and no clause is claimed for it**: the relevant CLSI text is withheld from the free
  sample and the surrounding standards are paywalled, and the redistributable reference corpus
  hardcodes the canonical delimiters and never reads the declaration, so it cannot ground a
  delimiter question either.

- **`messages()`: read a stream as the sequence of messages it actually is**
  (`ASTM-PATIENT-RESULT-MISATTRIBUTION`). A parsed model has always been a whole record
  **stream**, and a stream may carry several messages back to back: a message runs from an `H`
  header to its `L` terminator. `messages(msg)` splits the stream into them and returns a
  readonly array of `AstmStreamMessage`, each carrying only its own records:

  ```ts
  for (const m of messages(parseAstmRecords(raw))) {
    m.patient; // the P for THIS message
    m.results; // the Rs for THIS message
  }
  ```

  Each entry carries `index`, `header`, `delimiters`, `records`, `patient`, `patients`,
  `results`, `orders`, `comments`, and `queries`. It never throws, and a single-message stream
  yields exactly one entry whose `records` are the whole stream, so it is safe to reach for
  unconditionally.

  **A message opens at every `H`** and runs to the record before the next one. That is
  deliberately the _same_ boundary the parser already uses to scope delimiters, so message
  boundaries and delimiter scope cannot disagree; `m.delimiters` is the set that message's
  records were actually read with. The `L` terminator closes a message but opens no scope, so
  records between an `L` and the next `H` stay with the message their header opened rather than
  being dropped. Grouping is **total**: every record lands in exactly one message, none
  duplicated and none lost, which is asserted directly.

  **Evidence, labelled.** The message unit is `H` … `L`, _verified primary_: CLSI LIS02-A2 §2 is
  definitional about the unit itself, bounding a message by the `H` record at one end and the `L`
  record at the other. Read directly in CLSI's own free sample, and stated here in our own words
  on purpose: we may read and cite the standard but never reproduce its prose, and this file ships
  inside the npm tarball. That clause is the whole of what is claimed from the standard here, and
  it does **not** settle which record _opens_ a new scope partway through a stream. So treating a
  second `H` as the start of the next message is recorded as a **reasoned choice, not a citation**:
  no clause number is claimed for it, and we do not assert the standard is silent either. It is
  chosen to agree with the delimiter scoping this parser already enforces, and because it drops no
  record. **The OSS corpus was checked rather than dismissed**, and unlike for delimiter questions
  it is informative here, but only negatively: neither commonly-cited reference implementation
  models the message unit at all. One dispatches records to per-type callbacks one at a time with
  no carried state, leaving the association to the integrator; the other merges every message of a
  transport session into a single envelope of flat per-record-type buckets, from which the
  association cannot be recovered at all. A flat model is the incumbent shape, and this entry is
  what it costs.

  **`patient` is answered only when the message determines one.** It is the single `P` when the
  message carries exactly one, and `undefined` when it carries none **or** several;
  `patients.length` distinguishes those two, and there is no third meaning. A message carrying
  several patients is not answered with the first one, because that is the guess this release
  exists to remove. Within-message record hierarchy (which `P` a given `R` files against when a
  message carries several) is **not** modeled: the clauses that would ground it (the
  message-level structure diagram, and the `P` sequence-number rule) are withheld from the free
  sample and paywalled, so the layer declines rather than inventing a rule. Multi-patient
  messages are real, at least one openly-published vendor interface grammar makes the patient
  group repeatable on the download direction, so this is a deferral with a known shape, not a
  claim that the case does not arise, and not a claim that the standard is silent about it.

- **`pnpm check:no-internal-refs` + a `no-internal-refs` CI job** (`PUBLIC-SURFACE-HYGIENE`,
  founder directive 2026-07-27). Internal only; no change to the published package surface. `astm` was
  the last parser with no gate on this rule at all, which is why the class had regrown. The script is
  ported from `ncpdp`'s copy (which carries three fixes `hl7`'s reference lacks: the `src/`
  string-literal pass, the plural `phases?` stem, and `/` in the ADR separator class) plus `cli`'s
  seventh rule, the prose roadmap citation, which neither `hl7` nor `ncpdp` has and which found the
  second-largest class here. Four surfaces are scanned against seven rules: public markdown +
  the npm `description`/`keywords`, `src/` doc comments, and `src/` string literals. The two prose
  surfaces are scanned line by line **and** paragraph-reflowed, so a violation that straddles a wrap
  is still caught; the npm metadata and the string-literal pass are line-scanned only. A multi-line
  template literal is not scanned at all, split or not, because the extractor needs both delimiters
  on one line. `//` comments, `CHANGELOG.md` and `.changeset/` are deliberately out of scope:
  the convention names them as where identifiers belong.

  Re-derived for this repo rather than copied: rule 2 now excludes E1381/CLSI-LIS01's own
  **protocol phases** (`protocol`, `three-`, `establishment`, `transfer`, `termination`, `neutral`,
  `idle`), because "phase" is the standard's word for the state of the line and `LtpState.phase` is an
  exported field. The cost is disclosed rather than papered over: because a lookbehind exempts the
  whole match, one of our own phases sitting behind one of those words is not caught (`the transfer
phase 8` passes while `Phase 8` reds). An arm keyed on a following digit was written, measured and
  removed, because the justification did not survive the corpus: the digit is usually the next
  clause's first token, so it red on `In the transfer phase 240 bytes is the maximum frame text` and
  on `a three-phase 400 V supply`, which are reference prose. Where a rule cannot be guarded, it is
  cut rather than hardened. And the `SPEC-7` /
  `ACC-42` synthetic example ids in every runnable sample are
  `WORD-N` exactly, so a shape-keyed rule would rewrite the sample a consumer copy-pastes. Both are
  asserted in negative self-tests, alongside `ASTM-E1394`, `CLSI-LIS01`, `LIS02-A2`, `POCT1-A`,
  `E1394-97` and `ICD-10-CM`. A further negative self-test pins **bare `§` section citations as
  deliberately unruled**, so closing that hole has to be a decision rather than a widening that lands
  by accident.

  The script also **refuses to run under a `grep` that cannot see its subject.** A scanner-visibility
  probe seeds a violation into a file containing a NUL byte and requires it to come back as either a
  hit or a stderr diagnostic; silence at exit 0 is a hard refusal, because a tool that skips a file
  produces output identical to a tool that read it and found it clean. This is not theoretical: the
  development container interposes a `grep` with `-I` forced, which drops such input without a word.
  An interposed shell function is also `unset` rather than assumed absent. Both directions are
  proven: an `-I`-forcing `grep` ahead of it on `PATH` makes the gate refuse, and an exported `grep`
  function is neutralised. The companion `-G` (basic-regex) hazard needs no separate guard: every
  positive self-test uses alternation, so a BRE-forced `grep` fails them and refuses.

  Known gaps, stated rather than discovered later: a bare `P\d+` label (`(P7)`) is not caught, because
  a general `P\d+` rule has corrupted ICD-10-CM codes in a sibling; `phase` at the end of a clause is
  not caught; bare `§` section citations are deliberately unruled; and `dist/` is build output this
  script cannot read, so it gates dist's source, not dist. Fourteen `P\d+` lines and the falsehoods
  below were found by hand, not by a rule.

- **The Cosyte mark now opens the README, and follows the reader's color scheme**
  (`ASSETS-P8`). A `<picture>` block above the H1 offers a dark-ground tile behind a
  `prefers-color-scheme: dark` media query, with the light-ground tile as the inner `<img>`.
  GitHub documents support for that switch; whether npm's README renderer honours it is the open
  question this is meant to answer, and the founder will grade it by eye on the published page.

  **The failure mode is safe.** If a renderer strips `<source>`, the inner `<img>` renders, so the
  worst case is the light-ground tile on a dark page, never a missing or broken image.

  This placement is **interim**. The per-package mark supersedes it once the direction is settled,
  and the org tile is used here only because a matched light/dark pair already exists and the
  per-package artwork has no light-ground variant yet, which would make the comparison
  unreadable.

### Changed

- **BREAKING: a record type letter the reader could not recognize no longer lets a host-query
  request read as a result set** (`ASTM-TYPE-LETTER-SECOND-READER`, finding 1). `classifyMessage` counts `Q` / `R` /
  `O` records **by letter**, and the `Q`-dominates guarantee (a message carrying a query is never
  read as a result set) was stated on that count, so it only ever held while every letter was
  legible. Measured: `H|\^&` plus a `Q` carrying one stray leading byte plus an `R` classified
  `kind: "results"` with `isHostQueryRequest: false`, and the `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND`
  warning that flags a `Q` + `R` contradiction vanished along with the `Q` it was counting. A stray
  byte turned the fail-safe off.

  The intended letter is still **never inferred**: that is the guess this package declines to make,
  and inferring it would split a stream a different way just as silently. What the classifier does
  instead is decline the positive answer. An unsupported record with no `Q` read alongside it now
  yields `kind: "indeterminate"` rather than `"results"` or `"orders"`, and the new
  `AstmMessageClassification.hasUnrecognized` reports why. A `Q` that **was** read still dominates,
  because an unreadable letter can only ever add a kind, never remove a query already on the wire.

  `hasQuery` / `hasResults` / `hasOrders` stay truthful, so a caller wanting the raw tally still has
  it, and `results()` and the rest are untouched. Breaking for a consumer branching on `kind`: on a
  stream carrying an unrecognized record letter, a previously positive `kind` now reads
  `indeterminate`. That is the fix, and it moves in the fail-safe direction. A conformant stream,
  where every letter is legible, is unchanged. Kept on the `0.0.x` pre-alpha ladder as a patch, per
  the repo's version policy.

  Two limits, stated rather than implied. `msg.classification` is still folded over the **whole
  stream** (a known, separately-recorded defect), so one unrecognized letter anywhere now withholds
  `kind` for the entire stream **unless a `Q` was read**, in which case the `Q` still dominates as
  before. That widens the existing over-trigger; the per-message answer,
  `classifyMessage(m.records)` on a `messages()` entry, is unaffected and is the reading to prefer.
  And the fix lands on `kind`, not on `isHostQueryRequest`, which `README.md` calls the safety
  surface: a mangled `Q` still reports `false` there, because the parser genuinely did not read a
  query. `false` therefore means "no query was read", never "this is a result set", and both the
  type doc and the quickstart now say so and point at `kind`.

- **BREAKING: a profile may no longer tolerate `ASTM_RECORD_UNKNOWN_TYPE`**
  (`ASTM-UNKNOWN-RECORD-REMERGE`). The code moves off the profile safety gate's tolerable
  allow-list and onto the safety-critical set, so `defineAstmProfile({ tolerate: [...] })` naming
  it now throws `AstmProfileDefinitionError` at definition time instead of building a profile, and
  the gate is re-checked when a warning would be downgraded, so a profile assembled as a plain
  object rather than through the factory gets the same answer (it declines to downgrade rather than
  throwing, so a hand-authored profile still parses, it just cannot quiet a safety-critical code).
  `TOLERABLE_CODES` goes from four members to three (`ASTM_NONSTANDARD_DELIMITERS`,
  `ASTM_UNKNOWN_ESCAPE_SEQUENCE`, `ASTM_RECORD_UNINTERPRETED_QUERY_STATUS`) and
  `SAFETY_CRITICAL_CODES` / `isSafetyCriticalCode()` answer accordingly. No built-in profile
  tolerated the code, so nothing in this package changes shape; a consumer profile that named it
  will now fail to define, loudly, at the point of definition.

  **Why, and it is a wrong-patient path.** A message runs from an `H` header to its `L`
  terminator, and `messages()` decides where one starts by reading each record's **type letter**.
  A header the reader cannot recognize as a header (one carrying a stray leading byte, for
  instance) is surfaced as an unsupported record, opens no message, and the two messages either
  side of it are grouped as one. The merged message pairs a patient with results that arrived
  under a different header. The `ASTM_RECORD_UNKNOWN_TYPE` warning is the entire report that this
  happened, so a profile downgrading it to `PROFILE_QUIRK_APPLIED` quieted the whole signal, and a
  `{ strict: true }` parse then accepted the stream with no objection at all.

  **The type letter turned out to have two load-bearing readers, not one.** `classifyMessage`
  counts `Q` / `R` / `O` records by the same letter, and the rule that a message carrying a query
  is never read as a result set is stated on that count. An unrecognized `Q` costs a host-query
  request that guarantee: the message reads as `kind: "results"`, and the
  `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND` warning that flags a query-plus-result contradiction
  disappears along with the `Q` it was counting. There too `ASTM_RECORD_UNKNOWN_TYPE` is the only
  warning left on the stream. Both readers are measured in the regression test. The
  mis-classification itself is not fixed here, for the same reason the merge is not: it is a
  property of reading the letter, and inferring the intended letter is the guess this package
  declines to make.

  **The variant that reaches furthest carries no second patient.** When the merged second message
  has its own `P`, the merged message holds two and the multi-patient guard throws. When the
  second message is **result-only**, the merged message still holds exactly one `P`, so `patient()`
  and `results()` both answer confidently and the first patient silently acquires the second
  message's results. That is the fixture the regression test pins.

  **The parser is deliberately unchanged.** Recognizing a mangled header _as_ a header means
  guessing at a byte the sender did not send, and that guess would split a stream a different way
  just as silently. A lenient parse still merges and still warns; a strict parse refuses; and the
  refusal can no longer be configured away. `messages()`, the warning's own message text, the
  `UnsupportedRecord` type, the README and the quickstart all now say to read this code as a
  possible lost message boundary rather than as cosmetic noise.

  **The admission test for the allow-list gained a second clause**, which is the durable part of
  this change. A code was admitted on one question: can it alter, drop, or fabricate an extracted
  value? `ASTM_RECORD_UNKNOWN_TYPE` still passes that one, and it was still wrong to tolerate,
  because the condition it reports had quietly become something the library reads. The rule is now
  that a code is tolerable only while **nothing else in this package reads the condition the
  warning reports**, and that second clause is a claim about the whole library which can stop being
  true without anyone editing `safety.ts`. It is a review obligation, not a mechanical check, and
  the file says so rather than implying a gate that does not exist. The three surviving codes were
  each re-derived against both readers of record structure, and each is measured by comparing the
  same logical stream with the reported condition present and absent. That is deliberately not a
  comparison of a parse with a profile against one without: the profile transform runs after the
  records are built, so the second comparison is identical for every code and would have passed for
  the one just removed. The comparison actually used is exercised on the mangled-header pair as a
  negative control, where it has to fail.

  **Evidence, labelled.** The `H` … `L` message unit is _verified primary_ and its grounding is
  recorded on `messages()`, unchanged here. The allow-list itself is **this library's own policy,
  not the standard's**: no clause governs which of our warning codes a profile may downgrade, and
  none is claimed for it. The behaviour above (the merge, the accessors answering, the strict
  acceptance under a tolerating profile) is _measured_, on the tree before and after the change.

- **The em dash (U+2014) is gone from every tracked file, and a CI gate keeps it out**
  (`EMDASH-CONFORMANCE`). The brand rule bans the character outright across every cosyte surface
  and names commit messages explicitly; this package was the last one it had not reached, and the
  only one where it did not arrive on a clean tree. **1,129 occurrences across 108 of the 142
  tracked files** were rewritten with a comma, a colon, or a period. The sweep and the gate are one
  change on purpose: a sweep with no gate grows back, and a gate with no sweep reds CI on arrival.

  **What a consumer can observe.** The npm `description` no longer carries the character. The pages
  published to docs.cosyte.com are rewritten, including the title of the limitations page, now
  `What it does, and does not do`. Warning and error `message` text is repunctuated, and a
  consumer's log prints that text. **No warning or fatal code changed**: codes are the stable
  contract, and the snapshot tests that pin them are untouched. No runtime behaviour changed; the
  parser, the frame codec, the LTP reducer, and the emit path are not part of this change.

  **Two findings worth carrying, because neither is visible from a diff.** First, an em dash can be
  a semantic **value**: `docs-content/architecture.md`'s layer table used a bare dash in the
  **Standard** column to mean _this layer is governed by no standard_, and a bulk rewrite turned it
  into a stray colon, so the cell read "unstated" rather than "none" on the page whose job is honest
  disclosure. Nothing in CI could have caught that; it is now the explicit word `None`. Second, rewriting the
  separator in the warning registries as a colon turned `test/records/multi-header-delimiters.test.ts`
  red: that fixture declares `:` as its **component** delimiter, and the test asserts that no warning
  message contains one of its delimiter characters. All 22 registry messages separate with a comma
  now. The invariant that assertion really pins is that a warning message is a **constant carrying no
  field data**, which is what makes it value-free; a comma is not safer than a colon in principle,
  because ASTM delimiters self-declare and any character can be one. The existing test caught this,
  not a reviewer.

  **Where the rewrite needed a rewrite, not a substitution.** Where the character had bracketed an
  aside that itself contains commas, replacing both ends with commas turns the aside into an
  indistinguishable list item, and several sentences went false that way. Those now use
  **parentheses**, which is the fourth option the rule always allowed and the one a mechanical
  substitution never reaches for.

- **BREAKING: `patient()`, `results()`, `orders()`, `comments()`, and `query()` now throw on a
  stream they cannot answer for, instead of answering across patients**
  (`ASTM-PATIENT-RESULT-MISATTRIBUTION`; shipped `0.0.1` through `0.0.3`).

  **The defect.** These accessors read the whole stream. On a stream carrying more than one
  message, `patient()` answered with the **first** `P` in the stream while `results()` answered
  with **every** `R` in it, so pairing them, which is exactly what this package's one-line north
  star does, attributed one patient's results to another. It needed no delimiter redeclaration
  and no unusual delimiters: an ordinary two-message stream in one canonical set reproduced it,
  with **zero** warnings, and `strict` mode raised no objection either. On an analyzer-to-LIS
  path that is a result filed against the wrong patient. Nothing was mis-_read_, every `P` and
  every `R` was correct in `records`, but there was no way to ask which belonged together.

  **The change.** Those five accessors now throw `AstmAmbiguousStreamError` with code
  `ASTM_AMBIGUOUS_MULTI_MESSAGE` when the stream carries more than one message. `patient()` also
  throws `ASTM_AMBIGUOUS_MULTI_PATIENT` when the single message it is reading carries more than
  one `P`, which is the same harm one level down: "the first `P`" is a guess about whose result
  it is. The error carries a stable code, a value-free position, and the two counts; never an
  identifier and never a value.

  **Why the break is the fix, not a cost of it.** The callers this breaks are exactly the
  population that is being silently corrupted today. A caller who now gets an exception is
  strictly better off than one who quietly received another patient's results: the failure is
  loud, immediate, positioned, and correctable, where before it was invisible at every layer.
  There is no version of this where the old behaviour is safe to keep, and no warning strong
  enough to substitute for refusing to answer, because the wrong answer was already being used.

  **Which callers are affected, stated exactly.** A stream that is one message carrying at most one
  `P` is **unchanged**, and so is a result-only message with no `P` at all: `patient()` still answers
  `undefined` there, which is an ordinary shape and not an error. But `ASTM_AMBIGUOUS_MULTI_PATIENT`
  **does reach single-message callers**, a lone message carrying several patients used to answer
  with the first of them and now refuses, so "single-message streams are unaffected" would be false
  and is not claimed. That second break is the same wrong-patient guess as the first, one level down,
  and it is disclosed on the README and in the docs for the same reason the first one is.
  `commentsFor()` is unchanged and works on any stream, single- or multi-message, because the parent
  record it is handed already names the message.

  **Migrating** is mechanical: replace `results(msg)` and `patient(msg)` with a walk over
  `messages(msg)`, reading each message's own `patient` and `results`. Where a caller genuinely
  wants every result in a stream regardless of who they belong to, that is
  `messages(msg).flatMap((m) => m.results)`: written out, so it is a choice rather than a
  default.

- **The alt text on the README's Cosyte mark now says how its two overlapping rounded squares
  differ.** It read "a plus mark set in two overlapping rounded squares, beside the Cosyte
  wordmark", which describes two shapes and nothing about what tells them apart. It now reads
  "a plus mark set in two overlapping rounded squares, one solid and one outlined, beside the
  Cosyte wordmark", which is what both tiles actually show: the rear square is filled and the
  front one is drawn as an outline. A reader who cannot see the image was previously told there
  were two shapes with no way to picture either.

  This package was the first to carry the `<picture>` block, so it kept the wording that shipped
  with it while the phrasing settled afterwards on the twelve surfaces that followed. The block is
  now byte-for-byte the one the other twelve carry, copied rather than retyped, so the thirteen
  agree by construction and not by proofreading. Nothing else about the block changed: the same two
  tiles, the same media query, the same safe fallback to the light-ground tile.

  **The front shape is very slightly taller than wide**, so "rounded squares" is a small
  imprecision, and it is kept deliberately: it reads correctly aloud, and one wording across every
  package is worth more than the millimetre.

### Fixed

- **One unescaped `&` in a value no longer swallows every field after it**
  (`ASTM-UNESCAPED-ESCAPE-SWALLOWS-TAIL`; `PRE-EXISTING`, shipped `0.0.1` through `0.0.8`, not a
  regression). The escape codec read an escape character with no closing escape character as the
  opening of a sequence and copied from it to the end of the record, so every field after it merged
  into the field it sat in, **and there was no warning code for the condition at all**. Measured on
  `064c078`: `R|1|^^^687|28.6&|U/L||N||F` read back `value = "28.6&|U/L||N||F"` with `units`,
  `abnormalFlags` and `flag` all `undefined` and `status` `unspecified` rather than `final`, on a
  stream declaring the canonical `H|\^&`, with `warnings: []`. On the patient side
  `P|1||LAB-0001||O&BRIEN^JANE||19800101|F` read the surname as the whole rest of the record and
  came back with **no birth date and no sex**, again silently. A result that reads `28.6` with its
  units gone is the harm this package exists to prevent, and an ampersand in a surname is not exotic.

  **The round trip made it worse rather than surfacing it.** Emit re-escaped the merged text into
  `R|1|^^^687|28.6&E&&F&U/L&F&&F&N&F&&F&F`: a spec-clean-looking line that re-parsed to the same
  wrong value, with zero warnings, byte-stable across further trips. Silent re-read divergence, with
  no malformed delimiter set anywhere in it.

  **The fix is a bound, and it infers nothing.** An escape sequence is now exactly three characters
  (the escape character, **one** body character, the escape character), which is all the four
  mnemonics `&F&` `&S&` `&R&` `&E&` ever need, and both `splitEscapeAware` and `decodeEscapes` share
  that one definition. An escape character that heads no such sequence is read as the **literal
  character it is**: the value keeps the byte that arrived, it opens no atom, and nothing is
  invented to close a sequence the sender did not open. The same fixture now
  reads `value = "28.6&"` with `units: "U/L"` and `status.meaning: "final"`, and the patient keeps
  their birth date and sex. Emit writes the literal character as `&E&`, so the emitted line is
  spec-clean **and** structurally faithful, and re-parses to the same tree.

  The bound also removes a non-local behavior: under the unbounded scan, whether a field kept its
  value depended on whether some **later** field in the record happened to carry an escape character
  too, which paired across the field separator between them. Two bare ampersands in one record now
  cost nothing.

  New warning code `ASTM_UNPAIRED_ESCAPE_CHARACTER` and exported factory `unpairedEscapeCharacter`
  report each such character, one per occurrence, positioned on the record and field, carrying no
  field text (PHI discipline). The code is **tolerable**: a profile may expect it, because reading
  the character as a literal is unconditional and the parsed value is byte-identical with the profile
  and without it. Untolerated, `{ strict: true }` refuses.

  **The scope is the bare character, and only that.** The atom rule is unchanged, so an `&X&`
  sequence whose body **is** a delimiter still swallows that delimiter and still costs the value, the
  units and the status together: `R|1|^^^687|28.6&|&U/L||||F` reads `28.6&|&U/L` with no units and
  status `unspecified`. It is never silent, but its only report is `ASTM_UNKNOWN_ESCAPE_SEQUENCE`,
  which is tolerable, so a profile expecting that code lets `{ strict: true }` accept it. That case
  is recorded as a known defect and deliberately not closed here: narrowing the atom would break the
  guarantee it exists for, which is that `&F&` stays one token under a set naming `F` as a delimiter.
  Both halves are pinned, so neither can drift.

  `ASTM_UNKNOWN_ESCAPE_SEQUENCE` is unchanged for a single unrecognized body (`&Z&`). A multi-
  character body is no longer treated as one atom: its bytes are all preserved, but a **delimiter
  inside** such a body now splits, which moves every field after it, and the report becomes one
  unpaired-character warning per loose escape character instead of one unknown-sequence warning. Over
  an exhaustive corpus of bodies up to four characters in a result-value slot, that is 1,085 records
  read correctly where the previous release read them wrongly, against 27 read differently in the
  other direction.

  Measured red on base: 10 of the 18 new tests fail against `064c078` extracted into a clean tree.
  Of the 8 that pass, 6 measure behavior this change does not touch and 2 are the boundary pins on
  what it deliberately does **not** fix.
  `test/records/unseparated-fields.test.ts` had pinned this loss as a documented limit of
  `ASTM_RECORD_FIELDS_UNSEPARATED`; that pin is inverted rather than deleted, and the prose stating
  the limit moved with it in `README.md`, the quickstart and the warning code's own docs.

- **Emit no longer writes a stream it cannot read back** (`ASTM-EMIT-RESIDUALS`; both gaps shipped
  `0.0.1` through `0.0.3`, `PRE-EXISTING`, neither a regression). Two residual emit-side holes, both
  recorded and deliberately deferred by `ASTM-MIXED-DELIMITER-EMIT` (#21) and again by
  `ASTM-SECOND-HEADER-COLLAPSE` (#22) because each turned on a question those slices did not answer.
  Both were reproduced by **executing** the shipped code before anything was changed, and re-verified
  the same way after; neither was half-fixed by the two earlier slices.

  **1. A delimiter declaration longer than three characters lost its extra bytes.** Three characters
  of a header's declaration carry a role (repeat, component, escape, by position) and the reader
  ignores any beyond them rather than refusing the stream. Emit regenerated the declaration from the
  three roles alone, so a header that arrived as `H|\^&#` went back out as `H|\^&`, with no warning
  and no way for a caller to notice. Measured before the fix: `serializeAstmRecords(msg, msg.delimiters)`
  on `H|\^&#|||SENDER^SYS|||||||P|1` returned a header short of its `#` and a round-trip that was not
  byte-exact.

  The surplus is now carried through from the modeled declaration field. Of the three available
  dispositions (preserve, refuse, report), **preserve** was chosen. Refusing would reject a stream
  the parser reads without complaint, on a published package, over bytes it has already decided are
  inert. Reporting is not available at all: emit returns a bare string and has no warning channel, so
  a warning could only be ignored while the truncated stream still shipped, which is the same reason
  #21 chose re-encoding. Preserving costs nothing and is the only one of the three that makes the
  round-trip byte-exact. What the surplus _means_ remains unresolved (the clauses that would settle
  it are not in the freely published material and were not read, so no clause is cited here in either
  direction) but carrying bytes through unread is a strictly smaller claim than deleting them, and it
  stays coherent with a reader that now scopes delimiters forward from every header: the re-read
  declaration resolves to the same four roles either way. This lands on the **default** canonical
  path too, not only when a set is passed explicitly (normalizing a message replaces the four
  delimiter roles, and the surplus holds none of them) so a caller who was relying on emit to strip
  those bytes will find it no longer does.

  The surplus is dropped in exactly the two cases where it could not be read back as surplus: the
  header is being transcoded into a different delimiter set, so the surplus belonged to the
  declaration being replaced; or the surplus is not inert on the wire, meaning it contains the field
  separator or **any control character**. The control rule is deliberately wider than the record
  layer alone needs. A `CR`/`LF` would end the record and shift every data field along, but this text
  also reaches the **frame** layer through `serializeFramedAstm`, where `STX`, `ETX` and `ETB` are
  structural: a surplus carrying one of those truncated the frame body, and re-reading the framed
  stream then dropped the **entire header record** (its sender, its receiver, its control ID)
  behind nothing but an `ASTM_FRAME_BAD_CHECKSUM`. Rather than enumerate the bytes each layer happens
  to reserve, and re-derive that list whenever a layer is added, no control character is carried at
  all. Two things that rule does **not** do, said here rather than left to be found: it is keyed on
  the character, so a surplus character above `U+00FF` passes it (the frame layer is where that is
  settled now, and refuses such a character rather than truncating it, see the entry above; when
  this was written the frame encoder truncated to the low byte and the case broke framing instead);
  and refusing a control character in a _surplus_ does not mean one cannot be a _delimiter role_,
  since only `CR`/`LF` are refused there. Those are
  structural losses; dropping inert bytes is not.

  **2. A caller-supplied delimiter set was never validated.** `serializeAstmRecords(msg, d)` and its
  three siblings took `d` on trust. Measured before the fix, across six malformed sets: a
  multi-character field separator, an empty escape character, a `field`/`escape` collision and a `CR`
  separator each emitted a stream `parseAstmRecords` then **threw** on; a `repeat`/`component`
  collision and a `component`/`escape` collision each emitted one it **re-read with a different field
  tree and zero warnings**. An empty escape additionally garbled the values themselves: `28.6` went
  out as `2E8E.E6`. On the analyzer-to-LIS path a field tree that changes under a re-read is a lost
  result or a lost specimen identifier, and the caller had no signal either way.

  `d` is now checked before any bytes are written, on all four public emit entry points
  (`serializeAstmRecords`, `serializeAstmRecord`, `serializeField`, `encodeComponent`): each separator
  exactly one character, none a `CR`/`LF`, no two the same character. A failing set is an
  `AstmSerializeError` with the new code `ASTM_EMIT_INVALID_DELIMITERS`: including a set that omits a
  member or holds a non-string, which the types forbid but a JavaScript caller can still pass, and
  which previously surfaced as a raw `TypeError` from inside the serializer.

  **The three rules are necessary, not sufficient, and the docs say so rather than implying a
  guarantee.** A set can satisfy all three and still emit a stream that reads back wrong: a separator
  equal to a record's type letter (`field` of `R`) makes the type letter itself get escaped away, and
  the record re-reads as unsupported with its result lost. That corruption is unchanged by this slice,
  it reproduces byte-identically before it, and is recorded as a known defect rather than fixed
  here, because the rule that would catch it has to be derived rather than guessed. **A typed error rather than a
  warning, and the house rule from #21 is why**: with no warning channel on a `string` return, refusing
  at the call is the only disposition that reaches the caller at all. The counter-argument was weighed
  and is real: `@cosyte/astm` is published, and refusing rejects input previously accepted. It is
  accepted deliberately, because the input turned away is exactly the input that was being corrupted,
  and because the three rules are not stylistic: each names a case where the emitted bytes provably do
  not read back as the records that produced them. The narrowing has one consequence worth stating
  plainly: the **reader** tolerates a header declaring, say, the same character for `repeat` and
  `component`, so `serializeAstmRecords(msg, msg.delimiters)` on such a message now throws where it
  previously returned bytes that read back wrong. The canonical default is untouched, and so is every
  well-formed set. The error names the role at fault and never echoes the offending characters, since
  a value failing the one-character rule can be arbitrary caller text and the message reaches logs.

  The invariant both halves are held against is the one #21 and #22 established: **a round-trip never
  silently loses a field, in either direction.** The property is asserted by round-tripping through the
  real parser, not by inspecting the serializer.

  `AstmSerializeError.code` widens from a single string literal to a two-member union, exported as the
  new `AstmSerializeErrorCode` type. `ASTM_EMIT_UNENCODABLE_VALUE` is unchanged.

- **`parseAstmRecords` now reads the delimiters from every `H` record, not only the first, so a
  stream carrying more than one message no longer silently loses fields** (`ASTM-SECOND-HEADER-COLLAPSE`;
  shipped `0.0.1` through `0.0.3`, `PRE-EXISTING`, not a regression). This is the same silent field
  collapse as `ASTM-MIXED-DELIMITER-EMIT` one layer over, on the **parse** side, which is why #21 did
  not narrow it: #21 fixed what we write, and a stream arriving with two headers is mis-read on the
  way **in**, before any of that runs.

  A message runs `H` … `L`, so one stream may carry several back to back and each header declares the
  delimiters for the records that follow it. Delimiters were read only from `records[0]` and applied
  to the whole stream, so every record after a redeclaring header **collapsed into a single field,
  with zero warnings**, and `{ strict: true }` accepted it. Measured by execution on `dc09a3a` before
  the fix: in a two-message stream whose second header declared `*~:#`, the second result, value
  `99.9`, units `mmol/L`, abnormal flag `H`, status `F`, came back with `value`, `units`, `flag` and
  `resultStatus` **all absent** and `status` reading `unspecified`. On the analyzer↔LIS path that is a
  lost result with no signal to the caller.

  **The decision, and its grounding.** Delimiters are now scoped **forward from each header**: a later
  `H` governs itself and the records after it, until the next `H`. The asymmetry with the emit bug is
  real: on emit the library was corrupting its own output, so re-encoding was unambiguously safe,
  whereas on parse the bytes are the sender's and a second `H` is legal. What settles it is that
  forward scoping is the **only** reading that never reinterprets bytes already consumed: records
  before a redeclaration keep the set they were read with, so the two sets never disagree about the
  same bytes. "First header wins forever" is the collapse itself; "last header wins retroactively"
  would require re-reading records already delivered.

  **Evidence, labelled.** The message unit is `H` … `L`, _verified primary_: LIS02-A2 §2 makes the
  message a **bounded unit**, one record type opening it and another closing it, which is why a second
  `H` begins a new message rather than corrupting the current one. Read directly in CLSI's own free
  sample of the document. (Stated in our own words on purpose. We may read and cite the standard but
  never reproduce its prose, and `CHANGELOG.md` ships inside the npm tarball: an earlier draft of
  this entry quoted the clause verbatim and was caught in review.) That a header may follow a
  terminator to start another message: _verified secondary_, two independent restatements of the
  terminator clause (Roche cobas b 121 ASTM interface description; Genaux, _Introduction to ASTM
  Message Formats_, 2024).
  That a header's delimiters govern "the message": _verified secondary_ (Genaux; Stratford Software
  interface spec), which leans per-message but **does not address a redeclaration that changes the
  set**. **We could not reach the normative text on that specific question**: LIS02-A2 §5.4
  (Delimiters) and §6.2 (Delimiter Definition) are precisely the clauses withheld from the free
  sample, and E1394-97 and LIS01-A2 stayed paywalled. So the forward-scoping rule is recorded as a
  **reasoned choice, not a citation**: no clause number is claimed for it, and we do not assert the
  standard is silent either, because that would need the same evidence.

  The OSS reference corpus cannot ground this one and is reported as a negative result rather than
  dressed up: `kxepal/python-astm` and `senaite.astm` both hardcode `|\^&` as module constants, never
  read the header's declaration at all, and neither tracks `H` … `L` boundaries, so differential
  testing against them is uninformative here.

  **Behaviour.** A redeclaration that **changes** the set is honored and raises
  `ASTM_RECORD_DELIMITERS_REDECLARED`. A header that merely **restates** the set in force is a no-op
  and raises nothing: several messages in one delimiter set is an ordinary shape, and warning on it
  would be noise. A later header whose declaration is **unusable** (too short, or a field separator
  that also names another role) keeps the set already in force and raises
  `ASTM_RECORD_UNREADABLE_REDECLARATION`; a set is never guessed and no record is dropped. The same
  condition on the _first_ header remains the `ASTM_RECORD_UNDECLARED_DELIMITERS` fatal: there is no
  earlier set to fall back to, and that is pinned by a test so it cannot be softened by accident.

  **Surface.** Two new stable warning codes (`ASTM_RECORD_DELIMITERS_REDECLARED`,
  `ASTM_RECORD_UNREADABLE_REDECLARATION`) with `delimitersRedeclared` / `unreadableRedeclaration`
  factories, both **safety-critical** by the profile gate's default-deny rule, so no profile can quiet
  them (asserted). `HeaderRecord.delimiters` now reports the set **that** header put into force rather
  than always the first header's; `AstmMessage.delimiters` is unchanged and stays the first header's.
  The sites that _stated_ the old single-header rule were swept, the `parseAstmRecords` JSDoc, the
  module header, `HeaderRecord`/`AstmMessage` type docs, `readDelimiters` (whose doc comment said the
  caller escalates an unusable declaration to the fatal, true only of the first header now), and
  `docs-content/quickstart.md`, because on #21 the refuter's first pass was refused for exactly the
  opposite failure: correct code shipped behind documentation that steered consumers the wrong way.
  The `readDelimiters` comment also said it returns `{ ok: false }` when it has always returned
  `undefined`; that was already wrong before this slice and is corrected in the same paragraph.

  **Deliberately left for their own slices** (both recorded with this item, both **emit**-side, and
  both turning on questions this one does not answer): a delimiter declaration **longer than three
  characters** still loses its extra bytes on emit, what a fourth declaration byte even means is
  unresolved by the same withheld clauses, and `serializeAstmRecords(msg, d)` still does **not
  validate a caller-supplied `d`**, so a malformed set emits a stream this library's own parser then
  rejects or mis-reads, with no typed error. Neither is touched here; folding an emit-side change into
  a parse-side fix would have widened the diff without answering either question.

  **Strict-mode boundary, disclosed as a sample and not a census.** Measured base-build vs head-build
  over 216,699 synthetic streams (the 11 repo fixtures, 464 single-header streams, and multi-header
  pairs across a sampled sweep of delimiter sets): **394 moved accepted→rejected, 0 the other way.**
  All 11 fixtures and all 464 single-header streams were **unchanged**, in strict mode and in their
  lenient warning lists, which matches the code path, since the new warnings can only be raised at an
  `H` record that is not `records[0]`.

- **`serializeAstmRecords` no longer emits a mixed-delimiter stream that silently loses fields on the
  next read** (`ASTM-MIXED-DELIMITER-EMIT`; shipped since `0.0.1`, `PRE-EXISTING`, not a regression).
  Emit normalized the header to the canonical `H|\^&` set but re-emitted `M` (manufacturer) and `S`
  (scientific) records byte-for-byte from `rawLine`. For a message that arrived under a vendor
  delimiter set the output was therefore **non-conformant**: a canonical header above `M`/`S` rows
  still written in the original delimiters. Re-parsing that output **collapsed every field of those
  rows into one, with zero warnings**: on the analyzer↔LIS path, a lost result or a lost
  patient/specimen identifier with no signal to the caller. Verified by execution before and after,
  not by inspection: a five-field `M` row round-tripped to one field.

  **The semantics chosen, and why.** The two candidates were to re-encode every record to the
  delimiters the header declares, or to refuse/warn on a message whose records disagree.
  **Re-encoding was chosen.** It is what the serializer already promises, one spec-clean stream in
  the declared set, and a mixed-delimiter stream is not spec-clean. Emit returns a `string` and has
  no warning channel, so a warning could only have been ignored while the corrupt stream still
  shipped, and a refusal would have rejected messages this library successfully parsed, a harder
  break on a published package. The invariant that had to hold either way is that **a round-trip
  never silently loses a field, in either direction**; it is now pinned by a property over arbitrary
  declared delimiter sets, which fails against the old code. `M`/`S` are reproduced byte-for-byte
  **only when a reader using the emit delimiters would recover exactly the fields the record models**,
  so bytes change for exactly the streams that were being corrupted and for no others. The reasoning
  is recorded at the site in `src/records/serialize.ts`.

- **Editing a modeled `H` field and re-serializing no longer silently keeps the original value**
  (`PRE-EXISTING`, found in the same pass). The header was emitted by re-tokenizing its preserved
  `rawLine`, so the model was bypassed on emit. It is now emitted from `HeaderRecord.fields` like
  every other record type. The delimiter declaration itself is still never taken from the model: it
  always states the delimiters actually being emitted with, because a declaration that disagrees with
  the records around it is the very corruption above.

- **`HeaderRecord.fields` now holds the header's real fields.** The generic escape-aware tokenizer
  reads the escape character sitting _literally_ inside the delimiter declaration as an unterminated
  escape and swallows the remainder of the record, so a canonical header modeled as **two** fields
  (`H` and everything else merged) instead of one per field. A header-aware `tokenizeHeader` takes the
  declaration verbatim as one opaque field and tokenizes the data portion normally; it is exported
  alongside `tokenizeRecord`. This is what made emitting the header from its model possible.

  **A `strict` consumer will observe one side effect, stated rather than left to be discovered.**
  The old tokenizer read the declaration's literal escape char as an unterminated escape and raised a
  spurious `ASTM_UNKNOWN_ESCAPE_SEQUENCE` on some headers, which `{ strict: true }` rejected. Those
  warnings are gone, so a few messages that previously threw now parse. Measured over ~40,000
  differential messages: 1,176 moved from rejected to accepted, **0** moved the other way, and every
  warning delta is confined to `recordIndex 0`, no warning on any other record is added or dropped.

  Three `PRE-EXISTING` neighbours were found while grading this and are deliberately **not** fixed
  here, to keep the slice the size of its item: `parseAstmRecords` reads delimiters only from the
  first header, so a **second `H` mid-stream that redeclares them** still yields the same silent
  field collapse (parse-side, not emit-side, the emitter faithfully reproduces what parse modeled),
  **since fixed, see the parse-side entry above**;
  a delimiter declaration longer than three characters silently loses its extra bytes on emit; and
  `serializeAstmRecords(msg, d)` does not validate a caller-supplied `d`, so a malformed set (a
  multi-char delimiter, an empty escape, a `field`/`escape` collision) emits a stream this library's
  own parser then rejects or mis-reads, with no typed error.

- **The type documentation shipped in `dist/index.d.ts` no longer understates the library.** The
  entry-point module documentation ended by calling serialize and build deferred, on a tree that exports
  `serializeAstmRecords`, `buildAstmMessage`, `composeAstmFrames` and `serializeFramedAstm`, and the
  record-types module documentation described only `H`/`P`/`O`/`R`/`L` as modeled, naming
  result-flag/status semantics, comment, query, `M`/`S`, framing and serialization as still to come,
  when all of them are modeled. Both
  blocks are carried verbatim in `dist/index.d.ts` and `dist/index.d.cts`, which is what an installer
  receives. (They are module-level blocks that bind to no exported symbol, so they sit in the
  declaration text rather than in any symbol's editor tooltip.) Every affected block now describes
  what the code does. 18 source files changed; no runtime behaviour, export, type or warning code is
  affected.
- **The fatal-error taxonomy is now accurate about what `err.code` can hold.** `FATAL_CODES`
  documented itself as later growing the frame codec's own `ASTM_FRAME_*` fatals. `FatalCode` is a
  closed three-value union and the frame codec does not widen it: it reuses `EMPTY_INPUT` for an
  empty stream, and its own thrown errors are separate types with their own discriminants
  (`AstmFrameEncodeError` carries `ASTM_FRAME_EMPTY_RECORD`; `AstmFrameStrictError` carries the
  rejected warnings rather than a `code`). Narrowing an `AstmParseError` on `code` will only ever
  see one of the three.
- **The serializer's round-trip note now names the cases that do not round-trip.** It claimed
  serialization emits from the decoded component tree. Three record types do not: `H`, `M` and `S`
  are emitted from their preserved `rawLine`, so an edit to their modeled `fields` is silently not
  reflected on emit -- editing a header field and re-serializing keeps the original value, with no
  warning. `M`/`S` additionally keep whatever delimiters they arrived with, so a non-canonical
  `M`/`S` row does not come back as separate fields. Normalization to `H|\^&` is also skipped when a
  delimiter set is passed explicitly. All of it is now stated next to the round-trip claim it
  bounds, and `serializeAstmRecords` gained the `@param d` its siblings already had.

- **The published documentation sidebar now follows the shared section order.** The shipped
  `docs-content/sidebars.json` carried a category named "About" holding the "what it does and does not
  do" page. That label is not one of the sections the documentation site recognises (Overview,
  Installation, Quickstart, Core Concepts, Guides, API Reference, Troubleshooting), so `docs.cosyte.com`
  rendered this package with a section no other `@cosyte/*` package has. The page now sits under
  **Troubleshooting**, beside the troubleshooting guide that already links to it, matching how
  `@cosyte/mllp` files the same page. The page's own URL is unchanged, so existing links to it still
  resolve. Both released documentation bundles (`v0.0.1` and `v0.0.2`) carry the old layout and cannot
  be changed, because a release asset is immutable once published; this correction reaches readers with
  the next release.
- **The status note no longer quotes a version number that a release makes wrong.** `README.md`,
  `docs-content/intro.md` and `docs-content/installation.md` each opened with "published on npm at
  `0.0.1`" while the package was at `0.0.2`. Nothing bound those sentences to the manifest, so every
  publish falsified them, and the two documentation pages ship inside the release bundle the
  documentation site re-fetches forever. They now say the package is published and name the `0.0.x`
  pre-alpha ladder, and leave the exact version to the registry, where it cannot go stale. The
  exported `VERSION` constant is unaffected: it is generated from `package.json` at release time and
  asserted equal to it.

## [0.0.2] - 2026-07-27

### Fixed

- **Publish status corrected across the public surface.** `@cosyte/astm` has been published on npm at
  `0.0.1` since 2026-07-22 and the repository is public, but `README.md`, `docs-content/intro.md`, and
  `docs-content/installation.md` each still opened with "pre-alpha (`0.0.x`), not yet published to
  npm" (and the installation page told readers to consume the package from source instead). Those
  three status blocks, plus the project guide, now state the real published version. The install
  instructions no longer describe a package that does not exist.
- **`VERSION` no longer lies about the release.** The published `0.0.1` exported `VERSION === "0.0.0"`
  while `package.json` read `0.0.1`, which the documented install smoke test (print `VERSION`) surfaces
  directly to an installer. The constant is corrected to `0.0.1`, `scripts/sync-version.mjs` now
  rewrites it from `package.json` inside the release `version` script, and `test/sanity.test.ts`
  asserts the two agree so a skipped sync fails the build instead of shipping. The declaration is now
  annotated `: string` (matching `@cosyte/hl7`), so the emitted type is `string` rather than the
  version literal.
- Removed `cosyte-astm-0.0.0.tgz`, a 307 KB `pnpm pack` artifact committed to the repository root that
  carried a stale `0.0.0` `dist/`, and added `*.tgz` to `.gitignore` so pack output cannot be
  committed again.

### Changed

- The `README.md` status block is replaced by a "What it covers" summary of the record, framing and
  transport, emit, profile, and terminology layers. Per the public-surface rule, a README describes
  what the software does, not our internal phase numbering; the ASTM designations `E1381` and `E1394`
  are reference material and stay. Same removal of internal cross-references a reader cannot follow
  from `docs-content/limitations.md` and `docs-content/quickstart.md`, leaving the surrounding
  sentences intact.
- The released `0.0.1` entries now sit under a dated `## [0.0.1] - 2026-07-22` heading with a link to
  its tag, instead of sitting under `[Unreleased]` behind a sentence saying `0.0.1` "will ship".

## [0.0.1] - 2026-07-22

The first pre-alpha release. The package begins its public history at `0.0.x`, per the cosyte version
ladder (`0.0.x` until first alpha).

### Added

- Project scaffold from the shared `@cosyte/*` parser template: the canonical toolchain (TypeScript
  ES2023 + strict rigor via `@cosyte/tsconfig`, ESLint 10 + type-checked `typescript-eslint` via
  `@cosyte/eslint-config`, Prettier via `@cosyte/prettier-config`, Vitest 4 + v8 coverage via
  `@cosyte/vitest-config`, dual ESM + CJS build via `tsup` + `@cosyte/tsup-config`, `attw` publish
  gate), thin callers of the reusable `cosyte/.github` CI/release workflows, Changesets on the
  `0.0.x` ladder, and the property-based conformance harness from `@cosyte/test-utils`.
- **Record foundation (ASTM-1, roadmap Phase 1).** The record-content layer: parse an ASTM/CLSI-LIS02
  record stream and pull result value + units + flag in one line.
  - `parseAstmRecords(raw, opts?)` → an immutable, deeply-frozen `AstmMessage`; `results(msg)` /
    `patient(msg)` typed extractors.
  - **Delimiter self-declaration**: the four delimiters (field / repeat / component / escape) are
    read from each `H` record, never hardcoded, with ASTM's `\`=repeat and `&`=escape mapping.
  - **Escape codec**: `&F&`/`&S&`/`&R&`/`&E&` are decoded via escape-aware split-then-decode, so a
    value containing an escaped component delimiter reads as **one** component (the documented
    silent-misread class the OSS references exhibit). Re-escaping is deferred to the emit phase (P7).
  - Modeled records: `H` (delimiter provenance), `P` (identity, practice-assigned ID and
    laboratory-assigned ID kept **distinct**), `O` (accession + Universal Test ID), `R` (all 14
    fields; value / units / flags / status surfaced **raw**), `L`. Unknown record types surface as
    `unsupported` records with a warning, never dropped.
  - `/common` value layer: delimiter model, escape codec, precision-preserving `YYYYMMDDHHMMSS` date
    value (no-UTC, partial dates are not errors), Universal Test ID code-system provenance
    recognition (`[OSS-derived]` field order), the deep-freeze base, and the warning/fatal registry.
  - Fatal codes: `EMPTY_INPUT` (shared), `ASTM_RECORD_NO_HEADER`, `ASTM_RECORD_UNDECLARED_DELIMITERS`.
    Warning codes: `ASTM_RECORD_UNKNOWN_TYPE`, `ASTM_NONSTANDARD_DELIMITERS`,
    `ASTM_UNKNOWN_ESCAPE_SEQUENCE`, `ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT`, all carry stable code +
    value-free positional context.
  - **Fail-safe on an unescaped component delimiter in a result value:** the full raw value and the
    component split are both surfaced and an `ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT` warning fires, the
    primary `value` is never silently truncated to the first component.
  - `scripts/phi-scan.ts` extended toward the P-record loci (name + DOB, delimiter-aware); synthetic
    fixtures declared in `scripts/phi-allow-list.txt`.
- Public exports replace the scaffold stubs: `parseAstmRecords`, `results`, `patient`,
  `AstmParseError`, `AstmStrictError`, the record/value model types, and the `WARNING_CODES` /
  `FATAL_CODES` registries.
- **Safety-critical result semantics (ASTM-2, roadmap Phase 2).** The raw `R`-record letters that
  Phase 1 surfaced are now modeled into fail-safe semantics, under one rule: _never a confident wrong
  value_. The raw strings (`abnormalFlags`, `resultStatus`, `referenceRange`, `units`) still coexist
  with the modeled views; nothing is collapsed or reconciled.
  - **Abnormal flags (field 7) → HL7 Table 0078.** `interpretAbnormalFlag()` and the `flag` field on
    `ResultRecord` model the full value set: `L`/`H`, panic `LL`/`HH`, off-scale `<`/`>`, `N`, `A`/`AA`,
    the **directional** significant-change `U` (up) / `D` (down), _not_ units/delta, `B`/`W`, and
    microbiology `S`/`R`/`I`. An **unrecognized** flag is surfaced as `meaning: "undefined"` with an
    `ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG` warning, **never dropped, never coerced to `normal`**.
  - **Result status (field 9).** `interpretResultStatus()` and the always-present `status` field model
    `F`/`C`/`P`/`R`/`S`/`I`/`X`, with **`C` correction** (`supersedes: true`) and **`X` cancel**
    (`cancelled: true`) so a superseded/cancelled result can **never** read as current, `isActiveFinal`
    is `true` only for a plain `F`. An **absent** status is typed `unspecified` (never assumed `final`);
    an unrecognized one is `undefined` + `ASTM_RECORD_UNDEFINED_RESULT_STATUS`.
  - **Reference range (field 6).** `parseReferenceRange()` and the `range` field parse `low-high`
    (closed), `<high` (open-low), and `>low` (open-high); bounds are surfaced as **verbatim numeric
    text** (never coerced to floats). The range is read from the **full field text**, so a
    component-delimited value (`low^high`) is preserved verbatim and read as `unparsed`: never
    truncated to a single bound. An unparseable range is `kind: "unparsed"` +
    `ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE`, **no bound is fabricated**. The exact delimiter is
    `[OSS-derived]` pending the purchased CLSI LIS02-A2 (roadmap §10 Q1).
  - **Units discipline (field 5).** A _numeric_ result value with no units raises
    `ASTM_RECORD_UNITS_ABSENT`; units are vendor free text (not UCUM) and are **never defaulted,
    guessed, or converted**.
  - New warning codes (registry extended, snapshot locked): `ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG`,
    `ASTM_RECORD_UNDEFINED_RESULT_STATUS`, `ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE`,
    `ASTM_RECORD_UNITS_ABSENT`, all value-free (code + record/field index only).
- **Patient/order identity depth, comments, and partial-timestamp hardening (ASTM-3, roadmap Phase 3).**
  The misfiling-prevention slice: model the identity that a result files against, and the context that
  qualifies it.
  - **Full patient (`P`) identity.** The **practice-assigned ID (field 3)**, the **laboratory-assigned
    ID (field 4)**, and a **third patient ID (field 5)** are modeled as **distinct** fields that never
    collapse into one: conflating them is the primary result-misfiling path. Adds mother's maiden name
    (field 7) alongside the existing name components (field 6), birthdate (field 8), and sex (field 9).
  - **Full order (`O`).** `priority` (field 6), `actionCode` (field ~12), and `reportType` (field ~26)
    are surfaced **verbatim** on top of the existing specimen/accession + Universal Test ID. The `~`
    field indices and the code sets are `[OSS-derived]` (paywalled): never mapped to a guessed meaning.
  - **The `C` (comment) record.** Modeled as `source` (field 3), `text` (field 4, component-capable,
    the full text is surfaced plus the component split, never truncated), and `commentType` (field 5).
    Each comment is **attached by position** to the immediately-preceding `H`/`P`/`O`/`R` parent
    (`parentIndex`); consecutive comments share that parent. **Fail-safe:** an **orphan** comment with no
    valid parent is attached to the message root (`attachedToRoot: true`) with an
    `ASTM_RECORD_ORPHAN_COMMENT` warning, **never silently dropped**. New extractors `comments(msg)` /
    `commentsFor(msg, record)` / `orders(msg)`, and the pure `attachComments()` attachment pass.
  - **Comment-type codes are `[OSS-derived]`.** `I` (instrument) is the only value seen in the
    permissively-licensed real transcripts; `G`/`T`/`P` are defined only in the paywalled CLSI LIS02-A2
    and are **not** interpreted, `commentType` is surfaced raw, never mapped to a guessed meaning.
  - **Partial-timestamp hardening.** A `YYYYMMDDHHMMSS` value with an odd digit run that truncates a
    two-digit component (lengths 5/7/9/11/13) sets `AstmDate.truncated`, is preserved verbatim in `raw`,
    and stops at the last **complete** component: the dangling digit is **never zero-filled into a
    fabricated time**. A caller surfaces this as a value-free `ASTM_RECORD_PARTIAL_TIMESTAMP` warning
    (P field 8, R fields 12/13). No timezone is modeled: times stay instrument-local, never assumed UTC.
  - New warning codes (registry extended, snapshot locked): `ASTM_RECORD_ORPHAN_COMMENT`,
    `ASTM_RECORD_PARTIAL_TIMESTAMP`, value-free (code + record/field index only).
  - `scripts/phi-scan.ts` extended toward the mother's-maiden locus (P field 7), on top of the existing
    name (field 6) + DOB (field 8) detection; synthetic fixtures declared in `scripts/phi-allow-list.txt`.
- **Query (`Q`) + host-query flow + `M`/`S` surfaced verbatim (ASTM-4, roadmap Phase 4).** Completes the
  record grammar: **the record-content layer is now feature-complete.**
  - **The `Q` (Request Information) record.** Modeled at the public ASTM E1394 field positions:
    `startingRangeId` (field 3) and `endingRangeId` (field 4) surfaced as the **full verbatim field**
    (never truncated to a component), the Universal Test ID (field 5, same caret structure as `O`/`R`),
    and `requestInformationStatus` (field 13) surfaced **verbatim**. The range component structure, the
    `ALL` universal-query keyword (`queriesAllTests`), and the request-information status code set are
    all **`[OSS-derived / paywalled]`** (roadmap §10 Q3): surfaced, flagged, and **never interpreted or
    guessed**. New `query(msg)` extractor.
  - **The host-query flow.** Every message is classified up front (`msg.classification`): an `H/P/Q/L`
    **request** is `host-query`, an `R`-bearing message is `results`, an `O`-only message is `orders`,
    else `indeterminate`. **Fail-safe:** the `Q` **dominates**, a `Q`-bearing message is a request and
    is **never** read as a result set, even when a result record is also present (a contradiction flagged
    with `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND`). Gate on `classification.isHostQueryRequest`. Pure
    `classifyMessage(records)` exported.
  - **`M` (manufacturer) + `S` (scientific) records surfaced verbatim.** Vendor-defined free-form
    QC / calibration / maintenance data, preserved byte-for-byte on `record.rawLine` and **never**
    interpreted into typed clinical fields: a QC value can never be read as a patient result. Round-trip
    byte-identical.
  - New warning codes (registry extended, snapshot locked): `ASTM_RECORD_UNINTERPRETED_QUERY_STATUS`
    (a Q request-information status surfaced verbatim; the code set is paywalled, so it is passed through
    uninterpreted) and `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND`, both value-free (code + position only).
  - `AstmMessage` gains a `classification` field; `AstmRecord` gains `QueryRecord` / `ManufacturerRecord`
    / `ScientificRecord` members (an unknown type letter is still an `UnsupportedRecord`, never dropped).
- **E1381/CLSI-LIS01 frame codec (ASTM-5, roadmap Phase 5).** The **low-level framing layer** begins:
  a separate, independent layer from the record layer, sharing only the payload boundary. `src/frames/`
  decodes a framed byte stream into frames + reassembled record bytes; `src/common/` and `src/records/`
  are untouched.
  - `decodeAstmFrames(bytes, opts?)` → `{ records: readonly Uint8Array[]; frames: readonly AstmFrame[];
warnings: readonly AstmFrameWarning[] }`. A frame is `<STX> FN text <ETB|ETX> CS <CR><LF>`.
  - **Modulo-256 checksum** over the bytes after `STX` up to and **including** the `ETB`/`ETX`
    terminator, two hex chars: **verified on decode, emitted uppercase, accepted lowercase** (a real
    vendor quirk). `computeChecksum` / `toChecksumHex` / `parseChecksumHex` exported.
  - **Frame-number `0`–`7` sequencing** (rolls over `7 → 0 → 1`, starts at `1`) and **multi-frame record
    reassembly**: text is capped at **240 bytes** (the seven control bytes are **not** counted), `ETB`
    is intermediate / `ETX` final. `parseFramedAstm(bytes, opts?)` composes the framing and record layers
    at the edge (decode → reassemble trusted records → `parseAstmRecords`).
  - **Fail-safe (byte-level, safety-critical):** a **checksum mismatch** surfaces the frame flagged
    `trusted: false` and **never merges** it into a record (default warn in lenient / thrown in strict,
    the "checksums are routinely not validated" claim was _refuted_: we validate); a **frame-number gap**
    warns and is **never silently bridged**; an **unterminated** frame surfaces the partial bytes
    untrusted and **invents no partial record**; an **oversize** (>240) frame is flagged, never dropped.
  - New `ASTM_FRAME_*` warning registry (a **second** registry alongside `ASTM_RECORD_*`, sharing only
    the `EMPTY_INPUT` fatal; snapshot locked): `ASTM_FRAME_BAD_CHECKSUM`, `ASTM_FRAME_SEQUENCE_GAP`,
    `ASTM_FRAME_UNTERMINATED`, `ASTM_FRAME_OVERSIZE`, every warning **value-free**, carrying a **frame
    number + byte offset** only, never the record bytes a frame holds. `{ strict: true }` throws
    `AstmFrameStrictError`.
  - **Fuzz gate (required, part of `verify`):** a `fast-check` target over the codec, arbitrary /
    truncated / mixed / control-char-laden bytes never crash, hang, or OOM; they degrade to a typed
    error or a value-free warning. Plus property tests: N-frame reassembly equals the single-frame form,
    and every trusted frame's recomputed checksum matches its declared value.
  - New types/exports: `AstmFrame`, `FrameChecksum`, `FrameTerminator`, `FrameOptions`,
    `DecodeAstmFramesResult`, `FramedAstmResult`, `AstmFramePosition`, `AstmFrameWarning`,
    `FrameWarningCode`, `FRAME_WARNING_CODES`.
- **Transport variants + pure LTP protocol reducer (ASTM-6, roadmap Phase 6).** The **LTP protocol
  layer**, `src/ltp/`, sits above the frame codec: transport auto-detection plus a deterministic,
  socket-free session state machine. No live I/O: the consumer owns the wire and clock; this layer
  decides.
  - **Transport auto-detection.** `detectFraming(bytes, opts?)` → `{ framing: "framed" | "raw";
defaulted: boolean; warnings }`. A leading `STX`/`ENQ` ⇒ **framed** (serial, and the cobas 4800 /
    iNTERFACEWARE Iguana framed-over-TCP reality); a leading bare record letter (`H`/`P`/`O`/`R`/`C`/
    `Q`/`M`/`S`/`L`) ⇒ **raw** (the cobas b121 raw-TCP reality, framing dropped, records streamed
    directly). An unrecognizable lead **defaults to framed and warns**
    (`ASTM_LTP_AMBIGUOUS_TRANSPORT`), never guessing silently into data loss; an `override` forces the
    mode (the Phase-8 profile hook).
  - **Pure receiver-side reducer.** `ltpReduce(state, event)` → `{ state, actions, warnings }`, seeded
    by `ltpInitialState()`. Events are the four LTP control signals (`enq`/`ack`/`nak`/`eot`) plus a
    codec-decoded `frame`; actions are `sendAck` / `sendNak` / `sendEot` / `deliverRecord`. It models
    the LIS01-A2 establishment → transfer → termination phases as `neutral ⇄ transfer`, reassembling
    `ETB…ETX` runs into delivered records and tracking the `0`–`7` frame sequence.
  - **ACK-failsafe (safety-critical, borrowed from `mllp`).** A frame the codec did not vouch for (a
    **bad checksum**, an **unterminated** frame, or one **out of sequence**) is answered with `NAK`,
    **never** a fabricated positive `ACK`, and its bytes are **never** appended to a record or
    delivered. A `NAK` drives **retransmit, not acceptance** (`ASTM_LTP_FRAME_REJECTED`). A duplicate
    of the last-accepted frame is idempotently re-`ACK`ed without re-appending; a partial record open
    on an `EOT` or `ENQ` restart is discarded, never delivered as if whole.
  - New `ASTM_LTP_*` warning registry (a **third** registry alongside `ASTM_RECORD_*` / `ASTM_FRAME_*`;
    value-free, carrying at most a frame number): `ASTM_LTP_AMBIGUOUS_TRANSPORT`,
    `ASTM_LTP_UNEXPECTED_EVENT`, `ASTM_LTP_FRAME_REJECTED`.
  - Property tests: the reducer **never emits `ACK` after an untrusted frame**; a full `ENQ → frames →
EOT` session **reassembles exactly the source records**; a **raw-TCP stream equals its framed
    twin**. Plus the transport-control control bytes `ASTM_ENQ` / `ASTM_ACK` / `ASTM_NAK` / `ASTM_EOT`.
  - New types/exports: `detectFraming`, `AstmFraming`, `DetectFramingOptions`, `DetectFramingResult`,
    `ltpInitialState`, `ltpReduce`, `LtpPhase`, `LtpState`, `LtpEvent`, `LtpAction`, `LtpTransition`,
    `AstmLtpWarning`, `LtpWarningCode`, `LTP_WARNING_CODES`, `ltpAmbiguousTransport`,
    `ltpUnexpectedEvent`, `ltpFrameRejected`.
- **Spec-clean serializers + builders, both layers (ASTM-7, roadmap Phase 7).** The **emit** side: the
  conservative inverse of the parser and the frame codec, so **round-trip fidelity holds by
  construction**. Postel's Law's second half: liberal on parse, strict on emit.
  - **Record serializer.** `serializeAstmRecords(msg | records)` and `serializeAstmRecord(record)` emit a
    `CR`-terminated stream with the **canonical** `H|\^&` delimiters and every embedded delimiter
    re-escaped. `encodeComponent()` is the exact inverse of the Phase-1 escape codec. The escape char is
    encoded **first** (`&` → `&E&`), then the field / component / repeat delimiters (`&F&`/`&S&`/`&R&`),
    so a value containing a delimiter (a titre `1^40` → `1&S&40`) can never break framing and reads back
    as **one** component. A source parsed with **non-canonical** delimiters is **normalized** to the
    canonical set on emit (vendor-delimiter round-tripping is a Phase-8 profile concern). The header's
    delimiter declaration is emitted **literally** (never escaped); `M`/`S` records are re-emitted
    **byte-identically** from `rawLine`.
  - **Message builder.** `buildAstmMessage(input)` constructs a spec-clean stream from typed input under
    the **never-fabricate** discipline: it emits **only** the values the caller supplied, an omitted
    field is left empty, **never a defaulted clinical value** (an unset result status reads back as
    `unspecified`, never `final`; units / abnormal flags / patient IDs are never defaulted). The
    **structure** (record type letters, the canonical delimiter declaration, per-record-type sequence
    counters, the `L` terminator) is **computed, not guessed** (a sequence number may be overridden).
  - **Frame encoder.** `composeAstmFrames(records, opts?)` is the exact inverse of `decodeAstmFrames`:
    it wraps reassembled record bytes into `<STX> FN text <ETB|ETX> CS <CR><LF>` frames with the
    modulo-256 **checksum** and the `0`–`7` **frame number** **computed** (never accepted-as-given or
    faked; emitted uppercase), numbered continuously across the stream (start `1`, roll over `7 → 0`),
    and every record over **240** text bytes **split** `ETB…ETX` (the seven control bytes never counted).
    `serializeFramedAstm(msg | records)` composes both emit layers at the edge: the mirror of
    `parseFramedAstm`.
  - **Framing-integrity guards (typed errors, conservative emit).** A value carrying a `CR`/`LF`, which
    no ASTM escape can encode, is refused with an `AstmSerializeError` (`ASTM_EMIT_UNENCODABLE_VALUE`)
    rather than emitted into a corrupted wire; an empty record or empty record list is an
    `AstmFrameEncodeError` (`ASTM_FRAME_EMPTY_RECORD`), never an empty frame.
  - **Round-trip proven.** The shared archetype `roundTripProperty` is now **live** (serialize is the
    idempotent inverse of parse); Tier-3 golden files round-trip every synthetic fixture through both the
    record and framing layers (structural equality of the decoded field tree, zero frame warnings); and
    `decodeAstmFrames(composeAstmFrames(x)).records ≡ x`.
  - `HeaderRecord` gains an additive `rawLine` field (the escape char living inside the `\^&` definition
    defeats the generic escape-aware tokenizer, so the raw header is the reliable source for both
    delimiter reading and re-serialization). New exports: `serializeAstmRecords`, `serializeAstmRecord`,
    `serializeField`, `encodeComponent`, `AstmSerializeError`, `buildAstmMessage` (+ `AstmRecordInput`,
    `MessageInput`, `HeaderInput`, `PatientInput`, `PatientNameInput`, `OrderInput`, `ResultInput`,
    `CommentInput`, `QueryInput`, `VerbatimInput`), `composeAstmFrames`, `AstmFrameEncodeError`,
    `ComposeFramesOptions`, `serializeFramedAstm`.
- **Vendor profile system, engine + registry + quirk tolerance + definition-time safety gate
  (ASTM-8, roadmap Phase 8).** `src/profiles/` mirrors the sibling `@cosyte/hl7` `defineProfile` /
  `@cosyte/ccda` `defineCcdaProfile` shape: `name` / `lineage` / `describe()` / `extends`-merge, a
  provenance-backed built-in registry, a runtime tolerance transform, and a definition-time safety gate.
  - `defineAstmProfile(opts)` builds a frozen, immutable profile declaring the **non-safety-critical**
    warning codes a class of streams is expected to trip (each with a grounded `rationale`), plus an
    optional `transport` override (`"framed"`/`"raw"`): the raw-vs-framed-TCP knob a consumer feeds to
    `detectFraming(bytes, { override })` for a stream whose leading byte would auto-detect the wrong way.
  - **A profile never alters an extracted value.** The transform (`applyAstmProfileToWarnings`, run last
    in `parseAstmRecords`) only ever re-badges a warning it _expects_ to the new `PROFILE_QUIRK_APPLIED`
    code (flagged `expected: true`, carrying the original `toleratedCode` and position), Postel's Law
    with a receipt: nothing is dropped, and a spec-clean message parses byte-identically with or without
    a profile.
  - **The safety gate is default-deny and total.** Only four benign, value-preserving record codes are
    tolerable (`ASTM_RECORD_UNKNOWN_TYPE`, `ASTM_NONSTANDARD_DELIMITERS`, `ASTM_UNKNOWN_ESCAPE_SEQUENCE`,
    `ASTM_RECORD_UNINTERPRETED_QUERY_STATUS`); **every other code across all three registries (record,
    frame `ASTM_FRAME_*`, and LTP `ASTM_LTP_*`) is safety-critical and refused at definition time**
    with an `AstmProfileDefinitionError`. A profile therefore can never make a bad checksum "ok," a
    cancelled result read "final," or quiet a wrong value / flag / status / range / units / patient or
    comment context / message-kind ambiguity. Any warning code added in a future phase is
    safety-critical **by default** until deliberately added to the allow-list.
  - `parseAstmRecords(raw, { profile })` accepts an explicit profile; `{ profile: null }` opts out of
    the process-scoped default (`setDefaultAstmProfile`); an `expected` quirk does **not** escalate in
    `strict` mode. `AstmMessage` gains an additive `profile?: { name, lineage }` attribution.
  - **Built-ins:** `astmProfiles.default` (tolerates nothing) + `astmProfiles.referenceCorpus`, a
    **non-vendor**, evidence-backed profile grounded firsthand in the redistributable OSS reference
    corpus (`kxepal/python-astm` `codec.py` (BSD) + `senaite.astm`, which split on raw delimiters and
    never un-escape `&F&`/`&S&`/`&R&`/`&E&`), tolerating only the resulting non-standard-escape
    _syntactic_ noise (the value is preserved byte-for-byte). **Named per-vendor profiles**
    (cobas / Sysmex / …) are **deferred** (`REAL-CORPUS`): the engine fully supports them, but no public
    vendor-attributed quirk document grounds a named one.
  - New warning code `PROFILE_QUIRK_APPLIED` (record registry). New exports: `defineAstmProfile`,
    `AstmProfileDefinitionError`, `astmProfiles`, `getAstmProfile`, `listAstmProfiles`,
    `setDefaultAstmProfile`, `getDefaultAstmProfile`, `applyAstmProfile`, `applyAstmProfileToWarnings`,
    `resolveProfileTransport`, `profileQuirkApplied`, `SAFETY_CRITICAL_CODES`, `TOLERABLE_CODES`,
    `ALL_ASTM_WARNING_CODES`, `isSafetyCriticalCode`, and the `AstmProfile`, `DefineAstmProfileOptions`,
    `AstmQuirkTolerance`, `AstmQuirkMatch`, `AstmProfileProvenance`, `AnyAstmWarningCode` types.
- **LIVD-aware LOINC recognition: bring-your-own catalog, zero bundled terminology data (ASTM-9,
  roadmap Phase 9).** The `src/terminology/` layer maps an analyzer's local test code (the Universal
  Test ID's vendor/local code on `R`/`O` records) to a standard LOINC via a **consumer-supplied** IICC
  LIVD ("LOINC to Vendor IVD") catalog: **additive, advisory, and never a guessed LOINC** (a wrong
  LOINC mis-identifies a test).
  - `defineLivdCatalog(entries)` builds an immutable, frozen catalog indexed by the **Vendor Analyte
    Code** (the vendor transmission code the instrument sends), grounded firsthand on the IICC LIVD
    digital format / HL7 LIVD IG; `catalog.lookup(code)` returns `mapped` (one LOINC), `unmapped` (a
    miss), or `ambiguous` (a code matching more than one distinct LOINC, surfaced, **never resolved**).
  - `applyLivd(msg, catalog)` produces a **separate** layer of per-`R`/`O` `LivdAnnotation`s and never
    mutates, alters, or drops the raw reported code/value; a catalog hit is labeled `derived: true`
    (`source: "livd"`), an inline LOINC already on the wire is surfaced `source: "wire"` (never
    overwritten by the catalog), and a miss/conflict is `unmapped`/`ambiguous` with a **value-free**
    warning, a LOINC is **never** fabricated. `lookupLivdForRecord(record, catalog)` annotates one
    record.
  - **No LOINC / SNOMED / LIVD data is bundled** (roadmap §5). Firsthand: LOINC is © Regenstrief,
    redistributable only _with its attribution notice_, not public-domain; and the public CDC LIVD file
    is a **SARS-CoV-2-specific** publication that also carries separately-licensed SNOMED CT, not a
    general-analyte, public-domain catalog. The package stays a structural recognizer, not a dictionary:
    the consumer supplies the LIVD data (and owns its license obligations).
  - New `ASTM_LIVD_*` warning registry (`ASTM_LIVD_UNMAPPED_CODE`, `ASTM_LIVD_AMBIGUOUS_MAPPING`): a
    fourth, self-contained registry, deliberately outside the profile safety gate's universe (a LIVD
    non-mapping is a post-parse advisory, not a parse-time deviation a profile could tolerate). New
    exports: `defineLivdCatalog`, `applyLivd`, `lookupLivdForRecord`, `LIVD_WARNING_CODES`,
    `livdUnmappedCode`, `livdAmbiguousMapping`, and the `LivdCatalog`, `LivdEntry`, `LivdLookup`,
    `LivdAnnotation`, `LivdMapping`, `LivdResult`, `AstmLivdWarning`, `LivdWarningCode` types.
- **Release hardening (ASTM-10, roadmap Phase 10, the final phase).** Publish-readiness for the now
  feature-complete parser: coverage, fuzz, firsthand differential testing, the full docs spine, and a
  proven release shape. No new runtime API.
  - **Differential conformance vs [python-astm][pa]** (BSD-3-Clause reference codec, commit
    `4170ce0c`), grounded **firsthand** in `test/differential/`: outputs captured once from the
    reference (`generate-reference-vectors.py` → `reference-vectors.json`; **no reference code
    vendored**), then asserted against `@cosyte/astm` on three shared paths, the **modulo-256
    checksum**, the **record field/component split** (escape-free, non-header), and a
    **cross-implementation frame decode** (python encodes + splits → our decoder verifies every
    checksum and reassembles the exact record bytes). The **deliberate divergences** are asserted on
    purpose: we un-escape `&F&`/`&S&`/`&R&`/`&E&` (python leaves them literal), we validate the frame
    checksum (python does not verify on decode), and we classify the `Q` host-query (python has no
    model). CI needs no Python: only the captured JSON.
  - **Per-directory ≥ 90 coverage gating extended to the whole `src/` surface**: `frames`, `ltp`,
    and `terminology` now gate per-dir alongside `common`/`records`/`profiles` (on top of the global
    gate), so the release bar holds directory by directory, not just in aggregate.
  - **Record-tokenizer fuzz** (`test/property/records-fuzz.property.test.ts`), the companion to the
    frame-codec fuzz: arbitrary / truncated / delimiter- and escape-laden input into
    `parseAstmRecords` never crashes, hangs, or OOMs; lenient mode only ever throws a sanctioned
    Tier-3 fatal, strict only `AstmStrictError`, and every warning carries a registered code. Both
    fuzz suites scale via `ASTM_FUZZ_RUNS`, driven up nightly by a scheduled **Fuzz** workflow
    (`.github/workflows/fuzz.yml`) and runnable on demand via `pnpm test:fuzz`.
  - **Publish dry-run proven release-shaped:** `attw` all-green (per-condition ESM/CJS types), a new
    `smoke` gate (`scripts/smoke.mjs`) that imports the **built** ESM and requires the **built** CJS
    entry and parses a result through each (now wired into `verify.sh`), and an `npm publish
--dry-run` pack inspection (10 files, `dist/` + `README`/`LICENSE`/`CHANGELOG`/`package.json`,
    no `src` or tests). Zero runtime dependencies; MIT.
  - **Full Diátaxis docs spine + honesty docs.** New `docs-content/limitations.md` (**What it does,
    and does not do**: no live I/O, units are verbatim free text not UCUM, no bundled terminology
    dictionary, `M`/`S` verbatim, the archived-standard status, and the MIT-vs-CLSI license posture)
    and `docs-content/architecture.md` (the two independent layers and their payload boundary); the
    **Guides** page is now real how-to recipes (was a placeholder), and the intro / troubleshooting /
    concepts status blocks are refreshed to the feature-complete state. Every ` ```ts runnable `
    example is executed by the doc/code-agreement gate.

[pa]: https://github.com/kxepal/python-astm

### Changed

- **Breaking (pre-alpha):** the archetype stub `parseAstm` / `ParsedAstm` is replaced by
  `parseAstmRecords` / `AstmMessage`; the placeholder `WARNING_CODES` / `FATAL_CODES` entries are
  replaced by the real Phase-1 registries.

### Deferred (later phases)

- **Named per-vendor profiles** (cobas / Sysmex / ADVIA / Mindray / Snibe) stay `REAL-CORPUS`-gated:
  the Phase-8 engine supports them (tolerate + transport override), but no public vendor-attributed
  quirk document grounds a named one. **No bundled terminology
  dictionary**: LIVD-aware LOINC recognition is bring-your-own by design (Phase 9); the package ships
  no LOINC / SNOMED / LIVD data and mapping quality is the consumer's catalog. The LTP reducer remains
  a pure state machine, no live I/O: wiring it to a real `SerialPort`/`net.Socket` (and the
  interactive contention/timeout/retransmit **timing**) is a thin consumer adapter, and the standard's
  exact numeric timeouts / retry counts are deferred (we model transitions, not timers).

[Unreleased]: https://github.com/cosyte/astm/commits/main
[0.0.2]: https://github.com/cosyte/astm/releases/tag/v0.0.2
[0.0.1]: https://github.com/cosyte/astm/releases/tag/v0.0.1
