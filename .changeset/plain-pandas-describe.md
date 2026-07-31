---
"@cosyte/astm": patch
---

The alt text on the README's Cosyte mark now says how its two overlapping rounded squares differ, one solid and one outlined.

It read "a plus mark set in two overlapping rounded squares, beside the Cosyte wordmark", which names two shapes and nothing about what tells them apart. Both tiles show a filled rear square behind an outlined front one, so a reader who cannot see the image was told there were two shapes with no way to picture either.

This package was the first to carry the `<picture>` block, and the wording settled afterwards on the twelve surfaces that followed it. The block is now byte-for-byte the one those twelve carry, copied rather than retyped, so the thirteen agree by construction. Nothing else about the block changed: the same two tiles, the same media query, the same fallback to the light-ground tile when a renderer strips `<source>`.

The front shape is very slightly taller than wide, so "rounded squares" is a small imprecision, and it is kept on purpose: it reads correctly aloud, and one wording across every package is worth more than the millimetre.

No runtime behaviour changed: the parser, the frame codec, the LTP reducer, and the emit path are not part of this change.
