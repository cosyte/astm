import { cosyteVitest } from "@cosyte/vitest-config";

/**
 * Vitest config for @cosyte/astm from the shared @cosyte/vitest-config standard.
 *
 * Per-directory >= 90 coverage gates on the core dir(s). Phase 1 ships the `common/` value layer
 * and the `records/` record layer; add directories (e.g. "frames", "serialize") as later phases land.
 */
export default cosyteVitest({
  coverageDirs: ["common", "records", "profiles"],
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
