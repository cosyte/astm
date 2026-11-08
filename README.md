<a href="https://cosyte.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cosyte.com/tile/cosyte-lockup-tile-on-dark-1200x300.png">
    <img alt="The Cosyte logo on its own white ground: the icon beside the word Cosyte." src="https://cosyte.com/tile/cosyte-lockup-tile-on-light-1200x300.png">
  </picture>
</a>

# @cosyte/astm

> Read a real analyzer's ASTM traffic in one line, and never get a confident wrong value back.

[![npm version](https://img.shields.io/npm/v/@cosyte/astm.svg)](https://www.npmjs.com/package/@cosyte/astm)
[![CI](https://img.shields.io/github/actions/workflow/status/cosyte/astm/ci.yml?branch=main&label=CI)](https://github.com/cosyte/astm/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/cosyte/astm/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org)

ASTM parser, serializer, and builder for Node.js and TypeScript: lenient on parse, spec-clean on emit.

- [Why this exists](#why-this-exists)
- [Status](#status)
- [Install](#install)
- [Usage](#usage)
- [Documentation](#documentation)
- [Support](#support)
- [Security](#security)
- [Contributing](#contributing)
- [Trademarks](#trademarks)
- [License](#license)

## Why this exists

Lab integration teams receive ASTM off analyzers that each read the standard a little differently, and the usual answer is a hand-rolled split on `|` and `^` that hands back a confidently wrong value the first time a vendor escapes a delimiter or redeclares the set mid-stream. `@cosyte/astm` removes that: it reads the delimiters each header declares, decodes escape sequences before it splits a value, keeps the practice- and laboratory-assigned patient IDs distinct, and reports every deviation it tolerated as a stable, value-free warning. The nearest alternatives are the open-source ASTM codecs, `python-astm` and `senaite.astm`, which are Python and which hardcode the canonical `|\^&` delimiter set. This is a typed, zero-dependency Node.js package built on the rule those do not enforce: a deviation it cannot resolve is surfaced to you rather than resolved on your behalf, so it does not hand back a value the bytes do not carry.

## Status

Published on npm. The public API is settled and is stable enough to depend on. The record, framing, transport, emit, profile, and terminology layers are all shipped, and their exported names, options, and return shapes are what a consumer builds against. Warning and error codes are part of that surface: consumers branch on `w.code`, so renaming one is a breaking change and is treated as one.

Two public surfaces are still moving, named here rather than left to be found:

- **The contents of the built-in profile registry.** `defineAstmProfile()`, the safety gate, and the registry API are settled; what ships today is `default` plus the corpus-grounded `referenceCorpus`. Named per-vendor profiles are deliberately withheld until a public, vendor-attributed quirk document grounds them, so that set will grow.
- **The warning and error code sets.** A code is added when a deviation is measured that nothing reported before, and a new code is safety-critical by default, so a profile that tolerated the old reports does not tolerate the new one. Adding a code is additive, though it can change which streams a `{ strict: true }` parse refuses; renaming one is breaking and is treated as breaking.

## Install

```bash
pnpm add @cosyte/astm
# or
npm install @cosyte/astm
```

- **Node.js 22 or later, tested on 22, 24, and 26.** That floor is `package.json` `engines.node` (`>=22.0.0`); nothing below it is supported.
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

Six things are worth reading off that output. The value and the units are surfaced raw, never converted, and never defaulted. `status.isActiveFinal` is `true` only for a plain `F`, so a correction (`C`) or a cancellation (`X`) can never read as an active final result. An unrecognized abnormal flag reads `undefined`, never `normal`. The identifier a result is keyed on is the vendor local code in the Universal Test ID's fourth component. The practice- and laboratory-assigned patient IDs stay distinct, because collapsing them is the primary result-misfiling path. And `warnings` is empty here only because this stream is spec-clean: on vendor-quirky input it fills with stable, value-free codes instead of throwing, and the pages under Documentation below say what each one means.

That block is executed on every test run and its output is asserted against the text beside it (`test/readme-usage.test.ts`), so an example that drifts from the package fails the build rather than misleading a reader.

The rest of the API, layer by layer (several messages in one stream, framed bytes, the transport and its `LTP` reducer, LIVD mapping, and dates without an invented timezone), is in the guide [The API, layer by layer](https://github.com/cosyte/astm/blob/main/docs-content/guides-api-by-layer.md).

## Documentation

The full documentation lives at [docs.cosyte.com/astm](https://docs.cosyte.com/astm), built from this repository's [`docs-content/`](https://github.com/cosyte/astm/tree/main/docs-content). Start with these pages:

- [Quickstart](https://github.com/cosyte/astm/blob/main/docs-content/quickstart.md): parse a result stream, read a result and its warnings, emit and frame records, and map a local code to LOINC.
- [The API, layer by layer](https://github.com/cosyte/astm/blob/main/docs-content/guides-api-by-layer.md): records, several messages in one stream, frames, the transport, LIVD mapping, and dates.
- [Coverage and compatibility](https://github.com/cosyte/astm/blob/main/docs-content/concepts-coverage.md): what the parser reads and emits, and the escape and delimiter edge cases each warning code reports.
- [Vendor profiles](https://github.com/cosyte/astm/blob/main/docs-content/guides-vendor-profiles.md): how a profile tolerates one documented deviation without touching a value.
- [What the library does with patient data](https://github.com/cosyte/astm/blob/main/docs-content/patient-data.md), and [what it does and does not do](https://github.com/cosyte/astm/blob/main/docs-content/limitations.md).
- [Troubleshooting](https://github.com/cosyte/astm/blob/main/docs-content/troubleshooting.md): common symptoms, and how to read what the parser is telling you.

## Support

Questions, bug reports, and analyzer quirks you have met on a real feed all start on the [issue tracker](https://github.com/cosyte/astm/issues); there is no separate forum. Describe a quirk by its shape, or reproduce it with synthetic values: never paste real patient data into an issue.

## Security

Report a vulnerability privately, to security@cosyte.com or through GitHub's private vulnerability reporting, as the [security policy](https://github.com/cosyte/.github/blob/main/SECURITY.md) describes, and never in a public issue.

### PHI and safety

ASTM instrument traffic carries PHI. This section says what the library does with it and, where a guarantee cannot be grounded in the code, states the limit instead.

**What the library does not do.** It never logs: there is no logger, no `console` call and no log sink anywhere in `src/`. It never writes to disk and never opens a network connection; it imports no Node built-in and declares zero runtime dependencies. It retains nothing across calls: `parseAstmRecords` returns a deep-frozen model, and the only module-level state in the package is which vendor profile is selected as the default, which is configuration rather than data. It owns no socket: `ltpReduce` is a pure reducer that returns the actions to take, and you write the bytes.

**What can reach a log through this library.** Every warning and every fatal error raised on stream content carries a stable code plus a position (the record's ordinal index, its type letter, and the 1-based field and component indices) and never a field value, so one can be logged verbatim without leaking a name, an identifier, or a result value. Three messages in the package do quote a value back, and all three quote an argument you passed rather than anything read off the wire: an out-of-range `startFrameNumber`, and the options object and the profile name handed to `defineAstmProfile()`. That is the bound, stated rather than rounded up into a claim that no message ever quotes anything.

**What you still own.** The parsed model holds the patient data you handed it, in your process, for as long as you keep it, so retention, encryption at rest, transport security, access control and audit are all yours. So is anything you print: a value-free warning does not make `JSON.stringify(msg)` safe, and the raw line the parser preserves verbatim on a deviation is the patient's data. The library also never redacts, masks, or de-identifies. It surfaces what arrived.

**One limit about this repository rather than about your data.** The committed PHI scan (`pnpm phi-scan`) is a starter. It enforces a cross-cutting SSN and non-test-email floor plus a check on the `P` record's name components, and structured field-level detection for address, phone, and comment free text is not implemented here. It guards this repository's own fixtures, tests, and examples; it makes no claim about a stream you feed the library. Every record in this file and in the test suite is synthetic.

## Contributing

Issues and pull requests are welcome at [github.com/cosyte/astm](https://github.com/cosyte/astm). Ask a question by opening an [issue](https://github.com/cosyte/astm/issues); there is no separate forum. The organization's [contributing guide](https://github.com/cosyte/.github/blob/main/CONTRIBUTING.md) and [code of conduct](https://github.com/cosyte/.github/blob/main/CODE_OF_CONDUCT.md) apply here.

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

Three house rules reject a change on sight. **No real patient data**, in a fixture, a test, an example, or a commit message: every record in this repository is synthetic, and `pnpm phi-scan` runs on every commit. **No em or en dash anywhere**, including commit messages (`pnpm run check:no-emdash`); write a comma, a colon, a period, or parentheses instead. **No internal project bookkeeping on a public surface** (`pnpm run check:no-internal-refs`): this file, the shipped docs, and every JSDoc comment say what the software does, never how the change got made.

A behavior change needs a test that fails without it. Renaming a published warning or error code is a breaking change; adding one is not, though it can change which streams a `{ strict: true }` parse refuses, so say so.

## Trademarks

ASTM, CLSI, LOINC, SNOMED CT, and the analyzer names in this package's documentation are the property of their owners, and Cosyte is not affiliated with, endorsed by, or sponsored by any of them. The names identify the standards this package reads and the analyzers whose behavior it describes. See [TRADEMARKS.md](https://github.com/cosyte/astm/blob/main/TRADEMARKS.md).

## License

MIT (SPDX identifier `MIT`). Copyright (c) 2026 Cosyte LLC. Full text: [LICENSE](https://github.com/cosyte/astm/blob/main/LICENSE).
