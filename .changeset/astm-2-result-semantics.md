---
"@cosyte/astm": patch
---

Safety-critical result semantics (ASTM-2, roadmap Phase 2): turn the raw `R`-record letters into
modeled, fail-safe semantics under one rule — never a confident wrong value. Abnormal flags (field 7)
are modeled against HL7 Table 0078 with an `undefined` fallback that is never coerced to `normal`;
result status (field 9) models correction (`C`, supersedes) and cancel (`X`, cancelled) so a
superseded/cancelled result never reads as active-final, and an absent status is typed `unspecified`
(never assumed final); reference ranges (field 6) parse `low-high` / `<high` / `>low` with verbatim
bounds and never fabricate one; a numeric value without units warns (`ASTM_RECORD_UNITS_ABSENT`) and
units are never defaulted or converted. Adds `interpretAbnormalFlag`, `interpretResultStatus`,
`parseReferenceRange`, and the `flag` / `status` / `range` fields on `ResultRecord`; the raw strings
still coexist with the modeled views. Four new value-free warning codes; the reference-range delimiter
is `[OSS-derived]` pending the purchased CLSI LIS02-A2.
