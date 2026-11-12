---
id: receive-results-from-an-analyzer
title: Receive results from an analyzer
sidebar_label: Receive results from an analyzer
description: "A tutorial: take a framed transfer from an analyzer through the protocol receiver, answer each frame, and read the results it carried."
---

# Receive results from an analyzer

In this tutorial we receive one result upload the way a laboratory information system does: the
analyzer opens a transfer, sends its records in frames, and closes the transfer; we answer each
step, collect the records, and read the result. We play the analyzer too, so everything runs on one
machine with no instrument and no connection.

You need `@cosyte/astm` installed ([Installation](./installation.md)) and a way to run TypeScript,
such as `npx tsx file.ts`. Each step is a complete program that repeats what the steps before it
built, so you can run any one of them on its own.

## Step 1: make the bytes the analyzer sends

An analyzer sends each record in a frame: a start byte, a frame number, the record text, an end
byte, a checksum and a line end. We make those bytes with `composeAstmFrames`, standing in for the
analyzer: a header, a patient, one result and a terminator, all synthetic.

```ts runnable
import { composeAstmFrames, detectFraming } from "@cosyte/astm";

const wire = composeAstmFrames([
  "H|\\^&|||analyzer^1\r",
  "P|1|PRAC-0001|LAB-0009\r",
  "R|1|^^^687|28.6|U/L|10-40|N||F\r",
  "L|1|N\r",
]);

wire[0]; // => 0x02
detectFraming(wire).framing; // => "framed"
```

The first byte is `STX` (`0x02`), the start of a frame. `detectFraming` reads that leading byte and
tells us the stream is framed. Some analyzers send bare records over TCP instead, with no frames;
[Decode a framed byte stream](./decode-framed-streams.md) shows how to tell the two apart.

## Step 2: decode the frames

`decodeAstmFrames` splits the bytes into frames, checks each checksum and frame number, and returns
the record bytes the frames carried:

```ts runnable
import { composeAstmFrames, decodeAstmFrames } from "@cosyte/astm";

const wire = composeAstmFrames([
  "H|\\^&|||analyzer^1\r",
  "P|1|PRAC-0001|LAB-0009\r",
  "R|1|^^^687|28.6|U/L|10-40|N||F\r",
  "L|1|N\r",
]);

const { frames, records, warnings } = decodeAstmFrames(wire);

frames.map((f) => f.frameNumber); // => [1, 2, 3, 4]
frames.every((f) => f.checksum.valid && f.trusted); // => true
records.length; // => 4
warnings; // => []
```

On a real connection the frames arrive one at a time, and the receiver has to answer each one before
the analyzer sends the next. That is the next step.

## Step 3: answer the analyzer with the protocol receiver

The transfer has three phases. The analyzer sends `ENQ` to ask to send, then the frames, then `EOT`
when it is done. The receiver answers `ENQ` and each good frame with `ACK`. `ltpReduce` decides those
answers: we give it the current state and what arrived, and it returns the new state and the actions
to take. It never touches a connection itself, so the program below writes the answers into a list
where a real one would write them to the serial port or socket.

```ts runnable
import {
  composeAstmFrames,
  decodeAstmFrames,
  ltpInitialState,
  ltpReduce,
  type LtpEvent,
} from "@cosyte/astm";

const wire = composeAstmFrames([
  "H|\\^&|||analyzer^1\r",
  "P|1|PRAC-0001|LAB-0009\r",
  "R|1|^^^687|28.6|U/L|10-40|N||F\r",
  "L|1|N\r",
]);
const { frames } = decodeAstmFrames(wire);

// What arrives, in order: ENQ, each frame, EOT.
const events: LtpEvent[] = [
  { type: "enq" },
  ...frames.map((frame): LtpEvent => ({ type: "frame", frame })),
  { type: "eot" },
];

let state = ltpInitialState();
const answers: string[] = [];
const delivered: Uint8Array[] = [];
for (const event of events) {
  const step = ltpReduce(state, event);
  state = step.state;
  for (const action of step.actions) {
    if (action.type === "deliverRecord") delivered.push(action.record);
    else answers.push(action.type);
  }
}

answers; // => ["sendAck", "sendAck", "sendAck", "sendAck", "sendAck"]
delivered.length; // => 4
state.phase; // => "neutral"
```

Five acknowledgements: one for `ENQ` and one for each of the four frames. Each accepted frame also
produced a `deliverRecord` action carrying a complete record. After `EOT` the receiver is back in its
neutral phase, ready for the next transfer.

## Step 4: see a damaged frame refused

Lines are noisy. Here the result frame arrives with one byte changed, so its checksum no longer
matches. The receiver answers `NAK` instead of `ACK`, keeps nothing from that frame, and waits for
the analyzer to send it again:

```ts runnable
import {
  composeAstmFrames,
  decodeAstmFrames,
  ltpInitialState,
  ltpReduce,
  type AstmFrame,
  type LtpEvent,
} from "@cosyte/astm";

const wire = composeAstmFrames([
  "H|\\^&|||analyzer^1\r",
  "P|1|PRAC-0001|LAB-0009\r",
  "R|1|^^^687|28.6|U/L|10-40|N||F\r",
  "L|1|N\r",
]);
const good = decodeAstmFrames(wire).frames;

// The same bytes with "28.6" changed to "38.6" on the way.
const damagedWire = wire.slice();
damagedWire[new TextDecoder("latin1").decode(wire).indexOf("28.6")] = 0x33;
const damaged = decodeAstmFrames(damagedWire).frames[2];

function arrived(frame: AstmFrame | undefined): LtpEvent {
  if (frame === undefined) throw new Error("no such frame");
  return { type: "frame", frame };
}

const events: LtpEvent[] = [
  { type: "enq" },
  arrived(good[0]),
  arrived(good[1]),
  arrived(damaged),
  arrived(good[2]), // the analyzer sends the result frame again after our NAK
  arrived(good[3]),
  { type: "eot" },
];

let state = ltpInitialState();
const answers: string[] = [];
const codes: string[] = [];
for (const event of events) {
  const step = ltpReduce(state, event);
  state = step.state;
  for (const action of step.actions) {
    if (action.type !== "deliverRecord") answers.push(action.type);
  }
  for (const warning of step.warnings) codes.push(warning.code);
}

damaged?.trusted; // => false
answers; // => ["sendAck", "sendAck", "sendAck", "sendNak", "sendAck", "sendAck"]
codes; // => ["ASTM_LTP_FRAME_REJECTED"]
```

The receiver never answers `ACK` to a frame the decoder did not trust, and never adds that frame's
text to a record. The `ASTM_LTP_FRAME_REJECTED` warning says a frame was refused; like every warning
here, it carries no record content.

## Step 5: read the results

The delivered records are the record stream. We join them, parse them, and read each message the
stream carried:

```ts runnable
import {
  composeAstmFrames,
  decodeAstmFrames,
  ltpInitialState,
  ltpReduce,
  messages,
  parseAstmRecords,
  type LtpEvent,
} from "@cosyte/astm";

const wire = composeAstmFrames([
  "H|\\^&|||analyzer^1\r",
  "P|1|PRAC-0001|LAB-0009\r",
  "R|1|^^^687|28.6|U/L|10-40|N||F\r",
  "L|1|N\r",
]);
const events: LtpEvent[] = [
  { type: "enq" },
  ...decodeAstmFrames(wire).frames.map((frame): LtpEvent => ({ type: "frame", frame })),
  { type: "eot" },
];

let state = ltpInitialState();
const delivered: Uint8Array[] = [];
for (const event of events) {
  const step = ltpReduce(state, event);
  state = step.state;
  for (const action of step.actions) {
    if (action.type === "deliverRecord") delivered.push(action.record);
  }
}

// Join the delivered records into one byte stream and parse it.
const stream = new Uint8Array(delivered.reduce((n, r) => n + r.length, 0));
let offset = 0;
for (const record of delivered) {
  stream.set(record, offset);
  offset += record.length;
}
const msg = parseAstmRecords(stream);

msg.warnings; // => []
messages(msg).length; // => 1
for (const m of messages(msg)) {
  // "PRAC-0001" is a synthetic patient ID: asserted, never printed.
  m.patient?.practiceAssignedId; // => "PRAC-0001"
  m.results[0]?.value; // => "28.6"
  m.results[0]?.units; // => "U/L"
  m.results[0]?.status.isActiveFinal; // => true
}
```

We read through `messages()` rather than the flat `results()` because one transfer can carry several
messages, each with its own patient. `messages()` keeps every result with the patient of the message
that carried it. [Read a stream that carries several messages](./read-several-messages.md) explains
why that matters.

## What we built

A receiver that answers the analyzer correctly, refuses a damaged frame, and reads the results only
from frames the decoder trusted. To put it on a real connection, read bytes from your serial port or
socket, decode each frame as it completes, feed `ltpReduce` the events, and write `ASTM_ACK` or
`ASTM_NAK` back for each `sendAck` or `sendNak` action. [Drive the LTP receiver over your own
connection](./drive-the-ltp-receiver.md) shows that loop, and the timers it leaves to you.

Next:

- [Read a result safely](./read-results.md): the status, flag and range of each result.
- [Handle warnings and fail fast](./handle-warnings.md): what to do with the warnings a parse
  returns.
- [The two-layer architecture](./architecture.md): why frames and records are separate layers.
