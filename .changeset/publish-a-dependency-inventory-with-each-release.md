---
"@cosyte/astm": patch
---

Publish a machine-readable dependency inventory with each release.

Every published version now carries a CycloneDX inventory of what that build was made from, attached
to its GitHub release as a downloadable asset. The inventory names this package and the version
being built alongside every dependency that build resolved, runtime and build-time alike,
transitively, each with the exact version it resolved to. A team evaluating this package for a
regulated laboratory can now read what it is built from and feed it to their own tooling, instead of
taking a sentence about dependencies on trust or reproducing an install to find out.

It is produced and checked by the repository itself, from the checkout, with no registry credential.
The check runs before the registry upload: a version whose inventory cannot be produced, or which
does not truthfully describe the build, fails the release rather than publishing with nothing to
describe it.

What the inventory does not claim. It states what was resolved and nothing about whether that is
safe: it is not a vulnerability scan, a licence assessment, an attestation or a signature, and npm
provenance remains the separate thing it already was. It carries component names and versions only.

No exported value, type or behaviour changes, and no byte is emitted differently.
