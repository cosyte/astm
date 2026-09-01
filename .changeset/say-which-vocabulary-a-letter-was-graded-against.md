---
"@cosyte/astm": minor
---

**Every interpreted abnormal flag and result status now says which vocabulary it was graded against, and `HU`/`LU` are recognized.** The `R` record's flag and status letters come from vocabularies that move on other bodies' schedules, while the record grammar around them is archived and frozen. Reporting a letter as `"undefined"` without saying what it was compared against hid that: a consumer holding `{ recognized: false, meaning: "undefined" }` could not tell a code **no published vocabulary defines** from a code **this library had not caught up to**. That distinction is now on the value itself.

Added:

- `AbnormalFlag.vocabulary`: the published code system the flag was graded against, named by `system` (identifier) and `version`, present whether or not the letter was recognized. It is the HL7 v3 ObservationInterpretation code system, which carries the concepts kept aligned with the HL7 v2 Table 0078 interpretation codes this library has always recognized. **The version records what this library compared against; it is not a claim about which version the sender meant**, and it is not a conformance statement about your instrument.
- `ResultStatus.vocabulary`: always the explicit **no citable published source**, with `attributed: false` and fixed prose in `reason` saying why. The normative text that would bind the status letter set is purchase-gated and has not been read here, and a neighbouring HL7 table whose letters partly agree is not adopted in its place: that would be an assertion nothing in the public record supports. An unattributed set is deliberately distinguishable from an absent attribution, and it never carries an identifier.
- `HU` (`"significantly-high"`) and `LU` (`"significantly-low"`) are recognized abnormal flags. Both are active concepts in the graded vocabulary and were previously absent, so a feed sending either got a warning and `"undefined"`. They are distinct from `H`/`L` (merely outside the interval), from `HH`/`LL` (critical) and from the directional `U`/`D` (a change since the last result), all six of which keep the readings they had. The recognized set is now eighteen letters: `L`, `H`, `LL`, `HH`, `<`, `>`, `N`, `A`, `AA`, `U`, `D`, `B`, `W`, `S`, `R`, `I`, `HU`, `LU`.
- `ABNORMAL_FLAG_CODES`, the recognized set as a list; `ABNORMAL_FLAG_VOCABULARY` and `RESULT_STATUS_VOCABULARY`, the two attribution constants; `describeVocabulary`, which renders one as fixed prose; and the `NamedVocabulary`, `UnattributedVocabulary` and `VocabularyAttribution` types.

Changed:

- The `ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG` and `ASTM_RECORD_UNDEFINED_RESULT_STATUS` warning **messages** now carry the same attribution the interpreted value reports, read from the same constant so the two cannot drift. Both warning **codes** are unchanged, and both messages remain value-free: position and fixed prose only, never field text.

Nothing else moved. No tolerance was widened: recognition is still exact match after the surrounding whitespace is trimmed, so `hu` and `f` are reported unrecognized with their raw text intact rather than folded into a match. An unrecognized flag is still never coerced to `normal`, an absent status is still never `final`, and no other concept from that code system is adopted, including the deprecated `H>` and `L<` whose replacements `HU` and `LU` are. The attribution is interpretation output only: a parsed and re-serialized record emits byte-identical output, with no identifier, version or attribution text reaching the wire. No new dependency.
