# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets). Changesets drives
the **version bump**, the **publish**, and the **release section in `CHANGELOG.md`**: a release
writes its own version heading there from the changesets it consumed. So **the changeset summary
is the changelog entry**. Write it there and do not hand-edit `CHANGELOG.md`, whose sections above
`## Released before this file was generated` are generated output. The first sentence of a summary
also becomes the release headline, so write it for a consumer, with no internal identifier.

Add a changeset for every meaningful change:

```bash
pnpm changeset
```

Below `1.0.0` every release is a patch, so write `patch` for every changeset. A breaking or
narrowing change to the public surface, which is everything `src/index.ts` exports and the
behaviour behind it, ships as a patch too. Its changeset states the change and what a caller must
do about it, in the summary, because the summary is the changelog entry and the only place a
consumer is told. A feature, a fix and a change nobody installing the package can observe are
`patch` as well.

Never write `minor` or `major`. `test/scripts/release-readiness.test.ts` fails a pending set that
carries either, and a `major` on a `0.x` version would resolve to `1.0.0`.

`test/scripts/release-readiness.test.ts` fails on the first changeset after each release until the
pending set is audited in `documentation/release-readiness.md` and the published base is moved.
