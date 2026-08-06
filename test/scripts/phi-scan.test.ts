/**
 * Unit tests for scripts/phi-scan.ts: the STARTER PHI commit-gate.
 *
 * These exercise the SHARED MACHINERY and the cross-cutting SSN/email FLOOR that
 * ships with the template. They deliberately do NOT test structured, field-level
 * PHI detection, that is format-specific and is the author's obligation to add
 * (see the STARTER banner in scripts/phi-scan.ts). When you add structured
 * detectors, add positive tests here proving they CATCH real-looking names /
 * DOBs / ids for this standard: a weak scanner is worse than none.
 *
 * The scanner is invoked via spawnSync (array args, no shell) so the full CLI
 * path (argv parse, exit code, stderr) is exercised. Violator/clean files are
 * written to a throwaway temp dir so they never pollute the committed corpus.
 *
 * SECURITY: every subprocess call here uses spawnSync with array args. No exec,
 * no shell-form.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import {
  writeFileSync,
  readFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  copyFileSync,
  symlinkSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO_ROOT = process.cwd();
const SCANNER_PATH = join(REPO_ROOT, "scripts", "phi-scan.ts");
const TSX_BIN = join(REPO_ROOT, "node_modules", ".bin", "tsx");

let dir: string;

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runScanner(args: string[]): RunResult {
  const r = spawnSync(TSX_BIN, [SCANNER_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Write a file to the temp dir and scan it by path (paths mode, no git needed). */
function scan(name: string, content: string): RunResult {
  const path = join(dir, name);
  writeFileSync(path, content);
  return runScanner([path]);
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "phi-scan-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("phi-scan starter: the cross-cutting floor catches SSN + email", () => {
  it("catches a dashed SSN (exit 1)", () => {
    const r = scan("ssn.txt", "patient ssn 123-45-6789 on file\n");
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/123-45-6789/);
    expect(r.stderr).toMatch(/dashed SSN/);
  });

  it("catches an email at a non-test domain (exit 1)", () => {
    const r = scan("email.txt", "contact jane.doe@hospital.org for records\n");
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/jane\.doe@hospital\.org/);
    expect(r.stderr).toMatch(/non-test domain/);
  });
});

describe("phi-scan starter: clean + allow-listed content passes", () => {
  it("a clean file with no PHI shapes exits 0", () => {
    const r = scan("clean.txt", "just some ordinary text, no identifiers here\n");
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK: no hits/);
  });

  it("honors the allow-list: an email at a reserved test domain passes (exit 0)", () => {
    const r = scan("allowed-email.txt", "reach the team at hello@example.com anytime\n");
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

describe("phi-scan ASTM extension: the P-record loci (name + mother's maiden + DOB)", () => {
  const HEADER = "H|\\^&\r";

  it("catches an undeclared patient name token in P field 6 (exit 1)", () => {
    const r = scan("undeclared-name.astm", `${HEADER}P|1|A|B||SMITH^ALICE||20200101|F\r`);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/SMITH/);
    expect(r.stderr).toMatch(/P-6 \(name\)/);
  });

  it("catches an undeclared mother's maiden name in P field 7 (exit 1)", () => {
    // DOE / JANE / Q and DOB are declared; the maiden name WELDON is not.
    const r = scan("undeclared-maiden.astm", `${HEADER}P|1|A|B||DOE^JANE^Q|WELDON|20200101|F\r`);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/WELDON/);
    expect(r.stderr).toMatch(/P-7 \(mother's-maiden\)/);
  });

  it("catches an undeclared birthdate in P field 8 (exit 1)", () => {
    const r = scan("undeclared-dob.astm", `${HEADER}P|1|A|B||DOE^JANE||19731105|F\r`);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/19731105/);
    expect(r.stderr).toMatch(/P-8 \(dob\)/);
  });

  it("passes a P record whose name + DOB are declared synthetic in the allow-list (exit 0)", () => {
    // DOE / JANE / Q and 20200101 are declared in scripts/phi-allow-list.txt.
    const r = scan("declared.astm", `${HEADER}P|1|A|B||DOE^JANE^Q||20200101|F\r`);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("reads non-canonical delimiters from the header before scanning P (no false miss)", () => {
    // Field '#', component '*'. The name components must still be found and flagged.
    const r = scan("nonstd-delims.astm", "H#~*!\rP#1#A#B##SMITH*ALICE##20200101#F\r");
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/SMITH/);
  });

  it("does not treat a stream without a P record as ASTM PHI (exit 0)", () => {
    const r = scan("no-patient.astm", `${HEADER}O|1|ACC\rR|1|^^^687|28.6|U/L\rL|1\r`);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

describe("phi-scan starter: the override-log gate", () => {
  it("rejects --allow-fixture without a matching override entry (exit 2)", () => {
    const clean = join(dir, "override-me.txt");
    writeFileSync(clean, "nothing to see\n");
    const r = runScanner(["--allow-fixture", clean]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/phi-scan-overrides\.md/);
  });
});

// ---------------------------------------------------------------------------
// Entries that are not regular files, on BOTH enumerating routes
// ---------------------------------------------------------------------------
//
// PHI-SCAN-SYMLINK-BLIND-ON-BOTH-ROUTES. The walk enumerates `Dirent.isFile()`,
// an lstat answer, so a symbolic link is neither a file nor a directory;
// `--staged` reads content with `git show :<path>`, and git stores a link as its
// TARGET PATH under mode 120000. A link under a scan root pointing at a
// PHI-bearing file therefore used to scan CLEAN on both. These cases pin the
// refusal on each route, the negative controls that keep ordinary files scanned
// on each route, and the rule that a refusal never echoes what is on the other
// side of the link.
//
// Every case runs against a THROWAWAY GIT REPOSITORY, never against this one:
// the scanner roots everything at `process.cwd()`, so a synthetic tree is enough
// and no link or violator is ever written into the committed corpus.

/**
 * Synthetic, name-bearing payload, shaped as an ASTM record stream so that this
 * package's OWN structured P-record detectors fire on it as well as the
 * cross-cutting floor. A payload with no name proves nothing about a claim that
 * names do not leak. Every value is invented.
 */
const SYNTHETIC_PHI =
  [
    "H|\\^&",
    "P|1|A|B||RIVERA^JUANITA^Q|WELDON|19780314|F",
    "SSN: 123-45-6789",
    "Contact: juanita.rivera@example-hospital.org",
    "L|1",
  ].join("\r") + "\r";

/** The link target's own name carries a synthetic name, so an echo of it is visible. */
const TARGET_NAME = "RIVERA-JUANITA-1978-03-14.txt";

/** Tokens that must never appear in a refusal message. */
const PHI_TOKENS = [
  "RIVERA",
  "JUANITA",
  "WELDON",
  "19780314",
  "1978-03-14",
  "123-45-6789",
  "juanita.rivera@example-hospital.org",
  TARGET_NAME,
];

function expectNoPhi(stderr: string): void {
  for (const t of PHI_TOKENS) expect(stderr).not.toContain(t);
}

function git(cwd: string, args: string[]): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  if ((r.status ?? -1) !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
}

function gitOut(cwd: string, args: string[]): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  return r.stdout ?? "";
}

function runIn(cwd: string, args: string[]): RunResult {
  const r = spawnSync(TSX_BIN, [SCANNER_PATH, ...args], { cwd, encoding: "utf8", shell: false });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

const repos: string[] = [];

/**
 * A throwaway git repo laid out the way the scanner expects: an allow-list under
 * `scripts/`, a `src/` walk root, and one ordinary source file so the walk has
 * something legitimate to find.
 */
function makeRepo(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "phi-scan-repo-")));
  repos.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "src"));
  copyFileSync(
    join(REPO_ROOT, "scripts", "phi-allow-list.txt"),
    join(root, "scripts", "phi-allow-list.txt"),
  );
  writeFileSync(join(root, "src", "ordinary.ts"), "export const answer = 42;\n");
  git(root, ["init", "-q", "."]);
  return root;
}

afterAll(() => {
  for (const r of repos) rmSync(r, { recursive: true, force: true });
});

describe("phi-scan: the synthetic payload is genuinely detectable", () => {
  // Guards against proving nothing by fixture: every refusal case below rests on
  // this payload being something the scanner would otherwise catch.
  it("as a plain regular file it is a hit (exit 1), on the floor AND on the P-record loci", () => {
    const root = makeRepo();
    writeFileSync(join(root, "src", "violator.ts"), SYNTHETIC_PHI);
    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("123-45-6789");
    expect(r.stderr).toContain("juanita.rivera@example-hospital.org");
    expect(r.stderr).toContain("P-6 (name)");
    expect(r.stderr).toContain("RIVERA");
    expect(r.stderr).toContain("P-8 (dob)");
  });

  it("a repo with no link and no violator scans clean (exit 0)", () => {
    const root = makeRepo();
    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK: no hits/);
  });
});

describe("phi-scan: the all-mode walk refuses a non-regular entry", () => {
  it("refuses a symlink under a walk root pointing at PHI (exit 2), and reports no PHI", () => {
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(join("..", TARGET_NAME), join(root, "src", "leak.ts"));

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("src/leak.ts");
    expect(r.stderr).toContain("a symbolic link");
    expectNoPhi(r.stderr);
    expect(r.stdout).not.toMatch(/OK/);
  });

  it("refuses a symlinked DIRECTORY too, which isDirectory() also answers false for", () => {
    const root = makeRepo();
    mkdirSync(join(root, "elsewhere"));
    writeFileSync(join(root, "elsewhere", TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(join("..", "elsewhere"), join(root, "src", "linked-dir"));

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("src/linked-dir");
    expectNoPhi(r.stderr);
  });

  it("names EVERY offender, not just the first", () => {
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(join("..", TARGET_NAME), join(root, "src", "one.ts"));
    symlinkSync(join("..", TARGET_NAME), join(root, "src", "two.ts"));

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("src/one.ts");
    expect(r.stderr).toContain("src/two.ts");
    expect(r.stderr).toContain("2 entries");
    expectNoPhi(r.stderr);
  });

  it("refuses a link under the OTHER walk root (test/fixtures), not just src", () => {
    const root = makeRepo();
    mkdirSync(join(root, "test", "fixtures"), { recursive: true });
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(join("..", "..", TARGET_NAME), join(root, "test", "fixtures", "leak.astm"));

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/leak.astm");
    expectNoPhi(r.stderr);
  });

  it("does not excuse a link because its name ends .md (the walk's .md exemption is for files)", () => {
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(join("..", TARGET_NAME), join(root, "src", "notes.md"));

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("src/notes.md");
    expectNoPhi(r.stderr);
  });

  it("still scans ordinary files in the same walk root (the refusal is not the only outcome)", () => {
    const root = makeRepo();
    writeFileSync(join(root, "src", "violator.ts"), SYNTHETIC_PHI);
    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
  });

  it("an ignored link is out of scope, by the same rule that already excludes an ignored file", () => {
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(join("..", TARGET_NAME), join(root, "src", "leak.ts"));
    writeFileSync(join(root, ".gitignore"), "src/leak.ts\n");

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("but an entry already in the index cannot be excused that way", () => {
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(join("..", TARGET_NAME), join(root, "src", "leak.ts"));
    writeFileSync(join(root, ".gitignore"), "src/leak.ts\n");
    git(root, ["add", "-f", "src/leak.ts"]);

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("src/leak.ts");
    expectNoPhi(r.stderr);
  });
});

describe("phi-scan: the --staged route refuses a staged non-regular entry", () => {
  it("git really does store the link as its target path, not the target's bytes", () => {
    // The measurement the refusal rests on. If git ever changed this, the
    // refusal below would be arguing from a premise that no longer holds.
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(join("..", TARGET_NAME), join(root, "src", "leak.ts"));
    git(root, ["add", "src/leak.ts"]);

    expect(gitOut(root, ["ls-files", "--stage", "src/leak.ts"])).toMatch(/^120000 /);
    const shown = gitOut(root, ["show", ":src/leak.ts"]);
    expect(shown.trim()).toBe(`../${TARGET_NAME}`);
    expect(shown).not.toContain("123-45-6789");
  });

  it("refuses a staged symlink (exit 2), and reports no PHI", () => {
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(join("..", TARGET_NAME), join(root, "src", "leak.ts"));
    git(root, ["add", "src/leak.ts"]);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("src/leak.ts");
    expect(r.stderr).toContain("a symbolic link");
    expectNoPhi(r.stderr);
  });

  it("refuses a TYPECHANGE: a tracked regular file replaced by a link (exit 2)", () => {
    // The shape `--diff-filter=AM` used to delete before any mode could be read.
    // Replacing a TRACKED file with a link is neither an add nor a modify: git
    // raises `:100644 120000 <sha> <sha> T`, and without `T` in the filter the
    // record never existed, so the pre-commit hook passed the link green.
    const root = makeRepo();
    git(root, ["add", "src/ordinary.ts"]);
    git(root, ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "base"]);

    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    rmSync(join(root, "src", "ordinary.ts"));
    symlinkSync(join("..", TARGET_NAME), join(root, "src", "ordinary.ts"));
    git(root, ["add", "src/ordinary.ts"]);

    // The premise: git really does raise this as a typechange, not A or M.
    expect(gitOut(root, ["diff", "--cached", "--raw", "--diff-filter=AM"]).trim()).toBe("");
    expect(gitOut(root, ["diff", "--cached", "--raw"])).toContain(" 120000 ");

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("src/ordinary.ts");
    expect(r.stderr).toContain("a symbolic link");
    expectNoPhi(r.stderr);
  });

  it("scans the other direction of a typechange: a link replaced by a real file (exit 1)", () => {
    const root = makeRepo();
    symlinkSync("ordinary.ts", join(root, "src", "link.ts"));
    git(root, ["add", "src/link.ts"]);
    git(root, ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "base"]);

    rmSync(join(root, "src", "link.ts"));
    writeFileSync(join(root, "src", "link.ts"), SYNTHETIC_PHI);
    git(root, ["add", "src/link.ts"]);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("123-45-6789");
  });

  it("refuses a staged gitlink under a scanned prefix (exit 2)", () => {
    const root = makeRepo();
    mkdirSync(join(root, "test", "fixtures"), { recursive: true });
    const nested = join(root, "test", "fixtures", "nested");
    mkdirSync(nested);
    git(nested, ["init", "-q", "."]);
    writeFileSync(join(nested, "payload.astm"), SYNTHETIC_PHI);
    git(nested, ["add", "payload.astm"]);
    git(nested, ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "n"]);
    git(root, ["add", "test/fixtures/nested"]);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/nested");
    expect(r.stderr).toContain("a gitlink");
    expectNoPhi(r.stderr);
  });

  it("still catches a staged ORDINARY file carrying the same payload (exit 1)", () => {
    // The regression control on the `--raw -z` reparse: reading the mode must not
    // cost the route the ordinary files it was already enumerating.
    const root = makeRepo();
    writeFileSync(join(root, "src", "violator.ts"), SYNTHETIC_PHI);
    git(root, ["add", "src/violator.ts"]);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("src/violator.ts");
    expect(r.stderr).toContain("123-45-6789");
  });

  it("still enumerates several staged files at once (the two-field stride is right)", () => {
    // A one-record list cannot tell a correct stride from a lucky one.
    const root = makeRepo();
    mkdirSync(join(root, "test", "fixtures"), { recursive: true });
    writeFileSync(join(root, "src", "a.ts"), "export const a = 1;\n");
    writeFileSync(join(root, "src", "b.ts"), "export const b = 2;\n");
    writeFileSync(join(root, "test", "fixtures", "c.astm"), SYNTHETIC_PHI);
    git(root, ["add", "src/a.ts", "src/b.ts", "test/fixtures/c.astm"]);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("test/fixtures/c.astm");
    expect(r.stderr).toContain("123-45-6789");
  });

  it("passes a staged ordinary clean file (exit 0)", () => {
    const root = makeRepo();
    git(root, ["add", "src/ordinary.ts"]);
    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK: no hits/);
  });

  it("a staged link OUTSIDE the route's scope is left alone (the scope is unchanged)", () => {
    // `--staged` only ever covered `test/fixtures/**` and `src/**.ts`. The mode
    // check narrows what that scope admits; it does not widen the scope, and
    // saying otherwise would overstate what this closes.
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(TARGET_NAME, join(root, "docs-link.txt"));
    git(root, ["add", "docs-link.txt"]);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The --staged route's ENUMERATION, and what the caller's git config could
// delete from it before any of the refusals above are reached
// ---------------------------------------------------------------------------
//
// PHI-SCAN-RENAME-BLIND-AT-PRECOMMIT. Every WIDENING below has a case that is RED
// on the superseded argv (`--diff-filter=AMT`, rename detection left at the
// caller's default, the caller's `diff.ignoreSubmodules` honored) and green on
// the shipped one. That is 6 of the 11 cases in this block, and "every case below
// is red" would be FALSE of the other 5: they are premises and negative controls
// that measure git itself or a scope this slice does not move, so they are green
// on both by design. They are here because a widening case alone cannot tell you
// whether its premise still holds. The mechanisms are written out once, in the
// argv comment inside `buildTargetsForStaged`; this block is where they are
// measured.

/** The argv fragment the shipped scanner uses. Pinned so the injection below cannot miss. */
const SHIPPED_ARGV_FRAGMENT = `"--no-renames",
        "--ignore-submodules=none",
        "--diff-filter=AMTUB",`;

function commitIn(root: string, message: string): void {
  git(root, ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", message]);
}

function fixturesIn(root: string): string {
  const p = join(root, "test", "fixtures");
  mkdirSync(p, { recursive: true });
  return p;
}

/** Filler with no PHI shapes in it, long enough that git still pairs an edited copy as a rename. */
function filler(lead: string, lines: number): string {
  const out = ["H|\\^&"];
  for (let i = 1; i <= lines; i += 1) out.push(`C|${String(i)}|I|${lead} padding ${String(i)}|G`);
  return `${out.join("\r")}\r`;
}

describe("phi-scan: the --staged route enumerates a staged RENAME", () => {
  it("premise: an ordinary `git mv` is paired as a rename, and the superseded filter deleted it", () => {
    const root = makeRepo();
    fixturesIn(root);
    writeFileSync(join(root, "test", "fixtures", "original.astm"), SYNTHETIC_PHI);
    git(root, ["add", "test/fixtures/original.astm"]);
    commitIn(root, "base");
    git(root, ["mv", "test/fixtures/original.astm", "test/fixtures/renamed.astm"]);

    // Detection at the caller's default pairs it, with a status letter of `R`
    // and TWO paths on one record. No similarity score is asserted: it moves
    // with how much of the old content survives, so a number copied out of one
    // fixture is wrong in the next.
    const paired = gitOut(root, ["diff", "--cached", "--raw"]).trim();
    expect(paired).toMatch(/\bR\d*\t/);
    expect(paired).toContain("test/fixtures/original.astm");
    expect(paired).toContain("test/fixtures/renamed.astm");

    // Which is why the superseded argv saw nothing at all.
    expect(gitOut(root, ["diff", "--cached", "--raw", "--diff-filter=AMT"]).trim()).toBe("");

    // And why turning detection off is the remedy: one single-path `A` record.
    const split = gitOut(root, [
      "diff",
      "--cached",
      "--raw",
      "--no-renames",
      "--ignore-submodules=none",
      "--diff-filter=AMTUB",
    ]).trim();
    expect(split.split("\n")).toHaveLength(1);
    expect(split).toMatch(/\bA\t/);
    expect(split).toContain("test/fixtures/renamed.astm");
  });

  it("catches a fixture RENAMED into place with PHI already in it (exit 1)", () => {
    const root = makeRepo();
    fixturesIn(root);
    writeFileSync(join(root, "test", "fixtures", "original.astm"), SYNTHETIC_PHI);
    git(root, ["add", "test/fixtures/original.astm"]);
    commitIn(root, "base");
    git(root, ["mv", "test/fixtures/original.astm", "test/fixtures/renamed.astm"]);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("test/fixtures/renamed.astm");
    expect(r.stderr).toContain("123-45-6789");
    expect(r.stderr).toContain("P-6 (name)");
    expect(r.stderr).toContain("P-8 (dob)");
  });

  it("catches a rename that also EDITS PHI into the destination blob (exit 1)", () => {
    // The sharper shape: the committed file was clean, and the PHI arrives in
    // the same staging as the move. Git still pairs it, because enough of the
    // old content survives.
    const root = makeRepo();
    fixturesIn(root);
    writeFileSync(join(root, "test", "fixtures", "original.astm"), filler("original", 40));
    git(root, ["add", "test/fixtures/original.astm"]);
    commitIn(root, "base");
    git(root, ["mv", "test/fixtures/original.astm", "test/fixtures/renamed.astm"]);
    writeFileSync(
      join(root, "test", "fixtures", "renamed.astm"),
      `${filler("original", 40)}P|1|A|B||RIVERA^JUANITA^Q|WELDON|19780314|F\r`,
    );
    git(root, ["add", "test/fixtures/renamed.astm"]);

    expect(gitOut(root, ["diff", "--cached", "--raw"]).trim()).toMatch(/\bR\d*\t/);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("test/fixtures/renamed.astm");
    expect(r.stderr).toContain("RIVERA");
    expect(r.stderr).toContain("19780314");
  });

  it("refuses a symbolic link `git mv`d under a scan root (exit 2), and reports no PHI", () => {
    // A `git mv` puts a mode-120000 entry under `test/fixtures/`. The mode check
    // already knew how to refuse it; the pairing is what deleted the record
    // before the mode could be read.
    const root = makeRepo();
    fixturesIn(root);
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(join("..", TARGET_NAME), join(root, "src", "leak.ts"));
    git(root, ["add", "src/leak.ts"]);
    commitIn(root, "base");
    git(root, ["mv", "src/leak.ts", "test/fixtures/leak.astm"]);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/leak.astm");
    expect(r.stderr).toContain("a symbolic link");
    expectNoPhi(r.stderr);
  });

  it("the new enumeration EQUALS the old one when nothing is renamed, copied or unmerged", () => {
    // The relation is a SUPERSET, not a strictly larger set, and the loose form
    // of that is what this case exists to refuse. An index of an add, a modify,
    // a typechange and a delete enumerates identically under both argvs.
    const root = makeRepo();
    fixturesIn(root);
    writeFileSync(join(root, "src", "kept.ts"), "export const kept = 1;\n");
    writeFileSync(join(root, "src", "gone.ts"), "export const gone = 2;\n");
    writeFileSync(join(root, "src", "typed.ts"), "export const typed = 3;\n");
    git(root, ["add", "src/kept.ts", "src/gone.ts", "src/typed.ts"]);
    commitIn(root, "base");

    writeFileSync(join(root, "src", "added.ts"), "export const added = 4;\n");
    writeFileSync(join(root, "src", "kept.ts"), "export const kept = 11;\n");
    rmSync(join(root, "src", "gone.ts"));
    rmSync(join(root, "src", "typed.ts"));
    symlinkSync("kept.ts", join(root, "src", "typed.ts"));
    git(root, ["add", "-A", "src"]);

    const superseded = gitOut(root, ["diff", "--cached", "--raw", "--diff-filter=AMT"]).trim();
    const shipped = gitOut(root, [
      "diff",
      "--cached",
      "--raw",
      "--no-renames",
      "--ignore-submodules=none",
      "--diff-filter=AMTUB",
    ]).trim();
    expect(superseded).not.toBe("");
    expect(shipped).toBe(superseded);
  });
});

describe("phi-scan: the argv the two-field stride is coupled to", () => {
  /** A staged rename, the shape the stride and the flags below are judged on. */
  function renameStage(): string {
    const root = makeRepo();
    fixturesIn(root);
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(join("..", TARGET_NAME), join(root, "src", "leak.ts"));
    git(root, ["add", "src/leak.ts"]);
    commitIn(root, "base");
    git(root, ["mv", "src/leak.ts", "test/fixtures/leak.astm"]);
    return root;
  }

  it("holds under every `diff.renames` / `diff.renameLimit` the caller could set", () => {
    // The point of the flag is that the stride stops depending on the caller's
    // config at all, so the config is what is varied here.
    const root = renameStage();
    for (const setting of ["diff.renames=true", "diff.renames=copies", "diff.renames=false"]) {
      const out = gitOut(root, [
        "-c",
        setting,
        "diff",
        "--cached",
        "--raw",
        "--no-renames",
        "--ignore-submodules=none",
        "--diff-filter=AMTUB",
      ]).trim();
      expect(out.split("\n"), setting).toHaveLength(1);
      expect(out, setting).toContain("test/fixtures/leak.astm");
    }
    const limited = gitOut(root, [
      "-c",
      "diff.renameLimit=1",
      "diff",
      "--cached",
      "--raw",
      "--no-renames",
      "--ignore-submodules=none",
      "--diff-filter=AMTUB",
    ]).trim();
    expect(limited.split("\n")).toHaveLength(1);
  });

  it("`-M`, `-C` and `--find-copies-harder` each reopen the two-path record; do not add them", () => {
    const root = renameStage();
    const enumerated = (extra: string[]): string =>
      gitOut(root, [
        "diff",
        "--cached",
        "--raw",
        "--no-renames",
        ...extra,
        "--ignore-submodules=none",
        "--diff-filter=AMTUB",
      ]).trim();

    expect(enumerated([])).toContain("test/fixtures/leak.astm");
    for (const flag of ["-M", "-C", "--find-copies-harder"]) {
      expect(enumerated([flag]), `${flag} must not be added to the scanner's argv`).toBe("");
    }
    // `-B` is inert FOR A RENAME, which is the whole reason a case that only
    // ever stages a rename reads as a general clearance for the flag. The next
    // case is what that clearance does not cover.
    expect(enumerated(["-B"])).toContain("test/fixtures/leak.astm");
  });

  it("`-B` HIDES a complete rewrite from `--diff-filter=AMTU`, and `B` in the filter is why", () => {
    // The mechanism is sharper than "a `B` record the filter drops". The
    // record's printed status LETTER IS STILL `M`: one path, an `M` with a break
    // score that `RAW_RECORD` parses happily, so a reader checking the raw
    // output concludes `AMTU` keeps it. The score is deliberately not asserted.
    // But `--diff-filter` classifies a broken pair as `B` whatever letter it
    // prints, so `AMTU` deletes the record before anything sees it.
    const root = makeRepo();
    fixturesIn(root);
    const target = join(root, "test", "fixtures", "rewrite.astm");
    writeFileSync(target, filler("original", 60));
    git(root, ["add", "test/fixtures/rewrite.astm"]);
    commitIn(root, "base");
    writeFileSync(target, `${filler("replacement", 60)}C|99|I|SSN 123-45-6789|G\r`);
    git(root, ["add", "test/fixtures/rewrite.astm"]);

    const raw = (extra: string[]): string =>
      gitOut(root, ["diff", "--cached", "--raw", "--no-renames", ...extra]).trim();
    expect(raw(["-B"]), "git must still break the pair for this premise to hold").toMatch(
      /\bM\d{3}\b/,
    );
    expect(raw(["-B", "--diff-filter=AMTU"]), "the superseded filter loses it").toBe("");
    expect(raw(["-B", "--diff-filter=AMTUB"])).toContain("test/fixtures/rewrite.astm");

    // End to end through the scanner: the shipped argv catches it, and a copy of
    // this file with `-B` injected catches it too ONLY because `B` is in the
    // filter. On the superseded filter the injected copy exited 0.
    expect(runIn(root, ["--staged"]).code).toBe(1);

    const source = readFileSync(SCANNER_PATH, "utf8");
    expect(source).toContain(SHIPPED_ARGV_FRAGMENT);
    const withB = join(dir, "phi-scan-with-B.ts");
    writeFileSync(
      withB,
      source.replace(SHIPPED_ARGV_FRAGMENT, `${SHIPPED_ARGV_FRAGMENT}\n        "-B",`),
    );
    const injected = spawnSync(TSX_BIN, [withB, "--staged"], {
      cwd: root,
      encoding: "utf8",
      shell: false,
    });
    expect(injected.status, `stderr: ${injected.stderr ?? ""}`).toBe(1);
    expect(injected.stderr ?? "").toContain("dashed SSN pattern");

    const supersededFilter = join(dir, "phi-scan-with-B-amtu.ts");
    writeFileSync(
      supersededFilter,
      source.replace(
        SHIPPED_ARGV_FRAGMENT,
        `"--no-renames",\n        "-B",\n        "--diff-filter=AMTU",`,
      ),
    );
    const blind = spawnSync(TSX_BIN, [supersededFilter, "--staged"], {
      cwd: root,
      encoding: "utf8",
      shell: false,
    });
    expect(blind.status, "without `B` in the filter the same index scans clean").toBe(0);
    expect(blind.stdout ?? "").toMatch(/OK: no hits/);
  });
});

describe("phi-scan: the caller's git config cannot delete a refusal", () => {
  it("refuses a staged gitlink even under `diff.ignoreSubmodules=all` (exit 2)", () => {
    const root = makeRepo();
    fixturesIn(root);
    const nested = join(root, "test", "fixtures", "nested");
    mkdirSync(nested);
    git(nested, ["init", "-q", "."]);
    writeFileSync(join(nested, "payload.astm"), SYNTHETIC_PHI);
    git(nested, ["add", "payload.astm"]);
    commitIn(nested, "n");
    git(root, ["add", "test/fixtures/nested"]);
    git(root, ["config", "diff.ignoreSubmodules", "all"]);

    // The premise: with that config the record is gone from the superseded argv.
    expect(gitOut(root, ["diff", "--cached", "--raw", "--diff-filter=AMT"])).not.toContain(
      "test/fixtures/nested",
    );

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/nested");
    expect(r.stderr).toContain("a gitlink");
    expectNoPhi(r.stderr);
  });
});

describe("phi-scan: the --staged route refuses an UNMERGED in-scope path", () => {
  /** Write one blob into `root`'s object database and return its id. */
  function hashObject(root: string, content: string): string {
    const r = spawnSync("git", ["hash-object", "-w", "--stdin"], {
      cwd: root,
      input: content,
      encoding: "utf8",
      shell: false,
    });
    if ((r.status ?? -1) !== 0) throw new Error(`git hash-object failed: ${r.stderr ?? ""}`);
    return (r.stdout ?? "").trim();
  }

  /**
   * Leave `path` UNMERGED in the index, with the synthetic payload on one side,
   * by writing stages 1, 2 and 3 for it directly.
   *
   * DELIBERATELY NOT `git merge`. An earlier version of this helper staged a real
   * conflict, and it did not reproduce: on the CI runner's git the merge did not
   * leave the path unmerged at all, so the case asserted its premise against a
   * CLEAN index and only the premise failed. Whether a merge conflicts depends on
   * the merge machinery and on the caller having a git identity, neither of which
   * this case is about. The index state IS the thing under test, so it is
   * constructed rather than provoked, which makes the case deterministic on every
   * git version and on a repo with no identity configured.
   */
  function unmergedIn(root: string, path: string): void {
    const stages = [
      `100644 ${hashObject(root, filler("base", 3))} 1\t${path}`,
      `100644 ${hashObject(root, filler("mainline", 3))} 2\t${path}`,
      `100644 ${hashObject(root, SYNTHETIC_PHI)} 3\t${path}`,
    ];
    const r = spawnSync("git", ["update-index", "--index-info"], {
      cwd: root,
      input: `${stages.join("\n")}\n`,
      encoding: "utf8",
      shell: false,
    });
    if ((r.status ?? -1) !== 0) throw new Error(`git update-index failed: ${r.stderr ?? ""}`);
  }

  it("refuses it (exit 2) rather than reporting clean, and reports no PHI", () => {
    const root = makeRepo();
    fixturesIn(root);
    unmergedIn(root, "test/fixtures/c.astm");

    // The premise, in three parts. The path really is unmerged; it is recorded at
    // stages 1/2/3 and at NO stage 0, which is what `:<path>` names and therefore
    // why there is no one blob for the route to read; and the superseded filter
    // returned no record for it at all.
    expect(gitOut(root, ["ls-files", "-u", "test/fixtures/c.astm"]).trim()).not.toBe("");
    const staged = gitOut(root, ["ls-files", "--stage", "test/fixtures/c.astm"]);
    for (const stage of ["1", "2", "3"]) expect(staged).toContain(` ${stage}\t`);
    expect(staged).not.toContain(" 0\t");
    expect(gitOut(root, ["diff", "--cached", "--raw", "--diff-filter=AMT"])).not.toContain(
      "test/fixtures/c.astm",
    );
    expect(
      gitOut(root, [
        "diff",
        "--cached",
        "--raw",
        "--no-renames",
        "--ignore-submodules=none",
        "--diff-filter=AMTUB",
      ]),
    ).toMatch(/\bU\ttest\/fixtures\/c\.astm/);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/c.astm");
    expect(r.stderr).toContain("unmerged");
    expect(r.stderr).not.toContain("a symbolic link");
    expect(r.stderr).not.toContain("mode-000000");
    expectNoPhi(r.stderr);
  });

  it("leaves an unmerged path OUTSIDE the route's scope alone (the scope is unchanged)", () => {
    const root = makeRepo();
    unmergedIn(root, "notes.txt");

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK: no hits/);
  });
});
