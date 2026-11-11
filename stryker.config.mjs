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
    // run plus timeoutMS. At StrykerJS's defaults (1.5 and 5,000 ms) 124 mutants timed out on a
    // full run, and the floor sat a fraction of one mutant above the score, so a mutant near that
    // line that finished on one run and timed out on the next could turn the weekly run red. A
    // wider margin lets a slow mutant that still finishes finish every time, so only a mutant
    // that never ends times out, and the full score does not move with the runner's load.
    timeoutFactor: 3,
    timeoutMS: 10_000,
  },
});
