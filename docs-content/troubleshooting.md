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

## A value came back without units, or a flag as "undefined"

That is the fail-safe design, not a bug. A numeric result with no units raises
`ASTM_RECORD_UNITS_ABSENT` and the unit is left empty — never defaulted or guessed. An abnormal flag
the parser does not recognize is surfaced as `"undefined"`, never coerced to `"normal"`. An
unparseable reference range is surfaced verbatim with no invented bound. In every case the library
refuses to hand you a confident wrong value — inspect the warning and decide.

## A framed stream lost a frame, or a checksum is wrong

The frame layer validates every modulo-256 checksum and tracks the frame-number sequence. A
bad-checksum frame is flagged `trusted: false` and **never merged** into a record (a warning in
lenient mode, a thrown `AstmFrameStrictError` in strict); a sequence gap is warned and **never
silently bridged**. Read `frameWarnings` from `parseFramedAstm` — each carries a frame number and byte
offset, never the record bytes.

## Known limitations

`@cosyte/astm` is feature-complete across both layers, but its promise is deliberately narrow. See
[What it does — and does not do](./limitations) for the full, honest boundary — no live I/O, units are
verbatim free text (not UCUM), no bundled terminology dictionary (LIVD is bring-your-own), and `M`/`S`
records are surfaced verbatim, never interpreted.

The **API Reference** always reflects exactly what this release ships — treat it as the source of
truth over any prose above.
