---
"@cosyte/astm": patch
---

Development tooling only: the repository's own pre-commit PHI scanner no longer lets a caller's git
configuration decide which staged entries it looks at. No public surface was added, removed or
renamed, no runtime code changed, and the built output is identical.

The scanner's staged-file route read `git diff --cached --raw -z --diff-filter=AMT`, and four things
emptied that list before any of its refusals were reached. An ordinary `git mv` of a fixture is
paired as a single record with two paths, which the filter deleted, so a file carrying a synthetic
patient name, a birthdate, a dashed SSN and an email at a non-test domain moved into the fixture
directory and the gate printed `OK: no hits` and exited 0. The same move with those identifiers
edited into the destination in the same staging passed identically. A `git mv` of a symbolic link put
a mode-120000 entry under a scan root the same way, defeating the refusal added for exactly that
shape. A `diff.ignoreSubmodules = all` setting in the caller's configuration dropped a staged gitlink
from the output entirely, so the same index refused at exit 2 without that setting and reported clean
with it. And a path recorded unmerged was returned by neither filter letter, so the gate attested
clean over an index it cannot read: such a path is held at one or more of stages 1, 2 and 3 and never
at stage 0, and stage 0 is what the `:<path>` form this route reads with names.

The route now reads `git diff --cached --raw -z --no-renames --ignore-submodules=none
--diff-filter=AMTUB`. `--no-renames` makes a two-path record impossible, so a moved file arrives as
an ordinary single-path add and the record stride stops depending on the caller's `diff.renames`,
verified at `true`, `copies` and `false` and under `diff.renameLimit=1`. `--ignore-submodules=none`
restores a record the configuration could delete. `U` is in the filter so an unmerged path can be
refused rather than scanned, with its own message, because such a record's destination mode is
`000000` and the existing refusal would have described it with a sentence about symbolic links that
is false for it. Nothing rests on what `git show` does with an unmerged path: the route refuses
before it would call it, and an earlier draft that pinned that exit code did not reproduce across git
versions.

The new enumeration is a superset of the old one and not a strictly larger set: the two are equal
whenever nothing is renamed, copied, unmerged or hidden by that setting, and larger only when
something is. Nothing the old invocation enumerated stops being enumerated, and the route's path
scope is unchanged.

`B` is in the filter because `-B` is not inert, and the mechanism is sharper than a `B` record the
filter drops. A complete rewrite under `-B` prints a single-path record whose status letter is still
`M`, with a break score, which the record reader parses happily, so a reader checking the raw output
concludes the filter keeps it. It does not: the filter classifies a broken pair as `B` whatever
letter it prints. Measured on one index over a wholly rewritten file carrying a dashed SSN,
`-B --diff-filter=AMTU` returns empty while `-B --diff-filter=B` and `-B --diff-filter=AMTUB` each
return the same record, and a copy of the scanner with `-B` injected exits 0 reporting no hits on the
superseded filter and 1 with the hit on the shipped one. `-M`, `-C` and `--find-copies-harder` each
turn detection back on over the top of `--no-renames` and empty the route again; none of the four may
be added.

Stated narrowly, so it is not read as more than it is: the all-mode sweep is untouched, since it has
no concept of a rename; the scan roots' own paths are still outside the staged route's scope; neither
route reaches this package's inline test fixtures; and the scanner still has no rule that a sweep
observing zero targets must refuse.
