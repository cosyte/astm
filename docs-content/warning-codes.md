---
id: warning-codes
title: Warning and error codes
sidebar_label: Warning and error codes
description: "Every warning code the parser, frame decoder, transport receiver and LOINC mapping return, and every error code they throw, with what each means."
---

# Warning and error codes

Every code `@cosyte/astm` returns or throws, by registry, with one line on what it means. Each code
links to its entry in the [API reference](./api/README.md), which has the full rule. A code's name is
part of the public contract: renaming or removing one is a breaking change.

Whether a vendor profile may tolerate a warning is decided by the library, and the answer can change
between releases as codes are added, so ask `isSafetyCriticalCode(code)` rather than copying a list.
[Write a vendor profile](./guides-vendor-profiles.md#the-profile-safety-gate) explains the rule.

## Record warnings: `WARNING_CODES`

Returned on `msg.warnings` by `parseAstmRecords`, each with a record position and never a value.

| Code                                                                                                     | Meaning                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ASTM_RECORD_UNKNOWN_TYPE`](./api/README.md#astm_record_unknown_type)                                   | A record's type letter is not a modeled type. The record is kept as an unsupported record; a header not recognized as one opens no new message, so two messages can merge. |
| [`ASTM_RECORD_FIELDS_UNSEPARATED`](./api/README.md#astm_record_fields_unseparated)                       | The delimiters in force found no field separator in a record, so the whole line read as one field and none of its modeled fields survived.                                 |
| [`ASTM_NONSTANDARD_DELIMITERS`](./api/README.md#astm_nonstandard_delimiters)                             | The header declared a delimiter set other than the canonical `H\|\^&`. The set is read and followed.                                                                       |
| [`ASTM_RECORD_DELIMITER_ROLE_COLLISION`](./api/README.md#astm_record_delimiter_role_collision)           | A header named one character in two of the repeat, component and escape roles, so the boundary between those two roles is not in the bytes.                                |
| [`ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`](./api/README.md#astm_record_delimiter_swallowed_by_escape) | An escape sequence with an unrecognized body held a delimiter in force, so a boundary the bytes carried never became one.                                                  |
| [`ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT`](./api/README.md#astm_record_ambiguous_escape_alignment)       | Two alignments of the escape sequences disagree about one boundary, and the one taken split on a delimiter the other would have held.                                      |
| [`ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS`](./api/README.md#astm_record_alignment_shifted_fields)           | A contested boundary was a field boundary, so every later field, a result's units and status included, may sit in a different slot.                                        |
| [`ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD`](./api/README.md#astm_record_alignment_truncated_field)         | A contested boundary was a repeat boundary, so a field may be read short: its value and components come from its first repeat alone.                                       |
| [`ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS`](./api/README.md#astm_record_alignment_shifted_components)   | A contested boundary was a component boundary, so the components after it, such as a coding scheme or a given name, may sit in different slots.                            |
| [`ASTM_UNKNOWN_ESCAPE_SEQUENCE`](./api/README.md#astm_unknown_escape_sequence)                           | An escape sequence's body was not `F`, `S`, `R` or `E`. It is kept as written.                                                                                             |
| [`ASTM_UNPAIRED_ESCAPE_CHARACTER`](./api/README.md#astm_unpaired_escape_character)                       | An escape character started no escape sequence. It is read as the literal character and kept.                                                                              |
| [`ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT`](./api/README.md#astm_record_ambiguous_value_split)                 | A result value held an unescaped component delimiter. The whole text and the split parts are both kept.                                                                    |
| [`ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG`](./api/README.md#astm_record_undefined_abnormal_flag)             | A result's abnormal flag is not a recognized letter. It reads `undefined`, never `normal`.                                                                                 |
| [`ASTM_RECORD_UNDEFINED_RESULT_STATUS`](./api/README.md#astm_record_undefined_result_status)             | A result's status is not a recognized letter. It reads `undefined` and is never active-final.                                                                              |
| [`ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE`](./api/README.md#astm_record_unparseable_reference_range)     | A result's reference range is not `low-high`, `<high` or `>low`. It is kept as `unparsed`, with no bound invented.                                                         |
| [`ASTM_RECORD_UNITS_ABSENT`](./api/README.md#astm_record_units_absent)                                   | A result had a numeric value and no units. The units stay empty; nothing is defaulted.                                                                                     |
| [`ASTM_RECORD_ORPHAN_COMMENT`](./api/README.md#astm_record_orphan_comment)                               | A comment record had no record before it to attach to. It is attached to the message itself and kept.                                                                      |
| [`ASTM_RECORD_PARTIAL_TIMESTAMP`](./api/README.md#astm_record_partial_timestamp)                         | A timestamp's digits stop halfway through a two-digit part. The value stops at the last whole part; nothing is filled with zeros.                                          |
| [`ASTM_RECORD_UNINTERPRETED_QUERY_STATUS`](./api/README.md#astm_record_uninterpreted_query_status)       | A query record carried a request-information status. It is kept as written and not interpreted.                                                                            |
| [`ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND`](./api/README.md#astm_record_ambiguous_message_kind)               | The stream carried both a query and a result. It is classified as a host query.                                                                                            |
| [`ASTM_RECORD_DELIMITERS_REDECLARED`](./api/README.md#astm_record_delimiters_redeclared)                 | A later header declared a different delimiter set, and the records after it are read with that set.                                                                        |
| [`ASTM_RECORD_UNREADABLE_REDECLARATION`](./api/README.md#astm_record_unreadable_redeclaration)           | A later header could not declare a usable set, so the set already in force is kept.                                                                                        |
| [`PROFILE_QUIRK_APPLIED`](./api/README.md#profile_quirk_applied)                                         | A warning the active profile expects, re-badged. The original code is on `toleratedCode`.                                                                                  |

## Frame warnings: `FRAME_WARNING_CODES`

Returned by `decodeAstmFrames` and on `frameWarnings` from `parseFramedAstm`, each with a frame
number and byte offset. With `{ strict: true }` they are thrown together as an
`AstmFrameStrictError`.

| Code                                                                 | Meaning                                                                                                  |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [`ASTM_FRAME_BAD_CHECKSUM`](./api/README.md#astm_frame_bad_checksum) | A frame's checksum did not match its bytes. The frame is kept untrusted and never merged into a record.  |
| [`ASTM_FRAME_SEQUENCE_GAP`](./api/README.md#astm_frame_sequence_gap) | A frame number was not the next one, so a frame may be missing. Records are not joined across the gap.   |
| [`ASTM_FRAME_UNTERMINATED`](./api/README.md#astm_frame_unterminated) | A frame, or a record's run of frames, ended without its final terminator. No partial record is invented. |
| [`ASTM_FRAME_OVERSIZE`](./api/README.md#astm_frame_oversize)         | A frame carried more than 240 bytes of text without a split. It is kept and flagged.                     |

## Transport warnings: `LTP_WARNING_CODES`

Returned by `detectFraming` and `ltpReduce`.

| Code                                                                           | Meaning                                                                                                                      |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| [`ASTM_LTP_AMBIGUOUS_TRANSPORT`](./api/README.md#astm_ltp_ambiguous_transport) | The leading byte did not say whether the stream is framed or raw, so framed was assumed.                                     |
| [`ASTM_LTP_UNEXPECTED_EVENT`](./api/README.md#astm_ltp_unexpected_event)       | A control event arrived in a state that did not expect it, such as an `ACK` at the receiver. It is never read as acceptance. |
| [`ASTM_LTP_FRAME_REJECTED`](./api/README.md#astm_ltp_frame_rejected)           | The receiver answered a frame with `NAK`: bad checksum, unterminated, or out of sequence. Nothing from it is kept.           |

## LOINC mapping warnings: `LIVD_WARNING_CODES`

Returned by `applyLivd`, except the last, which is on the catalog's own `warnings`.

| Code                                                                                       | Meaning                                                                                                 |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| [`ASTM_LIVD_UNMAPPED_CODE`](./api/README.md#astm_livd_unmapped_code)                       | The catalog held no entry for a record's vendor code. No LOINC is guessed.                              |
| [`ASTM_LIVD_AMBIGUOUS_MAPPING`](./api/README.md#astm_livd_ambiguous_mapping)               | A vendor code matched several LOINCs that the units did not settle. All are listed and none is chosen.  |
| [`ASTM_LIVD_CATALOG_NO_LOINC_VERSION`](./api/README.md#astm_livd_catalog_no_loinc_version) | A catalog was defined without a LOINC version. Raised once, on `catalog.warnings`, and never a refusal. |

## Errors that always throw: `FATAL_CODES`

Thrown by `parseAstmRecords` as an `AstmParseError`, in lenient mode too, when there is nothing to
parse into a message.

| Code                                                                                     | Meaning                                                 |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [`EMPTY_INPUT`](./api/README.md#empty_input)                                             | The input was empty or only whitespace.                 |
| [`ASTM_RECORD_NO_HEADER`](./api/README.md#astm_record_no_header)                         | The first record is not an `H` header.                  |
| [`ASTM_RECORD_UNDECLARED_DELIMITERS`](./api/README.md#astm_record_undeclared_delimiters) | The first header could not declare all four delimiters. |

## Errors from the flat accessors: `AMBIGUOUS_CODES`

Thrown as an `AstmAmbiguousStreamError` by `patient()`, `results()`, `orders()`, `comments()` and
`query()` on a stream they cannot answer for. [Read a stream that carries several
messages](./read-several-messages.md) shows what to do instead.

| Code                                                                           | Meaning                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| [`ASTM_AMBIGUOUS_MULTI_MESSAGE`](./api/README.md#astm_ambiguous_multi_message) | A flat accessor was asked about a stream carrying more than one message. |
| [`ASTM_AMBIGUOUS_MULTI_PATIENT`](./api/README.md#astm_ambiguous_multi_patient) | `patient()` was asked about a message carrying more than one `P` record. |

## Errors from emit

Thrown as an `AstmSerializeError` by the record serializer and builder
([`AstmSerializeErrorCode`](./api/README.md#astmserializeerrorcode)):

| Code                              | Meaning                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `ASTM_EMIT_UNENCODABLE_VALUE`     | A value holds `CR` or `LF`, which no escape sequence can carry.                                                    |
| `ASTM_EMIT_INVALID_DELIMITERS`    | The delimiter set to write in is not one character each, holds `CR` or `LF`, or repeats a character.               |
| `ASTM_EMIT_TYPE_LETTER_COLLISION` | A record's type letter would be escaped away under the set being written, so it would read back as another record. |

Thrown as an `AstmFrameEncodeError` by `composeAstmFrames` and `serializeFramedAstm`
([`AstmFrameEncodeErrorCode`](./api/README.md#astmframeencodeerrorcode)):

| Code                                    | Meaning                                                                |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `ASTM_FRAME_EMPTY_RECORD`               | An empty record list, or a record with no bytes.                       |
| `ASTM_FRAME_UNENCODABLE_CHARACTER`      | A record given as a string holds a character above `U+00FF`.           |
| `ASTM_FRAME_RESERVED_BYTE`              | A record holds `STX`, `ETB` or `ETX`, which only mark frame structure. |
| `ASTM_FRAME_INVALID_START_FRAME_NUMBER` | `startFrameNumber` is not a whole number from `0` to `7`.              |

[Write records and frames](./write-records-and-frames.md#handle-what-emit-refuses) says what to do
about each.

## Errors from strict mode

`{ strict: true }` turns warnings into thrown errors that carry them all: `AstmStrictError` from
`parseAstmRecords` (record warnings) and `AstmFrameStrictError` from the frame decoder (frame
warnings). `AstmProfileDefinitionError` is thrown by `defineAstmProfile` for a profile that breaks a
rule, such as tolerating a code the safety gate refuses.
