<a href="https://cosyte.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cosyte.com/tile/cosyte-lockup-tile-on-dark-1200x300.png">
    <img alt="Cosyte: a plus mark set in two overlapping rounded squares, one solid and one outlined, beside the Cosyte wordmark" src="https://cosyte.com/tile/cosyte-lockup-tile-on-light-1200x300.png">
  </picture>
</a>

# @cosyte/astm

> Read a real analyzer's ASTM traffic in one line, and never get a confident wrong value back.

[![npm version](https://img.shields.io/npm/v/@cosyte/astm.svg)](https://www.npmjs.com/package/@cosyte/astm)
[![CI](https://github.com/cosyte/astm/actions/workflows/ci.yml/badge.svg)](https://github.com/cosyte/astm/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/cosyte/astm/blob/main/LICENSE)
[![Node: >=22.0.0](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org)

ASTM parser, serializer, and builder for Node.js and TypeScript: lenient on parse, spec-clean on emit.

- [Why this exists](#why-this-exists)
- [Status](#status)
- [Install](#install)
- [Usage](#usage)
- [PHI and safety](#phi-and-safety)
- [API](#api)
- [Compatibility](#compatibility)
- [Contributing](#contributing)
- [License](#license)

## Why this exists

Lab integration teams receive ASTM off analyzers that each read the standard a little differently, and the usual answer is a hand-rolled split on `|` and `^` that hands back a confidently wrong value the first time a vendor escapes a delimiter or redeclares the set mid-stream. `@cosyte/astm` removes that: it reads the delimiters each header declares, decodes escape sequences before it splits a value, keeps the practice- and laboratory-assigned patient IDs distinct, and reports every deviation it tolerated as a stable, value-free warning. The nearest alternatives are the open-source ASTM codecs, `python-astm` and `senaite.astm`, which are Python and which hardcode the canonical `|\^&` delimiter set. This is a typed, zero-dependency Node.js package built on the rule those do not enforce: a deviation it cannot resolve is surfaced to you rather than resolved on your behalf, so it does not hand back a value the bytes do not carry.

## Status

`0.1.0`. The public API is settled and is stable enough to depend on. The record, framing, transport, emit, profile and terminology layers are all shipped, and their exported names, options and return shapes are what a consumer builds against. Warning and error codes are part of that surface: consumers branch on `w.code`, so renaming one is a breaking change and is treated as one.

Two public surfaces are still moving, named here rather than left to be found:

- **The contents of the built-in profile registry.** `defineAstmProfile()`, the safety gate and the registry API are settled; what ships today is `default` plus the corpus-grounded `referenceCorpus`. Named per-vendor profiles are deliberately withheld until a public, vendor-attributed quirk document grounds them, so that set will grow.
- **The warning and error code sets.** A code is added when a deviation is measured that nothing reported before, and a new code is safety-critical by default, so a profile that tolerated the old reports does not tolerate the new one. Adding a code is additive, though it can change which streams a `{ strict: true }` parse refuses; renaming one is breaking and is treated as breaking.

## Install

```bash
# Requires Node.js >=22.0.0. Ships dual ESM + CJS, with zero runtime dependencies.
pnpm add @cosyte/astm
# or
npm install @cosyte/astm
```

- **Node.js `>=22.0.0`.** That floor is `package.json` `engines.node`; nothing below it is supported.
- **Dual ESM and CJS.** `import` resolves to `dist/index.mjs` and `require` to `dist/index.cjs`, each with its own type declarations, so the package loads from either module system without an interop shim.
- **Zero runtime dependencies.** `dependencies` is empty and the package imports no Node built-in.

## Usage

Hand a de-framed record stream to `parseAstmRecords` and read the result in one line. Every value below is synthetic.

```ts
import { parseAstmRecords, patient, results } from "@cosyte/astm";

// Synthetic ASTM records, CR-delimited. The header declares the delimiters.
const stream =
  "H|\\^&|||analyzer^1|||||||P|LIS02-A2|20240115103000\r" +
  "P|1|PRACTICE-0001|LAB-0002|||||F\r" +
  "O|1|SPEC-7|ACC-42|^^^687|||20240115102500\r" +
  "R|1|^^^687|28.6|U/L|10-40|N||F\r" +
  "L|1|N\r";

const msg = parseAstmRecords(stream);
const [first] = results(msg);

console.log(first?.value, first?.units);
console.log(first?.status.meaning, first?.status.isActiveFinal);
console.log(first?.flag?.meaning);
console.log(first?.universalTestId?.localCode);
console.log(patient(msg)?.practiceAssignedId, patient(msg)?.laboratoryAssignedId);
console.log(msg.warnings.length);
```

```text
28.6 U/L
final true
normal
687
PRACTICE-0001 LAB-0002
0
```

Six things are worth reading off that output. The value and the units are surfaced raw, never converted and never defaulted. `status.isActiveFinal` is `true` only for a plain `F`, so a correction (`C`) or a cancellation (`X`) can never read as an active final result. An unrecognized abnormal flag reads `undefined`, never `normal`. The identifier a result is keyed on is the vendor local code in the Universal Test ID's fourth component. The practice- and laboratory-assigned patient IDs stay distinct, because collapsing them is the primary result-misfiling path. And `warnings` is empty here only because this stream is spec-clean: on vendor-quirky input it fills with stable, value-free codes instead of throwing, which is what the rest of this file is about.

That block is executed on every test run and its output is asserted against the text beside it (`test/readme-usage.test.ts`), so an example that drifts from the package fails the build rather than misleading a reader.

## PHI and safety

ASTM instrument traffic carries PHI. This section says what the library does with it and, where a guarantee cannot be grounded in the code, states the limit instead.

**What the library does not do.** It never logs: there is no logger, no `console` call and no log sink anywhere in `src/`. It never writes to disk and never opens a network connection; it imports no Node built-in and declares zero runtime dependencies. It retains nothing across calls: `parseAstmRecords` returns a deep-frozen model, and the only module-level state in the package is which vendor profile is selected as the default, which is configuration rather than data. It owns no socket: `ltpReduce` is a pure reducer that returns the actions to take, and you write the bytes.

**What can reach a log through this library.** Every warning and every fatal error raised on stream content carries a stable code plus a position (the record's ordinal index, its type letter, and the 1-based field and component indices) and never a field value, so one can be logged verbatim without leaking a name, an identifier or a result value. Three messages in the package do quote a value back, and all three quote an argument you passed rather than anything read off the wire: an out-of-range `startFrameNumber`, and the options object and the profile name handed to `defineAstmProfile()`. That is the bound, stated rather than rounded up into a claim that no message ever quotes anything.

**What you still own.** The parsed model holds the patient data you handed it, in your process, for as long as you keep it, so retention, encryption at rest, transport security, access control and audit are all yours. So is anything you print: a value-free warning does not make `JSON.stringify(msg)` safe, and the raw line the parser preserves verbatim on a deviation is the patient's data. The library also never redacts, masks or de-identifies. It surfaces what arrived.

**One limit about this repository rather than about your data.** The committed PHI scan (`pnpm phi-scan`) is a starter. It enforces a cross-cutting SSN and non-test-email floor plus a check on the `P` record's name components, and structured field-level detection for address, phone and comment free text is not implemented here. It guards this repository's own fixtures, tests and examples; it makes no claim about a stream you feed the library. Every record in this file and in the test suite is synthetic.

## API

`@cosyte/astm` is a zero-dependency TypeScript toolkit that follows the cosyte parser archetype: a lenient
parser that turns real-world, vendor-quirky input into **warnings** rather than failures, paired with
a serializer that always emits spec-clean output (Postel's Law). It mirrors the API shape of the
reference parser, [`@cosyte/hl7`](https://github.com/cosyte/hl7).

Every export carries JSDoc that compiles into `dist/index.d.ts`, so the full signature reference is what your editor already shows on hover; the source is at [github.com/cosyte/astm/tree/main/src](https://github.com/cosyte/astm/tree/main/src). What follows is the shape of each layer and the caveats that bite.

### Parse records

```ts
import { parseAstmRecords, results, patient } from "@cosyte/astm";

// A de-framed ASTM record stream (CR-delimited records; the header declares the delimiters).
const msg = parseAstmRecords(raw);

results(msg)[0]?.value; // the measured value, surfaced raw
results(msg)[0]?.units; // vendor free-text units (a missing unit is a warning, never a default)
patient(msg)?.practiceAssignedId; // kept distinct from laboratoryAssignedId (the misfiling guard)
msg.warnings; // stable, value-free positional tolerance warnings (never throws on quirks)
```

The parser is **lenient by default** (vendor quirks become warnings, not failures) and refuses to
produce a confident wrong value: an embedded escaped delimiter reads as one component, an unknown
record type is surfaced (never dropped), and a missing unit is flagged (never defaulted). A
`{ strict: true }` mode escalates every tolerated deviation to a thrown error.

### Several messages in one stream

Full section: [documentation/api-guide.md](documentation/api-guide.md#several-messages-in-one-stream).

### Decode a framed byte stream

```ts
import { decodeAstmFrames, parseFramedAstm, results } from "@cosyte/astm";

// A raw ASTM byte stream off a serial line or socket.
const { records, frames, warnings } = decodeAstmFrames(framedBytes);
frames[0]?.checksum.valid; // the modulo-256 checksum verdict (emitted uppercase, accepted lowercase)
warnings; // ASTM_FRAME_* deviations, each with a frame number + byte offset (never the record bytes)

// Or compose both layers: decode frames → parse the trusted, reassembled records.
const { message } = parseFramedAstm(framedBytes);
results(message)[0]?.value; // only checksum-verified frames ever reach the record parser
```

A checksum mismatch, a sequence gap, an unterminated frame, and an oversize (>240) frame are each a
**warning** in the default lenient mode (surfaced, flagged, never silently trusted) and a thrown
`AstmFrameStrictError` under `{ strict: true }`.

### Drive the transport (framed vs raw) + the LTP protocol

Full section: [documentation/api-guide.md](documentation/api-guide.md#drive-the-transport-framed-vs-raw--the-ltp-protocol).

### Map local codes to LOINC (LIVD, bring-your-own)

Full section: [documentation/api-guide.md](documentation/api-guide.md#map-local-codes-to-loinc-livd-bring-your-own).

### Read a date without inventing a timezone

Full section: [documentation/api-guide.md](documentation/api-guide.md#read-a-date-without-inventing-a-timezone).

### The cosyte parser archetype

Full section: [documentation/api-guide.md](documentation/api-guide.md#the-cosyte-parser-archetype).

## Compatibility

- **Record content: ASTM E1394 / CLSI LIS02-A2.** `H`/`P`/`O`/`R`/`C`/`Q`/`M`/`S`/`L` are read; an unrecognized type letter is surfaced, never dropped.
- **Framing and transport: ASTM E1381 / CLSI LIS01-A2.** Modulo-256 checksum, frame-number sequencing, the 240-byte multi-frame split, and a pure `ENQ`/`ACK`/`NAK`/`EOT` receiver state machine.
- **Delimiters come from the stream, never from an assumption.** They are read at every `H` and scoped forward, and records already read keep the set they were read with.
- **Framed and raw TCP are both handled.** Serial always frames; over TCP it varies within one vendor, so `detectFraming` routes cobas 4800 and Iguana (framed) from cobas b121 (framing dropped).
- **No named per-vendor profile ships.** The engine, the registry and the safety gate are public; the built-in set is `default` plus the corpus-grounded `referenceCorpus`. Named profiles for cobas, Sysmex, ADVIA, Mindray and Snibe stay gated behind a public, vendor-attributed quirk document, and firsthand inspection of the public corpus found the record layer spec-clean for them.
- **Three behaviors are reasoned from this reader rather than cited to a clause.** LIS02-A2 sections 5.4 and 6.2 are withheld from CLSI's free sample and the paywalled editions were not read here, so the forward-scoping rule for redeclared delimiters, the Latin-1 wire encoding and the reserved-byte set are this package's reading, not a quotation.
- **The result-status letter set is bound by no citable published source**, and every interpreted status reports that in its `vocabulary` rather than implying an attribution it does not have. Abnormal flags are graded against HL7 v3 ObservationInterpretation and report that vocabulary too, recognized or not.
- **The wire is read as Latin-1**, one byte per character. A character above `U+00FF` handed to the frame encoder is a typed error rather than a silently truncated byte, and a raw `STX`, `ETB` or `ETX` byte in a record is refused for the same reason: framing has no escape sequence for them.
- **No LOINC, SNOMED or LIVD dictionary is bundled**, and no LOINC is ever guessed. You bring the catalog and its license obligations.

### What it covers

Full section: [documentation/compatibility.md](documentation/compatibility.md#what-it-covers).

### An unescaped ampersand does not cost you the rest of the record

Full section: [documentation/compatibility.md](documentation/compatibility.md#an-unescaped-ampersand-does-not-cost-you-the-rest-of-the-record).

### A header that names one character in two delimiter roles

Full section: [documentation/compatibility.md](documentation/compatibility.md#a-header-that-names-one-character-in-two-delimiter-roles).

## Contributing

Issues and pull requests are welcome at [github.com/cosyte/astm](https://github.com/cosyte/astm). Ask a question by opening an [issue](https://github.com/cosyte/astm/issues); there is no separate forum.

A contribution has to clear the same gates CI runs, and every one of them runs locally:

```bash
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm run format:check
pnpm run check:no-emdash
pnpm run check:no-internal-refs
pnpm run phi-scan
```

Three house rules reject a change on sight. **No real patient data**, in a fixture, a test, an example or a commit message: every record in this repository is synthetic, and `pnpm phi-scan` runs on every commit. **No em dash anywhere**, including commit messages (`pnpm run check:no-emdash`); write a comma, a colon, a period or parentheses instead. **No internal project bookkeeping on a public surface** (`pnpm run check:no-internal-refs`): this file, the shipped docs and every JSDoc comment say what the software does, never how the change got made.

A behavior change needs a test that fails without it. Renaming a published warning or error code is a breaking change; adding one is not, though it can change which streams a `{ strict: true }` parse refuses, so say so.

## License

MIT (SPDX identifier `MIT`). Copyright (c) 2026 Cosyte. Full text: [LICENSE](https://github.com/cosyte/astm/blob/main/LICENSE).
