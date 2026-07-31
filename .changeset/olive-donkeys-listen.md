---
"@cosyte/astm": patch
---

The Cosyte mark now opens the README, and follows the reader's color scheme.

A `<picture>` block above the H1 offers a dark-ground tile behind a `prefers-color-scheme: dark` media query, and carries the light-ground tile as the inner `<img>`. On a renderer that honors the switch, the mark sits on a ground that matches the page it is read on.

**The failure mode is safe.** A renderer that strips `<source>` renders the inner `<img>`, so the worst case is a light-ground mark on a dark page, never a missing or broken image. Whether npm's README renderer honors the switch is exactly the question this is meant to settle, and it is settled by looking at the published page.

The alt text names what the mark is rather than repeating the filename, so a screen reader on the package page reads something useful.

**The placement is interim.** A per-package mark supersedes it once the direction is settled. The org tile is used because a matched light and dark pair of it already exists, and the per-package artwork has no light-ground variant yet, so pairing the two would leave nothing to compare.

No runtime behaviour changed: the parser, the frame codec, the LTP reducer, and the emit path are not part of this change.
