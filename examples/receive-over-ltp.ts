/**
 * Drive the receiver side of the ASTM transfer protocol with the pure `ltpReduce` state machine.
 *
 * The reducer owns no socket and no clock: you feed it what arrived (`enq`, a decoded frame, `eot`)
 * and it returns the state to keep and the actions to take (`sendAck`, `sendNak`,
 * `deliverRecord`). A frame the codec did not vouch for is answered with a NAK, never an ACK, and
 * its bytes are never appended to a record, so the sender retransmits. Here the result frame arrives
 * damaged once and is then resent intact. Every value is synthetic.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/receive-over-ltp.ts
 */

import assert from "node:assert/strict";

import {
  composeAstmFrames,
  decodeAstmFrames,
  detectFraming,
  ltpInitialState,
  ltpReduce,
  parseAstmRecords,
  results,
  type AstmFrame,
  type LtpEvent,
} from "@cosyte/astm";

// What the analyzer sends: three records, one frame each.
const wire = composeAstmFrames([
  "H|\\^&|||analyzer^1\r",
  "R|1|^^^687|28.6|U/L|10-40|N||F\r",
  "L|1|N\r",
]);
console.log("Framing detected:", detectFraming(wire).framing);

const good = decodeAstmFrames(wire).frames;
const [header, result, terminator] = good;
assert.ok(header !== undefined && result !== undefined && terminator !== undefined);

// The result frame as it arrives the first time, with one character damaged on the line.
const damagedBytes = wire.slice();
damagedBytes[Buffer.from(damagedBytes).indexOf("28.6")] = "3".charCodeAt(0);
const damaged: AstmFrame | undefined = decodeAstmFrames(damagedBytes).frames[1];
assert.ok(damaged !== undefined);

const events: LtpEvent[] = [
  { type: "enq" },
  { type: "frame", frame: header },
  { type: "frame", frame: damaged },
  { type: "frame", frame: result }, // the sender's retransmission after our NAK
  { type: "frame", frame: terminator },
  { type: "eot" },
];

let state = ltpInitialState();
const replies: string[] = [];
const delivered: Uint8Array[] = [];
for (const event of events) {
  const step = ltpReduce(state, event);
  state = step.state;
  for (const action of step.actions) {
    if (action.type === "deliverRecord") delivered.push(action.record);
    else replies.push(action.type);
  }
  const shown = step.actions.map((a) => a.type).join(", ") || "(nothing)";
  const warned = step.warnings.map((w) => ` [${w.code}]`).join("");
  console.log(`${event.type.padEnd(5)} -> ${shown}${warned}`);
}

const msg = parseAstmRecords(Buffer.concat(delivered));
console.log("Delivered records:", delivered.length);
console.log("Result:", results(msg)[0]?.value, results(msg)[0]?.units);

// The checks that make this file a test: `pnpm examples` fails if any of them does not hold.
assert.equal(detectFraming(wire).framing, "framed");
assert.deepEqual(replies, ["sendAck", "sendAck", "sendNak", "sendAck", "sendAck"]);
assert.equal(delivered.length, 3);
assert.equal(results(msg)[0]?.value, "28.6");
assert.equal(state.phase, "neutral");
