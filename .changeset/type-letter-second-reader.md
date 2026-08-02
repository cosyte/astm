---
"@cosyte/astm": patch
---

Close the two findings `ASTM-UNKNOWN-RECORD-REMERGE` measured, pinned and deliberately did not fix,
both of which follow from a record's type letter having acquired load-bearing readers
(`ASTM-TYPE-LETTER-SECOND-READER`).

**The value loss, which outranked the other.** Delimiters are re-read at every `H`, keyed on the same
letter message grouping uses, so a header the reader could not recognize does not re-scope them and
the whole following message is tokenized with the previous header's set. Where the sets differ the
records do not split at all, and every modeled field of them is absent: a `99.9 mmol/L` final result
read back with no value, no units and status `unspecified`, with the unrecognized-type warning as the
only report on the stream. That warning says a letter was unreadable; it never said a value had gone.

New warning code `ASTM_RECORD_FIELDS_UNSEPARATED` and exported factory `fieldsUnseparated` report it:
a record carrying content beyond its type letter that still yields exactly one field contains no field
separator, so the delimiters in force are not that record's set. One warning per affected record, at
its own position, carrying no field data. `WARNING_CODES` goes from 15 members to 16, and the code is
safety-critical by construction (the forbidden set is computed as every known code minus the tolerable
allow-list), so no profile can quiet it and `{ strict: true }` refuses.

Reported, never repaired: the record is not re-split on a set no header declared, because that would
invent data, and the raw line is surfaced intact. The detector is keyed on the observed collapse
rather than on the mangled header, which is simpler (identifying that header would itself require
guessing a byte) and strictly wider: it also closes the same silent collapse reachable with no mangled
header at all, which parsed with zero warnings on the previous release.

**The classification fail-safe.** `classifyMessage` counts `Q` / `R` / `O` by letter, so the
documented "`Q` dominates, a query is never read as a result set" guarantee held only while every
letter was legible. A `Q` carrying one stray leading byte classified `kind: "results"` with
`isHostQueryRequest: false`, and the `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND` warning went with the `Q` it
was counting. The intended letter is still never inferred; the classifier declines the positive answer
instead. An unsupported record with no `Q` read alongside it now yields `kind: "indeterminate"`, and
the new `AstmMessageClassification.hasUnrecognized` reports why. A `Q` that was read still dominates,
since an unreadable letter can only add a kind, never remove a query already on the wire.

Behavior change for a consumer branching on `kind` or `isHostQueryRequest`: on a stream carrying an
unrecognized record letter, a previously positive `kind` now reads `indeterminate`. That is the fix,
and it moves in the fail-safe direction; a stream whose every letter is legible is unchanged.
`hasQuery` / `hasResults` / `hasOrders` stay truthful, and the extractors are untouched. Kept on the
`0.0.x` pre-alpha ladder as a patch, per the repo's version policy.

Still open and deliberately deferred, as before: the **merge itself**. A lenient parse still reads the
two messages as one, and recognizing a mangled header as a header means guessing at a byte the sender
did not send. A warning plus a strict refusal remains the honest disposition. What changed is that the
merge's cost in lost values is now reported alongside it, per record, rather than left to be inferred
from a letter warning.

No clause is claimed for any of this. That a record's fields are separated by the declared field
delimiter is read off this package's own emit contract and off every fixture in the repository, not
off a normative sentence: the relevant CLSI text is withheld from the free sample, the surrounding
standards are paywalled, and the redistributable reference corpus hardcodes the canonical delimiters
and never reads the declaration, so it cannot ground a delimiter question either.
