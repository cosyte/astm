/**
 * The bench's inputs are what they say they are. `bench/shapes.mjs` writes each shape's wire text
 * and frames without the package, so a benchmark never measures a message the package would not
 * write or read cleanly: each text here is exactly what `buildAstmMessage` writes from the same
 * input, each reads with no warning under `strict`, and each framing is exactly what
 * `serializeFramedAstm` writes for the parsed message.
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import * as astm from "../../src/index.js";
import { parse, validate } from "../../bench/astm.bench.mjs";
import {
  framed,
  framedPayload,
  framedSession,
  KIB,
  messageInput,
  payloadInput,
  resultMessage,
  session,
  sessionInput,
  text,
} from "../../bench/shapes.mjs";

const SHAPES = [
  { name: "the result message", input: messageInput(7), results: 3 },
  { name: "a result session", input: sessionInput(3, 250), results: 250 },
  { name: "a framed payload", input: payloadInput(5, 4 * KIB), results: 1 },
] as const;

describe("the bench shapes", () => {
  for (const shape of SHAPES) {
    describe(shape.name, () => {
      it("is the text buildAstmMessage writes from the same input", () => {
        expect(text(shape.input)).toBe(astm.buildAstmMessage(shape.input));
      });

      it("reads with no warning under strict, every result counted", () => {
        const msg = astm.parseAstmRecords(text(shape.input), { strict: true });
        expect(msg.warnings).toEqual([]);
        expect(validate(astm, text(shape.input))).toBe(shape.results);
      });

      it("is framed exactly as serializeFramedAstm frames it", () => {
        const wire = framed(shape.input);
        const msg = astm.parseAstmRecords(text(shape.input));
        expect(Buffer.from(wire).equals(Buffer.from(astm.serializeFramedAstm(msg)))).toBe(true);
        const read = astm.parseFramedAstm(wire, { strict: true });
        expect(read.frameWarnings).toEqual([]);
        expect(read.message.records.length).toBe(msg.records.length);
        expect(validate(astm, wire)).toBe(shape.results);
      });
    });
  }

  it("splits a record longer than 240 bytes over frames closed by ETB", () => {
    const wire = framedPayload(1, 4 * KIB);
    const { frames } = astm.decodeAstmFrames(wire, { strict: true });
    expect(frames.some((f) => f.terminator === "ETB")).toBe(true);
  });

  it("names a different patient, specimen and value for each index", () => {
    expect(resultMessage(1)).not.toBe(resultMessage(2));
    expect(session(1, 100)).not.toBe(session(2, 100));
    expect(Buffer.from(framedSession(1, 100)).equals(Buffer.from(framedSession(2, 100)))).toBe(
      false,
    );
    const results = astm.results(parse(astm, session(0, 100)));
    expect(new Set(results.map((r) => r.value)).size).toBeGreaterThan(10);
  });

  it("carries as many results and patients as a session says", () => {
    const [message] = astm.messages(parse(astm, framedSession(0, 1_000)));
    expect(message?.results.length).toBe(1_000);
    expect(message?.patients.length).toBe(50);
    expect(message?.orders.length).toBe(100);
  });
});
