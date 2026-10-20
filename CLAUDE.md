# @cosyte/astm

A TypeScript library that parses, serializes and builds ASTM laboratory-instrument traffic (E1381
framing, E1394 records, LIVD-based LOINC lookup). Public on npm, it copies the API of `@cosyte/hl7`.

## Gate

From the repo root, in one shell, in this order. Line 1 puts the pinned pnpm first on PATH: a newer
pnpm refuses the install, and `test/docs-content.test.ts` runs a bare `pnpm build`.

```sh
d=/tmp/pnpm-pin; mkdir -p $d && corepack enable --install-directory $d pnpm && PATH=$d:$PATH
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
```

CI adds actionlint, an ESM/CJS import check (`pnpm smoke` locally) and the shared pre-publish
checks, none a script here. On a PR the em dash gate also reads the title, body and commits.

## Hazard

An analyzer's ASTM stream carries patient records, so a logging, fixture or warning-message change
can put patient data on disk, in a test artifact or in the published tarball. Library code never
logs, a warning message is a constant with no field data, and `pnpm phi-scan` is a floor, not proof.

## Rules

Each backticked `#anchor` is a section of the [agent notes](documentation/agent-notes.md) that
records the failure behind a rule. Read the `#defects` entry before changing the code it names.

- Never infer what the sender did not send (a header, a patient hierarchy, a LOINC): `patient()`
  paired one patient with another's results, and `Glucose` read as a LOINC. `#defect-1` `#defect-9`
- A warning that closes a silent loss is a report, not a repair: the bytes read stay identical. If a
  tolerable code is a loss's only report, add a narrower code; never strike the first. `#defect-11`
- A new warning code is safety-critical until argued onto `TOLERABLE_CODES` in
  `src/profiles/safety.ts`, and `applyAstmProfile`'s re-check of it stays. `#defect-2`
- Never call a failure loud in every case from the cases you ran: defects 5, 6, 7 and 13 each had a
  silent branch (`#defect-7`). When a claim measures false, grep and fix every restatement, warning
  messages included, then grep your replacement: fifteen were once missed. `#defect-17c`
- `pnpm attw` is `scripts/attw.mjs`: the bare `attw` CLI exits 0 when the types are missing. `#attw`
- `docs-content/` ships in an immutable release asset, so a mistake there outlives its fix. No
  version number there or in `README.md`: four went stale within hours (`#status-history`).
  `sidebars.json` shipped off the docs spine twice (`test/docs-sidebar-ia.test.ts`). `#docs-sidebar`
- No task ids, phase language or private paths in `README.md`, `docs-content/`, `/** */` comments
  or strings; reword, never delete the comment. The gate misses stale prose. `#no-internal-refs`
- Never put a backticked bare anchor in a changeset or a shipped file. The agent-notes check in
  `pnpm test` reads `git ls-files`, so rerun the gate after `git add`. `#agent-notes-contract`
