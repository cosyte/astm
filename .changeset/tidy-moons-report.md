---
"@cosyte/astm": patch
---

Make the package's own publish gate fail when a build would ship without its type declarations.

This is a release-tooling fix with no runtime change. The library's code, its public surface and its built output are all identical to the previous version.

The gate that checks the published type declarations is `@arethetypeswrong/cli`, and it exits `0` when it finds no types at all, because an untyped package is a legitimate npm package and the tool treats that as a description rather than a problem. For a package like this one, which does ship declarations, the same result means the declarations were missing from the tarball, which is a broken publish being reported as a pass. Measured here on a quiet machine with nothing running in parallel: with `dist/` removed, and again with only the two declaration files removed, the check printed "This package does not contain types." and exited `0` both times. The trigger is ordinary, not exotic. On one timed build of this package the JavaScript entry points were written at 1,176 ms and the declaration files at 3,063 ms, so for 1,887 ms the output directory held JavaScript and no declarations at all.

The gate now runs through a wrapper that checks, before anything else, that every file the manifest promises to ship actually exists and is non-empty, and names the missing one if not. It then treats a report of "no types" as the failure it is. Four argument and configuration routes that suppress the output the wrapper reads were each measured to restore the original silent pass, and all four are refused outright rather than quietly honoured.

What this means for you: nothing changes in what you install or how you use it. It closes a route by which a future release of this package could have shipped without the TypeScript declarations your editor and compiler rely on, and reported success while doing so.

Provenance: `ATTW-FALSE-GREEN-PORT`, porting the fix shipped in `@cosyte/terminology`. Every claim above was re-measured against this package rather than carried over.
