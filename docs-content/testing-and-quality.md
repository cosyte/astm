---
id: testing-and-quality
title: Testing and quality
sidebar_label: Testing and quality
description: "How we test @cosyte/astm: unit tests, fixtures, property tests, fuzzing, differential tests, doc samples and the PHI scan, and what each catches and misses."
---

# Testing and quality

This page describes how we test `@cosyte/astm`, what each technique catches, and what it cannot.
The shared rules every Cosyte package follows (the coverage and mutation floors, the property-based
runners, what a pull request must prove) are written down in the testing standard in
[cosyte/config's decision records](https://github.com/cosyte/config/tree/main/documentation/decisions).
The numbers for the current release are in [Current numbers](#current-numbers) below.

The failure we test hardest against is the quiet one: a value, unit, flag, status or patient ID read
wrong but plausible, which travels downstream with nothing to flag it. So most of what follows checks
what the parser returns, not only that it did not throw.

## What we run, and what each technique catches

| Technique                | What it catches                                                                                                                                                                                                                                                                                               | What it cannot catch                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests               | each documented behavior and each failure path of every module (records, frames, the transport receiver, profiles, the LOINC mapping, dates and delimiters), run against the source                                                                                                                           | an input nobody thought to write down                                                                                                                       |
| Fixtures                 | a regression on a known stream shape: synthetic streams for result uploads, host queries, comments and identity, escaped delimiters, partial timestamps, manufacturer records and result semantics, and a golden round trip through parse and emit                                                            | a shape no fixture holds; behavior on real analyzer traffic, since every fixture is synthetic                                                               |
| Property-based tests     | a whole class of input breaking a stated rule: emit then parse gives back the same records, frames reassemble to the bytes that were framed, the receiver never answers `ACK` to an untrusted frame, a profile never changes a value, a status other than `F` is never active-final, a LOINC is never guessed | a rule nobody stated; a case outside the cases run; a gap in what the generators produce                                                                    |
| Fuzzing                  | a crash, a hang, a path slower than linear, or a runaway allocation on hostile input: arbitrary and near-miss bytes through the frame decoder, structural noise through the record parser, and two messages in one stream under random delimiter sets, in lenient and strict mode                             | a wrong but plausible result, unless a property states what right is                                                                                        |
| Differential testing     | a bug our fixtures and our code agree on, by comparing checksums, field and component splits, and a frame decode with python-astm, an independent, BSD-licensed codec                                                                                                                                         | a bug both codecs share; where we are deliberately stricter (escape decoding, checksum validation, the `Q` record), the test asserts the difference instead |
| Coverage gate            | code no test runs: lines, branches, functions and statements, held at a floor on every source file                                                                                                                                                                                                            | a test that runs code without checking what it returns                                                                                                      |
| Mutation testing         | a test that runs code but would not notice it changing                                                                                                                                                                                                                                                        | not yet run on this package; the numbers below say "not measured" until it is                                                                               |
| Doc samples and examples | a documentation sample or example that no longer matches the code: every TypeScript sample on these pages runs against the built package with its `// =>` values checked and compiles against the package's types, and each program under `examples/` checks its own output                                   | prose that is wrong beside a sample that is right                                                                                                           |
| PHI scan                 | a realistic patient identifier in a fixture or a staged file: dashed Social Security numbers, email addresses outside test domains, and patient names and birth dates in `P` records that are not declared synthetic in an allow list                                                                         | anything outside the fields and formats it knows; it finds a write after it happens, it does not prevent one                                                |

## How each one runs

- **Unit tests, fixtures, properties, fuzzing and doc samples** run in one Vitest suite on every pull
  request and on `main`, on Node.js 22, 24 and 26. Each property and fuzz target runs a fixed number
  of cases on a pull request. Property tests draw a new seed on every run, so a run can find a case
  an earlier one missed, and fast-check prints the seed with any failure so it can be replayed.
- **Fuzzing** also runs every night for a time budget per target instead of a case count, from a
  seed that changes with each run. Each case has a CPU-time budget that grows with its input, so a
  path slower than linear fails the run, and a cap on how much memory one case may allocate.
- **The coverage gate** runs with the suite. A floor that is not met fails the pull request.
- **The PHI scan** runs on staged files before each commit and over the repository in CI. These
  pages are part of what it reads.
- **Differential testing** runs in the suite from reference outputs captured once from python-astm
  at a pinned commit. None of its code is copied, and CI needs no Python.

## Run them yourself

```bash
pnpm install --frozen-lockfile
pnpm test               # unit tests, fixtures, properties, fuzzing, differential tests and doc samples
pnpm test:coverage      # the same suite with the coverage gate
pnpm fuzz               # the fuzz targets alone
pnpm phi-scan           # the PHI scan over the repository
pnpm build && pnpm examples   # the example programs, against the built package

# A longer fuzz run, as the nightly does: 120 seconds per target from a seed you choose.
ASTM_FUZZ_SEED=12345 ASTM_FUZZ_SECONDS=120 pnpm fuzz
```

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.
