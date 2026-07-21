---
"@cosyte/astm": patch
---

Patient/order identity depth, comments, and partial-timestamp hardening (ASTM-3, roadmap Phase 3): the
misfiling-prevention slice. Model the full patient (`P`) identity — the practice-assigned (field 3),
laboratory-assigned (field 4), and third (field 5) patient IDs stay **distinct** and never collapse
(the primary result-misfiling path), plus mother's maiden name (field 7) alongside the name/DOB/sex.
Model the full order (`O`) — priority (6), action code (~12), report type (~26) surfaced verbatim
(`[OSS-derived]` indices/codes, never guessed). Add the `C` (comment) record — `source`/`text`
(component-capable, never truncated)/`commentType` — **attached by position** to the immediately-preceding
`H`/`P`/`O`/`R` parent, with an **orphan** comment (no valid parent) attached to the message root and an
`ASTM_RECORD_ORPHAN_COMMENT` warning, never dropped; comment-type codes are `[OSS-derived]` (`I`
instrument confirmed, `G`/`T`/`P` paywalled — surfaced raw, never mapped). Harden `YYYYMMDDHHMMSS`: an
odd digit run that truncates a component sets `AstmDate.truncated`, preserves the raw run, and never
zero-fills a fabricated time, surfaced as a value-free `ASTM_RECORD_PARTIAL_TIMESTAMP` warning (times
stay instrument-local, never UTC). Adds `orders` / `comments` / `commentsFor` extractors and the
`attachComments` pass; two new value-free warning codes (snapshot locked). The phi-scan is extended
toward the mother's-maiden (P field 7) locus.
