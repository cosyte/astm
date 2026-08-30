---
id: guides-vendor-profiles
title: Vendor profiles
sidebar_position: 2
---

# Vendor profiles

An analyzer that deviates from the standard in a documented, harmless way makes a lenient parse warn
on every message it sends. Turning the warning off everywhere is the wrong fix: the next instrument
needs it. A **profile** is how you say "I expect this one deviation, from this instrument, and here
is the document that says so", while every other tolerance the parser applies stays exactly as loud
as it was.

**This package ships no named per-vendor profile, and that is deliberate.** The two built-ins are
`astmProfiles.default`, a conservative baseline, and `astmProfiles.referenceCorpus`, grounded
firsthand in the redistributable public reference corpus. A named per-vendor built-in ships only
when a public, vendor-attributed quirk document grounds it, and inspection of the public corpus
found the record layer spec-clean, so none is asserted. The engine fully supports them; you write
the one your instrument's interface document describes, which is the only person who has that
document. Naming an analyzer as an example of a behaviour is not the same thing as shipping a
profile for it, and this page does the first and not the second.

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
- **`extends` composes profiles.** Lineage, tolerations, transport and provenance merge, and the
  merged result is re-validated, so nothing gets in through a hand-built parent.
- **`transport` forces raw or framed** for a vendor whose TCP link drops framing, instead of leaving
  it to leading-byte detection.
- **`describe()`** prints the whole thing back as text, which is what to paste into a review.

Register it as the process default with `setDefaultAstmProfile` when every stream on a service comes
from the same instrument; pass it per call when they do not.

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

## More

- [Branch on a specific vendor quirk](./guides-overview): matching a warning code without a profile.
- [What it does, and does not do](./limitations): the honest boundary, including the deviations no
  profile may tolerate.
