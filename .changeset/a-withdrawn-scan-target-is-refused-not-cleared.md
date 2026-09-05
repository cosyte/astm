---
"@cosyte/astm": patch
---

**The PHI scanner now refuses a run that enumerated a target and never read it, and the install
settings that hold a resolution back are in force rather than merely written down.** No published
value, type, warning code or emitted byte moves: this is repository tooling and supply chain
configuration only.

Changed:

- `scripts/phi-scan.ts` reconciles the targets a run ENUMERATED against the ones it actually READ,
  on every route rather than on the whole-tree sweep alone. The whole-file bypass is subtracted
  from each route's finished target list, so before this a run naming two paths and withdrawing one
  opened one file and answered for both, at the same exit code the same arguments produce over a
  corpus whose only violator is the withdrawn one. A caller could not tell those two runs apart.
  The run now exits with the scanner's invocation-error code, names every path nobody opened, and
  still prints any hit it had already found, because a refusal must not swallow a real finding.
  Detection is untouched: the loci it reads, the format-agnostic floor and the allow list are all
  exactly as they were, and this is the enumeration half again.
- A run that passes no bypass is byte-identical on all three routes, whole tree, staged files and
  named paths, which is asserted against a copy of the scanner without the reconciliation rather
  than assumed.
- `pnpm-workspace.yaml` declares a 1440 minute minimum release age and a no-downgrade trust policy,
  and the pinned package manager moves to a release that enforces both. An older one ignores the
  keys entirely, which is a settings file that decorates rather than defends, so the two changes
  are one control. A refusal to install because no version in a range is old enough is that control
  working and is never answered by lowering the number.
- The `js-yaml` resolution override is superseded rather than joined: the stale selector pinned a
  lower version over an overlapping range, so it is replaced by one covering the whole advisory
  range. The 3.x resolution reached through the release tooling is a known residual and is
  deliberately left where it is.
