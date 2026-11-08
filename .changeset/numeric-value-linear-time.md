---
"@cosyte/astm": patch
---

Checking whether a result value is numeric, the check behind the units-absent warning, now takes time linear in the value's length; a value padded with a long run of spaces held the parser for seconds (about 3.5 at 50,000 spaces), and the time grew with the square of the run.

Every value is classified exactly as before, so the same results warn.
