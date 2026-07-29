---
"@cosyte/astm": patch
---

Emit one delimiter set for the whole stream, so a round-trip no longer silently loses fields.

`serializeAstmRecords` normalized the header to the canonical `H|\^&` set but re-emitted `M`
(manufacturer) and `S` (scientific) records byte-for-byte from the wire. A message that arrived under
a vendor delimiter set therefore came out mixed — a canonical header above rows still written in the
original delimiters — and re-parsing that output collapsed every field of those rows into a single
field, with no warning. On the analyzer-to-LIS path that is a lost result or a lost specimen
identifier with no signal to the caller.

`M`/`S` are now reproduced byte-for-byte only when a reader using the emit delimiters would recover
exactly the fields the record models, and are re-encoded from their decoded fields otherwise. In the
same pass, the header is emitted from its modeled fields rather than from its preserved raw line, so
editing a header field and re-serializing now emits the edited value instead of silently keeping the
original; header fields are also tokenized correctly at parse time, where the escape character
sitting literally inside the delimiter declaration had previously caused every field after the
declaration to be merged into one. A new `tokenizeHeader` export is the header-aware counterpart to
`tokenizeRecord`.

What changes for a consumer: a stream that was already in the delimiters being emitted against — the
ordinary case, and every canonical message — is byte-identical to before. A stream carrying `M`/`S`
rows in a different delimiter set now emits those rows in the declared set instead of the original
one, which is the output that round-trips; the field values are unchanged, only the delimiters
between them. `HeaderRecord.fields` now holds the header's real fields rather than one merged field.

One more consequence worth knowing if you parse with `{ strict: true }`: because the old tokenizer
read the escape character inside the delimiter declaration as an unterminated escape, some headers
raised a spurious unknown-escape warning, which strict mode rejected. Those warnings are gone, so a
few messages that previously threw under `strict` now parse. The change is confined to the header
record; no warning on any other record is added or removed.
