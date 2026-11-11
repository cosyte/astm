# @cosyte/astm

## Classes

### AstmAmbiguousStreamError

Thrown by a flat extractor when the stream it was handed does not determine a single
answer: either because it carries several messages, or because its one message carries
several patients.

The throw **is** the fix. A caller who gets this error is strictly better off than one
who silently received another patient's results, and the remedy is mechanical: walk
[messages](#messages) and read each message's own records.

**PHI:** carries a stable code, a position, and two counts. Never a field value, never a
patient identifier.

#### Example

```ts
import { parseAstmRecords, messages, results, AstmAmbiguousStreamError } from "@cosyte/astm";
const msg = parseAstmRecords(raw);
try {
  results(msg);
} catch (err) {
  if (err instanceof AstmAmbiguousStreamError) {
    for (const m of messages(msg)) m.results.length;
  }
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new AstmAmbiguousStreamError**(`code`, `message`, `position`, `counts`): [`AstmAmbiguousStreamError`](#astmambiguousstreamerror)

**`Internal`**

###### Parameters

###### code

[`AmbiguousCode`](#ambiguouscode)

###### message

`string`

###### position

[`AstmPosition`](#astmposition)

###### counts

###### messageCount

`number`

###### patientCount

`number`

###### Returns

[`AstmAmbiguousStreamError`](#astmambiguousstreamerror)

###### Overrides

`Error.constructor`

#### Properties

##### code

> `readonly` **code**: [`AmbiguousCode`](#ambiguouscode)

The stable discriminant: see [AMBIGUOUS\_CODES](#ambiguous_codes).

##### messageCount

> `readonly` **messageCount**: `number`

How many `H` … `L` messages the stream carries.

##### patientCount

> `readonly` **patientCount**: `number`

How many `P` records the message in question carries.

##### position

> `readonly` **position**: [`AstmPosition`](#astmposition)

Where the ambiguity became visible: the second header, or the second `P`. Value-free.

***

### AstmFrameEncodeError

Thrown by [composeAstmFrames](#composeastmframes) when the input cannot be framed into a
spec-clean stream. Carries a stable code + positional context, never the
record bytes and never the offending character (PHI discipline).

**The unencodable-character case, and why it is a refusal.** A record passed as
a `string` is a **byte string**: character `i` becomes byte `i`, which is the
exact inverse of how this package turns record bytes back into a string (one
`String.fromCharCode` per byte, so every byte survives 1:1). A character above
`U+00FF` has no byte to become. Turning one into bytes takes a character
encoding, and nothing this package reads from an ASTM stream says which one:
it reads no character-set declaration from any record, so picking one would be
a guess at bytes the caller never supplied. Emit also has no warning channel,
so a warning here could only be ignored while the wrong bytes still shipped.

**Framing content outside Latin-1.** Encode it yourself, with the code page
your instrument actually uses, and hand [composeAstmFrames](#composeastmframes) the
`Uint8Array`: it accepts bytes directly and writes them through untouched.
The refusal removes no capability, it routes you to the parameter that already
carried it.

**The reserved-byte case, and why it has no escape hatch.** `STX`, `ETB` and
`ETX` are what [decodeAstmFrames](#decodeastmframes) reads as frame structure: `STX` opens
a frame, and the first `ETB`/`ETX` after it *is* the end of that frame's text.
A record carrying one of those bytes therefore cannot be framed and read back,
whichever form it arrives in, and this layer has no escape sequence to hide one
behind. Passing bytes instead of a string does **not** route around it, because
the byte is the problem rather than the encoding. Take the byte out of the value
before framing: which byte belongs in a clinical value is the sender's call, not
this library's, so it refuses rather than substituting or deleting one.

**The start-frame-number case, and why an option gets an error of its own.** A
frame's number is a single ASCII digit, `FN_ZERO + n` for `n` in `0`-`7`, and
nothing used to check that `options.startFrameNumber` was one. What went out
instead was whatever byte that sum truncated to: measured on this package's own
round trip, `-1` wrote `/` into the frame-number position and `NaN`, `Infinity`
and `-Infinity` each wrote a `NUL` byte into every frame of the stream, after
which the decoder read no frame number at all and emitted **none** of the
records. Out-of-domain values that happened to land back on a digit were worse
in a quieter way: `1.5` and `257` both produced the byte-for-byte stream a
`startFrameNumber` of `1` produces, so the option silently accepted a value it
documented as invalid. This one refusal is about the caller's own option rather
than about record content, so its message names the value received. Nothing
from the stream is quoted.

#### Example

```ts
import { composeAstmFrames, AstmFrameEncodeError } from "@cosyte/astm";
try {
  composeAstmFrames([]);
} catch (err) {
  if (err instanceof AstmFrameEncodeError) err.code; // "ASTM_FRAME_EMPTY_RECORD"
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new AstmFrameEncodeError**(`message`, `recordIndex?`, `code?`, `characterIndex?`): [`AstmFrameEncodeError`](#astmframeencodeerror)

**`Internal`**

###### Parameters

###### message

`string`

###### recordIndex?

`number`

###### code?

[`AstmFrameEncodeErrorCode`](#astmframeencodeerrorcode-1) = `"ASTM_FRAME_EMPTY_RECORD"`

###### characterIndex?

`number`

###### Returns

[`AstmFrameEncodeError`](#astmframeencodeerror)

###### Overrides

`Error.constructor`

#### Properties

##### characterIndex?

> `readonly` `optional` **characterIndex?**: `number`

Position of the offending character within that record, when applicable:
its index in the string, never the character itself and never its code
point. Enough to find it in the caller's own data. For a record supplied as
a `Uint8Array` this is the offending byte's index, which is the same
position: a record string is a byte string, so the two indices coincide.

##### code

> `readonly` **code**: [`AstmFrameEncodeErrorCode`](#astmframeencodeerrorcode-1)

Stable discriminant.

##### recordIndex?

> `readonly` `optional` **recordIndex?**: `number`

Index of the offending record within the input, when applicable.

***

### AstmFrameStrictError

Thrown by [decodeAstmFrames](#decodeastmframes) in `strict` mode when the lenient codec would
otherwise have accumulated one or more frame warnings (a bad checksum, a
sequence gap, an unterminated frame, or an oversize frame). Carries every
warning (code + position, never the frame's record bytes) so a caller can see
each deviation.

#### Example

```ts
import { decodeAstmFrames, AstmFrameStrictError } from "@cosyte/astm";
try {
  decodeAstmFrames(someFramedBytes, { strict: true });
} catch (err) {
  if (err instanceof AstmFrameStrictError) err.warnings.length; // >= 1
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new AstmFrameStrictError**(`warnings`): [`AstmFrameStrictError`](#astmframestricterror)

**`Internal`**

###### Parameters

###### warnings

readonly [`AstmFrameWarning`](#astmframewarning)[]

###### Returns

[`AstmFrameStrictError`](#astmframestricterror)

###### Overrides

`Error.constructor`

#### Properties

##### warnings

> `readonly` **warnings**: readonly [`AstmFrameWarning`](#astmframewarning)[]

***

### AstmParseError

Thrown by [parseAstmRecords](#parseastmrecords) when the input violates one of the Tier-3
unrecoverable structural rules (empty input, no leading `H`, or an `H` that
cannot declare its delimiters). Carries positional context so consumers can
log an actionable error.

**PHI:** the error carries a stable code + position only, never a field value.

#### Example

```ts
import { parseAstmRecords, AstmParseError } from "@cosyte/astm";
try {
  parseAstmRecords("P|1");
} catch (err) {
  if (err instanceof AstmParseError && err.code === "ASTM_RECORD_NO_HEADER") {
    // err.position is available; err carries no field value
  }
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new AstmParseError**(`code`, `message`, `position`): [`AstmParseError`](#astmparseerror)

**`Internal`**

Construct a new `AstmParseError`. Both fields are required so every thrower
populates positional context and no PHI-bearing snippet is ever attached.

###### Parameters

###### code

[`FatalCode`](#fatalcode)

###### message

`string`

###### position

[`AstmPosition`](#astmposition)

###### Returns

[`AstmParseError`](#astmparseerror)

###### Overrides

`Error.constructor`

#### Properties

##### code

> `readonly` **code**: [`FatalCode`](#fatalcode)

##### position

> `readonly` **position**: [`AstmPosition`](#astmposition)

***

### AstmProfileDefinitionError

Thrown by `defineAstmProfile` when a profile definition is invalid: a missing or
empty `name`, an unknown option key, an invalid `transport` value, or a
`tolerate` entry whose code is unknown, whose `rationale` is empty, or, the
load-bearing safety rule, whose code is **safety-critical** (a result value,
abnormal flag, result status, reference range, units, patient/comment context,
message-kind, code system, an unrecognized record type, or any frame/LTP
integrity warning). Carries the
offending profile's `name` when it is known, so a multi-profile build names the
culprit.

#### Example

```ts
import { defineAstmProfile, AstmProfileDefinitionError } from "@cosyte/astm";
try {
  defineAstmProfile({
    name: "unsafe",
    tolerate: [{ code: "ASTM_FRAME_BAD_CHECKSUM", rationale: "no" }],
  });
} catch (err) {
  if (err instanceof AstmProfileDefinitionError) err.profileName; // "unsafe"
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new AstmProfileDefinitionError**(`message`, `profileName?`): [`AstmProfileDefinitionError`](#astmprofiledefinitionerror)

**`Internal`**

Construct a new `AstmProfileDefinitionError`.

###### Parameters

###### message

`string`

A human-readable explanation of what was invalid.

###### profileName?

`string`

The offending profile's name, when known.

###### Returns

[`AstmProfileDefinitionError`](#astmprofiledefinitionerror)

###### Overrides

`Error.constructor`

#### Properties

##### profileName?

> `readonly` `optional` **profileName?**: `string`

The offending profile's `name`, when it could be read.

***

### AstmSerializeError

Thrown by the record/frame emit side when a value cannot be serialized into a
spec-clean stream: specifically when a component contains a record terminator
(`CR`/`LF`), which the ASTM escape codec cannot encode and which would break
framing if emitted raw. Carries a stable code + positional context, never the
offending value (PHI discipline).

#### Example

```ts
import { serializeAstmRecord, AstmSerializeError, parseAstmRecords } from "@cosyte/astm";
const rec = parseAstmRecords("H|\\^&\rL|1\r").records[1]!;
try {
  serializeAstmRecord(rec);
} catch (err) {
  if (err instanceof AstmSerializeError) err.code; // "ASTM_EMIT_UNENCODABLE_VALUE"
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new AstmSerializeError**(`message`, `recordIndex?`, `code?`): [`AstmSerializeError`](#astmserializeerror)

**`Internal`**

###### Parameters

###### message

`string`

###### recordIndex?

`number`

###### code?

[`AstmSerializeErrorCode`](#astmserializeerrorcode-1) = `"ASTM_EMIT_UNENCODABLE_VALUE"`

###### Returns

[`AstmSerializeError`](#astmserializeerror)

###### Overrides

`Error.constructor`

#### Properties

##### code

> `readonly` **code**: [`AstmSerializeErrorCode`](#astmserializeerrorcode-1)

Stable discriminant. `ASTM_EMIT_UNENCODABLE_VALUE` for a `CR`/`LF` in a value;
`ASTM_EMIT_INVALID_DELIMITERS` for a delimiter set that cannot be emitted
reversibly; `ASTM_EMIT_TYPE_LETTER_COLLISION` for a record whose own type
letter the set being emitted with would escape away.

##### recordIndex?

> `readonly` `optional` **recordIndex?**: `number`

0-based ordinal of the record within the message, when known.

***

### AstmStrictError

Thrown by [parseAstmRecords](#parseastmrecords) in `strict` mode when the lenient parser
would otherwise have accumulated one or more Tier-2 warnings. Carries the
warnings (code + position, never a value) so a caller can see every deviation.

#### Example

```ts
import { parseAstmRecords, AstmStrictError } from "@cosyte/astm";
try {
  parseAstmRecords("H|\\^&\rZ|1\r", { strict: true });
} catch (err) {
  if (err instanceof AstmStrictError) err.warnings.length; // >= 1
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new AstmStrictError**(`warnings`): [`AstmStrictError`](#astmstricterror)

**`Internal`**

###### Parameters

###### warnings

readonly [`AstmRecordWarning`](#astmrecordwarning)[]

###### Returns

[`AstmStrictError`](#astmstricterror)

###### Overrides

`Error.constructor`

#### Properties

##### warnings

> `readonly` **warnings**: readonly [`AstmRecordWarning`](#astmrecordwarning)[]

## Interfaces

### AbnormalFlag

A recognized (or explicitly *un*recognized) abnormal flag. The raw field text
is always preserved; `recognized` is `false` and `meaning` is `"undefined"`
for any letter outside the graded vocabulary, the flag is surfaced, never
dropped, and **never coerced to `normal`**.

`vocabulary` is present either way, so a consumer holding an unrecognized flag
can tell a code no published vocabulary defines from one this library has not
caught up to.

#### Example

```ts
import { interpretAbnormalFlag } from "@cosyte/astm";
const f = interpretAbnormalFlag("HH");
f.meaning;            // "critically-above-normal"
f.recognized;         // true
f.vocabulary.version; // the code system version compared against
```

#### Properties

##### code?

> `readonly` `optional` **code?**: [`AbnormalFlagCode`](#abnormalflagcode-1)

The recognized code, present only when the raw text is a recognized flag.

##### meaning

> `readonly` **meaning**: [`AbnormalFlagMeaning`](#abnormalflagmeaning-1)

The modeled meaning; `"undefined"` (never `"normal"`) for an unrecognized flag.

##### raw

> `readonly` **raw**: `string`

The verbatim field text, exactly as received.

##### recognized

> `readonly` **recognized**: `boolean`

Whether the raw text matched a flag in the graded vocabulary.

##### vocabulary

> `readonly` **vocabulary**: [`NamedVocabulary`](#namedvocabulary)

The published code system this flag was graded against, named by identifier
and version. Always present, recognized or not. The version says what this
library compared against, **not** what the sender meant.

***

### AstmDate

A parsed ASTM date/time. Immutable plain data; the populated fields extend
exactly as far as [AstmDate.precision](#precision). Absent components are left
`undefined` rather than defaulted, so a consumer can tell "midnight" from
"no time given". No timezone is modeled: the value is instrument-local.

#### Example

```ts
import { parseAstmDate } from "@cosyte/astm";
const d = parseAstmDate("20240315");
d?.precision; // "day"
d?.hour;      // undefined  (not 0)
```

#### Properties

##### day?

> `readonly` `optional` **day?**: `number`

##### hour?

> `readonly` `optional` **hour?**: `number`

##### minute?

> `readonly` `optional` **minute?**: `number`

##### month?

> `readonly` `optional` **month?**: `number`

##### precision

> `readonly` **precision**: [`AstmDatePrecision`](#astmdateprecision-1)

How far the components are populated.

##### raw

> `readonly` **raw**: `string`

The raw digit string as it appeared on the wire.

##### second?

> `readonly` `optional` **second?**: `number`

##### truncated?

> `readonly` `optional` **truncated?**: `true`

`true` when the digit run does **not** align to a whole-component boundary: an odd number of
digits that cuts a two-digit component (month/day/hour/minute/second) in half (lengths 5, 7, 9,
11, 13). The full run is preserved in [AstmDate.raw](#raw-1) and the structured value is truncated
to the last **complete** component: the dangling digit is **never zero-filled into a fabricated
time**. Absent (never `false`) for a clean value. A caller surfaces this as a value-free
`ASTM_RECORD_PARTIAL_TIMESTAMP` warning.

##### year

> `readonly` **year**: `number`

***

### AstmField

One ASTM field, as split from a record. The tree holds **decoded** component
strings (escape sequences already resolved), while [AstmField.raw](#raw-2)
preserves the exact wire text of the field for round-trip and audit.

`components` is the first repeat's components (the common single-repeat case);
`repeats` holds every repeat when a field uses the repeat delimiter.

#### Properties

##### components

> `readonly` **components**: readonly `string`[]

Components of the first repeat, each escape-decoded. Empty field → `[""]`.

##### raw

> `readonly` **raw**: `string`

The exact field text as it appeared on the wire (escapes NOT decoded).

##### repeats

> `readonly` **repeats**: readonly (readonly `string`[])[]

Every repeat, each an array of decoded components. `repeats[0] === components`.

***

### AstmFrame

One decoded ASTM frame. `text` is the frame's record-byte payload (the bytes
between the frame number and the terminator, escapes untouched, this is the
framing layer, not the record layer). `trusted` is the single flag a consumer
gates on: it is `true` only for a fully-terminated frame whose checksum
validated, and such frames are the only ones reassembled into `records`.

#### Properties

##### byteOffset

> `readonly` **byteOffset**: `number`

Byte offset of the `STX` that opened this frame, within the decoded stream.

##### checksum

> `readonly` **checksum**: [`FrameChecksum`](#framechecksum)

The checksum verdict.

##### frameNumber?

> `readonly` `optional` **frameNumber?**: `number`

The frame's sequence number as read from the `FN` byte. Normally `0` to `7`; a
value outside that range means the `FN` byte was not a `0` to `7` digit (a
corruption that also trips a sequence-gap warning). `undefined` when the frame
was too truncated to carry a frame number at all.

##### oversize

> `readonly` **oversize**: `boolean`

`true` when the frame's record text exceeded the 240-byte limit.

##### terminator?

> `readonly` `optional` **terminator?**: [`FrameTerminator`](#frameterminator)

`ETB` (intermediate) or `ETX` (final); `undefined` for an unterminated frame.

##### text

> `readonly` **text**: `Uint8Array`

The frame's record-byte payload (may be empty). A **copy**, safe for the caller to retain.

##### trusted

> `readonly` **trusted**: `boolean`

`true` only when the frame was fully terminated **and** its checksum validated.
Only trusted frames are reassembled into [DecodeAstmFramesResult.records](#records-2);
an untrusted frame is surfaced here but never merged.

##### unterminated

> `readonly` **unterminated**: `boolean`

`true` when no valid terminator + checksum was found for this frame (a truncated/partial frame).

***

### AstmFramePosition

Where in a framed byte stream a warning or error originated. Both members are
positional; neither is a value.

#### Example

```ts
import type { AstmFramePosition } from "@cosyte/astm";
const at: AstmFramePosition = { frameNumber: 2, byteOffset: 251 };
```

#### Properties

##### byteOffset

> `readonly` **byteOffset**: `number`

Byte offset of the `STX` that opened the frame, within the decoded stream.

##### frameNumber?

> `readonly` `optional` **frameNumber?**: `number`

The frame's sequence number (`0` to `7`) when it could be read, or `undefined`
when the frame was so truncated the number was not present.

***

### AstmFrameWarning

A single frame-codec warning: a stable code, a value-free human-readable
message, and positional context (frame number + byte offset).

#### Example

```ts
import type { AstmFrameWarning } from "@cosyte/astm";
const w: AstmFrameWarning = {
  code: "ASTM_FRAME_BAD_CHECKSUM",
  message: "Frame checksum mismatch.",
  position: { frameNumber: 2, byteOffset: 251 },
};
```

#### Properties

##### code

> `readonly` **code**: [`FrameWarningCode`](#framewarningcode)

##### message

> `readonly` **message**: `string`

Human-readable detail for logs. Never contains the frame's record bytes.

##### position

> `readonly` **position**: [`AstmFramePosition`](#astmframeposition)

***

### AstmLivdCatalogWarning

A catalog-level terminology warning: a stable code, a value-free constant message,
and the catalog's own declared identity. It carries no position, because no record
is implicated, and it is never produced while a message is annotated.

#### Example

```ts
import type { AstmLivdCatalogWarning } from "@cosyte/astm";
const w: AstmLivdCatalogWarning = {
  code: "ASTM_LIVD_CATALOG_NO_LOINC_VERSION",
  message: "...",
  catalog: { declared: true, publisher: "Example Diagnostics", publicationVersion: "2026-01" },
};
```

#### Properties

##### catalog

> `readonly` **catalog**: [`LivdCatalogIdentity`](#livdcatalogidentity)

What the catalog declared about itself, or the positive statement that it declared none.

##### code

> `readonly` **code**: `"ASTM_LIVD_CATALOG_NO_LOINC_VERSION"`

Always `ASTM_LIVD_CATALOG_NO_LOINC_VERSION`.

##### message

> `readonly` **message**: `string`

Human-readable detail for logs. A **constant**: never a test code, a value, a LOINC, or any
text the consumer supplied. The catalog is named by the `catalog` field, not by this string.

***

### AstmLivdWarning

A single terminology (LIVD) warning: a stable code, a value-free human-readable
message, and positional context. Never carries a test code, a value, or a LOINC.

#### Example

```ts
import type { AstmLivdWarning } from "@cosyte/astm";
const w: AstmLivdWarning = {
  code: "ASTM_LIVD_UNMAPPED_CODE",
  message: "Reported test code had no LIVD mapping, surfaced unmapped, never a guessed LOINC.",
  position: { recordIndex: 3, recordType: "R" },
};
```

#### Properties

##### code

> `readonly` **code**: [`LivdWarningCode`](#livdwarningcode)

##### message

> `readonly` **message**: `string`

Human-readable detail for logs. Never contains a test code, a value, or a LOINC.

##### position

> `readonly` **position**: [`AstmPosition`](#astmposition)

***

### AstmLtpWarning

A single LTP protocol / transport warning: a stable code, a value-free
human-readable message, and, for a frame-scoped deviation, the frame number
only. Never carries a frame's record bytes.

#### Example

```ts
import type { AstmLtpWarning } from "@cosyte/astm";
const w: AstmLtpWarning = {
  code: "ASTM_LTP_FRAME_REJECTED",
  message: "Frame rejected, NAK sent, retransmit expected.",
  frameNumber: 2,
};
```

#### Properties

##### code

> `readonly` **code**: [`LtpWarningCode`](#ltpwarningcode)

##### frameNumber?

> `readonly` `optional` **frameNumber?**: `number`

The frame's sequence number when the warning is frame-scoped; absent otherwise.

##### message

> `readonly` **message**: `string`

Human-readable detail for logs. Never contains the frame's record bytes.

***

### AstmMessage

A parsed ASTM message: the header, the ordered records (the header is also
`records[0]`), the resolved delimiters, and the accumulated warnings.

#### Example

```ts
import { parseAstmRecords } from "@cosyte/astm";
const msg = parseAstmRecords("H|\\^&\rL|1\r");
msg.header.delimiters.field; // "|"
msg.records.length;          // 2
```

#### Properties

##### classification

> `readonly` **classification**: [`AstmMessageClassification`](#astmmessageclassification-1)

The host-query classification of the **whole stream**: whether its records make a request
(`Q` present), a result upload, an order download, or indeterminate. Gate on
[AstmMessageClassification.isHostQueryRequest](#ishostqueryrequest) before reading records as results.

It is folded over every record, not per message, and it does not throw on a multi-message
stream. A `Q` in one message makes the whole stream read as a host query, and a stream that
also carries results anywhere raises `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND`. Classify each
message on its own with `classifyMessage(m.records)` over `messages()`.

##### delimiters

> `readonly` **delimiters**: [`Delimiters`](#delimiters-2)

The delimiters the **first** header declared.

A stream may carry several messages (`H` … `L`), and a later header may declare a different set,
which is honored from that header onward. So this is not necessarily the set every record was
read with: each header reports its own on [HeaderRecord.delimiters](#delimiters-3), and a change is
flagged `ASTM_RECORD_DELIMITERS_REDECLARED`.

##### header

> `readonly` **header**: [`HeaderRecord`](#headerrecord)

The **first** header in the stream. A multi-header stream's later headers are in [AstmMessage.records](#records).

##### profile?

> `readonly` `optional` **profile?**: `object`

The vendor profile that was active for this parse, when one applied: its
`name` and resolved `lineage` (attribution only; the profile object itself is
not embedded). Absent when no profile applied. A profile that tolerated a
deviation shows up as a `PROFILE_QUIRK_APPLIED` entry in [AstmMessage.warnings](#warnings-2), not
here.

###### lineage

> `readonly` **lineage**: readonly `string`[]

###### name

> `readonly` **name**: `string`

##### records

> `readonly` **records**: readonly [`AstmRecord`](#astmrecord)[]

##### warnings

> `readonly` **warnings**: readonly [`AstmRecordWarning`](#astmrecordwarning)[]

***

### AstmMessageClassification

The host-query classification of a set of records. `isHostQueryRequest` is the
single boolean a consumer should gate on before treating records as results: it
is `true` **iff** a `Q` record is present among the records classified.

Which records those are depends on where it comes from. On
[AstmMessage.classification](#classification) it is folded over **every record in the
stream**, not one message: a stream carrying several `H` … `L` messages gets one
classification, so a `Q` in any message makes the whole stream read as a host
query. `classifyMessage(m.records)`, on a message from `messages()`, gives
that one message's classification.

#### Example

```ts
import { parseAstmRecords } from "@cosyte/astm";
const req = parseAstmRecords("H|\\^&\rP|1\rQ|1|^SPEC-7||ALL\rL|1\r");
req.classification.kind;               // "host-query"
req.classification.isHostQueryRequest; // true, never read its records as results
```

#### Properties

##### hasOrders

> `readonly` **hasOrders**: `boolean`

At least one `O` (order) record is present.

##### hasQuery

> `readonly` **hasQuery**: `boolean`

At least one `Q` (request-information) record is present.

##### hasResults

> `readonly` **hasResults**: `boolean`

At least one `R` (result) record is present.

##### hasUnrecognized

> `readonly` **hasUnrecognized**: `boolean`

At least one record's type letter was **not recognized** (an
[UnsupportedRecord](#unsupportedrecord)), so the letter counts above are known to be incomplete.

Any of them may have been a `Q`, which is why records that include one are classified
`indeterminate` unless a `Q` was read outright. `ASTM_RECORD_UNKNOWN_TYPE` reports the same
condition on [AstmMessage.warnings](#warnings-2).

##### isHostQueryRequest

> `readonly` **isHostQueryRequest**: `boolean`

`true` **iff** `kind === "host-query"` (a `Q` record was read), the safety surface: gate on this
before treating records as results, so a query is never misread as a result upload.

`false` is **not** a warrant that the records are a result set. Read `kind` for that: it is
`indeterminate` whenever the reader could not account for every type letter.

##### kind

> `readonly` **kind**: [`AstmMessageKind`](#astmmessagekind)

The kind of the records classified.

`indeterminate` also covers records the reader declines to classify: when
[AstmMessageClassification.hasUnrecognized](#hasunrecognized) is `true` and no `Q` was read, the kind is
withheld rather than guessed, because the unreadable letter may have been that `Q`. The `has*`
flags below stay truthful in that case, so a caller that wants the raw counts still has them.

***

### AstmParseOptions

Options for [parseAstmRecords](#parseastmrecords). Lenient by default (Postel's Law).

#### Properties

##### profile?

> `readonly` `optional` **profile?**: [`AstmProfile`](#astmprofile) \| `null`

An active vendor [AstmProfile](#astmprofile). Its quirk tolerances downgrade the
deviations it *expects* to `PROFILE_QUIRK_APPLIED` warnings (values are never
altered). An explicit profile wins over the process-scoped default
([setDefaultAstmProfile](#setdefaultastmprofile)); pass `null` to opt out of the default for a
single call. Omit to use the default, or no profile when none is registered.

##### strict?

> `readonly` `optional` **strict?**: `boolean`

When `true`, escalate any Tier-2 deviation to a thrown [AstmStrictError](#astmstricterror)
instead of accumulating a warning. Off by default. A deviation a profile
*expected* (a `PROFILE_QUIRK_APPLIED`) does **not** escalate: it is known,
benign, and still recorded.

***

### AstmPosition

Where in a record stream a warning or fatal originated. Every field is
positional; none is a value.

#### Example

```ts
import type { AstmPosition } from "@cosyte/astm";
const at: AstmPosition = { recordIndex: 3, recordType: "R", fieldIndex: 4 };
```

#### Properties

##### componentIndex?

> `readonly` `optional` **componentIndex?**: `number`

1-based component index within the field, when the deviation is component-scoped.

##### fieldIndex?

> `readonly` `optional` **fieldIndex?**: `number`

1-based field index within the record (ASTM fields are 1-indexed).

##### recordIndex

> `readonly` **recordIndex**: `number`

0-based ordinal of the record within the message.

##### recordType?

> `readonly` `optional` **recordType?**: `string`

The record's type letter (`H`/`P`/`O`/`R`/`L`/…), when known.

***

### AstmProfile

A frozen, immutable vendor/conformance profile. Produced by
[defineAstmProfile](#defineastmprofile); consumers pass it to `parseAstmRecords(raw, { profile })`
(or register it as the process default), and feed its [AstmProfile.transport](#transport)
to `detectFraming(bytes, { override })`. Hand-authoring the object literal is
supported but discouraged: the factory validates the safety rules and attaches
`describe()`.

#### Example

```ts
import { parseAstmRecords, astmProfiles } from "@cosyte/astm";
const msg = parseAstmRecords(raw, { profile: astmProfiles.referenceCorpus });
msg.profile?.name; // "referenceCorpus"
```

#### Properties

##### describe?

> `readonly` `optional` **describe?**: () => `string`

Multi-line human-readable summary; always present on factory-built profiles.

###### Returns

`string`

##### description?

> `readonly` `optional` **description?**: `string`

Optional human-readable description.

##### lineage

> `readonly` **lineage**: readonly `string`[]

Resolved lineage: `[...parents, name]`, first-occurrence deduped.

##### name

> `readonly` **name**: `string`

The profile's unique name (registry key / attribution label).

##### provenance?

> `readonly` `optional` **provenance?**: [`AstmProfileProvenance`](#astmprofileprovenance-1)

The cited public grounding for this profile's quirks (absent for `default`).

##### tolerate

> `readonly` **tolerate**: readonly [`AstmQuirkTolerance`](#astmquirktolerance)[]

The expected, non-safety-critical deviations this profile tolerates.

##### transport?

> `readonly` `optional` **transport?**: [`AstmFraming`](#astmframing)

The raw-vs-framed-TCP override. When set, a consumer forces this framing via
`detectFraming(bytes, { override: profile.transport })`, the way a profile
that knows a vendor's transport reality (e.g. framing dropped over raw TCP)
bypasses leading-byte auto-detection. Absent means "let detection decide."

***

### AstmProfileProvenance

Provenance for an [AstmProfile](#astmprofile): the **real, cited public artifact** a
profile's quirks are grounded in. A quirk is encoded only when a real
(de-identified) document or a redistributable reference corpus grounds it; this
record is where that grounding is stated, so a reviewer can trace every
tolerated deviation back to evidence rather than invention.

#### Example

```ts
import type { AstmProfileProvenance } from "@cosyte/astm";
const prov: AstmProfileProvenance = {
  source: "kxepal/python-astm codec.py",
  reference: "https://github.com/kxepal/python-astm/blob/master/astm/codec.py",
  retrieved: "2026-07-21",
};
```

#### Properties

##### note?

> `readonly` `optional` **note?**: `string`

Optional clarifying note about what in the source grounds the quirks.

##### reference

> `readonly` **reference**: `string`

A citation the grounding can be traced to: a URL, DOI, or repo+path.

##### retrieved?

> `readonly` `optional` **retrieved?**: `string`

When the grounding was last verified (ISO date) or the pinned commit SHA.

##### source

> `readonly` **source**: `string`

Short human-readable name of the grounding source (corpus, transcript, or spec).

***

### AstmQuirkMatch

Optional structural narrowing for an [AstmQuirkTolerance](#astmquirktolerance). When present, the
tolerance applies only to warnings whose PHI-free [AstmPosition](#astmposition) matches
every provided field, so a profile can expect a deviation on one record type
(e.g. an unknown escape only inside `R` result values) without blanket-tolerating
it everywhere. Matching is on **structural identifiers only** (record-type
letter, 1-based field index); there is no matching on any field *value*, by
construction.

#### Example

```ts
import type { AstmQuirkMatch } from "@cosyte/astm";
const onlyResultUnits: AstmQuirkMatch = { recordType: "R", fieldIndex: 5 };
```

#### Properties

##### fieldIndex?

> `readonly` `optional` **fieldIndex?**: `number`

Match only warnings carrying this 1-based field index in their position.

##### recordType?

> `readonly` `optional` **recordType?**: `string`

Match only warnings carrying this record-type letter in their position.

***

### AstmQuirkTolerance

One expected deviation declared by a profile. `code` names an **existing,
non-safety-critical** warning code the profile expects; `rationale` documents
why (grounded in the profile's [AstmProfileProvenance](#astmprofileprovenance-1)); optional `match`
narrows it to a structural location. `defineAstmProfile` throws if `code` is
safety-critical or is not a real warning code, or if `rationale` is empty.

#### Example

```ts
import type { AstmQuirkTolerance } from "@cosyte/astm";
const t: AstmQuirkTolerance = {
  code: "ASTM_UNKNOWN_ESCAPE_SEQUENCE",
  rationale: "Corpus stacks that treat '&' as literal data emit non-standard escape bodies.",
};
```

#### Properties

##### code

> `readonly` **code**: [`AnyAstmWarningCode`](#anyastmwarningcode)

The existing, non-safety-critical warning code this profile expects.

##### match?

> `readonly` `optional` **match?**: [`AstmQuirkMatch`](#astmquirkmatch)

Optional structural narrowing (record type / field index).

##### rationale

> `readonly` **rationale**: `string`

Why the profile expects this deviation: grounded in its provenance.

***

### AstmRecordWarning

A single Tier-2 warning: a stable code, a value-free human-readable message,
and positional context. Plain data, accumulated onto `AstmMessage.warnings`.

#### Example

```ts
import type { AstmRecordWarning } from "@cosyte/astm";
const w: AstmRecordWarning = {
  code: "ASTM_RECORD_UNKNOWN_TYPE",
  message: "Unknown record type.",
  position: { recordIndex: 2, recordType: "Z" },
};
```

#### Properties

##### code

> `readonly` **code**: [`WarningCode`](#warningcode)

##### expected?

> `readonly` `optional` **expected?**: `boolean`

`true` when an active vendor [AstmProfile](#astmprofile) *expected* this deviation and re-badged it as a
[WARNING\_CODES.PROFILE\_QUIRK\_APPLIED](#profile_quirk_applied). An `expected` warning does **not** escalate to a
thrown `AstmStrictError` in strict mode (the whole point of the profile is that this deviation is
known and benign): it is still recorded, so nothing is hidden. Absent on an untolerated warning.

##### message

> `readonly` **message**: `string`

Human-readable detail for logs. Never contains a field value.

##### position

> `readonly` **position**: [`AstmPosition`](#astmposition)

##### profile?

> `readonly` `optional` **profile?**: `string`

The name of the [AstmProfile](#astmprofile) that tolerated this warning, when `expected`.

##### toleratedCode?

> `readonly` `optional` **toleratedCode?**: [`WarningCode`](#warningcode)

When `code` is [WARNING\_CODES.PROFILE\_QUIRK\_APPLIED](#profile_quirk_applied), the original warning code the profile
tolerated, so a consumer can still see *which* deviation was re-badged as expected.

***

### AstmStreamMessage

One `H` … `L` message inside a parsed stream, with its own records and nothing else.

This is the unit the flat extractors were always assumed to be reading. `AstmMessage`
models the whole stream; this models a message within it.

#### Properties

##### comments

> `readonly` **comments**: readonly [`CommentRecord`](#commentrecord)[]

Every `C` (comment) record in this message, in wire order.

##### delimiters

> `readonly` **delimiters**: [`Delimiters`](#delimiters-2)

The delimiter set in force for this message: the header's own resolved set, which is
the set its records were actually read with. When a later header's declaration was
unusable, this is the set that stayed in force, never a guessed one.

##### header

> `readonly` **header**: [`HeaderRecord`](#headerrecord)

This message's header record.

##### index

> `readonly` **index**: `number`

0-based ordinal of this message within the stream.

##### orders

> `readonly` **orders**: readonly [`OrderRecord`](#orderrecord)[]

Every `O` (order) record in this message, in wire order.

##### patient

> `readonly` **patient**: [`PatientRecord`](#patientrecord) \| `undefined`

This message's patient, but **only when the message determines one**: the single `P`
when it carries exactly one, and `undefined` when it carries none **or** several.
`patients.length` distinguishes those two cases; there is no third meaning.

A message carrying several patients is not answered with the first one, because
"the first `P`" is precisely the guess that files a result against the wrong person.

##### patients

> `readonly` **patients**: readonly [`PatientRecord`](#patientrecord)[]

Every `P` record in this message, in wire order (usually zero or one).

##### queries

> `readonly` **queries**: readonly [`QueryRecord`](#queryrecord)[]

Every `Q` (request-information) record in this message, in wire order.

For this message's host-query classification, call `classifyMessage(m.records)`. The
`classification` on the parsed model is folded over the **whole stream**, so it is not
per-message and is not mirrored here; deriving it from a message's own records is.

##### records

> `readonly` **records**: readonly [`AstmRecord`](#astmrecord)[]

Every record of this message in wire order, the header first.

##### results

> `readonly` **results**: readonly [`ResultRecord`](#resultrecord)[]

Every `R` (result) record in this message, in wire order.

***

### CommentInput

Input for a `C` (comment) record.

#### Properties

##### commentType?

> `readonly` `optional` **commentType?**: `string`

Field 5: comment type code, emitted verbatim.

##### seq?

> `readonly` `optional` **seq?**: `string`

##### source?

> `readonly` `optional` **source?**: `string`

Field 3: comment source.

##### text?

> `readonly` `optional` **text?**: `string`

Field 4: comment text (a single component). Use [CommentInput.textComponents](#textcomponents) for a structured comment.

##### textComponents?

> `readonly` `optional` **textComponents?**: readonly `string`[]

Field 4: comment text as explicit components (takes precedence over `text` when set).

##### type

> `readonly` **type**: `"C"`

***

### CommentRecord

The `C` (comment) record: free-text context attached to a parent record.

A comment is **attached by position** to the immediately-preceding `H`/`P`/`O`/`R` record
([CommentRecord.parentIndex](#parentindex)); consecutive comments share that parent. **Fail-safe:** a
comment with no valid preceding parent is an **orphan**: it is attached to the message root
([CommentRecord.attachedToRoot](#attachedtoroot) `true`) and a value-free `ASTM_RECORD_ORPHAN_COMMENT` warning
fires, **never silently dropped**, so a comment carrying (e.g.) "QC / non-compliant" context can
never float away unnoticed.

#### Extends

- `RecordBase`

#### Properties

##### attachedToRoot

> `readonly` **attachedToRoot**: `boolean`

`true` when no valid parent preceded: the comment is attached to the message root (and warned).

##### commentType?

> `readonly` `optional` **commentType?**: `string`

Field 5: comment type code, surfaced verbatim. **`[OSS-derived]`:** `I` (instrument) is the only
value seen in the permissively-licensed real transcripts; other values (e.g. `G`/`T`/`P`) are
defined only in the paywalled CLSI LIS02-A2 and are **not** interpreted here: the raw code is
surfaced, never mapped to a guessed meaning.

##### fields

> `readonly` **fields**: readonly [`AstmField`](#astmfield)[]

The record's fields. `fields[0]` is the type-letter field; data fields are 1-indexed after it.

On a record the parser returns this is an enumerable getter, not a data property: a field with
no repeat, component or escape character is built the first time `fields` is read, and every
read after that returns the same frozen array. Object keys, spread, `JSON.stringify` and
`structuredClone` all see it as a value. Every empty field is one shared frozen object.

###### Inherited from

`RecordBase.fields`

##### parentIndex?

> `readonly` `optional` **parentIndex?**: `number`

The `recordIndex` of the `H`/`P`/`O`/`R` record this comment is attached to, or `undefined` when
the comment is an orphan attached to the message root (see [CommentRecord.attachedToRoot](#attachedtoroot)).

##### recordIndex

> `readonly` **recordIndex**: `number`

0-based ordinal of the record within the message.

###### Inherited from

`RecordBase.recordIndex`

##### seq?

> `readonly` `optional` **seq?**: `string`

Field 2: sequence number.

##### source?

> `readonly` `optional` **source?**: `string`

Field 3: comment source (who/what produced it), surfaced verbatim.

##### text?

> `readonly` `optional` **text?**: `string`

Field 4: the comment text, surfaced as the **full** field text (all components), never
truncated to the first component. The component structure is in [CommentRecord.textComponents](#textcomponents-1).

##### textComponents?

> `readonly` `optional` **textComponents?**: readonly `string`[]

Field 4: the comment text split into its decoded components (comment text is component-capable;
multiple components are a normal structured comment, **not** an ambiguity). Present only when the
field carried more than one component.

##### type

> `readonly` **type**: `"C"`

The record's raw type letter.

###### Overrides

`RecordBase.type`

***

### ComposeFramesOptions

Options for [composeAstmFrames](#composeastmframes).

#### Properties

##### startFrameNumber?

> `readonly` `optional` **startFrameNumber?**: `number`

The frame number to start the sequence at: a whole number from `0` to `7`.
Defaults to `1`, the number ASTM gives the first frame of a transfer and the
one [decodeAstmFrames](#decodeastmframes) expects to read first.

**Any other value writes a continuation rather than the start of a transfer,
and that is what the option is for**: composing one transfer across more than
one call. Concatenating `composeAstmFrames(head)` with
`composeAstmFrames(tail, { startFrameNumber: n })`, where `n` is the number
after the last frame `head` used, is byte-identical to composing the whole
list in a single call and decodes with an empty warnings array, across the
`7 → 0` rollover included.

**Decoded on its own, a stream that starts anywhere but `1` opens on a
sequence gap.** The decoder never bridges a gap silently, so it warns
(`ASTM_FRAME_SEQUENCE_GAP`) and does not emit that first record.
**What [parseFramedAstm](#parseframedastm) does after that varies with the message
shape and no rule is offered for it here.** It may throw, under more than
one code, and it may return a message that is simply one record short. **The
one thing that does hold is that the record layer never reports the loss**:
`parseFramedAstm` hands the record parser only the frames the codec
vouched for, so `message.warnings` carries what the surviving records
warrant and nothing about the record that did not survive. **Read
`frameWarnings`.** That is the cost of the option rather than a defect in
the caller's records, and it is why `1` is the default.

**Finding the number to continue from.** Nothing here returns it, and the
frame count is not it once a record splits: decode the part you just
composed and read the last frame's number, then add one modulo 8, as in
`((decodeAstmFrames(part).frames.at(-1)?.frameNumber ?? 0) + 1) % 8`. A frame
carries no number only when the stream ends immediately after its `STX`,
which is not something this encoder writes, so that fallback never fires on
a part composed here. Getting the number wrong costs the record at the join,
warned rather than silently.

A value outside `0`-`7`, or one that is not a whole number, is refused with
`ASTM_FRAME_INVALID_START_FRAME_NUMBER`.

***

### DateParts

The calendar components a parsed value actually stated: the shared return
shape of [toObject](#toobject) across every `@cosyte` parser.

Every value is a `number` and `month` is **spec-native 1 to 12**, never the JS
`Date` 0 to 11. A component the value did not state is **absent**: the key is
not present at all, rather than present and `undefined`, so `Object.keys()` of
the result is exactly the set of stated components and the value's precision is
recoverable from it. There is no `precision`, `raw`, `valid` or `truncated` key:
this is the calendar reading, not the parse record.

Deleting `offsetMinutes` leaves an object `Temporal.PlainDateTime.from` and
luxon's `DateTime.fromObject` accept with no key rename and no value
adjustment, which is why the keys are singular and the month is 1-based.
Neither library is a dependency of this package: the shape is the interop, not
an import.

`millisecond` and `offsetMinutes` belong to the shared shape and are **never
populated by this package**: an ASTM timestamp carries no timezone, and this
parser retains no fractional-second component (the digits stay in
[AstmDate.raw](#raw-1)). They are declared so that code written over two
`@cosyte` parsers reads one shape rather than two.

#### Properties

##### day?

> `readonly` `optional` **day?**: `number`

Day of month, 1 to 31.

##### hour?

> `readonly` `optional` **hour?**: `number`

Hour of day, 0 to 23.

##### millisecond?

> `readonly` `optional` **millisecond?**: `number`

Millisecond. Never populated here: this parser retains no fractional second.

##### minute?

> `readonly` `optional` **minute?**: `number`

Minute of hour, 0 to 59.

##### month?

> `readonly` `optional` **month?**: `number`

Calendar month, **1 to 12**, as the standard states it.

##### offsetMinutes?

> `readonly` `optional` **offsetMinutes?**: `number`

Signed minutes east of UTC. Never populated here: ASTM states no offset.

##### second?

> `readonly` `optional` **second?**: `number`

Second of minute, 0 to 59.

##### year?

> `readonly` `optional` **year?**: `number`

Four-digit calendar year, exactly as stated (`50` is the year 50, not 1950).

***

### DecodeAstmFramesResult

The result of [decodeAstmFrames](#decodeastmframes): the reassembled record bytes, every
decoded frame, and the accumulated frame warnings.

#### Properties

##### frames

> `readonly` **frames**: readonly [`AstmFrame`](#astmframe)[]

Every decoded frame, trusted or not, in wire order.

##### records

> `readonly` **records**: readonly `Uint8Array`\<`ArrayBufferLike`\>[]

The reassembled record byte-strings: one entry per complete record (a run of
frames closed by an `ETX`), in wire order. **Only** clean reassemblies appear:
a record whose frames included a bad checksum, a sequence gap, or an
unterminated frame is **omitted** (its frames are still in [DecodeAstmFramesResult.frames](#frames),
flagged). Each entry is ready to hand to `parseAstmRecords`.

##### warnings

> `readonly` **warnings**: readonly [`AstmFrameWarning`](#astmframewarning)[]

The frame warnings accumulated during a lenient decode (empty in a clean decode).

***

### DefineAstmProfileOptions

Options accepted by [defineAstmProfile](#defineastmprofile). Mirrors the [AstmProfile](#astmprofile)
shape minus the derived `lineage`/`describe`, plus the `extends` input key. Every
field except `name` is optional.

#### Example

```ts
import { defineAstmProfile, type DefineAstmProfileOptions } from "@cosyte/astm";
const opts: DefineAstmProfileOptions = {
  name: "my-analyzer",
  transport: "raw",
  tolerate: [{ code: "ASTM_NONSTANDARD_DELIMITERS", rationale: "declares its own set" }],
};
const p = defineAstmProfile(opts);
```

#### Properties

##### description?

> `readonly` `optional` **description?**: `string`

##### extends?

> `readonly` `optional` **extends?**: [`AstmProfile`](#astmprofile) \| readonly [`AstmProfile`](#astmprofile)[]

##### name

> `readonly` **name**: `string`

##### provenance?

> `readonly` `optional` **provenance?**: [`AstmProfileProvenance`](#astmprofileprovenance-1)

##### tolerate?

> `readonly` `optional` **tolerate?**: readonly [`AstmQuirkTolerance`](#astmquirktolerance)[]

##### transport?

> `readonly` `optional` **transport?**: [`AstmFraming`](#astmframing)

***

### Delimiters

The four ASTM delimiters resolved from an `H` record. Immutable; carried on
the parsed message as delimiter provenance.

#### Example

```ts
import { readDelimiters } from "@cosyte/astm";
const d = readDelimiters("H|\\^&");
d.field;     // "|"
d.repeat;    // "\\"
d.component; // "^"
d.escape;    // "&"
```

#### Properties

##### component

> `readonly` **component**: `string`

Component separator: ASTM `^` by default.

##### escape

> `readonly` **escape**: `string`

Escape character: ASTM `&` by default (introduces `&F&`/`&S&`/`&R&`/`&E&`).

##### field

> `readonly` **field**: `string`

Field separator: the char immediately after `H` in the header.

##### repeat

> `readonly` **repeat**: `string`

Repeat (repetition) separator: ASTM `` by default.

***

### DetectFramingOptions

Options for [detectFraming](#detectframing).

#### Properties

##### override?

> `readonly` `optional` **override?**: [`AstmFraming`](#astmframing)

A profile-supplied override. When set, detection is bypassed entirely and this
value is returned with no warning: the way a vendor profile forces raw for
a cobas b121 or framed for a cobas 4800 regardless of the leading byte.

***

### DetectFramingResult

The result of [detectFraming](#detectframing): the decided framing plus any warning
(exactly one `ASTM_LTP_AMBIGUOUS_TRANSPORT` when the lead was unrecognizable and
the mode was defaulted; empty otherwise).

#### Properties

##### defaulted

> `readonly` **defaulted**: `boolean`

`true` when the lead byte was unrecognizable and `framing` was defaulted (not inferred).

##### framing

> `readonly` **framing**: [`AstmFraming`](#astmframing)

The decided transport framing.

##### warnings

> `readonly` **warnings**: readonly [`AstmLtpWarning`](#astmltpwarning)[]

The detection warnings (a single ambiguity warning, or none).

***

### FrameChecksum

A frame's checksum verdict: the modulo-256 value recomputed from the frame's
bytes, the value declared on the wire (or `undefined` when it was unreadable),
and whether they matched.

#### Properties

##### computed

> `readonly` **computed**: `number`

The modulo-256 checksum recomputed over the frame (frame number through terminator).

##### declared?

> `readonly` `optional` **declared?**: `number`

The checksum declared on the wire (the two hex chars after the terminator), read
case-insensitively; `undefined` when those bytes were missing or not hex.

##### valid

> `readonly` **valid**: `boolean`

`true` only when a declared checksum was present **and** equal to `computed`.

***

### FramedAstmResult

The result of [parseFramedAstm](#parseframedastm): the parsed message, plus the frame-layer
detail (every decoded frame and the frame warnings) so a consumer keeps full
visibility into the transport below the records.

#### Properties

##### frames

> `readonly` **frames**: readonly [`AstmFrame`](#astmframe)[]

Every decoded frame, trusted or not, in wire order.

##### frameWarnings

> `readonly` **frameWarnings**: readonly [`AstmFrameWarning`](#astmframewarning)[]

The frame-layer warnings (bad checksum, sequence gap, unterminated, oversize).

##### message

> `readonly` **message**: [`AstmMessage`](#astmmessage)

The message parsed from the trusted, reassembled record bytes.

***

### FrameOptions

Options for [decodeAstmFrames](#decodeastmframes). Lenient by default (Postel's Law).

#### Properties

##### strict?

> `readonly` `optional` **strict?**: `boolean`

When `true`, escalate any tolerated frame deviation (bad checksum, sequence
gap, unterminated, oversize) to a thrown [AstmFrameStrictError](#astmframestricterror) instead
of accumulating a warning. Off by default.

***

### HeaderInput

Optional header fields (after the delimiter declaration).

#### Properties

##### fields?

> `readonly` `optional` **fields?**: readonly `string`[]

Extra `H`-record fields (field 3 onward), emitted verbatim in order. Field 2 is always `\^&`.

***

### HeaderRecord

The `H` (header) record. Carries the delimiters it declared as provenance.

#### Extends

- `RecordBase`

#### Properties

##### delimiters

> `readonly` **delimiters**: [`Delimiters`](#delimiters-2)

The four delimiters **this** header put into force: the set its own fields, and every record
after it, were read with.

A stream may carry several messages (`H` … `L`) and each header declares its own set, so on a
multi-header stream these can differ between headers; [AstmMessage.delimiters](#delimiters) is the
first header's. When a later header cannot declare a usable set, the set already in force is
kept and reported here (with an `ASTM_RECORD_UNREADABLE_REDECLARATION` warning) rather than a
guessed one.

##### fields

> `readonly` **fields**: readonly [`AstmField`](#astmfield)[]

The record's fields. `fields[0]` is the type-letter field; data fields are 1-indexed after it.

On a record the parser returns this is an enumerable getter, not a data property: a field with
no repeat, component or escape character is built the first time `fields` is read, and every
read after that returns the same frozen array. Object keys, spread, `JSON.stringify` and
`structuredClone` all see it as a value. Every empty field is one shared frozen object.

###### Inherited from

`RecordBase.fields`

##### rawLine

> `readonly` **rawLine**: `string`

The header's exact wire text (terminator excluded), kept as **provenance**: the
delimiters are read from this raw text, never from [RecordBase.fields](#fields-2).

It is **not** what the serializer emits from. To change a header field, edit
[RecordBase.fields](#fields-2): `fields[0]` is the type letter, `fields[1]` is the
delimiter declaration, and the header's ASTM data fields follow from `fields[2]`.
Editing this string instead has no effect on emit.

##### recordIndex

> `readonly` **recordIndex**: `number`

0-based ordinal of the record within the message.

###### Inherited from

`RecordBase.recordIndex`

##### type

> `readonly` **type**: `"H"`

The record's raw type letter.

###### Overrides

`RecordBase.type`

***

### LivdAnnotation

One record's LIVD annotation: which record, the code the catalog was consulted
with (verbatim), how it was recognized, the lookup outcome, and the two facts
about a populated component 1 that ride alongside **any** outcome. Additive: it
points at the record by index and never replaces it.

#### Example

```ts
import type { LivdAnnotation } from "@cosyte/astm";
const a: LivdAnnotation = {
  recordIndex: 3,
  recordType: "R",
  reportedCode: "687",
  unvalidatedWireValue: "Glucose",
  wireValueDisagreesWithCatalog: true,
  provenance: "local-code",
  mapping: { status: "mapped", loinc: "1920-8", source: "livd", derived: true },
};
```

#### Properties

##### catalogLoincVersion?

> `readonly` `optional` **catalogLoincVersion?**: `string`

The **LOINC version the catalog declared**, verbatim, carried on **every** annotation that
catalog produced, whatever the outcome of the lookup. It is what makes a mapping reproducible:
the reader can see which version of LOINC the consumer's catalog says it was built against.

**It asserts nothing about this LOINC.** It is provenance about the CATALOG, not a claim that
any LOINC was checked, found, or validated against that version: this package performs no
LOINC validation of any kind, and nothing here reads the string beyond carrying it.

Absent when the catalog declared no LOINC version (including a catalog a consumer implemented
by hand, which declares none), never a default, a placeholder or an empty string.

##### mapping

> `readonly` **mapping**: [`LivdMapping`](#livdmapping)

The lookup outcome: never a guessed LOINC.

##### provenance

> `readonly` **provenance**: [`UniversalTestIdProvenance`](#universaltestidprovenance-1)

How the identifier was recognized in the Universal Test ID (provenance only, never a lookup).

##### recordIndex

> `readonly` **recordIndex**: `number`

The `recordIndex` of the annotated `R`/`O` record.

##### recordType

> `readonly` **recordType**: `"O"` \| `"R"`

The annotated record's type.

##### reportedCode?

> `readonly` `optional` **reportedCode?**: `string`

The vendor/local code the catalog was consulted with, verbatim. Absent when no
vendor/local code was present, because then nothing was looked up. It is never
a component 1 value.

##### unvalidatedWireValue?

> `readonly` `optional` **unvalidatedWireValue?**: `string`

Component 1 when populated, verbatim: a wire value this library **does not
vouch for**, carried on every outcome and never validated, never promoted to a
LOINC, and never used as a lookup key. Absent when component 1 is empty.

##### wireValueDisagreesWithCatalog

> `readonly` **wireValueDisagreesWithCatalog**: `boolean`

`true` if and only if the catalog vouched for exactly one LOINC for the
vendor/local code, component 1 is populated, and that value is not
byte-identical to that LOINC. `false` in **every** other case, including where
the catalog vouched for no single LOINC (a miss, an ambiguity, no vendor code,
no code at all): asserting a disagreement there would claim the catalog spoke
about a code it never spoke about.

It reports the difference and **nothing else**. Neither value is marked
correct, neither is suppressed, and no field says the difference was settled.

***

### LivdCandidate

One candidate mapping behind an `ambiguous` answer: the LOINC plus the LIVD
attributes that tell candidates apart, so a human can choose what this package
refuses to guess.

One per catalog row for the vendor code, in catalog order, so a LOINC appearing in
two rows appears twice. Every candidate is surfaced, including one that is not unit
qualified: it can never be selected on a unit, but hiding it would hide a mapping
the consumer's own catalog holds.

#### Example

```ts
import type { LivdCandidate } from "@cosyte/astm";
const c: LivdCandidate = {
  loinc: "2345-7",
  vendorSpecimenDescription: "Serum or Plasma",
  representativeUnit: "mg/dL",
  unitQualified: true,
};
```

#### Properties

##### loinc

> `readonly` **loinc**: `string`

The candidate LOINC, verbatim from the catalog row. Never validated.

##### loincLongName?

> `readonly` `optional` **loincLongName?**: `string`

The row's LOINC Long Common Name, when supplied.

##### representativeUnit?

> `readonly` `optional` **representativeUnit?**: `string`

The row's representative unit, verbatim, when supplied.

##### unitQualified

> `readonly` **unitQualified**: `boolean`

`false` when the representative unit is absent, empty or whitespace only. Such a candidate is
**never** selected by a unit comparison against any reported units, and is surfaced here anyway.

##### vendorResultDescription?

> `readonly` `optional` **vendorResultDescription?**: `string`

The row's Vendor Result Description, verbatim, when supplied. Never matched on.

##### vendorSpecimenDescription?

> `readonly` `optional` **vendorSpecimenDescription?**: `string`

The row's Vendor Specimen Description, verbatim, when supplied. Never matched on.

***

### LivdCatalog

An immutable, consumer-supplied LIVD catalog. Look a vendor code up with
[LivdCatalog.lookup](#lookup); the catalog **never** picks between conflicting
LOINCs and **never** mutates. Build one with [defineLivdCatalog](#definelivdcatalog).

#### Properties

##### publication?

> `readonly` `optional` **publication?**: [`LivdPublication`](#livdpublication)

The publication-level metadata the consumer declared, each value **verbatim**. Absent where
the catalog declared none, and each field inside it absent where that value was not declared:
a blank is never stored as a blank, and nothing is ever defaulted.

Optional on the interface, so a catalog a consumer implements by hand needs no metadata and
stays source compatible.

##### size

> `readonly` **size**: `number`

The number of distinct vendor codes indexed (not the number of input rows).

##### warnings?

> `readonly` `optional` **warnings?**: readonly [`AstmLivdCatalogWarning`](#astmlivdcatalogwarning)[]

The value-free warnings raised where this catalog was **defined**, in the order they were
raised. [defineLivdCatalog](#definelivdcatalog) always sets it, empty where it had nothing to say.

These are facts about the CATALOG, so they never join the per-record warning stream
[applyLivd](#applylivd) returns and they implicate no record. Optional on the interface, so a
hand-implemented catalog that offers none stays source compatible.

#### Methods

##### lookup()

> **lookup**(`vendorCode`, `reportedUnits?`): [`LivdLookup`](#livdlookup)

Look a vendor code up, verbatim (exact, case-sensitive). Returns `mapped` on a
single-LOINC hit, `unmapped` on a miss, and `ambiguous` when the code carries
more than one distinct LOINC that the reported units did not settle: never a
guess.

`reportedUnits` are the units the `R` record carried, verbatim. They are compared
with each candidate's [LivdEntry.representativeUnit](#representativeunit-1) by exact,
case-sensitive string equality and by nothing else. Omitting them, or passing an
empty or whitespace-only string, means **no units were reported**: no
unit-qualified candidate is chosen and a code carrying several candidates stays
`ambiguous`. A code carrying exactly one candidate LOINC is answered either way.

Implementing this interface by hand stays source compatible: a `lookup` declared
with the vendor code alone simply ignores the units, and answers as it always did.

###### Parameters

###### vendorCode

`string`

The reported vendor/local test code.

###### reportedUnits?

`string`

The units the record reported, verbatim, when it reported any.

###### Returns

[`LivdLookup`](#livdlookup)

The lookup outcome.

***

### LivdEntry

One LIVD mapping row a consumer supplies: a vendor test code and the LOINC it
maps to, plus optional human-readable / provenance fields. Modeled on the IICC
LIVD digital format's data elements.

#### Example

```ts
import type { LivdEntry } from "@cosyte/astm";
const e: LivdEntry = { vendorCode: "687", loinc: "1920-8", loincLongName: "AST" };
```

#### Properties

##### loinc

> `readonly` **loinc**: `string`

The **LOINC Code** this vendor code maps to (e.g. `"1920-8"`). Taken from the consumer's catalog
as-is and **never validated, altered, or invented**: the parser does not ship a LOINC table and
cannot check it; it only carries what the catalog says.

##### loincLongName?

> `readonly` `optional` **loincLongName?**: `string`

The **LOINC Long Common Name**, when the catalog supplies it: an optional human-readable label.

##### manufacturer?

> `readonly` `optional` **manufacturer?**: `string`

The device **Manufacturer**, when the catalog scopes the mapping to a device (optional provenance).

##### model?

> `readonly` `optional` **model?**: `string`

The device **Model**, when the catalog scopes the mapping to a device (optional provenance).

##### representativeUnit?

> `readonly` `optional` **representativeUnit?**: `string`

The **representative unit of measure** for this mapping, preferably a UCUM unit (e.g. `"mg/dL"`,
`"mmol/L"`, `"mmol/(24.h)"`). This is the **one** attribute a lookup ever selects on: when a
vendor analyte code carries several candidate LOINCs, the candidate whose representative unit is
**exactly equal** to the units the `R` record reported is chosen, compared verbatim and case
sensitively with no normalization, conversion or scale factor on either side.

Absent, empty or whitespace only means **not unit qualified**: such a candidate is never selected
by a unit comparison, though it is still surfaced among an ambiguous answer's candidates.
Optional, so an existing catalog keeps working unchanged.

##### vendorAnalyteName?

> `readonly` `optional` **vendorAnalyteName?**: `string`

The **Vendor Analyte Name**: the vendor's human-readable analyte label, when supplied.

##### vendorCode

> `readonly` **vendorCode**: `string`

The **Vendor Analyte Code**: the vendor transmission code the instrument sends (the local code
in an ASTM Universal Test ID, component 4). The mapping key; compared **verbatim** (exact,
case-sensitive) against the reported code, never normalized or fuzzy-matched.

##### vendorResultDescription?

> `readonly` `optional` **vendorResultDescription?**: `string`

The **Vendor Result Description**: the vendor's own human-readable text for the result this
mapping produces (binary, ordinal, nominal, or a numeric result with its unit). Carried
**verbatim** and surfaced for a human to read; **never matched on**, for the same reason as
[LivdEntry.vendorSpecimenDescription](#vendorspecimendescription-1). Optional.

##### vendorSpecimenDescription?

> `readonly` `optional` **vendorSpecimenDescription?**: `string`

The **Vendor Specimen Description**: the vendor's own human-readable text for the specimen this
mapping is for, such as `"Serum or Plasma"`. Carried **verbatim** (never trimmed, case folded or
normalized) and surfaced for a human to read. **Never matched on**: the mapping guide states this
text is not intended to be parsed by software that automates the mapping, so choosing on it would
be a string guess. Optional, so an existing catalog keeps working unchanged.

***

### LivdPublication

The publication-level metadata a consumer declares about the LIVD publication
their catalog was built from: what the mapping guide defines about the publication
rather than about any one row.

Every field is **optional** and every declared value is preserved **verbatim**:
nothing is trimmed, case folded, reordered, reformatted, defaulted or validated,
and no value is ever rejected, corrected or warned about on account of its content
or its shape. A value that is absent, empty or whitespace only is one case, **no
value declared**, which is the only inspection any of these strings gets.

**None of it is checked, and none of it is a claim by this package.** This library
is not the LOINC licensee and performs no LOINC validation of any kind, so it
cannot tell a real LOINC version from a typed one and does not try.

#### Example

```ts
import type { LivdPublication } from "@cosyte/astm";
const p: LivdPublication = { publisher: "Example Diagnostics", loincVersion: "2.78" };
```

#### Properties

##### loincCopyright?

> `readonly` `optional` **loincCopyright?**: `string`

The **LOINCCopyright**: the attribution statement the LOINC license requires beside content
that carries LOINC codes. Stored verbatim so it travels with the mapping it applies to.

**Carrying it is not discharging it.** The obligation is the consumer's, this package supplies
no statement on anyone's behalf, and it checks neither the presence nor the wording of one.

##### loincVersion?

> `readonly` `optional` **loincVersion?**: `string`

The **LOINC Version ID**: the version of LOINC the mapping was made against. Carried verbatim
onto every annotation this catalog produces ([LivdAnnotation.catalogLoincVersion](#catalogloincversion)), so a
mapping can be reproduced later. It is **provenance the consumer declared**, never a statement
that any LOINC was checked against it: nothing here validates a LOINC or a LOINC version.

Declaring none is allowed and surfaces a value-free warning on [LivdCatalog.warnings](#warnings-5);
the catalog is still built and every answer is unchanged.

##### publicationVersion?

> `readonly` `optional` **publicationVersion?**: `string`

The **Publication Version ID**: human-readable information the vendor provides that tells one
LIVD publication version from another. Verbatim, never parsed and never ordered against another.

##### publisher?

> `readonly` `optional` **publisher?**: `string`

The **Publisher**: the entity publishing the mapping information. Verbatim, never checked.

***

### LivdResult

The result of [applyLivd](#applylivd): the per-record annotations (one per `R`/`O`
record) and the value-free warnings for every unmapped or ambiguous code. Both
arrays are deeply frozen; the source message is untouched.

#### Properties

##### annotations

> `readonly` **annotations**: readonly [`LivdAnnotation`](#livdannotation)[]

One annotation per `R`/`O` record, in wire order.

##### warnings

> `readonly` **warnings**: readonly [`AstmLivdWarning`](#astmlivdwarning)[]

A value-free warning per `unmapped`/`ambiguous` code: never per `mapped`, and
never per `no-vendor-code`/`no-code`, where no lookup happened at all.

Per-record only. A warning about the CATALOG, such as one declaring no LOINC
version, is raised where the catalog is defined and stays on
[LivdCatalog.warnings](#warnings-5): it implicates no record, so it never joins this
stream and never changes its codes, its order or its length.

***

### LivdUnitComparison

How a candidate was selected on its unit, stated on the answer so a consumer cannot
read a matched unit as a UCUM conformance claim this package does not make.

Present on a [LivdLookup](#livdlookup) **only** when a unit comparison actually chose
between candidate LOINCs. Its whole content is a disclosure: the comparison was a
verbatim, case-sensitive string equality, and **not** a UCUM semantic comparison.
Nothing was normalized, case folded, scaled or converted on either side.

#### Example

```ts
import type { LivdUnitComparison } from "@cosyte/astm";
const c: LivdUnitComparison = {
  comparison: "verbatim-case-sensitive",
  ucumSemantic: false,
  reportedUnits: "mg/dL",
  representativeUnit: "mg/dL",
  note: "...",
};
```

#### Properties

##### comparison

> `readonly` **comparison**: `"verbatim-case-sensitive"`

Always `"verbatim-case-sensitive"`: an exact string equality, nothing normalized.

##### note

> `readonly` **note**: `string`

A human-readable restatement of the two facts above, for a log or a review screen.

##### reportedUnits

> `readonly` **reportedUnits**: `string`

The units the record reported, verbatim.

##### representativeUnit

> `readonly` **representativeUnit**: `string`

The chosen candidate's representative unit, verbatim. Byte-identical to `reportedUnits`.

##### ucumSemantic

> `readonly` **ucumSemantic**: `false`

Always `false`. This package does not compare unit expressions by their semantics.

***

### LtpState

The reducer's immutable session state. Every [ltpReduce](#ltpreduce) call returns a new,
frozen `LtpState`; the previous one is never mutated.

#### Properties

##### expectedFrame

> `readonly` **expectedFrame**: `number`

The next frame number the receiver expects (`1 → … → 7 → 0 → …`), meaningful in
`transfer`. A trusted frame carrying this number is accepted and appended; any
other number is a duplicate retransmit (idempotent re-`ACK`) or an out-of-sequence
frame (rejected with `NAK`), never silently bridged.

##### lastAcceptedFrame?

> `readonly` `optional` **lastAcceptedFrame?**: `number`

The frame number of the last frame accepted into the current record, used to
recognise a duplicate retransmit; `undefined` before the first frame of a
transfer is accepted.

##### openRecord

> `readonly` **openRecord**: `Uint8Array`

The bytes accumulated so far for the in-progress record: the concatenation of
the `ETB` frames accepted since the last `ETX`. Empty when no record is open.
These bytes are **never** delivered on their own: only an `ETX` completes a
record, at which point they (plus the final frame's text) become one entry in
[LtpState.records](#records-3). An `EOT` or an `ENQ` restart discards them unread.

##### phase

> `readonly` **phase**: [`LtpPhase`](#ltpphase)

The current protocol phase.

##### recordOpen

> `readonly` **recordOpen**: `boolean`

`true` when a record is mid-reassembly (an `ETB` frame was accepted, awaiting its `ETX`).

##### records

> `readonly` **records**: readonly `Uint8Array`\<`ArrayBufferLike`\>[]

The reassembled bytes of every **complete** record delivered so far in the
session (each closed by an `ETX` frame with a clean run). Concatenate these and
hand them to `parseAstmRecords` to get the message. Only trusted, in-sequence
frames contribute; a rejected or partial record never appears.

***

### LtpTransition

The result of one [ltpReduce](#ltpreduce) step: the next [LtpState](#ltpstate), the
[LtpAction](#ltpaction)s to perform (in order), and any [AstmLtpWarning](#astmltpwarning)s raised.

#### Properties

##### actions

> `readonly` **actions**: readonly [`LtpAction`](#ltpaction)[]

The actions the consumer should take, in order.

##### state

> `readonly` **state**: [`LtpState`](#ltpstate)

The next session state (frozen).

##### warnings

> `readonly` **warnings**: readonly [`AstmLtpWarning`](#astmltpwarning)[]

Warnings raised by this step (empty on a clean, expected event).

***

### ManufacturerRecord

The `M` (manufacturer) record: vendor-defined free-form data
(QC / calibration / maintenance), surfaced **VERBATIM** and **never interpreted
into typed clinical fields**.

Interpreting a vendor `M` record as clinical data would be a fabrication, so
this record carries **no typed accessors at all**: the exact wire text is in
[ManufacturerRecord.rawLine](#rawline-1) (byte-preserving) and the tokenized tree in
[RecordBase.fields](#fields-2). Nothing is parsed into a value, a code, or a unit.

#### Extends

- `RecordBase`

#### Properties

##### fields

> `readonly` **fields**: readonly [`AstmField`](#astmfield)[]

The record's fields. `fields[0]` is the type-letter field; data fields are 1-indexed after it.

On a record the parser returns this is an enumerable getter, not a data property: a field with
no repeat, component or escape character is built the first time `fields` is read, and every
read after that returns the same frozen array. Object keys, spread, `JSON.stringify` and
`structuredClone` all see it as a value. Every empty field is one shared frozen object.

###### Inherited from

`RecordBase.fields`

##### rawLine

> `readonly` **rawLine**: `string`

The record's exact wire text (terminator excluded), preserved byte-for-byte.

Emit reproduces these bytes exactly whenever a reader using the delimiters being
emitted against would recover the fields this record models: always the case when
the record is already in those delimiters, and also when it carries no delimiter
either set would split on. Otherwise the record is re-encoded from
[RecordBase.fields](#fields-2), so the row can never go out in delimiters the header does
not declare. To change a value, edit `fields`; editing this string has no effect on emit.

##### recordIndex

> `readonly` **recordIndex**: `number`

0-based ordinal of the record within the message.

###### Inherited from

`RecordBase.recordIndex`

##### type

> `readonly` **type**: `"M"`

The record's raw type letter.

###### Overrides

`RecordBase.type`

***

### MessageInput

The message to build: an optional header, the body records, and an optional terminator code.

#### Properties

##### header?

> `readonly` `optional` **header?**: [`HeaderInput`](#headerinput)

Header fields; the canonical `H|\^&` declaration is always emitted.

##### records

> `readonly` **records**: readonly [`AstmRecordInput`](#astmrecordinput)[]

The body records, in order. `H` and `L` are supplied by the builder.

##### terminationCode?

> `readonly` `optional` **terminationCode?**: `string`

Field 3 of the auto-appended `L` (terminator) record: the termination code
(e.g. `N` normal). Omitted by default (not defaulted to a value the caller
did not choose); the `L` seq is always emitted.

***

### NamedVocabulary

A published code system this library graded a value against, named by
identifier and version.

#### Example

```ts
import { ABNORMAL_FLAG_VOCABULARY } from "@cosyte/astm";
ABNORMAL_FLAG_VOCABULARY.attributed; // true
ABNORMAL_FLAG_VOCABULARY.version;    // the version compared against
```

#### Properties

##### attributed

> `readonly` **attributed**: `true`

Always `true`: a published source is cited.

##### system

> `readonly` **system**: `string`

The code system's canonical identifier, verbatim from the published source.

##### version

> `readonly` **version**: `string`

The code system version this library compared against, verbatim from the
published source. **Not** a claim about the version the sender used.

***

### OrderInput

Input for an `O` (order) record.

#### Properties

##### actionCode?

> `readonly` `optional` **actionCode?**: `string`

Field 12: action code, emitted verbatim.

##### instrumentSpecimenId?

> `readonly` `optional` **instrumentSpecimenId?**: `string`

Field 4: instrument specimen ID.

##### priority?

> `readonly` `optional` **priority?**: `string`

Field 6: priority, emitted verbatim.

##### reportType?

> `readonly` `optional` **reportType?**: `string`

Field 26: report type, emitted verbatim.

##### seq?

> `readonly` `optional` **seq?**: `string`

##### specimenId?

> `readonly` `optional` **specimenId?**: `string`

Field 3: specimen / accession ID.

##### type

> `readonly` **type**: `"O"`

##### universalTestId?

> `readonly` `optional` **universalTestId?**: readonly `string`[]

Field 5: Universal Test ID components (verbatim, in order; e.g. `["", "", "", "687"]`).

***

### OrderRecord

The `O` (order) record: binds a result to a specimen.

#### Extends

- `RecordBase`

#### Properties

##### actionCode?

> `readonly` `optional` **actionCode?**: `string`

Field 12: action code, surfaced raw (e.g. `C` cancel, `A` add, `N` new). The exact field index
(`~12`) and the code set are `[OSS-derived]` (paywalled): surfaced verbatim, never interpreted.

##### fields

> `readonly` **fields**: readonly [`AstmField`](#astmfield)[]

The record's fields. `fields[0]` is the type-letter field; data fields are 1-indexed after it.

On a record the parser returns this is an enumerable getter, not a data property: a field with
no repeat, component or escape character is built the first time `fields` is read, and every
read after that returns the same frozen array. Object keys, spread, `JSON.stringify` and
`structuredClone` all see it as a value. Every empty field is one shared frozen object.

###### Inherited from

`RecordBase.fields`

##### instrumentSpecimenId?

> `readonly` `optional` **instrumentSpecimenId?**: `string`

Field 4: instrument specimen ID.

##### priority?

> `readonly` `optional` **priority?**: `string`

Field 6: priority, surfaced raw (e.g. `S` STAT, `R` routine, `A` ASAP). Vendor letters vary;
the code set is `[OSS-derived]` (the exact enumeration is in the paywalled CLSI LIS02-A2), so the
value is surfaced verbatim and **never mapped to a guessed meaning**.

##### recordIndex

> `readonly` **recordIndex**: `number`

0-based ordinal of the record within the message.

###### Inherited from

`RecordBase.recordIndex`

##### reportType?

> `readonly` `optional` **reportType?**: `string`

Field 26: report type, surfaced raw (e.g. `F` final, `P` preliminary, `X` cancel). The exact
field index (`~26`) and the code set are `[OSS-derived]` (paywalled): surfaced verbatim.

##### seq?

> `readonly` `optional` **seq?**: `string`

Field 2: sequence number.

##### specimenId?

> `readonly` `optional` **specimenId?**: `string`

Field 3: specimen / accession ID.

##### type

> `readonly` **type**: `"O"`

The record's raw type letter.

###### Overrides

`RecordBase.type`

##### universalTestId?

> `readonly` `optional` **universalTestId?**: [`UniversalTestId`](#universaltestid-6)

Field 5: Universal Test ID (same caret structure as a result's).

***

### PatientInput

Input for a `P` (patient) record. The three IDs stay distinct: none defaults from another.

#### Properties

##### birthDate?

> `readonly` `optional` **birthDate?**: `string`

Field 8: birthdate (`YYYYMMDDHHMMSS`), emitted verbatim, never reformatted.

##### laboratoryAssignedId?

> `readonly` `optional` **laboratoryAssignedId?**: `string`

Field 4: laboratory-assigned patient ID.

##### mothersMaidenName?

> `readonly` `optional` **mothersMaidenName?**: `string`

Field 7: mother's maiden name.

##### name?

> `readonly` `optional` **name?**: [`PatientNameInput`](#patientnameinput)

Field 6: patient name (`Last^First^Middle`).

##### patientIdThree?

> `readonly` `optional` **patientIdThree?**: `string`

Field 5: a third patient identifier.

##### practiceAssignedId?

> `readonly` `optional` **practiceAssignedId?**: `string`

Field 3: practice-assigned patient ID.

##### seq?

> `readonly` `optional` **seq?**: `string`

Structural sequence number; auto-computed when omitted.

##### sex?

> `readonly` `optional` **sex?**: `string`

Field 9: sex, emitted verbatim (never defaulted).

##### type

> `readonly` **type**: `"P"`

***

### PatientName

A patient name (`Last^First^Middle`), each component surfaced verbatim.

A part is present only when its component carries text. An empty component is absent, never the
empty string, whether the sender wrote its delimiter or left it off: `DOE^^` and `DOE` both read
`{ last: "DOE" }`, and `^JANE^` reads `{ first: "JANE" }` with no `last`.

#### Properties

##### first?

> `readonly` `optional` **first?**: `string`

##### last?

> `readonly` `optional` **last?**: `string`

##### middle?

> `readonly` `optional` **middle?**: `string`

##### raw

> `readonly` **raw**: `string`

***

### PatientNameInput

A patient name split into its components; only the supplied parts are emitted.

#### Properties

##### first?

> `readonly` `optional` **first?**: `string`

##### last?

> `readonly` `optional` **last?**: `string`

##### middle?

> `readonly` `optional` **middle?**: `string`

***

### PatientRecord

The `P` (patient) record.

**Safety:** the practice-assigned ID (field 3) and the laboratory-assigned ID
(field 4) are modeled as **distinct** fields and never collapsed, conflating
them is the primary result-misfiling path.

#### Extends

- `RecordBase`

#### Properties

##### birthDate?

> `readonly` `optional` **birthDate?**: [`AstmDate`](#astmdate)

Field 8: birthdate (`YYYYMMDDHHMMSS`, precision-preserving; a truncated run sets `truncated`).

##### fields

> `readonly` **fields**: readonly [`AstmField`](#astmfield)[]

The record's fields. `fields[0]` is the type-letter field; data fields are 1-indexed after it.

On a record the parser returns this is an enumerable getter, not a data property: a field with
no repeat, component or escape character is built the first time `fields` is read, and every
read after that returns the same frozen array. Object keys, spread, `JSON.stringify` and
`structuredClone` all see it as a value. Every empty field is one shared frozen object.

###### Inherited from

`RecordBase.fields`

##### laboratoryAssignedId?

> `readonly` `optional` **laboratoryAssignedId?**: `string`

Field 4: laboratory-assigned patient ID. Distinct from [PatientRecord.practiceAssignedId](#practiceassignedid-1).

##### mothersMaidenName?

> `readonly` `optional` **mothersMaidenName?**: `string`

Field 7: mother's maiden name, surfaced verbatim (a surname component; PHI).

##### name?

> `readonly` `optional` **name?**: [`PatientName`](#patientname)

Field 6: patient name (`Last^First^Middle`). Present when at least one of the three parts
carries text, so a name with an empty last part is still read; absent when none does.

##### patientIdThree?

> `readonly` `optional` **patientIdThree?**: `string`

Field 5: a third patient identifier (e.g. a national/alternate ID), surfaced verbatim. Kept
separate from the practice- and laboratory-assigned IDs: the three never collapse into one.

##### practiceAssignedId?

> `readonly` `optional` **practiceAssignedId?**: `string`

Field 3: practice-assigned patient ID. Distinct from [PatientRecord.laboratoryAssignedId](#laboratoryassignedid-1).

##### recordIndex

> `readonly` **recordIndex**: `number`

0-based ordinal of the record within the message.

###### Inherited from

`RecordBase.recordIndex`

##### seq?

> `readonly` `optional` **seq?**: `string`

Field 2: sequence number.

##### sex?

> `readonly` `optional` **sex?**: `string`

Field 9: sex, surfaced raw (`M`/`F`/`U`/vendor value).

##### type

> `readonly` **type**: `"P"`

The record's raw type letter.

###### Overrides

`RecordBase.type`

***

### QueryInput

Input for a `Q` (request-information) record.

#### Properties

##### endingRangeId?

> `readonly` `optional` **endingRangeId?**: `string`

Field 4: ending range ID, emitted verbatim.

##### queriesAllTests?

> `readonly` `optional` **queriesAllTests?**: `boolean`

Field 5: emit the literal `ALL` universal-query keyword instead of a Universal Test ID.

##### requestInformationStatus?

> `readonly` `optional` **requestInformationStatus?**: `string`

Field 13: request-information status, emitted verbatim.

##### seq?

> `readonly` `optional` **seq?**: `string`

##### startingRangeId?

> `readonly` `optional` **startingRangeId?**: `string`

Field 3: starting range ID, emitted verbatim.

##### type

> `readonly` **type**: `"Q"`

##### universalTestId?

> `readonly` `optional` **universalTestId?**: readonly `string`[]

Field 5: Universal Test ID components; ignored when [QueryInput.queriesAllTests](#queriesalltests) is set.

***

### QueryRecord

The `Q` (Request Information) record: the host-query request.

A `Q` record asks the LIS for information (e.g. outstanding orders for a
specimen); its **presence classifies the records it arrives in as a request,
never a result set**. [AstmMessage.classification](#classification) is folded over the
whole parsed stream, so a `Q` in any one message makes the whole stream read as
a host query; `classifyMessage(m.records)` classifies one message from
`messages()` on its own. Its safety-relevant
fields, the starting/ending range ID and the request-information status, are
surfaced **verbatim**; the field *positions* are the public ASTM E1394 layout,
but their internal structure and code meanings are **`[OSS-derived / paywalled]`**
and are therefore **never interpreted or guessed**.

#### Extends

- `RecordBase`

#### Properties

##### endingRangeId?

> `readonly` `optional` **endingRangeId?**: `string`

Field 4: ending range ID number, surfaced verbatim (same `[OSS-derived]` caveat as field 3).

##### fields

> `readonly` **fields**: readonly [`AstmField`](#astmfield)[]

The record's fields. `fields[0]` is the type-letter field; data fields are 1-indexed after it.

On a record the parser returns this is an enumerable getter, not a data property: a field with
no repeat, component or escape character is built the first time `fields` is read, and every
read after that returns the same frozen array. Object keys, spread, `JSON.stringify` and
`structuredClone` all see it as a value. Every empty field is one shared frozen object.

###### Inherited from

`RecordBase.fields`

##### queriesAllTests

> `readonly` **queriesAllTests**: `boolean`

`true` when field 5 is the literal `ALL` universal-query keyword (case-insensitive). **`[OSS-derived
/ paywalled]`:** the token is surfaced because it appears in the OSS references, but its exact
host-query *behavior* (which tests a bare `ALL` selects, and whether the vendor answers with a full
`H/P/O/L` or a `P/O`-only response) is paywalled and vendor-specific, **not decided here**.

##### recordIndex

> `readonly` **recordIndex**: `number`

0-based ordinal of the record within the message.

###### Inherited from

`RecordBase.recordIndex`

##### requestInformationStatus?

> `readonly` `optional` **requestInformationStatus?**: `string`

Field 13: request-information status code(s), surfaced **verbatim**. The status code *set* is
**`[OSS-derived / paywalled]`**: with no publicly-groundable enumeration, this
parser recognizes **none** of them and interprets nothing, every present status is surfaced raw
and flagged with a value-free `ASTM_RECORD_UNINTERPRETED_QUERY_STATUS` warning. Never mapped to a
guessed meaning.

##### seq?

> `readonly` `optional` **seq?**: `string`

Field 2: sequence number.

##### startingRangeId?

> `readonly` `optional` **startingRangeId?**: `string`

Field 3: starting range ID number, surfaced as the **full** verbatim field text (never truncated
to a component). Its caret component structure (e.g. patient ID ^ specimen ID) is
**`[OSS-derived / paywalled]`**: the raw split is available via [RecordBase.fields](#fields-2), but the
*meaning* of each component is **never** assigned here.

##### type

> `readonly` **type**: `"Q"`

The record's raw type letter.

###### Overrides

`RecordBase.type`

##### universalTestId?

> `readonly` `optional` **universalTestId?**: [`UniversalTestId`](#universaltestid-6)

Field 5: Universal Test ID (the same caret structure as an `O`/`R` record's), recognized by
provenance only. When the field is the literal universal-query keyword, [QueryRecord.queriesAllTests](#queriesalltests-1)
is set instead: see its caveat.

***

### ReferenceRange

A parsed reference range. Bounds are surfaced as the **verbatim numeric text**
(never coerced to a float, never rounded, never converted) so nothing is lost
or fabricated.

**`[OSS-derived]`: the exact lower/upper delimiter (`-`) and the open-ended
`<x`/`>x` forms are taken from the permissively-licensed OSS reference parsers
and cross-verified vendor transcripts; they are not confirmed against the
purchased CLSI LIS02-A2. Anything that does not match these
forms is surfaced verbatim as `unparsed`, never guessed into a bound.**

#### Example

```ts
import { parseReferenceRange } from "@cosyte/astm";
const r = parseReferenceRange("3.5-5.0");
r.kind; // "closed"
r.low;  // "3.5"
r.high; // "5.0"
```

#### Properties

##### high?

> `readonly` `optional` **high?**: `string`

The upper bound, verbatim numeric text (for `closed` and `open-low`).

##### kind

> `readonly` **kind**: [`ReferenceRangeKind`](#referencerangekind-1)

The recognized shape, or `"unparsed"` when the text matched no known form.

##### low?

> `readonly` `optional` **low?**: `string`

The lower bound, verbatim numeric text (for `closed` and `open-high`).

##### raw

> `readonly` **raw**: `string`

The verbatim field text, exactly as received.

***

### ResultInput

Input for an `R` (result) record. No clinical field is defaulted; unsupplied ⇒ empty.

#### Properties

##### abnormalFlags?

> `readonly` `optional` **abnormalFlags?**: `string`

Field 7: abnormal flags, emitted verbatim (never defaulted to `N`).

##### completedAt?

> `readonly` `optional` **completedAt?**: `string`

Field 13: test-completed timestamp, verbatim.

##### instrument?

> `readonly` `optional` **instrument?**: `string`

Field 14: instrument identifier.

##### operator?

> `readonly` `optional` **operator?**: `string`

Field 11: operator.

##### referenceRange?

> `readonly` `optional` **referenceRange?**: `string`

Field 6: reference range, emitted verbatim.

##### resultStatus?

> `readonly` `optional` **resultStatus?**: `string`

Field 9: result status, emitted verbatim (never defaulted to `F`).

##### seq?

> `readonly` `optional` **seq?**: `string`

##### startedAt?

> `readonly` `optional` **startedAt?**: `string`

Field 12: test-started timestamp (`YYYYMMDDHHMMSS`), verbatim.

##### type

> `readonly` **type**: `"R"`

##### units?

> `readonly` `optional` **units?**: `string`

Field 5: units (vendor free text; never defaulted, guessed, or converted).

##### universalTestId?

> `readonly` `optional` **universalTestId?**: readonly `string`[]

Field 3: Universal Test ID components (verbatim).

##### value?

> `readonly` `optional` **value?**: `string`

Field 4: the measured value, emitted verbatim (never defaulted).

***

### ResultRecord

The `R` (result) record: the value itself.

The raw safety-critical fields (value, `units`, `referenceRange`,
`abnormalFlags`, `resultStatus`) are always surfaced exactly as received.
The **modeled, fail-safe** semantics sit alongside them: `flag`
(Table 0078, `undefined` never coerced to normal), `status` (a `C`/`X` never
reads as active-final; an absent status is `unspecified`, never `final`), and
`range` (open/closed bounds surfaced verbatim, never fabricated). The raw
strings and the modeled views coexist: nothing is collapsed or reconciled.

#### Extends

- `RecordBase`

#### Properties

##### abnormalFlags?

> `readonly` `optional` **abnormalFlags?**: `string`

Field 7: abnormal flags, surfaced raw (HL7 Table 0078 values).

##### completedAt?

> `readonly` `optional` **completedAt?**: [`AstmDate`](#astmdate)

Field 13: test completed timestamp.

##### fields

> `readonly` **fields**: readonly [`AstmField`](#astmfield)[]

The record's fields. `fields[0]` is the type-letter field; data fields are 1-indexed after it.

On a record the parser returns this is an enumerable getter, not a data property: a field with
no repeat, component or escape character is built the first time `fields` is read, and every
read after that returns the same frozen array. Object keys, spread, `JSON.stringify` and
`structuredClone` all see it as a value. Every empty field is one shared frozen object.

###### Inherited from

`RecordBase.fields`

##### flag?

> `readonly` `optional` **flag?**: [`AbnormalFlag`](#abnormalflag)

Field 7: the abnormal flag interpreted against HL7 Table 0078, present only when the field
carried a value. An unrecognized flag is `{ recognized: false, meaning: "undefined" }`, surfaced,
never dropped, and **never coerced to `normal`**.

##### instrument?

> `readonly` `optional` **instrument?**: `string`

Field 14: instrument identifier.

##### operator?

> `readonly` `optional` **operator?**: `string`

Field 11: operator.

##### range?

> `readonly` `optional` **range?**: [`ReferenceRange`](#referencerange)

Field 6: the reference range parsed into low/high (or open-ended) bounds, present only when the
field carried a value. An unparseable range is `kind: "unparsed"` with the raw text preserved and
**no bound fabricated**. Bounds are verbatim numeric text, never coerced to floats.

##### recordIndex

> `readonly` **recordIndex**: `number`

0-based ordinal of the record within the message.

###### Inherited from

`RecordBase.recordIndex`

##### referenceRange?

> `readonly` `optional` **referenceRange?**: `string`

Field 6: reference range, surfaced raw.

##### resultStatus?

> `readonly` `optional` **resultStatus?**: `string`

Field 9: result status, surfaced raw (`F`/`C`/`X`/…).

##### seq?

> `readonly` `optional` **seq?**: `string`

Field 2: sequence number.

##### startedAt?

> `readonly` `optional` **startedAt?**: [`AstmDate`](#astmdate)

Field 12: test started timestamp.

##### status

> `readonly` **status**: [`ResultStatus`](#resultstatus-2)

Field 9: the modeled result status. **Always present** (an absent field yields a typed
`unspecified`, never assumed `final`), so `status.isActiveFinal` is always a reliable boolean: it
is `true` only for a plain `F`, and `false` for a correction (`C`), a cancellation (`X`), a
partial/preliminary/pending, an absent, or an unrecognized status.

##### type

> `readonly` **type**: `"R"`

The record's raw type letter.

###### Overrides

`RecordBase.type`

##### units?

> `readonly` `optional` **units?**: `string`

Field 5: units (vendor free text; a missing unit is not defaulted).

##### universalTestId?

> `readonly` `optional` **universalTestId?**: [`UniversalTestId`](#universaltestid-6)

Field 3: Universal Test ID (local code in component 4 is the primary identifier).

##### value?

> `readonly` `optional` **value?**: `string`

Field 4: the measured value. In the ordinary single-component case this is the decoded scalar.
When the value field carried an *unescaped* component delimiter (an ambiguity), this is the
**full raw field text**, never a truncated component, and [ResultRecord.valueComponents](#valuecomponents)
plus an `ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT` warning are also present.

##### valueComponents?

> `readonly` `optional` **valueComponents?**: readonly `string`[]

Field 4 split into components, present only when the value field carried an *unescaped* component
delimiter: i.e. it read as more than one component. Surfaced alongside the full raw value (and a
warning) so an ambiguous split is visible, never resolved silently.

***

### ResultStatus

A modeled result status. The three booleans are the safety surface a consumer
reads instead of string-matching the code:

- **`isActiveFinal`** is `true` **only** for a plain `F` (final). It is `false`
  for a correction (`C`), a cancellation (`X`), a preliminary/partial/pending
  result, an absent status, and an unrecognized one, so a superseded or
  cancelled result can **never** read as current/final.
- **`supersedes`** is `true` for `C`: this value replaces a previously
  transmitted one.
- **`cancelled`** is `true` for `X`: the result cannot be done / was cancelled.

`vocabulary` is always the explicit "no citable published source": this letter
set is modeled from what analyzers send, not from a vocabulary this library
can name.

#### Example

```ts
import { interpretResultStatus } from "@cosyte/astm";
interpretResultStatus("C").isActiveFinal;      // false (a correction is not active-final)
interpretResultStatus("X").cancelled;          // true
interpretResultStatus(undefined).meaning;      // "unspecified" (never "final")
interpretResultStatus("F").vocabulary.attributed; // false: nothing is cited
```

#### Properties

##### cancelled

> `readonly` **cancelled**: `boolean`

`true` for `X`: the result cannot be done / was cancelled.

##### code?

> `readonly` `optional` **code?**: [`ResultStatusCode`](#resultstatuscode-1)

The recognized status code, present only when the raw text is a known status.

##### isActiveFinal

> `readonly` **isActiveFinal**: `boolean`

`true` **only** for a plain `F` (final): never for `C`, `X`, absent, or unrecognized.

##### meaning

> `readonly` **meaning**: [`ResultStatusMeaning`](#resultstatusmeaning-1)

The modeled meaning; `"unspecified"` when absent, `"undefined"` when unrecognized.

##### raw?

> `readonly` `optional` **raw?**: `string`

The verbatim field text, present only when field 9 carried a value.

##### recognized

> `readonly` **recognized**: `boolean`

Whether the raw text matched a recognized status letter.

##### supersedes

> `readonly` **supersedes**: `boolean`

`true` for `C`: this value supersedes a previously transmitted result.

##### vocabulary

> `readonly` **vocabulary**: [`UnattributedVocabulary`](#unattributedvocabulary)

The explicit statement that this letter set is bound by **no citable
published source**. Always present and always unattributed, so an absent
attribution and an unattributable one never look alike.

***

### ScientificRecord

The `S` (scientific) record: vendor-defined free-form data, surfaced
**VERBATIM** and **never interpreted into typed clinical fields** (same posture
as [ManufacturerRecord](#manufacturerrecord)).

#### Extends

- `RecordBase`

#### Properties

##### fields

> `readonly` **fields**: readonly [`AstmField`](#astmfield)[]

The record's fields. `fields[0]` is the type-letter field; data fields are 1-indexed after it.

On a record the parser returns this is an enumerable getter, not a data property: a field with
no repeat, component or escape character is built the first time `fields` is read, and every
read after that returns the same frozen array. Object keys, spread, `JSON.stringify` and
`structuredClone` all see it as a value. Every empty field is one shared frozen object.

###### Inherited from

`RecordBase.fields`

##### rawLine

> `readonly` **rawLine**: `string`

The record's exact wire text (terminator excluded), preserved byte-for-byte.

Emit reproduces these bytes exactly whenever a reader using the delimiters being
emitted against would recover the fields this record models: always the case when
the record is already in those delimiters, and also when it carries no delimiter
either set would split on. Otherwise the record is re-encoded from
[RecordBase.fields](#fields-2), so the row can never go out in delimiters the header does
not declare. To change a value, edit `fields`; editing this string has no effect on emit.

##### recordIndex

> `readonly` **recordIndex**: `number`

0-based ordinal of the record within the message.

###### Inherited from

`RecordBase.recordIndex`

##### type

> `readonly` **type**: `"S"`

The record's raw type letter.

###### Overrides

`RecordBase.type`

***

### TerminatorRecord

The `L` (terminator) record: closes a message.

#### Extends

- `RecordBase`

#### Properties

##### fields

> `readonly` **fields**: readonly [`AstmField`](#astmfield)[]

The record's fields. `fields[0]` is the type-letter field; data fields are 1-indexed after it.

On a record the parser returns this is an enumerable getter, not a data property: a field with
no repeat, component or escape character is built the first time `fields` is read, and every
read after that returns the same frozen array. Object keys, spread, `JSON.stringify` and
`structuredClone` all see it as a value. Every empty field is one shared frozen object.

###### Inherited from

`RecordBase.fields`

##### recordIndex

> `readonly` **recordIndex**: `number`

0-based ordinal of the record within the message.

###### Inherited from

`RecordBase.recordIndex`

##### type

> `readonly` **type**: `"L"`

The record's raw type letter.

###### Overrides

`RecordBase.type`

***

### ToDateOptions

The options [toDate](#todate) accepts. Carries `assumeOffsetMinutes` and nothing else.

#### Properties

##### assumeOffsetMinutes?

> `readonly` `optional` **assumeOffsetMinutes?**: `number`

The zone to read an offset-less value in, as signed minutes east of UTC
(`-300` is UTC-05:00). Supplying `0` means "treat this value as UTC", which
is a decision only the caller can make: an ASTM value states no offset, so
without this option [toDate](#todate) returns `undefined` rather than guessing.

***

### UnattributedVocabulary

The explicit statement that a code set is bound by **no citable published
source**. It carries no identifier and no version, because inventing either
would be the guess this library exists to refuse.

#### Example

```ts
import { RESULT_STATUS_VOCABULARY } from "@cosyte/astm";
RESULT_STATUS_VOCABULARY.attributed; // false
RESULT_STATUS_VOCABULARY.reason;     // fixed prose: why nothing is cited
```

#### Properties

##### attributed

> `readonly` **attributed**: `false`

Always `false`: no published source can be cited for this code set.

##### reason

> `readonly` **reason**: `string`

Fixed prose saying why nothing is cited. Never a code-system identifier.

***

### UniversalTestId

A recognized ASTM Universal Test ID. All components are surfaced verbatim
(already escape-decoded by the tokenizer); nothing is looked up.

#### Example

```ts
import { recognizeUniversalTestId } from "@cosyte/astm";
const u = recognizeUniversalTestId(["", "", "", "687"]);
u.localCode;   // "687"
u.provenance;  // "local-code"
```

#### Properties

##### codingScheme?

> `readonly` `optional` **codingScheme?**: `string`

Component 3: the coding-scheme selector, when present.

##### components

> `readonly` **components**: readonly `string`[]

The field's components, verbatim and in order.

##### localCode?

> `readonly` `optional` **localCode?**: `string`

Component 4, the vendor/local code: the only identifier a result is keyed on.

##### provenance

> `readonly` **provenance**: [`UniversalTestIdProvenance`](#universaltestidprovenance-1)

Where the primary identifier came from.

##### testName?

> `readonly` `optional` **testName?**: `string`

Component 2: the test / battery name, when present.

##### unvalidatedWireValue?

> `readonly` `optional` **unvalidatedWireValue?**: `string`

Component 1 when populated, verbatim: a wire value this library **does not
vouch for**. It is not validated, is not reported as a LOINC or a LOINC
candidate, and is never the code a result is keyed on.

***

### UnsupportedRecord

Any record whose type letter is not modeled (a genuinely unknown letter).
`H`/`P`/`O`/`R`/`C`/`Q`/`M`/`S`/`L` are all modeled; anything else is surfaced
with its raw fields intact and flagged with an
`ASTM_RECORD_UNKNOWN_TYPE` warning, never dropped.

**One of these may be a header.** Message grouping decides where a message
starts by reading the type letter, so a header the reader could not recognize
arrives here instead, opens no message, and the messages either side of it are
grouped as one. Check `rawType` before trusting a split.

**And one of these may be a `Q`.** Classification counts type letters too, so
records that include an unsupported one are classified `indeterminate` unless a
`Q` was read outright. On [AstmMessage.classification](#classification) that is every
record in the stream, so one unsupported record in any message withholds the
kind for the whole stream: see [AstmMessageClassification.hasUnrecognized](#hasunrecognized).

**A header that arrives here also failed to re-scope the delimiters.** The
records after it are read with the set already in force, and where that set is
not theirs they do not split at all, which is reported per record as
`ASTM_RECORD_FIELDS_UNSEPARATED`.

#### Extends

- `RecordBase`

#### Properties

##### fields

> `readonly` **fields**: readonly [`AstmField`](#astmfield)[]

The record's fields. `fields[0]` is the type-letter field; data fields are 1-indexed after it.

On a record the parser returns this is an enumerable getter, not a data property: a field with
no repeat, component or escape character is built the first time `fields` is read, and every
read after that returns the same frozen array. Object keys, spread, `JSON.stringify` and
`structuredClone` all see it as a value. Every empty field is one shared frozen object.

###### Inherited from

`RecordBase.fields`

##### rawType

> `readonly` **rawType**: `string`

The raw type letter as it appeared on the wire.

##### recordIndex

> `readonly` **recordIndex**: `number`

0-based ordinal of the record within the message.

###### Inherited from

`RecordBase.recordIndex`

##### type

> `readonly` **type**: `"unsupported"`

The record's raw type letter.

###### Overrides

`RecordBase.type`

***

### VerbatimInput

Input for an `M` (manufacturer) or `S` (scientific) record: vendor-defined
free-form data. Emitted verbatim from the caller's fields; never interpreted.

#### Properties

##### fields

> `readonly` **fields**: readonly `string`[]

Data fields (after the type letter), emitted verbatim in order.

##### type

> `readonly` **type**: `"M"` \| `"S"`

## Type Aliases

### AbnormalFlagCode

> **AbnormalFlagCode** = `"L"` \| `"H"` \| `"LL"` \| `"HH"` \| `"<"` \| `">"` \| `"N"` \| `"A"` \| `"AA"` \| `"U"` \| `"D"` \| `"B"` \| `"W"` \| `"S"` \| `"R"` \| `"I"` \| `"HU"` \| `"LU"`

The recognized abnormal-flag letters, graded against
[ABNORMAL\_FLAG\_VOCABULARY](#abnormal_flag_vocabulary) (the flag *value* set, a published fact set,
not CLSI prose). That code system carries the concepts kept aligned with the
HL7 v2 Table 0078 interpretation codes. Read in the context of an `R` record's
field 7: here `S`/`R`/`I` are the microbiology susceptibility codes and `R` is
**not** the repeat delimiter.

Recognition is **exact match** after the surrounding whitespace is trimmed:
letter case is never folded, so `hu` is unrecognized and stays that way.

***

### AbnormalFlagMeaning

> **AbnormalFlagMeaning** = `"below-normal"` \| `"above-normal"` \| `"critically-below-normal"` \| `"critically-above-normal"` \| `"below-scale"` \| `"above-scale"` \| `"normal"` \| `"abnormal"` \| `"very-abnormal"` \| `"significant-change-up"` \| `"significant-change-down"` \| `"better"` \| `"worse"` \| `"susceptible"` \| `"resistant"` \| `"intermediate"` \| `"significantly-high"` \| `"significantly-low"` \| `"undefined"`

The modeled meaning of a recognized [AbnormalFlagCode](#abnormalflagcode-1), plus the
fail-safe sentinel `undefined` (a flag was present but is not in the graded
vocabulary), which is **never** collapsed to `normal`.

***

### AmbiguousAlignmentSink

> **AmbiguousAlignmentSink** = (`segmentIndex`) => `void`

A callback the split calls when the escape character that **closed** an
unrecognized escape sequence could instead have **opened** one whose body is the
delimiter being split on, so the two alignments of the same bytes disagree about
whether that delimiter ends a field, repeat or component. The leftmost reading is
kept and nothing is re-split; the callback lets the parser surface a value-free
`ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT` warning. Optional so the split can be
used purely.

Two exclusions, both deliberate. The first is what keeps this off conformant
streams, and it is **wider than the case it is justified on**, so the residue is
named here rather than left to be found:

- **The earlier sequence's body must not be a recognized mnemonic.** The test is
  which alignment this codec's own vocabulary supports, not which one is tidier.
  Where the earlier body is unrecognized the reading taken rests on a triple the
  codec cannot interpret, while the competitor's body is the delimiter character,
  which it usually cannot interpret either: nothing prefers one, and that is what
  this reports. Where the earlier body is a recognized mnemonic the reading taken
  interprets a construct (`&F&` is the sender escaping a field separator, which is
  what the mechanism is for) and the competitor **usually** interprets none, so the
  vocabulary usually prefers one, and reporting it would report the escape
  mechanism working. Usually, not always: see the second residue below.
  **What that argument does not cover, measured.** It does not follow that the
  reading taken is *conformant*: under `28.6&F&|&U/L` it is `&F&`, a real
  separator, and then a bare escape character, which this package reports as a
  deviation of its own. And where the declared set names a mnemonic letter as a
  splitting delimiter, both alignments interpret exactly one construct and
  neither is preferred, yet the exclusion still silences it. Both residues are
  recorded with their measurements rather than closed by widening this test: the
  criterion that would cover them is a different one (counting what each
  alignment interprets), and swapping criteria moves which streams a published
  package refuses.
- **The following character must be the delimiter this split is taken on.** The
  split runs once per role, so a character that is a delimiter in a *later* role
  is reported by that role's pass, on the segment it survives into, and never
  twice. A delimiter with no escape character two positions past it is excluded by
  the rule that defines the condition rather than by a judgement: the sequence the
  competing alignment would need never closes, so there is no competitor.

#### Parameters

##### segmentIndex

`number`

The 0-based index of the segment being accumulated when the
  ambiguity was seen, so a caller splitting a record into fields can report which
  field it sat in. A caller splitting one field into repeats or components
  already knows the field index and ignores this.

#### Returns

`void`

***

### AmbiguousCode

> **AmbiguousCode** = *typeof* [`AMBIGUOUS_CODES`](#ambiguous_codes)\[keyof *typeof* [`AMBIGUOUS_CODES`](#ambiguous_codes)\]

A value from [AMBIGUOUS\_CODES](#ambiguous_codes): the discriminant on [AstmAmbiguousStreamError](#astmambiguousstreamerror).

***

### AnyAstmWarningCode

> **AnyAstmWarningCode** = [`WarningCode`](#warningcode) \| [`FrameWarningCode`](#framewarningcode) \| [`LtpWarningCode`](#ltpwarningcode)

Any warning code from any of the three registries: the record layer
(`ASTM_RECORD_*` / `ASTM_NONSTANDARD_DELIMITERS` / `ASTM_UNKNOWN_ESCAPE_SEQUENCE`),
the frame codec (`ASTM_FRAME_*`), or the LTP protocol layer (`ASTM_LTP_*`). A
[AstmQuirkTolerance](#astmquirktolerance) may *name* any of them, but the safety gate refuses all
but the small, benign, record-layer subset, so the union exists mainly to let
the gate reject a frame/LTP code with a precise, typed message.

***

### AstmDatePrecision

> **AstmDatePrecision** = `"year"` \| `"month"` \| `"day"` \| `"hour"` \| `"minute"` \| `"second"`

The precision to which an [AstmDate](#astmdate) is populated.

***

### AstmFrameEncodeErrorCode

> **AstmFrameEncodeErrorCode** = `"ASTM_FRAME_EMPTY_RECORD"` \| `"ASTM_FRAME_UNENCODABLE_CHARACTER"` \| `"ASTM_FRAME_RESERVED_BYTE"` \| `"ASTM_FRAME_INVALID_START_FRAME_NUMBER"`

The reasons [composeAstmFrames](#composeastmframes) refuses rather than emitting bytes that
are not the record it was handed.

- `ASTM_FRAME_EMPTY_RECORD`: an empty record list, or a record with no bytes.
  A frame must carry a record; an empty one is a structural error, never an
  empty frame.
- `ASTM_FRAME_UNENCODABLE_CHARACTER`: a record given as a `string` holds a
  character above `U+00FF`, which has no single byte to stand for.
- `ASTM_FRAME_RESERVED_BYTE`: a record holds a byte this layer reads as frame
  structure (`STX`, `ETB` or `ETX`). Framing has no escape mechanism, so such
  a byte cannot be carried inside a frame at all.
- `ASTM_FRAME_INVALID_START_FRAME_NUMBER`: `options.startFrameNumber` is not a
  whole number from `0` to `7`. A frame's number is one ASCII digit, so a
  value outside that range has no digit to be written as.

#### Example

```ts
import type { AstmFrameEncodeErrorCode } from "@cosyte/astm";
const code: AstmFrameEncodeErrorCode = "ASTM_FRAME_UNENCODABLE_CHARACTER";
```

***

### AstmFraming

> **AstmFraming** = `"framed"` \| `"raw"`

The transport framing of an ASTM byte stream: `"framed"` (E1381 `STX`/checksum
frames, the serial and framed-TCP realities) or `"raw"` (framing dropped,
de-framed record bytes streamed directly, the raw-TCP reality).

***

### AstmMessageKind

> **AstmMessageKind** = `"host-query"` \| `"results"` \| `"orders"` \| `"indeterminate"`

How the host-query flow classifies a set of records: one message's under
`classifyMessage(m.records)`, the whole stream's on [AstmMessage.classification](#classification).

- `host-query` (the records include at least one `Q`): it is a **request
  for information**, and **must never be read as a result set** (the load-bearing
  safety distinction of this layer). `Q` **dominates**: a `Q` present classifies
  the records as a request even if a result record is also present (an anomaly,
  separately warned), so a `Q`-bearing message is never silently treated as a
  result upload.
- `results` (no `Q`, at least one `R` result record): a result upload / response.
- `orders` (no `Q`, no `R`, at least one `O` order record): an order download,
  or a query response before results are attached.
- `indeterminate`: none of the above (e.g. header + terminator only). Not
  guessed into one of the other kinds.

***

### AstmRecord

> **AstmRecord** = [`HeaderRecord`](#headerrecord) \| [`PatientRecord`](#patientrecord) \| [`OrderRecord`](#orderrecord) \| [`ResultRecord`](#resultrecord) \| [`CommentRecord`](#commentrecord) \| [`QueryRecord`](#queryrecord) \| [`ManufacturerRecord`](#manufacturerrecord) \| [`ScientificRecord`](#scientificrecord) \| [`TerminatorRecord`](#terminatorrecord) \| [`UnsupportedRecord`](#unsupportedrecord)

The discriminated union of every parsed record.

***

### AstmRecordInput

> **AstmRecordInput** = [`PatientInput`](#patientinput) \| [`OrderInput`](#orderinput) \| [`ResultInput`](#resultinput) \| [`CommentInput`](#commentinput) \| [`QueryInput`](#queryinput) \| [`VerbatimInput`](#verbatiminput)

Any record the message builder can emit (the terminator `L` is appended automatically).

***

### AstmSerializeErrorCode

> **AstmSerializeErrorCode** = `"ASTM_EMIT_UNENCODABLE_VALUE"` \| `"ASTM_EMIT_INVALID_DELIMITERS"` \| `"ASTM_EMIT_TYPE_LETTER_COLLISION"`

The reasons emit refuses rather than writing a stream that cannot be read back.

- `ASTM_EMIT_UNENCODABLE_VALUE`: a component holds a record terminator
  (`CR`/`LF`), which the escape codec has no mnemonic for.
- `ASTM_EMIT_INVALID_DELIMITERS`: the delimiter set to emit against failed one
  of the three conditions readback requires (see [serializeAstmRecords](#serializeastmrecords)).
  Those conditions are checked against the *set alone*, so this code means a
  set was rejected, not that every unreversible set is.
- `ASTM_EMIT_TYPE_LETTER_COLLISION`: this record's type letter would not be the
  first character of its own emitted line, so the record would read back as a
  **different** record. Raised per record rather than per set, because whether
  a set collides depends on which record is being written: a record read under
  one delimiter set and written under another can hit it with **no** set passed
  at all, so it is not avoided by emitting on the default canonical path.

#### Example

```ts
import type { AstmSerializeErrorCode } from "@cosyte/astm";
const code: AstmSerializeErrorCode = "ASTM_EMIT_INVALID_DELIMITERS";
```

***

### DelimiterDeclarationFault

> **DelimiterDeclarationFault** = `"not-a-header"` \| `"record-too-short"` \| `"definition-truncated"` \| `"field-separator-reused"`

Why a header record could not declare a usable delimiter set. Four distinct
conditions, kept distinct because a consumer is told which one it was and two of
them describe records that are **not** short.

- `not-a-header`: the record does not begin with an `H` type letter.
- `record-too-short`: fewer than five characters, so `H` plus a field separator
  plus a three-character definition cannot fit.
- `definition-truncated`: the delimiter-definition field runs to the next field
  separator (or to the end of the record) and holds fewer than three characters.
  **This is the one a full-length header reaches**, and it is what a declaration
  naming its own field separator among the other three produces, because that
  separator ends the definition where it appears.
- `field-separator-reused`: the field separator is also the repeat, component or
  escape character.

***

### DelimiterReadResult

> **DelimiterReadResult** = \{ `delimiters`: [`Delimiters`](#delimiters-2); `ok`: `true`; \} \| \{ `fault`: [`DelimiterDeclarationFault`](#delimiterdeclarationfault); `ok`: `false`; \}

The result of reading delimiters from a header record: either resolved or a named failure.

***

### FatalCode

> **FatalCode** = *typeof* [`FATAL_CODES`](#fatal_codes)\[keyof *typeof* [`FATAL_CODES`](#fatal_codes)\]

A value from [FATAL\_CODES](#fatal_codes): the type carried by a thrown [AstmParseError](#astmparseerror).

***

### FrameTerminator

> **FrameTerminator** = `"ETB"` \| `"ETX"`

Which terminator closed a frame: `ETB` (record continues) or `ETX` (record complete).

***

### FrameWarningCode

> **FrameWarningCode** = *typeof* [`FRAME_WARNING_CODES`](#frame_warning_codes)\[keyof *typeof* [`FRAME_WARNING_CODES`](#frame_warning_codes)\]

Discriminant type for [AstmFrameWarning.code](#code-5). Narrowing by this code lets
consumers write exhaustive `switch` blocks against [FRAME\_WARNING\_CODES](#frame_warning_codes).

***

### LivdAmbiguityReason

> **LivdAmbiguityReason** = `"no-reported-units"` \| `"no-candidate-matched-units"` \| `"multiple-candidates-matched-units"`

Why a code carrying several candidate LOINCs stayed `ambiguous` after the unit
comparison ran, or why the comparison could not run at all.

- `no-reported-units`: the record reported no usable units (absent, empty or whitespace only), so
  nothing could be compared. A unit-qualified candidate is never chosen in this case.
- `no-candidate-matched-units`: units were reported and **no** unit-qualified candidate's
  representative unit was exactly equal to them.
- `multiple-candidates-matched-units`: units were reported and **more than one distinct** candidate
  LOINC matched them exactly. Picking one would be a guess.

Every one of them surfaces every candidate and chooses no LOINC.

***

### LivdCatalogIdentity

> **LivdCatalogIdentity** = \{ `declared`: `true`; `publicationVersion?`: `string`; `publisher?`: `string`; \} \| \{ `declared`: `false`; `reason`: `string`; \}

What a LIVD catalog declared about its own identity: the two publication elements
that name a publication, or the explicit statement that it declared neither.

The same two shapes the rest of this package uses for attribution: a named source,
or a positive "nothing citable", never an absent field and never an invented name.
Discriminate on `declared`.

#### Union Members

##### Type Literal

\{ `declared`: `true`; `publicationVersion?`: `string`; `publisher?`: `string`; \}

###### declared

> `readonly` **declared**: `true`

Always `true`: the catalog declared at least one of the two elements below.

###### publicationVersion?

> `readonly` `optional` **publicationVersion?**: `string`

The **Publication Version ID** the catalog declared, verbatim, when it declared one.

###### publisher?

> `readonly` `optional` **publisher?**: `string`

The **Publisher** the catalog declared, verbatim, when it declared one.

***

##### Type Literal

\{ `declared`: `false`; `reason`: `string`; \}

###### declared

> `readonly` **declared**: `false`

Always `false`: the catalog declared neither a publisher nor a publication version.

###### reason

> `readonly` **reason**: `string`

Fixed prose saying that no identity was declared. Never an invented or indexed name.

#### Example

```ts
import type { LivdCatalogIdentity } from "@cosyte/astm";
const named: LivdCatalogIdentity = { declared: true, publisher: "Example Diagnostics" };
```

***

### LivdLookup

> **LivdLookup** = \{ `loinc`: `string`; `loincLongName?`: `string`; `representativeUnit?`: `string`; `status`: `"mapped"`; `unitComparison?`: [`LivdUnitComparison`](#livdunitcomparison); `vendorResultDescription?`: `string`; `vendorSpecimenDescription?`: `string`; \} \| \{ `status`: `"unmapped"`; \} \| \{ `candidateDetails?`: readonly [`LivdCandidate`](#livdcandidate)[]; `candidates`: readonly `string`[]; `reason?`: [`LivdAmbiguityReason`](#livdambiguityreason); `status`: `"ambiguous"`; \}

The outcome of looking a vendor code up in a [LivdCatalog](#livdcatalog). A distinct
value per safe disposition: a hit is `mapped`; a miss is `unmapped`; a code that
matched more than one **distinct** LOINC and that the reported units did not
settle is `ambiguous` with the candidates surfaced but **none chosen**. There is
deliberately no "guessed" case.

**The added fields are all optional, and a catalog carrying none of the three LIVD
attributes answers byte-identically to how it answered before they existed.** They
appear only where the consumer's own catalog rows supply something to put in them.

#### Union Members

##### Type Literal

\{ `loinc`: `string`; `loincLongName?`: `string`; `representativeUnit?`: `string`; `status`: `"mapped"`; `unitComparison?`: [`LivdUnitComparison`](#livdunitcomparison); `vendorResultDescription?`: `string`; `vendorSpecimenDescription?`: `string`; \}

Exactly one LOINC: one entry, several entries that all agree on the same LOINC, or several
candidates of which exactly one had a representative unit equal to the units the record
reported (and then, and only then, `unitComparison` says how that comparison was made).

###### loinc

> `readonly` **loinc**: `string`

###### loincLongName?

> `readonly` `optional` **loincLongName?**: `string`

###### representativeUnit?

> `readonly` `optional` **representativeUnit?**: `string`

The chosen row's representative unit, verbatim, when supplied.

**This is provenance about the CATALOG ROW, not a restatement of what the record
reported.** Where a vendor code carried a single candidate LOINC across several rows
that spell the unit differently, the answer takes the FIRST row's attributes (exactly
as it has always taken the first row's `loincLongName`), so this can name a unit the
record did not report. Only [LivdUnitComparison](#livdunitcomparison) asserts the two were equal, and
it is present only where a unit actually chose between candidates.

###### status

> `readonly` **status**: `"mapped"`

###### unitComparison?

> `readonly` `optional` **unitComparison?**: [`LivdUnitComparison`](#livdunitcomparison)

Present **if and only if** a unit comparison chose this LOINC from more than one candidate.
Absent where the code carried a single candidate LOINC, which is answered whether or not the
units agree: nothing was selected on a unit there, so claiming it was would be false.

###### vendorResultDescription?

> `readonly` `optional` **vendorResultDescription?**: `string`

The chosen row's Vendor Result Description, verbatim, when supplied. Never matched on.

###### vendorSpecimenDescription?

> `readonly` `optional` **vendorSpecimenDescription?**: `string`

The chosen row's Vendor Specimen Description, verbatim, when supplied. Never matched on.

***

##### Type Literal

\{ `status`: `"unmapped"`; \}

No entry for this code: a miss. The code stays verbatim; no LOINC is invented.

***

##### Type Literal

\{ `candidateDetails?`: readonly [`LivdCandidate`](#livdcandidate)[]; `candidates`: readonly `string`[]; `reason?`: [`LivdAmbiguityReason`](#livdambiguityreason); `status`: `"ambiguous"`; \}

More than one distinct LOINC, unsettled: surfaced for inspection, never resolved to one.

###### candidateDetails?

> `readonly` `optional` **candidateDetails?**: readonly [`LivdCandidate`](#livdcandidate)[]

Every candidate row with its LIVD attributes, one per catalog row (so a LOINC held by two
rows appears twice), including rows that are not unit qualified. Present only where at least
one row for this vendor code carries one of the three LIVD attributes.

###### candidates

> `readonly` **candidates**: readonly `string`[]

Every distinct candidate LOINC, deduplicated, in first-seen catalog order.

###### reason?

> `readonly` `optional` **reason?**: [`LivdAmbiguityReason`](#livdambiguityreason)

Why the unit comparison did not settle it. Present under the same condition as
`candidateDetails`: a catalog carrying none of the LIVD attributes answers exactly as it did
before this field existed.

###### status

> `readonly` **status**: `"ambiguous"`

***

### LivdMapping

> **LivdMapping** = \{ `derived`: `true`; `loinc`: `string`; `loincLongName?`: `string`; `representativeUnit?`: `string`; `source`: `"livd"`; `status`: `"mapped"`; `unitComparison?`: [`LivdUnitComparison`](#livdunitcomparison); `vendorResultDescription?`: `string`; `vendorSpecimenDescription?`: `string`; \} \| \{ `status`: `"unmapped"`; \} \| \{ `candidateDetails?`: readonly [`LivdCandidate`](#livdcandidate)[]; `candidates`: readonly `string`[]; `reason?`: [`LivdAmbiguityReason`](#livdambiguityreason); `status`: `"ambiguous"`; \} \| \{ `status`: `"no-vendor-code"`; \} \| \{ `status`: `"no-code"`; \}

The outcome of looking one record's Universal Test ID up in a LIVD catalog: a
closed, mutually exclusive discriminant. There is no case in which a LOINC is
guessed, and no case in which a value the wire carried is reported as a LOINC.

- `mapped`, the vendor/local code resolved to a single LOINC **via the catalog**
  (labeled `derived: true`, `source: "livd"`).
- `unmapped`: a vendor/local code was looked up and the catalog held no entry
  for it (a hit whose LOINC is a zero-length string is reported here too: an
  empty LOINC is not an answer).
- `ambiguous`: a vendor/local code matching more than one distinct LOINC; the
  candidates are surfaced but **none is chosen**.
- `no-vendor-code`: component 1 is populated and there is no vendor/local code,
  so nothing was looked up. The wire value is surfaced unvalidated, and is never
  used as a lookup key: the catalog is keyed on the vendor transmission code.
- `no-code`: the record carried no usable test code at all (name-only/empty), so
  there was nothing to map.

#### Union Members

##### Type Literal

\{ `derived`: `true`; `loinc`: `string`; `loincLongName?`: `string`; `representativeUnit?`: `string`; `source`: `"livd"`; `status`: `"mapped"`; `unitComparison?`: [`LivdUnitComparison`](#livdunitcomparison); `vendorResultDescription?`: `string`; `vendorSpecimenDescription?`: `string`; \}

###### derived

> `readonly` **derived**: `true`

###### loinc

> `readonly` **loinc**: `string`

###### loincLongName?

> `readonly` `optional` **loincLongName?**: `string`

###### representativeUnit?

> `readonly` `optional` **representativeUnit?**: `string`

The chosen catalog row's representative unit, verbatim, when supplied.

###### source

> `readonly` **source**: `"livd"`

###### status

> `readonly` **status**: `"mapped"`

###### unitComparison?

> `readonly` `optional` **unitComparison?**: [`LivdUnitComparison`](#livdunitcomparison)

Present **if and only if** the record's units chose this LOINC from more than one candidate,
and it states what that comparison was: verbatim and case sensitive, not UCUM semantic.

###### vendorResultDescription?

> `readonly` `optional` **vendorResultDescription?**: `string`

The chosen catalog row's Vendor Result Description, verbatim, when supplied.

###### vendorSpecimenDescription?

> `readonly` `optional` **vendorSpecimenDescription?**: `string`

The chosen catalog row's Vendor Specimen Description, verbatim, when supplied.

***

##### Type Literal

\{ `status`: `"unmapped"`; \}

***

##### Type Literal

\{ `candidateDetails?`: readonly [`LivdCandidate`](#livdcandidate)[]; `candidates`: readonly `string`[]; `reason?`: [`LivdAmbiguityReason`](#livdambiguityreason); `status`: `"ambiguous"`; \}

###### candidateDetails?

> `readonly` `optional` **candidateDetails?**: readonly [`LivdCandidate`](#livdcandidate)[]

Every candidate row with its LIVD attributes, when the catalog supplied any.

###### candidates

> `readonly` **candidates**: readonly `string`[]

###### reason?

> `readonly` `optional` **reason?**: [`LivdAmbiguityReason`](#livdambiguityreason)

Why the units did not settle it, when the catalog supplied the attributes to say.

###### status

> `readonly` **status**: `"ambiguous"`

***

##### Type Literal

\{ `status`: `"no-vendor-code"`; \}

***

##### Type Literal

\{ `status`: `"no-code"`; \}

***

### LivdWarningCode

> **LivdWarningCode** = *typeof* [`LIVD_WARNING_CODES`](#livd_warning_codes)\[keyof *typeof* [`LIVD_WARNING_CODES`](#livd_warning_codes)\]

Discriminant type for every code in [LIVD\_WARNING\_CODES](#livd_warning_codes), the per-record
codes and the catalog-level one alike. Narrowing by this code lets consumers
write exhaustive `switch` blocks against the registry. It tracks the registry
exactly, so `Object.values(LIVD_WARNING_CODES)` stays a snapshot of this type.

***

### LtpAction

> **LtpAction** = \{ `type`: `"sendAck"`; \} \| \{ `type`: `"sendNak"`; \} \| \{ `type`: `"sendEot"`; \} \| \{ `record`: `Uint8Array`; `type`: `"deliverRecord"`; \}

An action the reducer tells the consumer to take. The consumer performs the I/O
(write the byte to the socket, hand the record to the parser); the reducer only
decides. `sendAck`/`sendNak`/`sendEot` are single control bytes; `deliverRecord`
carries the freshly-completed record's reassembled bytes.

***

### LtpEvent

> **LtpEvent** = \{ `type`: `"enq"`; \} \| \{ `type`: `"ack"`; \} \| \{ `type`: `"nak"`; \} \| \{ `type`: `"eot"`; \} \| \{ `frame`: [`AstmFrame`](#astmframe); `type`: `"frame"`; \}

An inbound protocol event the consumer feeds the reducer: one of the four LTP
control signals (`ENQ`/`ACK`/`NAK`/`EOT`) read off the wire, or a `frame` the
consumer already decoded with `decodeAstmFrames` (the reducer reuses the codec's
`trusted`/`checksum` verdict, it never re-derives it).

***

### LtpPhase

> **LtpPhase** = `"neutral"` \| `"transfer"`

The protocol phase. The line is either **neutral** (idle, awaiting an `ENQ` to
establish, or reset there after an `EOT`) or in **transfer** (establishment
accepted; frames and their per-frame `ACK`/`NAK` flow until the sender's `EOT`).
The classic LIS01 model names three phases (establishment → transfer →
termination), which collapse to these two, since establishment is the
`neutral → transfer` edge and termination is the `transfer → neutral` edge.

***

### LtpWarningCode

> **LtpWarningCode** = *typeof* [`LTP_WARNING_CODES`](#ltp_warning_codes)\[keyof *typeof* [`LTP_WARNING_CODES`](#ltp_warning_codes)\]

Discriminant type for [AstmLtpWarning.code](#code-8). Narrowing by this code lets
consumers write exhaustive `switch` blocks against [LTP\_WARNING\_CODES](#ltp_warning_codes).

***

### ReferenceRangeKind

> **ReferenceRangeKind** = `"closed"` \| `"open-low"` \| `"open-high"` \| `"unparsed"`

The shape of a parsed reference range.

- `closed`: both a low and a high bound (`3.5-5.0`).
- `open-low`: an upper bound only (`<5`), so everything at or below `high`.
- `open-high`: a lower bound only (`>10`), so everything at or above `low`.
- `unparsed`: the text did not match a recognized form; both bounds are
  absent and the raw text is surfaced. **A bound is never fabricated.**

***

### ResultStatusCode

> **ResultStatusCode** = `"F"` \| `"C"` \| `"P"` \| `"R"` \| `"S"` \| `"I"` \| `"X"`

The recognized result-status letters (`R`-record field 9). The clinically
load-bearing members are **`C` (correction, supersedes a previously
transmitted value)** and **`X` (cannot be done / cancelled)**.

This set is bound by **no citable published source**: see
[RESULT\_STATUS\_VOCABULARY](#result_status_vocabulary), which every interpreted status carries. As
with the flags, matching is exact after trimming; letter case is never folded.

***

### ResultStatusMeaning

> **ResultStatusMeaning** = `"final"` \| `"correction"` \| `"preliminary"` \| `"previously-transmitted"` \| `"partial"` \| `"pending"` \| `"cancelled"` \| `"unspecified"` \| `"undefined"`

The modeled meaning of a result status, plus two fail-safe sentinels:
`unspecified` (the field was absent, **never assumed `final`**) and
`undefined` (a letter was present but is not a recognized status).

***

### ShiftedComponentsSink

> **ShiftedComponentsSink** = (`segmentIndex`) => `void`

A callback the split calls on **exactly the condition [ShiftedFieldsSink](#shiftedfieldssink)
reports**, wired instead to the split taken on the **component** separator. The
third and last of the three sinks that share that one predicate, for the reason the
other two share it: the predicate is about the bytes and the split does not know
which role it is being taken on, so the caller that does know names what the gained
boundary costs. Do not "simplify" the three into one: the codes would then have to
make one claim covering all of them, and the three claims are different.

**What a gained component boundary costs, and it is neither of the other two.** No
field number changes, so nothing shifts between field-indexed slots, and nothing
leaves the record, so nothing truncates. Components are modeled **inside** a field,
so what happens is that every component after the gained boundary sits further right
than the competing alignment puts it, and the slots that indexes into
are named things: a Universal Test ID's LOINC-candidate slot, test name, **coding
scheme** and **local code**; a patient name's last, first and middle. Under the
canonical set `&F&^&GLU^L^687` reads four components, so `L` is the coding scheme
and `687` the vendor's local code, while the competing alignment reads three and
`687` is the **coding scheme**. `DOE&F&^&JANE^A` reads a given name of `&JANE` and a
middle name of `A`, while the competing alignment makes `A` the **given** name with
no middle name at all.

**Every gained boundary at or before the LAST MODELED COMPONENT INDEX moves a
modeled slot, not only the first.** That is the structural difference from
[TruncatedFieldSink](#truncatedfieldsink): a field is modeled out of its first repeat alone, so
there only the first gained boundary reaches a modeled slot, while here the shift
propagates from wherever the boundary sits to the end of the component list.

**TWO bounds run the other way, and the report fires inside both, which is
over-reporting and never under-reporting.** Neither is an oversight and neither is
closed by narrowing the guard, because narrowing changes which streams a published
package refuses and wants its own measurement. Both axes are swept on their own
rather than left to the shared corpus, which holds them fixed.

- **Past the last modeled component index, nothing NAMED moves.** A model reads a
  fixed number of components: a patient name three (last, first, middle), a
  Universal Test ID four. A contested boundary further right than that still shifts
  the components after it and leaves every named slot byte-identical under both
  alignments, and this fires there.
- **Inside a LATER repeat nothing modeled moves at all.** `components` is
  `repeats[0]`, so a component boundary gained inside the second or a later repeat
  changes only `repeats[n]` for that `n`.

It fires in both because the boundary is still one the bytes do not force, and a
consumer reading `components` or `repeats` is still reading an alignment guess.

**It is a report, not a repair.** The split is unchanged, every decoded byte is
identical, and the components read are the components that were always read. What is
new is that the moved slots are reported by a code no profile may tolerate, where
before they were covered only by tolerable ones. **Withholding them is a separate
question, deliberately not answered here**: declining to model a slot changes an
extracted value for every consumer of a package already on the registry.

**The tail is weighed one construct deep, exactly as in the other two sinks, and one
tail is excluded for the same reason.** Where the escape character the reading taken
resumes on heads a sequence this codec **recognizes**, it interprets a construct and
the components are the ones the sender wrote: under a set naming the component
separator `F`, `GLU&F&F&F&L` is that separator escaped, written, and escaped again,
with nothing reported at all. Refusing that is the over-refusal that sank an earlier
candidate criterion for this family, and that tail is the only one on which a
stream's escaping can be clean, on the declarations the companion paragraph on
[ShiftedFieldsSink](#shiftedfieldssink) scopes that to. Where the tail heads a sequence whose body is
*unrecognized*, the reading taken consumes a triple it cannot read, the slots move
exactly as far, and this reports it.

**That silence is a TRADE, and it is not a claim that nothing was lost there.** The
gained component boundary is exactly as real on the excluded tail and can be
entirely silent: under the canonical set `&F&^&F&GLU^L^687` reads one component more
than the competing alignment with `warnings: []`, so a coding scheme and a local code
still sit where an alignment guess put them. Reporting it would refuse a stream whose
escaping is working.

**⚠️ HOW FAR THE COMPONENTS MOVE IS THE DISPLACEMENT [ShiftedFieldsSink](#shiftedfieldssink)
STATES, READ ON THE COMPONENT SEPARATOR.** It is not fixed, and it takes three values
and not one: zero on the tie class (`DOE&F&^&^&JANE^A` reads three
components under both, with `A` the middle name under both, and
`ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` has already refused that record), and
more than one once a field carries more than one contested construct. That paragraph
is not repeated here on purpose: it is one claim, stated where the link points.

This third bound differs from the two above in what it is about: those two fire where
nothing named moves because of where the boundary **sits**, while the tie class is
about the bytes **past** it. What holds on **every** firing tuple is that the two
readings disagree and that both consume every byte, so neither is forced.

#### Parameters

##### segmentIndex

`number`

The 0-based index of the component being accumulated when the
  contested boundary was taken. It is **not** a field index, and it is **not** a
  repeat index: the caller splitting one repeat into components already knows both,
  and reports the field. For how far the components after it move, see the
  displacement paragraph on [ShiftedFieldsSink](#shiftedfieldssink).

#### Returns

`void`

***

### ShiftedFieldsSink

> **ShiftedFieldsSink** = (`segmentIndex`) => `void`

A callback the split calls when a competing escape alignment decided a boundary
**and the reading taken cannot read what lies immediately past it**: the escape
character the leftmost reading resumes on heads no sequence this codec can
*interpret*, while the competing alignment is exactly the reading that gives that
character a job, as the close of its own triple. Two tails satisfy that, and they
are reported alike because they cost alike:

- **It heads no sequence at all**, so it is kept as a bare literal and reported
  separately as `ASTM_UNPAIRED_ESCAPE_CHARACTER`.
- **It heads a sequence whose body is not a recognized mnemonic**, so the triple is
  preserved verbatim, never guessed at, and reported separately as
  `ASTM_UNKNOWN_ESCAPE_SEQUENCE`. **Consuming a triple is not interpreting one**,
  and the boundary is bought with bytes this reading cannot read either way.

Wired **only to the split taken on the field separator**, because that is the
whole of its claim: a gained *field* boundary shifts every later field,
so a record's modeled slots after it are decided by the alignment rather than by
the sender's own positions. On a result record that is the units slot and the
**result status** slot: the sender's trailing letter lands in field 9 under the
reading taken and in no field at all under the competing one, so a status of
`final` can be a consequence of the alignment rather than something the sender
put there. A gained *repeat* or *component* boundary divides one field and
reaches nothing outside it, so it moves no **field-indexed** slot and is
deliberately outside this. **That bound is a choice, not a consequence, and the
difference matters**: components are modeled *inside* a field (a Universal Test
ID's coding scheme and local code, a patient name's parts), so a gained repeat or
component boundary does reach a modeled slot. The **repeat** half of that is
reported by [TruncatedFieldSink](#truncatedfieldsink), on the same tail test and under its own
code, because what it costs is a different thing. The **component** half is
reported by [ShiftedComponentsSink](#shiftedcomponentssink), on that same tail test and under a code of
its own again, because what it costs is a third thing: there the components move along the
component list rather than leaving the record. The
callback lets the parser surface a value-free
`ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS` warning. Optional so the split can be used
purely.

**It is a report, not a repair.** The split is unchanged, every decoded byte is
identical, and the status read is the status that was always read. What is new is
that the shift is reported by a code no profile may tolerate, where before it was
covered only by tolerable ones.

**This is independent of [AmbiguousAlignmentSink](#ambiguousalignmentsink), and fires alongside it
rather than instead of it.** That one asks whether the codec's vocabulary prefers
the reading taken *at* the contested position and is silent where the earlier
body is a recognized mnemonic; this one asks what the reading taken makes of the
bytes *after* the boundary and does not consult the earlier body at all. The two
questions are different, so neither test is widened to answer the other.

**The tail is weighed one construct deep, and that bound is stated rather than
left to be found.** Exactly one tail is excluded: **the escape character heads a
sequence this codec recognizes.** Then the reading taken interprets a construct
and leaves nothing unread, while the competing alignment would leave it bare.
Under a set naming the field separator `F`, `28.6&F&F&F&U/L` is the sender
escaping that separator, writing it, and escaping it again: entirely well formed,
and refusing it is the over-refusal that sank the preceding candidate criterion
for this family.

**That exclusion is not a matter of degree, which is why it is the only one.** It
is the sole tail on which a stream's escaping can be clean at all, wherever the
escape role is a character distinct from the three splitting roles: on the other two
the package already reports a deviation. **Where the escape role is NOT distinct that
reasoning does not hold**; see the companion paragraph on [ShiftedFieldsSink](#shiftedfieldssink). A tail comparison that instead weighs
which alignment the bytes *prefer* would exclude the unrecognized body too (the
competing alignment leaves two escape characters bare there against the reading
taken's one unreadable body) and it is the wrong question: these codes report a
**cost**, not a preference, and the cost is identical under both reported tails.

**That silence is a TRADE, and it is not a claim that nothing was lost there.** The
gained field boundary is exactly as real on the excluded tail, and it can be
entirely silent: under the canonical set `R|1|^^^687|28.6&F&|&F&U/L||||F` reads
**nine** fields against the competing alignment's eight with `warnings: []`, so a
result status of `final` is read out of a slot the other reading does not have.
Reporting it would refuse a stream whose escaping is working, which is the trade
this bound makes. **Read the raw line when an escape character sits next to a
delimiter, whether or not anything fired.**

**⚠️ HOW FAR THE DISPLACEMENT RUNS. Every other surface names the KIND of cost and
leaves the magnitude to this paragraph**, because a restatement is a separate claim
that goes stale on its own, and on this family they have.

**The displacement is not fixed, and "one place" describes only the single-construct
case the three codes were first measured on.** It takes three values, and two of them
were left out of every surface that quoted a figure:

- **Zero, on the tie class.** Where the sequence past the boundary carries the
  **field separator itself** as its body, the reading taken holds that character
  inside an opaque atom while the competing alignment splits on it, so the two
  readings return the **same number** of fields in **different places**: no field
  index moves and what differs is the **contents**. `R|1|^^^687|28.6&F&|&|&U/L||||F`
  reads nine fields under both, status `F` in field 9 under both, units `&|&U/L`
  against `&U/L`. That class costs no stream its disposition: the tail body is a
  splitting delimiter in force, so `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` has
  already refused the record.
- **One, on a record carrying exactly one contested construct.** This is the case
  every corpus in this family was built on, and the only one "one place" was ever
  true of.
- **One more for each additional contested construct.** The competing reading resumes
  a character further on at each contested position, so it falls further out of step
  with the reading taken and the gap widens once per construct.
  `A&Z&|&BX&Z&|&F&C` reads **three** fields against **one**.

**The number of these warnings is not the displacement either, in either
direction.** A gained boundary whose tail is a recognized mnemonic is excluded from
the report and still displaces, so one warning can sit on a displacement of two; and
where one of several constructs is a tie, two warnings can sit on a displacement of
one. A consumer cannot recover the offset by counting. **Read the raw line.**

What holds on **every** firing tuple is that the two readings disagree, that both
consume every byte so neither is forced, and that the reading taken never reads
**fewer** segments than the competing one. Measured in
`test/records/alignment-offset-rephasing.test.ts`.

**⚠️ WHICH REPORTS ACCOMPANY THIS ONE, AND THE DECLARATION ON WHICH NONE DOES.** The
exclusion above rests on a defence against over-refusal: firing requires an escape
character heading no sequence this codec can interpret, and the package reports each
of those in its own right, so a stream whose escaping raises nothing is never refused
because of these codes. **That defence is true wherever the escape role is a
character distinct from the three splitting roles, and it is FALSE where it is not.**
On a set naming the escape character in a splitting role too, one byte both opens a
sequence and ends a segment, the split claims it first, and neither
`ASTM_UNPAIRED_ESCAPE_CHARACTER` nor `ASTM_UNKNOWN_ESCAPE_SEQUENCE` ever sees a
sequence to raise: this fires with **neither** companion. What refuses the stream
there is the declaration itself, as `ASTM_RECORD_DELIMITER_ROLE_COLLISION`, which no
profile may tolerate. So the defence survives only in the form **no stream whose
escaping AND whose declaration are both clean is refused by one of these codes.**

**That replacement is scoped to the STREAM and does not hold per message**: the
collision is reported once per set change rather than once per record, so a second
header re-declaring the same colliding set raises nothing while these codes fire
again in its message. A consumer scoping warnings to a message can therefore see one
of them standing entirely alone. The **field** role cannot collide with the escape
role at all: the declaration is the three characters after the field separator and
stops at the next one, so such a header terminates itself one character short and is
refused. Measured in `test/records/alignment-companion-universal.test.ts`.

#### Parameters

##### segmentIndex

`number`

The 0-based index of the field being accumulated when the
  contested boundary was taken. For how far the fields after it are displaced, see
  the displacement paragraph above: it is not a fixed one place.

#### Returns

`void`

***

### SwallowedDelimiterSink

> **SwallowedDelimiterSink** = () => `void`

A callback the codec calls when an **unrecognized** escape body is itself one of
the three splitting delimiters in force (field, repeat, component), so the atom
rule kept that character out of the split and a boundary the sender's bytes
carried never became one. The value is preserved verbatim either way; the
callback lets the parser surface a value-free
`ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` warning. Optional so the codec can
be used purely.

The **escape** character is deliberately not in that test: it is not a splitting
role, so `&&&` under the canonical set loses no boundary. A body that is a
*recognized* mnemonic is not in it either, whatever character it is: `&F&` under
a set naming `F` as the repeat delimiter is the escaped field delimiter the
sender wrote, and reading it as a swallowed repeat boundary would report the
escape mechanism working as a defect.

#### Returns

`void`

***

### TruncatedFieldSink

> **TruncatedFieldSink** = (`segmentIndex`) => `void`

A callback the split calls on **exactly the condition [ShiftedFieldsSink](#shiftedfieldssink)
reports**, wired instead to the split taken on the **repeat** separator. The two
sinks test the same predicate, because the predicate is about the bytes and the
split does not know which role it is being taken on; they are separate so the
caller that does know can name what the gained boundary costs, which is not the
same thing in the two roles. Do not "simplify" them into one: the codes would then
have to make one claim covering both, and the claim is different.

**What a gained repeat boundary costs, and it is not a shift.** No field-indexed
slot moves: the units slot and the result-status slot are read out of the same
field numbers under either alignment. What the report says is that **the field is
read as more repeats than the competing alignment gives it**, and that holds
wherever it fires **except on the named class below**, where the two readings read
the same number of repeats in different places. What it costs depends on **which**
boundary was gained, and the two cases are stated separately rather than folded
into one claim:

- **The gained boundary is the FIRST in the field, and then a modeled slot is
  lost.** A field's modeled value and its components are taken from its **first
  repeat alone**, so everything past the boundary is still on the wire, still in
  `repeats`, and gone from every modeled slot. Under a set naming the repeat
  separator `F`, the value `28.6&S&F&U/L` reads as the two repeats `28.6^` and
  `&U/L`, and every value extractor answers `28.6^`, while the competing alignment
  reads one repeat carrying all of it. The same boundary inside a Universal Test ID
  field leaves the components of the first repeat only, so a UTID whose bytes carry
  a test code can come back as a single component holding a decoded delimiter, with
  the coding scheme and local code read from nothing at all. A patient name loses
  its given and middle names the same way.
- **The gained boundary is a LATER one, and then no modeled slot moves.** The first
  repeat is identical under both alignments, so the value, the components and every
  slot taken from them read the same either way; what differs is the repeat
  structure after the first. **This still fires there, deliberately and measurably**
  (`5.0F28.6&S&F&U/L` under that same set), because the boundary is still one the
  bytes do not force and a consumer reading `repeats` is still reading an alignment
  guess. Relative to the modeled slots that is **over-reporting, never
  under-reporting**, which is the direction this package errs in. Narrowing the sink
  to the first boundary would change which streams a published package refuses and
  wants its own measurement, so the bound is written down instead of guessed at.

**It is a report, not a repair.** The split is unchanged, every decoded byte is
identical, `repeats` still carries every one of them, and the value read is the
value that was always read. What is new is that the gained boundary is reported by
a code no profile may tolerate, where before it was covered only by tolerable ones.

**The tail is weighed one construct deep, exactly as in [ShiftedFieldsSink](#shiftedfieldssink),
and one tail is excluded for the same reason.** Where the escape character the
reading taken resumes on heads a sequence this codec **recognizes**, it interprets
a construct and the two repeats are the ones the sender wrote: under a set naming
the repeat separator `F`, `28.6&F&F&F&U/L` is that separator escaped, written, and
escaped again, with nothing reported at all. Refusing that is the over-refusal that
sank an earlier candidate criterion for this family, and that tail is the only one
on which a stream's escaping can be clean, on the declarations the companion
paragraph on [ShiftedFieldsSink](#shiftedfieldssink) scopes that to. Where the tail heads a sequence whose
body is *unrecognized*, the reading taken consumes a triple it cannot read, the
truncation is the same truncation, and this reports it.

**That silence is a TRADE, and it is not a claim that nothing was lost there.** The
gained repeat boundary is exactly as real on the excluded tail and can be entirely
silent: under the canonical set `28.6&S&\&S&U/L` reads a value of `28.6^` with
`warnings: []`, so `^U/L` leaves every modeled slot at a boundary the bytes do not
force. Reporting it would refuse a stream whose escaping is working.

**⚠️ THE TRUNCATION IS NOT UNIVERSAL OVER THE FIRING POPULATION, AND THE EXCEPTION
IS NAMED RATHER THAN LEFT TO BE FOUND.** Where the sequence past the boundary
carries the **repeat separator itself** as its body, the reading taken holds that
character inside an opaque atom while the competing alignment splits on it, so the
two readings return the **same number** of repeats in **different places**: the
field is not read as more repeats than the competing alignment gives it, and what
differs is the **contents**. Under the canonical set `28.6&F&\&\&U/L` reads two
repeats under both. That class is bounded and costs no stream its disposition: the
tail body is then a splitting delimiter in force, so
`ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` has already refused the record. What
holds on **every** firing tuple is that the two readings disagree and that both
consume every byte, so neither is forced.

#### Parameters

##### segmentIndex

`number`

The 0-based index of the repeat being accumulated when the
  contested boundary was taken, so `0` is the boundary that ends the first repeat
  and is the one that reaches a modeled slot. It is **not** a field index: the
  caller splitting one field into repeats already knows which field it is in, and
  reports that. For how many repeats the two readings differ by, and why the count
  of these warnings does not give it, see the displacement paragraph on
  [ShiftedFieldsSink](#shiftedfieldssink).

#### Returns

`void`

***

### UniversalTestIdProvenance

> **UniversalTestIdProvenance** = `"local-code"` \| `"unvalidated-wire-value-only"` \| `"name-only"` \| `"empty"`

Where a Universal Test ID's usable identifier came from.

***

### UnknownEscapeSink

> **UnknownEscapeSink** = () => `void`

A callback the codec calls when it encounters an escape sequence whose body is
not one of the four recognized mnemonics. The sequence is preserved verbatim;
the callback lets the parser surface a value-free `ASTM_UNKNOWN_ESCAPE_SEQUENCE`
warning. Optional so the codec can be used purely.

#### Returns

`void`

***

### UnpairedEscapeSink

> **UnpairedEscapeSink** = () => `void`

A callback the codec calls when it encounters an escape character that does not
head a three-character escape sequence. The character is preserved verbatim as a
literal; the callback lets the parser surface a value-free
`ASTM_UNPAIRED_ESCAPE_CHARACTER` warning. Optional so the codec can be used purely.

#### Returns

`void`

***

### VocabularyAttribution

> **VocabularyAttribution** = [`NamedVocabulary`](#namedvocabulary) \| [`UnattributedVocabulary`](#unattributedvocabulary)

What an interpreted wire letter was graded against: either a named published
code system or an explicit "no citable source". Discriminate on
[NamedVocabulary.attributed](#attributed).

***

### WarningCode

> **WarningCode** = *typeof* [`WARNING_CODES`](#warning_codes)\[keyof *typeof* [`WARNING_CODES`](#warning_codes)\]

Discriminant type for [AstmRecordWarning.code](#code-10). Narrowing by this code
lets consumers write exhaustive `switch` blocks and guarantees a typo-free
comparison against [WARNING\_CODES](#warning_codes).

## Variables

### ABNORMAL\_FLAG\_CODES

> `const` **ABNORMAL\_FLAG\_CODES**: readonly [`AbnormalFlagCode`](#abnormalflagcode-1)[]

Every abnormal-flag letter this library recognizes, in declaration order. A
letter outside this list is surfaced verbatim as unrecognized, never guessed
into a meaning.

#### Example

```ts
import { ABNORMAL_FLAG_CODES } from "@cosyte/astm";
ABNORMAL_FLAG_CODES.includes("HU"); // true
```

***

### ABNORMAL\_FLAG\_VOCABULARY

> `const` **ABNORMAL\_FLAG\_VOCABULARY**: [`NamedVocabulary`](#namedvocabulary)

The vocabulary the `R` record's abnormal-flag letters (field 7) are graded
against: the HL7 v3 ObservationInterpretation code system, which carries the
concepts kept aligned with the HL7 v2 Table 0078 interpretation codes this
library has always recognized.

The identifier and version are transcribed character for character from that
code system's published source of truth. **The version records what this
library compared against, not what the sender meant.**

#### Example

```ts
import { ABNORMAL_FLAG_VOCABULARY, interpretAbnormalFlag } from "@cosyte/astm";
interpretAbnormalFlag("HU").vocabulary === ABNORMAL_FLAG_VOCABULARY; // true
```

***

### ALL\_ASTM\_WARNING\_CODES

> `const` **ALL\_ASTM\_WARNING\_CODES**: `ReadonlySet`\<[`AnyAstmWarningCode`](#anyastmwarningcode)\>

The set of every real warning code, for O(1) membership checks (used by the
validator to distinguish "unknown code" from "known but forbidden"). Frozen.

#### Example

```ts
import { ALL_ASTM_WARNING_CODES } from "@cosyte/astm";
ALL_ASTM_WARNING_CODES.has("ASTM_LTP_FRAME_REJECTED"); // true
```

***

### AMBIGUOUS\_CODES

> `const` **AMBIGUOUS\_CODES**: `object`

Stable codes for the two ways a flat, stream-scoped accessor can fail to name a single
answer. Renaming a code is a **breaking change**.

#### Type Declaration

##### ASTM\_AMBIGUOUS\_MULTI\_MESSAGE

> `readonly` **ASTM\_AMBIGUOUS\_MULTI\_MESSAGE**: `"ASTM_AMBIGUOUS_MULTI_MESSAGE"` = `"ASTM_AMBIGUOUS_MULTI_MESSAGE"`

The stream carries more than one `H` … `L` message, so a stream-wide answer spans patients.

##### ASTM\_AMBIGUOUS\_MULTI\_PATIENT

> `readonly` **ASTM\_AMBIGUOUS\_MULTI\_PATIENT**: `"ASTM_AMBIGUOUS_MULTI_PATIENT"` = `"ASTM_AMBIGUOUS_MULTI_PATIENT"`

The one message in the stream carries more than one `P`, so "the patient" is not determined.

#### Example

```ts
import { parseAstmRecords, patient, AMBIGUOUS_CODES, AstmAmbiguousStreamError } from "@cosyte/astm";
try {
  patient(parseAstmRecords(raw));
} catch (err) {
  if (err instanceof AstmAmbiguousStreamError) {
    err.code === AMBIGUOUS_CODES.ASTM_AMBIGUOUS_MULTI_MESSAGE;
  }
}
```

***

### ASTM\_ACK

> `const` **ASTM\_ACK**: `6` = `0x06`

Acknowledge (`0x06`): the receiver accepted the last establishment or frame.

***

### ASTM\_ENQ

> `const` **ASTM\_ENQ**: `5` = `0x05`

Enquiry (`0x05`): the sender's request to establish a transfer.

***

### ASTM\_EOT

> `const` **ASTM\_EOT**: `4` = `0x04`

End of transmission (`0x04`): the sender terminated the transfer; the line returns to neutral.

***

### ASTM\_NAK

> `const` **ASTM\_NAK**: `21` = `0x15`

Negative acknowledge (`0x15`): the receiver rejected the last frame; retransmit, do not accept.

***

### astmProfiles

> `const` **astmProfiles**: `object`

Namespace object exposing the built-in profiles: the conservative `default`
baseline plus the evidence-backed `referenceCorpus` (grounded firsthand in the
redistributable OSS reference corpus), each authored via the public
`defineAstmProfile()` API and carrying its cited provenance. Named per-vendor
profiles (cobas / Sysmex / …) are **deferred** pending a firsthand
vendor-attributed quirk document: the engine fully supports them; we do not ship
ungrounded ones.

#### Type Declaration

##### default

> `readonly` **default**: [`AstmProfile`](#astmprofile)

##### referenceCorpus

> `readonly` **referenceCorpus**: [`AstmProfile`](#astmprofile)

#### Example

```ts
import { parseAstmRecords, astmProfiles } from "@cosyte/astm";
const msg = parseAstmRecords(raw, { profile: astmProfiles.referenceCorpus });
msg.profile?.name; // "referenceCorpus"
```

***

### CANONICAL\_DELIMITERS

> `const` **CANONICAL\_DELIMITERS**: [`Delimiters`](#delimiters-2)

The canonical ASTM delimiter set (`H|\^&`). Used only as documentation and as
a comparison baseline for the non-standard-delimiter warning: never as a
parse-time default (delimiters are always read from the header).

#### Example

```ts
import { CANONICAL_DELIMITERS } from "@cosyte/astm";
CANONICAL_DELIMITERS.repeat; // "\\"
```

***

### FATAL\_CODES

> `const` **FATAL\_CODES**: `object`

Stable string codes for every Tier-3 fatal the record parser may throw.
Consumers narrow on `err.code` to react to specific structural failures.
Renaming a code is a **breaking change**.

#### Type Declaration

##### ASTM\_RECORD\_NO\_HEADER

> `readonly` **ASTM\_RECORD\_NO\_HEADER**: `"ASTM_RECORD_NO_HEADER"` = `"ASTM_RECORD_NO_HEADER"`

The first record is not an `H` (header) record: an ASTM message must lead with `H`.

##### ASTM\_RECORD\_UNDECLARED\_DELIMITERS

> `readonly` **ASTM\_RECORD\_UNDECLARED\_DELIMITERS**: `"ASTM_RECORD_UNDECLARED_DELIMITERS"` = `"ASTM_RECORD_UNDECLARED_DELIMITERS"`

The first `H` record could not declare all four delimiters (field/repeat/component/escape).
One code, four reasons, and the message says which: the record is not a header, it is shorter
than a header plus a three-character definition, its definition field holds fewer than three
characters before the next field separator, or its field separator is also one of the other
three. Only the second of those is "too short", so read the message rather than assuming it.

**Two of the four cannot be reached on this fatal, and are not dead code.** A first record that
is not an `H` raises `ASTM_RECORD_NO_HEADER` before the declaration is ever read, and a field
separator reused among the other three ends the delimiter definition where it appears, so the
truncation reason answers first. The reader names all four because it is also called directly
and on later headers, where the same conditions are a warning rather than this fatal.

##### EMPTY\_INPUT

> `readonly` **EMPTY\_INPUT**: `"EMPTY_INPUT"` = `"EMPTY_INPUT"`

Input was empty or whitespace-only: there is nothing to parse. Shared across layers.

#### Example

```ts
import { parseAstmRecords, FATAL_CODES, AstmParseError } from "@cosyte/astm";
try {
  parseAstmRecords("");
} catch (err) {
  if (err instanceof AstmParseError && err.code === FATAL_CODES.EMPTY_INPUT) {
    // handle empty input
  }
}
```

***

### FRAME\_WARNING\_CODES

> `const` **FRAME\_WARNING\_CODES**: `object`

Stable string codes for every frame-codec warning. `key === value` so
`Object.values(...)` yields a stable snapshot set.

#### Type Declaration

##### ASTM\_FRAME\_BAD\_CHECKSUM

> `readonly` **ASTM\_FRAME\_BAD\_CHECKSUM**: `"ASTM_FRAME_BAD_CHECKSUM"` = `"ASTM_FRAME_BAD_CHECKSUM"`

A frame's two-hex-char checksum did not match the modulo-256 sum recomputed over its bytes. The
frame is surfaced with `trusted: false` and its text is **never merged** into a reassembled
record (default **warn** in lenient mode, escalated to a thrown error in `strict`). Corruption is
never silently trusted: the "checksums are routinely not validated" claim was refuted; we
validate.

##### ASTM\_FRAME\_OVERSIZE

> `readonly` **ASTM\_FRAME\_OVERSIZE**: `"ASTM_FRAME_OVERSIZE"` = `"ASTM_FRAME_OVERSIZE"`

A frame's record text exceeded the 240-byte limit without a split. The frame is still surfaced
(and, if its checksum validates, reassembled): the deviation is flagged, not silently dropped
(warn in lenient, thrown in `strict`).

##### ASTM\_FRAME\_SEQUENCE\_GAP

> `readonly` **ASTM\_FRAME\_SEQUENCE\_GAP**: `"ASTM_FRAME_SEQUENCE_GAP"` = `"ASTM_FRAME_SEQUENCE_GAP"`

A frame's sequence number was not the expected next value (`1 → … → 7 → 0 → …`): a frame was
possibly dropped. The stream is **never silently concatenated across the gap** as if contiguous;
the in-progress record is tainted and not emitted as a clean reassembly.

##### ASTM\_FRAME\_UNTERMINATED

> `readonly` **ASTM\_FRAME\_UNTERMINATED**: `"ASTM_FRAME_UNTERMINATED"` = `"ASTM_FRAME_UNTERMINATED"`

A frame opened with `STX` but no valid terminator + checksum was found before the stream ended
(or before the next `STX`), or a record's frames ended on an intermediate `ETB` with no final
`ETX`. The partial bytes are surfaced flagged untrusted and **no partial record is invented**
(warn in lenient, thrown in `strict`).

#### Example

```ts
import { decodeAstmFrames, FRAME_WARNING_CODES } from "@cosyte/astm";
const bytes = new Uint8Array([]); // ...a framed stream...
void bytes;
FRAME_WARNING_CODES.ASTM_FRAME_BAD_CHECKSUM; // "ASTM_FRAME_BAD_CHECKSUM"
```

***

### LIVD\_CATALOG\_IDENTITY\_UNDECLARED

> `const` **LIVD\_CATALOG\_IDENTITY\_UNDECLARED**: [`LivdCatalogIdentity`](#livdcatalogidentity)

The identity reported for a catalog that declared neither a publisher nor a
publication version: a positive statement that it declared none.

It exists so that case is said rather than left to an absent field, and so nothing
has to invent a name, an ordinal or a position to stand in for one. Frozen.

#### Example

```ts
import { LIVD_CATALOG_IDENTITY_UNDECLARED } from "@cosyte/astm";
LIVD_CATALOG_IDENTITY_UNDECLARED.declared; // false
```

***

### LIVD\_WARNING\_CODES

> `const` **LIVD\_WARNING\_CODES**: `object`

Stable string codes for every terminology (LIVD) warning. `key === value` so
`Object.values(...)` yields a stable snapshot set.

#### Type Declaration

##### ASTM\_LIVD\_AMBIGUOUS\_MAPPING

> `readonly` **ASTM\_LIVD\_AMBIGUOUS\_MAPPING**: `"ASTM_LIVD_AMBIGUOUS_MAPPING"` = `"ASTM_LIVD_AMBIGUOUS_MAPPING"`

A vendor/local test code matched **more than one distinct LOINC** in the catalog (e.g. the same
transmission code used by two devices for different analytes). The mapping is `ambiguous` and the
candidate LOINCs are surfaced for inspection, but **none is chosen**: refusing to pick is the
fail-safe, since guessing wrong mis-identifies the test.

##### ASTM\_LIVD\_CATALOG\_NO\_LOINC\_VERSION

> `readonly` **ASTM\_LIVD\_CATALOG\_NO\_LOINC\_VERSION**: `"ASTM_LIVD_CATALOG_NO_LOINC_VERSION"` = `"ASTM_LIVD_CATALOG_NO_LOINC_VERSION"`

A consumer-supplied LIVD catalog was defined **without a LOINC version**, so a mapping it
produces cannot say which version of LOINC it was made against. Advisory and **never a
refusal**: the catalog is still built, still indexed and still answers exactly as it would
have. Raised **once, where the catalog is defined**, and never per record: it is a fact about
the catalog rather than about any message, so it never joins the per-record warning stream.

##### ASTM\_LIVD\_UNMAPPED\_CODE

> `readonly` **ASTM\_LIVD\_UNMAPPED\_CODE**: `"ASTM_LIVD_UNMAPPED_CODE"` = `"ASTM_LIVD_UNMAPPED_CODE"`

A record carried a vendor/local test code, but the consumer-supplied LIVD catalog held **no**
entry for it. The code stays surfaced verbatim and the mapping is `unmapped`: a LOINC is
**never** guessed. Purely advisory: the raw code and value are untouched.

#### Example

```ts
import { LIVD_WARNING_CODES } from "@cosyte/astm";
LIVD_WARNING_CODES.ASTM_LIVD_UNMAPPED_CODE; // "ASTM_LIVD_UNMAPPED_CODE"
```

***

### LTP\_WARNING\_CODES

> `const` **LTP\_WARNING\_CODES**: `object`

Stable string codes for every LTP protocol / transport warning. `key === value`
so `Object.values(...)` yields a stable snapshot set.

#### Type Declaration

##### ASTM\_LTP\_AMBIGUOUS\_TRANSPORT

> `readonly` **ASTM\_LTP\_AMBIGUOUS\_TRANSPORT**: `"ASTM_LTP_AMBIGUOUS_TRANSPORT"` = `"ASTM_LTP_AMBIGUOUS_TRANSPORT"`

The transport detector could not tell a framed stream from a raw (unframed) one from its leading
byte: it was neither `STX`/`ENQ` nor a bare record letter. It **defaults to framed** and warns,
never guessing silently into data loss; a profile override forces the mode. (cobas b121 drops
framing over TCP; cobas 4800 / Iguana retain it, both realities exist, so an unrecognizable lead
is defaulted, not assumed.)

##### ASTM\_LTP\_FRAME\_REJECTED

> `readonly` **ASTM\_LTP\_FRAME\_REJECTED**: `"ASTM_LTP_FRAME_REJECTED"` = `"ASTM_LTP_FRAME_REJECTED"`

The receiver rejected a received frame with a `NAK` instead of accepting it: because its
checksum failed, it was unterminated, or its frame number was out of sequence. The frame's text
is **never** appended to the record and the transfer does **not** advance; the receiver awaits the
sender's retransmit. This is the protocol-level face of the frame codec's fail-safe: a bad frame
drives retransmit, not acceptance.

##### ASTM\_LTP\_UNEXPECTED\_EVENT

> `readonly` **ASTM\_LTP\_UNEXPECTED\_EVENT**: `"ASTM_LTP_UNEXPECTED_EVENT"` = `"ASTM_LTP_UNEXPECTED_EVENT"`

A control event arrived in a protocol state that did not expect it: e.g. an inbound `ACK`/`NAK`
at a receiver (which sends, never receives, those), or an `ENQ` mid-transfer. The event is
surfaced and handled defensively (an unexpected `ACK`/`NAK` is **never** read as acceptance of
data); it never advances the transfer as if valid.

#### Example

```ts
import { LTP_WARNING_CODES } from "@cosyte/astm";
LTP_WARNING_CODES.ASTM_LTP_FRAME_REJECTED; // "ASTM_LTP_FRAME_REJECTED"
```

***

### RESULT\_STATUS\_VOCABULARY

> `const` **RESULT\_STATUS\_VOCABULARY**: [`UnattributedVocabulary`](#unattributedvocabulary)

The attribution for the `R` record's result-status letters (field 9): **none**.

The letters this library models are the ones real analyzers send, but the
normative text that would bind them to a published code set is purchase-gated
and has not been read here. A neighbouring HL7 table exists whose letters
partly agree, and adopting it would be an assertion nothing in the public
record supports. So this library says the set is unattributed rather than
citing a source it cannot stand behind.

#### Example

```ts
import { interpretResultStatus } from "@cosyte/astm";
interpretResultStatus("F").vocabulary.attributed; // false
```

***

### SAFETY\_CRITICAL\_CODES

> `const` **SAFETY\_CRITICAL\_CODES**: `ReadonlySet`\<[`AnyAstmWarningCode`](#anyastmwarningcode)\>

The forbidden set: computed as **every known code minus the tolerable
allow-list**, so it is complete by construction. Frozen. A code appears here iff
it is a real warning code that is not in [TOLERABLE\_CODES](#tolerable_codes).

#### Example

```ts
import { SAFETY_CRITICAL_CODES } from "@cosyte/astm";
SAFETY_CRITICAL_CODES.has("ASTM_RECORD_UNDEFINED_RESULT_STATUS"); // true
SAFETY_CRITICAL_CODES.has("ASTM_RECORD_UNKNOWN_TYPE"); // true
SAFETY_CRITICAL_CODES.has("ASTM_FRAME_BAD_CHECKSUM"); // true
```

***

### TOLERABLE\_CODES

> `const` **TOLERABLE\_CODES**: `ReadonlySet`\<[`AnyAstmWarningCode`](#anyastmwarningcode)\>

The **only** warning codes a profile may list in its `tolerate` set: benign
structural or syntactic vendor noise that cannot alter, drop, or fabricate an
extracted value, **and** whose reported condition nothing else in this package
reads: not to decide where one message ends and the next begins, and not to
decide what kind of message it is. Frozen so it cannot be mutated at runtime to
smuggle a code in. Adding to this set is a deliberate, reviewable act, and an
addition has to satisfy both halves of that test, not just the first.

`ASTM_RECORD_UNKNOWN_TYPE` is **not** on this list, and used to be. An
unrecognized record type may be a header the reader did not recognize as one, in
which case two messages have been read as one, or a `Q` it did not recognize, in
which case the message kind is no longer knowable. Tolerating it can quiet the
only report either happened.

`ASTM_RECORD_FIELDS_UNSEPARATED` is not on this list either, and never was. It
reports a record the delimiters in force could not split, so every modeled field
of that record is missing: it fails the first half of the test outright.

`ASTM_RECORD_DELIMITER_ROLE_COLLISION`,
`ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` and
`ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT` are not on this list and must not be
added to it. Each reports a boundary the reading cannot defend from the bytes (the
first two a boundary that is not in the reading, the third one that may not be in
the bytes), and each exists precisely because the only warnings its condition
previously raised were among the four below.

`ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS` is not on this list and must not be added
to it either, and it is the strongest case of the four: it reports not merely a
boundary but a modeled slot changing hands, up to and including a result status
reading `final` that the competing alignment of the same bytes puts in no field at
all.

`ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD` is not on this list and must not be added
to it either. It reports the same contested alignment deciding a **repeat**
boundary, where no slot changes hands and a modeled reading is cut off instead: the
field is read out of its first repeat alone, so where that boundary is the first
one a value truncates and a Universal Test ID's coding scheme and local code are
read from bytes that are no longer in any modeled slot. Reporting a value that is
not the whole of what the sender wrote fails the first half of the two-clause test
outright.

`ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS` is not on this list and must not be added
to it either. It reports the same contested alignment deciding a **component**
boundary, where nothing leaves the record and no field number changes, and every
component after it moves along the component list instead: a Universal Test ID's coding scheme
and local code, and a patient's given and middle names, are read out of positions the
competing alignment does not put them in. Reporting a code system, a vendor's local
code or a given name that the bytes do not unambiguously carry fails the first half of
the two-clause test outright.

#### Example

```ts
import { TOLERABLE_CODES } from "@cosyte/astm";
TOLERABLE_CODES.has("ASTM_UNKNOWN_ESCAPE_SEQUENCE"); // true
TOLERABLE_CODES.has("ASTM_RECORD_UNKNOWN_TYPE"); // false
TOLERABLE_CODES.has("ASTM_FRAME_BAD_CHECKSUM"); // false
```

***

### VERSION

> `const` **VERSION**: `string` = `"0.1.5"`

Library version string, kept in lockstep with `package.json#version`.

Changesets owns the bump and rewrites `package.json` only, so the release `version` script runs
`cosyte-process sync-version` to rewrite this declaration in the same commit, and
`test/sanity.test.ts` compares the two so a skipped sync goes red instead of shipping a version
string that lies.

#### Example

```ts
import { VERSION } from "@cosyte/astm";
console.log(VERSION);
```

***

### WARNING\_CODES

> `const` **WARNING\_CODES**: `object`

Stable string codes for every Tier-2 warning the record parser may emit.
`key === value` so `Object.values(...)` yields a stable snapshot set.

#### Type Declaration

##### ASTM\_NONSTANDARD\_DELIMITERS

> `readonly` **ASTM\_NONSTANDARD\_DELIMITERS**: `"ASTM_NONSTANDARD_DELIMITERS"` = `"ASTM_NONSTANDARD_DELIMITERS"`

The header declared delimiters other than the canonical `H|\^&`: tolerated, noted.

##### ASTM\_RECORD\_ALIGNMENT\_SHIFTED\_COMPONENTS

> `readonly` **ASTM\_RECORD\_ALIGNMENT\_SHIFTED\_COMPONENTS**: `"ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS"` = `"ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS"`

Two escape alignments of the same bytes disagreed about a **component** boundary, the reading
taken kept it, and the escape character that reading resumes on **heads no sequence this codec
can interpret**. Same contested position and same tail test as
[WARNING\_CODES.ASTM\_RECORD\_ALIGNMENT\_SHIFTED\_FIELDS](#astm_record_alignment_shifted_fields) and
[WARNING\_CODES.ASTM\_RECORD\_ALIGNMENT\_TRUNCATED\_FIELD](#astm_record_alignment_truncated_field), on the third and last splitting
role, and what it costs is a third thing again, which is why it is a third code.

**The components are neither shifted out of the record nor dropped from it: they MOVE along the
component list.** A field's components are modeled *inside* it, so a gained component boundary shifts
every component after it exactly as a gained field boundary shifts every later field, by the
displacement [ShiftedFieldsSink](#shiftedfieldssink) states, **except on the one class named at the end of
this entry**, where the two readings instead read the same
number of components in different places. Nothing leaves the record and nothing changes field
number; what changes is which modeled slot each component lands in, and those slots are named
things:

- **A Universal Test ID's coding scheme and local code.** Under the canonical set,
  `R|1|&F&^&GLU^L^687|28.6|U/L||||F` reads four components, so `L` is the coding scheme and
  `687` the vendor's local code. The competing alignment reads three, so `L` is the test name
  and **`687` is the coding scheme**. A local code and a code-system selector are not the same
  thing, and a consumer routing on one of them routes on the alignment.
- **A patient's given and middle names.** `P|1||MRN-0001||DOE&F&^&JANE^A||19700101|F` reads a
  given name of `&JANE` and a middle name of `A` under the reading taken, and under the
  competing one `A` is the **given** name with no middle name at all.

Before this code the only warning on those streams was the **tolerable**
[WARNING\_CODES.ASTM\_UNPAIRED\_ESCAPE\_CHARACTER](#astm_unpaired_escape_character), so the widest gate-legal profile plus
`{ strict: true }` accepted a test identity and a patient name whose parts were decided by the
alignment rather than by the sender.

**Every gained boundary at or before the LAST MODELED COMPONENT INDEX moves a slot, not only
the first, and that is the difference from the repeat role.** There the field is modeled out of
its first repeat alone, so only the first gained boundary reaches a modeled slot; here the shift
propagates from wherever the boundary sits to the end of the component list.

**TWO bounds run the other way, and this fires inside both**, which is **over-reporting, never
under-reporting**: the direction this package errs in. Both axes are swept on their own rather
than left to the shared corpus, which holds them fixed, and neither is closed by narrowing the
guard, because narrowing changes which streams a published package refuses and wants its own
measurement.

- **Past the last modeled component index, nothing NAMED moves.** A model reads a fixed number
  of components: a patient name three (last, first, middle), a Universal Test ID four. A
  contested boundary further right than that still shifts the components after it while every
  named slot reads byte-identically under both alignments.
- **Inside a LATER repeat nothing modeled moves at all**, because `components` is the first
  repeat, so what changes is `repeats[n]` for that `n` alone.

It fires in both because the boundary is still one the bytes do not force, and a consumer
reading `components` or `repeats` is still reading an alignment guess.

**It is a report, not a repair.** The split is unchanged, every decoded byte is identical, and
the components read are the components that were always read. Picking the other alignment would
be a different guess with no more evidence behind it, on a published package. **Withholding the
moved slots is a separate question and is deliberately not answered here**, for the reason the
shift report already gives: declining to model a slot changes an extracted value for every
consumer of a package already on the registry.

**The tail is weighed one construct deep**, exactly as for the other two, **and exactly one tail
is excluded.** Where the escape character the reading resumes on heads a sequence this codec
*recognizes*, it interprets a construct and the components are the ones the sender wrote: under
a set naming the component separator `F`, `GLU&F&F&F&L` is that separator escaped, written, and
escaped again, entirely well formed, and refusing it would be an over-refusal. That is the only
tail on which a stream's escaping can be clean, on the declarations
[ShiftedFieldsSink](#shiftedfieldssink) scopes that to, which is why it is the only exclusion. Where the
tail heads a sequence whose body is *unrecognized*, the reading taken consumes a triple it
cannot read, preserved verbatim and never guessed at, the slots move exactly as far, and **this
reports it**.

**That remaining silence is a TRADE, not a claim that nothing was lost.** On the excluded tail
the gained boundary is exactly as real and it is `warnings: []`: under the canonical set
`&F&^&F&GLU^L^687` reads one component more than the competing alignment, so `L` is the coding
scheme and `687` the local code under one reading and `687` the **coding scheme** under the
other, with an empty warning list. Reporting it would refuse a stream whose escaping is
working.

**⚠️ THE ONE CLASS WHERE NO COMPONENT INDEX MOVES, NAMED RATHER THAN LEFT TO BE FOUND.** It is a
**third** bound running the other way, and unlike the two above it is about the bytes past the
boundary rather than about where the boundary sits. Where the sequence past it carries the
**component separator itself** as its body, the reading taken holds that character inside an
opaque atom while the competing alignment splits on it, so the two readings return the **same
number** of components in **different places** and what differs is their contents: under the
canonical set `P|1||MRN-0001||DOE&F&^&^&JANE^A||19700101|F` reads three components under both,
with `A` the middle name under both. This still fires there, and the class costs no stream its
disposition: that tail body is a splitting delimiter in force, so
[WARNING\_CODES.ASTM\_RECORD\_DELIMITER\_SWALLOWED\_BY\_ESCAPE](#astm_record_delimiter_swallowed_by_escape) has already refused the record.
What holds on **every** firing tuple is that the two readings disagree and that both consume
every byte, so neither is forced.

**Catch it on the first read.** Emit rewrites the preserved sequences into recognized
mnemonics, and those bytes carry the reading that was taken unambiguously, so a
second-generation read is silent and is correct about its own bytes. A clean re-read is not
evidence.

##### ASTM\_RECORD\_ALIGNMENT\_SHIFTED\_FIELDS

> `readonly` **ASTM\_RECORD\_ALIGNMENT\_SHIFTED\_FIELDS**: `"ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS"` = `"ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS"`

Two escape alignments of the same bytes disagreed about a **field** boundary, the reading taken
kept it, and the escape character that reading resumes on **heads no sequence this codec can
interpret**, so the boundary was bought with bytes this reading cannot read while the competing
alignment is exactly the reading that can. Every field after that point sits further
right than the competing alignment puts it, by a displacement that is **not fixed**: one place
on a record carrying a single contested construct, one more for each additional one, and none
at all **on the one class named at the end of this entry**, where the two readings instead read
the same number of fields in different places. Counting these warnings does not give it; see
[ShiftedFieldsSink](#shiftedfieldssink).

**The shift is the harm, and on a result record it reaches the status slot.** Measured on the
canonical set, `R|1|^^^687|28.6&F&|&U/L||||F` reads **9** fields under the reading taken and
**8** under the competing one, so the sender's trailing `F` lands in field 9 (the result status)
under the first and in no field at all under the second. The parse hands back units `&U/L` and a
status of **`final`**, and both are consequences of the alignment rather than values the sender
placed in those slots. A downstream system reading `final` would act on a result the bytes do
not say was finalised. Before this code the only warning on that stream was the **tolerable**
[WARNING\_CODES.ASTM\_UNPAIRED\_ESCAPE\_CHARACTER](#astm_unpaired_escape_character), so the widest gate-legal profile plus
`{ strict: true }` accepted it.

**It is a report, not a repair.** The split is unchanged, every decoded byte is identical, and
the units and status read are the ones that were always read. Picking the other alignment would
be a different guess with no more evidence behind it, and it would change values on a published
package. What is new is that the shift is reported by a code no profile may tolerate.

**It fires alongside [WARNING\_CODES.ASTM\_RECORD\_AMBIGUOUS\_ESCAPE\_ALIGNMENT](#astm_record_ambiguous_escape_alignment), not instead
of it, and neither test is a widening of the other.** That code asks whether this codec's
vocabulary prefers the reading taken *at* the contested position, and is silent where the
earlier body is a recognized mnemonic. This one asks what the reading taken makes of the bytes
*after* the boundary, and does not consult the earlier body at all.

**Two deliberate bounds, both stated rather than left to be found.**
- **Only the field role, and that bound is a CHOICE rather than a consequence.** A gained repeat
  or component boundary divides one field and reaches nothing outside it, so it moves no
  **field-indexed** slot: the units and the status stay where they were. **It does not follow
  that it moves no modeled slot at all, and writing that down would be false.** Components are
  modeled *inside* a field: a Universal Test ID's four components are the LOINC-candidate slot,
  the test name, the **coding scheme** and the **local code**, and a patient name's three are
  last, first and middle. A gained component boundary shifts those, so a local code can be read
  as a coding scheme and a given name as a middle name. Measured, and it used to be reported by
  nothing where the earlier body was a recognized mnemonic (only the tolerable
  [WARNING\_CODES.ASTM\_UNPAIRED\_ESCAPE\_CHARACTER](#astm_unpaired_escape_character) fired, so a gate-legal profile accepted
  it). It is now reported by
  [WARNING\_CODES.ASTM\_RECORD\_ALIGNMENT\_SHIFTED\_COMPONENTS](#astm_record_alignment_shifted_components), a separate code on the same
  tail test wired to the component split, because wiring this sink to another split is a
  different criterion needing its own population measurement. It is still not something **this**
  code covers. The repeat role costs the **value**, which this code does not report either, and
  which [WARNING\_CODES.ASTM\_RECORD\_ALIGNMENT\_TRUNCATED\_FIELD](#astm_record_alignment_truncated_field) reports.
- **The tail is weighed one construct deep, and exactly one tail is excluded.** Where the escape
  character the reading taken resumes on heads a sequence this codec *recognizes*, the reading
  taken interprets a construct and leaves nothing unread: under a set naming the field separator
  `F`, `28.6&F&F&F&U/L` is that separator escaped, written, and escaped again, entirely well
  formed, and refusing it would be an over-refusal. That is the only tail on which a stream's
  escaping can be clean, on the declarations [ShiftedFieldsSink](#shiftedfieldssink) scopes that to, which is
  why it is the only exclusion. Where the tail heads a sequence
  whose body is *unrecognized*, the reading taken consumes a triple it cannot read, preserved
  verbatim and never guessed at, the field shift is the same shift, and **this reports it**.
  Consuming a triple is not interpreting one.
- **That remaining silence is a TRADE, not a claim that nothing was lost.** The gained field
  boundary is exactly as real on the excluded tail, and there it is not merely under-reported:
  it is `warnings: []`. Under the canonical set `R|1|^^^687|28.6&F&|&F&U/L||||F` reads **nine**
  fields against the competing alignment's eight and hands back a status of **`final`** with an
  empty warning list. Reporting it would refuse a stream whose escaping is working, which is
  the trade this bound makes. **Read the raw line when an escape character sits next to a
  delimiter, whether or not anything fired.**

**⚠️ THE ONE CLASS WHERE NO FIELD INDEX MOVES, NAMED RATHER THAN LEFT TO BE FOUND.** Where the
sequence past the boundary carries the **field separator itself** as its body, the reading taken
holds that character inside an opaque atom while the competing alignment splits on it, so the
two readings return the **same number** of fields in **different places**. Under the canonical
set `R|1|^^^687|28.6&F&|&|&U/L||||F` reads nine fields under both, the status `F` sits in field
9 under both, and what differs is the units: `&|&U/L` against `&U/L`. This still fires there,
which is over-reporting relative to the field indexes and never under-reporting, and the class
costs no stream its disposition: that tail body is a splitting delimiter in force, so
[WARNING\_CODES.ASTM\_RECORD\_DELIMITER\_SWALLOWED\_BY\_ESCAPE](#astm_record_delimiter_swallowed_by_escape) has already refused the record.
What holds on **every** firing tuple is that the two readings disagree and that both consume
every byte, so neither is forced.

**Catch it on the first read.** Emit rewrites the preserved sequences into recognized mnemonics,
and those bytes carry the reading that was taken unambiguously, so a second-generation read is
silent and is correct about its own bytes. A clean re-read is not evidence.

##### ASTM\_RECORD\_ALIGNMENT\_TRUNCATED\_FIELD

> `readonly` **ASTM\_RECORD\_ALIGNMENT\_TRUNCATED\_FIELD**: `"ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD"` = `"ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD"`

Two escape alignments of the same bytes disagreed about a **repeat** boundary, the reading
taken kept it, and the escape character that reading resumes on **heads no sequence this codec
can interpret**. Same contested position and same tail test as
[WARNING\_CODES.ASTM\_RECORD\_ALIGNMENT\_SHIFTED\_FIELDS](#astm_record_alignment_shifted_fields), on a different delimiter role, and
what it costs is a different thing, which is why it is a different code.

**Nothing shifts, and that is not the same as nothing being lost.** No field-indexed slot
moves: the units and the result status are read out of the same field numbers under either
alignment. What this reports is that **the field is read as more repeats than the competing
alignment gives it**, which holds wherever it fires **except on the one class named at the end
of this entry**. What that costs depends on **which** boundary was gained, and the two cases
are stated separately rather than folded into one claim.

**Where it is the FIRST boundary in the field, a modeled slot is lost**, because a field's
modeled value and components are taken from its **first repeat alone**. Everything past the
boundary stays on the wire and stays in `repeats`, and leaves every modeled slot:

- **A value truncates.** Under `H|F^&`, `R|1|^^^687|28.6&S&F&U/L||||F` reads the value field as
  the two repeats `28.6^` and `&U/L`, so a consumer reads `28.6^` and the rest of the value is
  gone. The competing alignment reads one repeat carrying all of it.
- **A modeled component list is deleted rather than shifted.** The same boundary inside a
  Universal Test ID leaves the components of the first repeat only: under `H|F^&`,
  `R|1|&F&F&687|28.6|U/L||||F` reads a UTID of one component holding a decoded field separator,
  with no coding scheme and no local code, where the bytes carry `687`. A patient name loses
  its given and middle names the same way. That is the half of this condition the shift report
  could not cover, because components are modeled **inside** a field.

Before this code the only warnings on those streams were **tolerable** ones
([WARNING\_CODES.ASTM\_NONSTANDARD\_DELIMITERS](#astm_nonstandard_delimiters) and, where the tail applies,
[WARNING\_CODES.ASTM\_UNPAIRED\_ESCAPE\_CHARACTER](#astm_unpaired_escape_character)), so the widest gate-legal profile plus
`{ strict: true }` accepted a truncated value and an emptied Universal Test ID.

**Where it is a LATER boundary, no modeled slot moves and this still fires.** The first repeat
is identical under both alignments, so the value, the components and every slot taken from them
read the same either way (`R|1|^^^687|5.0F28.6&S&F&U/L||||F` under `H|F^&` reads a value of
`5.0` under both), and what differs is the repeat structure after the first. It fires there
deliberately: the boundary is still one the bytes do not force and a consumer reading `repeats`
is still reading an alignment guess. Relative to the modeled slots that is **over-reporting,
never under-reporting**. Narrowing it to the first boundary would change which streams a
published package refuses and wants its own measurement, so the bound is written down instead.

**It is a report, not a repair.** The split is unchanged, every decoded byte is identical,
`repeats` still carries every one of them, and the value read is the value that was always
read. Picking the other alignment would be a different guess with no more evidence behind it,
on a published package.

**Two further deliberate bounds, both stated rather than left to be found.**
- **Only the repeat role.** The **component** role reaches a modeled slot too, and differently:
  there the components stay in the record and move along the component list, so a local code
  reads as a coding scheme and a given name as a middle name. That is measured and is now reported by
  [WARNING\_CODES.ASTM\_RECORD\_ALIGNMENT\_SHIFTED\_COMPONENTS](#astm_record_alignment_shifted_components), a third code on the same tail
  test wired to the component split. It is still not covered **here**, because wiring a sink to
  another split is another criterion, which is why it took its own population measurement.
- **The tail is weighed one construct deep**, exactly as for the shift report, **and exactly
  one tail is excluded.** Where the escape character the reading resumes on heads a sequence
  this codec *recognizes*, it interprets a construct and the repeats are the ones the sender
  wrote: under a set naming the repeat separator `F`, `28.6&F&F&F&U/L` is that separator
  escaped, written, and escaped again, entirely well formed, and refusing it would be an
  over-refusal. That is the only tail on which a stream's escaping can be clean, on the
  declarations [ShiftedFieldsSink](#shiftedfieldssink) scopes that to, which is why it is the only exclusion. Where the tail heads a sequence whose body is *unrecognized*, the
  reading taken consumes a triple it cannot read, preserved verbatim and never guessed at, the
  truncation is the same truncation, and **this reports it**.
- **That remaining silence is a TRADE, not a claim that nothing was lost.** On the excluded tail
  the gained boundary is exactly as real and it is `warnings: []`: under the canonical set
  `R|1|^^^687|28.6&S&\&S&U/L|U/L||||F` reads a value of `28.6^`, and `^U/L` leaves every
  modeled slot, with an empty warning list. Reporting it would refuse a stream whose escaping
  is working.

**⚠️ THE ONE CLASS WHERE THE FIELD IS NOT READ AS MORE REPEATS, NAMED RATHER THAN LEFT TO BE
FOUND.** Where the sequence past the boundary carries the **repeat separator itself** as its
body, the reading taken holds that character inside an opaque atom while the competing
alignment splits on it, so the two readings return the **same number** of repeats in
**different places** and what differs is their contents: under the canonical set
`28.6&F&\&\&U/L` reads two repeats under both. This still fires there, which is over-reporting
relative to the repeat count and never under-reporting, and the class costs no stream its
disposition: that tail body is a splitting delimiter in force, so
[WARNING\_CODES.ASTM\_RECORD\_DELIMITER\_SWALLOWED\_BY\_ESCAPE](#astm_record_delimiter_swallowed_by_escape) has already refused the record.
What holds on **every** firing tuple is that the two readings disagree and that both consume
every byte, so neither is forced.

**Catch it on the first read.** Emit rewrites the preserved sequences into recognized
mnemonics, and those bytes carry the reading that was taken unambiguously, so a
second-generation read is silent and is correct about its own bytes. A clean re-read is not
evidence.

##### ASTM\_RECORD\_AMBIGUOUS\_ESCAPE\_ALIGNMENT

> `readonly` **ASTM\_RECORD\_AMBIGUOUS\_ESCAPE\_ALIGNMENT**: `"ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT"` = `"ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT"`

Escape sequences are matched greedily and leftmost, so the escape character that **closed** an
unrecognized sequence could not also **open** the next one. Where it could have, and where the
body it would have held is the delimiter that was split on, the same bytes carry two alignments
that disagree by one boundary: under the reading taken that delimiter ends a field, repeat or
component, and under the other it sits inside an opaque atom and ends nothing. The leftmost
reading is kept, every byte is preserved, and nothing is re-split.

**This is the mirror of [WARNING\_CODES.ASTM\_RECORD\_DELIMITER\_SWALLOWED\_BY\_ESCAPE](#astm_record_delimiter_swallowed_by_escape), and
the direction is the reason it needs its own code.** That one reports a boundary the reading
**lost**; this one reports a boundary the reading may have **gained**, which is the more
dangerous direction, because a gained boundary hands back a value the sender's bytes do not
unambiguously carry. Measured on the canonical set: `R|1|^^^687|28.6&Z&|&U/L||||F` reads
`value` = `28.6&Z&` and `units` = `&U/L` under the leftmost alignment, and reads as a single
unsplit field carrying both under the other.

**Two exclusions, both deliberate, and the first is wider than its own argument.** Where the
earlier sequence's body is a **recognized** mnemonic nothing is reported, because the reading
taken interprets a construct (`&F&` is the sender escaping a field separator, which is what the
mechanism is for) while the competing alignment's body is a delimiter character it usually
cannot interpret at all, so this codec's own vocabulary prefers the reading taken. That is not
the same as the reading taken being conformant, and where the declared set names a mnemonic
letter as a splitting delimiter both alignments interpret one construct and neither is
preferred, yet this stays silent. Both residues are measured and recorded rather than closed by
widening the test. And where the escape
character after the delimiter does not itself close a sequence there is no competing alignment
at all, so an ordinary escaped value followed by an ordinary boundary is silent.

**It is a report, not a repair, and not a round-trip guard.** The reading is unchanged: picking
the other alignment would be a different guess with no more evidence behind it. Emit then
rewrites the preserved sequences into recognized mnemonics, and those bytes carry the reading
that was taken unambiguously, so a second-generation read is silent and is correct about its own
bytes. The first read of the wire bytes is the only place the ambiguity exists to be caught.

##### ASTM\_RECORD\_AMBIGUOUS\_MESSAGE\_KIND

> `readonly` **ASTM\_RECORD\_AMBIGUOUS\_MESSAGE\_KIND**: `"ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND"` = `"ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND"`

The stream carried **both** a `Q` (request) and an `R` (result) record: a contradictory shape. The
stream is classified `host-query` (the `Q` **dominates**, so it is never read as a result set) and
this warning flags the anomaly. Positional context only; no field value.

Classification is folded over the whole stream, so a `Q` in one message and an `R` in another
raise it too. `classifyMessage(m.records)` over `messages()` says which message carried which.

##### ASTM\_RECORD\_AMBIGUOUS\_VALUE\_SPLIT

> `readonly` **ASTM\_RECORD\_AMBIGUOUS\_VALUE\_SPLIT**: `"ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT"` = `"ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT"`

A result value field carried an *unescaped* component delimiter, so it split into more than one
component. Both the full raw value and the split are surfaced and this warning fires: the
ambiguity is never resolved silently into a truncated value.

##### ASTM\_RECORD\_DELIMITER\_ROLE\_COLLISION

> `readonly` **ASTM\_RECORD\_DELIMITER\_ROLE\_COLLISION**: `"ASTM_RECORD_DELIMITER_ROLE_COLLISION"` = `"ASTM_RECORD_DELIMITER_ROLE_COLLISION"`

A header declared **one character in two roles**, so the boundary between those two roles is
not recoverable from the bytes. The declaration is still read and honored and no record is
dropped: what is gone is a distinction the sender's own bytes no longer carry.

The field separator is not part of this: a declaration naming it in another role is refused
earlier (the `ASTM_RECORD_UNDECLARED_DELIMITERS` fatal on the first header,
[WARNING\_CODES.ASTM\_RECORD\_UNREADABLE\_REDECLARATION](#astm_record_unreadable_redeclaration) on a later one). What this code
covers is the three unordered pairs among the rest: **repeat/component, repeat/escape,
component/escape**.

Measured on `H|^^&` (repeat and component both `^`): the field `A^B^C^D` reads back as four
repeats of one component each, so `components` holds only `A` and a two-repeats-of-two-components
reading cannot be recovered. Measured on `H|\&&` (component and escape both `&`): `A&B` splits
into two components while `A&F&B` reads as the single component `A|B`, so the same character
means two different things depending on what follows it.

**It is not tolerable**, and the reason is the pair it travels with: such a set is always
non-canonical, so before this code existed the only warning on the stream was
[WARNING\_CODES.ASTM\_NONSTANDARD\_DELIMITERS](#astm_nonstandard_delimiters), which a profile may tolerate. That made a
structurally unreadable declaration indistinguishable, to a strict consumer, from an ordinary
vendor set. Emit refuses the same sets outright (`ASTM_EMIT_INVALID_DELIMITERS`).

One warning per header that **changes** the set in force into such a set, not one per colliding
pair. A later header restating the colliding set already in force is a no-op and warns nothing,
on the same rule as [WARNING\_CODES.ASTM\_NONSTANDARD\_DELIMITERS](#astm_nonstandard_delimiters): the set it names was
already reported when it came into force.

##### ASTM\_RECORD\_DELIMITER\_SWALLOWED\_BY\_ESCAPE

> `readonly` **ASTM\_RECORD\_DELIMITER\_SWALLOWED\_BY\_ESCAPE**: `"ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE"` = `"ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE"`

An escape sequence whose body was **not** a recognized mnemonic held a character that is one of
the three splitting delimiters in force, and the atom rule (an `&X&` triple is opaque) kept it
out of the split, so a boundary the bytes carried never became one. The sequence is preserved
verbatim in the value; nothing is dropped and nothing is re-split.

Measured on the canonical set: `R|1|^^^687|28.6&|&U/L||||F` reads `value` = `28.6&|&U/L`, with
**no units** and status `unspecified` rather than `final`.

**This is the code that says a boundary was lost.** The same condition also raises
[WARNING\_CODES.ASTM\_UNKNOWN\_ESCAPE\_SEQUENCE](#astm_unknown_escape_sequence), which stays and stays tolerable: that code
reports only that a body was not recognized, which is true of bodies that cost nothing. This one
is the narrower, safety-critical half, and no profile may tolerate it.

**What it does not do is repair anything.** The atom rule is unchanged (it is what keeps `&F&`
one token under a set that names `F` as a delimiter), so the value is byte-identical to what it
was before this code existed. It also cannot see the condition through a re-emit: emit rewrites
the preserved sequence into recognized mnemonics, and the resulting stream says that value
unambiguously, so a second-generation read is silent and correct about its own bytes. The place
to catch this is the first read of the wire bytes, which is where it now refuses a strict parse.

##### ASTM\_RECORD\_DELIMITERS\_REDECLARED

> `readonly` **ASTM\_RECORD\_DELIMITERS\_REDECLARED**: `"ASTM_RECORD_DELIMITERS_REDECLARED"` = `"ASTM_RECORD_DELIMITERS_REDECLARED"`

A later `H` (header) record declared a **different** delimiter set from the one in force, and the
parser **followed it**: that header and every record after it are read with the newly-declared
delimiters, until the next `H`. Records already read keep the set that was in force when they were
read: a redeclaration never reinterprets bytes that have already been consumed.

A stream carrying several messages back to back is ordinary, and a header that simply **repeats**
the delimiters already in force is a no-op that warns nothing. This code fires only when the set
actually changes, because that is the point at which a reader still using the old set would begin
merging fields together.

##### ASTM\_RECORD\_FIELDS\_UNSEPARATED

> `readonly` **ASTM\_RECORD\_FIELDS\_UNSEPARATED**: `"ASTM_RECORD_FIELDS_UNSEPARATED"` = `"ASTM_RECORD_FIELDS_UNSEPARATED"`

The delimiters in force found **no field separator at all** in a record that carries content
beyond its type letter, so the whole record read back as a single field and none of its modeled
fields could be recovered. The raw line is surfaced intact and nothing is dropped, but on a
result record it means the value, the units and the status are all absent from the parsed model.

This is one signature of a record being read with a delimiter set that does not belong to it,
which is how a delimiter-scoping mistake turns into lost values. It is reported rather than
repaired, because recovering the fields would mean guessing which set the sender meant.

**Its absence is not evidence that a record was read in its own set.** This tests one of the
four delimiter roles, the field separator, and only in its total form, where that separator
occurs in the line (unescaped). Two whole classes of the same loss are outside it: a foreign set
whose field separator happens to occur somewhere in the line still splits (on the wrong
boundaries, silently, and this can happen to one record inside a run of these warnings); and a
set differing in the repeat, component or escape role usually splits into fields normally,
where a mis-split component can cost a test identity while the value survives, and where an
`&X&` sequence whose body is an unrecognized character that is itself a delimiter in force is an
opaque atom, so that delimiter does not split
and every field after it shifts. The escape role's worst case has narrowed and not
disappeared: an escape character heading no sequence is now read as a literal and reported
under [WARNING\_CODES.ASTM\_UNPAIRED\_ESCAPE\_CHARACTER](#astm_unpaired_escape_character) rather than merging the rest of the
record, and a delimiter swallowed inside an `&X&` body now raises
[WARNING\_CODES.ASTM\_RECORD\_DELIMITER\_SWALLOWED\_BY\_ESCAPE](#astm_record_delimiter_swallowed_by_escape) as well as the tolerable
[WARNING\_CODES.ASTM\_UNKNOWN\_ESCAPE\_SEQUENCE](#astm_unknown_escape_sequence), though it still splits the same way. The
mirror of that case, where the leftmost alignment lets a delimiter split that a competing
alignment would have held, gains a boundary rather than losing one, so the record splits into
more fields than another reading gives and this code cannot see it either
([WARNING\_CODES.ASTM\_RECORD\_AMBIGUOUS\_ESCAPE\_ALIGNMENT](#astm_record_ambiguous_escape_alignment) reports that). Treat this code as a
report that one record definitely lost its fields, never as a sweep that would have fired if
any had.

##### ASTM\_RECORD\_ORPHAN\_COMMENT

> `readonly` **ASTM\_RECORD\_ORPHAN\_COMMENT**: `"ASTM_RECORD_ORPHAN_COMMENT"` = `"ASTM_RECORD_ORPHAN_COMMENT"`

A `C` (comment) record had no valid preceding `H`/`P`/`O`/`R` parent: an **orphan**. The comment
is attached to the message root (`attachedToRoot: true`) and surfaced, **never dropped**.

##### ASTM\_RECORD\_PARTIAL\_TIMESTAMP

> `readonly` **ASTM\_RECORD\_PARTIAL\_TIMESTAMP**: `"ASTM_RECORD_PARTIAL_TIMESTAMP"` = `"ASTM_RECORD_PARTIAL_TIMESTAMP"`

A `YYYYMMDDHHMMSS` timestamp had an odd digit run that truncates a two-digit component in half
(e.g. a partial day/hour). The raw run is preserved and the structured value stops at the last
**complete** component: the dangling digit is **never zero-filled into a fabricated time**.

##### ASTM\_RECORD\_UNDEFINED\_ABNORMAL\_FLAG

> `readonly` **ASTM\_RECORD\_UNDEFINED\_ABNORMAL\_FLAG**: `"ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG"` = `"ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG"`

A result's abnormal-flag field (`R` field 7) carried a letter outside HL7 Table 0078. The flag is
surfaced as `undefined`: never dropped, and **never coerced to `normal`** (a clinical error).

##### ASTM\_RECORD\_UNDEFINED\_RESULT\_STATUS

> `readonly` **ASTM\_RECORD\_UNDEFINED\_RESULT\_STATUS**: `"ASTM_RECORD_UNDEFINED_RESULT_STATUS"` = `"ASTM_RECORD_UNDEFINED_RESULT_STATUS"`

A result's status field (`R` field 9) carried a letter that is not a recognized status. It is
surfaced as `undefined` and, like every non-`F` status, never reads as active-final.

##### ASTM\_RECORD\_UNINTERPRETED\_QUERY\_STATUS

> `readonly` **ASTM\_RECORD\_UNINTERPRETED\_QUERY\_STATUS**: `"ASTM_RECORD_UNINTERPRETED_QUERY_STATUS"` = `"ASTM_RECORD_UNINTERPRETED_QUERY_STATUS"`

A `Q` (request-information) record carried a request-information status code (field 13). The code
*set* is `[OSS-derived / paywalled]` with no publicly-groundable enumeration, so the parser
interprets **none** of them: the status is surfaced verbatim and this value-free warning flags that
it was passed through **uninterpreted**, never mapped to a guessed meaning.

##### ASTM\_RECORD\_UNITS\_ABSENT

> `readonly` **ASTM\_RECORD\_UNITS\_ABSENT**: `"ASTM_RECORD_UNITS_ABSENT"` = `"ASTM_RECORD_UNITS_ABSENT"`

A result carried a numeric value but no units (`R` field 5 empty). Units are vendor free text
(not UCUM); a missing unit is flagged here and **never defaulted, guessed, or converted**.

##### ASTM\_RECORD\_UNKNOWN\_TYPE

> `readonly` **ASTM\_RECORD\_UNKNOWN\_TYPE**: `"ASTM_RECORD_UNKNOWN_TYPE"` = `"ASTM_RECORD_UNKNOWN_TYPE"`

A record's type letter is not one of the modeled types: surfaced as an unsupported record,
never dropped. Treat it as a possible lost message boundary, because a header the reader did
not recognize as one does not open a new message.

##### ASTM\_RECORD\_UNPARSEABLE\_REFERENCE\_RANGE

> `readonly` **ASTM\_RECORD\_UNPARSEABLE\_REFERENCE\_RANGE**: `"ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE"` = `"ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE"`

A result's reference-range field (`R` field 6) did not match a recognized form (`low-high`,
`<high`, `>low`). The text is surfaced verbatim as `unparsed`: a bound is **never fabricated**.

##### ASTM\_RECORD\_UNREADABLE\_REDECLARATION

> `readonly` **ASTM\_RECORD\_UNREADABLE\_REDECLARATION**: `"ASTM_RECORD_UNREADABLE_REDECLARATION"` = `"ASTM_RECORD_UNREADABLE_REDECLARATION"`

A later `H` (header) record could not declare a usable delimiter set: it was not a header, it
was too short, its delimiter definition held fewer than three characters, or the
field separator it named also appeared among the other three, leaving the four roles
indistinguishable. The delimiters **already in force are kept** and every record is still surfaced;
a set is never guessed and no record is dropped.

The same condition on the *first* header is unrecoverable and remains the
`ASTM_RECORD_UNDECLARED_DELIMITERS` fatal: there is no earlier set to fall back to.

##### ASTM\_UNKNOWN\_ESCAPE\_SEQUENCE

> `readonly` **ASTM\_UNKNOWN\_ESCAPE\_SEQUENCE**: `"ASTM_UNKNOWN_ESCAPE_SEQUENCE"` = `"ASTM_UNKNOWN_ESCAPE_SEQUENCE"`

An escape sequence body was not one of `&F&`/`&S&`/`&R&`/`&E&`: preserved verbatim.

##### ASTM\_UNPAIRED\_ESCAPE\_CHARACTER

> `readonly` **ASTM\_UNPAIRED\_ESCAPE\_CHARACTER**: `"ASTM_UNPAIRED_ESCAPE_CHARACTER"` = `"ASTM_UNPAIRED_ESCAPE_CHARACTER"`

An escape character appeared where no escape sequence starts (an escape sequence is the escape
character, one body character, and the escape character again). It is read as the **literal
character it is** and kept byte-for-byte in the decoded value. Nothing is dropped and no byte is
invented: this flags that the sender did not write the character the spec-clean way, which
is `&E&`.

**What it replaced is the reason it exists.** The codec used to read such a character as the
opening of a sequence that never closed and merge the whole remainder of the record into the
field it sat in, reporting nothing at all. One `&` in a result value cost the units, the
abnormal flag and the status together and left the status reading `unspecified` rather than
`final`; one in a surname cost the patient's birth date and sex. Emit then re-escaped the merged
text into a spec-clean-looking line that read back as the same wrong value, so the mis-read
survived a round trip without ever surfacing.

**This code is not a statement about the rest of the record.** It reports one character. A
*different* escape character in the same record may still head a real three-character sequence,
and if that sequence's body happens to be a delimiter (`&|&` under the canonical set) the atom
rule means that delimiter does not split. That case is reported separately, under
[WARNING\_CODES.ASTM\_RECORD\_DELIMITER\_SWALLOWED\_BY\_ESCAPE](#astm_record_delimiter_swallowed_by_escape), and it still costs a field
boundary.

##### PROFILE\_QUIRK\_APPLIED

> `readonly` **PROFILE\_QUIRK\_APPLIED**: `"PROFILE_QUIRK_APPLIED"` = `"PROFILE_QUIRK_APPLIED"`

The downgraded form an active vendor [AstmProfile](#astmprofile) produces from a deviation it *expects*
(see `src/profiles/`). The original warning is **never dropped**: its code moves to
[AstmRecordWarning.toleratedCode](#toleratedcode), the warning is re-badged `PROFILE_QUIRK_APPLIED` with
`expected: true` and the tolerating profile named, so a consumer can filter known, grounded noise
while the fact of the deviation, and where it was, survives. A profile can only ever reach this
path for a **non-safety-critical** code (enforced at profile-definition time); a safety-critical
deviation (a result value, flag, status, patient identifier, code system, or a frame-integrity
warning) can **never** be tolerated, so it can never be re-badged here.

#### Example

```ts
import { parseAstmRecords, WARNING_CODES } from "@cosyte/astm";
const msg = parseAstmRecords("H|\\^&\rL|1\r");
msg.warnings.some((w) => w.code === WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE);
```

## Functions

### alignmentShiftedComponents()

> **alignmentShiftedComponents**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS` warning. Emitted when a competing escape
alignment decided a **component** boundary and the escape character the reading taken resumes on
heads no sequence this codec can interpret, so every component after that point sits further right
than the competing alignment puts it. No field number changes and nothing leaves the record, and
that is the difference from [alignmentShiftedFields](#alignmentshiftedfields) and [alignmentTruncatedField](#alignmenttruncatedfield):
what moves is which modeled slot each component lands in, so a Universal Test ID's coding scheme
and local code, or a patient's given and middle names, are read out of positions the competing
alignment does not put them in. **Every gained boundary at or before the last modeled component
index moves those slots, not only the first**; past that index, and inside a **later repeat**,
nothing named moves and this still fires, which is over-reporting and never under-reporting.
**How far the components are displaced, including the tie class where they do not move at all, is
stated once on [ShiftedFieldsSink](#shiftedfieldssink)**; it is not fixed.

A profile may **not** tolerate this code. **Which tolerable escape report accompanies it depends
on the tail**: [WARNING\_CODES.ASTM\_UNPAIRED\_ESCAPE\_CHARACTER](#astm_unpaired_escape_character) where the tail heads no
sequence at all, and [WARNING\_CODES.ASTM\_UNKNOWN\_ESCAPE\_SEQUENCE](#astm_unknown_escape_sequence) where it heads one whose
body is unrecognized. Both report strictly weaker facts. **Which of them accompanies this code,
and the declaration under which neither does, is stated once on the tail test itself**; see
[ShiftedFieldsSink](#shiftedfieldssink). It fires alongside
[WARNING\_CODES.ASTM\_RECORD\_AMBIGUOUS\_ESCAPE\_ALIGNMENT](#astm_record_ambiguous_escape_alignment) where that also applies. The reading
is unchanged: this reports the moved components, it does not repair them.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { alignmentShiftedComponents } from "@cosyte/astm";
alignmentShiftedComponents({ recordIndex: 2, recordType: "R", fieldIndex: 3 });
```

***

### alignmentShiftedFields()

> **alignmentShiftedFields**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS` warning. Emitted when a competing escape
alignment decided a **field** boundary and the escape character the reading taken resumes on
heads no sequence this codec can interpret, so every field after that point sits further right
than the competing alignment puts it. On a result record that reaches the units and the **result
status**: a trailing status letter lands in field 9 under the reading taken and in no field at
all under the competing one. **How far the fields are displaced, and why counting these warnings
does not give it, is stated once on [ShiftedFieldsSink](#shiftedfieldssink)**; it is not fixed.

A profile may **not** tolerate this code. **Which tolerable escape report accompanies it depends
on the tail**: [WARNING\_CODES.ASTM\_UNPAIRED\_ESCAPE\_CHARACTER](#astm_unpaired_escape_character) where the tail heads no
sequence at all, and [WARNING\_CODES.ASTM\_UNKNOWN\_ESCAPE\_SEQUENCE](#astm_unknown_escape_sequence) where it heads one whose
body is unrecognized. Both report strictly weaker facts. **Which of them accompanies this code,
and the declaration under which neither does, is stated once on the tail test itself**; see
[ShiftedFieldsSink](#shiftedfieldssink). It fires alongside
[WARNING\_CODES.ASTM\_RECORD\_AMBIGUOUS\_ESCAPE\_ALIGNMENT](#astm_record_ambiguous_escape_alignment) where that also applies. The reading
is unchanged: this reports the shift, it does not repair it.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { alignmentShiftedFields } from "@cosyte/astm";
alignmentShiftedFields({ recordIndex: 2, recordType: "R", fieldIndex: 4 });
```

***

### alignmentTruncatedField()

> **alignmentTruncatedField**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD` warning. Emitted when a competing escape
alignment decided a **repeat** boundary and the escape character the reading taken resumes on
heads no sequence this codec can interpret, so the field is read as more repeats than the
competing alignment
gives it. No field-indexed slot moves, and that is the difference from
[alignmentShiftedFields](#alignmentshiftedfields). Where the gained boundary is the **first** in the field it still
reaches a modeled slot, because a field's modeled value and components are taken from its first
repeat alone: everything past the boundary stays in `repeats` and leaves every modeled slot, so a
result value truncates and a Universal Test ID or a patient name loses the components that sat
after it. At a **later** boundary nothing modeled moves and this still fires, which is
over-reporting relative to those slots and never under-reporting. **By how many repeats the two
readings differ, including the tie class where they do not differ at all, is stated once on
[ShiftedFieldsSink](#shiftedfieldssink).**

A profile may **not** tolerate this code. **Which tolerable escape report accompanies it depends
on the tail**: [WARNING\_CODES.ASTM\_UNPAIRED\_ESCAPE\_CHARACTER](#astm_unpaired_escape_character) where the tail heads no
sequence at all, and [WARNING\_CODES.ASTM\_UNKNOWN\_ESCAPE\_SEQUENCE](#astm_unknown_escape_sequence) where it heads one whose
body is unrecognized. Both report strictly weaker facts. **Which of them accompanies this code,
and the declaration under which neither does, is stated once on the tail test itself**; see
[ShiftedFieldsSink](#shiftedfieldssink). It fires alongside
[WARNING\_CODES.ASTM\_RECORD\_AMBIGUOUS\_ESCAPE\_ALIGNMENT](#astm_record_ambiguous_escape_alignment) where that also applies. The reading
is unchanged: this reports the gained boundary, it does not repair it.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { alignmentTruncatedField } from "@cosyte/astm";
alignmentTruncatedField({ recordIndex: 2, recordType: "R", fieldIndex: 4 });
```

***

### ambiguousEscapeAlignment()

> **ambiguousEscapeAlignment**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT` warning. Emitted when the escape
character that closed an unrecognized escape sequence could instead have opened one
holding the delimiter that was split on, so the bytes carry two alignments that
disagree about that boundary. The leftmost alignment is kept and every byte is
preserved; what the warning reports is that the boundary is a choice.

A profile may **not** tolerate this code. It fires alongside
[WARNING\_CODES.ASTM\_UNKNOWN\_ESCAPE\_SEQUENCE](#astm_unknown_escape_sequence), which remains tolerable and
reports the strictly weaker fact that a body was not recognized.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { ambiguousEscapeAlignment } from "@cosyte/astm";
ambiguousEscapeAlignment({ recordIndex: 4, recordType: "R", fieldIndex: 4 });
```

***

### ambiguousMessageKind()

> **ambiguousMessageKind**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND` warning. Emitted when a parsed
stream carries both a `Q` (request) and an `R` (result) record, in one message
or across several; the stream is classified as a host-query request (the `Q`
dominates) and the anomaly is flagged.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { ambiguousMessageKind } from "@cosyte/astm";
ambiguousMessageKind({ recordIndex: 0, recordType: "H" });
```

***

### ambiguousValueSplit()

> **ambiguousValueSplit**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT` warning. Emitted when a result
value field split on an unescaped component delimiter: the full raw value and
the split are both surfaced, never a silent truncation.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { ambiguousValueSplit } from "@cosyte/astm";
ambiguousValueSplit({ recordIndex: 3, recordType: "R", fieldIndex: 4 });
```

***

### applyAstmProfile()

> **applyAstmProfile**(`profile`, `warning`): [`AstmRecordWarning`](#astmrecordwarning)

Apply a profile to a single warning. Returns a downgraded `PROFILE_QUIRK_APPLIED`
warning when the profile expects this deviation; otherwise returns the original
warning unchanged (referential identity preserved, so an un-tolerated warning is
never reallocated). A warning that is already `expected` (e.g. re-processed) is
passed through untouched.

**The safety gate is re-checked here, and that is not redundant.**
[defineAstmProfile](#defineastmprofile) refuses a safety-critical code at definition time, but
[AstmProfile](#astmprofile) is a plain interface: a hand-authored object literal
type-checks, and `parseAstmRecords(raw, { profile })` and `setDefaultAstmProfile`
both accept one without re-running the factory. A definition-time-only gate
therefore guards a door that has a second entrance. A safety-critical code is
**not downgraded here whatever the profile says**, so the original warning
survives and `strict` still escalates it. Silently declining to downgrade, rather
than throwing, is the fail-safe direction: the signal is preserved either way, and
a parse is not turned into an exception by a profile the caller built by hand.

#### Parameters

##### profile

[`AstmProfile`](#astmprofile)

The active profile.

##### warning

[`AstmRecordWarning`](#astmrecordwarning)

One accumulated warning.

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

The re-badged warning when tolerated, else the original.

#### Example

```ts
import { applyAstmProfile, astmProfiles, unknownEscapeSequence } from "@cosyte/astm";
const w = unknownEscapeSequence({ recordIndex: 4, recordType: "R", fieldIndex: 5 });
const out = applyAstmProfile(astmProfiles.referenceCorpus, w);
out.code; // "PROFILE_QUIRK_APPLIED"
out.toleratedCode; // "ASTM_UNKNOWN_ESCAPE_SEQUENCE"
```

***

### applyAstmProfileToWarnings()

> **applyAstmProfileToWarnings**(`warnings`, `profile`): [`AstmRecordWarning`](#astmrecordwarning)[]

Apply a profile across a whole warning list, returning a NEW array (the input is
never mutated). Returned unchanged (same reference contents, a shallow copy) when
`profile` is `undefined`, so the no-profile path pays only a copy. Every tolerated
warning is re-badged; every other warning passes through by identity, nothing is
dropped, reordered, or reallocated beyond the re-badge.

#### Parameters

##### warnings

readonly [`AstmRecordWarning`](#astmrecordwarning)[]

The accumulated record warnings.

##### profile

[`AstmProfile`](#astmprofile) \| `undefined`

The active profile, or `undefined` for no transform.

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)[]

A new array with tolerated warnings downgraded.

#### Example

```ts
import { applyAstmProfileToWarnings, astmProfiles } from "@cosyte/astm";
const out = applyAstmProfileToWarnings(msgWarnings, astmProfiles.referenceCorpus);
```

***

### applyLivd()

> **applyLivd**(`msg`, `catalog`): [`LivdResult`](#livdresult)

Apply a consumer-supplied LIVD catalog to a parsed message, producing an
**additive, advisory** layer of LOINC annotations over its `R` (result) and `O`
(order) records. The source message is never mutated; the raw reported codes and
values stay exactly as parsed.

Fail-safe: with no matching entry a code is `unmapped` (+ an
`ASTM_LIVD_UNMAPPED_CODE` warning); with a conflicting mapping it is `ambiguous`
(+ an `ASTM_LIVD_AMBIGUOUS_MAPPING` warning); a LOINC is **never** guessed. A
populated component 1 never short-circuits the lookup and is never reported as a
LOINC: it is carried verbatim as an unvalidated wire value, and where it differs
from the catalog's answer the difference is reported and left unresolved.

A catalog is code a consumer supplies, so a lookup that throws propagates to the
caller unchanged: a consumer's own failure is never reported as a catalog miss,
and no partially annotated result is returned.

#### Parameters

##### msg

[`AstmMessage`](#astmmessage)

A parsed ASTM message.

##### catalog

[`LivdCatalog`](#livdcatalog)

The consumer-supplied LIVD catalog (build with [defineLivdCatalog](#definelivdcatalog)).

#### Returns

[`LivdResult`](#livdresult)

The annotations and value-free warnings (deeply frozen).

#### Example

```ts
import { parseAstmRecords, defineLivdCatalog, applyLivd } from "@cosyte/astm";
const msg = parseAstmRecords("H|\\^&\rR|1|Glucose^^^687|28.6|U/L||N||F\rL|1\r");
const catalog = defineLivdCatalog([{ vendorCode: "687", loinc: "1920-8", loincLongName: "AST" }]);
const [a] = applyLivd(msg, catalog).annotations;
a?.mapping; // { status: "mapped", loinc: "1920-8", loincLongName: "AST", source: "livd", derived: true }
a?.unvalidatedWireValue; // "Glucose": carried verbatim, vouched for by nothing
a?.wireValueDisagreesWithCatalog; // true: reported, never resolved
```

***

### astmDateToLocalISO()

> **astmDateToLocalISO**(`d`): `string`

Render an [AstmDate](#astmdate) as an ISO-8601-*like* string truncated to its
precision, with **no** `Z` and **no** offset: because ASTM carries no
timezone and appending one would fabricate information. A consumer that knows
the instrument's zone can attach it; this function never assumes UTC.

#### Parameters

##### d

[`AstmDate`](#astmdate)

The date to render.

#### Returns

`string`

e.g. `"2024-03-15T09:30"` (minute precision) or `"2024-03"` (month).

#### Example

```ts
import { astmDateToLocalISO, parseAstmDate } from "@cosyte/astm";
astmDateToLocalISO(parseAstmDate("20240315")!); // "2024-03-15"
```

***

### attachComments()

> **attachComments**(`records`, `warnings`): [`AstmRecord`](#astmrecord)[]

Attach every `C` (comment) record to its parent by position: the immediately-preceding
`H`/`P`/`O`/`R` record; consecutive comments share that parent. **Fail-safe:** a comment with no
valid preceding parent is an **orphan**, it is attached to the message root (`attachedToRoot:
true`) with an `ASTM_RECORD_ORPHAN_COMMENT` warning, **never dropped**. Returns a new array; the
non-comment records pass through unchanged.

#### Parameters

##### records

readonly [`AstmRecord`](#astmrecord)[]

The built records, in wire order.

##### warnings

[`AstmRecordWarning`](#astmrecordwarning)[]

The accumulator an orphan comment warns onto.

#### Returns

[`AstmRecord`](#astmrecord)[]

The records with each comment's `parentIndex` / `attachedToRoot` resolved.

#### Example

```ts
import { attachComments } from "@cosyte/astm";
// A comment with no preceding H/P/O/R is an orphan attached to the root.
const warnings: import("@cosyte/astm").AstmRecordWarning[] = [];
const out = attachComments(
  [{ type: "C", recordIndex: 0, fields: [], attachedToRoot: false }],
  warnings,
);
(out[0] as { attachedToRoot: boolean }).attachedToRoot; // true
```

***

### buildAstmMessage()

> **buildAstmMessage**(`input`): `string`

Build a spec-clean ASTM/CLSI-LIS02 record stream from typed input.

The builder emits the canonical `H|\^&` header (plus any header fields), then
every body record with each supplied field at its correct 1-based position and
every value escape-encoded, then an `L` terminator. **Nothing clinical is
defaulted** (an unsupplied field is empty, never a guessed value) and the
structural pieces (delimiters, record types, sequence counters, terminator) are
computed. The result parses back to an equal message: build → parse fidelity by
construction.

#### Parameters

##### input

[`MessageInput`](#messageinput)

The message to build.

#### Returns

`string`

The serialized, `CR`-terminated record stream.

#### Throws

[AstmSerializeError](#astmserializeerror) when a value contains an unencodable `CR`/`LF`.

#### Example

```ts
import { buildAstmMessage, parseAstmRecords, results } from "@cosyte/astm";
const raw = buildAstmMessage({
  records: [{ type: "R", universalTestId: ["", "", "", "687"], value: "28.6", units: "U/L" }],
});
results(parseAstmRecords(raw))[0]?.value; // "28.6"
```

***

### classifyMessage()

> **classifyMessage**(`records`): [`AstmMessageClassification`](#astmmessageclassification-1)

Classify a record stream by the host-query flow. Pure and total: it only reads
the record type letters, never a field value.

`Q` dominates: records with any `Q` among them are a `host-query` request even
when a result (`R`) record is also present, so a query is never misread as a result
upload. (The `Q`+`R` anomaly is separately warned at parse time.)

An **unsupported** record letter with no `Q` alongside it yields `indeterminate`,
never `results` or `orders`: an unreadable letter may have been the `Q`, and
claiming a positive kind over it is how a query comes to read as a result set.
[AstmMessageClassification.hasUnrecognized](#hasunrecognized) reports why the answer is
withheld, and the `has*` counts stay truthful throughout.

`parseAstmRecords` applies this to every record in the stream, so
its `classification` answers for the whole stream, not per message.
Pass one message's records (`m.records` for `m` of `messages()`) to classify that
message on its own.

#### Parameters

##### records

readonly [`AstmRecord`](#astmrecord)[]

The parsed records, in wire order.

#### Returns

[`AstmMessageClassification`](#astmmessageclassification-1)

The classification of exactly those records.

#### Example

```ts
import { classifyMessage, parseAstmRecords } from "@cosyte/astm";
const msg = parseAstmRecords("H|\\^&\rP|1\rQ|1|^SPEC-7||ALL\rL|1\r");
classifyMessage(msg.records).kind; // "host-query"
```

***

### comments()

> **comments**(`msg`): readonly [`CommentRecord`](#commentrecord)[]

Every comment (`C`) record in the message, in wire order. Each carries the
`parentIndex` of the `H`/`P`/`O`/`R` it attaches to (or `attachedToRoot` when
it is an orphan): use [commentsFor](#commentsfor) to get the comments of one record.

#### Parameters

##### msg

[`AstmMessage`](#astmmessage)

A parsed **single-message** stream.

#### Returns

readonly [`CommentRecord`](#commentrecord)[]

The comment records (possibly empty).

#### Throws

[AstmAmbiguousStreamError](#astmambiguousstreamerror) (`ASTM_AMBIGUOUS_MULTI_MESSAGE`) when the stream
  carries more than one message: see [messages](#messages).

#### Example

```ts
import { parseAstmRecords, comments } from "@cosyte/astm";
const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|5|U/L||||F\rC|1|I|checked|G\rL|1\r");
comments(msg)[0]?.text; // "checked"
```

***

### commentsFor()

> **commentsFor**(`msg`, `parent`): readonly [`CommentRecord`](#commentrecord)[]

The comment (`C`) records attached to a given parent record, in wire order.

Unlike the other extractors this works on **any** stream, single- or multi-message: the
parent record it is handed already names the message, so there is nothing to disambiguate.
Returns the comments whose `parentIndex` is that record's `recordIndex`, so a
comment carrying (e.g.) QC context is read against the record it modifies:
never floated to the wrong one.

#### Parameters

##### msg

[`AstmMessage`](#astmmessage)

A parsed message.

##### parent

[`AstmRecord`](#astmrecord)

The `H`/`P`/`O`/`R` record whose comments to collect.

#### Returns

readonly [`CommentRecord`](#commentrecord)[]

The attached comment records (possibly empty).

#### Example

```ts
import { parseAstmRecords, results, commentsFor } from "@cosyte/astm";
const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|5|U/L||||F\rC|1|I|checked|G\rL|1\r");
commentsFor(msg, results(msg)[0]!)[0]?.text; // "checked"
```

***

### composeAstmFrames()

> **composeAstmFrames**(`records`, `options?`): `Uint8Array`

Frame reassembled record bytes into a spec-clean ASTM/CLSI-LIS01 byte stream:
the inverse of [decodeAstmFrames](#decodeastmframes).

Each record is split at 240 text bytes into `ETB`-closed intermediate frames
and a final `ETX` frame; frame numbers run `1, 2, … 7, 0, 1 …` continuously
across the whole stream; every frame's modulo-256 checksum is computed and
emitted uppercase.

**A record in either accepted form is written through unchanged, or refused.** A
record given as a `Uint8Array` is already bytes. A record given as a `string` is
a **byte string**, character `i` becoming byte `i`, the exact inverse of how a
decoded record becomes a string again. A character above `U+00FF` is not a byte,
so it is refused with `ASTM_FRAME_UNENCODABLE_CHARACTER` rather than replaced by
a different character (it used to be truncated to its low byte, which is another
ordinary character, and reached the wire silently). To frame content outside
Latin-1, encode it with the character encoding your instrument uses and pass the
resulting `Uint8Array`. Those two forms are the whole of what `records` accepts.
A caller reaching this from JavaScript with some **other** typed array is outside
the signature and gets no such refusal: each element is still written as its low
byte, the same substitution described above. The reserved-byte check below does
not reach that route either, because it compares elements against the three byte
values and an element like `0x0103` is not one of them, though its low byte
becomes an `ETX` on the wire. Pass a `Uint8Array` or a string.

**A record carrying a frame-structure byte is refused too, in either form.**
`STX`, `ETB` and `ETX` are what the decoder reads as the shape of a frame, and
framing has no escape sequence to hide one behind, so a record holding one is
`ASTM_FRAME_RESERVED_BYTE` rather than a frame truncated at that byte. It used
to be written as given, and the result was not reliably loud: with the two
following bytes matching, the truncated frame verifies and a whole record is
absorbed into the previous one with an empty warnings array at both layers.
Supplying the record as a `Uint8Array` does not route around this check.

**`options.startFrameNumber` is checked before *this function* reads a record**,
so on this entry point the refusal never depends on the caller's data.
([serializeFramedAstm](#serializeframedastm) serializes every record *before* it gets here, so
a record that cannot be serialized is refused first on that route.) It has to
be a whole number from `0` to `7`, because a frame's number is one ASCII digit;
anything else is `ASTM_FRAME_INVALID_START_FRAME_NUMBER` rather than whatever
byte the arithmetic truncated to. A value other than the default `1` writes a
**continuation** of a sequence already in progress, which is what the option is
for, and a continuation decoded on its own opens on a sequence gap: see
[ComposeFramesOptions](#composeframesoptions).

What is still **not** guaranteed: that an accepted record round-trips through
the *record* layer. A delimiter colliding with a record's type letter, for one,
frames and de-frames byte-exactly and still re-reads as a different record.

#### Parameters

##### records

readonly (`string` \| `Uint8Array`\<`ArrayBufferLike`\>)[]

The reassembled record byte-strings (`Uint8Array` or latin1
  `string`), one entry per complete record.

##### options?

[`ComposeFramesOptions`](#composeframesoptions) = `{}`

Encode options.

#### Returns

`Uint8Array`

The framed byte stream.

#### Throws

[AstmFrameEncodeError](#astmframeencodeerror) when `options.startFrameNumber` is not a
  whole number from `0` to `7` (`ASTM_FRAME_INVALID_START_FRAME_NUMBER`), the
  list is empty, a record has no bytes (`ASTM_FRAME_EMPTY_RECORD`), a record
  string holds a character above `U+00FF`
  (`ASTM_FRAME_UNENCODABLE_CHARACTER`), or a record holds an `STX`, `ETB` or
  `ETX` byte (`ASTM_FRAME_RESERVED_BYTE`).

#### Example

```ts
import { composeAstmFrames, decodeAstmFrames } from "@cosyte/astm";
const records = [new TextEncoder().encode("H|\\^&\r"), new TextEncoder().encode("L|1\r")];
const bytes = composeAstmFrames(records);
decodeAstmFrames(bytes).records.length; // 2
```

***

### computeChecksum()

> **computeChecksum**(`bytes`, `start`, `endInclusive`): `number`

Sum bytes `[start, endInclusive]` of `bytes` modulo 256: the ASTM frame
checksum span (frame number through the terminator, inclusive).

#### Parameters

##### bytes

`Uint8Array`

The full decoded byte stream.

##### start

`number`

First index to include (the frame-number byte, one past `STX`).

##### endInclusive

`number`

Last index to include (the `ETB`/`ETX` terminator byte).

#### Returns

`number`

The checksum in `0` to `255`.

#### Example

```ts
import { computeChecksum } from "@cosyte/astm";
// bytes: STX '1' 'A' ETX  →  sum '1' + 'A' + ETX, mod 256.
computeChecksum(new Uint8Array([0x02, 0x31, 0x41, 0x03]), 1, 3); // 0x75
```

***

### decodeAstmFrames()

> **decodeAstmFrames**(`bytes`, `options?`): [`DecodeAstmFramesResult`](#decodeastmframesresult)

Decode a framed ASTM byte stream into frames + reassembled record bytes.

Bytes outside a frame (before the first `STX`, or between a frame's trailing
`LF` and the next `STX`) are skipped: in ASTM they are low-level transfer
control (`ENQ`/`ACK`/`NAK`/`EOT`), never record content, so skipping them is
not data loss.

#### Parameters

##### bytes

`Uint8Array`

The framed byte stream.

##### options?

[`FrameOptions`](#frameoptions) = `{}`

Decode options; lenient unless `strict` is set.

#### Returns

[`DecodeAstmFramesResult`](#decodeastmframesresult)

The decoded frames, the reassembled trusted record bytes, and any warnings.

#### Throws

[AstmParseError](#astmparseerror) with `EMPTY_INPUT` when `bytes` is empty (both modes).

#### Throws

[AstmFrameStrictError](#astmframestricterror) when `strict` is set and any deviation occurred.

#### Example

```ts
import { decodeAstmFrames } from "@cosyte/astm";
// One final frame carrying the record text "R|1|": checksum "AF" over FN..ETX (mod 256).
const bytes = new Uint8Array([0x02, 0x31, 0x52, 0x7c, 0x31, 0x7c, 0x03, 0x41, 0x46, 0x0d, 0x0a]);
const { records, frames } = decodeAstmFrames(bytes);
frames[0]?.frameNumber; // 1
records.length;         // 1
```

***

### decodeEscapes()

> **decodeEscapes**(`leaf`, `d`, `onUnknown?`, `onUnpaired?`, `onSwallowedDelimiter?`): `string`

Decode the four recognized ASTM escape mnemonics in a single already-split
leaf (a component string), substituting the *active* delimiters read from the
header. Unrecognized `&X&` bodies are preserved verbatim and reported through
`onUnknown` (never dropped, never guessed), and an escape character that heads
no sequence at all is preserved as a literal and reported through `onUnpaired`.

This runs **after** splitting, so a decoded delimiter becomes ordinary literal
text and can never introduce a new split boundary.

#### Parameters

##### leaf

`string`

One component string, escape-aware split already applied.

##### d

[`Delimiters`](#delimiters-2)

The delimiters resolved from the header.

##### onUnknown?

[`UnknownEscapeSink`](#unknownescapesink)

Called once per unrecognized escape body encountered.

##### onUnpaired?

[`UnpairedEscapeSink`](#unpairedescapesink)

Called once per escape character that heads no sequence.

##### onSwallowedDelimiter?

[`SwallowedDelimiterSink`](#swalloweddelimitersink)

Called once per unrecognized escape body that is
  itself a splitting delimiter in force, so that delimiter never split.

#### Returns

`string`

The decoded string.

#### Example

```ts
import { decodeEscapes, CANONICAL_DELIMITERS } from "@cosyte/astm";
decodeEscapes("1&S&40", CANONICAL_DELIMITERS); // "1^40"
decodeEscapes("O&Brien", CANONICAL_DELIMITERS); // "O&Brien" (literal, reported)
```

***

### deepFreeze()

> **deepFreeze**\<`T`\>(`value`): `T`

Recursively freeze an object graph (objects and arrays), returning the same
reference typed as deeply readonly. Cyclic graphs are not produced by the
parser, so a simple recursive walk suffices.

#### Type Parameters

##### T

`T`

#### Parameters

##### value

`T`

The value to freeze in place.

#### Returns

`T`

The same value, now deeply frozen.

#### Example

```ts
import { deepFreeze } from "@cosyte/astm";
const frozen = deepFreeze({ a: [1, 2] });
Object.isFrozen(frozen.a); // true
```

***

### defineAstmProfile()

> **defineAstmProfile**(`opts`): [`AstmProfile`](#astmprofile)

Build a frozen [AstmProfile](#astmprofile) from a validated options object. Throws
[AstmProfileDefinitionError](#astmprofiledefinitionerror) on a bad name, an unknown option key, an
invalid `transport`, or an invalid `tolerate` entry, including the **safety
rule**: a profile may never tolerate a safety-critical warning code (default-deny
across all three registries).

`extends` composes profiles: lineage, `tolerate`, `transport`, `provenance`, and
`description` merge (parents left-to-right, then self; scalars are child-wins).
The merged `tolerate` set is re-validated so a safety-critical code cannot sneak
in via a hand-crafted parent.

#### Parameters

##### opts

[`DefineAstmProfileOptions`](#defineastmprofileoptions)

The profile definition; see [DefineAstmProfileOptions](#defineastmprofileoptions).

#### Returns

[`AstmProfile`](#astmprofile)

A frozen, immutable profile with `describe()` attached.

#### Throws

[AstmProfileDefinitionError](#astmprofiledefinitionerror) on any invalid definition.

#### Example

```ts
import { defineAstmProfile } from "@cosyte/astm";
const site = defineAstmProfile({
  name: "acme-analyzer",
  description: "Acme's inbound raw-TCP analyzer",
  transport: "raw",
  tolerate: [
    { code: "ASTM_NONSTANDARD_DELIMITERS", rationale: "declares its own delimiter set" },
  ],
  provenance: { source: "Acme host-interface manual", reference: "internal-2026" },
});
site.lineage; // ["acme-analyzer"]
console.log(site.describe?.());
```

***

### defineLivdCatalog()

> **defineLivdCatalog**(`entries`, `publication?`): [`LivdCatalog`](#livdcatalog)

Build a [LivdCatalog](#livdcatalog) from LIVD entries a consumer supplies. Entries are
indexed by their `vendorCode` (verbatim). When several entries share a vendor
code:

- all agreeing on the same `loinc` → a single `mapped` result (the first entry's
  optional `loincLongName` and LIVD attributes are kept), whether or not the
  reported units equal that entry's representative unit;
- disagreeing (two distinct LOINCs) → the reported units decide, by exact
  case-sensitive equality against each row's
  [LivdEntry.representativeUnit](#representativeunit-1). Exactly one distinct LOINC matching is
  `mapped`, and the answer states that the comparison was verbatim. None matching,
  more than one matching, or no units reported is an `ambiguous` result carrying
  every distinct candidate and **no** choice between them.

Publication-level metadata is supplied beside the rows, and every element of it is
optional, so the single-argument call keeps working exactly as it did. Each declared
value is preserved verbatim and readable back off [LivdCatalog.publication](#publication);
none of it is validated. Declaring no LOINC version is allowed and puts a value-free
[AstmLivdCatalogWarning](#astmlivdcatalogwarning) on [LivdCatalog.warnings](#warnings-5): a nudge, never a
refusal, and no lookup answers differently because of it.

The returned catalog is deeply frozen; nothing is mutated after construction.

#### Parameters

##### entries

readonly [`LivdEntry`](#livdentry)[]

The consumer's LIVD mapping rows.

##### publication?

[`LivdPublication`](#livdpublication)

The consumer's publication-level metadata, when they declare any.

#### Returns

[`LivdCatalog`](#livdcatalog)

An immutable catalog.

#### Examples

```ts
import { defineLivdCatalog } from "@cosyte/astm";
const catalog = defineLivdCatalog([
  { vendorCode: "687", loinc: "1920-8", loincLongName: "AST" },
  { vendorCode: "690", loinc: "1742-6", loincLongName: "ALT" },
]);
catalog.lookup("687"); // { status: "mapped", loinc: "1920-8", loincLongName: "AST" }
catalog.lookup("999"); // { status: "unmapped" }
```

```ts
import { defineLivdCatalog } from "@cosyte/astm";
// One vendor analyte code, two LOINCs, told apart by their representative unit.
const glucose = defineLivdCatalog([
  { vendorCode: "GLU", loinc: "2345-7", representativeUnit: "mg/dL" },
  { vendorCode: "GLU", loinc: "15074-8", representativeUnit: "mmol/L" },
]);
glucose.lookup("GLU", "mmol/L").status; // "mapped": 15074-8, on a verbatim unit match
glucose.lookup("GLU", "MMOL/L").status; // "ambiguous": the comparison is case sensitive
glucose.lookup("GLU").status; // "ambiguous": no units reported, so nothing to compare
```

***

### delimiterRoleCollision()

> **delimiterRoleCollision**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_RECORD_DELIMITER_ROLE_COLLISION` warning. Emitted when a header
declares one character in two of the repeat / component / escape roles. The
declaration is honored and no record is dropped; the message names no character,
because a delimiter is a byte off the wire.

A profile may **not** tolerate this code: it reports a distinction the bytes no
longer carry, and the only other warning such a set raises
([WARNING\_CODES.ASTM\_NONSTANDARD\_DELIMITERS](#astm_nonstandard_delimiters)) is tolerable.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { delimiterRoleCollision } from "@cosyte/astm";
delimiterRoleCollision({ recordIndex: 0, recordType: "H" });
```

***

### delimitersRedeclared()

> **delimitersRedeclared**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_RECORD_DELIMITERS_REDECLARED` warning. Emitted when a later `H`
record declares a delimiter set different from the one in force; the new set is
honored from that header onward. Positional context only: never the delimiters
themselves.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { delimitersRedeclared } from "@cosyte/astm";
delimitersRedeclared({ recordIndex: 5, recordType: "H" });
```

***

### delimiterSwallowedByEscape()

> **delimiterSwallowedByEscape**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` warning. Emitted when an
unrecognized escape body is itself a splitting delimiter in force, so the atom
rule kept it out of the split. The value is preserved verbatim and is identical
with the warning and without it; what the warning reports is the boundary that
did not happen.

A profile may **not** tolerate this code. It fires alongside
[WARNING\_CODES.ASTM\_UNKNOWN\_ESCAPE\_SEQUENCE](#astm_unknown_escape_sequence), which remains tolerable and
reports the strictly weaker fact that a body was not recognized.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { delimiterSwallowedByEscape } from "@cosyte/astm";
delimiterSwallowedByEscape({ recordIndex: 4, recordType: "R", fieldIndex: 4 });
```

***

### describeVocabulary()

> **describeVocabulary**(`vocabulary`): `string`

Render a vocabulary attribution as fixed prose for a warning message.

The result is a function of the attribution constants alone: it embeds no
field text, no value, and no position, so a warning built with it stays
value-free.

#### Parameters

##### vocabulary

[`VocabularyAttribution`](#vocabularyattribution)

The attribution to describe.

#### Returns

`string`

Fixed prose naming the code system and version, or the unattributed reason.

#### Example

```ts
import { describeVocabulary, ABNORMAL_FLAG_VOCABULARY } from "@cosyte/astm";
describeVocabulary(ABNORMAL_FLAG_VOCABULARY); // "graded against <system> version <version>"
```

***

### detectFraming()

> **detectFraming**(`bytes`, `options?`): [`DetectFramingResult`](#detectframingresult)

Detect whether an ASTM byte stream is framed or raw from its leading byte.

- Leading `STX` (`0x02`) or `ENQ` (`0x05`) ⇒ `"framed"`.
- A leading bare record letter (`H`/`P`/`O`/`R`/`C`/`Q`/`M`/`S`/`L`) ⇒ `"raw"`.
- Anything else (including an empty stream) is **ambiguous** ⇒ defaults to
  `"framed"` and emits one `ASTM_LTP_AMBIGUOUS_TRANSPORT` warning.

An `override` short-circuits all of the above, returning the forced mode with no
warning.

#### Parameters

##### bytes

`Uint8Array`

The stream to inspect (only the leading byte is read).

##### options?

[`DetectFramingOptions`](#detectframingoptions) = `{}`

Detection options; an `override` forces the result.

#### Returns

[`DetectFramingResult`](#detectframingresult)

The decided framing, whether it was defaulted, and any warning.

#### Example

```ts
import { detectFraming } from "@cosyte/astm";
detectFraming(new Uint8Array([0x02])).framing; // "framed" (STX)
detectFraming(new Uint8Array([0x48])).framing; // "raw"    (leading "H")
detectFraming(new Uint8Array([0x2a])).framing; // "framed" (ambiguous → defaulted, + warning)
detectFraming(new Uint8Array([0x48]), { override: "framed" }).framing; // "framed" (forced)
```

***

### encodeComponent()

> **encodeComponent**(`leaf`, `d`, `recordIndex?`): `string`

Escape-encode one component leaf for spec-clean emit: the inverse of
`decodeEscapes`. Each character is read **once**, in one left-to-right pass, and
written either as itself or as a whole `escape` + mnemonic + `escape` triple
(`&` → `&E&`, the field / component / repeat delimiters → `&F&` / `&S&` / `&R&`).
Nothing this encoder writes is examined again, which is what makes it the exact
inverse of the decoder: the decoder reads the same output one token at a time,
so every triple it meets is a triple this encoder wrote.

A `CR`/`LF` in the leaf has no escape mnemonic and would break framing, so it
is rejected with an [AstmSerializeError](#astmserializeerror) rather than emitted raw, as is a
delimiter set the result could not be read back with.

#### Parameters

##### leaf

`string`

One already-decoded component string.

##### d

[`Delimiters`](#delimiters-2)

The delimiters to emit against (canonical for spec-clean output).

##### recordIndex?

`number`

The enclosing record's index, for error context.

#### Returns

`string`

The escaped component text.

#### Throws

[AstmSerializeError](#astmserializeerror) for a `CR`/`LF` in the leaf
  (`ASTM_EMIT_UNENCODABLE_VALUE`), or for a delimiter set failing one of the
  three conditions readback requires (`ASTM_EMIT_INVALID_DELIMITERS`). This
  helper takes a leaf and no record, so it never raises
  `ASTM_EMIT_TYPE_LETTER_COLLISION`: a caller assembling a record line out of it
  is outside that check and gets no guarantee that a type letter survives.

#### Example

```ts
import { encodeComponent, CANONICAL_DELIMITERS } from "@cosyte/astm";
encodeComponent("1^40", CANONICAL_DELIMITERS); // "1&S&40"
```

***

### fieldScalar()

> **fieldScalar**(`field`): `string` \| `undefined`

The primary scalar of a field: its first repeat's first component, decoded.
Returns `undefined` for a truly empty field so callers can distinguish
"absent" from a value: never defaulting a missing value.

#### Parameters

##### field

[`AstmField`](#astmfield) \| `undefined`

#### Returns

`string` \| `undefined`

#### Example

```ts
import { fieldScalar, tokenizeRecord, CANONICAL_DELIMITERS } from "@cosyte/astm";
const f = tokenizeRecord("R|1|^^^687|28.6", CANONICAL_DELIMITERS);
fieldScalar(f[3]); // "28.6"
```

***

### fieldsUnseparated()

> **fieldsUnseparated**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_RECORD_FIELDS_UNSEPARATED` warning. The raw line is surfaced
intact; what is lost is every **modeled** field of the record, because the
delimiters in force never split it.

**This one is not cosmetic either.** A record with content but no field
separator is a record being read with a delimiter set that does not belong to
it, and on a result record that costs the value, the units and the status in
one go. The fields are not reconstructed, because doing so would mean guessing
which set the sender meant, so a profile is not permitted to tolerate this code.

**It is a report, not a sweep.** See [WARNING\_CODES](#warning_codes) for the two classes
of the same loss it does not see: its absence never certifies a record split
correctly.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { fieldsUnseparated } from "@cosyte/astm";
fieldsUnseparated({ recordIndex: 4, recordType: "R" });
```

***

### frameBadChecksum()

> **frameBadChecksum**(`position`): [`AstmFrameWarning`](#astmframewarning)

Build an `ASTM_FRAME_BAD_CHECKSUM` warning. The frame is surfaced flagged
untrusted and never merged into a record; the warning carries position only.

#### Parameters

##### position

[`AstmFramePosition`](#astmframeposition)

#### Returns

[`AstmFrameWarning`](#astmframewarning)

#### Example

```ts
import { frameBadChecksum } from "@cosyte/astm";
frameBadChecksum({ frameNumber: 2, byteOffset: 251 });
```

***

### frameOversize()

> **frameOversize**(`position`): [`AstmFrameWarning`](#astmframewarning)

Build an `ASTM_FRAME_OVERSIZE` warning. The 240-byte text limit was exceeded
without a split; the frame is flagged, not silently dropped.

#### Parameters

##### position

[`AstmFramePosition`](#astmframeposition)

#### Returns

[`AstmFrameWarning`](#astmframewarning)

#### Example

```ts
import { frameOversize } from "@cosyte/astm";
frameOversize({ frameNumber: 1, byteOffset: 0 });
```

***

### frameSequenceGap()

> **frameSequenceGap**(`position`): [`AstmFrameWarning`](#astmframewarning)

Build an `ASTM_FRAME_SEQUENCE_GAP` warning. A frame was possibly dropped; the
record is not concatenated across the gap as if contiguous.

#### Parameters

##### position

[`AstmFramePosition`](#astmframeposition)

#### Returns

[`AstmFrameWarning`](#astmframewarning)

#### Example

```ts
import { frameSequenceGap } from "@cosyte/astm";
frameSequenceGap({ frameNumber: 3, byteOffset: 502 });
```

***

### frameUnterminated()

> **frameUnterminated**(`position`): [`AstmFrameWarning`](#astmframewarning)

Build an `ASTM_FRAME_UNTERMINATED` warning. The partial bytes are surfaced
flagged untrusted; no partial record is invented.

#### Parameters

##### position

[`AstmFramePosition`](#astmframeposition)

#### Returns

[`AstmFrameWarning`](#astmframewarning)

#### Example

```ts
import { frameUnterminated } from "@cosyte/astm";
frameUnterminated({ byteOffset: 730 });
```

***

### getAstmProfile()

> **getAstmProfile**(`name`): [`AstmProfile`](#astmprofile) \| `undefined`

Look up a built-in profile by name. Returns `undefined` when no built-in has that
name (a user-defined profile is not in this registry, pass it directly).

#### Parameters

##### name

`string`

The built-in profile name.

#### Returns

[`AstmProfile`](#astmprofile) \| `undefined`

The profile, or `undefined`.

#### Example

```ts
import { getAstmProfile } from "@cosyte/astm";
getAstmProfile("referenceCorpus")?.provenance?.source;
```

***

### getDefaultAstmProfile()

> **getDefaultAstmProfile**(): [`AstmProfile`](#astmprofile) \| `undefined`

Return the current process-scoped default profile, or `undefined` if none is
registered.

#### Returns

[`AstmProfile`](#astmprofile) \| `undefined`

The default profile, or `undefined`.

#### Example

```ts
import { getDefaultAstmProfile } from "@cosyte/astm";
const p = getDefaultAstmProfile();
if (p !== undefined) console.log("default profile:", p.name);
```

***

### hasCollidingRoles()

> **hasCollidingRoles**(`d`): `boolean`

Whether a resolved set names one character in two roles, so the boundary
between those two roles cannot be recovered from the bytes.

[readDelimiters](#readdelimiters) already refuses a declaration whose **field** separator
is one of the other three (it returns `undefined`, which is the
`ASTM_RECORD_UNDECLARED_DELIMITERS` fatal on the first header and the
`ASTM_RECORD_UNREADABLE_REDECLARATION` warning on a later one), so what is left
to test here is the three unordered pairs among the remaining roles:
**repeat/component, repeat/escape, and component/escape**. Three pairs, named
rather than counted, because the count is only meaningful with the list.

Such a declaration is read and honored (nothing is guessed, no record is
dropped) and the loss it causes is real and was previously silent. Measured on
the canonical-looking `H|^^&`, where the repeat and component roles are both
`^`: the field `A^B^C^D` reads back as **four repeats of one component each**,
so a two-repeats-of-two-components reading is unrecoverable and `components`
holds only `A`. On `H|\&&`, where the component and escape roles are both `&`,
the same character splits (`A&B` reads as two components) or opens an atom
(`A&F&B` reads as the single component `A|B`) depending only on what follows
it. Emit refuses such a set outright (`ASTM_EMIT_INVALID_DELIMITERS`).

#### Parameters

##### d

[`Delimiters`](#delimiters-2)

A resolved delimiter set.

#### Returns

`boolean`

`true` iff two of the repeat / component / escape roles share a character.

#### Example

```ts
import { hasCollidingRoles, readDelimiters } from "@cosyte/astm";
hasCollidingRoles(readDelimiters("H|\\^&")!); // false
hasCollidingRoles(readDelimiters("H|^^&")!); // true (repeat === component)
```

***

### interpretAbnormalFlag()

> **interpretAbnormalFlag**(`raw`): [`AbnormalFlag`](#abnormalflag)

Interpret an `R`-record abnormal-flag field (field 7) against
[ABNORMAL\_FLAG\_VOCABULARY](#abnormal_flag_vocabulary).

Leading/trailing whitespace is ignored for the lookup but the `raw` text is
preserved verbatim. Matching is otherwise **exact**: letter case is never
folded. An unrecognized flag yields `{ recognized: false, meaning:
"undefined" }`, surfaced, never dropped, and **never `"normal"`**, and still
carries the vocabulary it was graded against.

#### Parameters

##### raw

`string`

The verbatim field-7 text.

#### Returns

[`AbnormalFlag`](#abnormalflag)

The interpreted flag.

#### Example

```ts
import { interpretAbnormalFlag } from "@cosyte/astm";
interpretAbnormalFlag("U").meaning;   // "significant-change-up"
interpretAbnormalFlag("HU").meaning;  // "significantly-high"
interpretAbnormalFlag("ZZ").meaning;  // "undefined" (never "normal")
```

***

### interpretResultStatus()

> **interpretResultStatus**(`raw`): [`ResultStatus`](#resultstatus-2)

Interpret an `R`-record result-status field (field 9).

An **absent** status (`undefined` or empty) is typed `unspecified`: **never
assumed `final`**. A **present but unrecognized** letter is `undefined`
(recognized `false`). In every non-`F` case `isActiveFinal` is `false`, so a
correction, a cancellation, or an unknown status can never read as current.

Every returned status carries [RESULT\_STATUS\_VOCABULARY](#result_status_vocabulary): the explicit
statement that no published source binding this letter set can be cited.

#### Parameters

##### raw

`string` \| `undefined`

The verbatim field-9 text, or `undefined`/empty when absent.

#### Returns

[`ResultStatus`](#resultstatus-2)

The modeled status.

#### Example

```ts
import { interpretResultStatus } from "@cosyte/astm";
const s = interpretResultStatus("F");
s.isActiveFinal;          // true
s.supersedes;             // false
s.vocabulary.attributed;  // false: nothing is cited for this set
```

***

### isNonStandard()

> **isNonStandard**(`d`): `boolean`

Whether a resolved delimiter set differs from the canonical `H|\^&`. A `true`
result is a tolerated vendor quirk, surfaced as a value-free warning so a
consumer can notice a non-standard stream without the parser refusing it.

#### Parameters

##### d

[`Delimiters`](#delimiters-2)

#### Returns

`boolean`

#### Example

```ts
import { isNonStandard, readDelimiters } from "@cosyte/astm";
isNonStandard(readDelimiters("H|\\^&")!); // false
```

***

### isSafetyCriticalCode()

> **isSafetyCriticalCode**(`code`): `boolean`

True when `code` is a known warning code that is **not** tolerable: i.e. a
profile may never list it. A code that is not a real warning code at all returns
`false` here (the validator reports "unknown code" separately, a distinct
failure with a distinct message).

#### Parameters

##### code

`string`

The warning code to test.

#### Returns

`boolean`

`true` iff the code is a real code outside the tolerable allow-list.

#### Example

```ts
import { isSafetyCriticalCode } from "@cosyte/astm";
isSafetyCriticalCode("ASTM_UNKNOWN_ESCAPE_SEQUENCE"); // false (tolerable)
isSafetyCriticalCode("ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT"); // true
isSafetyCriticalCode("ASTM_RECORD_UNKNOWN_TYPE"); // true (it can mean a lost message boundary)
```

***

### listAstmProfiles()

> **listAstmProfiles**(): readonly `string`[]

The names of every built-in profile, in registration order.

#### Returns

readonly `string`[]

The built-in names.

#### Example

```ts
import { listAstmProfiles } from "@cosyte/astm";
listAstmProfiles(); // ["default", "referenceCorpus"]
```

***

### livdAmbiguousMapping()

> **livdAmbiguousMapping**(`position`): [`AstmLivdWarning`](#astmlivdwarning)

Build an `ASTM_LIVD_AMBIGUOUS_MAPPING` warning. The code matched multiple distinct
LOINCs; none is chosen (refusing to pick is the fail-safe).

#### Parameters

##### position

[`AstmPosition`](#astmposition)

Where the ambiguous code was seen (record ordinal + type; never the code).

#### Returns

[`AstmLivdWarning`](#astmlivdwarning)

The warning.

#### Example

```ts
import { livdAmbiguousMapping } from "@cosyte/astm";
livdAmbiguousMapping({ recordIndex: 4, recordType: "O" });
```

***

### livdCatalogMissingLoincVersion()

> **livdCatalogMissingLoincVersion**(`catalog`): [`AstmLivdCatalogWarning`](#astmlivdcatalogwarning)

Build an `ASTM_LIVD_CATALOG_NO_LOINC_VERSION` warning. Advisory: the catalog it
describes is still built and still answers every lookup exactly as it would have.

#### Parameters

##### catalog

[`LivdCatalogIdentity`](#livdcatalogidentity)

What the catalog declared about its identity; pass
  [LIVD\_CATALOG\_IDENTITY\_UNDECLARED](#livd_catalog_identity_undeclared) where it declared none.

#### Returns

[`AstmLivdCatalogWarning`](#astmlivdcatalogwarning)

The warning.

#### Example

```ts
import { livdCatalogMissingLoincVersion, LIVD_CATALOG_IDENTITY_UNDECLARED } from "@cosyte/astm";
livdCatalogMissingLoincVersion(LIVD_CATALOG_IDENTITY_UNDECLARED);
```

***

### livdUnmappedCode()

> **livdUnmappedCode**(`position`): [`AstmLivdWarning`](#astmlivdwarning)

Build an `ASTM_LIVD_UNMAPPED_CODE` warning. The reported code stays verbatim and
the mapping is `unmapped`; no LOINC is fabricated.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

Where the unmapped code was seen (record ordinal + type; never the code).

#### Returns

[`AstmLivdWarning`](#astmlivdwarning)

The warning.

#### Example

```ts
import { livdUnmappedCode } from "@cosyte/astm";
livdUnmappedCode({ recordIndex: 3, recordType: "R" });
```

***

### lookupLivdForRecord()

> **lookupLivdForRecord**(`record`, `catalog`): [`LivdAnnotation`](#livdannotation)

Annotate one `R` or `O` record against a LIVD catalog. The building block of
[applyLivd](#applylivd); useful when a consumer holds a single record. Never mutates
the record and never fabricates a LOINC.

#### Parameters

##### record

[`OrderRecord`](#orderrecord) \| [`ResultRecord`](#resultrecord)

The result/order record to annotate.

##### catalog

[`LivdCatalog`](#livdcatalog)

The consumer-supplied LIVD catalog.

#### Returns

[`LivdAnnotation`](#livdannotation)

The record's annotation.

#### Example

```ts
import { parseAstmRecords, results, defineLivdCatalog, lookupLivdForRecord } from "@cosyte/astm";
const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
const catalog = defineLivdCatalog([{ vendorCode: "687", loinc: "1920-8" }]);
lookupLivdForRecord(results(msg)[0]!, catalog).mapping.status; // "mapped"
```

***

### ltpAmbiguousTransport()

> **ltpAmbiguousTransport**(): [`AstmLtpWarning`](#astmltpwarning)

Build an `ASTM_LTP_AMBIGUOUS_TRANSPORT` warning. The detector defaulted to
framed; a profile override can force raw.

#### Returns

[`AstmLtpWarning`](#astmltpwarning)

#### Example

```ts
import { ltpAmbiguousTransport } from "@cosyte/astm";
ltpAmbiguousTransport();
```

***

### ltpFrameRejected()

> **ltpFrameRejected**(`frameNumber?`): [`AstmLtpWarning`](#astmltpwarning)

Build an `ASTM_LTP_FRAME_REJECTED` warning. The receiver sent a `NAK`; the
frame's text was never appended and the transfer did not advance.

#### Parameters

##### frameNumber?

`number`

The rejected frame's sequence number, when it could be read.

#### Returns

[`AstmLtpWarning`](#astmltpwarning)

#### Example

```ts
import { ltpFrameRejected } from "@cosyte/astm";
ltpFrameRejected(2);
```

***

### ltpInitialState()

> **ltpInitialState**(): [`LtpState`](#ltpstate)

The neutral starting state for a fresh session: line idle, no record in flight,
nothing delivered yet. A consumer creates one of these when a connection opens
and folds inbound events through [ltpReduce](#ltpreduce) from here.

#### Returns

[`LtpState`](#ltpstate)

A frozen neutral [LtpState](#ltpstate).

#### Example

```ts
import { ltpInitialState, ltpReduce } from "@cosyte/astm";
let state = ltpInitialState();
const step = ltpReduce(state, { type: "enq" });
step.actions; // [{ type: "sendAck" }]
state = step.state;
```

***

### ltpReduce()

> **ltpReduce**(`state`, `event`): [`LtpTransition`](#ltptransition)

Advance the LTP session by one inbound event: a pure function, no I/O.

Behaviour by phase:
- **neutral**: `enq` accepts establishment (`sendAck`, enter transfer); `eot` is
  a benign line reset (no-op); `ack`/`nak` are unexpected at a receiver (surfaced,
  never read as acceptance); a `frame` before establishment is tolerated
  (Postel's Law), the session auto-establishes and processes it, with a warning.
- **transfer**: a `frame` is accepted (`sendAck`, appended, sequence advanced) only
  when it is trusted *and* carries the expected number; a duplicate of the last
  accepted frame is idempotently re-`ACK`ed without re-appending; a bad or
  out-of-sequence frame is `NAK`ed and dropped. `eot` terminates the transfer and
  returns to neutral (a record left open on an `ETB` is **not** delivered). `enq`
  restarts establishment. `ack`/`nak` are unexpected.

#### Parameters

##### state

[`LtpState`](#ltpstate)

The current session state.

##### event

[`LtpEvent`](#ltpevent)

The inbound event.

#### Returns

[`LtpTransition`](#ltptransition)

The next state, the actions to take, and any warnings.

#### Example

```ts
import { ltpInitialState, ltpReduce } from "@cosyte/astm";
// A bad-checksum frame is NAKed, never ACKed, and never appended.
const est = ltpReduce(ltpInitialState(), { type: "enq" }).state;
const bad = { trusted: false } as never;
ltpReduce(est, { type: "frame", frame: bad }).actions; // [{ type: "sendNak" }]
```

***

### ltpUnexpectedEvent()

> **ltpUnexpectedEvent**(`frameNumber?`): [`AstmLtpWarning`](#astmltpwarning)

Build an `ASTM_LTP_UNEXPECTED_EVENT` warning. The event was surfaced and handled
defensively; it never advanced the transfer as if valid.

#### Parameters

##### frameNumber?

`number`

The frame number, when the unexpected event was a frame; omitted otherwise.

#### Returns

[`AstmLtpWarning`](#astmltpwarning)

#### Example

```ts
import { ltpUnexpectedEvent } from "@cosyte/astm";
ltpUnexpectedEvent();
```

***

### messages()

> **messages**(`msg`): readonly [`AstmStreamMessage`](#astmstreammessage)[]

Split a parsed stream into the `H` … `L` messages it carries.

This is the safe path and it never throws: a single-message stream yields exactly one
entry, and pairing a patient with a result inside one entry is correct by construction.

Returns an **array**, not an iterator: the stream is already fully parsed and frozen, so
there is no work to defer, and every other extractor in this package returns a
`readonly` array.

#### Parameters

##### msg

[`AstmMessage`](#astmmessage)

A parsed stream.

#### Returns

readonly [`AstmStreamMessage`](#astmstreammessage)[]

The messages, in wire order; never empty for a parsed stream.

#### Example

```ts
import { parseAstmRecords, messages } from "@cosyte/astm";
const stream = parseAstmRecords("H|\\^&\rP|1|PRAC-1\rR|1|^^^687|1.0|U/L||N||F\rL|1\r");
for (const m of messages(stream)) {
  m.patient?.practiceAssignedId; // "PRAC-1"
  m.results[0]?.value; // "1.0"
}
```

***

### nonStandardDelimiters()

> **nonStandardDelimiters**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_NONSTANDARD_DELIMITERS` warning. The declared delimiters are
used as-is; this only flags that they differ from the canonical set.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { nonStandardDelimiters } from "@cosyte/astm";
nonStandardDelimiters({ recordIndex: 0, recordType: "H" });
```

***

### orders()

> **orders**(`msg`): readonly [`OrderRecord`](#orderrecord)[]

Every order (`O`) record in the message, in wire order.

#### Parameters

##### msg

[`AstmMessage`](#astmmessage)

A parsed **single-message** stream.

#### Returns

readonly [`OrderRecord`](#orderrecord)[]

The order records (possibly empty).

#### Throws

[AstmAmbiguousStreamError](#astmambiguousstreamerror) (`ASTM_AMBIGUOUS_MULTI_MESSAGE`) when the stream
  carries more than one message: see [messages](#messages).

#### Example

```ts
import { parseAstmRecords, orders } from "@cosyte/astm";
const msg = parseAstmRecords("H|\\^&\rO|1|ACC-42||^^^687|R\rL|1\r");
orders(msg)[0]?.specimenId; // "ACC-42"
```

***

### orphanComment()

> **orphanComment**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_RECORD_ORPHAN_COMMENT` warning. Emitted when a `C` record had no
valid preceding `H`/`P`/`O`/`R` parent; the comment is attached to the message
root and surfaced, never dropped.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { orphanComment } from "@cosyte/astm";
orphanComment({ recordIndex: 5, recordType: "C" });
```

***

### parseAstmDate()

> **parseAstmDate**(`raw`): [`AstmDate`](#astmdate) \| `undefined`

Parse an ASTM `YYYYMMDDHHMMSS` value, preserving whatever precision is
present. Returns `undefined` for a value that is not a usable timestamp (fewer
than four leading digits for the year, or non-digit content): a caller keeps
the raw field text either way, so nothing is lost. A partial value is parsed,
never rejected.

Extra trailing digits beyond seconds (fractional seconds some vendors append)
are ignored for the structured value; the full input remains in [AstmDate.raw](#raw-1).

#### Parameters

##### raw

`string`

The raw field text.

#### Returns

[`AstmDate`](#astmdate) \| `undefined`

The parsed date, or `undefined` when it is not a timestamp.

#### Example

```ts
import { parseAstmDate } from "@cosyte/astm";
parseAstmDate("20240315093000")?.precision; // "second"
parseAstmDate("202403")?.precision;          // "month"
```

***

### parseAstmRecords()

> **parseAstmRecords**(`raw`, `options?`): [`AstmMessage`](#astmmessage)

Parse an ASTM/CLSI-LIS02 record stream into an immutable [AstmMessage](#astmmessage).

The stream is a sequence of records separated by `CR` (with `LF`/`CRLF`
tolerated); the first record must be an `H` header, which declares the
delimiters. Lenient by default: set `strict` to reject any tolerated deviation.

**Several messages in one stream.** A message runs `H` … `L`, so a stream may carry
more than one, and each `H` declares the delimiters for the records that follow it.
A later header that declares a **different** set is honored from that header onward
and flagged `ASTM_RECORD_DELIMITERS_REDECLARED`; records already read keep the set
they were read with, so a redeclaration never reinterprets earlier bytes. A header
that merely restates the set in force is a no-op and warns nothing. A later header
that cannot declare a usable set keeps the delimiters already in force and warns
`ASTM_RECORD_UNREADABLE_REDECLARATION`: a set is never guessed, and no record is
dropped. Per-header sets are on each [HeaderRecord.delimiters](#delimiters-3);
[AstmMessage.delimiters](#delimiters) is the first header's.

#### Parameters

##### raw

`string` \| `Uint8Array`\<`ArrayBufferLike`\>

The de-framed record bytes, as a string or `Uint8Array` (decoded
  latin1 so byte values survive 1:1).

##### options?

[`AstmParseOptions`](#astmparseoptions) = `{}`

Parse options; lenient unless `strict` is set.

#### Returns

[`AstmMessage`](#astmmessage)

The parsed, deeply-frozen message.

#### Throws

[AstmParseError](#astmparseerror) on a Tier-3 fatal (`EMPTY_INPUT`,
  `ASTM_RECORD_NO_HEADER`, `ASTM_RECORD_UNDECLARED_DELIMITERS`).

#### Throws

[AstmStrictError](#astmstricterror) when `strict` is set and a deviation occurs.

#### Example

```ts
import { parseAstmRecords, results } from "@cosyte/astm";
const msg = parseAstmRecords("H|\\^&\rP|1\rO|1|ACC\rR|1|^^^687|28.6|U/L||N||F\rL|1|N\r");
results(msg)[0]?.value; // "28.6"
```

***

### parseChecksumHex()

> **parseChecksumHex**(`bytes`, `i0`, `i1`): `number` \| `undefined`

Read the two-hex-char checksum at `bytes[i0]`/`bytes[i1]`, **case-insensitively**
(a lowercase checksum is a tolerated real-vendor quirk). Returns `undefined` when
either position is out of range or not a hex digit: the caller then treats the
frame as having no readable declared checksum, never as a match.

#### Parameters

##### bytes

`Uint8Array`

The full decoded byte stream.

##### i0

`number`

Index of the high hex nibble (immediately after the terminator).

##### i1

`number`

Index of the low hex nibble.

#### Returns

`number` \| `undefined`

The declared checksum in `0` to `255`, or `undefined` if unreadable.

#### Example

```ts
import { parseChecksumHex } from "@cosyte/astm";
parseChecksumHex(new Uint8Array([0x37, 0x35]), 0, 1); // 0x75 ("75")
parseChecksumHex(new Uint8Array([0x37, 0x35]), 5, 6); // undefined (out of range)
```

***

### parseFramedAstm()

> **parseFramedAstm**(`bytes`, `options?`): [`FramedAstmResult`](#framedastmresult)

Decode a framed ASTM byte stream and parse its reassembled records in one call.

Only **trusted, contiguous** frames are reassembled (a bad-checksum frame, a
sequence gap, or an unterminated frame is surfaced in `frames`/`frameWarnings`
but never fed to the record parser), so the parsed `message` reflects only bytes
the framing layer vouched for.

#### Parameters

##### bytes

`Uint8Array`

The framed byte stream.

##### options?

[`FrameOptions`](#frameoptions) & [`AstmParseOptions`](#astmparseoptions) = `{}`

Frame decode options **and** record parse options (both layers
  honor a shared `strict`).

#### Returns

[`FramedAstmResult`](#framedastmresult)

The parsed message plus the frame-layer detail.

#### Throws

[AstmParseError](#astmparseerror) `EMPTY_INPUT` when the stream is empty, or when no
  trusted records could be reassembled (nothing to parse).

#### Throws

[AstmFrameStrictError](#astmframestricterror) / [AstmStrictError](#astmstricterror) in `strict` mode on
  a frame or record deviation, respectively.

#### Example

```ts
import { parseFramedAstm } from "@cosyte/astm";
// A single final frame carrying "H|\^&\r": checksum "E5" over FN..ETX (mod 256).
const bytes = new Uint8Array([
  0x02, 0x31, 0x48, 0x7c, 0x5c, 0x5e, 0x26, 0x0d, 0x03, 0x45, 0x35, 0x0d, 0x0a,
]);
const { message, frames } = parseFramedAstm(bytes);
message.header.delimiters.field; // "|"
frames.length;                   // 1
```

***

### parseReferenceRange()

> **parseReferenceRange**(`raw`): [`ReferenceRange`](#referencerange)

Parse an `R`-record reference-range field (field 6) into a low/high (or
open-ended) pair.

Recognized forms are `low-high` (closed), `<high` (open-low), and `>low`
(open-high). Anything else, including an ambiguous multi-dash string or a
bare non-numeric token, is returned as `kind: "unparsed"` with the raw text
preserved and **no bound invented**. Bounds are surfaced as verbatim text, not
coerced to numbers.

#### Parameters

##### raw

`string`

The verbatim field-6 text.

#### Returns

[`ReferenceRange`](#referencerange)

The parsed reference range.

#### Example

```ts
import { parseReferenceRange } from "@cosyte/astm";
parseReferenceRange("<5").kind;      // "open-low"
parseReferenceRange(">10").low;      // "10"
parseReferenceRange("weird").kind;   // "unparsed" (never a fabricated bound)
```

***

### partialTimestamp()

> **partialTimestamp**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_RECORD_PARTIAL_TIMESTAMP` warning. Emitted when a
`YYYYMMDDHHMMSS` value had an odd digit run that truncates a component; the raw
run is preserved and no time is fabricated.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { partialTimestamp } from "@cosyte/astm";
partialTimestamp({ recordIndex: 2, recordType: "P", fieldIndex: 8 });
```

***

### patient()

> **patient**(`msg`): [`PatientRecord`](#patientrecord) \| `undefined`

The message's patient (`P`) record, or `undefined` when the message carries none.

This is the identity a result files against, so it is answered only when the stream
determines exactly one. It **refuses** the two shapes where "the patient" is a guess: a
stream carrying several messages, and a single message carrying several `P` records. In
both, the old behaviour, the first `P` in the stream, is the wrong-patient path itself.

#### Parameters

##### msg

[`AstmMessage`](#astmmessage)

A parsed single-message stream carrying at most one patient.

#### Returns

[`PatientRecord`](#patientrecord) \| `undefined`

The patient record, or `undefined` when the message carries none.

#### Throws

[AstmAmbiguousStreamError](#astmambiguousstreamerror) (`ASTM_AMBIGUOUS_MULTI_MESSAGE`) when the stream
  carries more than one message, or (`ASTM_AMBIGUOUS_MULTI_PATIENT`) when its one message
  carries more than one `P`. Use [messages](#messages) and read `patients` in both cases.

#### Example

```ts
import { parseAstmRecords, patient } from "@cosyte/astm";
const msg = parseAstmRecords("H|\\^&\rP|1|PRAC|LAB\rL|1\r");
patient(msg)?.practiceAssignedId; // "PRAC"
```

***

### primaryCode()

> **primaryCode**(`u`): `string` \| `undefined`

The primary code to key a result on: the local (vendor) code, and nothing else.
Returns `undefined` when the field carries no vendor/local code, **including**
when component 1 is populated: never a guess, and never a value this library
does not vouch for. Read `unvalidatedWireValue` for that value.

#### Parameters

##### u

[`UniversalTestId`](#universaltestid-6)

A recognized Universal Test ID.

#### Returns

`string` \| `undefined`

The vendor/local code, or `undefined`.

#### Example

```ts
import { primaryCode, recognizeUniversalTestId } from "@cosyte/astm";
primaryCode(recognizeUniversalTestId(["2345-7", "Glucose", "LN", "687"])); // "687"
primaryCode(recognizeUniversalTestId(["Glucose", "", "", ""]));            // undefined
```

***

### profileQuirkApplied()

> **profileQuirkApplied**(`original`, `profileName`): [`AstmRecordWarning`](#astmrecordwarning)

Build a `PROFILE_QUIRK_APPLIED` warning: the downgraded form an active vendor profile produces from
a deviation it *expects*. The original warning is **not dropped**: its `code` moves to
`toleratedCode`, the warning is re-badged `PROFILE_QUIRK_APPLIED`, `expected` is set, and the
tolerating profile is named. The original `position` and `message` are preserved (both PHI-free by
the same construction as every other factory), so a consumer can filter known, grounded noise while
the fact of the deviation, and where it was, survive. A profile can only ever reach this path for a
**non-safety-critical** code (enforced at profile-definition time by the safety gate).

#### Parameters

##### original

[`AstmRecordWarning`](#astmrecordwarning)

The warning the profile tolerated.

##### profileName

`string`

The name of the tolerating profile.

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

The re-badged, still-informative warning.

#### Example

```ts
import { profileQuirkApplied, unknownEscapeSequence } from "@cosyte/astm";
const original = unknownEscapeSequence({ recordIndex: 4, recordType: "R", fieldIndex: 5 });
const w = profileQuirkApplied(original, "referenceCorpus");
w.code; // "PROFILE_QUIRK_APPLIED"
w.toleratedCode; // "ASTM_UNKNOWN_ESCAPE_SEQUENCE"
```

***

### query()

> **query**(`msg`): readonly [`QueryRecord`](#queryrecord)[]

Every request-information (`Q`) record in the message, in wire order. A non-empty
result means the message is a **host-query request**, not a result set: see
[AstmMessage.classification](#classification) (`isHostQueryRequest`).

#### Parameters

##### msg

[`AstmMessage`](#astmmessage)

A parsed **single-message** stream.

#### Returns

readonly [`QueryRecord`](#queryrecord)[]

The query records (possibly empty).

#### Throws

[AstmAmbiguousStreamError](#astmambiguousstreamerror) (`ASTM_AMBIGUOUS_MULTI_MESSAGE`) when the stream
  carries more than one message: see [messages](#messages).

#### Example

```ts
import { parseAstmRecords, query } from "@cosyte/astm";
const msg = parseAstmRecords("H|\\^&\rP|1\rQ|1|^SPEC-7||ALL\rL|1\r");
query(msg)[0]?.queriesAllTests; // true
```

***

### readDelimiterDeclaration()

> **readDelimiterDeclaration**(`headerRecord`): [`DelimiterReadResult`](#delimiterreadresult)

The same read as [readDelimiters](#readdelimiters), keeping **why** it failed.

The reason is not cosmetic. A caller that reports every failure as "too short"
says something false about `H||^&`, a full-length header whose definition field is
empty because its own field separator ends it, and a consumer reading that
diagnostic looks for the wrong thing. The two conditions are separate rules that
happen to coincide today (see the fault list on
[DelimiterDeclarationFault](#delimiterdeclarationfault)), so they are named separately.

**`field-separator-reused` is unreachable through this function today, and the
check stays.** A field separator occurring in the definition positions sits at
index 2, 3 or 4, so it ends the definition where it appears and the definition is
under three characters: `definition-truncated` answers first, every time. The
outcome is right either way (such a declaration does not resolve at all). The
check is the statement of an invariant the length rule currently enforces on its
behalf, and the two are not the same rule: a change to how the definition field is
bounded would separate them again. Deleting it would leave the invariant
unstated and the change silent.

#### Parameters

##### headerRecord

`string`

The raw `H` record text (no trailing CR/LF).

#### Returns

[`DelimiterReadResult`](#delimiterreadresult)

The resolved delimiters, or the named reason they could not be read.

#### Example

```ts
import { readDelimiterDeclaration } from "@cosyte/astm";
readDelimiterDeclaration("H|\\^&").ok; // true
readDelimiterDeclaration("H||^&"); // { ok: false, fault: "definition-truncated" }
```

***

### readDelimiters()

> **readDelimiters**(`headerRecord`): [`Delimiters`](#delimiters-2) \| `undefined`

Read the four delimiters from a header record's raw text (a single `H`
record, its terminator already stripped).

Returns `undefined` when the record cannot declare all four delimiters. The four
ways that happens are named by [readDelimiterDeclaration](#readdelimiterdeclaration), which is this
function with the reason kept; use it wherever the reason is shown to a consumer,
because "too short" is false of some of them.

What the caller does with that depends on **which** header it is. On the first
header it is the `ASTM_RECORD_UNDECLARED_DELIMITERS` fatal, because there is no
earlier set to fall back to. On any later header (a stream may carry several
messages, each declaring its own set) the delimiters already in force are kept
and an `ASTM_RECORD_UNREADABLE_REDECLARATION` warning is raised instead; a set is
never guessed and no record is dropped.

**A set two of whose other three roles share a character is resolved, not
refused**, because the stream is still readable and refusing it would drop
records the sender did send. What it costs is the boundary between those two
roles, which the bytes no longer carry: see [hasCollidingRoles](#hascollidingroles), which
the parse path calls to report it (`ASTM_RECORD_DELIMITER_ROLE_COLLISION`).

This function does not throw: delimiter resolution and the escalation decision are
kept separate so the reader stays pure and testable.

#### Parameters

##### headerRecord

`string`

The raw `H` record text (no trailing CR/LF).

#### Returns

[`Delimiters`](#delimiters-2) \| `undefined`

The resolved delimiters, or a declared failure.

#### Example

```ts
import { readDelimiters } from "@cosyte/astm";
const d = readDelimiters("H|\\^&|||sender");
d.field; // "|"
```

***

### recognizeUniversalTestId()

> **recognizeUniversalTestId**(`components`): [`UniversalTestId`](#universaltestid-6)

Recognize a Universal Test ID from a field's already-decoded components.

The provenance is decided **positionally**, by which components are populated,
and never by what a value looks like.

#### Parameters

##### components

readonly `string`[]

The component strings (escape-decoded), in order.

#### Returns

[`UniversalTestId`](#universaltestid-6)

The recognized, provenance-tagged Universal Test ID.

#### Example

```ts
import { recognizeUniversalTestId, primaryCode } from "@cosyte/astm";
primaryCode(recognizeUniversalTestId(["", "Glucose", "L", "687"])); // "687"
```

***

### resolveProfileTransport()

> **resolveProfileTransport**(`profile`): [`AstmFraming`](#astmframing) \| `undefined`

The profile's transport override, if any: the value a consumer feeds to
`detectFraming(bytes, { override })` to force framed/raw and bypass leading-byte
auto-detection. `undefined` means "let detection decide."

#### Parameters

##### profile

[`AstmProfile`](#astmprofile) \| `undefined`

The active profile, or `undefined`.

#### Returns

[`AstmFraming`](#astmframing) \| `undefined`

`"framed"` / `"raw"` when the profile forces one, else `undefined`.

#### Example

```ts
import { resolveProfileTransport, detectFraming, astmProfiles } from "@cosyte/astm";
const override = resolveProfileTransport(myRawTcpProfile);
const { framing } = detectFraming(bytes, override !== undefined ? { override } : {});
```

***

### results()

> **results**(`msg`): readonly [`ResultRecord`](#resultrecord)[]

Every result (`R`) record in the message, in wire order.

#### Parameters

##### msg

[`AstmMessage`](#astmmessage)

A parsed **single-message** stream.

#### Returns

readonly [`ResultRecord`](#resultrecord)[]

The result records (possibly empty).

#### Throws

[AstmAmbiguousStreamError](#astmambiguousstreamerror) (`ASTM_AMBIGUOUS_MULTI_MESSAGE`) when the stream
  carries more than one message: see [messages](#messages).

#### Example

```ts
import { parseAstmRecords, results } from "@cosyte/astm";
const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
results(msg)[0]?.units; // "U/L"
```

***

### serializeAstmRecord()

> **serializeAstmRecord**(`record`, `d?`): `string`

Serialize a single ASTM record to its spec-clean wire text (no trailing
terminator). Emits with the given delimiters, defaulting to the canonical set.

The header (`H`) is special-cased: its delimiter-definition field is emitted as
the **literal** declaration of `d`, never escaped, escaping it would corrupt the
very declaration a reader depends on, followed by any characters the modeled
declaration carried beyond the three a reader takes its roles from. Those surplus
characters are kept unless the surplus could not be read back as surplus, when
**all** of it is dropped: that covers a surplus carrying the field delimiter or
any control character, and it is silent, because emit has no warning channel.
Manufacturer
(`M`) and scientific (`S`) records are reproduced **byte-identically** from their
preserved `rawLine` when they are already in `d`, and re-encoded from their fields
when they are not, so their fields never collapse into one on the next read.

#### Parameters

##### record

[`AstmRecord`](#astmrecord)

The record to serialize.

##### d?

[`Delimiters`](#delimiters-2) = `CANONICAL_DELIMITERS`

The delimiters to emit against; defaults to `H|\^&`.

#### Returns

`string`

The record's wire text, terminator excluded.

#### Throws

[AstmSerializeError](#astmserializeerror) when a component contains an unencodable `CR`/`LF`
  (`ASTM_EMIT_UNENCODABLE_VALUE`), when `d` fails one of the three conditions
  readback requires (`ASTM_EMIT_INVALID_DELIMITERS`), or when this record's type
  letter would not be the first character of its own emitted line
  (`ASTM_EMIT_TYPE_LETTER_COLLISION`), which would make it read back as a
  different record. That last one is a transcoding condition and needs no `d`
  argument to fire: a record read under a different delimiter set can carry a
  type letter the canonical set escapes away.

#### Example

```ts
import { serializeAstmRecord, parseAstmRecords } from "@cosyte/astm";
const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
serializeAstmRecord(msg.records[1]!); // "R|1|^^^687|28.6|U/L||N||F"
```

***

### serializeAstmRecords()

> **serializeAstmRecords**(`input`, `d?`): `string`

Serialize a whole ASTM message (or a bare record list) to a spec-clean,
`CR`-terminated record stream: the inverse of `parseAstmRecords`.

Emit is **conservative**: the canonical `H|\^&` delimiters, every embedded
delimiter re-escaped, each record closed with a `CR`. A message parsed with
non-canonical delimiters is **normalized** to the canonical set on emit: every
record, `M` and `S` included, so the emitted stream is in one delimiter set and
re-parsing it recovers every field. Passing `d` explicitly emits against that set
instead, and the header declares it. Normalization replaces the four delimiter
**roles**; a header declaration carrying characters beyond the three that hold a
role keeps them, on this path as on any other, rather than being truncated. The
exception is a surplus that could not be read back as one, carrying the field
delimiter or any control character: there the **whole** surplus is dropped, on
every path including the default one, and silently, because emit returns a bare
string with no channel to say so.

**`d` is checked before anything is written.** Each of the four separators must be
exactly one character, none may be a record terminator, and no two may share a
character: otherwise the emitted bytes cannot be read back as the records that
produced them, and emit has no warning channel with which to say so. A set that
fails is an [AstmSerializeError](#astmserializeerror) with code `ASTM_EMIT_INVALID_DELIMITERS`.
This is stricter than the parser, which reads some sets it cannot reverse, so
`serializeAstmRecords(msg, msg.delimiters)` can refuse a message that parsed:
in exactly the cases where it used to emit a stream that read back wrong.

**And each record is checked against the set it is being written with.** Those
three conditions read the set alone, so they cannot see that `field` = `R`
escapes an `R` record's own type letter away. Every record's emitted line is
therefore checked to start with the letter the record models, and one that does
not is `ASTM_EMIT_TYPE_LETTER_COLLISION` rather than a stream that reads back as
different records. What neither check promises is that every *field* lands where
it did: an escape sequence whose body is an unrecognized character that is itself a delimiter in
force is an opaque atom, so that
delimiter never becomes a boundary, and the parse side reports that
(`ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`, plus the tolerable
`ASTM_UNKNOWN_ESCAPE_SEQUENCE`) rather than emit refusing it. The mirror case, where a sequence
ends where another could have begun so a delimiter splits that the competing alignment would
have held, is reported the same way (`ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT`). Emitting
normalizes both away rather than preserving them, so neither reaches a second generation.

#### Parameters

##### input

[`AstmMessage`](#astmmessage) \| readonly [`AstmRecord`](#astmrecord)[]

A parsed [AstmMessage](#astmmessage) or a list of [AstmRecord](#astmrecord)s.

##### d?

[`Delimiters`](#delimiters-2) = `CANONICAL_DELIMITERS`

The delimiters to emit against; defaults to the canonical `H|\^&` set.

#### Returns

`string`

The serialized record stream (`CR` after every record).

#### Throws

[AstmSerializeError](#astmserializeerror) when a component contains an unencodable `CR`/`LF`
  (`ASTM_EMIT_UNENCODABLE_VALUE`), when `d` fails one of the three conditions
  readback requires (`ASTM_EMIT_INVALID_DELIMITERS`), or when a record's type
  letter would not be the first character of its own emitted line
  (`ASTM_EMIT_TYPE_LETTER_COLLISION`). The last of the three fires on the
  **default** canonical path as well: it compares each record against the set
  being emitted with, so a record read under a different set can carry a type
  letter the canonical set escapes away. Omitting `d` is not a way around it.

#### Example

```ts
import { parseAstmRecords, serializeAstmRecords } from "@cosyte/astm";
const raw = "H|\\^&\rP|1\rR|1|^^^687|28.6|U/L||N||F\rL|1\r";
serializeAstmRecords(parseAstmRecords(raw)); // === raw
```

***

### serializeField()

> **serializeField**(`field`, `d?`): `string`

Serialize a single [AstmField](#astmfield) to its spec-clean wire text, re-escaping
each component. A low-level helper for callers assembling a field outside a
whole record.

#### Parameters

##### field

[`AstmField`](#astmfield)

The field to serialize.

##### d?

[`Delimiters`](#delimiters-2) = `CANONICAL_DELIMITERS`

The delimiters to emit against; defaults to `H|\^&`.

#### Returns

`string`

The escaped field text.

#### Throws

[AstmSerializeError](#astmserializeerror) when a component contains an unencodable `CR`/`LF`
  (`ASTM_EMIT_UNENCODABLE_VALUE`), or when `d` fails one of the three conditions
  readback requires (`ASTM_EMIT_INVALID_DELIMITERS`). Like
  [encodeComponent](#encodecomponent) this takes no record, so it never raises
  `ASTM_EMIT_TYPE_LETTER_COLLISION`: encoding a record's type-letter field
  through it will escape that letter away without objecting.

#### Example

```ts
import { serializeField, tokenizeRecord, CANONICAL_DELIMITERS } from "@cosyte/astm";
const fields = tokenizeRecord("R|1|^^^687|1&S&40", CANONICAL_DELIMITERS);
serializeField(fields[3]!); // "1&S&40"
```

***

### serializeFramedAstm()

> **serializeFramedAstm**(`input`, `options?`): `Uint8Array`

Serialize an ASTM message (or a bare record list) and frame it into a spec-clean
byte stream in one call: the inverse of [parseFramedAstm](#parseframedastm), composing the
two emit layers at the edge.

Each record is serialized to spec-clean, `CR`-terminated wire text (canonical
delimiters, embedded delimiters re-escaped) and then framed **independently**
(one record per `ETX`-closed frame run), so the framing exactly mirrors what
[decodeAstmFrames](#decodeastmframes) reassembles: `parseFramedAstm(serializeFramedAstm(msg))`
yields an equal message **with the default `startFrameNumber`**. That clause is
load-bearing rather than pedantic: a non-default start writes a continuation of
a sequence already in progress, and a continuation read on its own opens on a
sequence gap, so the decoder does not emit its first record and this round trip
does not hold for it. See [ComposeFramesOptions](#composeframesoptions).

A value carrying a character above `U+00FF` is **refused** here rather than
framed: the record layer is happy to hold one, but a frame carries bytes and
nothing in the message says which character encoding to turn it into.

A value carrying a raw `STX`, `ETB` or `ETX` is refused too, and being Latin-1
is no exemption: those three are what [decodeAstmFrames](#decodeastmframes) reads as the
shape of a frame, and framing has no escape sequence to hide one behind. The
record layer is happy to hold those as well, so this is a message that
serializes to records perfectly well and cannot be framed.

#### Parameters

##### input

[`AstmMessage`](#astmmessage) \| readonly [`AstmRecord`](#astmrecord)[]

A parsed [AstmMessage](#astmmessage) or a list of [AstmRecord](#astmrecord)s.

##### options?

[`ComposeFramesOptions`](#composeframesoptions) = `{}`

Frame-encode options.

#### Returns

`Uint8Array`

The framed byte stream.

#### Throws

[AstmSerializeError](#astmserializeerror) when a value contains an unencodable `CR`/`LF`
  (`ASTM_EMIT_UNENCODABLE_VALUE`), or when a record's own type letter would not
  survive being written in the canonical set this function serializes with
  (`ASTM_EMIT_TYPE_LETTER_COLLISION`). The second reaches messages parsed under a
  **different** delimiter set, since this function passes no set of its own.

#### Throws

[AstmFrameEncodeError](#astmframeencodeerror) when `options.startFrameNumber` is not a
  whole number from `0` to `7` (`ASTM_FRAME_INVALID_START_FRAME_NUMBER`), there
  are no records to frame (`ASTM_FRAME_EMPTY_RECORD`), a value holds a
  character above `U+00FF` (`ASTM_FRAME_UNENCODABLE_CHARACTER`), or a record
  holds an `STX`, `ETB` or `ETX` byte (`ASTM_FRAME_RESERVED_BYTE`).

#### Example

```ts
import { parseAstmRecords, serializeFramedAstm, parseFramedAstm } from "@cosyte/astm";
const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
const bytes = serializeFramedAstm(msg);
parseFramedAstm(bytes).message.records.length; // 3
```

***

### setDefaultAstmProfile()

> **setDefaultAstmProfile**(`profile`): `void`

Register a process-scoped default profile that `parseAstmRecords(raw)` applies
when no explicit `profile` option is passed. Pass `null` (or `undefined`) to
clear. An explicit `parseAstmRecords(raw, { profile })` always wins;
`{ profile: null }` opts out of the default for a single call.

**Test hygiene:** the only mutable module-scoped state here, tests that call this
MUST clear it in teardown or default-profile bleed infects later tests.

#### Parameters

##### profile

[`AstmProfile`](#astmprofile) \| `null`

The profile to register as default, or `null` to clear.

#### Returns

`void`

#### Example

```ts
import { setDefaultAstmProfile, astmProfiles, parseAstmRecords } from "@cosyte/astm";
setDefaultAstmProfile(astmProfiles.referenceCorpus);
const msg = parseAstmRecords(raw); // uses referenceCorpus
setDefaultAstmProfile(null); // clear
```

***

### splitEscapeAware()

> **splitEscapeAware**(`text`, `delimiter`, `escape`, `onAmbiguousAlignment?`, `onShiftedFields?`, `onTruncatedField?`, `onShiftedComponents?`): `string`[]

Split `text` on `delimiter`, treating an escape sequence (escape, one body
character, escape) as an opaque atom so a delimiter that appears *inside* an
escape body never causes a split. Returns the raw (still-encoded) segments:
decoding is the caller's next step, per the escape-aware-split-then-decode
contract.

For the four canonical mnemonics the opacity is belt-and-suspenders (their
bodies are letters, not delimiters), but it makes the "an escaped delimiter is
one token" guarantee hold for any declared delimiter set, including adversarial
input. A single body character is all that guarantee needs.

An escape character that heads no sequence is **not** an escape: it is ordinary
text, and it opens no atom. Reading it as the opening of a sequence that never
closes is what used to merge the whole remainder of a record into one field.
Decoding the resulting leaf is what reports it, so this function stays a pure
split. Note the two rules together: a delimiter after such a character does
split, and a delimiter sitting inside a real three-character atom does not. The
second of those is reported, from the decode step rather than from here,
whenever the atom's body was not a recognized mnemonic.

**Atoms are matched greedily, leftmost first, and where that choice decides a
boundary it is reported from here.** The escape character closing one triple
cannot also open the next, so `28.6&Z&|&U/L` is read as the atom `&Z&`, then a
field separator that splits, and not as `&Z`, then the atom `&|&` whose field
separator would not have split. Both alignments are in the bytes and they
disagree by one boundary. The reading is **not** changed (that would only pick
the other alignment, with no more evidence for it); it is reported through
`onAmbiguousAlignment`, and only where the earlier body was unrecognized, since
a recognized mnemonic is a construct this codec can interpret and the
competitor's body usually is not. That exclusion is wider than that argument:
see [AmbiguousAlignmentSink](#ambiguousalignmentsink).

#### Parameters

##### text

`string`

The field or repeat string to split.

##### delimiter

`string`

The delimiter to split on.

##### escape

`string`

The active escape character.

##### onAmbiguousAlignment?

[`AmbiguousAlignmentSink`](#ambiguousalignmentsink)

Called once per unrecognized escape sequence whose
  closing escape character could instead have opened a sequence holding this
  delimiter, so the boundary taken here is not the only reading of the bytes.

##### onShiftedFields?

[`ShiftedFieldsSink`](#shiftedfieldssink)

Called once per contested boundary where the escape
  character this reading resumes on heads no sequence this codec can *interpret*
  (none at all, or one whose body is not a recognized mnemonic), so the boundary
  was bought with bytes the reading cannot read. Wired only by the split taken on
  the field separator: see [ShiftedFieldsSink](#shiftedfieldssink) for why, and for the one tail
  it deliberately does not report.

##### onTruncatedField?

[`TruncatedFieldSink`](#truncatedfieldsink)

Called on that same condition, wired only by the split
  taken on the repeat separator, where the cost is not a shift. **What it is, its
  two index bounds and the one class in which nothing moves index are stated in
  [TruncatedFieldSink](#truncatedfieldsink) and not restated here.**

##### onShiftedComponents?

[`ShiftedComponentsSink`](#shiftedcomponentssink)

Called on that same condition again, wired only by the
  split taken on the component separator, where nothing shifts between fields and
  nothing leaves the record. **What the boundary costs, its three index bounds and
  the one class in which nothing moves index are stated in
  [ShiftedComponentsSink](#shiftedcomponentssink) and not restated here.**

#### Returns

`string`[]

The raw segments, in order.

#### Example

```ts
import { splitEscapeAware } from "@cosyte/astm";
splitEscapeAware("a^b^c", "^", "&"); // ["a", "b", "c"]
splitEscapeAware("1&S&40", "^", "&"); // ["1&S&40"]  (escape body is opaque)
splitEscapeAware("O&Brien^John", "^", "&"); // ["O&Brien", "John"]  (unpaired: literal)
```

***

### toChecksumHex()

> **toChecksumHex**(`checksum`): `string`

Format a checksum byte as the two **uppercase** hex characters ASTM puts on the
wire (the conservative-emit form). Decode accepts lowercase; emit is uppercase.

#### Parameters

##### checksum

`number`

A value in `0` to `255`.

#### Returns

`string`

Two uppercase hex characters, zero-padded (e.g. `"0A"`, `"75"`).

#### Example

```ts
import { toChecksumHex } from "@cosyte/astm";
toChecksumHex(0x0a); // "0A"
```

***

### toDate()

> **toDate**(`value`, `options?`): `Date` \| `undefined`

Convert a parsed ASTM date to an absolute-instant JS `Date`, **only** when the
caller has made the zone determinate.

ASTM carries no timezone, so `toDate` returns `undefined` unless
`options.assumeOffsetMinutes` says which zone the instrument was in. The host
machine's zone is never read and UTC is never assumed. A value stating no year
is never an instant either, and neither is one whose components are not a real
calendar date: month 13 becomes January of the next year in a JS `Date`, and
that silent roll-over is the reason the range is checked before the instant is
built rather than after.

An `assumeOffsetMinutes` that names no usable zone is refused the same way,
with `undefined`: one that is not a finite number (`NaN`, either infinity),
and one so large that applying it puts the result outside the range a JS
`Date` represents. **The answer is never an `Invalid Date`.** Such a `Date`
satisfies this signature and defeats it, because a caller cannot tell it from
a real instant without testing `getTime()` for `NaN`, and `toISOString()` on
it throws.

Components below the stated precision fill to their lowest legal value (month
and day to 1, time to 0) **for instant construction only**: the value itself is
unchanged, and [toObject](#toobject) and [toISO](#toiso) report exactly what they
reported before the call.

#### Parameters

##### value

[`AstmDate`](#astmdate) \| `null` \| `undefined`

A parsed date, or the `undefined` [parseAstmDate](#parseastmdate) returns.

##### options?

[`ToDateOptions`](#todateoptions)

The zone assumption to apply, as signed minutes east of UTC.

#### Returns

`Date` \| `undefined`

The instant, or `undefined` when the zone or the year is unstated.

#### Example

```ts
import { parseAstmDate, toDate } from "@cosyte/astm";
const d = parseAstmDate("20240315");
toDate(d);                              // undefined: no zone was stated
toDate(d, { assumeOffsetMinutes: -300 }); // 2024-03-15T05:00:00.000Z
toDate(parseAstmDate("19881301"), { assumeOffsetMinutes: 0 }); // undefined, not 1989
```

***

### toISO()

> **toISO**(`value`): `string` \| `undefined`

Render a parsed ASTM date as ISO-8601, truncated to the precision it stated
and **never** padded out to a precision it did not.

No `Z` and no offset is ever appended, because ASTM states none and appending
one would fabricate the instrument's zone. The string is deliberately
zone-less. It is identical to what [astmDateToLocalISO](#astmdatetolocaliso) returns for every
value [parseAstmDate](#parseastmdate) produces **whose components are a real calendar
date**; the shared name is the portable route and the repo-native name is
unchanged. On a run that is not, the two differ on purpose and only in one
direction: `astmDateToLocalISO` still renders the digits it was given
(`"1988-13-01"`), because that is its pinned behaviour, and `toISO` answers
`undefined` rather than emit a string no ISO-8601 reader accepts.

Returns `undefined` for `undefined`, for `null`, for a value stating no
component, for one whose components are not a real calendar date, and for one
stating no year: an ASTM timestamp opens with a mandatory four-digit year, so a
yearless value is not one this parser reads. Never throws.

#### Parameters

##### value

[`AstmDate`](#astmdate) \| `null` \| `undefined`

A parsed date, or the `undefined` [parseAstmDate](#parseastmdate) returns.

#### Returns

`string` \| `undefined`

e.g. `"2024-03-15T09:30"` (minute precision) or `"2024-03"` (month).

#### Example

```ts
import { parseAstmDate, toISO } from "@cosyte/astm";
toISO(parseAstmDate("202403150930")); // "2024-03-15T09:30"
toISO(parseAstmDate("not a date"));   // undefined
toISO(parseAstmDate("20240230"));     // undefined: February has no 30th
```

***

### tokenizeHeader()

> **tokenizeHeader**(`record`, `d`, `onUnknownEscape?`, `onUnpairedEscape?`, `onSwallowedDelimiter?`, `onAmbiguousAlignment?`, `onAlignmentShiftedFields?`, `onAlignmentTruncatedField?`, `onAlignmentShiftedComponents?`): [`AstmField`](#astmfield)[]

Tokenize an `H` (header) record into its fields.

A header cannot go through [tokenizeRecord](#tokenizerecord): its second field is the
**delimiter declaration**, which carries all three non-field delimiters
*literally* rather than as escape sequences. Run through the generic tokenizer
the declaration would be split on its own repeat and component characters and
its escape character would be decoded and reported as unpaired, so what the
header declares would come back as fragments plus a spurious warning. This
tokenizer instead takes the declaration verbatim as one opaque field, never
decoded, and applies the ordinary escape-aware tokenizer to the data portion
that follows it.

`fields[0]` is the type-letter field and `fields[1]` is the delimiter
declaration (verbatim, never escape-decoded); the header's ASTM data fields
follow from `fields[2]`.

#### Parameters

##### record

`string`

The raw `H` record text (terminator already stripped).

##### d

[`Delimiters`](#delimiters-2)

The delimiters declared by this header.

##### onUnknownEscape?

(`fieldIndex`) => `void`

Called with the 0-based whole-record field index for
  each unrecognized escape sequence in the data portion.

##### onUnpairedEscape?

(`fieldIndex`) => `void`

Called with the 0-based whole-record field index for
  each unpaired escape character in the data portion. The declaration itself is
  opaque, so the escape character it names never reports here.

##### onSwallowedDelimiter?

(`fieldIndex`) => `void`

Called with the 0-based whole-record field index
  for each unrecognized escape sequence in the data portion whose body is a
  splitting delimiter in force. The declaration is opaque, so the delimiters it
  names literally never report here.

##### onAmbiguousAlignment?

(`fieldIndex`) => `void`

Called with the 0-based whole-record field index for
  each competing escape alignment in the data portion. The declaration is opaque,
  so the characters it names literally never report here either.

##### onAlignmentShiftedFields?

(`fieldIndex`) => `void`

Called with the 0-based whole-record field index
  for each contested field boundary in the data portion whose reading resumes on an
  escape character heading no sequence this codec can interpret. The declaration is
  opaque, so it never reports here either.

##### onAlignmentTruncatedField?

(`fieldIndex`) => `void`

Called with the 0-based whole-record field index
  for each contested **repeat** boundary in the data portion on that same tail
  test. The declaration is opaque, so it never reports here either.

##### onAlignmentShiftedComponents?

(`fieldIndex`) => `void`

Called with the 0-based whole-record field index for each
  contested **component** boundary in the data portion on that same tail test. The declaration is
  opaque, so it never reports here either.

#### Returns

[`AstmField`](#astmfield)[]

The header's fields.

#### Example

```ts
import { tokenizeHeader, CANONICAL_DELIMITERS } from "@cosyte/astm";
const fields = tokenizeHeader("H|\\^&|||sender", CANONICAL_DELIMITERS);
fields[1].raw; // "\\^&"
fields[4].raw; // "sender"
```

***

### tokenizeRecord()

> **tokenizeRecord**(`record`, `d`, `onUnknownEscape?`, `onUnpairedEscape?`, `onSwallowedDelimiter?`, `onAmbiguousAlignment?`, `onAlignmentShiftedFields?`, `onAlignmentTruncatedField?`, `onAlignmentShiftedComponents?`): [`AstmField`](#astmfield)[]

Tokenize a single record string (its terminator already stripped) into its
fields. `fields[0]` is the type-letter field; ASTM data fields follow at
1-based indices.

#### Parameters

##### record

`string`

The raw record text.

##### d

[`Delimiters`](#delimiters-2)

The delimiters resolved from the header.

##### onUnknownEscape?

(`fieldIndex`) => `void`

Called (with the 0-based field index) for each
  unrecognized escape sequence encountered, so the caller can warn.

##### onUnpairedEscape?

(`fieldIndex`) => `void`

Called (with the 0-based field index) for each escape
  character that heads no escape sequence and was therefore read as a literal.

##### onSwallowedDelimiter?

(`fieldIndex`) => `void`

Called (with the 0-based field index) for each
  unrecognized escape sequence whose body is a splitting delimiter in force, so
  that delimiter never became a boundary.

##### onAmbiguousAlignment?

(`fieldIndex`) => `void`

Called (with the 0-based field index) for each
  unrecognized escape sequence whose closing escape character could instead have
  opened one holding the delimiter that split, so the boundary is one of two
  readings the bytes carry.

##### onAlignmentShiftedFields?

(`fieldIndex`) => `void`

Called (with the 0-based field index) for each
  contested **field** boundary the reading took while resuming on an escape
  character that heads no sequence this codec can interpret. Wired only to the field split: a
  repeat or component boundary divides one field and so moves no field-indexed
  slot. That is a choice and not a consequence, because components are modeled
  inside a field. **What the boundary costs, and the one class in which nothing
  moves index, are stated in [ShiftedFieldsSink](#shiftedfieldssink) and not restated here.**

##### onAlignmentTruncatedField?

(`fieldIndex`) => `void`

Called (with the 0-based field index) for that
  same condition on the **repeat** split, where no field-indexed slot moves.
  **What the boundary costs, its two index bounds and the one class in which nothing
  moves index are stated in [TruncatedFieldSink](#truncatedfieldsink) and not restated here.**

##### onAlignmentShiftedComponents?

(`fieldIndex`) => `void`

Called (with the 0-based field index) for that same
  condition on the **component** split, where no field-indexed slot moves and nothing leaves the
  record. **What the boundary costs, its three index bounds and the one class in which nothing
  moves index are stated in [ShiftedComponentsSink](#shiftedcomponentssink) and not restated here.** All three
  splitting roles are wired now.

#### Returns

[`AstmField`](#astmfield)[]

The record's fields.

#### Example

```ts
import { tokenizeRecord, CANONICAL_DELIMITERS } from "@cosyte/astm";
const fields = tokenizeRecord("R|1|^^^687|28.6|U/L", CANONICAL_DELIMITERS);
fields[3].components[0]; // "28.6"
```

***

### toObject()

> **toObject**(`value`): [`DateParts`](#dateparts) \| `undefined`

Read a parsed ASTM date as the shared [DateParts](#dateparts) object: only the
components the value stated, frozen, with a spec-native 1-to-12 month.

Returns `undefined` for `undefined`, for `null`, for a value that stated no
component at all, and for one whose stated components are not a real calendar
date (a month outside 1 to 12, a day past the end of that month, an hour past
23, a minute or second past 59). Never throws, whatever it is handed. The
truncation flag, the precision and the raw digit run are deliberately not
carried over: a dangling half-component was never a complete component, so it
appears in no field here.

The out-of-range refusal is total, not per component: `"19881301"` answers
`undefined`, not `{ year: 1988 }`, because a year-precision date of birth is
not what that instrument sent either.

#### Parameters

##### value

[`AstmDate`](#astmdate) \| `null` \| `undefined`

A parsed date, or the `undefined` [parseAstmDate](#parseastmdate) returns.

#### Returns

[`DateParts`](#dateparts) \| `undefined`

The stated components, frozen, or `undefined`.

#### Example

```ts
import { parseAstmDate, toObject } from "@cosyte/astm";
toObject(parseAstmDate("20240315")); // { year: 2024, month: 3, day: 15 }
Object.keys(toObject(parseAstmDate("2024")) ?? {}); // ["year"]
toObject(parseAstmDate("19881301")); // undefined: there is no month 13
```

***

### undefinedAbnormalFlag()

> **undefinedAbnormalFlag**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG` warning. The flag is surfaced as
`undefined` (never coerced to `normal`); the warning carries only the position
and fixed prose naming the **same** vocabulary the interpreted flag reports,
read from the one shared constant so the two cannot drift apart.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { undefinedAbnormalFlag } from "@cosyte/astm";
undefinedAbnormalFlag({ recordIndex: 4, recordType: "R", fieldIndex: 7 });
```

***

### undefinedResultStatus()

> **undefinedResultStatus**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_RECORD_UNDEFINED_RESULT_STATUS` warning. The status is surfaced
as `undefined` and, like every non-final status, never reads as active-final.
The message carries the **same** attribution the interpreted status reports
(there is no citable source for this letter set), from the one shared constant.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { undefinedResultStatus } from "@cosyte/astm";
undefinedResultStatus({ recordIndex: 4, recordType: "R", fieldIndex: 9 });
```

***

### uninterpretedQueryStatus()

> **uninterpretedQueryStatus**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_RECORD_UNINTERPRETED_QUERY_STATUS` warning. Emitted when a `Q`
record carries a request-information status code; the code set is paywalled, so
the status is surfaced verbatim and never mapped to a guessed meaning.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { uninterpretedQueryStatus } from "@cosyte/astm";
uninterpretedQueryStatus({ recordIndex: 2, recordType: "Q", fieldIndex: 13 });
```

***

### unitsAbsent()

> **unitsAbsent**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_RECORD_UNITS_ABSENT` warning. Emitted when a result carries a
numeric value but no units; units are never defaulted, guessed, or converted.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { unitsAbsent } from "@cosyte/astm";
unitsAbsent({ recordIndex: 4, recordType: "R", fieldIndex: 5 });
```

***

### unknownEscapeSequence()

> **unknownEscapeSequence**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_UNKNOWN_ESCAPE_SEQUENCE` warning. The sequence is preserved
verbatim in the decoded value; the warning body carries neither the sequence
nor its surrounding text.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { unknownEscapeSequence } from "@cosyte/astm";
unknownEscapeSequence({ recordIndex: 4, recordType: "R", fieldIndex: 4 });
```

***

### unknownRecordType()

> **unknownRecordType**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_RECORD_UNKNOWN_TYPE` warning. The record is still surfaced (as
an unsupported record), never dropped.

**This one is not cosmetic.** Message grouping decides where a message starts by
reading each record's type letter, so an unrecognized letter may be a header the
reader failed to see, and two messages then read as one. A profile is therefore
not permitted to tolerate this code.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { unknownRecordType } from "@cosyte/astm";
unknownRecordType({ recordIndex: 3, recordType: "Z" });
```

***

### unpairedEscapeCharacter()

> **unpairedEscapeCharacter**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_UNPAIRED_ESCAPE_CHARACTER` warning. The character is preserved
verbatim as a literal in the decoded value and opens no atom, so it does not
merge the rest of the record; the warning body carries neither the character's
surroundings nor any field value.

**It is a statement about that one character, not about the record.** A
different escape character in the same record may head a real three-character
sequence, and if that sequence's body is an unrecognized character that is itself a delimiter in
force, that delimiter does not
split, which is reported separately by
[WARNING\_CODES.ASTM\_RECORD\_DELIMITER\_SWALLOWED\_BY\_ESCAPE](#astm_record_delimiter_swallowed_by_escape).

A profile **may** tolerate this code: the value it reports is byte-identical
with the warning and without it, because reading the character as a literal is
the parse, not a consequence of the warning.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { unpairedEscapeCharacter } from "@cosyte/astm";
unpairedEscapeCharacter({ recordIndex: 4, recordType: "R", fieldIndex: 4 });
```

***

### unparseableReferenceRange()

> **unparseableReferenceRange**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE` warning. The range text is
surfaced verbatim as `unparsed`; no bound is fabricated.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { unparseableReferenceRange } from "@cosyte/astm";
unparseableReferenceRange({ recordIndex: 4, recordType: "R", fieldIndex: 6 });
```

***

### unreadableRedeclaration()

> **unreadableRedeclaration**(`position`): [`AstmRecordWarning`](#astmrecordwarning)

Build an `ASTM_RECORD_UNREADABLE_REDECLARATION` warning. Emitted when a later
`H` record cannot declare a usable delimiter set; the set already in force is
kept and every record is still surfaced.

#### Parameters

##### position

[`AstmPosition`](#astmposition)

#### Returns

[`AstmRecordWarning`](#astmrecordwarning)

#### Example

```ts
import { unreadableRedeclaration } from "@cosyte/astm";
unreadableRedeclaration({ recordIndex: 2, recordType: "H" });
```
