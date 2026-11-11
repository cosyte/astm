/**
 * The exact state and warnings the LTP reducer hands back at the points the wider reducer suite
 * reads only in part: the fresh session, a frame before establishment that is rejected, the end of
 * a transfer with a record still open, and the clean accept. Plus the LTP warning builders, whose
 * message is a fixed text with no field data and whose `frameNumber` is present only when given.
 * All frame content is synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  LTP_WARNING_CODES,
  ltpAmbiguousTransport,
  ltpFrameRejected,
  ltpInitialState,
  ltpReduce,
  ltpUnexpectedEvent,
} from "../../src/index.js";
import { frameEvent, frameOf } from "./_events.js";

describe("a fresh session", () => {
  it("is neutral, expects frame 1, holds nothing, and has accepted no frame", () => {
    const state = ltpInitialState();
    expect(state).toStrictEqual({
      phase: "neutral",
      expectedFrame: 1,
      records: [],
      recordOpen: false,
      openRecord: new Uint8Array(0),
    });
    expect(Object.hasOwn(state, "lastAcceptedFrame")).toBe(false);
  });
});

describe("a frame before establishment that is rejected", () => {
  it("still establishes the transfer, with no record open", () => {
    const bad = frameOf("H|\\^&\r", { fn: 1, forceChecksum: 0 });
    expect(bad.trusted).toBe(false);
    const step = ltpReduce(ltpInitialState(), { type: "frame", frame: bad });
    expect(step.actions).toEqual([{ type: "sendNak" }]);
    expect(step.state.phase).toBe("transfer");
    expect(step.state.recordOpen).toBe(false);
    expect(step.state.expectedFrame).toBe(1);
    expect(step.warnings.map((w) => w.code)).toEqual([
      LTP_WARNING_CODES.ASTM_LTP_UNEXPECTED_EVENT,
      LTP_WARNING_CODES.ASTM_LTP_FRAME_REJECTED,
    ]);
  });
});

describe("accepting frames", () => {
  it("warns nothing on an intermediate frame or on the final one", () => {
    let state = ltpReduce(ltpInitialState(), { type: "enq" }).state;
    const etb = ltpReduce(state, frameEvent("R|1|^^^687|", { fn: 1, kind: "ETB" }));
    expect(etb.warnings).toEqual([]);
    expect(etb.state.recordOpen).toBe(true);
    state = etb.state;
    const etx = ltpReduce(state, frameEvent("28.6\r", { fn: 2, kind: "ETX" }));
    expect(etx.warnings).toEqual([]);
    expect(etx.state.recordOpen).toBe(false);
    expect(etx.state.lastAcceptedFrame).toBe(2);
  });

  it("closes a transfer with a record open as not open, and delivers nothing", () => {
    let state = ltpReduce(ltpInitialState(), { type: "enq" }).state;
    state = ltpReduce(state, frameEvent("R|1|^^^687|", { fn: 1, kind: "ETB" })).state;
    expect(state.recordOpen).toBe(true);
    const end = ltpReduce(state, { type: "eot" });
    expect(end.state.phase).toBe("neutral");
    expect(end.state.recordOpen).toBe(false);
    expect(end.state.records).toEqual([]);
    expect(end.actions).toEqual([]);
    expect(end.warnings).toEqual([]);
  });
});

describe("the LTP warning builders", () => {
  it("states the ambiguous-transport default in a fixed message", () => {
    expect(ltpAmbiguousTransport()).toStrictEqual({
      code: LTP_WARNING_CODES.ASTM_LTP_AMBIGUOUS_TRANSPORT,
      message:
        "Leading byte was neither a frame start (STX/ENQ) nor a record letter, defaulted to framed; override with a profile to force raw.",
    });
  });

  it("names the frame of an unexpected event only when it was a frame", () => {
    const message =
      "Control event arrived in a state that did not expect it, handled defensively, never read as acceptance.";
    expect(ltpUnexpectedEvent()).toStrictEqual({
      code: LTP_WARNING_CODES.ASTM_LTP_UNEXPECTED_EVENT,
      message,
    });
    expect(ltpUnexpectedEvent(3)).toStrictEqual({
      code: LTP_WARNING_CODES.ASTM_LTP_UNEXPECTED_EVENT,
      message,
      frameNumber: 3,
    });
  });

  it("names a rejected frame's number only when it could be read", () => {
    const message =
      "Frame rejected (bad checksum, unterminated, or out of sequence), NAK sent, retransmit expected, never accepted.";
    expect(ltpFrameRejected()).toStrictEqual({
      code: LTP_WARNING_CODES.ASTM_LTP_FRAME_REJECTED,
      message,
    });
    expect(ltpFrameRejected(0)).toStrictEqual({
      code: LTP_WARNING_CODES.ASTM_LTP_FRAME_REJECTED,
      message,
      frameNumber: 0,
    });
  });
});
