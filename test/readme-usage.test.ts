/**
 * The `## Usage` example in README.md is EXECUTED here, and the output block
 * printed beside it in the file is the assertion.
 *
 * WHY THIS EXISTS. Roughly half of documentation traffic is now agents, and an
 * agent lifts a quickstart block verbatim, so a wrong example becomes wrong
 * generated code in someone else's integration. A README example that nothing
 * runs drifts silently: the package moves, the block does not, and the first
 * reader to notice is the one whose code is already broken.
 *
 * WHAT IS ASSERTED, AND WHY EACH PART IS HERE:
 *
 *  1. The block is READ OUT OF README.md rather than copied into this file. A
 *     copy would drift from the file it documents, which is the defect this
 *     test exists to close, arriving through the test instead of through the
 *     README.
 *  2. It is RUN, in a subprocess, and its stdout is compared BYTE FOR BYTE with
 *     the fenced output block that follows it in the README. Comparing anything
 *     looser (a substring, a line count) would pass on an example that prints
 *     the wrong value.
 *  3. A NEGATIVE CONTROL. The same extracted source is re-run with one value in
 *     the input stream changed, and its output has to change with it. Without
 *     that, every assertion above would still pass on a runner that never
 *     executed anything, and a gate that cannot fail is not a gate.
 *  4. The published import specifier is asserted, so the block a reader
 *     copy-pastes reaches the package entry point and not a deep path.
 *
 * WHAT THE EXAMPLE IS RUN AGAINST. `src/index.ts`, the package's public entry
 * point, which is the single file `tsup` compiles into `dist/index.mjs` and
 * `dist/index.cjs`. The only edit made to the extracted source is rewriting the
 * `@cosyte/astm` specifier to that path, and the rewrite is asserted to happen
 * exactly once. Importing the built `dist/` instead was rejected deliberately:
 * `pnpm test` runs on a tree that need not have been built, and reaching into
 * `dist/` would make this test race the build window that `scripts/attw.mjs`
 * exists to report on.
 *
 * SECURITY: the subprocess is spawned with spawnSync and array args. No exec,
 * no shell-form.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const README_PATH = join(REPO_ROOT, "README.md");
const ENTRY_POINT = join(REPO_ROOT, "src", "index.ts");
const TSX_BIN = join(REPO_ROOT, "node_modules", ".bin", "tsx");
const PUBLISHED_SPECIFIER = '"@cosyte/astm"';
/** tsx has to transpile the whole entry point before the example runs. */
const SPAWN_TIMEOUT = 60_000;
const CASE_TIMEOUT = 120_000;

interface Fence {
  readonly lang: string;
  readonly body: string;
}

/** The lines of one `##` section, from its heading to the next `##` heading. */
function section(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.indexOf(heading);
  if (start === -1) throw new Error(`README.md has no ${heading} section`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line !== undefined && line.startsWith("## ")) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
}

/** Every fenced block in a chunk of markdown, in order, with its info string. */
function fences(markdown: string): Fence[] {
  const out: Fence[] = [];
  let lang: string | undefined;
  let buf: string[] = [];
  for (const line of markdown.split("\n")) {
    if (lang === undefined) {
      const opened = /^```([a-z]*)$/.exec(line);
      if (opened !== null) {
        lang = opened[1] ?? "";
        buf = [];
      }
      continue;
    }
    if (line === "```") {
      out.push({ lang, body: buf.join("\n") });
      lang = undefined;
      continue;
    }
    buf.push(line);
  }
  if (lang !== undefined) throw new Error("unterminated code fence in README.md");
  return out;
}

interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

let dir: string;
let usageFences: Fence[];

/**
 * Rewrite the published specifier to the entry point on disk and run the source.
 * The rewrite is counted, not merely applied: a block that stopped importing the
 * package would otherwise run against nothing and still print something.
 */
function runExample(source: string, fileName: string): RunResult {
  const occurrences = source.split(PUBLISHED_SPECIFIER).length - 1;
  expect(occurrences, "the Usage example imports @cosyte/astm exactly once").toBe(1);
  const runnable = source.replace(PUBLISHED_SPECIFIER, JSON.stringify(ENTRY_POINT));
  const path = join(dir, fileName);
  writeFileSync(path, `${runnable}\n`, "utf8");
  const r = spawnSync(TSX_BIN, [path], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
    timeout: SPAWN_TIMEOUT,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "readme-usage-"));
  usageFences = fences(section(readFileSync(README_PATH, "utf8"), "## Usage"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("the README Usage example", () => {
  it("is one TypeScript block followed by one output block", () => {
    expect(usageFences.map((f) => f.lang)).toEqual(["ts", "text"]);
  });

  it("imports the package by its published name", () => {
    const example = usageFences[0];
    expect(example).toBeDefined();
    expect(example?.body).toContain(`from ${PUBLISHED_SPECIFIER};`);
  });

  it(
    "runs, and prints exactly the output the README shows beside it",
    () => {
      const example = usageFences[0];
      const shown = usageFences[1];
      expect(example).toBeDefined();
      expect(shown).toBeDefined();
      if (example === undefined || shown === undefined) return;

      const run = runExample(example.body, "usage.mts");

      expect(run.stderr).toBe("");
      expect(run.code).toBe(0);
      // Byte for byte. console.log terminates each line, so the fenced block plus
      // one trailing newline is the whole of stdout.
      expect(run.stdout).toBe(`${shown.body}\n`);
    },
    CASE_TIMEOUT,
  );

  it(
    "is really executed: changing the input stream changes the output",
    () => {
      const example = usageFences[0];
      const shown = usageFences[1];
      expect(example).toBeDefined();
      expect(shown).toBeDefined();
      if (example === undefined || shown === undefined) return;

      // The measured value in the synthetic R record, and nothing else.
      expect(example.body.split("28.6").length - 1, "the example carries one 28.6").toBe(1);
      const mutated = example.body.replace("28.6", "31.4");
      const run = runExample(mutated, "usage-control.mts");

      expect(run.stderr).toBe("");
      expect(run.code).toBe(0);
      expect(run.stdout).not.toBe(`${shown.body}\n`);
      expect(run.stdout).toBe(`${shown.body}\n`.replace("28.6", "31.4"));
    },
    CASE_TIMEOUT,
  );
});
