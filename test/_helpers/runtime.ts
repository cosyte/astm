/**
 * Where the suite runs, and how a test starts this repository's TypeScript tooling (`tsx`) in a
 * child process on every system and runtime CI runs it on.
 *
 * CI runs the suite on Linux and macOS under Node, and again under Bun and under Deno; the suite
 * also passes on Windows, and these helpers keep it so. A test that cannot run on one of them is
 * skipped there by name, with `it.skipIf(...)` and a comment giving the reason, never left to fail
 * or deleted.
 *
 * @module
 */

import { join } from "node:path";

/**
 * Whether the suite runs on Node. Bun and Deno resolve modules, report a missing one and start a
 * child process in their own ways, so a case that asserts on Node's behavior there runs on Node
 * only.
 */
export const ON_NODE: boolean = process.versions["bun"] === undefined && !("Deno" in globalThis);

/** Whether the suite runs under Deno. */
export const ON_DENO: boolean = "Deno" in globalThis;

/** Whether the suite runs on Windows. */
export const ON_WINDOWS: boolean = process.platform === "win32";

const REPO_ROOT = process.cwd();

/**
 * The command that starts `tsx`. On Node it is Node itself running tsx's own entry file, which
 * works on every system: `node_modules/.bin/tsx` is a shell script on Linux and macOS and a `.cmd`
 * file on Windows, and Node starts neither without a shell there. Under Bun and Deno it is that
 * shell script, which each runtime starts in its own way.
 */
export const TSX_COMMAND: string = ON_NODE
  ? process.execPath
  : join(REPO_ROOT, "node_modules", ".bin", "tsx");

/** The arguments that come before a script's own when starting `tsx` with {@link TSX_COMMAND}. */
export const TSX_PREFIX: readonly string[] = ON_NODE
  ? [join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs")]
  : [];
