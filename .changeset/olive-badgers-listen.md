---
"@cosyte/astm": patch
---

Stop pairing one patient's results with another's, and add `messages()` to read a stream as the sequence of messages it actually is.

**This release is breaking for callers of `patient()`, `results()`, `orders()`, `comments()`, and
`query()` on a stream that carries more than one message — and that break is the fix, not a cost of
it.**

A parsed model has always been a whole record **stream**, and a stream may carry several messages
back to back: a message runs from an `H` header to its `L` terminator. Those five accessors read the
whole stream. So on a multi-message stream `patient()` answered with the **first** `P` in the stream
while `results()` answered with **every** `R` in it, and pairing them — exactly what this package's
one-line north star does — attributed one patient's results to another. It needed no delimiter
redeclaration and no unusual delimiters: an ordinary two-message stream in one canonical delimiter
set reproduced it, with **zero** warnings, and `strict` mode raised no objection either. On an
analyzer-to-LIS path that is a result filed against the wrong patient. Nothing was mis-_read_ — every
`P` and every `R` was correct in `records` — but there was no way to ask which of them belonged
together.

`messages(msg)` is that way. It splits a parsed stream into the messages it contains and returns a
readonly array, each entry carrying only its own records:

```ts
for (const m of messages(parseAstmRecords(raw))) {
  m.patient; // the P for THIS message
  m.results; // the Rs for THIS message
}
```

Each entry also carries `index`, `header`, `delimiters`, `records`, `patients`, `orders`, `comments`,
and `queries`. It never throws, and a single-message stream yields exactly one entry, so it is safe
to reach for unconditionally. A message opens at every `H`, which is deliberately the same boundary
the parser already uses to scope delimiters, so `m.delimiters` is the set that message's records were
actually read with and the two scopes cannot disagree. Grouping is total: every record of the stream
lands in exactly one message, none duplicated and none lost.

The five flat accessors now throw `AstmAmbiguousStreamError` (`ASTM_AMBIGUOUS_MULTI_MESSAGE`) rather
than answering across patients. `patient()` additionally throws `ASTM_AMBIGUOUS_MULTI_PATIENT` when
the single message it is reading carries more than one `P`, which is the same harm one level down:
"the first `P`" is a guess about whose result it is, and this parser does not guess. `m.patient` on a
message view follows the same rule — the single `P` when there is exactly one, `undefined` when there
are none or several, with `patients` carrying all of them. The error carries a stable code, a
value-free position, and two counts; never an identifier, never a value.

The population this break affects is precisely the population being silently corrupted today. A
caller who now gets an exception is strictly better off than one who quietly received another
patient's results: the failure is loud, immediate, positioned, and correctable, where before it was
invisible at every layer, including `strict`. Migrating is mechanical — walk `messages(msg)` and read
each message's own `patient` and `results`; a caller who genuinely wants every result in a stream
regardless of whose it is writes `messages(msg).flatMap((m) => m.results)`, so that becomes a choice
rather than a default.

On grounding: CLSI LIS02-A2 §2 is definitional about the unit itself, bounding a message by the `H`
record at one end and the `L` record at the other, and that is the whole of what is claimed from the
standard here. Which record _opens_ a new scope partway through a stream is not settled there, so
that part is a reasoned choice rather than a citation. Within-message patient scoping stays
unmodeled because the clauses that would ground it are paywalled; multi-patient messages are real, so
that is a deferral with a known shape rather than a claim the case does not arise.

Single-message streams are unaffected and behave exactly as before, including a message carrying no
`P` at all: `patient()` still answers `undefined` for a result-only upload, which is an ordinary
shape and not an error. `commentsFor()` is unchanged and works on any stream, because the parent
record it is handed already names the message.
