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

The fatal-error taxonomy had the same problem in the other direction: `FATAL_CODES`
documented itself as later growing the frame codec's own `ASTM_FRAME_*` fatals. The frame
codec adds no fatal code at all -- `ASTM_FRAME_*` is the warning registry, the frame layer
reuses `EMPTY_INPUT`, and its strict-mode rejection carries the rejected warnings rather
than a `code` -- so a consumer narrowing on `err.code` was told to expect values that can
never be produced.

Every affected block now describes what the code does. No runtime behaviour, export, type
or warning code changes.
