---
"@cosyte/astm": patch
---

Read the delimiters from every header, not just the first, so a stream carrying more than one message no longer silently loses fields.

A message runs from its `H` header to its `L` terminator, so a stream can carry several back to back
and each header declares the delimiters for the records that follow it. `parseAstmRecords` read the
declaration **only** from the first header and applied it to the whole stream. A later header that
redeclared the delimiters was therefore read under the wrong set, and every record after it collapsed
into a single field — with no warning, and accepted by `{ strict: true }`. On the analyzer-to-LIS path
that is a lost result or a lost patient or specimen identifier with no signal to the caller: a result
row flagged abnormal and final came back with its value, units, flag and status all absent, and its
status reading `unspecified`.

Delimiters are now scoped forward from each header. A later header that declares a **different** set
is honored from that header onward and raises `ASTM_RECORD_DELIMITERS_REDECLARED`; records already
read keep the set they were read with, so a redeclaration never reinterprets bytes that have already
been consumed. A header that merely restates the set already in force is a no-op and raises nothing —
several messages sharing one delimiter set is an ordinary shape and warning on it would be noise. A
later header whose declaration is unusable (too short, or a field separator that also names one of
the other three roles) keeps the delimiters already in force and raises
`ASTM_RECORD_UNREADABLE_REDECLARATION`; a set is never guessed and no record is dropped. The same
condition on the _first_ header is still the `ASTM_RECORD_UNDECLARED_DELIMITERS` fatal, because there
is no earlier set to fall back to.

Two new stable warning codes, `ASTM_RECORD_DELIMITERS_REDECLARED` and
`ASTM_RECORD_UNREADABLE_REDECLARATION`, with matching `delimitersRedeclared` /
`unreadableRedeclaration` factories. Both are safety-critical, so a vendor profile cannot tolerate
them. `HeaderRecord.delimiters` now reports the set that header put into force rather than always the
first header's; `AstmMessage.delimiters` is unchanged and remains the first header's declaration.

Note that the `patient()` and `results()` accessors are scoped to the whole stream, not to a message:
on a stream carrying several messages, `patient()` returns the first `P` record and `results()`
returns every `R` record, so pairing them across a multi-message stream can attribute one patient's
results to another. Walk `msg.records` and split on the `H` records when a stream may carry more than
one message.

Two related emit-side gaps are unchanged and left for their own releases: a delimiter declaration
longer than three characters still loses its extra bytes on emit, and `serializeAstmRecords(msg, d)`
still does not validate a caller-supplied delimiter set.

What changes for a consumer: a stream with a single header — the ordinary case — parses exactly as
before, byte for byte, with the same warnings. Only streams with more than one header are affected,
and there the records after a redeclaration now carry their real fields instead of one merged field.
If you parse with `{ strict: true }`, a multi-header stream whose delimiters change mid-stream now
throws where it previously returned silently-collapsed records; that is the intended direction, and
no stream became more permissive.
