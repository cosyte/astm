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

Every affected block now describes what the code does. No runtime behaviour, export, type
or warning code changes.
