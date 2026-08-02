---
"@cosyte/astm": patch
---

Stop one unescaped `&` in a value from swallowing every field after it
(`ASTM-UNESCAPED-ESCAPE-SWALLOWS-TAIL`). `PRE-EXISTING`, shipped `0.0.1` through `0.0.8`.

The escape codec read an escape character with no closing escape character as the opening of a
sequence and copied from it to the end of the record, so every following field merged into the field
it sat in, and no warning code existed for the condition. Measured on `064c078`:
`R|1|^^^687|28.6&|U/L||N||F` under the canonical `H|\^&` read back `value = "28.6&|U/L||N||F"` with
units, abnormal flag and status all gone and status `unspecified` rather than `final`, with
`warnings: []`; `O&BRIEN` in a surname cost the patient their birth date and sex, also silently. Emit
then re-escaped the merged text into a spec-clean-looking line that re-parsed to the same wrong
value, so a round trip baked the mis-read in instead of surfacing it.

An escape sequence is now exactly three characters (the escape character, one body character, the
escape character), which is all the four mnemonics `&F&` `&S&` `&R&` `&E&` ever need, and the split
and the decoder share that one definition. An escape character heading no such sequence is read as
the literal character it is: the value keeps the byte that arrived, every delimiter after it still
splits the record, and nothing is invented to close a sequence the sender did not open. The bound
also removes a non-local behavior, where whether a field kept its value depended on some later field
happening to carry an escape character too.

New warning code `ASTM_UNPAIRED_ESCAPE_CHARACTER` and exported factory `unpairedEscapeCharacter`
report each such character, positioned, carrying no field text. The code is **tolerable**, so a
profile may expect it on a feed that sends bare ampersands; untolerated, `{ strict: true }` refuses.

**Behavior change for consumers.** A record carrying a bare escape character now parses into its
real fields rather than one merged field, so a consumer reading `value`, `units`, `status`, a
`birthDate` or a `sex` off such a record gets a different (correct) answer, and a `{ strict: true }`
parse that used to succeed on one now throws unless a profile expects the code.
`ASTM_UNKNOWN_ESCAPE_SEQUENCE` is unchanged for a single unrecognized body (`&Z&`). A multi-character
body is no longer one atom: its bytes are all preserved, but a delimiter **inside** such a body now
splits, which moves every field after it, and the report becomes one unpaired-character warning per
loose escape character rather than one unknown-sequence warning.

**Scope.** This fixes the bare escape character. The atom rule is unchanged, so an `&X&` sequence
whose body **is** a delimiter still swallows that delimiter and still costs the value, the units and
the status together (`R|1|^^^687|28.6&|&U/L||||F` reads `28.6&|&U/L`). That case is never silent, but
its only report is the tolerable `ASTM_UNKNOWN_ESCAPE_SEQUENCE`, so a profile expecting that code
lets a strict parse accept it. It is recorded as a known defect and deliberately not closed here:
narrowing the atom would break the guarantee it exists for, that `&F&` stays one token under a set
naming `F` as a delimiter.
