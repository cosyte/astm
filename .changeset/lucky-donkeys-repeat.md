---
"@cosyte/astm": patch
---

Correct the API documentation a consumer's editor shows, and stop it going stale.

The type documentation shipped in `dist/index.d.ts` described capabilities as unavailable
that this package has shipped for some time. The package entry point ended with
"Serialize/build is deferred" while `serializeAstmRecords`, `buildAstmMessage`,
`composeAstmFrames` and `serializeFramedAstm` were all exported; `AstmMessage` said only
`H`/`P`/`O`/`R`/`L` records were modeled and that comment, query, `M`/`S`, framing and
serialization were still to come, when all of them are modeled today. Those sentences were
what an editor rendered on hover and what the published declaration files carried, so the
documentation understated the library to the people reading it.

The fatal-error taxonomy had a related problem: `FATAL_CODES` documented itself as
later growing the frame codec's own `ASTM_FRAME_*` fatals. `FatalCode` is a closed
three-value union and the frame codec does not widen it -- it reuses `EMPTY_INPUT`, and
its own thrown errors are separate types: `AstmFrameEncodeError` carries its own
`ASTM_FRAME_EMPTY_RECORD` code, and `AstmFrameStrictError` carries the rejected warnings
rather than a `code` at all. Narrowing an `AstmParseError` on `code` will only ever see
one of the three, and the documentation now says so.

The serializer's round-trip note also now names what does **not** round-trip: `M`/`S`
records are re-emitted byte-for-byte from their preserved raw line, so a non-canonical
`M`/`S` row keeps its original delimiters and does not come back as separate fields.

Every affected block now describes what the code does. No runtime behaviour, export, type
or warning code changes.
