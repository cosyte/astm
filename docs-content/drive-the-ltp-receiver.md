---
id: drive-the-ltp-receiver
title: Drive the LTP receiver over your own connection
sidebar_label: Drive the LTP receiver
description: "Connect the pure ltpReduce receiver to bytes from your own serial port or socket, answer ACK or NAK, and collect complete records."
---

# Drive the LTP receiver over your own connection

`ltpReduce` decides what a receiver does next in the low-level transfer protocol (LTP), and does
nothing else: it reads no bytes, writes none, and keeps no timer. This page connects it to a byte
source and a byte sink you own, such as a serial port or a TCP socket.

## Turn bytes into events

The receiver takes four control events (`enq`, `ack`, `nak`, `eot`) and decoded frames. Outside a
frame, a control is one byte: `ASTM_ENQ`, `ASTM_ACK`, `ASTM_NAK` and `ASTM_EOT`. A frame runs from
`STX` (`0x02`) to the `ETB` (`0x17`) or `ETX` (`0x03`) that ends its text, then two checksum
characters, `CR` and `LF`. Collect each frame's bytes, then decode them with `decodeAstmFrames`.

## Answer each event

Feed each event to `ltpReduce`, keep the state it returns, and carry out its actions: write `ACK` for
`sendAck`, `NAK` for `sendNak`, and keep the record from `deliverRecord`. The program below does
that for bytes that arrive in arbitrary chunks. It stands in for your connection with a list of
chunks and a list of written bytes:

```ts runnable
import {
  ASTM_ACK,
  ASTM_ENQ,
  ASTM_EOT,
  ASTM_NAK,
  composeAstmFrames,
  decodeAstmFrames,
  ltpInitialState,
  ltpReduce,
  parseAstmRecords,
  results,
  type LtpEvent,
} from "@cosyte/astm";

const STX = 0x02;
const ETB = 0x17;
const ETX = 0x03;

/** Reads bytes as they arrive, answers through `write`, and keeps every delivered record. */
class Receiver {
  private state = ltpInitialState();
  private frame: number[] | undefined;
  private tail = -1;
  private readonly write: (bytes: Uint8Array) => void;
  readonly records: Uint8Array[] = [];

  constructor(write: (bytes: Uint8Array) => void) {
    this.write = write;
  }

  push(chunk: Uint8Array): void {
    for (const byte of chunk) {
      if (this.frame !== undefined) {
        this.frame.push(byte);
        if (this.tail > 0) this.tail -= 1;
        else if (this.tail < 0 && (byte === ETB || byte === ETX)) this.tail = 4;
        if (this.tail === 0) {
          const decoded = decodeAstmFrames(Uint8Array.from(this.frame)).frames[0];
          this.frame = undefined;
          this.tail = -1;
          if (decoded !== undefined) this.handle({ type: "frame", frame: decoded });
        }
      } else if (byte === STX) {
        this.frame = [byte];
      } else if (byte === ASTM_ENQ) this.handle({ type: "enq" });
      else if (byte === ASTM_EOT) this.handle({ type: "eot" });
      else if (byte === ASTM_ACK) this.handle({ type: "ack" });
      else if (byte === ASTM_NAK) this.handle({ type: "nak" });
    }
  }

  private handle(event: LtpEvent): void {
    const step = ltpReduce(this.state, event);
    this.state = step.state;
    for (const action of step.actions) {
      if (action.type === "sendAck") this.write(Uint8Array.of(ASTM_ACK));
      else if (action.type === "sendNak") this.write(Uint8Array.of(ASTM_NAK));
      else if (action.type === "deliverRecord") this.records.push(action.record);
    }
  }
}

// What the analyzer sends: ENQ, three frames, EOT, arriving in uneven chunks.
const frames = composeAstmFrames(["H|\\^&\r", "R|1|^^^687|28.6|U/L||N||F\r", "L|1\r"]);
const wire = Uint8Array.from([ASTM_ENQ, ...frames, ASTM_EOT]);

const written: number[] = [];
const receiver = new Receiver((bytes) => written.push(...bytes));
for (let i = 0; i < wire.length; i += 7) receiver.push(wire.subarray(i, i + 7));

written; // => [ASTM_ACK, ASTM_ACK, ASTM_ACK, ASTM_ACK]
receiver.records.length; // => 3

const text = receiver.records.map((r) => new TextDecoder("latin1").decode(r)).join("");
results(parseAstmRecords(text))[0]?.value; // => "28.6"
```

Decoded one at a time, a frame numbered anything but 1 also carries an `ASTM_FRAME_SEQUENCE_GAP`
warning from the decoder, which sees that frame alone. The receiver is what checks the order across
frames, so take the decision from `ltpReduce`.

## Rely on what the receiver refuses

- **A frame the decoder did not trust is answered `NAK`.** A bad checksum, a missing terminator or a
  frame out of sequence is never answered `ACK`, never added to a record, and never delivered. The
  sender then sends it again. Each refusal raises `ASTM_LTP_FRAME_REJECTED`.
- **A frame sent again after a lost `ACK` is answered `ACK` again** and not added twice.
- **An `ACK` or `NAK` arriving at the receiver is not acceptance of anything.** It raises
  `ASTM_LTP_UNEXPECTED_EVENT` and changes nothing.
- **A frame before `ENQ` is accepted**, as if the transfer had been opened, and raises
  `ASTM_LTP_UNEXPECTED_EVENT`.
- **`EOT` ends the transfer.** A record still open on an `ETB` frame at that point is not delivered.

## Keep the timers yourself

The standard sets timeouts and retry counts for a transfer. Those numbers are in the purchased text,
which we have not read, and the reducer keeps no clock, so it models the state changes and not the
timers. If the sender goes quiet in the middle of a transfer, it is your code that decides how long
to wait and when to return the receiver to its starting state with a fresh `ltpInitialState()`.

## Reference

- [`ltpReduce`](./api/README.md#ltpreduce), [`ltpInitialState`](./api/README.md#ltpinitialstate),
  [`LtpEvent`](./api/README.md#ltpevent) and [`LtpAction`](./api/README.md#ltpaction)
- [`LTP_WARNING_CODES`](./api/README.md#ltp_warning_codes) and
  [`decodeAstmFrames`](./api/README.md#decodeastmframes)
- [Receive results from an analyzer](./receive-results-from-an-analyzer.md), the tutorial this page
  builds on
