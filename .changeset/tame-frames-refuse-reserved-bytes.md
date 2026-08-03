---
"@cosyte/astm": patch
---

Refuse to frame a record carrying a raw `STX`, `ETB` or `ETX` byte, which used to truncate the frame at that byte and could lose a whole record in silence.

A frame's text ends at the first `ETB`/`ETX` after its `STX`, so one embedded in a value truncated the frame there, and the two bytes that followed were then read as that short frame's checksum. Where they matched, the truncated frame verified, the rest of the record was skipped as inter-frame bytes and the next frame number was still in sequence: measured on this package's own round trip, a comment record absorbed the following result record and a `28.6 U/L` result vanished, with an empty warnings array at both the frame and record layers. An embedded `ETB` reached the same silence the other way, by leaving the record open so the next record's text was appended to it.

`composeAstmFrames` now throws an `AstmFrameEncodeError` with the new code `ASTM_FRAME_RESERVED_BYTE`, carrying the record index and the byte's position and never the bytes themselves. Unlike the refusal beside it for characters above `U+00FF`, this one has no bytes-instead escape hatch: supplying the record as a `Uint8Array` is checked too, because framing has no escape sequence for the byte however it arrives. Remove or replace the byte in the value before framing.

The record layer is deliberately unchanged. `serializeAstmRecords` returns a string, not bytes, and in every modeled value all three bytes round-trip through parse and emit byte for byte with the value, units and status intact, so a consumer on a raw transport that never frames anything keeps a byte the sender genuinely supplied. `CR` and `LF` remain the record layer's own refusal, because they end a record. One position on a record line is not a modeled value and does not keep the byte: the surplus of a header's delimiter declaration, where any control character is dropped silently, as it was before this change.
