#!/usr/bin/env tsx
/**
 * `@cosyte/astm` gate-coverage check: does a local command exist for every gate
 * this repo's own CI runs?
 *
 * ===========================================================================
 * WHY THIS EXISTS
 * ===========================================================================
 *
 * A local runner walks a FIXED LIST OF SCRIPT NAMES and reports what it ran and
 * what it skipped. That list cannot distinguish three different things, and it
 * prints the same word for all of them:
 *
 *   1. a gate this repo does not have and should not have (a brand check in a
 *      parser repo). Skipping it is correct;
 *   2. a gate this repo HAD and dropped. Skipping it is a regression;
 *   3. a gate this repo runs in CI under a name no fixed list has ever heard of.
 *      That one is not even skipped: it is INVISIBLE, because a name absent from
 *      a list is indistinguishable from a repo with no such gate.
 *
 * The third is the one that makes a local green mean strictly less than a CI
 * green, and this repo has two of them: a nightly `test:fuzz` job over the two
 * byte-level surfaces, and the docs-artifact build the release pipeline runs. A
 * runner keyed on `check:`/`verify:` name prefixes cannot see either.
 *
 * So this gate is derived from THIS repo's own files rather than from any
 * runner's list, and it is deliberately named `check` in `package.json`: that is
 * a name the local runner already walks, so wiring it here converts one of that
 * runner's silent skips into a step that runs and can go red.
 *
 * WHAT IT ASSERTS
 *
 *   - every command a workflow in this repo RUNS is reachable as `pnpm run
 *     <script>`, or is declared below with the reason it cannot be;
 *   - every `run-<x>: true` input this repo passes to a shared pipeline has the
 *     `<x>` script the pipeline will call;
 *   - every script NAMED in `CI_GATES_OUTSIDE_A_NAME_PREFIX` still exists, so
 *     dropping one is a failure rather than a silence.
 *
 * WHAT IT DOES NOT ASSERT, stated so its green is not read as wider than it is,
 * and each of these is a real hole rather than a formality:
 *
 *   - nothing about the SHARED pipelines this repo calls. `ci.yml`,
 *     `codeql.yml`, `release.yml` and `scorecard.yml` are thin callers of
 *     workflows in another repository, and their ladders are not in this tree
 *     to read. A gate added there is outside every check here. To see what this
 *     repo delegates: `grep -h 'uses: cosyte' .github/workflows/*.yml`;
 *   - nothing in the LOCAL to CI direction. A gate-shaped script that no
 *     workflow runs is not reported, including this one. Adding that check
 *     means deciding which scripts a workflow OUGHT to run, which is a judgement
 *     rather than a reconciliation, and it is not made here.
 *
 * Exit codes: 0 (every CI gate has a declared local answer), 1 (one does not).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** Derived from this file's own location, never `process.cwd()`. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_DIR = join(REPO_ROOT, ".github", "workflows");

interface PackageJson {
  scripts?: Record<string, string>;
}

/**
 * A command a workflow runs that no `pnpm run <script>` reproduces, together
 * with the reason. AN ENTRY HERE IS A DISCLOSURE, NOT A SUPPRESSION: every one
 * is printed on every run, so "a local gate run means less than CI" is a
 * sentence a reader sees rather than one they have to derive.
 */
const DECLARED_UNREACHABLE: { match: string; why: string }[] = [
  {
    match: "--stdin",
    why:
      "the em-dash gate's second half reads the PULL REQUEST's title, body and commit range, " +
      "which exist only on the forge. The tracked-file half is `pnpm check:no-emdash` and does " +
      "run locally.",
  },
  {
    match: "pnpm install",
    why: "dependency install, not a gate.",
  },
];

/**
 * Scripts that a local runner reaching only `check:*` / `verify:*` names cannot
 * see, declared here with what runs them, because an undeclared one is exactly
 * the invisible class this file exists to name.
 */
const CI_GATES_OUTSIDE_A_NAME_PREFIX: { script: string; runBy: string }[] = [
  { script: "test:fuzz", runBy: ".github/workflows/fuzz.yml (scheduled)" },
  { script: "pack:docs", runBy: "the shared release pipeline's docs-artifact step" },
];

/**
 * Every invocation of one of THIS repo's own commands that a workflow's `run:`
 * steps make, inline form and block form alike.
 *
 * The unit is the invocation, not the line: a `run: |` block is one step and
 * most of its lines are shell (a `set -euo pipefail`, a `printf`, a redirect, a
 * comment), none of which is a gate with a local route. So the body is read and
 * only the two shapes that reach this repo's own code are kept: a package-script
 * call, and a direct call into `scripts/`. Anything else in a block is the
 * step's plumbing and is deliberately not a finding.
 */
function repoInvocations(yaml: string): string[] {
  const bodies: string[] = [];
  const lines = yaml.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const inline = /^(\s*)-?\s*run:\s*(?!\||>)(\S.*)$/.exec(line);
    if (inline) {
      bodies.push((inline[2] ?? "").trim());
      continue;
    }
    const block = /^(\s*)-?\s*run:\s*[|>][-+]?\s*$/.exec(line);
    if (!block) continue;
    const indent = (block[1] ?? "").length;
    for (let j = i + 1; j < lines.length; j += 1) {
      const body = lines[j] ?? "";
      if (body.trim().length > 0) {
        const bodyIndent = body.length - body.trimStart().length;
        if (bodyIndent <= indent) break;
        bodies.push(body.trim());
      }
      i = j;
    }
  }

  const out: string[] = [];
  for (const body of bodies) {
    if (body.startsWith("#")) continue;
    const call =
      /^(?:pnpm|npm|yarn)\s+(?:run\s+)?[^\s&|;]+.*$/.exec(body) ??
      /^(?:bash|sh|node|tsx)\s+scripts\/\S+.*$/.exec(body);
    if (call) out.push(call[0].replace(/\s*\\$/, "").trim());
  }
  return out;
}

/** Read every `<key>: true` workflow input, which is how a shared pipeline is told to run a step. */
function trueInputs(yaml: string): string[] {
  const out: string[] = [];
  for (const line of yaml.split(/\r?\n/)) {
    const m = /^\s*run-([a-z0-9:-]+):\s*true\s*$/.exec(line);
    if (m?.[1] !== undefined) out.push(m[1]);
  }
  return out;
}

/**
 * Does some package script reproduce this command locally?
 *
 * Matched on the command TEXT rather than on a name, because a workflow calls a
 * gate the way a person would (`bash scripts/check-no-emdash.sh`) and the script
 * entry is the same text. A name-based map would have to be maintained beside
 * the thing it describes, which is the failure mode this whole file is about.
 */
function localRouteFor(command: string, scripts: Record<string, string>): string | undefined {
  const normalized = command.replace(/^(pnpm|npm|yarn)\s+(run\s+)?/, "").trim();
  for (const [name, body] of Object.entries(scripts)) {
    if (body.trim() === command.trim()) return name;
    if (name === normalized) return name;
    if (body.trim() === normalized) return name;
  }
  return undefined;
}

function main(): number {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as PackageJson;
  const scripts = pkg.scripts ?? {};
  const workflows = readdirSync(WORKFLOW_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort();

  const covered: string[] = [];
  const disclosed: string[] = [];
  const problems: string[] = [];

  for (const file of workflows) {
    const yaml = readFileSync(join(WORKFLOW_DIR, file), "utf8");

    for (const command of repoInvocations(yaml)) {
      const declared = DECLARED_UNREACHABLE.find((d) => command.includes(d.match));
      const route = localRouteFor(command, scripts);
      if (route !== undefined) {
        covered.push(`${file}: ${command}  ->  pnpm run ${route}`);
      } else if (declared) {
        disclosed.push(`${file}: ${command}\n      NOT RUNNABLE LOCALLY: ${declared.why}`);
      } else {
        problems.push(
          `  - ${file} runs \`${command}\`, and no package script reproduces it.\n` +
            "    Give it a script name so a local gate run can reach it, or declare it in " +
            "DECLARED_UNREACHABLE with the reason it cannot be reached.",
        );
      }
    }

    for (const input of trueInputs(yaml)) {
      if (scripts[input] === undefined) {
        problems.push(
          `  - ${file} switches on the shared pipeline's \`${input}\` step, but this repo has ` +
            `no \`${input}\` script for it to call.`,
        );
      } else {
        covered.push(`${file}: shared pipeline input run-${input}  ->  pnpm run ${input}`);
      }
    }
  }

  for (const { script, runBy } of CI_GATES_OUTSIDE_A_NAME_PREFIX) {
    if (scripts[script] === undefined) {
      problems.push(
        `  - \`${script}\` is declared here as a CI gate run by ${runBy}, and this repo no ` +
          "longer defines it. Remove the declaration deliberately, or restore the script.",
      );
    } else {
      disclosed.push(
        `${runBy}: pnpm run ${script}\n      Its name carries no \`check:\`/\`verify:\` prefix, ` +
          "so a runner keyed on those prefixes cannot see it is missing.",
      );
    }
  }

  process.stdout.write("[gate-coverage] CI gates with a local route:\n");
  for (const c of covered) process.stdout.write(`  - ${c}\n`);
  process.stdout.write("\n[gate-coverage] declared, and NOT covered by a local gate run:\n");
  for (const d of disclosed) process.stdout.write(`  - ${d}\n`);

  if (problems.length > 0) {
    process.stderr.write(
      `\n[gate-coverage] ${String(problems.length)} CI gate(s) with no declared local answer:\n` +
        `${problems.join("\n")}\n`,
    );
    return 1;
  }
  process.stdout.write(
    `\n[gate-coverage] OK: ${String(covered.length)} CI gate(s) reachable locally, ` +
      `${String(disclosed.length)} declared unreachable and named above.\n`,
  );
  return 0;
}

process.exit(main());
