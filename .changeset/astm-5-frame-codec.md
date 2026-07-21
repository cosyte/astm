---
"@cosyte/astm": patch
---

E1381/CLSI-LIS01 frame codec (ASTM-5, roadmap Phase 5) — the low-level **framing** layer begins, a
separate, independent layer from the record layer that shares only the payload boundary.
`decodeAstmFrames(bytes, opts?)` decodes a framed byte stream (`<STX> FN text <ETB|ETX> CS <CR><LF>`)
into `{ records, frames, warnings }`: it **verifies the modulo-256 checksum** (the span runs from the
byte after `STX` up to and **including** the `ETB`/`ETX` terminator, two hex chars — emitted uppercase,
**accepted lowercase** per a real-vendor quirk), tracks **frame-number `0`–`7` sequencing** (rolls over
`7 → 0 → 1`, starts at `1`), and **reassembles** the 240-byte-limited multi-frame records (`ETB`
intermediate / `ETX` final; the seven control bytes are not counted toward the 240). `parseFramedAstm`
composes the framing and record layers at the edge. **Fail-safe, byte-level:** a checksum mismatch
surfaces the frame flagged `trusted: false` and **never merges** it into a record (warn in lenient /
thrown in strict — the "checksums are routinely not validated" claim was refuted; we validate); a
frame-number gap warns and is **never silently bridged**; an unterminated frame surfaces the partial
bytes untrusted and invents no partial record; an oversize (>240) frame is flagged, never dropped.
Adds the `ASTM_FRAME_*` warning registry (a second registry alongside `ASTM_RECORD_*`, sharing only the
`EMPTY_INPUT` fatal; snapshot locked): `ASTM_FRAME_BAD_CHECKSUM`, `ASTM_FRAME_SEQUENCE_GAP`,
`ASTM_FRAME_UNTERMINATED`, `ASTM_FRAME_OVERSIZE` — every warning value-free (frame number + byte offset
only, never the record bytes). New exports: `decodeAstmFrames`, `parseFramedAstm`, `computeChecksum` /
`toChecksumHex` / `parseChecksumHex`, `AstmFrameStrictError`, `FRAME_WARNING_CODES`, and the
`AstmFrame` / `FrameChecksum` / `FrameTerminator` / `FrameOptions` / `DecodeAstmFramesResult` /
`FramedAstmResult` / `AstmFramePosition` / `AstmFrameWarning` / `FrameWarningCode` types. A required
`fast-check` **fuzz** target over the codec is part of `verify`: arbitrary / truncated / mixed /
control-char-laden bytes never crash, hang, or OOM — they degrade to a typed error or warning. The
interactive LTP reducer (`ENQ`/`ACK`/`NAK`/`EOT`, P6) and serialize/build (P7) remain deferred; the
codec decodes byte streams only, no live I/O.
