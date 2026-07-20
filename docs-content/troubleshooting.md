---
id: troubleshooting
title: Troubleshooting
sidebar_position: 1
---

# Troubleshooting

Common symptoms when integrating `@cosyte/astm`, and how to read what the parser is telling you.

## The parse "succeeded" but the result looks wrong

`@cosyte/astm` is lenient — it recovers from vendor quirks rather than throwing. That means a surprising
result usually comes with an explanation in `warnings`. Inspect them first:

```ts
const { warnings } = parseAstmRecords(raw);

for (const w of warnings) {
  console.warn(w.code, w.message, w.position);
}
```

Each warning carries a **stable code** (`WARNING_CODES`) and positional context. If a deviation
should be a hard failure for your integration, re-parse with `{ strict: true }` to have it thrown
instead.

## A parse threw

Only **Tier-3 fatal** conditions (`FATAL_CODES`) throw in lenient mode — these mark input the parser
cannot recover into a structured result. In `{ strict: true }` mode, any tolerated deviation throws
too. Catch and inspect the error's code to tell the two apart.

## Warning messages and logs

Warning `message` fields are safe to log — they **never contain PHI**. Never log the raw payload
itself; it may carry protected health information.

## Known limitations

> **Status:** `@cosyte/astm` Phase 1 ships the **record** layer only. Result flag/status letters are
> surfaced **raw** (their semantics — including correction/cancel handling — arrive in Phase 2).

- **No framing layer yet** — Phase 1 assumes already-de-framed record bytes. The E1381/LIS01 frame
  codec (checksums, the 240-char split) is a later phase.
- **Flag/status semantics deferred** — `R` abnormal flags and result status are raw strings for now;
  the HL7 Table 0078 modeling and the fail-safe `UNDEFINED` fallback land in Phase 2.
- **No comments / query / `M` / `S`** — those record types surface as unsupported records for now.
- **No serializer yet** — the spec-clean emit side (with re-escaping) is added in Phase 7.

The **API Reference** always reflects exactly what this release ships — treat it as the source of
truth over any prose above.
