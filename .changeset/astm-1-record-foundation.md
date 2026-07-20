---
"@cosyte/astm": patch
---

Record foundation (ASTM-1, roadmap Phase 1): parse an ASTM/CLSI-LIS02 record stream and pull result
value + units + flag in one line. Reads the four delimiters from each `H` record (never hardcoded),
decodes embedded escapes (`&F&`/`&S&`/`&R&`/`&E&`) before splitting so an escaped component delimiter
reads as one component, keeps the practice- and laboratory-assigned patient IDs distinct, and surfaces
`H`/`P`/`O`/`R`/`L` as an immutable `AstmMessage` via `parseAstmRecords` with `results()` / `patient()`
extractors. Lenient on parse (typed, value-free warnings), never a confident wrong value. Flag/status
semantics, the framing layer, and serialization are deferred to later phases.
