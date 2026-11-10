---
id: read-dates
title: Read a timestamp without inventing a timezone
sidebar_label: Read a timestamp
description: "Read an ASTM timestamp at the precision it was sent, and turn it into an ISO string or a Date only once you say which offset it was in."
---

# Read a timestamp without inventing a timezone

An ASTM timestamp carries no timezone, so it is not an instant. It is local to the instrument that
wrote it, and nothing on the wire says which zone that was. This page reads timestamps and converts
them without guessing the zone: `toDate` returns `undefined` until you say what the offset was, and
it never reads the host machine's zone or assumes UTC. Either guess would be silent, and either
moves a collection date by a day in every zone west of UTC.

## Read a timestamp

Record fields that hold a timestamp, such as a patient's `birthDate` or a result's `completedAt`,
are parsed for you. `parseAstmDate` reads a digit run on its own. Either way you get an `AstmDate`
at the precision the instrument sent:

```ts runnable
import { parseAstmDate } from "@cosyte/astm";

const day = parseAstmDate("20240315");
day?.precision; // => "day"
day?.hour; // => undefined

const minute = parseAstmDate("202403150930");
minute?.precision; // => "minute"
minute?.minute; // => 30
```

`"20240315"` is a day, not midnight on that day. A digit run that stops halfway through a two-digit
part keeps its raw text, stops at the last whole part, and is marked `truncated`; in a record it
also raises `ASTM_RECORD_PARTIAL_TIMESTAMP`. The dangling digit is never filled with a zero.

## Convert it

Three functions convert an `AstmDate`. They have the same names, shapes and timezone rule in every
Cosyte parser:

| Function                  | Returns                  | On a value it cannot convert                   |
| ------------------------- | ------------------------ | ---------------------------------------------- |
| `toObject(value)`         | `DateParts \| undefined` | `undefined`                                    |
| `toISO(value)`            | `string \| undefined`    | `undefined`                                    |
| `toDate(value, options?)` | `Date \| undefined`      | `undefined`, including when no offset is given |

```ts runnable
import { parseAstmDate, toDate, toISO, toObject } from "@cosyte/astm";

const collected = parseAstmDate("20240315");

toObject(collected); // => { year: 2024, month: 3, day: 15 }
toISO(collected); // => "2024-03-15"
toDate(collected); // => undefined

// The analyzer runs on US Eastern standard time, five hours west of UTC, so we say so:
toDate(collected, { assumeOffsetMinutes: -300 })?.toISOString(); // => "2024-03-15T05:00:00.000Z"
toDate(collected, { assumeOffsetMinutes: 0 })?.toISOString(); // => "2024-03-15T00:00:00.000Z"
```

- `assumeOffsetMinutes` is signed minutes east of UTC. An explicit `0` is a real answer ("read it as
  UTC"), not a default.
- For the instant only, parts below the stated precision take their lowest value: month and day 1,
  the time 0. `toObject` and `toISO` still report the precision that arrived.
- `toISO` never ends in `Z` or an offset, because the value has none.
- `toObject` returns a frozen object holding only the parts the value stated, so its keys are its
  precision. The month runs 1 to 12, and the keys are singular, so the object can be passed to
  `Temporal.PlainDateTime.from` or luxon's `DateTime.fromObject` without renaming anything. Neither
  library is a dependency.
- A four-digit year below 100 stays that year: `"00500101"` is the year 50, never 1950.

## Expect undefined for a value that is not a date

The parser is lenient and reads `"19881301"` as month 13 rather than drop the field. The conversions
refuse it:

```ts runnable
import { astmDateToLocalISO, parseAstmDate, toDate, toISO, toObject } from "@cosyte/astm";

const value = parseAstmDate("19881301");

value?.month; // => 13
toObject(value); // => undefined
toISO(value); // => undefined
toDate(value, { assumeOffsetMinutes: 0 }); // => undefined
value === undefined ? undefined : astmDateToLocalISO(value); // => "1988-13-01"
```

A JavaScript `Date` would have rolled month 13 into January of the next year and given back a birth
date a year out, with nothing to say so. A month outside 1 to 12, a day past the end of its month
(29 February in a common year included), an hour past 23, and a minute or second past 59 are all
refused the same way, and the whole value is refused, never just the bad part. `astmDateToLocalISO`
is still exported: for every real calendar date it returns the same string as `toISO`, and on a value
that is not one it renders the digits it was given.

An offset that names no usable zone is refused too. `NaN`, an infinite offset, or one so large that
the instant falls outside the range a `Date` can hold all give `undefined`, so the answer is never
an `Invalid Date`. Checking for `undefined` is the only test you need.

## Use two Cosyte parsers in one file

The three names are the same in every Cosyte parser, so importing two of them collides. Alias them,
or import the package as a namespace:

```ts runnable
import * as astm from "@cosyte/astm";
import { parseAstmDate, toISO as astmToISO } from "@cosyte/astm";

astmToISO(parseAstmDate("202403150930")); // => "2024-03-15T09:30"
astm.toDate(parseAstmDate("20240315"), { assumeOffsetMinutes: -300 })?.getUTCHours(); // => 5
```

An HL7 v2 timestamp can state its own offset and an ASTM timestamp never can, so the two packages'
`toISO` differ on purpose: the HL7 one may end in `Z` or `+HH:MM`, and this one never does.

## Reference

- [`parseAstmDate`](./api/README.md#parseastmdate) and [`AstmDate`](./api/README.md#astmdate)
- [`toObject`](./api/README.md#toobject), [`toISO`](./api/README.md#toiso),
  [`toDate`](./api/README.md#todate) and [`ToDateOptions`](./api/README.md#todateoptions)
- [`astmDateToLocalISO`](./api/README.md#astmdatetolocaliso)
