---
id: result-flags-and-statuses
title: Result flags and statuses
sidebar_label: Result flags and statuses
description: "Every abnormal-flag letter and result-status letter the parser recognizes, the meaning each is read as, and the reference-range forms it parses."
---

# Result flags and statuses

The letters a result record's abnormal flag (field 7) and result status (field 9) are read against,
and the reference-range forms (field 6). Matching is exact after the surrounding whitespace is
trimmed: letter case is never folded. [Read a result safely](./read-results.md) shows how to use
them.

## Abnormal flags

Graded against the HL7 v3 ObservationInterpretation code system, which carries the concepts kept
aligned with the HL7 v2 Table 0078 interpretation codes. `flag.vocabulary` names the system and the
version we compared against. `ABNORMAL_FLAG_CODES` is this list in code.

| Letter | `flag.meaning`            | Notes                                                              |
| ------ | ------------------------- | ------------------------------------------------------------------ |
| `L`    | `below-normal`            |                                                                    |
| `H`    | `above-normal`            |                                                                    |
| `LL`   | `critically-below-normal` | the critical (panic) low                                           |
| `HH`   | `critically-above-normal` | the critical (panic) high                                          |
| `<`    | `below-scale`             | below the measurable range                                         |
| `>`    | `above-scale`             | above the measurable range                                         |
| `N`    | `normal`                  |                                                                    |
| `A`    | `abnormal`                |                                                                    |
| `AA`   | `very-abnormal`           |                                                                    |
| `U`    | `significant-change-up`   | a change since the last result, not a unit or a magnitude          |
| `D`    | `significant-change-down` | a change since the last result, not a unit or a magnitude          |
| `B`    | `better`                  |                                                                    |
| `W`    | `worse`                   |                                                                    |
| `S`    | `susceptible`             | microbiology susceptibility                                        |
| `R`    | `resistant`               | microbiology susceptibility; not the repeat delimiter here         |
| `I`    | `intermediate`            | microbiology susceptibility                                        |
| `HU`   | `significantly-high`      | outside the interval by enough to want attention, not yet critical |
| `LU`   | `significantly-low`       | outside the interval by enough to want attention, not yet critical |

Any other letter, including the deprecated `H>` and `L<` that `HU` and `LU` replace, reads
`meaning: "undefined"` and `recognized: false`, keeps its `raw` text, and raises
`ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG`. It is never read as `normal`. An empty field gives no `flag`.

## Result statuses

No citable published source binds these letters: the normative text is purchase-gated and we have
not read it. So `status.vocabulary.attributed` is always `false`, and `status.vocabulary.reason` says
why.

| Letter | `status.meaning`         | `isActiveFinal` | `supersedes` | `cancelled` |
| ------ | ------------------------ | --------------- | ------------ | ----------- |
| `F`    | `final`                  | `true`          | `false`      | `false`     |
| `C`    | `correction`             | `false`         | `true`       | `false`     |
| `P`    | `preliminary`            | `false`         | `false`      | `false`     |
| `R`    | `previously-transmitted` | `false`         | `false`      | `false`     |
| `S`    | `partial`                | `false`         | `false`      | `false`     |
| `I`    | `pending`                | `false`         | `false`      | `false`     |
| `X`    | `cancelled`              | `false`         | `false`      | `true`      |
| absent | `unspecified`            | `false`         | `false`      | `false`     |
| other  | `undefined`              | `false`         | `false`      | `false`     |

`status` is always present. An absent or empty field is `unspecified`, never `final`. Any other
letter is `undefined`, keeps its `raw` text, and raises `ASTM_RECORD_UNDEFINED_RESULT_STATUS`.

## Reference ranges

| Form          | Example    | `range.kind` | Bounds set                 |
| ------------- | ---------- | ------------ | -------------------------- |
| `low-high`    | `3.5-5.0`  | `closed`     | `low` and `high`           |
| `<high`       | `<5`       | `open-low`   | `high`                     |
| `>low`        | `>10`      | `open-high`  | `low`                      |
| anything else | `see note` | `unparsed`   | none; `raw` keeps the text |

A bound is an optional minus sign, digits, and an optional fraction, and it is kept as the text it
was, never converted to a number. Spaces around the `-`, `<` or `>` are allowed. The delimiter `-`
and the open-ended forms come from permissively licensed reference parsers and vendor transcripts,
not from the purchased text of the standard. An `unparsed` range raises
`ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE`.

## In the API reference

- [`interpretAbnormalFlag`](./api/README.md#interpretabnormalflag),
  [`AbnormalFlag`](./api/README.md#abnormalflag) and
  [`ABNORMAL_FLAG_CODES`](./api/README.md#abnormal_flag_codes)
- [`interpretResultStatus`](./api/README.md#interpretresultstatus) and
  [`ResultStatus`](./api/README.md#resultstatus)
- [`parseReferenceRange`](./api/README.md#parsereferencerange) and
  [`ReferenceRange`](./api/README.md#referencerange)
- [`ABNORMAL_FLAG_VOCABULARY`](./api/README.md#abnormal_flag_vocabulary) and
  [`RESULT_STATUS_VOCABULARY`](./api/README.md#result_status_vocabulary)
