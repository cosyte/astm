---
"@cosyte/astm": minor
---

**This is 0.1.0, the first release whose public API we treat as settled.**

What is covered, and what you can build against:

- Reading ASTM E1394 (CLSI LIS02-A2) records: `H`, `P`, `O`, `R`, `C`, `Q`, `M`, `S` and `L`, with
  the delimiters each header declares, escape sequences decoded before a value is split, values and
  units surfaced exactly as sent, abnormal flags and result status interpreted without guessing, and
  every tolerated deviation reported as a stable warning code instead of a thrown error.
- Framing and transport per ASTM E1381 (CLSI LIS01-A2): checksum-verified frame decoding and
  composing, the 240-byte split, framed versus raw detection, and a pure receiver state machine for
  the `ENQ`/`ACK`/`NAK`/`EOT` exchange that never acknowledges a frame it could not verify.
- Emitting spec-clean records and frames (`buildAstmMessage`, `serializeAstmRecords`,
  `serializeFramedAstm`), which write only the values you supply and never a default clinical value.
- Mapping analyzer local codes to LOINC through a LIVD catalog you supply, and date conversions
  (`toObject`, `toISO`, `toDate`) that never assume a timezone.

What the version promises. The exported names, options, return shapes and warning codes are the
surface we keep stable. While the package is below 1.0, a breaking change bumps the minor version
(0.1 to 0.2) and is called out in this changelog with its migration; a fix that changes no public
value ships as a patch. Upgrading from 0.0.x is itself breaking in the LIVD mapping and in what
`primaryCode()` returns: read the entries below before you upgrade.

What is not covered yet. No named per-vendor profile ships: the built-in set is `default` and
`referenceCorpus`. No LOINC, SNOMED or LIVD data is bundled, and no LOINC is validated. The
transfer protocol's timers (contention, timeouts, retransmit) are yours to drive. The wire is read as
Latin-1. Three behaviors (forward scoping of redeclared delimiters, the Latin-1 encoding and the
reserved-byte set) are reasoned from this package's reader rather than cited to the standard's
purchase-gated text.
