---
id: troubleshooting
title: Troubleshooting
sidebar_position: 1
---

# Troubleshooting

Common symptoms when integrating `@cosyte/astm`, and how to read what the parser is telling you.

## The parse "succeeded" but the result looks wrong

`@cosyte/astm` is lenient: it recovers from vendor quirks rather than throwing. That means a surprising
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

Only **Tier-3 fatal** conditions (`FATAL_CODES`) throw in lenient mode: these mark input the parser
cannot recover into a structured result. In `{ strict: true }` mode, any tolerated deviation throws
too. Catch and inspect the error's code to tell the two apart.

## An accessor threw `AstmAmbiguousStreamError`

The parse succeeded; an accessor refused to answer. `patient()`, `results()`, `orders()`,
`comments()` and `query()` read the **whole stream**, so they cannot answer for a stream that does
not determine one answer, and refusing is the point: the alternative is one patient's results
attributed to another. Two codes:

- **`ASTM_AMBIGUOUS_MULTI_MESSAGE`**: the stream carries more than one `H` … `L` message. Read each
  message's own records instead:

  ```ts
  for (const m of messages(msg)) {
    m.patient;
    m.results;
  }
  ```

- **`ASTM_AMBIGUOUS_MULTI_PATIENT`** (from `patient()` only): one message carries several `P`
  records, so "the patient" is not determined. Read `messages(msg)[n].patients` for all of them.

The error carries `code`, a value-free `position` pointing at where the ambiguity became visible, and
`messageCount` / `patientCount`. It never carries an identifier or a value, so it is safe to log.
`commentsFor()` never throws this: the parent record you hand it already names the message.

## Warning messages and logs

Warning `message` fields are safe to log: they **never contain PHI**. Never log the raw payload
itself; it may carry protected health information.

## A value came back without units, or a flag as "undefined"

That is the fail-safe design, not a bug. A numeric result with no units raises
`ASTM_RECORD_UNITS_ABSENT` and the unit is left empty: never defaulted or guessed. An abnormal flag
the parser does not recognize is surfaced as `"undefined"`, never coerced to `"normal"`. An
unparseable reference range is surfaced verbatim with no invented bound. In every case the library
refuses to hand you a confident wrong value: inspect the warning and decide.

## `ASTM_UNPAIRED_ESCAPE_CHARACTER`: a value carries a bare ampersand

An escape sequence is the escape character, **one** body character, and the escape character again
(`&F&` `&S&` `&R&` `&E&`). An escape character that heads no such sequence is not an escape: it is
kept as the literal character it is and opens no atom. So `R|1|^^^687|28.6&|U/L||N||F` gives you a
value of `28.6&` with its units and its `final` status intact, and `O&Brien` in a surname leaves the
birth date and sex where they are.

The warning says the sender did not write the character the spec-clean way, which is `&E&`. The
parser does not guess which it meant: it keeps the byte that arrived and reports it. If your feed
does this routinely, the code is **tolerable**, so a vendor profile can expect it and let you keep
parsing `{ strict: true }`. Emitting is unaffected: this package always writes a literal escape
character as `&E&`, so a stream it produced never raises the code.

**This warning is about one character, not about the record.** A three-character sequence is opaque
by design (that is what keeps `&F&` one token under a set naming `F` as a delimiter), so a sequence
whose body is itself a delimiter swallows that delimiter: `R|1|^^^687|28.6&|&U/L||||F` reads a value
of `28.6&|&U/L` with no units and status `unspecified`. That case raises
`ASTM_UNKNOWN_ESCAPE_SEQUENCE` instead, which is also tolerable, so if you tolerate it, check for it
in the values rather than expecting a stricter parse to catch it.

## A framed stream lost a frame, or a checksum is wrong

The frame layer validates every modulo-256 checksum and tracks the frame-number sequence. A
bad-checksum frame is flagged `trusted: false` and **never merged** into a record (a warning in
lenient mode, a thrown `AstmFrameStrictError` in strict); a sequence gap is warned and **never
silently bridged**. Read `frameWarnings` from `parseFramedAstm`: each carries a frame number and byte
offset, never the record bytes.

## Known limitations

`@cosyte/astm` is feature-complete across both layers, but its promise is deliberately narrow. See
[What it does, and does not do](./limitations) for the full, honest boundary: no live I/O, units are
verbatim free text (not UCUM), no bundled terminology dictionary (LIVD is bring-your-own), and `M`/`S`
records are surfaced verbatim, never interpreted.

The **API Reference** always reflects exactly what this release ships: treat it as the source of
truth over any prose above.
