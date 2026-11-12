---
id: read-results
title: Read a result safely
sidebar_label: Read a result safely
description: "Read a result's value, units, status, abnormal flag and reference range, with its test code, patient and comments, without trusting a guess."
---

# Read a result safely

A result record carries its fields as the analyzer sent them, plus a modeled view of the three that
decide whether you can act on the value: the status, the abnormal flag and the reference range. This
page reads all of them. It assumes one message with one patient; for a stream that carries more,
read [Read a stream that carries several messages](./read-several-messages.md) first.

## Read the value, units and test code

```ts runnable
import { parseAstmRecords, results } from "@cosyte/astm";

const raw =
  "H|\\^&\rP|1|PRAC-0001|LAB-0009\rO|1|SPEC-7||^^^687\rR|1|^^^687|28.6|U/L|10-40|N||F\rL|1|N\r";
const r = results(parseAstmRecords(raw))[0];

r?.value; // => "28.6"
r?.units; // => "U/L"
r?.universalTestId?.localCode; // => "687"
r?.referenceRange; // => "10-40"
```

The value and the units are strings, exactly as sent. Units are the analyzer's own free text: they
are not UCUM, and nothing converts or normalizes them. A numeric value with no units raises
`ASTM_RECORD_UNITS_ABSENT`, and the units stay empty rather than defaulted.

A value carrying an unescaped component delimiter (`POS^1`) keeps its whole text in `value`, has the
split parts in `valueComponents`, and raises `ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT`, so you choose which
reading to use.

## Check the status before you use the value

`status` is always present. Gate on `status.isActiveFinal`, which is `true` only for a plain `F`:

```ts runnable
import { parseAstmRecords, results } from "@cosyte/astm";

const correction = "H|\\^&\rR|1|^^^687|30.1|U/L|10-40|H||C\rL|1\r";
const noStatus = "H|\\^&\rR|1|^^^687|30.1|U/L|10-40|H\rL|1\r";

const c = results(parseAstmRecords(correction))[0];
c?.status.meaning; // => "correction"
c?.status.isActiveFinal; // => false
c?.status.supersedes; // => true

const n = results(parseAstmRecords(noStatus))[0];
n?.status.meaning; // => "unspecified"
n?.status.isActiveFinal; // => false
```

- `supersedes` is `true` for a correction (`C`): this value replaces one sent earlier, so update
  what you stored rather than adding a second value.
- `cancelled` is `true` for `X`: the test could not be done.
- A missing status is `unspecified` and an unknown letter is `undefined`; neither is ever read as
  final.

[Result flags and statuses](./result-flags-and-statuses.md) lists every status letter and its
meaning.

## Read the abnormal flag

```ts runnable
import { parseAstmRecords, results } from "@cosyte/astm";

const raw = "H|\\^&\rR|1|^^^688|5.9|mmol/L|3.5-5.1|HU||F\rR|2|^^^689|7|U/L||ZZ||F\rL|1\r";
const [high, unknown] = results(parseAstmRecords(raw));

high?.flag?.meaning; // => "significantly-high"
high?.flag?.recognized; // => true
unknown?.flag?.meaning; // => "undefined"
unknown?.flag?.recognized; // => false
unknown?.flag?.raw; // => "ZZ"
```

An unrecognized flag reads `undefined`, never `normal`, keeps its raw text, and raises
`ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG`. Matching is exact after the surrounding whitespace is trimmed,
so `hu` does not match `HU`. If your instrument sends lower case, change the case yourself before you
rely on the match.

## Read the reference range

```ts runnable
import { parseAstmRecords, results } from "@cosyte/astm";

const raw =
  "H|\\^&\rR|1|^^^687|28.6|U/L|10-40|N||F\rR|2|^^^688|4|mg/L|<5|N||F\rR|3|^^^689|9|U/L|see note|N||F\rL|1\r";
const [closed, openLow, unparsed] = results(parseAstmRecords(raw));

closed?.range; // => { raw: "10-40", low: "10", high: "40", kind: "closed" }
openLow?.range; // => { raw: "<5", high: "5", kind: "open-low" }
unparsed?.range; // => { raw: "see note", kind: "unparsed" }
```

Bounds stay strings, so nothing is rounded. Text that is not `low-high`, `<high` or `>low` is
`unparsed`, with no bound invented, and raises `ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE`.

## See what a flag or status was graded against

Each interpreted flag and status says which vocabulary it was compared with, whether or not the
letter was recognized:

```ts runnable
import { parseAstmRecords, results } from "@cosyte/astm";

const r = results(parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L|10-40|N||F\rL|1\r"))[0];

r?.flag?.vocabulary.attributed; // => true
r?.flag?.vocabulary.system; // => "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation"
r?.status.vocabulary.attributed; // => false
```

The flag's `version` is the version we compared against, not a claim about what the sender meant.
The status letters are attributed to nothing, and `status.vocabulary.reason` says why. [Limitations](./limitations.md#which-vocabulary-a-letter-was-graded-against) explains both.

## Read the patient and the comments

The patient record keeps the practice-assigned and laboratory-assigned IDs apart, and a comment
record attaches to the record before it:

```ts runnable
import { commentsFor, parseAstmRecords, patient, results } from "@cosyte/astm";

const raw =
  "H|\\^&\rP|1|PRAC-0001|LAB-0009||DOE^JANE^A||19700101|F\r" +
  "R|1|^^^687|28.6|U/L|10-40|N||F\rC|1|I|Hemolyzed sample|G\rL|1|N\r";
const msg = parseAstmRecords(raw);

const p = patient(msg);
p?.practiceAssignedId; // => "PRAC-0001"
p?.laboratoryAssignedId; // => "LAB-0009"
p?.name?.last; // => "DOE"
p?.birthDate?.precision; // => "day"

const r = results(msg)[0];
const notes = r === undefined ? [] : commentsFor(msg, r);
notes.map((c) => c.text); // => ["Hemolyzed sample"]
```

A comment with no record before it to attach to is kept, attached to the message itself
(`attachedToRoot: true`), and raises `ASTM_RECORD_ORPHAN_COMMENT`. Dates are covered in [Read a
timestamp without inventing a timezone](./read-dates.md).

## Reference

- [`results`](./api/README.md#results), [`patient`](./api/README.md#patient) and
  [`commentsFor`](./api/README.md#commentsfor)
- [`ResultRecord`](./api/README.md#resultrecord), [`ResultStatus`](./api/README.md#resultstatus),
  [`AbnormalFlag`](./api/README.md#abnormalflag) and
  [`ReferenceRange`](./api/README.md#referencerange)
- [Result flags and statuses](./result-flags-and-statuses.md) and [Warning and error
  codes](./warning-codes.md)
