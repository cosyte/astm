/**
 * The long run on the 66 KiB framed payload: does the settled heap grow with the number of calls?
 *
 * A reading's long run is about 3 s, and on this payload the parse and the build have read a few
 * KiB over its 64 KiB line, which a reading cannot tell from noise. This runs each call 20,000
 * times in rounds, collects garbage to a settled heap after every round, and holds the growth from
 * the early rounds to the late ones under a bound a leak of a few bytes a call would cross. A
 * self-check runs the same measure over a parse that keeps 24 bytes a call, and shows it fails.
 *
 * It runs with the scaling gates (`pnpm test:perf`), apart from the unit suite and never under
 * coverage.
 */

import { getHeapStatistics, setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { validate } from "../../bench/astm.bench.mjs";
import { framed, KIB, payloadInput } from "../../bench/shapes.mjs";
import * as astm from "../../src/index.js";

setFlagsFromString("--expose-gc");
const collect = runInNewContext("gc") as () => void;

/** Calls in each round, and rounds in the run. */
const CALLS_PER_ROUND = 2_000;
const ROUNDS = 10;
/** Rounds left out at the start, while the engine's own caches fill. */
const SETTLE_ROUNDS = 3;
/** The growth from the early rounds to the late ones a run may show and still be flat. */
const BOUND_BYTES = 192 * KIB;

const WIRE = framed(payloadInput(1, 64 * KIB));
const MESSAGE = astm.parseFramedAstm(WIRE).message;

/** The settled heap: collected until a further collection frees under 1 KiB. */
function settledHeap(): number {
  let before = getHeapStatistics().used_heap_size;
  for (let i = 0; i < 20; i += 1) {
    collect();
    const after = getHeapStatistics().used_heap_size;
    if (before - after < 1024) return after;
    before = after;
  }
  return before;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** How far the settled heap rose from the first measured rounds to the last ones. */
function growth(call: (i: number) => unknown): number {
  const heaps: number[] = [];
  let n = 0;
  for (let round = 0; round < ROUNDS; round += 1) {
    for (let i = 0; i < CALLS_PER_ROUND; i += 1) call(n++);
    heaps.push(settledHeap());
  }
  const measured = heaps.slice(SETTLE_ROUNDS);
  return median(measured.slice(-3)) - median(measured.slice(0, 3));
}

describe("the long run on the 66 KiB framed payload", () => {
  it("parses with a settled heap that does not grow with the calls", () => {
    expect(growth(() => astm.parseFramedAstm(WIRE))).toBeLessThan(BOUND_BYTES);
  });

  it("validates with a settled heap that does not grow with the calls", () => {
    expect(growth(() => validate(astm, WIRE))).toBeLessThan(BOUND_BYTES);
  });

  it("builds with a settled heap that does not grow with the calls", () => {
    expect(growth(() => astm.serializeFramedAstm(MESSAGE))).toBeLessThan(BOUND_BYTES);
  });

  it("would see a parse that keeps 24 bytes a call", () => {
    const kept: string[] = [];
    const leaking = (i: number): unknown => {
      kept.push(`kept ${String(i)}`);
      return astm.parseFramedAstm(WIRE);
    };
    expect(growth(leaking)).toBeGreaterThan(BOUND_BYTES);
    expect(kept.length).toBe(CALLS_PER_ROUND * ROUNDS);
  });
});
