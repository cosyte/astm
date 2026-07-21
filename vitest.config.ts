import { cosyteVitest } from "@cosyte/vitest-config";

/**
 * Vitest config for @cosyte/astm from the shared @cosyte/vitest-config standard.
 *
 * Per-directory >= 90 coverage gates on every shipped source directory. As of Phase 10 (release
 * hardening) the whole `src/` surface is gated per-dir — `common`/`records`/`profiles` plus the
 * framing (`frames`), transport (`ltp`), and terminology (`terminology`) layers — on top of the
 * global >= 90 gate. A new source directory is added here the phase it lands, so the release bar
 * holds directory by directory, not just in aggregate.
 */
export default cosyteVitest({
  coverageDirs: ["common", "records", "profiles", "frames", "ltp", "terminology"],
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
