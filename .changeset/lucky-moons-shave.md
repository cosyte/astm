---
"@cosyte/astm": patch
---

Report a field boundary the reading may have gained, and stop telling a full-length header that it is
too short.

`ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT` fires when the escape character that closed an unrecognized
escape sequence could instead have opened one whose body is the delimiter that split, so the same
bytes carry two alignments disagreeing by exactly one field, repeat or component boundary. On the
canonical set, `R|1|^^^687|28.6&Z&|&U/L||||F` reads a value of `28.6&Z&` and units of `&U/L` under
the leftmost alignment, and reads as one unsplit field carrying both under the other.

This is the mirror of `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` and the more dangerous half. That
code reports a boundary the reading lost; this one reports a boundary the reading may have gained,
which hands a consumer a value and a units string the sender's bytes do not unambiguously carry. Both
codes the condition raised before (`ASTM_UNKNOWN_ESCAPE_SEQUENCE` and
`ASTM_UNPAIRED_ESCAPE_CHARACTER`) may be tolerated by a profile, so a strict parse under one accepted
the altered reading. Both stay tolerable, because both remain true and benign of the cases that cost
nothing.

The change is additive and the split is unchanged. The leftmost alignment is still the one taken and
every decoded byte is identical: taking the other alignment would be a different guess with no more
evidence behind it. Two exclusions are deliberate, and the first is wider than the argument for it.
A recognized mnemonic before the delimiter raises nothing, because the reading taken interprets a
construct while the competitor's body is a delimiter character the codec usually cannot interpret, so
its own vocabulary prefers the reading taken. That is not the same as the reading taken being
conformant: `28.6&F&|&U/L` reads a value of `28.6|` and units of `&U/L` while raising only a tolerable
code, and a declared set naming a mnemonic letter as a splitting delimiter leaves both alignments
interpreting one construct each with neither preferred. Both are measured and left open rather than
closed by widening the test, because covering them means a different criterion, and swapping criteria
moves which streams a published package refuses. The other exclusion is a delimiter with no escape
character two positions past it, which raises nothing because there is no competing alignment. What
does fire is a subset of the records that already raise `ASTM_UNKNOWN_ESCAPE_SEQUENCE`.

Measured on the strict-accepted-under-a-gate-legal-profile tier, because a warning-free read is
structurally unreachable for anything that could exhibit this. Against corpus constants committed
with the tests: over twelve characters swept in both positions of the deciding pair, 24 of 144 tuples
raise the new code, and under a profile built from the whole tolerable allow-list, which is the widest
a gate-legal profile can be, 108 of 144 were strict-accepted before against 93 now. The fire count and
the acceptance delta are not the same number: 9 of the 24 were already refused by
`ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`.

It repairs nothing, and it does not survive a re-emit: the serializer rewrites the preserved
characters into recognized mnemonics, and that stream carries the alignment that was taken with no
competitor left in it, so a second-generation read is silent and correct about its own bytes. Catch
it on the first read of the wire bytes.

Separately, a header that cannot declare a delimiter set now says which of four reasons it hit.
`H||^&` is a full-length header whose delimiter-definition field is empty because its own field
separator ends the definition where it begins, and it reported "Header record is too short to declare
the four delimiters". The fatal code is unchanged and no stream's disposition moved; only the
sentence a human reads did.

New public surface: `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT`, the `ambiguousEscapeAlignment` warning
factory, the `AmbiguousAlignmentSink` type, a trailing optional sink parameter on `splitEscapeAware`,
`tokenizeRecord` and `tokenizeHeader`, `readDelimiterDeclaration`, and the
`DelimiterDeclarationFault` type.
