/**
 * The property runner every non-fuzz property here goes through (`_property.ts`): the depth a pull
 * request and the nightly run take, the seed each run records, and the failure that names how to
 * replay it.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { checkProperty, propertyRun } from "./_property.js";

/** Run `propertyRun` against an environment, keeping what it prints. */
function resolve(
  options: Parameters<typeof propertyRun>[0],
  env: Record<string, string | undefined>,
): { run: ReturnType<typeof propertyRun>; lines: string[] } {
  const lines: string[] = [];
  const run = propertyRun(options, env, (line) => lines.push(line));
  return { run, lines };
}

describe("propertyRun", () => {
  it("runs 100 cases on a pull request, from a seed it draws, and prints nothing", () => {
    const { run, lines } = resolve({}, {});
    expect(run.numRuns).toBe(100);
    expect(Number.isSafeInteger(run.seed)).toBe(true);
    expect(lines).toEqual([]);
  });

  it("keeps a test's own depth until the environment names one", () => {
    expect(resolve({ numRuns: 300 }, {}).run.numRuns).toBe(300);
    expect(resolve({ numRuns: 300 }, { COSYTE_PROPERTY_RUNS: "10000" }).run.numRuns).toBe(10_000);
  });

  it("records the seed of a deep run, under the property's name", () => {
    const { run, lines } = resolve({}, { COSYTE_PROPERTY_RUNS: "10000" });
    expect(lines).toEqual([
      `property "propertyRun > records the seed of a deep run, under the property's name": 10000 cases from COSYTE_PROPERTY_SEED=${String(run.seed)}`,
    ]);
  });

  it("runs from the seed and path the environment names, to replay a failure", () => {
    const { run } = resolve({}, { COSYTE_PROPERTY_SEED: "-42", COSYTE_PROPERTY_PATH: "3:1" });
    expect(run.seed).toBe(-42);
    expect(run.path).toBe("3:1");
  });

  it("refuses a depth that is not a whole number, so a typo cannot run the default", () => {
    expect(() => resolve({}, { COSYTE_PROPERTY_RUNS: "10k" })).toThrow(RangeError);
  });
});

describe("checkProperty", () => {
  it("passes a property that holds", () => {
    expect(() => {
      checkProperty(fc.property(fc.nat(), (n) => n >= 0));
    }).not.toThrow();
  });

  it("fails a property that does not hold, naming the test and the seed and path that replay it", () => {
    expect(() => {
      checkProperty(
        fc.property(fc.nat(), (n) => n < 10),
        { seed: 7 },
      );
    }).toThrow(
      /^checkProperty > fails a property .*\nReplay exactly: COSYTE_PROPERTY_SEED=7 COSYTE_PROPERTY_PATH=\S+/u,
    );
  });
});
