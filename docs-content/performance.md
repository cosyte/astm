---
id: performance
title: Performance
sidebar_label: Performance
description: "What we measure on @cosyte/astm and how, the guards in the test suite that fail on a hang or a slower-than-linear path, and how to run them."
---

# Performance

This page describes what we measure on `@cosyte/astm`, how, and how to run it yourself. The shared
method every Cosyte package follows (throughput, latency percentiles, memory, import time and bundle
size, and how a pull request is compared with `main`) is written down in the performance standard in
[cosyte/config's decision records](https://github.com/cosyte/config/tree/main/documentation/decisions).
The numbers for the current release are in [Current numbers](#current-numbers) below.

## What is measured today

This package has no benchmark of its own yet, so throughput, latency, memory, import time and bundle
size are not measured for it. Until they are, [Current numbers](#current-numbers) says "not
measured" for each, with the reason.

What does run on every pull request is a set of guards that fail when the parser or the frame decoder
takes time or memory out of proportion to its input. They catch the regressions that matter most for
a byte-level parser, a hang or a path slower than linear on hostile input, without asserting a
throughput figure that would depend on the machine.

## The guards in the test suite

| Guard                | Fails when                                                                                                                            | Where                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Per-case CPU budget  | one fuzz case uses more CPU time than a fixed floor plus an allowance that grows linearly with its input, at its best of several runs | every fuzz target over the frame decoder and the record parser |
| Per-case memory cap  | one fuzz case grows the heap and buffers by more than a fixed cap, at its best of several runs                                        | the same fuzz targets                                          |
| Linear numeric check | the check behind `ASTM_RECORD_UNITS_ABSENT` takes time out of proportion on a value made of long whitespace runs                      | `test/records/numeric-value-backtracking.test.ts`              |

The budget is CPU time rather than wall-clock time, so a busy machine that keeps a case waiting for a
core does not fail it. A case over its budget is run again, and fails only when every run is over,
so a garbage collection that lands in one run does not fail a case on its own. The nightly fuzz run applies the same
budget to every case it generates for its whole time budget.

The linear numeric check exists because an earlier form of that pattern took time quadratic in the
length of a whitespace run, so a long enough value could hold the parser for minutes. The test pins
the linear form and checks that it classifies values exactly as the old one did.

## What these guards are not

- **Not a throughput figure.** They bound how cost grows with input; they do not say how many
  messages a second the parser reads.
- **Not a comparison with other libraries.** That is a separate suite with its own written method.
- **Not a behavior contract.** Nothing here changes how a stream is parsed.

## Run them yourself

```bash
pnpm install --frozen-lockfile
pnpm fuzz                                                      # the fuzz targets, with their budgets
ASTM_FUZZ_SEED=12345 ASTM_FUZZ_SECONDS=120 pnpm fuzz           # a longer run, as the nightly does
pnpm test test/records/numeric-value-backtracking.test.ts      # the linear numeric check
```

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.
