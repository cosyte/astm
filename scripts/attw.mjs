#!/usr/bin/env node
/**
 * scripts/attw.mjs, the `attw` publish gate, made to report its own failure.
 *
 * WHY THIS WRAPPER EXISTS: `attw` PRINTS "This package does not contain types."
 * AND EXITS 0. That is not a bug in `attw`. An untyped package is a legitimate npm
 * package, so the CLI treats "no types at all" as a *description*, not a problem.
 * From this repo's own `@arethetypeswrong/cli@0.18.4`,
 * `node_modules/@arethetypeswrong/cli/dist/getExitCode.js`, first statement:
 *
 *     export function getExitCode(analysis, opts) {
 *         if (!analysis.types) {
 *             return 0;
 *         }
 *
 * The problem list is consulted only *after* that early return, so no `--profile`,
 * `--ignore-rules` or config setting can reach it. For a package that ships types,
 * "does not contain types" does not mean "fine, untyped". It means THE TYPES WERE
 * NOT IN THE TARBALL, which is a broken publish. The gate said nothing, and its
 * caller read the 0. A false red costs an hour; A FALSE GREEN MERGES.
 *
 * MEASURED ON THIS PACKAGE, not carried over from the sibling this ports from.
 * Both states, on a quiet box with no concurrency, `@cosyte/astm` at `0.0.9`:
 *
 *     rm -rf dist && attw --pack .              -> "does not contain types", exit 0
 *     rm -f dist/index.d.ts dist/index.d.cts && attw --pack .
 *                                               -> "does not contain types", exit 0
 *
 * THE RACE ONLY SUPPLIES THE CONDITION; IT IS NOT THE DEFECT. The second state
 * above is the realistic one, because `tsup` emits JS in one pass and the
 * declaration files in a later pass. Timed on one real build of THIS package:
 * `dist/index.mjs` and `dist/index.cjs` appeared at 1,176 ms, `dist/index.d.ts`
 * and `dist/index.d.cts` at 3,063 ms, so there was a 1,887 ms window in which
 * `dist/` held JS and no declarations at all. A concurrent build or `pnpm clean`
 * in the same working tree lands `attw` in that window. Which is why this is not
 * answered with a lock or a build queue: the gate is supposed to be able to tell
 * you its own inputs were missing, whatever removed them.
 *
 * TWO NETS, and they catch different things, so keep both:
 *
 *   1. PREFLIGHT (structural, no string matching). Every relative artifact path
 *      `package.json` promises (`main`, `module`, `types`, `typings`, and every
 *      string leaf of `exports`) must exist and be non-empty before `attw` runs.
 *      This is the one that catches the build window measured above, and it names
 *      the missing file instead of leaving the reader to infer it.
 *
 *   2. POST-CHECK. If `attw` still reports an untyped package, fail. The preflight
 *      cannot see this case: the declaration files can be present on disk and
 *      still be absent from the tarball, because `files` (or an `.npmignore`) left
 *      them out. No instance of that is on record in this repo. It is the case
 *      `attw --pack` exists to catch, and the whole point here is that it catches
 *      it silently.
 *
 *   The post-check matches `attw`'s untyped sentence, which is a plain, un-chalked
 *   string in `dist/render/untyped.js`. That makes it blindable, so the arguments
 *   and config below are REFUSED rather than tolerated. See BLINDING.
 *   `test/scripts/attw-gate.test.ts` pins both nets against the real binary, so if
 *   an `attw` upgrade reworks the wording or fixes the exit code, the suite reds
 *   and tells you to revisit this file rather than letting the net go quietly slack.
 *
 * BLINDING. Four routes were measured HERE, on an untyped pack, each restoring the
 * exact exit 0 by making the untyped sentence absent from what this script can read:
 * `--quiet` (printed nothing at all), `--format json` (the JSON render omits the
 * sentence), a `.attw.json` setting either of those (`readConfig()` applies it after
 * argv), and `--config-path <file>` where that file sets either (which is also WHY
 * `--config-path` is refused: the `.attw.json` check below reads one fixed filename
 * and cannot see a config pointed somewhere else). Bare `attw` exits 0 in all four
 * cases too, so refusing is not a regression against the old script. It is the
 * difference between a gate and a gate-shaped thing.
 *
 * THE REFUSAL LIST IS NOT A PROOF OF CLOSURE, and must not be described as one.
 * `--definitely-typed <tarball>` (and the `definitelyTyped` config key) merges an
 * external types tarball, which makes `analysis.types` truthy and so suppresses the
 * untyped sentence by a different mechanism entirely. It is deliberately NOT refused:
 * it is equally true of the bare CLI this wrapper replaced, so it is not a regression,
 * and no exit 0 was obtained through it here. What is claimed below is that the listed
 * routes are closed, never that the post-check cannot be blinded at all. The preflight
 * is the net that does not depend on reading a string.
 *
 * The refusal is BY OPTION NAME, WHOLESALE, not by value. `--format table-flipped`
 * still prints the sentence and blinds nothing, and is refused anyway. That is the
 * deliberate trade: value-parsing these would be a third moving part in the guard,
 * and being over-strict about an argument nobody passes to a repo's own publish
 * gate costs less than a route back to a false green.
 *
 * Other arguments are forwarded, so `--profile node16` and friends still work.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ATTW_BIN = fileURLToPath(new URL("../node_modules/.bin/attw", import.meta.url));
const UNTYPED = "This package does not contain types.";
const DECLARATION = /\.d\.[cm]?ts$/;
const args = process.argv.slice(2);

const die = (msg) => {
  process.stderr.write(`\n✗ attw gate: ${msg}\n`);
  process.exit(1);
};

// ---- Refuse what would blind the post-check --------------------------------
const BLINDING = new Set(["-q", "--quiet", "-f", "--format", "--config-path"]);
const blinding = args.filter((a) => BLINDING.has(a.split("=")[0]));
if (blinding.length > 0) {
  die(
    `${blinding.join(", ")} is refused wholesale, by option name and not by value.\n` +
      `  This gate reads attw's printed output, attw exits 0 on an untyped package,\n` +
      `  and some values of these options hide that output. Run it without them.`,
  );
}
try {
  const config = JSON.parse(readFileSync(".attw.json", "utf8"));
  const set = ["quiet", "format"].filter((k) => k in config);
  if (set.length > 0) {
    die(
      `.attw.json sets ${set.join(", ")}. These keys are refused wholesale, by name and\n` +
        `  not by value: readConfig() applies them after argv, this gate reads attw's\n` +
        `  printed output, and attw exits 0 on an untyped package.`,
    );
  }
} catch {
  // No .attw.json, or unreadable/invalid. attw itself reports the latter.
}

/** Every relative path `package.json` promises to ship, deduped. */
function declaredArtifacts(pkg) {
  const found = new Set();
  const add = (v) => {
    if (typeof v !== "string") return;
    // Skip wildcard subpath patterns (they name a set, not a file) and the
    // manifest itself, which is always in the tarball by definition.
    if (!v.startsWith(".") || v.includes("*") || v === "./package.json") return;
    found.add(v);
  };
  for (const key of ["main", "module", "types", "typings"]) add(pkg[key]);
  const walk = (node) => {
    if (typeof node === "string") add(node);
    else if (node && typeof node === "object") for (const v of Object.values(node)) walk(v);
  };
  walk(pkg.exports);
  return [...found];
}

let pkg;
try {
  pkg = JSON.parse(readFileSync("package.json", "utf8"));
} catch (err) {
  die(`cannot read ./package.json from ${process.cwd()}: ${err.message}`);
}

// ---- Net 1: preflight -------------------------------------------------------
const broken = [];
for (const rel of declaredArtifacts(pkg)) {
  let size;
  try {
    size = statSync(rel).size;
  } catch {
    broken.push({ rel, why: "missing" });
    continue;
  }
  if (size === 0) broken.push({ rel, why: "empty" });
}
if (broken.length > 0) {
  // Only claim the exit-0 counterfactual when a DECLARATION file is among the
  // casualties. With the declarations intact and only JS missing, attw reports
  // no problems at all and still exits 0, which is a different silence, not this one.
  const declarationsHit = broken.some(({ rel }) => DECLARATION.test(rel));
  die(
    `package.json promises files the build has not produced:\n` +
      broken.map(({ rel, why }) => `    ${rel} (${why})\n`).join("") +
      `\n  Run the build first. If you DID build, something removed or truncated the\n` +
      `  output underneath this run. A concurrent build or \`clean\` in the same\n` +
      `  working tree will do it, and \`tsup\` writes JS before declarations, so there\n` +
      `  is a window where the .d.ts files do not exist yet.\n` +
      (declarationsHit
        ? `  attw would have reported "${UNTYPED}" and EXITED 0 on this tree.\n`
        : `  attw does not gate these: it analyses types, and exits 0 here.\n`),
  );
}

// ---- Run attw ---------------------------------------------------------------
const res = spawnSync(ATTW_BIN, ["--pack", ".", ...args], {
  encoding: "utf8",
  stdio: ["inherit", "pipe", "pipe"],
});
if (res.error) die(`could not run ${ATTW_BIN}: ${res.error.message}`);
const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
process.stdout.write(res.stdout ?? "");
process.stderr.write(res.stderr ?? "");
if (res.status !== 0) process.exit(res.status ?? 1);

// ---- Net 2: post-check ------------------------------------------------------
// An empty transcript means the post-check read nothing, by some route not listed
// under BLINDING above. Treat that as a failure rather than as a pass: this gate
// is only as good as the output it got to see.
if (output.trim() === "") {
  die(`attw exited 0 but printed nothing, so nothing was checked.`);
}
if (output.includes(UNTYPED)) {
  die(
    `attw reported "${UNTYPED}" and exited 0.\n` +
      `  This package ships types, so that means the tarball did not carry them.\n` +
      `  Check the "files" field and .npmignore. Reported as a failure here because\n` +
      `  attw's own exit code cannot: getExitCode() returns 0 whenever the analysis\n` +
      `  found no types at all, before it ever looks at the problem list.`,
  );
}
