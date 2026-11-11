# AGENTS.md

`@cosyte/astm` is our TypeScript library that parses, serializes, and builds ASTM
laboratory-instrument traffic: E1381 framing, E1394 records, and LIVD-based LOINC lookup. It is
published on npm under MIT and copies the API of `@cosyte/hl7`.

## Build and test

Use Node.js 22.22.2 or later (the floor `@cosyte/process` sets for the dev tools; the package itself
runs on any Node 22) and the pnpm that `packageManager` in `package.json` pins.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

## The gate

Run all of these from the repository root, in this order, before you push. CI runs the same checks.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm phi-scan
pnpm test
pnpm test:coverage
pnpm build
pnpm attw
pnpm typecheck:examples
pnpm lint:examples
pnpm examples
pnpm phi-scan:examples
pnpm check:no-emdash
pnpm check:no-internal-refs
pnpm check:documents
```

CI's `scaling-gate` job runs `pnpm test:perf`, the scaling gates in `test/perf/scaling-gate.perf.ts`:
they fail when the record parse, the strict validation, the record build or the framed parse grows
faster than its input. They run apart from `pnpm test` and never under coverage.

## Benchmarks

`bench/astm.bench.mjs` measures the built package on synthetic traffic in the shapes an analyzer
interface sees: the small result message an analyzer sends all day, a long result session of 100 to
10,000 results across many patients and orders, that session framed for the wire, and a result
with a large base64 payload over many frames. Each is parsed, validated (the strict parse, then the
stream split into messages) and built. `bench/shapes.mjs` builds every input in code;
`test/perf/bench-shapes.test.ts` holds that each is what `buildAstmMessage` and
`serializeFramedAstm` write, and that each reads with no warning under `strict`.

```sh
pnpm build
pnpm bench:reading --out bench-results/reading.json --summary bench-results/reading.md
node bench/budgets.mjs bench-results/reading.json
pnpm bench:compare --base <base checkout>/dist/index.mjs --head dist/index.mjs
pnpm bench:profile --out bench-results/profile
```

A reading reports throughput, latency p50/p95/p99, allocations, peak heap, a long run for leaks,
and the cold import with its gzip size. `pnpm bench:profile` measures each size of 64 KiB or more
in a fresh process (peak resident memory and single-call time), then profiles the hottest paths. On
a pull request CI compares the base build with the head at each shape's first size, and
`.github/workflows/bench.yml` takes a reading and a profile on a hosted runner when `bench/`
changes. Both are advisory.

## Rules

- Synthetic data only. Real patient data never enters this repository: not in a fixture, a test, a
  log, an issue, or a commit. `pnpm phi-scan` runs on every commit.
- A change a consumer can see carries a changeset (`pnpm changeset`); `.changeset/README.md` says
  which bump to pick.
- No em or en dashes anywhere, commit messages included.

`CLAUDE.md` holds the rules that bind changes here and the failure behind each. Contributions follow
the organization's [contributing guide](https://github.com/cosyte/.github/blob/main/CONTRIBUTING.md).
