---
"@cosyte/astm": patch
---

Correct the API documentation shipped in the type declarations, and stop it going stale.

The type documentation shipped in `dist/index.d.ts` described capabilities as unavailable
that this package has shipped for some time. The entry-point module documentation ended
by calling serialize and build deferred, while `serializeAstmRecords`,
`buildAstmMessage`, `composeAstmFrames` and `serializeFramedAstm` were all exported, and
the record-types module documentation described only `H`/`P`/`O`/`R`/`L` as modeled,
naming result-flag/status semantics, comment, query, `M`/`S`, framing and serialization as
still to come, when all of them are modeled today. Both blocks ship inside the declaration files an installer receives, so the
documentation understated the library to anyone reading it there.

The fatal-error taxonomy had a related problem: `FATAL_CODES` documented itself as
later growing the frame codec's own `ASTM_FRAME_*` fatals. `FatalCode` is a closed
three-value union and the frame codec does not widen it -- it reuses `EMPTY_INPUT`, and
its own thrown errors are separate types: `AstmFrameEncodeError` carries its own
`ASTM_FRAME_EMPTY_RECORD` code, and `AstmFrameStrictError` carries the rejected warnings
rather than a `code` at all. Narrowing an `AstmParseError` on `code` will only ever see
one of the three, and the documentation now says so.

The serializer's round-trip note also now names what does **not** round-trip. `H`, `M`
and `S` are emitted from their preserved raw line rather than from the decoded field
tree, so an edit to their modeled `fields` is silently not reflected on emit -- editing
a header field and re-serializing keeps the original value, with no warning. `M`/`S`
additionally keep their original delimiters and do not come back as separate fields.

Every affected block now describes what the code does. No runtime behaviour, export, type
or warning code changes.
