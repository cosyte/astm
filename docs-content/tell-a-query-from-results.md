---
id: tell-a-query-from-results
title: Tell a host query from a result upload
sidebar_label: Tell a query from results
description: "Gate on the message classification so a host query is never read as a result set, and keep manufacturer and scientific records out of clinical fields."
---

# Tell a host query from a result upload

On many analyzers the host query is routine, and on some it is required: the instrument sends a
header, a patient and a `Q` (request-information) record, and the laboratory information system
answers with the orders for that specimen. Reading such a request as a result upload breaks the
order flow, so check the classification before you treat records as results.

## Gate on the classification

```ts runnable
import { parseAstmRecords } from "@cosyte/astm";

// A host query asking for all tests on one specimen.
const request = parseAstmRecords("H|\\^&\rP|1\rQ|1|^SPEC-7|^SPEC-7|ALL\rL|1\r");

request.classification.kind; // => "host-query"
request.classification.isHostQueryRequest; // => true
```

`classification.kind` is one of `host-query`, `results`, `orders` or `indeterminate`.
`isHostQueryRequest` is `true` exactly when a `Q` record was read.

A `Q` decides the kind even when the same stream also carries results: the kind stays `host-query`,
and the stream raises `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND`. The classification covers the whole
stream, so on a stream with several messages classify each message on its own with
`classifyMessage(m.records)`, as [Read a stream that carries several
messages](./read-several-messages.md#classify-each-message-on-its-own) shows.

## Treat indeterminate as unknown

The kind is a count of record type letters, so it holds only while every letter was readable. When
a record's type letter is not recognized and no `Q` was read, the kind is `indeterminate`, not
`results` or `orders`, and `hasUnrecognized` is `true`, because the unreadable letter may have been
the `Q`:

```ts runnable
import { parseAstmRecords } from "@cosyte/astm";

const msg = parseAstmRecords("H|\\^&\rP|1\rX|1|^SPEC-7||ALL\rR|1|^^^687|10.0|U/L||N||F\rL|1\r");

msg.classification.kind; // => "indeterminate"
msg.classification.hasUnrecognized; // => true
msg.classification.hasResults; // => true
msg.classification.isHostQueryRequest; // => false
```

`hasQuery`, `hasResults` and `hasOrders` stay true counts throughout. So `isHostQueryRequest` being
`false` does not prove a message is a result set: read `kind` for that. A `Q` that was read still
decides the kind, because an unreadable letter can only add a kind, not remove one.

## Read the query record

```ts runnable
import { parseAstmRecords, query } from "@cosyte/astm";

const msg = parseAstmRecords("H|\\^&\rP|1\rQ|1|^SPEC-7|^SPEC-7|ALL\rL|1\r");
const q = query(msg)[0];

q?.startingRangeId; // => "^SPEC-7"
q?.queriesAllTests; // => true
```

The range IDs, the `ALL` keyword and the request-information status are kept as sent. The exact
structure of those fields is in the purchased text of the standard, which we have not read, so we
interpret none of them. A request-information status raises
`ASTM_RECORD_UNINTERPRETED_QUERY_STATUS` to say it was passed through as written.

## Keep manufacturer and scientific records out of clinical fields

`M` (manufacturer) and `S` (scientific) records carry vendor-defined quality control, calibration
and maintenance data. They are kept whole on `record.rawLine` and never read into clinical fields,
so a quality-control value can never be read as a patient result:

```ts runnable
import { parseAstmRecords, results } from "@cosyte/astm";

const msg = parseAstmRecords("H|\\^&\rM|1|QC^LOT-42|1.5\rS|1|CAL|ok\rL|1\r");
const manufacturer = msg.records.find((r) => r.type === "M");

manufacturer?.type === "M" ? manufacturer.rawLine : undefined; // => "M|1|QC^LOT-42|1.5"
results(msg).length; // => 0
```

## Reference

- [`AstmMessageClassification`](./api/README.md#astmmessageclassification),
  [`classifyMessage`](./api/README.md#classifymessage) and [`query`](./api/README.md#query)
- [`QueryRecord`](./api/README.md#queryrecord) and
  [`ManufacturerRecord`](./api/README.md#manufacturerrecord)
- [Warning and error codes](./warning-codes.md)
