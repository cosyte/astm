# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets). Changesets drives
the **version bump** and **publish** for `@cosyte/astm`; the human-readable release notes live in
`CHANGELOG.md` (`changelog` generation is disabled in `config.json`).

Add a changeset for every meaningful change:

```bash
pnpm changeset
```

The package is on the `0.1.x` line, so pick the bump by what the change does to the public surface,
which is everything `src/index.ts` exports and the behaviour behind it:

- **`minor`** for a feature or an added public value, and for a break. Below `1.0.0` a break ships in
  the minor channel: call it out in `CHANGELOG.md` with its migration, and surface it for a decision
  before the release rather than absorbing it.
- **`patch`** for a real fix, and for a change nobody installing the package can observe.
- **Never `major`.** On a `0.x` version it resolves to `1.0.0`. Record the change as a break
  candidate for the operator instead, as section 2 of `documentation/release-readiness.md` says.

`test/scripts/release-readiness.test.ts` fails on the first changeset after each release until the
pending set is audited in `documentation/release-readiness.md` and the published base is moved.
