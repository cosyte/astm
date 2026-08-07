/**
 * Unit tests for scripts/check-gate-coverage.ts.
 *
 * The gate answers one question: does a local command exist for every gate this
 * repo's own CI runs? A check like that is worthless if it can only pass, so
 * every case below either drives it RED on a tree that has the defect it names,
 * or pins one of the bounds it discloses.
 *
 * Each case builds a THROWAWAY tree carrying its own copy of the checker, its
 * own `package.json` and its own `.github/workflows/`, because the checker
 * derives its repo from its own file location. Nothing here reads or writes this
 * package's own workflows.
 *
 * SECURITY: every subprocess call uses spawnSync with array args. No shell-form.
 */

import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync, rmSync, copyFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO_ROOT = process.cwd();
const CHECKER_PATH = join(REPO_ROOT, "scripts", "check-gate-coverage.ts");
const TSX_BIN = join(REPO_ROOT, "node_modules", ".bin", "tsx");

const trees: string[] = [];

afterAll(() => {
  for (const t of trees) rmSync(t, { recursive: true, force: true });
});

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * The prefix-less CI gates the checker declares. Every fixture defines them so a
 * case reds on ITS OWN condition rather than on a missing declaration, and the
 * one case that measures a dropped declaration omits one deliberately.
 */
const BASE_PREFIXLESS_GATES: Record<string, string> = {
  "test:fuzz": "vitest run test/property",
  "pack:docs": "bash scripts/build-docs-artifacts.sh",
};

/**
 * A throwaway tree with its own copy of the checker. `scripts` and `workflows`
 * are the whole fixture: a `package.json` script table and a set of workflow
 * files, which is exactly the pair the checker reconciles.
 */
function makeTree(
  scripts: Record<string, string>,
  workflows: Record<string, string>,
  omit: string[] = [],
): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gate-coverage-")));
  trees.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  copyFileSync(CHECKER_PATH, join(root, "scripts", "check-gate-coverage.ts"));
  const merged: Record<string, string> = { ...BASE_PREFIXLESS_GATES, ...scripts };
  for (const key of omit) delete merged[key];
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ scripts: merged }, null, 2)}\n`);
  for (const [name, body] of Object.entries(workflows)) {
    writeFileSync(join(root, ".github", "workflows", name), body);
  }
  return root;
}

function run(root: string): RunResult {
  const r = spawnSync(TSX_BIN, [join(root, "scripts", "check-gate-coverage.ts")], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** A repo-local workflow that runs one gate, in the shape this repo's own use. */
function workflowRunning(command: string): string {
  return ["name: Gate", "jobs:", "  gate:", "    steps:", `      - run: ${command}`, ""].join("\n");
}

describe("check-gate-coverage: a CI gate with no local route is a failure", () => {
  it("reds when a workflow runs a repo script that no package script reproduces", () => {
    const root = makeTree(
      { test: "vitest run" },
      { "gate.yml": workflowRunning("bash scripts/check-something.sh") },
    );
    const r = run(root);
    expect(r.code, `stdout: ${r.stdout}`).toBe(1);
    expect(r.stderr).toContain("scripts/check-something.sh");
    expect(r.stderr).toContain("no package script reproduces it");
  });

  it("passes once that same gate is given a script name", () => {
    const root = makeTree(
      { "check:something": "bash scripts/check-something.sh" },
      { "gate.yml": workflowRunning("bash scripts/check-something.sh") },
    );
    const r = run(root);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("pnpm run check:something");
  });

  it("resolves a `pnpm <script>` invocation to that script", () => {
    const root = makeTree(
      { "test:fuzz": "vitest run test/property" },
      { "fuzz.yml": workflowRunning("pnpm test:fuzz") },
    );
    const r = run(root);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("pnpm run test:fuzz");
  });
});

describe("check-gate-coverage: a shared pipeline told to run a step needs that step", () => {
  it("reds when a `run-<x>: true` input names a script this repo does not define", () => {
    const root = makeTree(
      { test: "vitest run" },
      {
        "ci.yml": [
          "name: CI",
          "jobs:",
          "  ci:",
          "    uses: cosyte/.github/.github/workflows/ci.yml@main",
          "    with:",
          "      run-phi-scan: true",
          "",
        ].join("\n"),
      },
    );
    const r = run(root);
    expect(r.code, `stdout: ${r.stdout}`).toBe(1);
    expect(r.stderr).toContain("phi-scan");
  });

  it("passes when the script the pipeline will call exists", () => {
    const root = makeTree(
      { "phi-scan": "tsx scripts/phi-scan.ts" },
      {
        "ci.yml": [
          "name: CI",
          "jobs:",
          "  ci:",
          "    uses: cosyte/.github/.github/workflows/ci.yml@main",
          "    with:",
          "      run-phi-scan: true",
          "",
        ].join("\n"),
      },
    );
    expect(run(root).code).toBe(0);
  });
});

describe("check-gate-coverage: the plumbing inside a `run: |` block is not a gate", () => {
  it("reads a block step's repo invocations without reporting its shell lines", () => {
    const block = [
      "name: Gate",
      "jobs:",
      "  gate:",
      "    steps:",
      "      - run: |",
      "          # a comment that is not a command",
      "          set -euo pipefail",
      '          printf \'%s\\n\' "$PR_TITLE" > "$RUNNER_TEMP/messages.txt"',
      '          git log --format=%B "$BASE..$HEAD"',
      "          bash scripts/check-something.sh --stdin",
      "",
    ].join("\n");
    const root = makeTree(
      { "check:something": "bash scripts/check-something.sh" },
      {
        "gate.yml": block,
      },
    );
    const r = run(root);
    // The `--stdin` invocation is the ONE finding: it is a repo gate whose local
    // route does not reproduce it, and it is a declared disclosure rather than a
    // failure. None of the shell lines around it is reported at all.
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("--stdin");
    expect(r.stdout).toContain("NOT RUNNABLE LOCALLY");
    expect(`${r.stdout}${r.stderr}`).not.toContain("set -euo pipefail");
    expect(`${r.stdout}${r.stderr}`).not.toContain("git log");
    expect(`${r.stdout}${r.stderr}`).not.toContain("a comment that is not a command");
  });
});

describe("check-gate-coverage: a gate whose name carries no recognisable prefix", () => {
  it("reds when a declared prefix-less CI gate has been dropped from package.json", () => {
    // `test:fuzz` and `pack:docs` are declared in the checker as CI gates a
    // runner keyed on `check:`/`verify:` prefixes cannot see. Dropping one is
    // exactly the silent regression that declaration exists to catch.
    const root = makeTree({}, {}, ["pack:docs"]);
    const r = run(root);
    expect(r.code, `stdout: ${r.stdout}`).toBe(1);
    expect(r.stderr).toContain("pack:docs");
  });

  it("discloses both of them, by name, on a run that passes", () => {
    const root = makeTree({}, {});
    const r = run(root);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("test:fuzz");
    expect(r.stdout).toContain("pack:docs");
  });
});

describe("check-gate-coverage: this package's own tree", () => {
  it("passes, and names every gate it cannot reach locally", () => {
    const r = spawnSync(TSX_BIN, [CHECKER_PATH], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      shell: false,
    });
    expect(r.status, `stderr: ${r.stderr ?? ""}`).toBe(0);
    const stdout = r.stdout ?? "";
    expect(stdout).toContain("declared, and NOT covered by a local gate run");
    expect(stdout).toContain("test:fuzz");
    expect(stdout).toContain("pack:docs");
  });
});
