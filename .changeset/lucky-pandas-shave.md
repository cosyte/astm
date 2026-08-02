---
"@cosyte/astm": patch
---

Stop the frame encoder from silently writing a different character than the one it was given.

A record handed to `composeAstmFrames` as a string is one byte per character, and a character above `U+00FF` used to be truncated to its low byte. That low byte is another perfectly ordinary character, so the substitution reached the wire, checksummed clean, and read back with an empty warnings array at both layers. Measured on this package's own round trip: `28.6 μmol/L` came back as `28.6 ¼mol/L`, a name spelled with `U+0141` came back spelled with `A`, and a name spelled with `U+017C` came back split across two fields, because that code point's low byte is the field separator. The record then re-read with a different field tree, shifting a date of birth into the sex field. A round trip that quietly alters a field is the thing this library exists not to do.

`composeAstmFrames` now refuses such a character with a typed `AstmFrameEncodeError` carrying the new `ASTM_FRAME_UNENCODABLE_CHARACTER` code, the record's index and the character's position, never the character itself. `AstmFrameEncodeError.code` is now a union, exported as `AstmFrameEncodeErrorCode`.

Nothing picks a character encoding on your behalf, because nothing this library reads from an ASTM stream says which one is in use: that is out-of-band knowledge your instrument's interface document holds. To put content outside Latin-1 on the wire, encode it with the code page your instrument uses and pass the resulting `Uint8Array`, which `composeAstmFrames` accepts and writes through untouched. The refusal removes no capability, it routes you to the parameter that already carried it.

A stream whose every character is Latin-1 is byte-identical to before, the full 0 to 255 byte range included. The record layer is unchanged: `serializeAstmRecords` still returns a string, and what you encode it with stays yours to decide. This does not claim that every accepted record reads back: a record already carrying a raw `STX`, `ETX` or `ETB` byte is framed as given and re-decodes wrong, which is a separate open gap this change does not touch.

Provenance: `ASTM-FRAME-BYTE-RESIDUALS`, closing defect 7 of the known-defect list. The three remaining defects in that item are deferred with reasons recorded in `CLAUDE.md`.
