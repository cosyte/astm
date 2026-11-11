/**
 * The scaling gates for the record parse, the strict validation, the record build and the framed
 * parse, from `@cosyte/test-utils/perf`, run by `pnpm test:perf` and never under coverage (see
 * `vitest.perf.config.ts`).
 *
 * Each asks one question: does the cost grow faster than the input? On the count axis, 4 times the
 * single small result messages; on the size axis, result sessions with 4 times the results. Each
 * ratio must stay inside the band the shared contract fixes. A gate does not see a constant-factor
 * slowdown: a parser 10% slower everywhere passes, and always will. The base against head
 * comparison on a pull request (`bench/astm.bench.mjs`) is the instrument for that.
 *
 * Each self-check proves its fixtures are large enough for its gate to fail: the same work with its
 * bytes assembled the wrong way, everything received so far copied again each time a small chunk
 * arrives, must clear the ceiling at exactly these sizes. Every input is synthetic and built in code
 * by `bench/shapes.mjs`, the same code the benchmarks use.
 *
 * Not gated here: the large opaque payload, one base64 field over many frames. Its read and its
 * framed write grow faster than their input today, and a reading of the bench records it; a gate is
 * added with the change that makes them linear.
 */

import { Buffer } from "node:buffer";

import {
  assertScalingGateFires,
  scalingGate,
  type ScalingGateOptions,
} from "@cosyte/test-utils/perf";
import { describe, expect, it } from "vitest";

import { validate } from "../../bench/astm.bench.mjs";
import { framed, messageInput, sessionInput, text } from "../../bench/shapes.mjs";
import * as astm from "../../src/index.js";
import type { AstmMessage, MessageInput } from "../../src/index.js";

// The sizes are small on purpose. A parse allocates heavily, so a pass of tens of milliseconds is
// one warmup batch of one pass, and the collector's noise then keeps the warmup from settling; at
// these sizes a 50 ms batch holds several passes. Each base phase is still above the contract's
// 4 ms floor on a hosted runner (about 7 to 10 ms there), and the regression is made strong enough
// for its signal to clear the ceiling at these sizes. The parse later ran two to four times as fast and
// the build about six times as fast, so each phase reads that many more inputs to stay above the
// floor.

/** Result messages in the count axis's base phase, about 120 KiB. */
const COUNT = 300;
/** The build is several times faster than a parse, so its count axis has more messages. */
const BUILD_COUNT = 1_500;
/** Results in the size axis's base session, about 9 KiB; the scaled phase has 4 times as many. */
const RESULTS = 100;
/** Sessions in each size-axis phase. */
const SESSIONS = 16;
/** Sessions in each of the build's size-axis phases, for the same reason as `BUILD_COUNT`. */
const BUILD_SESSIONS = 24;
/**
 * Results in each build size-axis session. More sessions alone left the base phase at about 3.5 to
 * 3.9 ms on a runner, so each session is larger too.
 */
const BUILD_RESULTS = 400;
/** The chunk the regressed copy appends at a time. */
const CHUNK = 8;

/**
 * The bytes assembled the wrong way: each time a chunk arrives, everything received so far is
 * copied again from the start, one byte at a time, as a buffer that re-flushes its whole contents
 * on every append does. The result is the same bytes; the cost grows with the square of their
 * length. One output is allocated, so the extra cost is copying alone and not the collector.
 */
function assembleQuadratically(bytes: Uint8Array): Buffer {
  const out = Buffer.alloc(bytes.length);
  for (let end = CHUNK; end < bytes.length + CHUNK; end += CHUNK) {
    const stop = Math.min(end, bytes.length);
    for (let k = 0; k < stop; k++) out[k] = bytes[k] ?? 0;
  }
  return out;
}

/** Record text, assembled the wrong way. */
function quadraticText(wire: string): string {
  return assembleQuadratically(Buffer.from(wire, "latin1")).toString("latin1");
}

/** The parts of a message a reader compares: its write, and its warnings in order. */
function sameMessage(a: AstmMessage, b: AstmMessage): boolean {
  return (
    astm.serializeAstmRecords(a) === astm.serializeAstmRecords(b) &&
    a.warnings.map((w) => w.code).join() === b.warnings.map((w) => w.code).join()
  );
}

function parseOptions(): ScalingGateOptions<string, AstmMessage> {
  return {
    name: "@cosyte/astm parseAstmRecords",
    parse: (wire) => astm.parseAstmRecords(wire),
    weigh: (msg) => msg.records.length + msg.warnings.length,
    count: { n: COUNT, generate: (i) => text(messageInput(i)) },
    size: {
      inputs: SESSIONS,
      size: RESULTS,
      generate: (i, size) => text(sessionInput(i, size)),
    },
  };
}

function validateOptions(): ScalingGateOptions<string, number> {
  return {
    name: "@cosyte/astm strict parse, then messages",
    parse: (wire) => validate(astm, wire),
    weigh: (read) => read,
    count: { n: COUNT, generate: (i) => text(messageInput(i)) },
    size: {
      inputs: SESSIONS,
      size: RESULTS,
      generate: (i, size) => text(sessionInput(i, size)),
    },
  };
}

function buildOptions(): ScalingGateOptions<MessageInput, string> {
  return {
    name: "@cosyte/astm buildAstmMessage",
    parse: (input) => astm.buildAstmMessage(input),
    weigh: (out) => out.length,
    count: { n: BUILD_COUNT, generate: (i) => messageInput(i) },
    size: {
      inputs: BUILD_SESSIONS,
      size: BUILD_RESULTS,
      generate: (i, size) => sessionInput(i, size),
    },
  };
}

function framedOptions(): ScalingGateOptions<Uint8Array, AstmMessage> {
  return {
    name: "@cosyte/astm parseFramedAstm",
    parse: (wire) => astm.parseFramedAstm(wire).message,
    weigh: (msg) => msg.records.length + msg.warnings.length,
    count: { n: COUNT, generate: (i) => framed(messageInput(i)) },
    size: {
      inputs: SESSIONS,
      size: RESULTS,
      generate: (i, size) => framed(sessionInput(i, size)),
    },
  };
}

/** A skip is not a pass: a gate that could not measure says so here, rather than reading green. */
function expectMeasured(report: ReturnType<typeof scalingGate>): void {
  expect(report.count.status, report.count.diagnostic).toBe("measured");
  expect(report.size.status, report.size.diagnostic).toBe("measured");
}

describe("the scaling gate: parseAstmRecords", () => {
  it("has not acquired a complexity regression on either axis", () => {
    expectMeasured(scalingGate(parseOptions()));
  });

  it("has fixtures large enough for that gate to fail", () => {
    const report = assertScalingGateFires(parseOptions(), {
      regressedParse: (wire) => astm.parseAstmRecords(quadraticText(wire)),
      equals: sameMessage,
    });
    expect(report.margin).toBeGreaterThan(1);
  });
});

describe("the scaling gate: strict parse, then messages", () => {
  it("has not acquired a complexity regression on either axis", () => {
    expectMeasured(scalingGate(validateOptions()));
  });

  it("has fixtures large enough for that gate to fail", () => {
    const report = assertScalingGateFires(validateOptions(), {
      regressedParse: (wire) => validate(astm, quadraticText(wire)),
    });
    expect(report.margin).toBeGreaterThan(1);
  });
});

describe("the scaling gate: buildAstmMessage", () => {
  it("has not acquired a complexity regression on either axis", () => {
    expectMeasured(scalingGate(buildOptions()));
  });

  it("has fixtures large enough for that gate to fail", () => {
    const report = assertScalingGateFires(buildOptions(), {
      regressedParse: (input) => quadraticText(astm.buildAstmMessage(input)),
    });
    expect(report.margin).toBeGreaterThan(1);
  });
});

describe("the scaling gate: parseFramedAstm", () => {
  it("has not acquired a complexity regression on either axis", () => {
    expectMeasured(scalingGate(framedOptions()));
  });

  it("has fixtures large enough for that gate to fail", () => {
    const report = assertScalingGateFires(framedOptions(), {
      regressedParse: (wire) => astm.parseFramedAstm(assembleQuadratically(wire)).message,
      equals: sameMessage,
    });
    expect(report.margin).toBeGreaterThan(1);
  });
});
