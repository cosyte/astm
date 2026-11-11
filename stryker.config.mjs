import { cosyteStryker } from "@cosyte/vitest-config/stryker";

// Mutation testing for @cosyte/astm, on the shared StrykerJS config.
//
//   pnpm mutate full                         every source file; its score is the floor's
//   pnpm mutate changed --base origin/main   only the source files a change touched
//   pnpm quality:mutation [--base origin/main]
//
// The shared config mutates every `.ts` file under `src/` but tests, declarations and barrels (a
// file of nothing but re-exports), and leaves out static mutants (code that runs once, when a
// module loads), which only a run of the whole suite can test. `pnpm mutate:full` and the weekly
// job run this same config over every file, sharded across runners.
export default cosyteStryker({
  // The suite without the tests that read a clock or test this repository's tooling (see that file).
  vitestConfig: "vitest.mutation.config.ts",
  stryker: {
    // A mutant times out when a test takes longer than timeoutFactor times its first, unmutated
    // run plus timeoutMS. At StrykerJS's defaults (1.5 and 5,000 ms) 117 to 124 mutants timed out
    // on a full run, a timeout counts as caught, and dozens of those finish and survive when given
    // the time, so the score counted mutants no test catches. With this margin about 52 time out,
    // and two full runs differ by one or two mutants: a fast-path mutant in the escape split that
    // returns the same result more slowly still lands on either side of the line.
    timeoutFactor: 3,
    timeoutMS: 10_000,
  },
});
