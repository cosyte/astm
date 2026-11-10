import { cosyteVitest } from "@cosyte/vitest-config";

/**
 * Vitest config for @cosyte/astm from the shared @cosyte/vitest-config standard.
 *
 * Coverage is gated at 100% for lines, branches, functions and statements across every file in
 * `src/` (barrels excepted, per the shared standard), enforced by `pnpm test:coverage`. The shared
 * config's per-directory >= 90 gates on every shipped source directory stay underneath it, and a
 * new source directory is added to `coverageDirs` when it lands. A threshold only rises: a line
 * that truly cannot be reached carries an inline `v8 ignore` comment naming its reason, never a
 * lowered number here.
 */
export default cosyteVitest({
  coverageDirs: ["common", "records", "profiles", "frames", "ltp", "terminology"],
  coverageThresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
