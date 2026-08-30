/**
 * The PHI gate over the SHIPPED DOCS BUNDLE: an ENUMERATION case, not a detection one.
 *
 * `docs-content/` is tarred into a release asset the docs site re-fetches forever. A released
 * tarball is immutable, so an identifier written into an example there cannot be corrected in place
 * by any later diff to any repo: it is superseded by a later release and renders until then. That is
 * why the sweep opens this bundle's markdown while leaving the markdown exemption in place
 * everywhere else, and it is why the rule is graded here rather than left to review.
 *
 * WHAT IS AND IS NOT MEASURED HERE. `scripts/phi-scan.ts`'s DETECTORS are unchanged and are graded
 * in `test/scripts/phi-scan.test.ts`. These cases grade the one thing that moved: which files the
 * all-mode walk opens. Each widening is measured RED on a copy of the scanner carrying the
 * superseded blanket exemption and GREEN on the shipped one, in this repo's house style, so a case
 * cannot pass because the fixture was harmless.
 *
 * SECURITY: every subprocess call here uses spawnSync with array args. No exec, no shell-form.
 */

import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO_ROOT = process.cwd();
const SCANNER_PATH = join(REPO_ROOT, "scripts", "phi-scan.ts");
const TSX_BIN = join(REPO_ROOT, "node_modules", ".bin", "tsx");
const DOCS_DIR = join(REPO_ROOT, "docs-content");

/**
 * EVERY VIOLATOR VALUE THIS SUITE FEEDS THE SCANNER IS COMPOSED, NOT WRITTEN, and the reason is the
 * same universal `test/scripts/phi-scan.test.ts` states: `test/` is a walk root and `.ts` is read
 * through the source-embedded view, so one written literal here is a finding in every run of the
 * sweep. That view decodes escape sequences; it does not evaluate expressions, so it cannot
 * reassemble any of these.
 */
const SSN_AREA = "1" + "23";
const SSN_GROUP = "4" + "5";
const NON_TEST_EMAIL = "records.desk@" + "example-hospital.org";

/** A distinct dashed SSN per page, so a hit can be attributed to the page that carries it. */
function ssnFor(index: number): string {
  return [SSN_AREA, SSN_GROUP, String(6000 + index).padStart(4, "0")].join("-");
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function git(cwd: string, args: string[]): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  if ((r.status ?? -1) !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
}

function run(scanner: string, cwd: string, args: string[] = []): RunResult {
  const r = spawnSync(TSX_BIN, [scanner, ...args], { cwd, encoding: "utf8", shell: false });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** The page names this package actually ships, read off disk so the cases cannot go stale. */
const SHIPPED_PAGES = readdirSync(DOCS_DIR)
  .filter((name) => name.endsWith(".md"))
  .sort();

const repos: string[] = [];

/**
 * A throwaway repo laid out the way the scanner expects, carrying a docs bundle whose page NAMES
 * are this package's own.
 *
 * Every declared walk root is populated, because the scanner refuses a root it observed nothing in
 * and such a refusal would arrive before any case's own condition. `sidebars.json` is in the bundle
 * for that reason specifically: it is the one non-markdown file the bundle carries, so the
 * `docs-content` root is still observed under the SUPERSEDED exemption, and the red-before case
 * measures the markdown rule rather than an empty root.
 */
function makeDocsRepo(pageBody: (page: string, index: number) => string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "docs-phi-")));
  repos.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "test"));
  mkdirSync(join(root, "docs-content"));
  copyFileSync(
    join(REPO_ROOT, "scripts", "phi-allow-list.txt"),
    join(root, "scripts", "phi-allow-list.txt"),
  );
  copyFileSync(SCANNER_PATH, join(root, "scripts", "phi-scan.ts"));
  writeFileSync(join(root, "src", "ordinary.ts"), "export const answer = 42;\n");
  writeFileSync(join(root, "test", "ordinary.test.ts"), "export const cases = 1;\n");
  writeFileSync(join(root, "docs-content", "sidebars.json"), '{ "docs": ["intro"] }\n');
  SHIPPED_PAGES.forEach((page, index) => {
    writeFileSync(join(root, "docs-content", page), pageBody(page, index));
  });
  git(root, ["init", "-q", "."]);
  git(root, ["add", "."]);
  return root;
}

/** The shipped enumeration rule, and the blanket exemption it superseded. */
const SHIPPED_MARKDOWN_RULE = `  return !p.startsWith(\`\${DOCS_BUNDLE_ROOT}/\`);`;
const SUPERSEDED_MARKDOWN_RULE = `  return true;`;

/**
 * A copy of the shipped scanner with one fragment replaced, written into `root`'s own `scripts/`.
 * It has to live there: the scanner derives its repo from its own file location, so a copy parked
 * anywhere else resolves the allow-list and every walk root against that elsewhere.
 */
function supersededScannerIn(root: string): string {
  const source = readFileSync(SCANNER_PATH, "utf8");
  expect(source, "this case measures a fragment that has moved").toContain(SHIPPED_MARKDOWN_RULE);
  const p = join(root, "scripts", "phi-scan-blanket-md.ts");
  writeFileSync(p, source.replace(SHIPPED_MARKDOWN_RULE, SUPERSEDED_MARKDOWN_RULE));
  return p;
}

afterAll(() => {
  for (const r of repos) rmSync(r, { recursive: true, force: true });
});

describe("phi gate enumeration: the all-mode sweep opens the shipped docs bundle", () => {
  it("premise: the bundle really does ship markdown pages", () => {
    expect(SHIPPED_PAGES.length).toBeGreaterThan(0);
    expect(SHIPPED_PAGES).toContain("intro.md");
  });

  it("opens EVERY page: a dashed SSN on each one is reported, page by page", () => {
    const root = makeDocsRepo(
      (page, index) => `# ${page}\n\nA record for ${ssnFor(index)} is on file.\n`,
    );

    const shipped = run(join(root, "scripts", "phi-scan.ts"), root);
    expect(shipped.code, `stdout: ${shipped.stdout}`).toBe(1);
    for (const [index, page] of SHIPPED_PAGES.entries()) {
      expect(shipped.stderr, `page not opened: ${page}`).toContain(`docs-content/${page}`);
      expect(shipped.stderr, `value not reported for: ${page}`).toContain(ssnFor(index));
    }
    expect(shipped.stderr).toMatch(/dashed SSN/);

    // RED BEFORE: the same tree, the same roots, under the blanket markdown exemption. Every page
    // is skipped and the sweep reports clean, which is the state this rule exists to refuse.
    const before = run(supersededScannerIn(root), root);
    expect(before.code, `stderr: ${before.stderr}`).toBe(0);
    expect(before.stdout).toMatch(/OK: no hits/);
  }, 120_000);

  it("reports an email at a non-test domain on a page too", () => {
    const root = makeDocsRepo((page) =>
      page === "intro.md" ? `# intro\n\nWrite to ${NON_TEST_EMAIL}.\n` : `# ${page}\n\nProse.\n`,
    );

    const r = run(join(root, "scripts", "phi-scan.ts"), root);
    expect(r.code, `stdout: ${r.stdout}`).toBe(1);
    expect(r.stderr).toContain("docs-content/intro.md");
    expect(r.stderr).toContain(NON_TEST_EMAIL);
    expect(r.stderr).toMatch(/non-test domain/);
  }, 120_000);

  it("leaves markdown OUTSIDE the bundle exempt: the carve-out narrows, it does not remove", () => {
    // The exemption's original reason still holds for a README or the bypass log: those describe a
    // violator value as documentation of the rule itself, and they are not published inside an
    // immutable tarball. A blanket removal would red on correct content, which is how a gate gets
    // deleted.
    const root = makeDocsRepo((page) => `# ${page}\n\nProse.\n`);
    writeFileSync(join(root, "README.md"), `An SSN looks like ${ssnFor(1)}.\n`);
    writeFileSync(join(root, "src", "notes.md"), `An SSN looks like ${ssnFor(2)}.\n`);
    git(root, ["add", "."]);

    const r = run(join(root, "scripts", "phi-scan.ts"), root);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK: no hits/);
  }, 120_000);
});

describe("phi gate: the shipped bundle is clean", () => {
  it("the real all-mode sweep, with no arguments, reports no hit over this repo", () => {
    const r = run(SCANNER_PATH, REPO_ROOT);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK: no hits/);
  }, 120_000);
});
