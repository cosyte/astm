---
"@cosyte/astm": patch
---

Remove `ASTM_RECORD_UNKNOWN_TYPE` from the profile safety gate's tolerable allow-list
(`ASTM-UNKNOWN-RECORD-REMERGE`).

Breaking for any consumer profile that named the code: `defineAstmProfile` now throws
`AstmProfileDefinitionError` at definition time rather than building a profile. `TOLERABLE_CODES`
goes from four members to three; `SAFETY_CRITICAL_CODES` and `isSafetyCriticalCode()` follow. No
built-in profile tolerated it, so nothing in the package changes shape. Kept on the `0.0.x`
pre-alpha ladder as a patch, per the repo's version policy.

Message grouping decides where a message starts by reading each record's type letter, so a header
the reader cannot recognize opens no message and the messages either side of it merge, pairing a
patient with results that arrived under a different header. The `ASTM_RECORD_UNKNOWN_TYPE` warning
is the entire signal that this happened, so tolerating it quieted the only report and let a
`{ strict: true }` parse accept the stream. The parser is deliberately unchanged: inferring a
header from a mangled record would guess at a byte the sender did not send.

The allow-list's admission test now has a second clause, which is the durable part: a code is
tolerable only while nothing else in the package reads the condition the warning reports. The three
survivors were re-derived against message grouping and are measured to leave the message partition
identical whether or not a profile downgrades them.
