---
"@cosyte/astm": patch
---

The `VERSION` export now reports the version you actually installed, and the type it emits widens from
the version literal to `string`.

`@cosyte/astm@0.0.1` shipped exporting `VERSION === "0.0.0"` while its manifest read `0.0.1`, and the
installation docs tell a reader to print that exact constant as the install smoke test. The constant is
corrected and is now derived from the manifest during the release, with a test asserting the two agree
so they cannot drift apart again. Consumers who relied on `typeof VERSION` narrowing to the literal
`"0.0.0"` will see `string` instead.

The `README.md`, `docs-content/intro.md`, and `docs-content/installation.md` opening blocks each still
described the package as unpublished, and the installation page told readers to consume it from source
rather than from npm. All three now describe the released package. The `README.md` opener is also
replaced by a "What it covers" summary of the record, framing and transport, emit, profile, and
terminology layers, so it describes what the library does. The ASTM designations `E1381` and `E1394`
are reference material and are untouched. A stale 307 KB `cosyte-astm-0.0.0.tgz` pack artifact is
removed from the repository root and `*.tgz` is gitignored.
