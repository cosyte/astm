# Examples

Small runnable programs, one per job the package does. Each one imports `@cosyte/astm` by its
published name, so it runs against the built package exactly as a consumer installs it, prints what
it read, and checks its own output: a mismatch exits non-zero. Every record in them is synthetic.

Build once, then run them all:

```bash
pnpm install
pnpm build
pnpm examples
```

| File                                                         | What it shows                                                                                                                       | Run                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| [`read-results.ts`](read-results.ts)                         | Parse a de-framed record stream and read each result's value, units, flag and status, plus the two patient IDs kept distinct.       | `pnpm tsx examples/read-results.ts`             |
| [`build-and-frame.ts`](build-and-frame.ts)                   | Build spec-clean records from typed input, frame them with checksums, read them back, and see a corrupted frame refused.            | `pnpm tsx examples/build-and-frame.ts`          |
| [`receive-over-ltp.ts`](receive-over-ltp.ts)                 | Drive the receiver state machine: `ACK` good frames, `NAK` a damaged one, accept the retransmission, deliver the records.           | `pnpm tsx examples/receive-over-ltp.ts`         |
| [`map-local-codes-to-loinc.ts`](map-local-codes-to-loinc.ts) | Map analyzer local codes to LOINC with your own LIVD catalog: one candidate, two candidates settled by units, and an unmapped code. | `pnpm tsx examples/map-local-codes-to-loinc.ts` |

`data/result-stream.astm` is the input `read-results.ts` reads: one synthetic patient, one order and
two results, copied from the repository's test fixtures.

CI runs `pnpm typecheck:examples`, `pnpm lint:examples` and `pnpm examples` after `pnpm build` on
every pull request, so an example that drifts from the package fails the build.
