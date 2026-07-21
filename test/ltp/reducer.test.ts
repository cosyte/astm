/**
 * Unit tests for the pure LTP reducer: establishment, per-frame ACK/NAK, the
 * ACK-failsafe (a bad or unterminated frame is NAKed, never ACKed, never
 * appended), duplicate-retransmit idempotence, out-of-sequence rejection,
 * multi-frame reassembly, termination, and defensive handling of unexpected
 * control events.
 */

import { describe, expect, it } from "vitest";

import {
  decodeAstmFrames,
  ltpInitialState,
  ltpReduce,
  LTP_WARNING_CODES,
} from "../../src/index.js";
import type { LtpAction, LtpState } from "../../src/index.js";
import { def } from "../frames/_frame-builder.js";
import { frameEvent, frameOf } from "./_events.js";

const actionTypes = (actions: readonly LtpAction[]): string[] => actions.map((a) => a.type);

/** Establish a session (neutral --enq--> transfer) and return the transfer state. */
function established(): LtpState {
  const step = ltpReduce(ltpInitialState(), { type: "enq" });
  expect(actionTypes(step.actions)).toEqual(["sendAck"]);
  expect(step.state.phase).toBe("transfer");
  return step.state;
}

describe("LTP reducer — establishment & termination", () => {
  it("neutral + ENQ → sendAck, enters transfer, expects frame 1", () => {
    const step = ltpReduce(ltpInitialState(), { type: "enq" });
    expect(actionTypes(step.actions)).toEqual(["sendAck"]);
    expect(step.state.phase).toBe("transfer");
    expect(step.state.expectedFrame).toBe(1);
    expect(step.warnings).toHaveLength(0);
  });

  it("neutral + EOT → benign line reset, no action, stays neutral", () => {
    const step = ltpReduce(ltpInitialState(), { type: "eot" });
    expect(step.actions).toHaveLength(0);
    expect(step.state.phase).toBe("neutral");
    expect(step.warnings).toHaveLength(0);
  });

  it("transfer + EOT → returns to neutral", () => {
    const step = ltpReduce(established(), { type: "eot" });
    expect(step.state.phase).toBe("neutral");
    expect(step.actions).toHaveLength(0);
  });
});

describe("LTP reducer — frame acceptance", () => {
  it("a trusted, in-sequence ETX frame is ACKed, delivered, and recorded", () => {
    const step = ltpReduce(established(), frameEvent("R|1|", { fn: 1, kind: "ETX" }));
    expect(actionTypes(step.actions)).toEqual(["sendAck", "deliverRecord"]);
    expect(step.state.records).toHaveLength(1);
    expect(step.state.recordOpen).toBe(false);
    expect(step.state.expectedFrame).toBe(2);
    const deliver = step.actions.find((a) => a.type === "deliverRecord");
    expect(deliver?.type === "deliverRecord" && new TextDecoder().decode(deliver.record)).toBe(
      "R|1|",
    );
  });

  it("a lowercase-checksum frame (a real vendor quirk) is still trusted and ACKed", () => {
    const step = ltpReduce(
      established(),
      frameEvent("H|\\^&", { fn: 1, kind: "ETX", checksumCase: "lower" }),
    );
    expect(actionTypes(step.actions)).toContain("sendAck");
    expect(step.state.records).toHaveLength(1);
  });

  it("multi-frame ETB…ETX reassembles into one delivered record", () => {
    let state = established();
    const s1 = ltpReduce(state, frameEvent("H|\\^&|first", { fn: 1, kind: "ETB" }));
    expect(actionTypes(s1.actions)).toEqual(["sendAck"]);
    expect(s1.state.recordOpen).toBe(true);
    expect(s1.state.records).toHaveLength(0);
    state = s1.state;
    const s2 = ltpReduce(state, frameEvent("second|", { fn: 2, kind: "ETX" }));
    expect(actionTypes(s2.actions)).toEqual(["sendAck", "deliverRecord"]);
    expect(s2.state.records).toHaveLength(1);
    expect(new TextDecoder().decode(s2.state.records[0])).toBe("H|\\^&|firstsecond|");
  });
});

describe("LTP reducer — the ACK-failsafe (never fabricate a positive ACK)", () => {
  it("a bad-checksum frame is NAKed, never ACKed, never appended", () => {
    const state = established();
    const bad = frameOf("R|9|", { fn: 1, kind: "ETX", forceChecksum: 0x00 });
    expect(bad.trusted).toBe(false);
    const step = ltpReduce(state, { type: "frame", frame: bad });
    expect(actionTypes(step.actions)).toEqual(["sendNak"]);
    expect(actionTypes(step.actions)).not.toContain("sendAck");
    expect(step.state.records).toHaveLength(0);
    expect(step.state.expectedFrame).toBe(1); // not advanced — awaiting the retransmit
    expect(step.warnings[0]?.code).toBe(LTP_WARNING_CODES.ASTM_LTP_FRAME_REJECTED);
  });

  it("a NAK drives retransmit: the good retransmit of the same frame is then accepted", () => {
    let state = established();
    const bad = frameOf("R|1|", { fn: 1, kind: "ETX", forceChecksum: 0x00 });
    state = ltpReduce(state, { type: "frame", frame: bad }).state;
    expect(state.records).toHaveLength(0);
    const good = ltpReduce(state, frameEvent("R|1|", { fn: 1, kind: "ETX" }));
    expect(actionTypes(good.actions)).toEqual(["sendAck", "deliverRecord"]);
    expect(good.state.records).toHaveLength(1);
  });

  it("an unterminated (untrusted) frame is NAKed, never accepted", () => {
    const state = established();
    // A truly unterminated frame: STX '1' 'R' '|' '1' '|' with no ETB/ETX/checksum.
    const bad = def(
      decodeAstmFrames(Uint8Array.from([0x02, 0x31, 0x52, 0x7c, 0x31, 0x7c])).frames[0],
    );
    expect(bad.unterminated).toBe(true);
    expect(bad.trusted).toBe(false);
    const step = ltpReduce(state, { type: "frame", frame: bad });
    expect(actionTypes(step.actions)).toEqual(["sendNak"]);
    expect(step.state.records).toHaveLength(0);
  });
});

describe("LTP reducer — sequencing", () => {
  it("an out-of-sequence trusted frame is NAKed, never bridged", () => {
    const state = established(); // expects frame 1
    const step = ltpReduce(state, frameEvent("R|1|", { fn: 3, kind: "ETX" }));
    expect(actionTypes(step.actions)).toEqual(["sendNak"]);
    expect(step.state.records).toHaveLength(0);
    expect(step.state.expectedFrame).toBe(1);
    expect(step.warnings[0]?.code).toBe(LTP_WARNING_CODES.ASTM_LTP_FRAME_REJECTED);
  });

  it("a duplicate of the last accepted frame is idempotently re-ACKed, not re-appended", () => {
    let state = established();
    state = ltpReduce(state, frameEvent("H|\\^&|a", { fn: 1, kind: "ETB" })).state;
    expect(state.expectedFrame).toBe(2);
    // Sender missed our ACK and re-sent frame 1.
    const dup = ltpReduce(state, frameEvent("H|\\^&|a", { fn: 1, kind: "ETB" }));
    expect(actionTypes(dup.actions)).toEqual(["sendAck"]);
    expect(dup.state.expectedFrame).toBe(2); // not advanced
    expect(dup.state.records).toHaveLength(0);
    expect(dup.warnings).toHaveLength(0);
  });

  it("the frame counter rolls over 7 → 0", () => {
    // Drive seven ETB frames (fn 1..7) then an ETX at fn 0.
    let state = established();
    for (let fn = 1; fn <= 7; fn++) {
      state = ltpReduce(state, frameEvent("x", { fn, kind: "ETB" })).state;
    }
    expect(state.expectedFrame).toBe(0);
    const step = ltpReduce(state, frameEvent("y", { fn: 0, kind: "ETX" }));
    expect(actionTypes(step.actions)).toEqual(["sendAck", "deliverRecord"]);
    expect(step.state.expectedFrame).toBe(1);
  });
});

describe("LTP reducer — unexpected events (defensive, never acceptance)", () => {
  it("an inbound ACK at a receiver is surfaced, never read as acceptance", () => {
    const step = ltpReduce(established(), { type: "ack" });
    expect(step.actions).toHaveLength(0);
    expect(step.warnings[0]?.code).toBe(LTP_WARNING_CODES.ASTM_LTP_UNEXPECTED_EVENT);
  });

  it("an inbound NAK at a receiver is surfaced, no action", () => {
    const step = ltpReduce(ltpInitialState(), { type: "nak" });
    expect(step.actions).toHaveLength(0);
    expect(step.warnings[0]?.code).toBe(LTP_WARNING_CODES.ASTM_LTP_UNEXPECTED_EVENT);
  });

  it("a frame before establishment auto-establishes (Postel) with a warning, then processes it", () => {
    const step = ltpReduce(ltpInitialState(), frameEvent("R|1|", { fn: 1, kind: "ETX" }));
    expect(step.state.phase).toBe("transfer");
    expect(actionTypes(step.actions)).toEqual(["sendAck", "deliverRecord"]);
    expect(step.warnings[0]?.code).toBe(LTP_WARNING_CODES.ASTM_LTP_UNEXPECTED_EVENT);
  });

  it("a mid-transfer ENQ restarts establishment (ACK), dropping any open partial", () => {
    let state = established();
    state = ltpReduce(state, frameEvent("H|\\^&|open", { fn: 1, kind: "ETB" })).state;
    expect(state.recordOpen).toBe(true);
    const step = ltpReduce(state, { type: "enq" });
    expect(actionTypes(step.actions)).toEqual(["sendAck"]);
    expect(step.state.recordOpen).toBe(false);
    expect(step.state.expectedFrame).toBe(1);
    expect(step.warnings[0]?.code).toBe(LTP_WARNING_CODES.ASTM_LTP_UNEXPECTED_EVENT);
  });

  it("EOT mid-record discards the open partial — no partial record is delivered", () => {
    let state = established();
    state = ltpReduce(state, frameEvent("H|\\^&|open", { fn: 1, kind: "ETB" })).state;
    const step = ltpReduce(state, { type: "eot" });
    expect(step.state.phase).toBe("neutral");
    expect(step.state.records).toHaveLength(0);
  });
});

describe("LTP reducer — immutability", () => {
  it("the returned state is frozen and the prior state is untouched", () => {
    const before = established();
    const step = ltpReduce(before, frameEvent("R|1|", { fn: 1, kind: "ETX" }));
    expect(Object.isFrozen(step.state)).toBe(true);
    expect(before.records).toHaveLength(0); // prior state unchanged
  });

  it("the delivered record does not alias the stored state.records entry", () => {
    const step = ltpReduce(established(), frameEvent("R|1|", { fn: 1, kind: "ETX" }));
    const deliver = step.actions.find((a) => a.type === "deliverRecord");
    const delivered = deliver?.type === "deliverRecord" ? deliver.record : new Uint8Array(0);
    const stored = step.state.records[0] ?? new Uint8Array(0);
    expect(delivered).not.toBe(stored); // distinct buffers
    delivered[0] = 0x00; // mutating the delivered copy must not touch the stored record
    expect(stored[0]).toBe(0x52); // still "R"
  });
});
