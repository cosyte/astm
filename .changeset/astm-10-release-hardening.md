---
"@cosyte/astm": patch
---

Release hardening (ASTM-10, roadmap Phase 10 — the final phase). Publish-readiness for the now
feature-complete ASTM parser: coverage, fuzz, firsthand differential testing, the full documentation
spine, and a proven release shape. **No new runtime API.**

**Differential conformance vs python-astm.** `@cosyte/astm` is now differentially tested — grounded
**firsthand** — against [python-astm](https://github.com/kxepal/python-astm), the BSD-3-Clause
reference ASTM/CLSI-LIS02 codec (commit `4170ce0c`). Its outputs were captured once
(`test/differential/generate-reference-vectors.py` → `reference-vectors.json`; **no reference code is
vendored**, and CI needs no Python) and asserted against ours on three shared paths: the **modulo-256
frame checksum**, the **record field/component split** (escape-free, non-header records), and a
**cross-implementation frame decode** (python encodes + splits a record into frames; our decoder
verifies every checksum, follows the sequence, and reassembles the exact original bytes). The
**deliberate divergences** are asserted on purpose — we un-escape `&F&`/`&S&`/`&R&`/`&E&` (python
leaves them literal), we validate the frame checksum on decode (python does not), and we classify the
`Q` host-query (python has no model) — so where we are stricter is documented, not accidental.

**Coverage + fuzz to the release bar.** Per-directory ≥ 90 coverage gating now covers the whole `src/`
surface: `frames`, `ltp`, and `terminology` are gated per-dir alongside `common`/`records`/`profiles`
(on top of the global gate). A new **record-tokenizer fuzz** suite
(`test/property/records-fuzz.property.test.ts`) joins the frame-codec fuzz — arbitrary / truncated /
delimiter- and escape-laden input never crashes, hangs, or OOMs; lenient mode only ever throws a
sanctioned Tier-3 fatal and strict only `AstmStrictError`, with every warning carrying a registered
code. Both suites scale via `ASTM_FUZZ_RUNS`, driven up nightly by a scheduled **Fuzz** workflow
(`.github/workflows/fuzz.yml`) and runnable on demand with `pnpm test:fuzz`.

**Publish dry-run — proven release-shaped.** `attw` all-green (per-condition ESM/CJS types); a new
`smoke` gate (`scripts/smoke.mjs`, wired into `verify.sh`) that imports the **built** ESM entry and
requires the **built** CJS entry and parses a result through each; and an `npm publish --dry-run` pack
inspection showing a clean 10-file tarball (`dist/` + `README`/`LICENSE`/`CHANGELOG`/`package.json`,
no `src` or tests). Zero runtime dependencies; MIT. The actual `npm publish` and the repo
public-flip remain the standing founder gates and are **not** crossed here.

**Full Diátaxis docs spine + honesty docs.** New `docs-content/limitations.md` ("What it does — and
does not do": no live I/O, units are verbatim free text not UCUM, no bundled terminology dictionary,
`M`/`S` surfaced verbatim, the archived-but-in-force standard status, and the MIT-vs-CLSI license
posture) and `docs-content/architecture.md` (the two independent layers and their payload boundary).
The **Guides** page is now real how-to recipes (was a placeholder), and the intro / troubleshooting /
concepts status blocks are refreshed to the feature-complete state. Every ` ```ts runnable ` example
is executed by the doc/code-agreement gate.
