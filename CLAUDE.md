# @cosyte/astm

A TypeScript library that parses, serializes and builds ASTM laboratory-instrument traffic (E1381
framing, E1394 records, LIVD-based LOINC lookup). Public on npm, it copies the API of `@cosyte/hl7`.

@AGENTS.md

## Gate

Required: `ci / verify` (Node 22, 24), `ci / actionlint`, `no-internal-refs / public-surface`; CI
also runs Node 26, Windows and macOS, Bun and Deno, `coverage-ratchet` and `mutation`. From the repo root, in this order, with the pnpm `packageManager` pins first on
PATH: a newer one refuses the install, and `test/docs-content.test.ts` runs a bare `pnpm build`.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm phi-scan
pnpm test:coverage && pnpm quality:check --base origin/main
pnpm build
pnpm attw
pnpm typecheck:examples && pnpm lint:examples && pnpm examples && pnpm phi-scan:examples
pnpm check:no-emdash && pnpm check:no-internal-refs
pnpm check:documents
```

CI adds an ESM/CJS import check (`pnpm smoke` locally) and the shared pre-publish checks. On a PR
the em dash gate also reads the title, body and commits.

## Hazard

An analyzer's ASTM stream carries patient records, so a logging, fixture or warning-message change
can put patient data on disk, in a test artifact or in the published tarball. Library code never
logs, a warning message is a constant with no field data, and `pnpm phi-scan` is a floor, not proof.

## Rules

Each names its failure and the pull request that fixed it.

- Infer nothing the sender did not send: `patient()` paired another patient's results (#25), and
  `Glucose` read as a LOINC (#74).
- A warning closing a silent loss is a report, not a repair: the bytes read stay the same. A loss
  only a tolerable code reports gets a narrower code too (#53).
- A new warning code is safety-critical until argued onto `TOLERABLE_CODES` in
  `src/profiles/safety.ts`; `applyAstmProfile` re-checks it (#32).
- Never call a failure loud in every case from the cases you ran: four defects called loud each had
  a silent branch (#39, #44, #46, #48). When a claim measures false, fix every restatement, then
  grep your replacement (#61).
- `pnpm attw` runs the shared attw gate, never the bare `attw` CLI, which exits 0 when the types
  are missing (#41).
- `docs-content/` ships in an immutable release asset, and its sidebar left the spine twice (#18);
  no version number there or in `README.md`.
- No task ids, phase language or private paths in `README.md`, `docs-content/`, `/** */` comments
  or strings; reword, never delete (#20).
- Never hand-edit `CHANGELOG.md`: a release writes it from the changeset summaries (#101). Kept by
  hand, it stopped at 0.0.2 while npm reached 0.1.1.
