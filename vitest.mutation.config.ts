import { configDefaults } from "vitest/config";

import config from "./vitest.config.js";

/**
 * The Vitest run StrykerJS uses for mutation testing (`stryker.config.mjs`): the suite of
 * `vitest.config.ts`, without the tests that cannot judge a mutant.
 *
 * - `test/perf/`: those tests read a clock and assert on sizes and ratios of time; under Stryker's
 *   instrumentation every measured call pays for a mutant switch, so they measure the
 *   instrumentation. They check speed, not what the code returns.
 * - `test/scripts/`: those test this repository's own tooling in `scripts/` (the PHI scan, the
 *   gate coverage check, the changelog and release gates), not the library.
 * - The four root tests that start another process or read the built package: the docs samples
 *   (`docs-content.test.ts`, which runs `pnpm build` and loads `dist/`), the README example
 *   (`readme-usage.test.ts`, run by `tsx` in a child process), the dependency inventory and the
 *   docs PHI scan. Code a child process or `dist/` runs is not the instrumented source, so no
 *   mutant is ever killed there, and each would add a build or a process start to the run.
 *
 * The instrumented code runs several times slower than the plain build, so a test's budget here is
 * 60 s rather than 10 s. StrykerJS sets each mutant's own timeout from the time the test took in
 * its first run, so this budget does not slow the mutant runs.
 */
export default {
  ...config,
  test: {
    ...config.test,
    exclude: [
      ...configDefaults.exclude,
      "test/perf/**",
      "test/scripts/**",
      "test/docs-content.test.ts",
      "test/docs-content-phi.test.ts",
      "test/readme-usage.test.ts",
      "test/dependency-inventory.test.ts",
    ],
    testTimeout: 60_000,
  },
};
