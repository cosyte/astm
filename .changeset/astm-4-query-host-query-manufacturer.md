---
"@cosyte/astm": patch
---

Query (`Q`) record, host-query flow, and `M`/`S` surfaced verbatim (ASTM-4, roadmap Phase 4) — this
completes the record grammar, so **the record-content layer is now feature-complete.** Model the `Q`
(Request Information) record at the public ASTM E1394 field positions: `startingRangeId` (3) and
`endingRangeId` (4) surfaced as the **full verbatim field** (never truncated), the Universal Test ID
(5, same caret structure as `O`/`R`), and `requestInformationStatus` (13) surfaced verbatim — the range
component structure, the `ALL` universal-query keyword (`queriesAllTests`), and the status code set are
all **`[OSS-derived / paywalled]`** (roadmap §10 Q3), surfaced and flagged but **never interpreted or
guessed**. Add the **host-query flow**: every message is classified (`msg.classification`) as
`host-query` / `results` / `orders` / `indeterminate`, with the **fail-safe** that a `Q` **dominates** —
a `Q`-bearing message is a request and is **never** read as a result set, even if a result record is
also present (a contradiction flagged with `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND`); gate on
`classification.isHostQueryRequest`. Surface `M` (manufacturer) and `S` (scientific) records
**verbatim** (byte-identical on `record.rawLine`), **never** interpreted into typed clinical fields — a
QC/calibration value can never be read as a patient result. Adds `query` / `classifyMessage` exports,
the `QueryRecord` / `ManufacturerRecord` / `ScientificRecord` types, an `AstmMessage.classification`
field, and two value-free warning codes (snapshot locked): `ASTM_RECORD_UNINTERPRETED_QUERY_STATUS`,
`ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND`.
