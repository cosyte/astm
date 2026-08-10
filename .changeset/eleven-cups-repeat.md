---
"@cosyte/astm": patch
---

Gate the two-file contract between `CLAUDE.md` and the agent notes.

`pnpm check:agent-notes` asserts that every pointer from the always-read file into the on-demand
record resolves, that no section a pointer reaches is empty, that the record stays reachable, and
that the always-read file still links it by path. The teeth are in the test suite, so the check
rides the required verify matrix rather than adding a workflow that would have to be made a required
context separately. It asserts no ecosystem-wide contract: several sibling repos carry no such
record, and a gate phrased as though every repo did would be an overclaim.

The matcher was re-derived against this tree instead of ported. Both sibling spellings score zero
here, and every pointer in this repository is a third spelling neither sibling gate matches, so a
verbatim port would have reported success over a corpus it never opened. The anchor space is this
record's explicit HTML anchors rather than heading slugs, which a slug-only check would have
reported as entirely dangling. An early draft was vacuous rather than wrong and only a positive
control caught it. The corpus is reconciled as sets with no exclusion list, no binary skip and no
NUL skip, and a pointer is matched if and only if the file spells it in ASCII bytes.
