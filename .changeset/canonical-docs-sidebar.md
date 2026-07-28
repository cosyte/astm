---
"@cosyte/astm": patch
---

Documentation: the "what it does and does not do" page moves out of a package-specific "About"
category and into **Troubleshooting**, so the published documentation uses the same section order as
every other `@cosyte/*` package. The page's URL is unchanged, so existing links still resolve.

The status note on the README, the overview page and the install page no longer quotes a specific
published version. Nothing bound that sentence to the manifest, so every release made it wrong; the
package is described as published on the `0.0.x` pre-alpha ladder, and the exact version is left to
the registry. The exported `VERSION` constant is unaffected and still reports the version installed.
