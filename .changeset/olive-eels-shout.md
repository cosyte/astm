---
"@cosyte/astm": patch
---

Report two readings the parser could not defend, with two new parse-path warning codes that no
profile may tolerate.

`ASTM_RECORD_DELIMITER_ROLE_COLLISION` fires when an `H` record declares one character in two of the
repeat, component and escape roles, so the boundary between those two roles is not in the bytes. The
declaration is still honored and no record is dropped, but under `H|^^&` a field a canonical sender
would have written as two repeats of two components reads back as four repeats of one component
each, and emit has always refused such a set with `ASTM_EMIT_INVALID_DELIMITERS`.

`ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` fires when an unrecognized escape body is itself one of
the three splitting delimiters in force, so the opaque-atom rule kept it out of the split:
`R|1|^^^687|28.6&|&U/L||||F` reads a value of `28.6&|&U/L`, with no units and status `unspecified`
rather than `final`.

Both are additive. No warning code was removed or renamed, no split changed, and every extracted
value is byte-identical to what it was: `ASTM_UNKNOWN_ESCAPE_SEQUENCE` still fires and is still
tolerable. What changed is that each condition previously raised **only** a tolerable code
(`ASTM_NONSTANDARD_DELIMITERS` in the first case, since a colliding set is always non-canonical),
so a profile expecting ordinary vendor noise left `{ strict: true }` accepting the reading. That is
a narrowing on the strict path: a lenient parse returns the same records with one more warning.

New public surface: `hasCollidingRoles`, the `delimiterRoleCollision` and
`delimiterSwallowedByEscape` warning factories, the `SwallowedDelimiterSink` type, and a trailing
optional sink parameter on `decodeEscapes`, `tokenizeRecord` and `tokenizeHeader`.
