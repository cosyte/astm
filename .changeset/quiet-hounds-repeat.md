---
"@cosyte/astm": patch
---

Read the bytes git carries in the PHI sweep, as a union with the working-tree walk.

The sweep reconciled the paths it walked against the paths git tracks, and a comparison of path sets
is satisfied by a working tree carrying different content at those paths. Four states were
reproduced on the previous release, each reporting no hits and exiting zero over a synthetic stream
carrying a patient name, a mother's maiden name, a birthdate and a dashed Social Security Number:
decoy content at a tracked path, a tracked path outside every scan root, a tracked symbolic link or
nested repository outside every scan root, and an empty index against which every check passes
vacuously. All four now report or refuse.

It is a union and never a replacement: no scan root was narrowed, a file the walk reads is still
read from disk with exactly the views it had, and a blob whose bytes were provably already scanned
is skipped by byte comparison so nothing is reported twice. The sweep reported eighteen tracked
files outside every scan root that no route had opened; one carried this package's own published
contact address, already public in every release's registry metadata and not patient data, now
declared with the cost of that declaration written beside it. A positive control places this
package's own manifest at the same out-of-root path in a throwaway tree and strikes the
declaration, so the same corpus reports the address rather than passing over an unopened file.
