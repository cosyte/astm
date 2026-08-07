---
"@cosyte/astm": patch
---

Read a stream embedded as a source string literal in the PHI commit-gate, and refuse a sweep that did not observe its corpus.

The all-mode walk covers `src`, `test` and `scripts` rather than `src` and `test/fixtures`, which brings 106 previously unscanned tracked files into the sweep, 66 of them under `test/` and 31 of those carrying an inline patient-record literal. Enumerating them is only half of it: the record-aware detector reads a line that begins with the patient-record type letter, and most of this package's streams are string literals whose record separator is an escape sequence, so each arrived as one line beginning with a quote and was never read, including inside `src`, which the walk already covered. The detector now also runs over a view with those escape sequences decoded, in addition to the raw bytes, in one left-to-right pass that consumes an escaped backslash as a pair and only over source file extensions, so it cannot invent a record boundary in wire data whose backslash is the repeat delimiter.

A sweep that observed nothing now refuses with exit 2: per declared root, for the invocation as a whole, and reconciled against `git ls-files` so a root emptied of all but one file is caught too. A root that is a regular file is refused there rather than raising an uncaught `ENOTDIR`, which exits 1, the code that means hits were found. The scanner also resolves its repository from its own file location rather than the working directory.

Adds `pnpm check`, which asserts every gate this repository's workflows run has a local route or a declared reason it cannot, and names on every run the ones it cannot reach.
