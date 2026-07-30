---
"@cosyte/astm": patch
---

Remove the em dash (U+2014) from every tracked file, and add a CI gate that keeps it out (EMDASH-CONFORMANCE).

The brand rule bans U+2014 outright across every cosyte surface and names commit messages explicitly. This was the last package it had not reached, and the only one where it did not arrive on a clean tree: 1,129 occurrences across 108 of the 142 tracked files. The sweep and the gate ship together, because a sweep with no gate grows back and a gate with no sweep reds CI on arrival.

What a consumer can observe:

- The npm `description` no longer carries the character.
- The pages published to docs.cosyte.com are rewritten, including the title of the limitations page, now `What it does, and does not do`.
- Warning and error `message` text is repunctuated, and a consumer's log prints that text. **No warning or fatal code changed**: codes are the stable contract, and the snapshot tests that pin them are untouched.
- The architecture page's layer table gave the Common layer's governing standard as a bare dash, which reads as "unstated" rather than "none". It now reads `None`.

Where the character had bracketed an aside that itself contains commas, the aside now sits in **parentheses** rather than commas, so it cannot be misread as one more item in a list.

The gate is bounded rather than total, and the bound is stated rather than implied. It matches the literal character plus its common encoded forms (the HTML entity, numeric entity, URL and backslash-u spellings, case-insensitively). It does **not** match the ES6 braced escape, and it does not match the character in a non-UTF-8 encoding such as CP1252 or UTF-16. Those are accepted limits, not oversights: the rule is about prose people write, and fixture bytes are grounded data.

No runtime behaviour changed: the parser, the frame codec, the LTP reducer, and the emit path are not part of this change.
