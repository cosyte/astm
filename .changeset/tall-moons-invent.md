---
"@cosyte/astm": patch
---

Close the two emit-side gaps where a stream went out that could not be read back.

**A delimiter declaration longer than three characters no longer loses its extra bytes.** Only three
characters of a header's declaration carry a role — repeat, component and escape, taken by position —
and a declaration that carries more is read for those three and the surplus ignored. Emit regenerated
the declaration from the three roles alone, so the surplus was dropped with no signal and a header
that arrived as `H|\^&#` went back out as `H|\^&`. The surplus is now carried through, which makes
that round-trip byte-exact. What those extra bytes mean is still unresolved, so carrying them
unchanged is deliberately a smaller claim than deleting them. They are dropped only where they could
not be read back as surplus: when the header is being emitted into a different delimiter set (the
surplus belonged to the declaration being replaced), or when they contain the field separator or a
record terminator, either of which would end the declaration early and shift every data field along.

**A delimiter set passed to `serializeAstmRecords`, `serializeAstmRecord`, `serializeField` or
`encodeComponent` is now checked before any bytes are written.** Each of the four separators must be
exactly one character, none may be a `CR`/`LF`, and no two may be the same character. A set that
fails is an `AstmSerializeError` with the new code `ASTM_EMIT_INVALID_DELIMITERS`; the error names the
role at fault and never echoes the offending characters, since a value that fails the one-character
rule can be arbitrary text. Previously none of this was checked, and the result was measured rather
than assumed: some malformed sets produced a stream this library's own parser then rejected outright,
and others — two roles sharing a character, an empty escape — produced one it re-read with a
different field tree and no warning at all, which is a lost result or a lost identifier on the
analyzer-to-LIS path. Emit returns a plain string and has no warning channel, so refusing at the call
is the only disposition that reaches the caller.

What changes for a consumer: nothing at all for the default canonical set, or for any well-formed
delimiter set. A `>3`-character declaration now survives a round-trip in its own set instead of being
truncated. Calls that passed a malformed set now throw where they previously returned unreadable
bytes — and because the reader tolerates a few declarations that cannot be reversed, asking for a
message back in its own set (`serializeAstmRecords(msg, msg.delimiters)`) can now refuse a message
that parsed. That is a deliberate narrowing: the input it turns away is exactly the input it was
corrupting. `AstmSerializeError.code` is now a union of two codes rather than a single literal, and
the union is exported as `AstmSerializeErrorCode`.
