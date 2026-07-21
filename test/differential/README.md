# Differential conformance corpus

`@cosyte/astm` is differentially tested against **[python-astm]** — the BSD-3-Clause reference
ASTM/CLSI-LIS02 codec by Alexander Shorin. The roadmap (§6) calls this out as a genuine advantage the
`ncpdp` parser never had: a permissively-licensed second implementation exists, so we can check our
decode/encode against an independent codec, not only against our own fixtures.

## What is here

| File | Role |
|------|------|
| `generate-reference-vectors.py` | Imports python-astm and captures its outputs for a fixed synthetic corpus. **Run once, firsthand.** |
| `reference-vectors.json` | The captured reference outputs (checksums, record field splits, frame splits) + provenance. |
| `differential.test.ts` | Runs `@cosyte/astm` over the same inputs and asserts agreement, plus the documented divergences. |

**No python-astm code is vendored.** We capture its *outputs* once, pinned to a commit, and the
TypeScript test consumes only the JSON — so CI needs no Python and no network.

## Reference

- **Repository:** [kxepal/python-astm][python-astm]
- **Commit:** `4170ce0c56567298e55b797d22357d9437087f94` (2024-04-11)
- **License:** BSD-3-Clause

## The three agreement corpora

1. **Checksum** — the modulo-256 frame checksum over identical byte spans (the most safety-critical
   byte-level computation).
2. **Record field/component split** — the `|`/`\`/`^` tokenizer on escape-free, non-header records.
3. **Cross-implementation frame decode** — python-astm *encodes and splits* a record into frames; our
   decoder verifies every checksum, follows the frame sequence, and reassembles the exact original
   bytes. This exercises encode (python) against decode (us).

## Documented divergences — where we are deliberately stricter

The two codecs are **not** expected to agree everywhere; where they differ, we are the stricter,
fail-safe one, and the test asserts the difference on purpose:

- **Escape decoding.** python-astm has no escape decode — an embedded `&S&` stays literal and a value
  carrying an escaped component delimiter mis-splits. We un-escape *before* splitting, so the value
  reads as one component.
- **Header declaration.** The `H` record's `\^&` is a delimiter *declaration*, not data; the two
  codecs model that boundary differently by design, so the header is excluded from the split corpus.
- **Checksum validation.** python-astm computes the checksum but does not verify it on decode; we flag
  a bad-checksum frame `trusted: false` and never merge it (the "checksums routinely not validated"
  claim was refuted — see the roadmap).
- **`Q` support.** python-astm has no host-query model; we classify a `Q`-bearing message as a
  host-query and never read it as a result set.

## Regenerating the vectors

```bash
git clone https://github.com/kxepal/python-astm && cd python-astm
git checkout 4170ce0c56567298e55b797d22357d9437087f94
PYTHONPATH=. python3 /path/to/test/differential/generate-reference-vectors.py \
  > /path/to/test/differential/reference-vectors.json
```

[python-astm]: https://github.com/kxepal/python-astm
