---
"@cosyte/astm": patch
---

The status note on the README, the overview page and the install page no longer names a version
number, because a release made that number wrong every time.

Each of the three said "published on npm at `0.0.1`" while the package was at `0.0.2`. They now say
the package is published on the `0.0.x` pre-alpha ladder and leave the exact version to the registry,
which is always accurate. The exported `VERSION` constant is unaffected and still reports the version
you installed.
