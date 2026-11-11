/**
 * How every property under `test/property/` runs, but the fuzz targets (see `_fuzz-config.ts`):
 * through `@cosyte/test-utils`, at the depth and from the seed the environment names.
 *
 * - **Depth.** 100 cases a property by default, the depth of a pull request, or the count a test
 *   names. `COSYTE_PROPERTY_RUNS` wins over both: the nightly job (`nightly-properties.yml`) sets it
 *   to 10,000.
 * - **Seed.** Each property draws a fresh seed and runs from it, so a run can find a case an
 *   earlier one missed. In a deep run (`COSYTE_PROPERTY_RUNS` set) each property prints its name,
 *   its depth and its seed, so the log of every nightly run records the seed of every property.
 * - **Replay.** A failure prints the seed and the path that replay it. Run the one test again with
 *   `COSYTE_PROPERTY_SEED=<seed> COSYTE_PROPERTY_PATH=<path>` to get the same case, already shrunk.
 *
 * A value in any of the three variables that is set but malformed throws, so a typo cannot quietly
 * run the pull-request depth.
 *
 * @module
 */

import type fc from "fast-check";
import {
  PROPERTY_ENV,
  assertProperty,
  resolvePropertyRun,
  type PropertyRunOptions,
  type ResolvedPropertyRun,
} from "@cosyte/test-utils";
import { expect } from "vitest";

/** A seed the way fast-check draws one when it is given none. */
function freshSeed(): number {
  return Date.now() ^ Math.floor(Math.random() * 0x1_0000_0000);
}

/** The name of the running test, which leads a failure message and a recorded seed. */
function currentTestName(): string {
  return expect.getState().currentTestName ?? "property";
}

/**
 * The run a property takes: its depth, and a seed, drawn fresh when neither the test nor the
 * environment names one. In a deep run it prints the property's name, depth and seed.
 *
 * @param options The test's own depth, seed or path; the environment wins over them.
 * @param env The environment; `process.env` by default.
 * @param log Where a deep run's line goes; standard output by default.
 * @returns The resolved run, always with a seed.
 */
export function propertyRun(
  options: PropertyRunOptions = {},
  env: Readonly<Record<string, string | undefined>> = process.env,
  log: (line: string) => void = (line) => {
    process.stdout.write(`${line}\n`);
  },
): ResolvedPropertyRun & { readonly seed: number } {
  const run = resolvePropertyRun(options, env);
  const seed = run.seed ?? freshSeed();
  const deep = env[PROPERTY_ENV.runs] !== undefined && env[PROPERTY_ENV.runs] !== "";
  if (deep) {
    log(
      `property "${currentTestName()}": ${String(run.numRuns)} cases from ${PROPERTY_ENV.seed}=${String(seed)}`,
    );
  }
  return { ...run, seed };
}

/**
 * Check a fast-check property through the shared runner, at the resolved depth and seed, and throw
 * an error that names the seed and path that replay a failure.
 *
 * @param property The property.
 * @param options The test's own depth (for one that needs more than 100 cases on a pull request),
 *   seed or path; the environment wins over them.
 */
export function checkProperty<Ts>(
  property: fc.IProperty<Ts>,
  options: PropertyRunOptions = {},
): void {
  assertProperty(currentTestName(), property, propertyRun(options));
}
