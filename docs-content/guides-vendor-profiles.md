---
id: guides-vendor-profiles
title: Write a vendor profile
sidebar_label: Write a vendor profile
description: "Record one documented analyzer deviation in a profile without quieting any other warning, and see the safety gate that bounds every profile."
---

# Write a vendor profile

An analyzer that deviates from the standard in a documented, harmless way makes a lenient parse warn
on every message it sends. Turning the warning off everywhere is the wrong fix: the next instrument
needs it. A **profile** is how you say "I expect this one deviation, from this instrument, and here
is the document that says so", while every other tolerance the parser applies stays exactly as loud
as it was.

**We ship no named per-vendor profile, and that is deliberate.** The two built-ins are
`astmProfiles.default`, a conservative baseline that tolerates nothing, and
`astmProfiles.referenceCorpus`, grounded firsthand in the redistributable public reference corpus.
A named per-vendor built-in ships only when a public, vendor-attributed quirk document grounds it,
and inspection of the public corpus found the record layer spec-clean, so none is asserted. The
engine fully supports them; you write the one your instrument's interface document describes,
because you are the one who has that document. Naming an analyzer as an example of a behavior is
not the same thing as shipping a profile for it, and this page does the first and not the second.

## Apply a vendor profile

Build a profile with `defineAstmProfile`, then hand it to the parser. Nothing else changes: the same
call, the same message shape, the same accessors.

```ts runnable
import { defineAstmProfile, parseAstmRecords } from "@cosyte/astm";

const site = defineAstmProfile({
  name: "site-analyzer",
  description: "Bench analyzer on the chemistry line",
  tolerate: [
    {
      code: "ASTM_NONSTANDARD_DELIMITERS",
      rationale: "declares its own delimiter set in every header, per its interface document",
    },
  ],
  provenance: { source: "Bench analyzer host interface document", reference: "on file, internal" },
});

const raw = "H#~*!\rR#1#^^^687#28.6#U/L##N##F\rL#1\r";
const withProfile = parseAstmRecords(raw, { profile: site });

withProfile.warnings[0]?.code; // => "PROFILE_QUIRK_APPLIED"
withProfile.warnings[0]?.toleratedCode; // => "ASTM_NONSTANDARD_DELIMITERS"
```

Without the profile the same stream reports `ASTM_NONSTANDARD_DELIMITERS` at the header. With it,
the warning is **re-badged, not removed**: it comes back as `PROFILE_QUIRK_APPLIED`, flagged
`expected`, carrying the profile's name and the code it stands in for. So a reviewer reading your
logs can still see the deviation happened, and can see which document said it was fine.

A few things worth knowing while you write one:

- **`rationale` is required on every toleration** and `provenance` is where the grounding goes. A
  profile with no reason recorded is a warning switched off with the reason lost.
- **`match` narrows a toleration structurally**, to a record type and a 1-based field index, so you
  can expect a deviation in result units without blanket-tolerating it across the message. Matching
  is on structural identifiers only; there is no matching on any field value.
- **`extends` composes profiles.** Lineage, tolerations, transport, and provenance merge, and the
  merged result is re-validated, so nothing gets in through a hand-built parent.
- **`transport` forces raw or framed** for a vendor whose TCP link drops framing, instead of leaving
  it to leading-byte detection.
- **`describe()`** prints the whole thing back as text, which is what to paste into a review.

```ts runnable
import { defineAstmProfile, resolveProfileTransport } from "@cosyte/astm";

const site = defineAstmProfile({
  name: "site-analyzer",
  tolerate: [
    {
      code: "ASTM_NONSTANDARD_DELIMITERS",
      rationale: "declares its own delimiter set in every header",
      match: { recordType: "H" },
    },
  ],
  transport: "raw",
  provenance: { source: "Bench analyzer host interface document", reference: "on file, internal" },
});
const child = defineAstmProfile({ name: "site-analyzer-b", extends: site, tolerate: [] });

resolveProfileTransport(site); // => "raw"
child.lineage; // => ["site-analyzer", "site-analyzer-b"]
child.describe?.().split("\n")[0]; // => "Profile 'site-analyzer-b'"
```

Register it as the process default with `setDefaultAstmProfile` when every stream on a service comes
from the same instrument; pass it per call when they do not. An explicit `profile` option always
wins, and `{ profile: null }` opts one call out of the default. The default is the one piece of
module-level state in the package, so a test that sets it clears it again with
`setDefaultAstmProfile(null)`.

## The profile safety gate

A profile can only ever tolerate a deviation that **cannot cost you a value**, and the rule that
decides which those are is **default-deny**.

Every warning code in the three registries the gate covers, the record codes, the frame codes and
the transport codes, is safety-critical **unless** it is on the library's tolerable list, and a code
added later is safety-critical by default until it is argued onto that list. Name a safety-critical
code in `tolerate` and `defineAstmProfile` throws `AstmProfileDefinitionError` rather than building
the profile. Ask `isSafetyCriticalCode(code)` when you want the answer for a specific code; do not
copy a list of codes into your own source, because the set moves with the library and every
snapshot of it written down has gone stale.

The gate is enforced twice, and the second time is load-bearing rather than redundant.
`AstmProfile` is a plain interface, so a hand-authored object literal type-checks and never passes
through the factory at all. `applyAstmProfile` therefore re-checks at apply time and declines to
downgrade a safety-critical warning whatever the profile says, so the original warning survives and
`{ strict: true }` still escalates it.

**A profile never alters an extracted value.** The transform runs at the warning layer and nowhere
else: it re-badges a warning the profile expects, no warning is ever dropped, no record, field or
value is touched, and a spec-clean message parses byte-identically with or without a profile. That
is why a profile is safe to apply to production traffic, and it is also the bound on what one can do
for you. A profile cannot repair a stream. Where the parser reports that a reading is contested, the
answer is to read the raw line, not to tolerate the code.

## Reference

- [`defineAstmProfile`](./api/README.md#defineastmprofile),
  [`DefineAstmProfileOptions`](./api/README.md#defineastmprofileoptions) and
  [`AstmQuirkTolerance`](./api/README.md#astmquirktolerance)
- [`astmProfiles`](./api/README.md#astmprofiles),
  [`setDefaultAstmProfile`](./api/README.md#setdefaultastmprofile) and
  [`isSafetyCriticalCode`](./api/README.md#issafetycriticalcode)
- [Handle warnings and fail fast](./handle-warnings.md): matching a warning code without a profile.
- [Limitations](./limitations.md): the boundary, including the deviations no
  profile may tolerate.
