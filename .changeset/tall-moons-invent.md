---
"@cosyte/astm": patch
---

Close the two emit-side gaps where a stream went out that could not be read back.

**A delimiter declaration longer than three characters no longer loses its extra bytes.** Only three
characters of a header's declaration carry a role — repeat, component and escape, taken by position —
and a declaration that carries more is read for those three and the surplus ignored. Emit regenerated
the declaration from the three roles alone, so the surplus was dropped with no signal and a header
that arrived as `H|\^&#` went back out as `H|\^&`. The surplus is now carried through, which makes
that round-trip byte-exact — on the default canonical path as much as when you pass a set explicitly,
because normalizing a message replaces the four delimiter roles and the surplus holds none of them.
What those extra bytes mean is still unresolved, so carrying them unchanged is deliberately a smaller
claim than deleting them. They are dropped only where they could not be read back as surplus: when
the header is being emitted into a different delimiter set (the surplus belonged to the declaration
being replaced), or when they contain the field separator or any control character. The control rule
is wider than the record layer alone needs, because this text also reaches the frame layer through
`serializeFramedAstm`, where `STX`/`ETX`/`ETB` are structural: a surplus carrying one truncated the
frame and dropped the entire header record — sender, receiver, control ID — behind nothing but a
checksum warning. The rule is keyed on the character while the frame layer's structure is keyed on
the low byte, so it does not catch a non-control character that truncates onto one of those; that
case fails loudly rather than silently, and the truncation itself is a separate frame-layer defect
that predates this change.

**A delimiter set passed to `serializeAstmRecords`, `serializeAstmRecord`, `serializeField` or
`encodeComponent` is now checked before any bytes are written.** Each of the four separators must be
exactly one character, none may be a `CR`/`LF`, and no two may be the same character. A set that
fails is an `AstmSerializeError` with the new code `ASTM_EMIT_INVALID_DELIMITERS` — including a set
that omits a member or holds a non-string, which JavaScript callers can pass and which previously
surfaced as a raw `TypeError`. The error names the role at fault and never echoes the offending
characters, since a value that fails the one-character rule can be arbitrary text. These three
conditions are what readback requires, not a proof of it: a set can pass all three and still read
back wrong if a separator collides with a record's type letter, which is a separate defect this
check does not claim to catch and does not change. Previously none of this was checked, and the
result was measured rather
than assumed: some malformed sets produced a stream this library's own parser then rejected outright,
and others — two roles sharing a character, an empty escape — produced one it re-read with a
different field tree and no warning at all, which is a lost result or a lost identifier on the
analyzer-to-LIS path. Emit returns a plain string and has no warning channel, so refusing at the call
is the only disposition that reaches the caller.

What changes for a consumer: nothing for a header whose declaration is the ordinary three characters,
which is every canonical message and very nearly all traffic. A declaration carrying more now
survives a round-trip instead of being truncated — on the default no-argument call as well as when
you pass a set, so if you were relying on emit to strip those bytes, it no longer does. Calls that
passed a malformed set now throw where they previously returned unreadable
bytes — and because the reader tolerates a few declarations that cannot be reversed, asking for a
message back in its own set (`serializeAstmRecords(msg, msg.delimiters)`) can now refuse a message
that parsed. That is a deliberate narrowing: the input it turns away is exactly the input it was
corrupting. `AstmSerializeError.code` is now a union of two codes rather than a single literal, and
the union is exported as `AstmSerializeErrorCode`.
