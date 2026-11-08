---
"@cosyte/astm": patch
---

Type declarations are now bundled by tsup 9; the JavaScript is unchanged. `index.d.ts` and
`index.d.cts` list the type-only exports in a separate `export type` statement, and the doc comment
on `VERSION` names the step that keeps it equal to the `package.json` version. The source maps
carry three type unions reflowed by the newer formatter. The package exports the same names and
types as before.
