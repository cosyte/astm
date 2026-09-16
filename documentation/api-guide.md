# ASTM API guide

The long-form API sections of `@cosyte/astm`. `README.md` keeps each heading below and links
it here, so the front page stays short and nothing it said is lost.

### Several messages in one stream

A message runs from its `H` header to its `L` terminator, so a stream can carry several. `messages()`
splits a parsed stream into them, and each entry carries only its own records, so a patient is only
ever paired with the results that message actually carried:

```ts
import { parseAstmRecords, messages } from "@cosyte/astm";

for (const m of messages(parseAstmRecords(raw))) {
  m.patient?.practiceAssignedId; // the P for THIS message
  m.results; // the Rs for THIS message
  m.delimiters; // the set THIS message's records were read with
}
```

The flat accessors above (`patient`, `results`, `orders`, `comments`, `query`) read the whole stream,
so they **throw** `AstmAmbiguousStreamError` on a stream they cannot answer for rather than answering
across patients:

- `ASTM_AMBIGUOUS_MULTI_MESSAGE` from any of the five, when the stream carries more than one message.
- `ASTM_AMBIGUOUS_MULTI_PATIENT` from `patient()` only, when a **single** message carries more than
  one `P` record. "The first `P`" is a guess about whose result it is, so it is refused there too.

**Both are breaking**, and the second one reaches single-message callers: a lone message carrying
several patients used to answer with the first of them. A stream that is one message with at most one
patient is unchanged, and so is a result-only message with no `P` at all, which still answers
`undefined`. `commentsFor()` is unchanged on every stream, because the parent record you hand it
already names the message.

Splitting reads each record's type letter, so check for an `ASTM_RECORD_UNKNOWN_TYPE` warning before
you trust the split. A header the reader does not recognize as a header, one carrying a stray leading
byte for instance, opens no message, and the messages either side of it merge back into one, so a
patient can end up holding results that arrived under a different header. The
parser warns on that record and a `{ strict: true }` parse refuses the stream. That warning is the
only report the merge produces, so a profile is not allowed to tolerate it: the code is refused when
a profile is defined, and a warning carrying it is not downgraded whatever profile is in force. Do
not gate on the warning count, though, because the records that merged in can raise warnings of
their own.

Delimiters are re-read at each header too, so if the unrecognized one declared a different set, the
records after it are read with the previous set and their fields can be lost rather than merely
misfiled. `ASTM_RECORD_FIELDS_UNSEPARATED` reports a record that suffered the total form of that:
the delimiters in force found no field separator in it at all, so the whole line read back as one
field and none of its modeled fields survived. On a result record that is the value, the units and
the status at once, so treat it as a lost result, not a formatting nit. The fields are never
reconstructed, because the set the sender used is unknown and guessing at it would invent data. The
code is safety-critical, and it does not need a mangled header to fire: a lone record written in
another set trips it too.

**Its absence does not certify that a record was read in its own set**, and this is the important
half. The check tests one of the four delimiter roles, the **field** separator, and only in its
total form, where no unescaped separator occurs in the line. Two classes of the same loss sit
outside it:

- A foreign set whose **field** separator happens to occur somewhere in the line still splits, on
  the wrong boundaries and in silence. A single stray `|` in an otherwise `*`-separated result loses
  the value, the units and the status with no warning at all, while the identical record without
  that one byte is reported. This also happens **inside** a run of these warnings, so even a run
  does not mean every record in it was checked.
- A set differing in the **repeat, component or escape** role usually splits into fields normally,
  and the damage then varies. A mis-split component can cost a test identity while the value and
  units survive. The escape role's worst case has **narrowed, not gone**: a bare escape character no
  longer merges the rest of the record (it reads as a literal and raises
  `ASTM_UNPAIRED_ESCAPE_CHARACTER`), but an `&X&` sequence whose body is an unrecognized character
  that is itself a delimiter in force is an opaque
  atom, so that delimiter does not split and the value, the units and the status can still go
  together. That one raises `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`, which is not tolerable,
  alongside the tolerable `ASTM_UNKNOWN_ESCAPE_SEQUENCE`. The split itself is unchanged. Its mirror,
  where the leftmost alignment lets a delimiter split that a competing alignment would have held,
  gains a boundary instead of losing one and raises `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT`, also
  not tolerable. Where that gained boundary is a **field** boundary and the reading taken resumes on
  an escape character heading no sequence it can interpret, every later field shifts and a
  result's units
  and status are read out of slots the other alignment does not put them in: that raises
  `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS`, not tolerable either. Where it is a **repeat** boundary
  nothing shifts, but the field is read out of its first repeat alone, so a gained first boundary
  truncates a value and costs a test identity or a patient name the components that sat after it:
  that raises `ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD`, not tolerable either. Where it is a
  **component** boundary nothing leaves the record and every component after it moves along the
  component list, so a coding scheme, a vendor local code or a given name is read out of a position the other
  alignment does not put it in: that raises `ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS`, not
  tolerable either.

All are accepted limits, for two different reasons: widening the field-separator check would mean
deciding which set a record ought to have had, which is the same guess the parser declines to make
elsewhere, and narrowing the escape atom would break the guarantee it exists for. So they are
written down rather than papered over. Read the warning as "this record definitely lost its
fields", never as "no other record did". If
delimiter drift is a real risk on your feed, parse with `{ strict: true }`, which refuses both an
outright collapse and an unrecognized type letter, and treat `ASTM_RECORD_UNKNOWN_TYPE` as
invalidating what follows it rather than expecting this warning to enumerate the damage.

An unrecognized type letter also makes the message **kind** unknowable, because the letter that
could not be read may have been the very `Q` that decides it. `classification.kind` is
`indeterminate` in that case rather than `results` or `orders`, and `classification.hasUnrecognized`
says why. A `Q` that was read still wins outright.

### Drive the transport (framed vs raw) + the LTP protocol

ASTM transport is not uniform: **serial** always frames, but over **TCP it varies within a single
vendor**, the cobas 4800 and Iguana keep the full `ENQ`/`ACK` + `STX`/checksum framing, while the
cobas b121 drops it and streams de-framed record bytes directly. Detect which you have, then drive the
pure protocol reducer with your own socket I/O.

```ts
import {
  detectFraming,
  decodeAstmFrames,
  parseAstmRecords,
  ltpInitialState,
  ltpReduce,
} from "@cosyte/astm";

// 1. Route by the stream's leading byte (STX/ENQ ⇒ framed; a bare record letter ⇒ raw).
const { framing } = detectFraming(leadingBytes); // "framed" | "raw"  (override: { override: "raw" })
if (framing === "raw") {
  // cobas b121 raw-TCP: no handshake, no frames, parse the record bytes directly.
  parseAstmRecords(rawBytes);
}

// 2. Framed transport: drive the pure receiver-side state machine. YOU own the socket + clock.
let state = ltpInitialState();
function onControlOrFrame(event) {
  const { state: next, actions, warnings } = ltpReduce(state, event);
  state = next;
  for (const a of actions) {
    if (a.type === "sendAck") socket.write(Uint8Array.of(0x06)); // ACK, only ever for a good frame
    if (a.type === "sendNak") socket.write(Uint8Array.of(0x15)); // NAK, bad checksum ⇒ retransmit
    if (a.type === "deliverRecord") parseAstmRecords(a.record); // a complete, trusted record
  }
  void warnings; // ASTM_LTP_*, value-free (a code + at most a frame number)
}
// Feed events as you read them: { type: "enq" }, { type: "frame", frame: decodeAstmFrames(b).frames[0] }, …
```

The reducer is deterministic and fully testable without a socket. Its inviolable rule: a frame the
codec did not vouch for (bad checksum, unterminated, or out of sequence) yields `sendNak`, **never** a
fabricated `sendAck`, and is **never** appended to a record. A `NAK` drives retransmit, not acceptance.
The interactive contention/timeout/retransmit **timing** is the consumer's: this layer models the
state transitions, not the wall-clock timers.

### Map local codes to LOINC (LIVD, bring-your-own)

An analyzer sends a proprietary local test code in the Universal Test ID; a standard LOINC is mapped
downstream. Supply your own IICC LIVD ("LOINC to Vendor IVD") catalog and annotate a message, the
mapping is **additive and advisory**: it never touches the raw code or value, and an unmapped or
ambiguous code is surfaced as such, **never a guessed LOINC**.

```ts
import { parseAstmRecords, defineLivdCatalog, applyLivd } from "@cosyte/astm";

// Your LIVD catalog: the vendor transmission code (Vendor Analyte Code) → LOINC.
const catalog = defineLivdCatalog([{ vendorCode: "687", loinc: "1920-8", loincLongName: "AST" }]);

const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
const { annotations, warnings } = applyLivd(msg, catalog);

annotations[0]?.mapping; // { status: "mapped", loinc: "1920-8", loincLongName: "AST", source: "livd", derived: true }
warnings; // ASTM_LIVD_UNMAPPED_CODE / ASTM_LIVD_AMBIGUOUS_MAPPING (value-free) for codes with no single LOINC
```

**Your catalog answers the analyte-identity question, and the wire never does.** The Universal Test
ID's first component is a LOINC slot, and the guide this catalog format comes from puts transmitting
LOINC directly from IVD instruments explicitly out of scope: the analyte arrives as a vendor-defined
code. So the lookup happens whenever a vendor local code is present, keyed on that code alone, and a
populated first component neither answers for it nor selects among candidates. **This package
performs no LOINC validation of any kind**: it never decides whether such a value "looks like" a
LOINC, so `Glucose` and `2345-7` there are treated identically. The value is carried verbatim as
`unvalidatedWireValue`, on every disposition, and is never reported as a LOINC.

```ts
const msg = parseAstmRecords("H|\\^&\rR|1|Glucose^^^687|28.6|U/L||N||F\rL|1\r");
const [a] = applyLivd(msg, catalog).annotations;

a?.mapping.status; // "mapped": your catalog vouched for 1920-8 (the lookup used "687")
a?.reportedCode; // "687": the code the catalog was consulted WITH, verbatim
a?.unvalidatedWireValue; // "Glucose": carried verbatim, vouched for by nothing
a?.wireValueDisagreesWithCatalog; // true: the two differ, and that is ALL this says
```

`mapping.status` is a closed discriminant, so a `switch` over it is exhaustive:

| `status`         | what happened                                                                            | warning                       |
| ---------------- | ---------------------------------------------------------------------------------------- | ----------------------------- |
| `mapped`         | your catalog vouched for exactly one LOINC for the vendor local code                     | none                          |
| `unmapped`       | the vendor local code was looked up and your catalog held no entry                       | `ASTM_LIVD_UNMAPPED_CODE`     |
| `ambiguous`      | several distinct LOINCs the reported units did not settle; all surfaced, **none chosen** | `ASTM_LIVD_AMBIGUOUS_MAPPING` |
| `no-vendor-code` | component 1 is populated and there is no vendor local code: nothing was looked up        | none                          |
| `no-code`        | the Universal Test ID carried no code at all                                             | none                          |

`unvalidatedWireValue` and `wireValueDisagreesWithCatalog` sit **beside** that discriminant and can
accompany any of its cases. `wireValueDisagreesWithCatalog` is `true` only where your catalog
vouched for exactly one LOINC, component 1 is populated, and the two are not byte-identical; it is
`false` everywhere else and is never absent, so an ordinary `R|1|^^^687|...` record ships no
standing false disagreement. **It reports the difference and nothing else**: both values stay
surfaced, neither is marked correct, neither is rewritten, and nothing here says the difference was
settled. Deciding which source to believe is a clinical judgement this library will not make for
you.

Two corners worth knowing before you write a catalog adapter: a `lookup` that **throws** propagates
to your caller unchanged rather than reading as a catalog miss (your crash must not be
indistinguishable from "this code is not in the catalog"), and a hit whose `loinc` is a zero-length
string is reported as a miss rather than as a vouched-for empty LOINC.

#### One vendor code, several LOINCs: the units decide

One vendor analyte code mapping to several LOINCs is the **ordinary** case, not an edge: the guide
this catalog format comes from gives the commonest chemistry analytes as its own worked examples, a
serum glucose reported as a mass concentration versus a substance concentration, and a urine analyte
reported as a spot concentration versus a 24 hour excretion rate. Its remedy is a mapping per unit,
so a catalog row can carry a **representative unit of measure** beside the vendor code, and the
`R` record already states its units on the wire.

```ts
import { parseAstmRecords, defineLivdCatalog, applyLivd } from "@cosyte/astm";

const glucose = defineLivdCatalog([
  { vendorCode: "GLU", loinc: "2345-7", representativeUnit: "mg/dL" },
  { vendorCode: "GLU", loinc: "14749-6", representativeUnit: "mmol/L" },
]);

const msg = parseAstmRecords("H|\\^&\rR|1|^^^GLU|5.5|mmol/L||N||F\rL|1\r");
applyLivd(msg, glucose).annotations[0]?.mapping;
// { status: "mapped", loinc: "14749-6", representativeUnit: "mmol/L",
//   unitComparison: { comparison: "verbatim-case-sensitive", ucumSemantic: false, ... },
//   source: "livd", derived: true }
```

**The comparison is verbatim and case sensitive, and it is not UCUM.** A catalog saying `mg/dL` does
not match a feed saying `MG/DL`, and it never matches `g/L` however convertible the two are: nothing
is normalized, case folded, scaled or converted on either side. UCUM defines a case-insensitive
variant of every terminal symbol and requires a program claiming full conformance to compare unit
expressions by their **semantics**, so this is a deliberately limited choice, the only comparison
that cannot invent an equivalence. Because you could otherwise read a matched unit as a conformance
claim this package does not make, every unit-selected answer carries `unitComparison` saying exactly
what was compared.

Refusing still beats guessing, so all four of these are `ambiguous` with **every candidate surfaced
and no LOINC chosen**: the units match no candidate, they match more than one, the record reported no
units (absent, empty, or whitespace only) and the candidates differ only by unit, or the units could
not be read at all because the record was truncated or malformed. An unreadable units field reads as
"no units reported": you still get a typed annotation, never an exception and never a dropped record.
The answer's `reason` says which case it was, and `candidateDetails` carries each candidate row's
LOINC and LIVD attributes so a human can choose what this package will not.

A candidate whose `representativeUnit` is **absent, empty or whitespace only** is not unit qualified:
it is never selected by a unit comparison, and it is still surfaced among the candidates. And a
vendor code carrying exactly **one** candidate LOINC is answered whether or not the units agree, with
no `unitComparison`, because no unit chose anything there.

On a `mapped` answer, `representativeUnit` is provenance about the **catalog row** rather than a
restatement of what the record reported: where a code carries a single candidate LOINC across several
rows that spell the unit differently, the answer takes the first row's attributes, so that field can
name a unit the record did not report. **Only `unitComparison` says the two were equal**, and it is
present only where a unit actually chose between candidates. Branch on that field, not on this one.

Two attributes ride along and are **never matched on**: `vendorSpecimenDescription` and
`vendorResultDescription`. Both are free text, and the guide states directly that this information is
not intended to be parsed by software that automates the mapping, so they are stored and surfaced
verbatim for a human to read. Only the representative unit ever selects. All three attributes are
**optional**: a catalog carrying none of them answers exactly as it did before they existed, for
`mapped`, `unmapped` and `ambiguous` alike.

**No LOINC / SNOMED / LIVD dictionary is bundled.** LOINC is © Regenstrief (redistributable only with
its attribution notice) and the public CDC LIVD file is SARS-CoV-2-specific and carries
separately-licensed SNOMED CT, so the package ships no terminology data and you bring the catalog (and
its license obligations).

> **Scope your catalog to the source device fleet.** The ASTM Universal Test ID carries no manufacturer
> to disambiguate against, so the catalog keys on the vendor transmission code alone. Two different
> instruments that reuse the same code for different analytes would both match: supply a catalog built
> for the analyzers you actually receive from. (Conflicting entries _within_ one catalog are caught and
> surfaced as `ambiguous`, never resolved to a guess.)

### Read a date without inventing a timezone

**An ASTM timestamp carries no timezone, so it is not an instant.** The value is local to the
instrument that wrote it, and nothing on the wire says which zone that was. `toDate` therefore
returns `undefined` until **you** say what the offset was: it never reads the host machine's zone
and never assumes UTC. Both guesses are silent, and both shift a collection date by a day in every
negative-offset zone.

`parseAstmDate` reads the digit run into an `AstmDate` that keeps whatever precision the instrument
sent (`"20240315"` is a **day**, not a fabricated midnight). Three conversions read that value, and
they carry the same names, the same shapes and the same timezone rule in every `@cosyte` parser:

| function                  | returns                  | on a value it cannot convert                  |
| ------------------------- | ------------------------ | --------------------------------------------- |
| `toObject(value)`         | `DateParts \| undefined` | `undefined`                                   |
| `toISO(value)`            | `string \| undefined`    | `undefined`                                   |
| `toDate(value, options?)` | `Date \| undefined`      | `undefined`, including when no zone was given |

```ts
import { parseAstmDate, toObject, toISO, toDate } from "@cosyte/astm";

const collected = parseAstmDate("20240315"); // day precision, no time, no zone

toObject(collected); // { year: 2024, month: 3, day: 15 }   only what was stated
toISO(collected); // "2024-03-15"                        no trailing Z, ever
toDate(collected); // undefined                          the zone is unstated

// You know the analyzer runs on US Eastern standard time, so you say so:
toDate(collected, { assumeOffsetMinutes: -300 }); // 2024-03-15T05:00:00.000Z
toDate(collected, { assumeOffsetMinutes: 0 }); // 2024-03-15T00:00:00.000Z, "read it as UTC"
```

`assumeOffsetMinutes` is signed minutes east of UTC, and an explicit `0` is a real answer ("treat
this value as UTC"), not a default. Components below the stated precision fill to their lowest legal
value for the instant only (month and day to 1, the time to 0); the value itself is untouched, so
`toObject` and `toISO` keep reporting the precision that arrived. A four-digit year below 100 stays
that year: `"00500101"` is the year 50, never 1950.

An offset that names no usable zone is refused rather than applied, and **the answer is never an
`Invalid Date`**: not a `NaN` or infinite `assumeOffsetMinutes`, and not one so large that applying
it lands outside the range a JS `Date` represents. Both give you `undefined`, like every other case
this surface cannot answer.

```ts
toDate(collected, { assumeOffsetMinutes: Number.NaN }); // undefined
toDate(collected, { assumeOffsetMinutes: 1e15 }); // undefined, past the representable range
```

An `Invalid Date` would satisfy the `Date | undefined` return type and defeat its point: you cannot
tell one from a real instant without testing `getTime()` for `NaN`, and calling `toISOString()` on it
throws. Checking for `undefined` is the only test you need.

`toObject` returns a **frozen** object carrying only the components the value stated, so
`Object.keys()` is the precision. There is no `precision`, `raw` or `truncated` key on it (that is
the parse record, and it stays on `AstmDate`), no zero-filling, and no key holding `undefined`. The
month is spec-native **1 to 12**, and the keys are singular, so deleting `offsetMinutes` (which an
ASTM value never has) leaves an object `Temporal.PlainDateTime.from` and luxon's
`DateTime.fromObject` accept with no key rename and no value adjustment. Neither library is a
dependency here: the shape is the interoperability, not an import.

**A component that is not on the calendar is refused, not normalised.** The parser is lenient by
design and will read `"19881301"` into month 13 rather than drop the field, so the conversions are
where that has to be answered, and all three of them answer `undefined`:

```ts
parseAstmDate("19881301")?.month; // 13: the parser reports what arrived
toObject(parseAstmDate("19881301")); // undefined
toISO(parseAstmDate("19881301")); // undefined
toDate(parseAstmDate("19881301"), { assumeOffsetMinutes: 0 }); // undefined
```

A JS `Date` would have rolled that month 13 into January **1989** and handed back a date of birth a
year out, with nothing to say so. A month outside 1 to 12, a day past the end of its own month (29
February in a common year included), an hour past 23 and a minute or second past 59 are all refused
the same way. The refusal is of the whole value, never of the offending component alone: `undefined`
rather than a year-precision `{ year: 1988 }` the instrument never sent.

`astmDateToLocalISO` is unchanged and still exported. `toISO` returns the same string for every value
this parser produces **whose components are a real calendar date**, under the name every `@cosyte`
parser answers to. On a value whose components are not, the two differ on purpose and in one
direction: `astmDateToLocalISO` still renders the digits it was handed (`"1988-13-01"`), which is its
long-standing behaviour, and `toISO` gives you `undefined` instead of a string no ISO-8601 reader
accepts.

#### Using two `@cosyte` parsers in one file

The three names are deliberately identical across the packages, so importing two of them collides.
Alias them, or namespace-import:

```ts
import { parseAstmDate, toISO as astmToISO, toDate as astmToDate } from "@cosyte/astm";
import { toISO as hl7ToISO } from "@cosyte/hl7";

// Or namespace the whole package:
import * as astm from "@cosyte/astm";

astmToISO(parseAstmDate("202403150930")); // "2024-03-15T09:30"
astm.toDate(parseAstmDate("20240315"), { assumeOffsetMinutes: -300 });
```

An HL7 v2 `DTM` can state its own offset and an ASTM timestamp never can, so the two answer
differently on purpose: `hl7ToISO` may end in `Z` or `+HH:MM`, `astmToISO` never does. That
difference is the standards', not the API's.

### The cosyte parser archetype

- **Postel's Law**: liberal parser (lenient default + warnings), conservative serializer (always
  spec-clean), so quirks don't propagate downstream on round-trip.
- **Tiered tolerance**: Tier 0/1 silent, Tier 2 warning + recovery (escalates in strict mode),
  Tier 3 fatal always.
- **Stable warning codes**: warnings carry stable string codes + positional context; consumers
  branch on `w.code`, so renaming a code is a breaking change.
- **Zero runtime dependencies**: Node stdlib only (healthcare integrations vet every dependency).
- **Dual ESM + CJS**: built with `tsup`, validated with `attw`.
- **Immutability**: parsed models are immutable; mutation is via explicit methods.
- **Profile system**: a `defineAstmProfile()` API for vendor quirks, with built-in profiles authored
  through the same public API. A profile only ever downgrades an _expected_, non-safety-critical warning
  to `PROFILE_QUIRK_APPLIED` (it never alters a value) and may force the raw-vs-framed transport; a
  default-deny safety gate refuses to tolerate any safety-critical deviation at definition time.
- **Terminology recognizer, not a dictionary.** LIVD-aware LOINC recognition is bring-your-own
  (`applyLivd` over a consumer-supplied catalog): additive, advisory, and never a guessed LOINC. The
  catalog answers for the analyte identity, never the wire, and no LOINC validation of any kind is
  performed. No LOINC / SNOMED / LIVD data is bundled.
