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

/**
 * EVERY VIOLATOR VALUE THIS SUITE FEEDS THE SCANNER IS COMPOSED, NOT WRITTEN,
 * AND THE UNIVERSAL IS THE POINT: one written literal here is a finding in every
 * run of the sweep.
 *
 * The all-mode roots reach `test/**\/*.test.ts` and the record detector reads a
 * stream out of a source literal, so this file is inside the corpus the scanner
 * reads, and the negative corpus of a gate is the one place its own violator
 * shapes legitimately live. Composing them keeps the FLOOR absolute (no
 * allow-list entry, no whole-file bypass, nothing weakened) while leaving this
 * suite's inputs byte-identical to the literals they replaced. It also pins a
 * property of the source-embedded view: that view decodes escape sequences, it
 * does not evaluate expressions, so it cannot reassemble any of these.
 *
 * The name tokens and the birthdate below are DELIBERATELY NOT in
 * `scripts/phi-allow-list.txt`: they are what the positive cases prove the
 * detector still fires on, and declaring one would retire its case silently.
 */
const SSN = ["123", "45", "6789"].join("-");
const NON_TEST_EMAIL = "jane.doe@" + "hospital.org";
const SYNTHETIC_CONTACT_EMAIL = "juanita.rivera@" + "example-hospital.org";
const UNDECLARED_SURNAME = "RIV" + "ERA";
const UNDECLARED_GIVEN = "JUAN" + "ITA";
const UNDECLARED_MAIDEN = "WEL" + "DON";
const UNDECLARED_DOB = "1978" + "0314";

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
    const r = scan("ssn.txt", `patient ssn ${SSN} on file\n`);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(SSN);
    expect(r.stderr).toMatch(/dashed SSN/);
  });

  it("catches an email at a non-test domain (exit 1)", () => {
    const r = scan("email.txt", `contact ${NON_TEST_EMAIL} for records\n`);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(NON_TEST_EMAIL);
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
    const r = scan(
      "undeclared-name.astm",
      `${HEADER}P|1|A|B||${UNDECLARED_SURNAME}^${UNDECLARED_GIVEN}||20200101|F\r`,
    );
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(UNDECLARED_SURNAME);
    expect(r.stderr).toMatch(/P-6 \(name\)/);
  });

  it("catches an undeclared mother's maiden name in P field 7 (exit 1)", () => {
    // DOE / JANE / Q and the DOB are declared; the maiden name is not.
    const r = scan(
      "undeclared-maiden.astm",
      `${HEADER}P|1|A|B||DOE^JANE^Q|${UNDECLARED_MAIDEN}|20200101|F\r`,
    );
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(UNDECLARED_MAIDEN);
    expect(r.stderr).toMatch(/P-7 \(mother's-maiden\)/);
  });

  it("catches an undeclared birthdate in P field 8 (exit 1)", () => {
    const r = scan("undeclared-dob.astm", `${HEADER}P|1|A|B||DOE^JANE||${UNDECLARED_DOB}|F\r`);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(UNDECLARED_DOB);
    expect(r.stderr).toMatch(/P-8 \(dob\)/);
  });

  it("passes a P record whose name + DOB are declared synthetic in the allow-list (exit 0)", () => {
    // DOE / JANE / Q and 20200101 are declared in scripts/phi-allow-list.txt.
    const r = scan("declared.astm", `${HEADER}P|1|A|B||DOE^JANE^Q||20200101|F\r`);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("reads non-canonical delimiters from the header before scanning P (no false miss)", () => {
    // Field '#', component '*'. The name components must still be found and flagged.
    const r = scan(
      "nonstd-delims.astm",
      `H#~*!\rP#1#A#B##${UNDECLARED_SURNAME}*${UNDECLARED_GIVEN}##20200101#F\r`,
    );
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(UNDECLARED_SURNAME);
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
// each throwaway tree carries its own copy of the scanner, so a synthetic tree is enough
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
    `P|1|A|B||${UNDECLARED_SURNAME}^${UNDECLARED_GIVEN}^Q|${UNDECLARED_MAIDEN}|${UNDECLARED_DOB}|F`,
    `SSN: ${SSN}`,
    `Contact: ${SYNTHETIC_CONTACT_EMAIL}`,
    "L|1",
  ].join("\r") + "\r";

/** The link target's own name carries a synthetic name, so an echo of it is visible. */
const TARGET_NAME = `${UNDECLARED_SURNAME}-${UNDECLARED_GIVEN}-1978-03-14.txt`;

/** Tokens that must never appear in a refusal message. */
const PHI_TOKENS = [
  UNDECLARED_SURNAME,
  UNDECLARED_GIVEN,
  UNDECLARED_MAIDEN,
  UNDECLARED_DOB,
  "1978-03-14",
  SSN,
  SYNTHETIC_CONTACT_EMAIL,
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

/**
 * Run the COPY of the scanner that lives inside `root`, from `root`.
 *
 * The scanner derives its repo from its own file location rather than from
 * `process.cwd()`, so a throwaway tree has to carry its own copy: pointing this
 * package's scanner at another directory would scan THIS package no matter where
 * it is run from, which is the property `makeRepo`'s sibling case below pins.
 */
function runIn(cwd: string, args: string[]): RunResult {
  const scanner = join(cwd, "scripts", "phi-scan.ts");
  const r = spawnSync(TSX_BIN, [scanner, ...args], { cwd, encoding: "utf8", shell: false });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

const repos: string[] = [];

/**
 * A throwaway git repo laid out the way the scanner expects: its own copy of the
 * scanner and the allow-list under `scripts/`, and one ordinary file under every
 * declared walk root so the sweep has something legitimate to observe in each.
 *
 * EVERY ROOT IS POPULATED ON PURPOSE. The scanner refuses a root it observed
 * nothing in, so an empty one here would refuse before any case's own condition
 * was reached and every such case would pass for the wrong reason.
 *
 * AND THE INDEX IS POPULATED FOR THE SAME KIND OF REASON. All mode reads the
 * bytes git carries as well as the working tree, and refuses an EMPTY index
 * outright, because every reconciliation it performs is vacuously satisfied by
 * one. This helper used to `git init` and stop, so every all-mode case below ran
 * against an index with nothing in it; those cases would now refuse on that
 * before reaching their own condition. Staging what it wrote is the fix, and it
 * is also the more honest tree: a repo whose files git has never heard of is not
 * the state any of these cases is about. The empty-index refusal gets its own
 * case, built without this helper.
 */
function makeRepo(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "phi-scan-repo-")));
  repos.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "test"));
  copyFileSync(
    join(REPO_ROOT, "scripts", "phi-allow-list.txt"),
    join(root, "scripts", "phi-allow-list.txt"),
  );
  copyFileSync(SCANNER_PATH, join(root, "scripts", "phi-scan.ts"));
  writeFileSync(join(root, "src", "ordinary.ts"), "export const answer = 42;\n");
  writeFileSync(join(root, "test", "ordinary.test.ts"), "export const cases = 1;\n");
  git(root, ["init", "-q", "."]);
  git(root, ["add", "."]);
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
    expect(r.stderr).toContain(SSN);
    expect(r.stderr).toContain(SYNTHETIC_CONTACT_EMAIL);
    expect(r.stderr).toContain("P-6 (name)");
    expect(r.stderr).toContain(UNDECLARED_SURNAME);
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
    expect(shown).not.toContain(SSN);
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
    expect(r.stderr).toContain(SSN);
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
    expect(r.stderr).toContain(SSN);
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
    expect(r.stderr).toContain(SSN);
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
    expect(r.stderr).toContain(SSN);
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
      `${filler("original", 40)}P|1|A|B||${UNDECLARED_SURNAME}^${UNDECLARED_GIVEN}^Q|` +
        `${UNDECLARED_MAIDEN}|${UNDECLARED_DOB}|F\r`,
    );
    git(root, ["add", "test/fixtures/renamed.astm"]);

    expect(gitOut(root, ["diff", "--cached", "--raw"]).trim()).toMatch(/\bR\d*\t/);

    const r = runIn(root, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("test/fixtures/renamed.astm");
    expect(r.stderr).toContain(UNDECLARED_SURNAME);
    expect(r.stderr).toContain(UNDECLARED_DOB);
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
    writeFileSync(target, `${filler("replacement", 60)}C|99|I|SSN ${SSN}|G\r`);
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
    // The injected copies live under the THROWAWAY repo's own `scripts/`, not in
    // a bare temp dir: the scanner derives its repo from its own file location,
    // so a copy parked elsewhere would resolve the allow-list and every walk
    // root against that elsewhere and refuse before the argv under test ran.
    const withB = join(root, "scripts", "phi-scan-with-B.ts");
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

    const supersededFilter = join(root, "scripts", "phi-scan-with-B-amtu.ts");
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

// ---------------------------------------------------------------------------
// The two halves of the walk-root scope, and the rule that a sweep must OBSERVE
// ---------------------------------------------------------------------------
//
// ENUMERATION and DETECTION are separate holes with separate fixes, and closing
// one of them alone buys the SSN/email floor and nothing else. The cases below
// are paired for that reason: each widening is measured RED on a copy of this
// scanner carrying the superseded clause and GREEN on the shipped one, and each
// carries a control proving the new path cannot invent a finding.
//
// Every superseded copy is built by replacing ONE committed fragment of the
// shipped source, and the replacement asserts the fragment is still there, so a
// case cannot quietly stop measuring anything when the source moves under it.

/** The shipped walk-root declaration, and the scope it superseded. */
const SHIPPED_WALK_ROOTS = `const WALK_ROOT_NAMES = ["src", "test", "scripts"] as const;`;
const SUPERSEDED_WALK_ROOTS = `const WALK_ROOT_NAMES = ["src", "test/fixtures"] as const;`;

/** The shipped source-embedding extension set, and an empty one (no decoded view at all). */
const SHIPPED_EMBEDDING_SET = `new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".py"])`;
const NO_EMBEDDING_SET = `new Set<string>([])`;
const EMBEDDING_SET_WITH_ASTM = SHIPPED_EMBEDDING_SET.replace(`new Set([`, `new Set([".astm", `);

/** The call that asks for the source-literal record split, and the same call without it. */
const SHIPPED_LITERAL_SPLIT = `scanAstmPatientLoci(target.path, decodeEmbeddedEscapes(text), allow, embedded, true);`;
const NO_LITERAL_SPLIT = `scanAstmPatientLoci(target.path, decodeEmbeddedEscapes(text), allow, embedded, false);`;

/** The clause that consumes an escaped backslash as a PAIR, and the same decoder without it. */
const SHIPPED_BACKSLASH_PAIR = `    if (n === "\\\\" || n === '"' || n === "'" || n === "\`") {`;
const GREEDY_BACKSLASH = `    if (n === '"' || n === "'" || n === "\`") {`;

/**
 * A copy of the shipped scanner with one fragment replaced, written into `root`'s
 * OWN `scripts/`. It has to live there: the scanner derives its repo from its own
 * file location, so a copy parked anywhere else resolves the allow-list and every
 * walk root against that elsewhere.
 */
function variantIn(root: string, name: string, from: string, to: string): string {
  const source = readFileSync(SCANNER_PATH, "utf8");
  expect(source, `this case measures a fragment that has moved:\n${from}`).toContain(from);
  const p = join(root, "scripts", name);
  writeFileSync(p, source.replace(from, to));
  return p;
}

function runVariant(root: string, scanner: string, args: string[] = []): RunResult {
  const r = spawnSync(TSX_BIN, [scanner, ...args], { cwd: root, encoding: "utf8", shell: false });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/**
 * One patient record, with the undeclared tokens composed in, reused by the
 * three literal SHAPES below. All three are live in the committed corpus, and an
 * escape sequence inside the literal supplies a record boundary for only ONE of
 * them, which is why the source view splits on the string-literal delimiters as
 * well.
 */
const RECORD_TEXT = `P|1||LAB-0001||${UNDECLARED_SURNAME}^${UNDECLARED_GIVEN}||${UNDECLARED_DOB}|F`;

/** SHAPE A: one record in one literal, with no separator to split on. */
const SINGLE_RECORD_SOURCE = `export const record = "${RECORD_TEXT}\\r";\n`;

/** SHAPE C: records as array elements, joined at run time. */
const ARRAY_JOINED_SOURCE = `export const stream = ["H|\\\\^&", "${RECORD_TEXT}", "L|1|N"].join("\\r");\n`;

/** SHAPE B: a whole stream in one literal, its records separated inside it. */
const EMBEDDED_LITERAL_SOURCE =
  "export const stream =\n" +
  `  "H|\\\\^&\\r` +
  `P|1||LAB-0001||${UNDECLARED_SURNAME}^${UNDECLARED_GIVEN}||${UNDECLARED_DOB}|F\\r` +
  `L|1|N\\r";\n`;

describe("phi-scan walk-root scope: ENUMERATION, measured against the superseded roots", () => {
  it("reaches a PHI-bearing file under `test/` that the superseded roots never opened", () => {
    const root = makeRepo();
    const violator = join(root, "test", "records", "inline.test.ts");
    mkdirSync(join(root, "test", "records"), { recursive: true });
    writeFileSync(violator, EMBEDDED_LITERAL_SOURCE);
    fixturesIn(root);
    writeFileSync(join(root, "test", "fixtures", "ordinary.astm"), "H|\\^&\rL|1\r");

    const base = variantIn(root, "phi-scan-base.ts", SHIPPED_WALK_ROOTS, SUPERSEDED_WALK_ROOTS);
    const before = runVariant(root, base);
    expect(before.code, `stderr: ${before.stderr}`).toBe(0);
    expect(before.stdout).toMatch(/OK: no hits/);

    const after = runIn(root, []);
    expect(after.code, `stderr: ${after.stderr}`).toBe(1);
    expect(after.stderr).toContain("test/records/inline.test.ts");
    expect(after.stderr).toContain(UNDECLARED_SURNAME);
  });

  it("still opens everything the superseded roots did (the new scope is a SUPERSET)", () => {
    const root = makeRepo();
    fixturesIn(root);
    writeFileSync(join(root, "test", "fixtures", "violator.astm"), SYNTHETIC_PHI);

    expect(runIn(root, []).code).toBe(1);
    const base = variantIn(root, "phi-scan-base.ts", SHIPPED_WALK_ROOTS, SUPERSEDED_WALK_ROOTS);
    expect(runVariant(root, base).code).toBe(1);
  });
});

describe("phi-scan walk-root scope: DETECTION, because enumerating a file is not reading it", () => {
  it("reads a stream embedded as a `.ts` literal, which the byte view alone cannot", () => {
    const root = makeRepo();
    writeFileSync(join(root, "src", "inline.ts"), EMBEDDED_LITERAL_SOURCE);

    // RED before: the same file, same roots, with no decoded view at all. This is
    // the half that would have been missed by widening the roots alone, and
    // `src/` has been a root all along, so nothing here is about enumeration.
    const base = variantIn(root, "phi-scan-flat.ts", SHIPPED_EMBEDDING_SET, NO_EMBEDDING_SET);
    const before = runVariant(root, base);
    expect(before.code, `stderr: ${before.stderr}`).toBe(0);

    const after = runIn(root, []);
    expect(after.code, `stderr: ${after.stderr}`).toBe(1);
    expect(after.stderr).toContain("P-6 (name)");
    expect(after.stderr).toContain(UNDECLARED_SURNAME);
    expect(after.stderr).toContain("P-8 (dob)");
  });

  it("reads a SINGLE-RECORD literal, which has no separator inside it to split on", () => {
    const root = makeRepo();
    writeFileSync(join(root, "src", "single.ts"), SINGLE_RECORD_SOURCE);

    // RED before: with the source-literal split off, the decoded view offers one
    // segment beginning with a quote and the detector returns without looking.
    // This is the shape the escape-decode alone does NOT reach.
    const base = variantIn(root, "phi-scan-lines.ts", SHIPPED_LITERAL_SPLIT, NO_LITERAL_SPLIT);
    expect(runVariant(root, base).code, "the base must not already read this shape").toBe(0);

    const after = runIn(root, []);
    expect(after.code, `stderr: ${after.stderr}`).toBe(1);
    expect(after.stderr).toContain(UNDECLARED_SURNAME);
    expect(after.stderr).toContain(UNDECLARED_DOB);
  });

  it("reads records written as ARRAY ELEMENTS and joined at run time", () => {
    const root = makeRepo();
    writeFileSync(join(root, "src", "joined.ts"), ARRAY_JOINED_SOURCE);

    const base = variantIn(root, "phi-scan-lines.ts", SHIPPED_LITERAL_SPLIT, NO_LITERAL_SPLIT);
    expect(runVariant(root, base).code, "the base must not already read this shape").toBe(0);

    const after = runIn(root, []);
    expect(after.code, `stderr: ${after.stderr}`).toBe(1);
    expect(after.stderr).toContain(UNDECLARED_SURNAME);
  });

  it("ANTI-FABRICATION: a quote-split segment never redefines the delimiter set", () => {
    const root = makeRepo();
    // Ordinary prose that begins with the header type letter once a quote has
    // been split on. Read as a declaration it would make `e` the field
    // delimiter for the whole file, and every later record would tokenize on
    // the wrong boundaries. Delimiters are read from the LINE view only, so the
    // record below is still split canonically and its name is still found.
    writeFileSync(
      join(root, "src", "prose.ts"),
      `const note = "Hello, delimiters";\nexport const stream = "${RECORD_TEXT}\\r";\n`,
    );
    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(UNDECLARED_SURNAME);
    expect(r.stderr).toContain("P-6 (name)");
  });

  it("ANTI-FABRICATION: an escaped backslash is consumed as a pair, so no line is invented", () => {
    const root = makeRepo();
    // The source says the two characters `\` and `r`, not a carriage return. A
    // greedy or chained decode splices a record boundary in and reports a patient
    // this file does not contain.
    const text =
      "export const notAStream =\n" +
      `  "value\\\\r` +
      `P|1||LAB-0001||${UNDECLARED_SURNAME}^${UNDECLARED_GIVEN}||${UNDECLARED_DOB}|F";\n`;
    writeFileSync(join(root, "src", "not-a-stream.ts"), text);

    const shipped = runIn(root, []);
    expect(shipped.code, `stderr: ${shipped.stderr}`).toBe(0);
    expect(shipped.stdout).toMatch(/OK: no hits/);

    // ...and the control that keeps that zero from being vacuous: the SAME bytes
    // through a decoder whose backslash-pair arm is removed do fabricate the hit.
    const greedy = variantIn(root, "phi-scan-greedy.ts", SHIPPED_BACKSLASH_PAIR, GREEDY_BACKSLASH);
    const fabricated = runVariant(root, greedy);
    expect(fabricated.code, "the control must reproduce the fabrication").toBe(1);
    expect(fabricated.stderr).toContain(UNDECLARED_SURNAME);
  });

  it("ANTI-FABRICATION: wire data is not decoded, because its backslash is a DELIMITER", () => {
    const root = makeRepo();
    fixturesIn(root);
    // Under the canonical declaration the backslash is the repeat delimiter, so
    // these bytes are one record with two repeats, not two records.
    const bytes =
      "H|\\^&\rR|1|^^^687|28.6\\r" +
      `P|1||LAB-0001||${UNDECLARED_SURNAME}^${UNDECLARED_GIVEN}||${UNDECLARED_DOB}|F|U/L\rL|1|N\r`;
    writeFileSync(join(root, "test", "fixtures", "repeats.astm"), bytes);

    const shipped = runIn(root, []);
    expect(shipped.code, `stderr: ${shipped.stderr}`).toBe(0);

    // The control: the same bytes with `.astm` admitted to the embedding set are
    // decoded, and the fabricated patient record appears. That is why the set is
    // a closed list of SOURCE extensions rather than "every text file".
    const wide = variantIn(
      root,
      "phi-scan-wide.ts",
      SHIPPED_EMBEDDING_SET,
      EMBEDDING_SET_WITH_ASTM,
    );
    const fabricated = runVariant(root, wide);
    expect(fabricated.code, "the control must reproduce the fabrication").toBe(1);
    expect(fabricated.stderr).toContain(UNDECLARED_SURNAME);
  });

  it("a line that merely starts with `P` is not read as a patient record", () => {
    const root = makeRepo();
    // A shell-style alternation: the letter, the default field delimiter, and
    // enough fields to reach the name loci. Its second field is not a sequence
    // number, which is the structural difference from a real P record.
    writeFileSync(
      join(root, "scripts", "prefixes.sh"),
      `PROJECT_PREFIXES='ALPHA|BRAVO|CHARLIE|DELTA|${UNDECLARED_SURNAME}|${UNDECLARED_GIVEN}|ECHO'\n`,
    );
    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("...and the guard does not cost a real patient record its detection", () => {
    const root = makeRepo();
    fixturesIn(root);
    writeFileSync(
      join(root, "test", "fixtures", "seq.astm"),
      `H|\\^&\rP|1||LAB-0001||${UNDECLARED_SURNAME}^${UNDECLARED_GIVEN}||${UNDECLARED_DOB}|F\rL|1\r`,
    );
    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(UNDECLARED_SURNAME);
  });
});

describe("phi-scan: a sweep that OBSERVED nothing refuses (exit 2), per root and overall", () => {
  it("refuses a declared root that does not exist", () => {
    const root = makeRepo();
    rmSync(join(root, "test"), { recursive: true, force: true });
    const r = runIn(root, []);
    expect(r.code, `stdout: ${r.stdout}`).toBe(2);
    expect(r.stderr).toContain("test");
    expect(r.stderr).toContain("observed 0 files");
    expect(r.stdout).not.toMatch(/OK/);
  });

  it("refuses a declared root that exists and is EMPTY (existence is not observation)", () => {
    const root = makeRepo();
    rmSync(join(root, "test", "ordinary.test.ts"), { force: true });
    const r = runIn(root, []);
    expect(r.code, `stdout: ${r.stdout}`).toBe(2);
    expect(r.stderr).toContain("observed 0 files");
  });

  it("refuses a DANGLING symlink root, which `existsSync` follows and answers false for", () => {
    const root = makeRepo();
    rmSync(join(root, "test"), { recursive: true, force: true });
    symlinkSync(join(root, "no-such-directory"), join(root, "test"));
    const r = runIn(root, []);
    expect(r.code, `stdout: ${r.stdout}`).toBe(2);
    expect(r.stderr).toContain("observed 0 files");
  });

  it("refuses a root that is a REGULAR FILE, at this scanner's own invocation code", () => {
    const root = makeRepo();
    rmSync(join(root, "test"), { recursive: true, force: true });
    writeFileSync(join(root, "test"), "not a directory\n");
    const r = runIn(root, []);
    // Exit 2 is derived from THIS scanner's contract (0 clean / 1 hits found /
    // 2 invocation error), not ported from a sibling: before this clause the
    // uncaught `ENOTDIR` exited 1, the one code that means "hits found".
    expect(r.code, `stdout: ${r.stdout}`).toBe(2);
    expect(r.stderr).toContain("not a directory");
  });

  it("A DENOMINATOR DOES NOT DETECT IT: a healthy total hides an unopened root", () => {
    const root = makeRepo();
    // Plenty of observed files overall, and one root observing none of them.
    for (let i = 0; i < 40; i += 1) {
      writeFileSync(
        join(root, "src", `mod-${String(i)}.ts`),
        `export const n${String(i)} = ${String(i)};\n`,
      );
    }
    rmSync(join(root, "test"), { recursive: true, force: true });
    const r = runIn(root, []);
    expect(r.code, `stdout: ${r.stdout}`).toBe(2);
    expect(r.stderr).toContain("observed 0 files");
  });

  it("reconciles against `git ls-files`: a root emptied of TRACKED files refuses and names them", () => {
    const root = makeRepo();
    const tracked = join(root, "test", "kept.test.ts");
    writeFileSync(tracked, "export const kept = 1;\n");
    writeFileSync(join(root, "test", "vanishes.test.ts"), "export const gone = 1;\n");
    git(root, ["add", "test/kept.test.ts", "test/vanishes.test.ts"]);
    commitIn(root, "base");
    rmSync(join(root, "test", "vanishes.test.ts"), { force: true });

    const r = runIn(root, []);
    expect(r.code, `stdout: ${r.stdout}`).toBe(2);
    expect(r.stderr).toContain("test/vanishes.test.ts");
    expect(r.stderr).toContain("did not observe");
    // The half a floor of one cannot reach: the root still observed a file.
    expect(r.stderr).not.toContain("observed 0 files");
  });

  it("a healthy tree with every root observed still reports clean (exit 0)", () => {
    const root = makeRepo();
    git(root, ["add", "."]);
    commitIn(root, "base");
    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK: no hits/);
  });

  it("the observation rule is scoped to the WALK: paths mode is unchanged", () => {
    const root = makeRepo();
    rmSync(join(root, "test"), { recursive: true, force: true });
    const named = join(root, "src", "ordinary.ts");
    const r = runVariant(root, join(root, "scripts", "phi-scan.ts"), [named]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The index corpus: the bytes git carries, read as a UNION with the walk
// ---------------------------------------------------------------------------
//
// RECONCILING PATH SETS IS NOT READING BYTES. The rule above this block compares
// the paths the walk observed against the paths git tracks, which a working tree
// carrying clean DECOY content at a tracked path satisfies completely. Every
// widening below is measured RED on a copy of this scanner with the index route
// removed and GREEN on the shipped one, and each carries a control proving the
// new route cannot invent a finding or lose an old one.
//
// The base copy is the shipped source with ONE call replaced, so it keeps the
// path-set reconciliation exactly as it was and differs only in whether the
// bytes are read. That is the base commit's behaviour, not an approximation of
// it: the superseded scanner reconciled with `git ls-files` per root and never
// opened a blob.

/** The call that reads the index corpus, and the same `main` without it. */
const SHIPPED_INDEX_ROUTE = `      indexTargets = buildTargetsForIndex(index, observed);`;
const NO_INDEX_ROUTE = `      indexTargets = [];`;

/** A repo whose committed bytes carry the payload and whose working tree does not. */
function decoyRepo(): string {
  const root = makeRepo();
  fixturesIn(root);
  writeFileSync(join(root, "test", "fixtures", "patient.astm"), SYNTHETIC_PHI);
  git(root, ["add", "test/fixtures/patient.astm"]);
  commitIn(root, "phi");
  // The decoy: same path, same declared root, clean content, so the walk
  // observes a file at every tracked path and the reconciliation is satisfied.
  writeFileSync(join(root, "test", "fixtures", "patient.astm"), "H|\\^&\rL|1\r");
  return root;
}

describe("phi-scan index corpus: reconciling path SETS is not reading BYTES", () => {
  it("reads a decoyed tracked path the path-set reconciliation reported clean (exit 1)", () => {
    const root = decoyRepo();

    const base = variantIn(root, "phi-scan-base.ts", SHIPPED_INDEX_ROUTE, NO_INDEX_ROUTE);
    const before = runVariant(root, base);
    expect(before.code, `stderr: ${before.stderr}`).toBe(0);
    expect(before.stdout).toMatch(/OK: no hits/);

    const after = runIn(root, []);
    expect(after.code, `stderr: ${after.stderr}`).toBe(1);
    expect(after.stderr).toContain("test/fixtures/patient.astm");
    expect(after.stderr).toContain(SSN);
    expect(after.stderr).toContain(UNDECLARED_SURNAME);
    expect(after.stderr).toContain("P-8 (dob)");
  });

  it("says the bytes are the ones git carries, because editing the file is not the whole fix", () => {
    const root = decoyRepo();
    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("the working tree differs");
    expect(r.stderr).toContain("re-staging");
  });

  it("reaches a tracked path OUTSIDE every walk root, which no route had opened", () => {
    const root = makeRepo();
    mkdirSync(join(root, "examples", "data"), { recursive: true });
    writeFileSync(join(root, "examples", "data", "capture.txt"), SYNTHETIC_PHI);
    git(root, ["add", "examples/data/capture.txt"]);
    commitIn(root, "outside");

    const base = variantIn(root, "phi-scan-base.ts", SHIPPED_INDEX_ROUTE, NO_INDEX_ROUTE);
    expect(runVariant(root, base).code, "the base must not already read this path").toBe(0);

    const after = runIn(root, []);
    expect(after.code, `stderr: ${after.stderr}`).toBe(1);
    expect(after.stderr).toContain("examples/data/capture.txt");
    expect(after.stderr).toContain(UNDECLARED_SURNAME);
    // The walk never reached it, so the file on disk is not "divergent" and the
    // re-staging sentence would be false of it. The origin label still says where
    // the bytes were read.
    expect(after.stderr).toContain("(git index)");
    expect(after.stderr).not.toContain("re-staging");
  });

  it("refuses a tracked symlink outside every walk root, EVEN NAMED `.md` (exit 2)", () => {
    // The `.md` rule is a NAME exemption and must be applied LAST, to entries
    // whose bytes this route can read. Applied first it excuses a link, and git
    // carries a link's TARGET PATH, which is itself a PHI surface: the target
    // here is named for a patient.
    const root = makeRepo();
    writeFileSync(join(root, TARGET_NAME), SYNTHETIC_PHI);
    symlinkSync(TARGET_NAME, join(root, "hidden.md"));
    git(root, ["add", "-f", "hidden.md"]);
    commitIn(root, "link");

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("hidden.md");
    expect(r.stderr).toContain("a symbolic link");
    expectNoPhi(r.stderr);
  });

  it("refuses a tracked gitlink outside every walk root (exit 2), naming it as one", () => {
    const root = makeRepo();
    const nested = join(root, "vendor");
    mkdirSync(nested);
    git(nested, ["init", "-q", "."]);
    writeFileSync(join(nested, "payload.astm"), SYNTHETIC_PHI);
    git(nested, ["add", "payload.astm"]);
    commitIn(nested, "n");
    git(root, ["add", "vendor"]);

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("vendor");
    expect(r.stderr).toContain("a gitlink");
    expectNoPhi(r.stderr);
  });

  it("refuses an EMPTY index rather than reconciling against nothing (exit 2)", () => {
    // Deliberately not `makeRepo`, which now stages what it writes. Zero entries
    // is not a clean corpus, it is no corpus: every clause the observation rule
    // states is satisfied by it for free.
    const root = realpathSync(mkdtempSync(join(tmpdir(), "phi-scan-empty-")));
    repos.push(root);
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "test"));
    copyFileSync(
      join(REPO_ROOT, "scripts", "phi-allow-list.txt"),
      join(root, "scripts", "phi-allow-list.txt"),
    );
    copyFileSync(SCANNER_PATH, join(root, "scripts", "phi-scan.ts"));
    writeFileSync(join(root, "src", "ordinary.ts"), "export const answer = 42;\n");
    writeFileSync(join(root, "test", "ordinary.test.ts"), "export const cases = 1;\n");
    git(root, ["init", "-q", "."]);

    expect(gitOut(root, ["ls-files"]).trim(), "the premise: nothing is in the index").toBe("");

    const r = runIn(root, []);
    expect(r.code, `stdout: ${r.stdout}`).toBe(2);
    expect(r.stderr).toContain("no entries");
    expect(r.stdout).not.toMatch(/OK/);
  });

  it("...and that refusal does not swallow a hit the walk found on the way", () => {
    // Refused BEFORE the walk was scanned, this clause made the run strictly
    // worse than the superseded scanner's for one input: the same tree exited 1
    // naming every locus before, and 2 naming nothing after. An incomplete sweep
    // is still not a verdict, so the code stays 2, but the finding is printed.
    const root = realpathSync(mkdtempSync(join(tmpdir(), "phi-scan-empty-phi-")));
    repos.push(root);
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "test", "fixtures"), { recursive: true });
    copyFileSync(
      join(REPO_ROOT, "scripts", "phi-allow-list.txt"),
      join(root, "scripts", "phi-allow-list.txt"),
    );
    copyFileSync(SCANNER_PATH, join(root, "scripts", "phi-scan.ts"));
    writeFileSync(join(root, "src", "ordinary.ts"), "export const answer = 42;\n");
    writeFileSync(join(root, "test", "fixtures", "patient.astm"), SYNTHETIC_PHI);
    git(root, ["init", "-q", "."]);

    expect(gitOut(root, ["ls-files"]).trim(), "the premise: nothing is in the index").toBe("");

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("no entries");
    expect(r.stderr).toContain("test/fixtures/patient.astm");
    expect(r.stderr).toContain(SSN);
    expect(r.stderr).toContain(UNDECLARED_SURNAME);
    // THE ORDER IS THE FIX, so it is asserted rather than left to containment.
    // Presence alone stays green if a refactor prints the refusal first and the
    // hits after, which is the state this case exists to refuse.
    expect(r.stderr.indexOf(SSN), "the hit must be printed BEFORE the refusal").toBeLessThan(
      r.stderr.indexOf("no entries"),
    );
  });

  it("does NOT credit a walk root: an emptied root still refuses though the index has its files", () => {
    // The observation rule is a statement about the WALK and stays one. Letting
    // the index route satisfy it would retire a trap that is already paid for.
    const root = makeRepo();
    commitIn(root, "base");
    rmSync(join(root, "test"), { recursive: true, force: true });

    const r = runIn(root, []);
    expect(r.code, `stdout: ${r.stdout}`).toBe(2);
    expect(r.stderr).toContain("observed 0 files");
  });

  it("a refusal does not swallow a hit the walk already found", () => {
    const root = makeRepo();
    writeFileSync(join(root, "src", "violator.ts"), SYNTHETIC_PHI);
    const nested = join(root, "vendor");
    mkdirSync(nested);
    git(nested, ["init", "-q", "."]);
    writeFileSync(join(nested, "note.txt"), "nothing here\n");
    git(nested, ["add", "note.txt"]);
    commitIn(nested, "n");
    git(root, ["add", "vendor"]);

    const r = runIn(root, []);
    // An incomplete sweep is not a verdict, whatever it found on the way...
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("a gitlink");
    // ...but the finding is still printed, so the route is never strictly worse
    // than the base commit's output for the same input.
    expect(r.stderr).toContain("src/violator.ts");
    expect(r.stderr).toContain(SSN);
    // AND IT IS PRINTED FIRST, pinned rather than left to containment for the
    // same reason as the empty-index case: containment alone stays green if a
    // refactor prints the refusal ahead of the hits. All three
    // `if (hits.length > 0) report(hits)` sites are new in this slice, so a new
    // guard going unpinned is exactly the shape this whole slice is about.
    expect(r.stderr.indexOf(SSN), "the hit must be printed BEFORE the refusal").toBeLessThan(
      r.stderr.indexOf("a gitlink"),
    );
  });
});

describe("phi-scan index corpus: it is a UNION, and it adds nothing that was not there", () => {
  it("still finds everything the walk found, and reports it exactly once", () => {
    const root = makeRepo();
    fixturesIn(root);
    writeFileSync(join(root, "test", "fixtures", "violator.astm"), SYNTHETIC_PHI);
    git(root, ["add", "test/fixtures/violator.astm"]);

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    // Tracked AND on disk with identical bytes: the byte comparison skips the
    // blob, so the SSN is reported once rather than twice.
    expect(r.stderr.split(SSN)).toHaveLength(2);
    expect(r.stderr).not.toContain("git index");
  });

  it("a healthy tree whose index and working tree agree still reports clean (exit 0)", () => {
    const root = makeRepo();
    commitIn(root, "base");
    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK: no hits/);
  });

  it("markdown is the ONE exclusion, and it is `walk()`'s rule rather than a new one", () => {
    const root = makeRepo();
    writeFileSync(join(root, "notes.md"), SYNTHETIC_PHI);
    git(root, ["add", "notes.md"]);
    commitIn(root, "md");

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);

    // The control that keeps that zero from being vacuous: the same bytes at a
    // path this route does read are a hit, so the exemption is what let it pass.
    const root2 = makeRepo();
    writeFileSync(join(root2, "notes.txt"), SYNTHETIC_PHI);
    git(root2, ["add", "notes.txt"]);
    commitIn(root2, "txt");
    expect(runIn(root2, []).code).toBe(1);
  });

  it("gitignore is NOT consulted here: a tracked file git carries is still content", () => {
    // Deliberately unlike the walk. The walk's ignore rule is about entries it
    // found on disk; an entry in the index is carried whatever `.gitignore` says.
    const root = makeRepo();
    mkdirSync(join(root, "generated"), { recursive: true });
    writeFileSync(join(root, "generated", "out.txt"), SYNTHETIC_PHI);
    writeFileSync(join(root, ".gitignore"), "generated/\n");
    git(root, ["add", "-f", "generated/out.txt"]);
    commitIn(root, "ignored");

    const r = runIn(root, []);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("generated/out.txt");
  });

  it("does not reach `--staged` or `paths`: both are unchanged over a decoyed path", () => {
    // `--staged` decides what a COMMIT is blocked on, so widening it is a hook
    // decision and is not this. `paths` is bounded by the caller's argv, and
    // reads the file the caller named.
    const root = decoyRepo();
    expect(runIn(root, ["--staged"]).code, "nothing is staged beyond the commit").toBe(0);

    const named = runIn(root, ["test/fixtures/patient.astm"]);
    expect(named.code, `stderr: ${named.stderr}`).toBe(0);
    expect(named.stdout).toMatch(/OK: no hits/);
  });
});

describe("phi-scan index corpus: the positive control on the corpus it claims to clear", () => {
  // A GREEN OVER A CORPUS NOBODY OPENED IS THE DEFECT THIS WHOLE ROUTE IS ABOUT,
  // so a case that only shows the scanner passing proves nothing. This one takes
  // THIS PACKAGE'S OWN `package.json`, byte for byte, and puts it at the same
  // out-of-every-walk-root path in a throwaway tree. It is the file that made the
  // gap concrete: 18 tracked non-markdown files sit outside all three walk roots
  // in this repo, and this is the one carrying a token the floor fires on.
  //
  // The green is then shown to be EARNED BY THE DECLARATION rather than by the
  // file never being opened, which is the only difference that matters and the
  // one a passing run cannot show on its own.

  /** This package's own manifest, read off disk so the case cannot go stale silently. */
  const OWN_MANIFEST = readFileSync(join(REPO_ROOT, "package.json"), "utf8");

  /** The declaration that makes the real corpus green, as it appears in the allow-list. */
  const OWN_DOMAIN_DECLARATION = "EMAILDOMAIN cosyte.com";

  it("premise: this package's own manifest carries an address the floor would fire on", () => {
    expect(OWN_MANIFEST).toMatch(/[A-Za-z0-9._%+-]+@cosyte\.com/);
    // ...and it really does sit outside every declared walk root.
    const scanner = readFileSync(SCANNER_PATH, "utf8");
    expect(scanner).toContain(`const WALK_ROOT_NAMES = ["src", "test", "scripts"] as const;`);
  });

  it("the sweep OPENS it: strike the declaration and the same corpus reds (exit 1)", () => {
    const root = makeRepo();
    writeFileSync(join(root, "package.json"), OWN_MANIFEST);
    git(root, ["add", "package.json"]);
    commitIn(root, "manifest");

    // Green, with the shipped allow-list.
    const declared = runIn(root, []);
    expect(declared.code, `stderr: ${declared.stderr}`).toBe(0);
    expect(declared.stdout).toMatch(/OK: no hits/);

    // The control. The ONLY thing that changes is the declaration, so a red here
    // is proof the bytes were read and judged rather than skipped.
    const allowList = join(root, "scripts", "phi-allow-list.txt");
    const text = readFileSync(allowList, "utf8");
    expect(text, "the declaration this control strikes has moved").toContain(
      OWN_DOMAIN_DECLARATION,
    );
    writeFileSync(allowList, text.replace(`${OWN_DOMAIN_DECLARATION}\n`, ""));

    const undeclared = runIn(root, []);
    expect(undeclared.code, `stderr: ${undeclared.stderr}`).toBe(1);
    expect(undeclared.stderr).toContain("package.json");
    expect(undeclared.stderr).toContain("(email)");
  });

  it("...and the base commit's scanner never opened it at all, declaration or none", () => {
    const root = makeRepo();
    writeFileSync(join(root, "package.json"), OWN_MANIFEST);
    git(root, ["add", "package.json"]);
    commitIn(root, "manifest");

    const allowList = join(root, "scripts", "phi-allow-list.txt");
    writeFileSync(
      allowList,
      readFileSync(allowList, "utf8").replace(`${OWN_DOMAIN_DECLARATION}\n`, ""),
    );

    // With the index route removed, the undeclared address is still green,
    // because no route reaches the path. That is the state this slice closes.
    const base = variantIn(root, "phi-scan-base.ts", SHIPPED_INDEX_ROUTE, NO_INDEX_ROUTE);
    const before = runVariant(root, base);
    expect(before.code, `stderr: ${before.stderr}`).toBe(0);
    expect(before.stdout).toMatch(/OK: no hits/);
  });
});

describe("phi-scan: the scan is about THIS package, whatever directory it is run from", () => {
  it("scans its own repo and not the caller's cwd (the wrong-package negative control)", () => {
    // A worker in this fleet wrote fixtures into a PARENT checkout by building a
    // path from `process.cwd()`. This scanner is the same shape of hazard in
    // reverse: run from elsewhere it could sweep elsewhere and report clean about
    // a package it never opened.
    const elsewhere = makeRepo();
    writeFileSync(join(elsewhere, "src", "violator.ts"), SYNTHETIC_PHI);

    // This package's OWN scanner, invoked with cwd set to that tree.
    const r = spawnSync(TSX_BIN, [SCANNER_PATH], {
      cwd: elsewhere,
      encoding: "utf8",
      shell: false,
    });
    expect(r.status, `stderr: ${r.stderr ?? ""}`).toBe(0);
    expect(r.stdout ?? "").toMatch(/OK: no hits/);
    expect(r.stderr ?? "").not.toContain(UNDECLARED_SURNAME);
    // ...and the copy that DOES live in that tree finds it, so the zero above is
    // a statement about which repo was read, not about the payload.
    expect(runIn(elsewhere, []).code).toBe(1);
  });
});
