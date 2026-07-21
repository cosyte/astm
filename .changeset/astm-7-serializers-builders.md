---
"@cosyte/astm": patch
---

Spec-clean serializers + builders — both layers (ASTM-7, roadmap Phase 7). The **emit** side: the
conservative inverse of the parser and the frame codec, so round-trip fidelity holds **by
construction**. `serializeAstmRecords(msg | records)` / `serializeAstmRecord(record)` emit a
`CR`-terminated stream with the **canonical** `H|\^&` delimiters, re-escaping every embedded delimiter
via `encodeComponent` — the exact inverse of the Phase-1 escape codec (escape char first, then the
field/component/repeat delimiters), so a value containing a delimiter (a titre `1^40` → `1&S&40`) can
never break framing and reads back as one component. A non-canonical source is normalized to the
canonical set (vendor-delimiter round-tripping is a Phase-8 profile concern); the header's delimiter
declaration is emitted literally (never escaped) and `M`/`S` records re-emit byte-identically from
`rawLine`. `buildAstmMessage(input)` constructs a stream from typed input under the **never-fabricate**
discipline — it emits only the values the caller supplied (an unset result status reads back
`unspecified`, never `final`; units/flags/IDs are never defaulted), while the structure (record types,
delimiter declaration, per-type sequence counters, the `L` terminator) is computed, not guessed.
`composeAstmFrames(records, opts?)` is the exact inverse of `decodeAstmFrames`: it frames reassembled
record bytes into `<STX> FN text <ETB|ETX> CS <CR><LF>` with the modulo-256 checksum and the `0`–`7`
frame number **computed, never faked** (emitted uppercase), numbered continuously (start `1`, roll over
`7 → 0`), splitting any record over **240** text bytes `ETB…ETX`; `serializeFramedAstm(msg | records)`
composes both emit layers at the edge (the mirror of `parseFramedAstm`). Two typed guards keep emit from
corrupting the wire: `AstmSerializeError` (`ASTM_EMIT_UNENCODABLE_VALUE` — a `CR`/`LF` in a value cannot
be escaped) and `AstmFrameEncodeError` (`ASTM_FRAME_EMPTY_RECORD` — an empty record/list is never an
empty frame). Round-trip is proven: the shared `roundTripProperty` is now live (serialize is the
idempotent inverse of parse), Tier-3 golden files round-trip every synthetic fixture through both
layers, and `decodeAstmFrames(composeAstmFrames(x)).records ≡ x`. `HeaderRecord` gains an additive
`rawLine` field (the escape char inside the `\^&` declaration defeats the generic escape-aware
tokenizer, so the raw header is the reliable source for re-serialization). New exports:
`serializeAstmRecords`, `serializeAstmRecord`, `serializeField`, `encodeComponent`, `AstmSerializeError`,
`buildAstmMessage` (+ the `*Input` types), `composeAstmFrames`, `AstmFrameEncodeError`,
`ComposeFramesOptions`, `serializeFramedAstm`. The vendor profile system (P8), LIVD terminology (P9), and
release hardening (P10) remain deferred.
