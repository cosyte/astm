---
"@cosyte/astm": patch
---

A patient name whose last part is empty now parses: `^JANE^` reads `{ raw: "^JANE^", first:
"JANE" }`, where it used to read no name at all, so a name built with only a first or middle part
reads back equal. An empty name part is now absent from `name` whether the sender wrote its
delimiter or not: `DOE^^` reads `{ raw: "DOE^^", last: "DOE" }`, where `first` and `middle` used to
be the empty string, the same as `DOE`. A field with no text in any of the three parts still reads
no name.
