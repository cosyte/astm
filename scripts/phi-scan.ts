#!/usr/bin/env tsx
/**
 * `@cosyte/astm` PHI scanner: the CI / pre-commit half of the PHI commit-gate.
 *
 * Pure Node. Zero runtime deps. `git` is the only subprocess, always via
 * `execFileSync` with array args (never shell-form). Walks this package's own
 * corpus (the roots are `WALK_ROOT_NAMES` below) and REFUSES anything that looks
 * like real PHI, so a developer cannot commit a real-looking fixture by
 * accident.
 *
 * ===========================================================================
 * ██  STARTER: READ BEFORE YOU RELY ON THIS  ███████████████████████████████
 * ===========================================================================
 *
 *   This file began as the SHARED MACHINERY plus a format-agnostic FLOOR: a
 *   dashed Social Security Number (`\d{3}-\d{2}-\d{4}`) and an email at a
 *   non-test domain. On top of that floor it now reads the ASTM `P` record's
 *   own loci. WHAT THAT COVERS AND WHAT IT LEAVES OPEN IS STATED ONCE, in
 *   `scanTarget` below, and that sentence is the only one to trust or to
 *   correct: this banner used to carry a second copy and it had gone false.
 *
 *   ⚠  Two halves, and shipping one is worse than shipping neither, because a
 *      green then means less than a reader takes it for. ENUMERATION decides
 *      which files are opened (`WALK_ROOT_NAMES`, and the reconciliation in
 *      `refuseUnobserved` that refuses when the sweep did not observe them).
 *      DETECTION decides what is found once a file is open, and it is not
 *      implied by the first: this package writes most of its streams as `.ts`
 *      string literals, which the record detector read as a single line
 *      beginning with a quote until the source-embedded view was added beside
 *      it. Widen one and ask what the other now misses.
 *
 *   Worked examples of structured, format-aware detection live in the sibling
 *   parsers:
 *       ../hl7/scripts/phi-scan.ts     (segment → field → component aware)
 *       ../x12/scripts/phi-scan.ts     (ISA-delimited NM1 / DMG / PER aware)
 *       ../dicom/scripts/phi-scan.ts   (binary tag-aware)
 *       ../ccda/scripts/phi-scan.ts    (XML element aware)
 *       ../ncpdp/scripts/phi-scan.ts   (fixed-field aware)
 *   Read one for its mechanism, never for its scope: every repo's roots and
 *   residuals are its own, and porting a sibling's list is how a scope that does
 *   not apply here gets recorded as measured.
 *
 *   The mechanism for declaring genuinely-synthetic identifiers is the
 *   allow-list (`scripts/phi-allow-list.txt`): a positive declaration that a
 *   fixture's identifiers are fake. Byte-strict formats cannot carry an inline
 *   `# synthetic: true` header, so the allow-list is the proven substitute
 *   (same approach every sibling uses). A whole-file bypass needs
 *   `--allow-fixture <path>` AND a logged entry in `phi-scan-overrides.md`.
 * ===========================================================================
 *
 * Modes:
 *   --staged                 - scan only files staged in `git diff --cached`
 *   --allow-fixture <path>   - bypass one path; rejected unless logged in
 *                              phi-scan-overrides.md
 *   <path> [<path>...]       - scan specific paths
 *   (no args)                - scan all in-scope working-tree files
 *
 * Exit codes: 0 (clean), 1 (hits found), 2 (invocation error).
 *
 * ---------------------------------------------------------------------------
 * AN IN-SCOPE ENTRY THAT IS NOT A REGULAR FILE REFUSES THE SCAN (exit 2). It is
 * never silently skipped, because BOTH enumerating routes are blind to it in a
 * way that reads as clean:
 *
 *   - the walk enumerates `Dirent.isFile()`, which is an lstat answer, so a
 *     symbolic link is neither a file nor a directory and used to fall out of
 *     the loop silently, whatever it pointed at;
 *   - `--staged` reads content with `git show :<path>`, and git stores a
 *     symbolic link as its TARGET PATH under mode 120000, so that route is
 *     handed the path text and never the target's bytes.
 *
 * So a link under a scan root pointing at a PHI-bearing file scanned CLEAN on
 * both. Neither route is made to follow it: following would read bytes the
 * enumeration does not control (outside the repo, a loop, a device, a FIFO that
 * blocks the gate forever), and git does not carry those bytes anyway, so a hit
 * on them would be a claim about something no commit contains. Refusing states
 * the only true thing available: there is an entry here the scan cannot account
 * for, so the scan is not clean.
 *
 * "In scope" is each route's own existing boundary, not a new one: the walk
 * still excludes a gitignored entry (the same rule that already excludes a
 * gitignored file), and `--staged` still only looks at `test/fixtures/**` and
 * `src/**.ts`. This narrows what those scopes ADMIT; it does not widen the
 * scopes. Two excuses that work for a FILE do not work for a link, both
 * deliberately, and both fail safe. The walk's `.md` exemption: see `walk` below
 * for why a name is no evidence about what is on the other side of a link. And
 * `--allow-fixture` ON THE `--staged` ROUTE, because a refusal is raised while
 * that route's target list is being built and the whole-file bypass is applied
 * to the finished list afterwards. That second one is scoped to `--staged` on
 * purpose: passing `--allow-fixture` with no positional path switches the run
 * into paths mode, so the WALK does not run at all, for a file and for a link
 * alike. That is pre-existing, and it is not a link-versus-file asymmetry.
 *
 * The `--staged` route has a SECOND refusal, on an in-scope path git reports as
 * UNMERGED. That one was reached by putting `U` in the `--diff-filter`, which had
 * been dropping it. The route's argv also names two git-config settings, for two
 * different reasons: `diff.ignoreSubmodules` was measured deleting a record the
 * mode refusal below would otherwise have caught, and rename pairing was measured
 * deleting one at git's DEFAULT, with no setting present at all, which is why
 * `--no-renames` is there rather than any particular value being blamed. Naming
 * them is a list of what is closed, not a proof that no other setting can delete a
 * record. All of it is explained where it is decided, in the argv note inside
 * `buildTargetsForStaged`, which is the one place the enumeration's rules are
 * written out.
 *
 * Note also that a walk ROOT is handed to `existsSync`/`readdirSync` directly
 * and is never classified as a `Dirent`, so a root that is itself a link is not
 * refused: pointed at a directory it is followed and read through. "Follow
 * nothing" is a rule about the entries a walk enumerates, not about the roots it
 * is pointed at. Pointed at a NON-directory it is now refused by `walk`, which
 * is where that clause is decided and the only place its reason is written out.
 *
 * A refusal names the entry's own repo-relative path and an engine-owned token
 * for its kind. IT NEVER REPORTS THE LINK TARGET, which is text off the working
 * tree and can itself carry PHI: a target path of the shape
 * `../patients/<surname>-<given>-<dob>.txt` is the whole reason. The shape is
 * written out rather than an example, because a diagnostic ABOUT a PHI leak is
 * itself a PHI surface, and that applies to the prose explaining it too.
 *
 * An all-mode sweep that did not OBSERVE its corpus now refuses too, per root
 * and for the invocation as a whole, reconciled against the paths git carries.
 * That clause is decided in `refuseUnobserved`, which is the one place its
 * reasons are written out.
 *
 * AND ALL MODE NOW READS THE BYTES GIT CARRIES, as a UNION with the walk rather
 * than in place of it: reconciling PATH SETS is not reading content, so a path
 * whose committed bytes and working-tree bytes differ was reported clean over
 * the wrong ones. The mechanism, everything it closes and everything it
 * deliberately does not do are written out ONCE, at `buildTargetsForIndex`, and
 * this paragraph states only the consumer-facing property.
 *
 * WHAT IS STILL NOT CLOSED HERE, AND STATED SO IT IS NOT MISTAKEN FOR CLOSED:
 * the `--staged` route's in-scope predicate is NARROWER than the walk's roots,
 * so a commit staging only files outside it is not blocked by the pre-commit
 * hook and the rest of the corpus is caught in CI instead. The predicate itself
 * is written once, above; it is not repeated here, because two copies of a scope
 * is how one of them goes false. Widening it decides what a COMMIT is blocked on
 * rather than what this scanner can see, which is why it is not a rider on the
 * walk.
 * ---------------------------------------------------------------------------
 */

import { readFileSync, statSync, existsSync, readdirSync, type Dirent } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, sep, isAbsolute, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * The repository this scan is about, derived from THIS FILE's own location and
 * never from `process.cwd()`.
 *
 * Every scan root, the allow-list, the override log and the `git ls-files`
 * reconciliation below hang off it, so a cwd-derived root points the whole gate
 * at whatever tree the caller happened to be standing in: run from a parent
 * checkout it walks that tree's `src/`, reads that tree's allow-list, and
 * reports `OK: no hits` having never opened this package. Positional paths are
 * still resolved against the caller's cwd, because those are the caller's own
 * argument rather than this package's corpus.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOW_LIST_PATH = join(REPO_ROOT, "scripts", "phi-allow-list.txt");
const OVERRIDE_LOG_PATH = join(REPO_ROOT, "phi-scan-overrides.md");

/**
 * Roots walked in "all" mode, re-derived for THIS repo rather than ported from a
 * sibling. Every one gets the same pass: the cross-cutting floor plus the
 * record-aware detector, over the file's bytes and (for a source file) over its
 * string literals decoded.
 *
 * `test` rather than `test/fixtures`, because this package's fixtures are not
 * all files: most of its ASTM streams are inline `.ts` string literals in
 * `test/**\/*.test.ts`, and the narrower root left every one of them read by
 * hand. `scripts` because the allow-list and the gate scripts are hand-written
 * text in the same tree. `src` because a JSDoc `@example` is a fixture a
 * consumer reads.
 *
 * `docs-content` because the bundle is PUBLISHED AND IMMUTABLE. Its pages are
 * tarred into a release asset the docs site re-fetches forever, so an identifier
 * written into an example there cannot be corrected in place by any later diff
 * to any repo: it is superseded by a later release and renders until then. This
 * root was deliberately absent before, on the reasoning that markdown is prose
 * and a documentation sample may legitimately quote a violator value. That
 * reasoning is why a README, a changelog and the bypass log stay exempt, and it
 * is kept for them; what it does not survive is the immutability of THIS bundle,
 * where the reviewer's judgement has no second chance behind it.
 */
const WALK_ROOT_NAMES = ["src", "test", "scripts", "docs-content"] as const;

/**
 * The shipped docs bundle, named once so the three places that apply the
 * markdown exemption cannot disagree about where it stops.
 */
const DOCS_BUNDLE_ROOT = "docs-content";

/**
 * Markdown is exempt from the sweep EXCEPT inside the shipped docs bundle.
 *
 * ONE PLACE, THREE CALLERS, and that is the reason this is a function rather
 * than a repeated `endsWith`: `walk` decides what is opened, `inWalkScope`
 * decides what the reconciliation expects the walk to have opened, and
 * `buildTargetsForIndex` decides which of the bytes git carries are read. Two of
 * the three disagreeing is either a root that refuses because it "missed" a file
 * it was never meant to open, or a corpus reported clean over bytes nobody read.
 *
 * THIS IS AN ENUMERATION RULE AND NOTHING ELSE. No detector moved with it: a
 * page opened here gets exactly the floor and the record-aware pass every other
 * target gets, and what a green means is unchanged and still stated once, in
 * `scanTarget`.
 *
 * THE CARVE-OUT IS BY PATH, NOT BY NAME, deliberately. A file's name says
 * nothing about which corpus it belongs to, and this rule is about the corpus:
 * `README.md` is a page a reader browses at a URL that can be corrected, and
 * `docs-content/intro.md` is bytes inside a tarball that cannot.
 */
function isMarkdownExempt(repoRelPath: string): boolean {
  const p = repoRelPath.toLowerCase();
  if (!p.endsWith(".md")) return false;
  return !p.startsWith(`${DOCS_BUNDLE_ROOT}/`);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Hit {
  path: string;
  segment: string; // locator (e.g. "(ssn)" / "(email)" or your field id)
  value: string;
  reason: string;
  /**
   * Where the scanned bytes came from, copied off the `Target` after the scan
   * rather than passed into every detector: `undefined` is the working-tree file
   * at `path`, and anything else is `Target.origin`. It exists so the REPORT can
   * name a remedy that is not "edit the file".
   */
  origin?: string;
}

interface AllowList {
  /**
   * Uppercase synthetic person-name tokens. UNUSED by the starter floor: the
   * structured name detector you add in the TODO section consumes these.
   */
  names: Set<string>;
  /**
   * Synthetic dates of birth (raw, format-normalized as you choose). UNUSED by
   * the starter floor: your structured DOB detector consumes these.
   */
  dobs: Set<string>;
  /**
   * Synthetic id values (SSN / MRN / member-id shapes). UNUSED by the starter
   * floor: your structured id detector consumes these.
   */
  ids: Set<string>;
  /** Allowed email domains (anything else is a hit). Used by the starter floor. */
  emailDomains: Set<string>;
}

interface Args {
  mode: "all" | "staged" | "paths";
  paths: string[];
  allowFixtures: string[];
}

class InvocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvocationError";
  }
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Args {
  let staged = false;
  const paths: string[] = [];
  const allowFixtures: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === "--") {
      for (let j = i + 1; j < argv.length; j += 1) {
        const v = argv[j];
        if (v !== undefined) paths.push(v);
      }
      break;
    } else if (a === "--staged") {
      staged = true;
      i += 1;
    } else if (a === "--allow-fixture") {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new InvocationError("--allow-fixture requires a path argument");
      }
      allowFixtures.push(next);
      i += 2;
    } else if (a !== undefined && a.startsWith("--")) {
      throw new InvocationError(`Unknown flag: ${a}`);
    } else if (a !== undefined) {
      paths.push(a);
      i += 1;
    } else {
      i += 1;
    }
  }

  if (staged && paths.length > 0) {
    throw new InvocationError("--staged cannot be combined with positional paths");
  }

  // An `--allow-fixture` path is a *subtractive* acknowledgement on a broader
  // scan, never a scan target on its own, so it also seeds the positional path
  // set. That makes `--allow-fixture X` mean "scan X, but allow it" (proving the
  // override gate actually subtracts a scanned target) instead of a silent no-op.
  const scanPaths = paths.length > 0 ? paths : [...allowFixtures];

  let mode: Args["mode"];
  if (staged) {
    mode = "staged";
  } else if (scanPaths.length > 0) {
    mode = "paths";
  } else {
    mode = "all";
  }
  return { mode, paths: scanPaths, allowFixtures };
}

// ---------------------------------------------------------------------------
// Allow-list + override log
// ---------------------------------------------------------------------------

function loadAllowList(): AllowList {
  if (!existsSync(ALLOW_LIST_PATH)) {
    throw new InvocationError(`allow-list not found at ${ALLOW_LIST_PATH}`);
  }
  const raw = readFileSync(ALLOW_LIST_PATH, "utf8");
  const names = new Set<string>();
  const dobs = new Set<string>();
  const ids = new Set<string>();
  const emailDomains = new Set<string>();
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const sp = line.indexOf(" ");
    if (sp < 0) continue;
    const tag = line.slice(0, sp);
    const value = line.slice(sp + 1).trim();
    if (value.length === 0) continue;
    switch (tag) {
      case "NAME":
        names.add(value.toUpperCase());
        break;
      case "DOB":
        dobs.add(value);
        break;
      case "ID":
        ids.add(value.toUpperCase());
        break;
      case "EMAILDOMAIN":
        emailDomains.add(value.toLowerCase());
        break;
      default:
        break;
    }
  }
  return { names, dobs, ids, emailDomains };
}

function normalizePath(p: string): string {
  const abs = isAbsolute(p) ? p : resolve(REPO_ROOT, p);
  const rel = relative(REPO_ROOT, abs);
  return rel.split(sep).join("/");
}

function loadOverrideLog(): Set<string> {
  if (!existsSync(OVERRIDE_LOG_PATH)) return new Set();
  const raw = readFileSync(OVERRIDE_LOG_PATH, "utf8");
  const out = new Set<string>();
  for (const lineRaw of raw.split(/\r?\n/)) {
    const m = /^###\s+(.+?)\s*$/.exec(lineRaw);
    if (m && m[1] !== undefined) out.add(normalizePath(m[1]));
  }
  return out;
}

function validateAllowFixtures(allowFixtures: string[]): void {
  if (allowFixtures.length === 0) return;
  const overrides = loadOverrideLog();
  const missing = allowFixtures.map(normalizePath).filter((p) => !overrides.has(p));
  if (missing.length > 0) {
    const lines = missing.map((p) => `  - ${p}`).join("\n");
    throw new InvocationError(
      `--allow-fixture rejected: no matching entry in phi-scan-overrides.md for:\n${lines}\n` +
        `Add a "### <path>" subsection to phi-scan-overrides.md and commit it.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Target enumeration
// ---------------------------------------------------------------------------

interface Target {
  path: string; // forward-slash repo-relative path for reporting
  read: () => Buffer;
  /**
   * Where these bytes came from, when that is not the working-tree file at
   * `path`. Printed beside the hit, because the REMEDY differs: bytes git
   * carries are not cleared by editing the file on disk. `undefined` means the
   * ordinary case, the file as it sits in the working tree.
   */
  origin?: string;
}

/**
 * An entry the enumeration reached but cannot scan. Both fields are safe to
 * print: `path` is the entry's own repo-relative path (the same locus every hit
 * already carries) and `kind` is a token from the closed set below. Nothing off
 * the other side of a link is ever recorded here.
 */
interface Unscannable {
  path: string;
  kind: string;
}

/** Closed-set, engine-owned description of a directory entry's kind. */
function direntKind(e: Dirent): string {
  if (e.isSymbolicLink()) return "a symbolic link";
  if (e.isFIFO()) return "a FIFO";
  if (e.isSocket()) return "a socket";
  if (e.isBlockDevice()) return "a block device";
  if (e.isCharacterDevice()) return "a character device";
  return "not a regular file";
}

/**
 * Enumerate a scan root. `Dirent`'s predicates are lstat answers and are not
 * exhaustive: an entry that is neither a directory nor a regular file is
 * collected into `unscannable` rather than dropped, so the caller can refuse
 * instead of reporting clean over it.
 */
function walk(dir: string, out: string[], unscannable: Unscannable[]): void {
  if (!existsSync(dir)) return;
  if (!statSync(dir).isDirectory()) {
    // A root is handed to `readdirSync` directly and is never classified as a
    // `Dirent`, so before this clause a root that resolved to a regular file
    // raised an uncaught `ENOTDIR`. That exits 1, which in this scanner's
    // contract means "hits found", so the one outcome a reader could not tell
    // apart from a real finding was the one where nothing was read at all.
    // Refusing here reports it as what it is, at this scanner's own invocation
    // code. A root that resolves to a DIRECTORY is still followed, link or not:
    // "follow nothing" is a rule about the entries a walk enumerates, not about
    // the roots it is pointed at.
    unscannable.push({ path: normalizePath(dir), kind: "a scan root that is not a directory" });
    return;
  }
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out, unscannable);
    } else if (e.isFile()) {
      // Markdown outside the shipped docs bundle may legitimately describe
      // violator values; it is documentation, not fixtures. Inside the bundle it
      // is read, because those bytes are published immutably. The rule is
      // `isMarkdownExempt`, and it is keyed on the repo-relative PATH rather
      // than on `e.name`, which cannot say which corpus the entry is in.
      if (isMarkdownExempt(normalizePath(full))) continue;
      out.push(full);
    } else {
      // Deliberately NOT subject to the `.md` exemption above. That exemption is
      // a judgement about a file whose bytes the walk could have read; a link's
      // name is no evidence at all about what is on the other side.
      unscannable.push({ path: normalizePath(full), kind: direntKind(e) });
    }
  }
}

/**
 * Refuse (exit 2) over entries the enumeration reached and cannot scan. EVERY
 * offender is named, not just the first: a developer who has to re-run the gate
 * once per link learns to distrust it.
 */
function refuseUnscannable(entries: Unscannable[], why: string, remedy: string): void {
  if (entries.length === 0) return;
  const lines = entries.map((u) => `  - ${u.path} (${u.kind})`).join("\n");
  const noun =
    entries.length === 1 ? "entry is not a regular file" : "entries are not regular files";
  throw new InvocationError(
    `refusing the scan: ${String(entries.length)} ${noun}:\n${lines}\n${why} ${remedy}`,
  );
}

function gitIgnored(paths: string[]): Set<string> {
  const ignored = new Set<string>();
  if (paths.length === 0) return ignored;
  try {
    // SECURITY: array-form execFileSync, no shell. Default (Buffer) encoding:
    // `encoding: "buffer"` with `input` is rejected by Node.
    const out = execFileSync("git", ["check-ignore", "--stdin", "-z"], {
      cwd: REPO_ROOT,
      input: paths.map(normalizePath).join("\0"),
      stdio: ["pipe", "pipe", "ignore"],
    });
    for (const p of out.toString("utf8").split("\0")) {
      if (p.length > 0) ignored.add(p);
    }
  } catch {
    // `git check-ignore` exits 1 when nothing matches: treat as none ignored.
  }
  return ignored;
}

/**
 * Every path git tracks under `rootRel`, taken from the index this invocation
 * already read.
 *
 * ONE ENUMERATION OF WHAT GIT CARRIES, NOT TWO. This used to shell out to
 * `git ls-files -z -- <root>` per root, beside the separate read the index
 * corpus performs, and two independent answers to "what does git track" are two
 * things that can disagree about the corpus. They are now the same list. A
 * failure to obtain it is NOT swallowed: it refuses in `readIndex`, because a
 * silent empty answer here would turn the reconciliation below into a check that
 * always passes, which is the exact shape of gate this whole rule exists to
 * refuse.
 *
 * A pathspec of `<root>` matches the root's own path as well as everything
 * under it, so the prefix test admits both, exactly as the superseded call did.
 */
function trackedUnder(rootRel: string, trackedPaths: ReadonlySet<string>): string[] {
  const prefix = `${rootRel}/`;
  return [...trackedPaths].filter((p) => p === rootRel || p.startsWith(prefix));
}

/**
 * The walk's own in-scope rule, in one place, so the enumeration and the
 * reconciliation cannot drift apart. `isMarkdownExempt` is the walk's markdown
 * exemption, shared rather than restated (see `walk`); an ignored entry is out
 * of scope for both.
 */
function inWalkScope(repoRelPath: string, ignored: Set<string>): boolean {
  if (isMarkdownExempt(repoRelPath)) return false;
  return !ignored.has(repoRelPath);
}

/**
 * Refuse (exit 2) when a sweep did not OBSERVE what it claims to have cleared.
 *
 * Two clauses, because closing one leaves the other open:
 *
 *   - a declared root that observed ZERO targets. Existence is not observation
 *     and a count is not either: a root that never existed, a root emptied, and
 *     a root that is a DANGLING link (`existsSync` follows the link and answers
 *     false, so the walk returns before `readdirSync` and no not-a-regular-file
 *     rule ever fires) all reach `report()` with `OK: no hits` and exit 0. A
 *     total across roots cannot see any of them, because it counts the roots
 *     that DID exist;
 *   - a root whose walk observed FEWER files than git tracks under it. This is
 *     the half a per-root floor of one cannot reach: one surviving file keeps
 *     the count non-zero while the rest of the corpus is gone from the worktree.
 *
 * And the invocation as a whole, which is not implied by either: with the root
 * list itself empty every per-root clause is vacuous.
 */
function refuseUnobserved(
  observedByRoot: Map<string, string[]>,
  ignored: Set<string>,
  trackedPaths: ReadonlySet<string>,
): void {
  const problems: string[] = [];
  let total = 0;

  for (const [rootRel, observed] of observedByRoot) {
    total += observed.length;
    if (observed.length === 0) {
      problems.push(`  - ${rootRel}: declared as a scan root and observed 0 files`);
      continue;
    }
    const seen = new Set(observed);
    const missed = trackedUnder(rootRel, trackedPaths).filter(
      (p) => inWalkScope(p, ignored) && !seen.has(p),
    );
    if (missed.length > 0) {
      const shown = missed.slice(0, 10).map((p) => `      ${p}`);
      if (missed.length > shown.length)
        shown.push(`      ... and ${missed.length - shown.length} more`);
      problems.push(
        `  - ${rootRel}: git tracks ${missed.length} in-scope file(s) the walk did not observe:\n` +
          shown.join("\n"),
      );
    }
  }

  if (observedByRoot.size > 0 && total === 0) {
    problems.push("  - the invocation as a whole observed 0 files across every declared root");
  }
  if (observedByRoot.size === 0) {
    problems.push("  - no scan roots are declared, so the sweep observed nothing by construction");
  }

  if (problems.length === 0) return;
  throw new InvocationError(
    `refusing the scan: it did not observe the corpus it would otherwise report clean over:\n` +
      `${problems.join("\n")}\n` +
      "A clean report over an unopened corpus is worse than no gate: it is the same output as a " +
      "corpus that was read and found clean. Restore the tree, or change the declared roots " +
      "deliberately.",
  );
}

function buildTargetsForAll(trackedPaths: ReadonlySet<string>): Target[] {
  const files: string[] = [];
  const unscannable: Unscannable[] = [];
  const observedByRoot = new Map<string, string[]>();

  for (const rootRel of WALK_ROOT_NAMES) {
    const before = files.length;
    walk(join(REPO_ROOT, rootRel), files, unscannable);
    observedByRoot.set(rootRel, files.slice(before).map(normalizePath));
  }

  // One `git check-ignore` over both lists. An ignored entry is already out of
  // scope for the file route, so applying the same rule to a link keeps a single
  // boundary rather than inventing a second, stricter one for links alone.
  const ignored = gitIgnored([...files.map(normalizePath), ...unscannable.map((u) => u.path)]);

  refuseUnscannable(
    unscannable.filter((u) => !ignored.has(u.path)),
    "The walk can neither read such an entry nor vouch for what is on the other side of it.",
    "Remove it, replace it with a regular file, or (if it is genuinely not part of the " +
      "corpus) untrack it and add it to .gitignore.",
  );

  // After the unscannable refusal, so an entry that is BOTH unreadable and the
  // root's only content is reported as what it is rather than as an empty root.
  for (const [rootRel, observed] of observedByRoot) {
    observedByRoot.set(
      rootRel,
      observed.filter((p) => !ignored.has(p)),
    );
  }
  refuseUnobserved(observedByRoot, ignored, trackedPaths);

  return files
    .filter((abs) => !ignored.has(normalizePath(abs)))
    .map((abs) => ({ path: normalizePath(abs), read: () => readFileSync(abs) }));
}

function buildTargetsForPaths(paths: string[]): Target[] {
  return paths.map((p) => {
    const abs = isAbsolute(p) ? p : resolve(REPO_ROOT, p);
    if (!existsSync(abs)) throw new InvocationError(`File not found: ${p}`);
    if (!statSync(abs).isFile()) throw new InvocationError(`Not a regular file: ${p}`);
    return { path: normalizePath(abs), read: () => readFileSync(abs) };
  });
}

/** git's file modes for a regular blob. Every other mode is not a file to read. */
const REGULAR_BLOB_MODES = new Set(["100644", "100755"]);

/** Closed-set, engine-owned description of a git file mode. */
function gitModeKind(mode: string): string {
  if (mode === "120000") return "a symbolic link";
  if (mode === "160000") return "a gitlink (a nested repository)";
  return `a git mode-${mode} entry`;
}

/**
 * `:<srcmode> <dstmode> <srcsha> <dstsha> <status>`, the info half of a `--raw -z`
 * record. The status letter is captured because `U` has to be told apart from the
 * rest before any mode is read; the score some statuses carry is matched and
 * deliberately not captured, because nothing here branches on it.
 */
const RAW_RECORD = /^:(?:\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ ([A-Z])\d*$/;

/**
 * Refuse (exit 2) over in-scope paths git reports as unmerged. Separate from
 * `refuseUnscannable` because the reason is different and the mode is not the
 * evidence: such a record's destination mode is `000000`, so the mode sentence
 * would be false for it.
 *
 * `why` NAMES THE CALLING ROUTE'S OWN MECHANISM AND IS NOT OPTIONAL PHRASING.
 * The stage-0 fact is shared, but what each route would have done with it is
 * not: the pre-commit route reads a blob with `git show :<path>`, and the index
 * route reads one by the object id the entry holds. A message naming the wrong
 * one sends the reader to a mechanism their route never used.
 */
function refuseUnmerged(paths: string[], why: string): void {
  if (paths.length === 0) return;
  const lines = paths.map((p) => `  - ${p}`).join("\n");
  const noun = paths.length === 1 ? "path is unmerged" : "paths are unmerged";
  throw new InvocationError(
    `refusing the scan: ${String(paths.length)} in-scope ${noun}:\n${lines}\n` +
      "An unmerged path is recorded at one or more of stages 1/2/3 and never at stage 0, and " +
      `${why} Resolve the conflict and \`git add\` the result.`,
  );
}

function buildTargetsForStaged(): Target[] {
  let listBuf: Buffer;
  try {
    // SECURITY: array-form execFileSync, no shell. `--raw` rather than
    // `--name-only` because the DESTINATION MODE is the only thing that
    // distinguishes a staged regular file from a staged symlink or gitlink, and
    // `git show :<path>` answers all three without complaint.
    //
    // `T` (TYPECHANGE) IS IN THE FILTER, AND LEAVING IT OUT MADE THE MODE CHECK
    // BELOW UNREACHABLE WHENEVER THE FILE WAS ALREADY TRACKED. Replacing a TRACKED
    // regular file with a link is not an add and not a modify: git raises it as `T`
    // (`:100644 120000 <sha> <sha> T`), so `--diff-filter=AM` deleted the record
    // before any mode could be read and the hook passed the link green.
    // Typechange carries a single path, exactly like `A` and `M`, so admitting
    // it costs the two-field stride below nothing.
    //
    // THE REST OF THIS ARGV IS ONE RULE: STOP TRUSTING THE CALLER'S GIT CONFIG,
    // AND STOP LETTING THE FILTER DECIDE WHAT IS SAFE TO NOT LOOK AT. Each
    // clause below is measured in `test/scripts/phi-scan.test.ts`, red on the
    // superseded argv and green on this one. This comment is the one place THIS
    // ARGV's mechanisms are written out; everything else that needs them points
    // here. What the route still does not enumerate is a separate matter and is
    // stated beside the parse loop below, where that boundary is applied.
    //
    // `--no-renames`, BECAUSE THE FILTER ALONE WAS NOT ENOUGH. Rename detection
    // is on by default, and neither `AM` nor `AMT` returns `R` or `C`, so
    // `git mv <path> test/fixtures/<name>` staged as
    // `:100644 100644 <sha> <sha> R<score>` with TWO paths and the filter deleted
    // the record outright. Measured, exit 0 and `OK: no hits`, on an ordinary
    // `git mv` of a fixture carrying a dashed SSN, an undeclared patient name
    // and an undeclared birthdate; and again where the move also EDITED PHI
    // into the destination blob, which git still paired as a rename because
    // enough of the old content survived. NO SIMILARITY SCORE IS QUOTED HERE:
    // it moves with how much survives, so a number copied from one fixture is
    // wrong in the next, and what is load-bearing is that it was paired at all.
    // A `git mv` of a SYMBOLIC LINK into a scan root passed the same way, which
    // put a mode-120000 entry under `test/fixtures/` with no refusal.
    // Turning detection off makes the destination arrive as an ordinary
    // single-path `A` (`:000000 100644 0000000 <sha> A`) and the source a `D`
    // the filter drops, so it needs no two-path record shape and costs the
    // two-field stride below nothing. Verified under `diff.renames` at `true`,
    // `copies` and `false`, and under `diff.renameLimit=1`: every one yields the
    // same single-path `A`, so the stride is STRUCTURAL rather than conditional
    // on the caller's config.
    //
    // BE EXACT ABOUT WHAT THAT CHANGES, because the loose form of it is false:
    // the new enumeration is a SUPERSET of the old one, NOT A STRICTLY LARGER
    // SET. The two are EQUAL whenever nothing is renamed, copied, unmerged or
    // hidden by the config below, and larger only when something is. Nothing
    // the old argv enumerated stops being enumerated.
    //
    // `--ignore-submodules=none` BECAUSE THE CALLER'S CONFIG COULD OTHERWISE
    // DELETE A RECORD THIS ROUTE ALREADY KNEW HOW TO REFUSE. A staged gitlink
    // under a scan root is refused below on its mode, but `diff.ignoreSubmodules
    // = all` in the caller's config drops the record before the mode can be
    // read: measured, the same index refused at exit 2 without that config and
    // reported `OK: no hits` at exit 0 with it. This restores the record; it
    // does not widen the scope, and the refusal it feeds is the pre-existing one.
    //
    // `U` (UNMERGED) IS IN THE FILTER SO IT CAN BE REFUSED, NOT SCANNED. Such a
    // path is recorded at one or more of stages 1/2/3 and never at stage 0, and
    // stage 0 is exactly what the `:<path>` form this route reads with names, so
    // there is no one blob for it to read. NOTHING HERE RESTS ON WHAT `git show`
    // DOES WITH SUCH A PATH, deliberately: the route refuses before it would call
    // it, and an earlier draft pinned that exit code and did not reproduce across
    // git versions. It was returned by neither
    // `AM` nor `AMT`, and this route reported `OK: no hits` over an index it
    // could not read (measured, exit 0, with a dashed SSN and an undeclared
    // patient name in one of the stages). Git itself refuses to commit while a
    // path is unmerged, so this was never a route to a committed leak; what it
    // was is a gate attesting clean over a state it never observed, and
    // `pnpm phi-scan --staged` is run by hand and from scripts as well as from
    // the hook. `U` carries a single path like `A`/`M`/`T`, so it costs the
    // stride nothing either. Its destination mode is measured as `000000`, which
    // is why it is refused by `refuseUnmerged` BEFORE any mode is read: the mode
    // refusal's sentence is about links and gitlinks and would be false of it.
    // Either order fails closed, so the ordering buys a true message, not safety.
    //
    // `B` (BROKEN PAIR) IS IN THE FILTER BECAUSE `-B` IS NOT INERT. The
    // mechanism is sharper than "a `B` record the filter drops":
    //
    //   - the raw record's printed status LETTER IS STILL `M`. A complete
    //     rewrite under `-B` prints `:100644 100644 <sha> <sha> M<score>`, one
    //     path, an `M` with a break score. NO SCORE IS QUOTED HERE either, for
    //     the same reason as above. What is load-bearing is the LETTER, and it
    //     is `M`. `RAW_RECORD` above parses it happily, so a reader checking the
    //     raw output concludes the record is an `M` and that `AMTU` keeps it;
    //   - but `--diff-filter` classifies a broken pair as `B` REGARDLESS OF THE
    //     LETTER IT PRINTS, so `AMTU` deletes the record before anything sees
    //     it. Measured on one index in a throwaway repo: `-B --diff-filter=AMTU`
    //     returns EMPTY, `-B --diff-filter=B` and `-B --diff-filter=AMTUB` each
    //     return the same record. Through the scanner, over a staged dashed SSN
    //     in a wholly rewritten in-scope fixture, a copy of this file with `-B`
    //     injected printed `OK: no hits` and exited 0 on the superseded filter
    //     and exits 1 with the hit on this one.
    //
    // Adding `B` costs the enumeration NOTHING today, which is why it is the
    // remedy rather than a warning: git only breaks a pair when `-B` is given,
    // so with the flag absent no `B` record can exist and the two filters
    // enumerate identically. It is there so the flag stops being a silent
    // blindfold if it is ever added. A broken pair carries a SINGLE path, so it
    // costs the two-field stride below nothing either.
    //
    // THE STRIDE BELOW IS COUPLED TO THIS ARGV, so read the coupling before
    // editing it. `--no-renames` is what makes a two-path record impossible, and
    // `-M`, `-C` and `--find-copies-harder` each turn detection back on over the
    // top of it: measured on a real rename stage, every one of the three empties
    // this route again. Do not add them, and do not add `-B` either: with `B` in
    // the filter it is no longer a blindfold, but it still buys nothing.
    listBuf = execFileSync(
      "git",
      [
        "diff",
        "--cached",
        "--raw",
        "-z",
        "--no-renames",
        "--ignore-submodules=none",
        "--diff-filter=AMTUB",
      ],
      {
        cwd: REPO_ROOT,
        encoding: "buffer",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (err) {
    throw new InvocationError(
      `git diff --cached failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // `--raw -z` emits `<info>\0<path>\0` per record. `R` (rename) and `C` (copy)
  // are the only statuses carrying a SECOND path, and `--no-renames` above means
  // git cannot emit either, whatever the caller's `diff.renames` says, so the
  // stride is two fields STRUCTURALLY rather than by the filter's leave. The
  // regex still admits a score-suffixed status: if one ever reached here the
  // stride would desync and the next record would fail to parse, which REFUSES,
  // the same outcome as any other unparseable record and the safe one. A record
  // that does not parse REFUSES rather than being skipped: a silently shortened
  // list is exactly the shape this scan must never report clean over.
  //
  // What this route still does NOT enumerate, stated because the boundary is
  // narrower than the path prefix alone: the filter drops `D`, a deletion, which
  // has no staged blob to scan. That is PRE-EXISTING and deliberate.
  //
  // AND THE FILTER IS AN INCLUDE-LIST, WHICH IS ITSELF A BOUND WORTH NAMING. Of
  // the statuses git documents, `A`/`M`/`T`/`U`/`B` are admitted, `D` is dropped
  // for the reason above, `R`/`C` are made unemittable by `--no-renames`, and `X`
  // is git's own "this is a bug" marker and is not listed. So a letter this list
  // does not name is dropped rather than refused, which is the one place the
  // filter still decides what is safe not to look at. An exclusion form
  // (`--diff-filter=d`) would not have that shape; the include-list is what this
  // route was built on and changing it is a separate decision, not a rider here.
  const fields = listBuf.toString("utf8").split("\0");
  const staged: { path: string; mode: string; status: string }[] = [];
  let i = 0;
  while (i < fields.length) {
    const info = fields[i];
    if (info === undefined || info.length === 0) {
      i += 1;
      continue;
    }
    const m = RAW_RECORD.exec(info);
    const mode = m?.[1];
    const status = m?.[2];
    const path = fields[i + 1];
    if (mode === undefined || status === undefined || path === undefined || path.length === 0) {
      throw new InvocationError(
        "could not read the output of `git diff --cached --raw -z`: unrecognized record. " +
          "Refusing rather than scanning a list that may be short.",
      );
    }
    staged.push({ path, mode, status });
    i += 2;
  }

  const inScope = staged.filter(
    (s) =>
      s.path.startsWith("test/fixtures/") || (s.path.startsWith("src/") && s.path.endsWith(".ts")),
  );

  // Unmerged first: such a record's destination mode is `000000`, which the mode
  // test below would otherwise refuse with a sentence about symbolic links and
  // gitlinks that is false for it.
  refuseUnmerged(
    inScope.filter((s) => s.status === "U").map((s) => s.path),
    "stage 0 is what the `:<path>` this route reads with names, so there is no one staged blob " +
      "for it to read.",
  );

  refuseUnscannable(
    inScope
      .filter((s) => s.status !== "U" && !REGULAR_BLOB_MODES.has(s.mode))
      .map((s) => ({ path: s.path, kind: gitModeKind(s.mode) })),
    "For such an entry `git show :<path>` hands back its target path rather than any content, " +
      "so scanning it would prove nothing about what it points at.",
    "Unstage it, or replace it with a regular file.",
  );

  return inScope.map(({ path: relPath }) => ({
    path: relPath,
    // SECURITY: array-form execFileSync, no shell. `:<path>` is a git pathspec.
    read: (): Buffer =>
      execFileSync("git", ["show", `:${relPath}`], {
        cwd: REPO_ROOT,
        encoding: "buffer",
        stdio: ["ignore", "pipe", "pipe"],
      }),
  }));
}

// ---------------------------------------------------------------------------
// The index corpus: the bytes git carries (all mode only)
// ---------------------------------------------------------------------------

/**
 * THE ONE PLACE THIS MECHANISM IS WRITTEN DOWN. The header banner, the
 * allow-list, the changeset and `CLAUDE.md` state the consumer-facing property
 * and point here, because a mechanism restated in a second place is how one of
 * the two copies goes false.
 *
 * WHAT IT IS. All mode reads the working tree through `walk()`, and then reads
 * THE BYTES GIT CARRIES for every path in the index, wherever that path sits.
 * It is a UNION with the walk, never a replacement: no walk root was narrowed,
 * no clause was dropped, and a file the walk reads is still read off disk with
 * exactly the views it had. This route only ever ADDS bytes to the sweep.
 *
 * WHAT IT CLOSES *HERE*, RE-DERIVED AGAINST THIS SCANNER RATHER THAN INHERITED.
 * That distinction is the whole point of the list: this repo's reconciliation
 * was already stronger than the reference's floor-of-one, so the states a
 * sibling's note names are NOT the states this route closes here. Each was
 * reproduced on the base commit, exiting 0 with `OK: no hits` over a synthetic
 * stream carrying a patient name, a mother's maiden name, a birthdate and a
 * dashed SSN:
 *
 *   - RECONCILING PATH SETS IS NOT READING BYTES, and this is the escape the
 *     whole route exists for. `refuseUnobserved` compares the paths the walk
 *     observed against the paths git carries. A tracked file whose COMMITTED
 *     bytes carry PHI and whose working-tree bytes are clean satisfies that
 *     comparison completely: every root yields files, every tracked path is
 *     accounted for, and the corpus git carries was never opened. Reading the
 *     blob is the only answer that does not depend on the working tree being
 *     honest.
 *   - A TRACKED PATH OUTSIDE EVERY WALK ROOT WAS INVISIBLE TO BOTH ENUMERATING
 *     ROUTES. `WALK_ROOT_NAMES` is three names and `refuseUnobserved` only
 *     reconciles WITHIN them, so nothing outside was enumerated and nothing
 *     outside was missed either: the reconciliation cannot notice a corpus it
 *     was never pointed at. Measured on this repo before this route: 18 tracked
 *     non-markdown files sit outside all three roots and neither route had ever
 *     opened one. The index route reads every tracked path, so a new top-level
 *     directory's COMMITTED bytes are in scope the moment git tracks something
 *     in it, with nobody remembering to declare it.
 *   - A TRACKED SYMLINK OR GITLINK OUTSIDE EVERY WALK ROOT. `walk()` classifies
 *     entries INSIDE a root, so such an entry was reached by neither route. It
 *     is refused here by MODE, through the same `gitModeKind` closed set, and
 *     the refusal never reports what is on the other side of it.
 *   - AN EMPTY INDEX MADE THE RECONCILIATION VACUOUS. Zero entries is not a
 *     clean corpus, it is no corpus, and every clause `refuseUnobserved` states
 *     is satisfied by it for free. All mode refuses (exit 2) in `main` rather
 *     than reporting over the working tree alone.
 *
 * AND WHAT IT DOES *NOT* CLOSE HERE, because a sibling's list would overstate
 * it: A TRACKED FILE ABSENT FROM THE WORKING TREE UNDER A DECLARED ROOT was
 * ALREADY refused, by `refuseUnobserved`'s second clause, and still is. This
 * route does not rescue it and must not be credited with it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO, so nobody reads a bigger claim than the
 * code makes:
 *
 *   - IT DOES NOT CREDIT A SCAN ROOT. `refuseUnobserved` is a statement about
 *     the WALK and stays one: a root emptied on disk still refuses, even though
 *     every file under it was just read out of the index. The two rules answer
 *     different questions, and letting the second satisfy the first would retire
 *     a trap that is already paid for. Structurally guaranteed here, because
 *     `refuseUnobserved` runs inside `buildTargetsForAll`, before this route.
 *   - IT IS NOT PREVENTIVE. This gate fires AFTER a write lands. It guarantees
 *     PHI is never carried silently, not that it never touched disk.
 *   - IT DOES NOT REACH `--staged` OR `paths`. `--staged` is the pre-commit
 *     hook, so its scope decides what a COMMIT is BLOCKED on; widening it is a
 *     hook decision and is not this. `paths` is bounded by the caller's argv.
 *   - MARKDOWN IS EXCLUDED OUTSIDE THE SHIPPED DOCS BUNDLE, through `walk()`'s
 *     own predicate rather than a second copy of it: a README or an override log
 *     legitimately describes a violator value, while a page inside the bundle is
 *     published immutably and is read. That is the ONE exclusion, and it is why
 *     an index entry can be skipped here.
 *   - GITIGNORE IS NOT CONSULTED, deliberately unlike the walk. A tracked file
 *     that also matches an ignore rule is still content git carries, and the
 *     walk's ignore rule is about entries it found on disk.
 *   - IT READS THE INDEX, NOT `HEAD`. Staged bytes are what the next commit
 *     carries, and they are also what the working tree can no longer be trusted
 *     to show.
 *
 * THE RESIDUAL, MEASURED RATHER THAN REASONED: WORKING-TREE BYTES AT A PATH
 * OUTSIDE EVERY WALK ROOT ARE READ BY NEITHER ROUTE, WHETHER OR NOT GIT TRACKS
 * THE PATH. The walk reads three declared roots and this route reads what the
 * INDEX carries, so the two miss the same place from opposite sides. PHI edited
 * into a tracked file outside the roots and left unstaged is not read; an
 * untracked file out there is not read at all. Both halves are base-identical
 * (nothing outside the roots was read before this route either); what is new is
 * that the claim is written down. Closing it means enumerating the untracked
 * working tree repo-wide, a third enumeration with its own refusal semantics,
 * and it is not this.
 *
 * ONE PROPERTY WORTH KEEPING IF THIS IS PORTED ON: an index blob is immutable
 * and is read out of the object store, so this route has no enumerate-then-read
 * window at all.
 */
const INDEX_ORIGIN = "git index";

/**
 * The label for a path the walk DID read, whose committed bytes are not the
 * bytes on disk. Kept apart from `INDEX_ORIGIN` because the remedy differs: a
 * divergent path needs the corrected file re-staged, while a path the walk never
 * reached (outside every walk root, or absent from the working tree) is fixed
 * exactly like any other file.
 */
const INDEX_DIVERGENT_ORIGIN = "git index; the working tree differs";

/** `maxBuffer` for the two LISTING calls, which return records and not content. */
const INDEX_LIST_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Ceiling on the bytes one sweep will pull out of the object store. A repo
 * bigger than this refuses BY NAME instead of being killed by the allocator,
 * which would surface as an uncaught failure rather than as a scanner refusal.
 */
const INDEX_BLOB_BUDGET_BYTES = 512 * 1024 * 1024;

interface IndexEntry {
  mode: string;
  oid: string;
  stage: string;
  path: string;
}

/** `<mode> SP <oid> SP <stage> TAB <path>`: one `git ls-files -s -z` record. */
const INDEX_RECORD = /^(\d{6}) ([0-9a-f]+) ([0-3])\t([\s\S]+)$/;

/**
 * Every entry the index holds, at every stage. `-z` is NUL-separated and
 * unquoted, so a path matches the walk's forward-slash relative paths exactly.
 *
 * A FAILURE HERE REFUSES rather than falling back to the working tree. This is
 * also the single enumeration `refuseUnobserved` reconciles against, so a
 * swallowed failure would make that check pass vacuously as well as leaving this
 * route empty: one silent catch, two gates gone.
 */
function readIndex(): IndexEntry[] {
  let out: Buffer;
  try {
    // SECURITY: array-form execFileSync, no shell.
    out = execFileSync("git", ["ls-files", "-s", "-z"], {
      cwd: REPO_ROOT,
      encoding: "buffer",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: INDEX_LIST_MAX_BYTES,
    });
  } catch (err) {
    throw new InvocationError(
      `could not read the git index: ${err instanceof Error ? err.message : String(err)}. ` +
        "All mode reads the bytes git carries as well as the working tree, so it refuses " +
        "rather than reporting a verdict over the working tree alone.",
    );
  }
  const entries: IndexEntry[] = [];
  for (const rec of out.toString("utf8").split("\0")) {
    if (rec.length === 0) continue;
    const m = INDEX_RECORD.exec(rec);
    const mode = m?.[1];
    const oid = m?.[2];
    const stage = m?.[3];
    const path = m?.[4];
    if (mode === undefined || oid === undefined || stage === undefined || path === undefined) {
      // The raw record is NOT echoed, and the reason is not that a path may be
      // unprintable: every refusal in this file names the paths it refuses over,
      // because a refusal nobody can act on is worse. It is that a record this
      // regex did not match has no known structure, so there is no path in it to
      // name, and printing unparsed bytes is not the same act as naming a path
      // the code understood.
      throw new InvocationError(
        "could not read the output of `git ls-files -s -z`: unrecognized record. " +
          "Refusing rather than scanning a list that may be short.",
      );
    }
    entries.push({ mode, oid, stage, path });
  }
  return entries;
}

/**
 * The bytes behind each object id, read in ONE `git cat-file --batch` call.
 *
 * `--batch-check` runs first for two reasons, and neither is caution for its own
 * sake: it is where a MISSING or non-blob object is refused by name before
 * anything is read, and its sizes are what `maxBuffer` is derived from. Node's
 * default `maxBuffer` is 1 MiB and this repo's tracked corpus is already well
 * past that, so a guessed constant is a gate that starts refusing as the package
 * grows.
 */
function readBlobs(oids: string[]): Map<string, Buffer> {
  const blobs = new Map<string, Buffer>();
  if (oids.length === 0) return blobs;
  const input = `${oids.join("\n")}\n`;

  let checkBuf: Buffer;
  try {
    // SECURITY: array-form execFileSync, no shell. The input is object ids this
    // process read out of the index, never a path.
    checkBuf = execFileSync("git", ["cat-file", "--batch-check"], {
      cwd: REPO_ROOT,
      input,
      stdio: ["pipe", "pipe", "ignore"],
      maxBuffer: INDEX_LIST_MAX_BYTES,
    });
  } catch (err) {
    throw new InvocationError(
      `could not query the git object store: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const lines = checkBuf
    .toString("utf8")
    .split("\n")
    .filter((l) => l.length > 0);
  if (lines.length !== oids.length) {
    throw new InvocationError(
      `git cat-file --batch-check answered for ${String(lines.length)} of ` +
        `${String(oids.length)} index objects. Refusing rather than scanning a list that may ` +
        "be short.",
    );
  }
  let total = 0;
  for (const line of lines) {
    // `<oid> blob <size>` for an object that is there, `<oid> missing` for one
    // that is not. An object id is a hash and carries no content, so it is safe
    // to name in a diagnostic; nothing else from the line is printed.
    const m = /^([0-9a-f]+) (\S+)(?: (\d+))?$/.exec(line);
    const oid = m?.[1];
    const type = m?.[2];
    const size = m?.[3];
    if (oid === undefined || type === undefined) {
      throw new InvocationError(
        "could not read the output of `git cat-file --batch-check`: unrecognized record.",
      );
    }
    if (type !== "blob" || size === undefined) {
      throw new InvocationError(
        `the git object store cannot hand back the content the index records at ${oid} ` +
          `(reported as: ${type}). The sweep cannot read what git carries, so it refuses ` +
          "rather than reporting on the working tree alone.",
      );
    }
    total += Number(size);
  }
  if (total > INDEX_BLOB_BUDGET_BYTES) {
    throw new InvocationError(
      `the index holds ${String(total)} bytes of scannable content, past this scanner's ` +
        `${String(INDEX_BLOB_BUDGET_BYTES)}-byte sweep budget. Refusing by name rather than ` +
        "failing in the allocator, which would not read as a scanner refusal.",
    );
  }

  let buf: Buffer;
  try {
    // SECURITY: array-form execFileSync, no shell. `maxBuffer` is the measured
    // total plus a header allowance (one `<oid> blob <size>` line and one
    // trailing newline per object), never a guess.
    buf = execFileSync("git", ["cat-file", "--batch"], {
      cwd: REPO_ROOT,
      input,
      stdio: ["pipe", "pipe", "ignore"],
      maxBuffer: total + oids.length * 128 + 64 * 1024,
    });
  } catch (err) {
    throw new InvocationError(
      `could not read the git object store: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // `<oid> SP blob SP <size> LF <content> LF` per record. Sizes are BYTE counts
  // and the content is binary-safe, so this walk is done on the Buffer and never
  // on a decoded string: decoding first would move every offset after the first
  // multi-byte character.
  let i = 0;
  while (i < buf.length) {
    const nl = buf.indexOf(0x0a, i);
    if (nl < 0) throw new InvocationError("`git cat-file --batch` output ended mid-record.");
    const header = buf.toString("utf8", i, nl);
    const m = /^([0-9a-f]+) blob (\d+)$/.exec(header);
    const oid = m?.[1];
    const size = m?.[2];
    if (oid === undefined || size === undefined) {
      throw new InvocationError(
        "could not read the output of `git cat-file --batch`: unrecognized record.",
      );
    }
    const start = nl + 1;
    const end = start + Number(size);
    if (end > buf.length) {
      throw new InvocationError(
        `\`git cat-file --batch\` returned less content than it declared for ${oid}.`,
      );
    }
    blobs.set(oid, buf.subarray(start, end));
    i = end + 1;
  }
  const wanted = new Set(oids);
  if (blobs.size !== wanted.size) {
    throw new InvocationError(
      `read ${String(blobs.size)} of ${String(wanted.size)} index objects. Refusing rather ` +
        "than scanning a corpus that may be short.",
    );
  }
  return blobs;
}

/**
 * One target per index entry whose bytes the walk has not already read.
 *
 * ▶ THE REFUSALS BELOW SEE EVERY ENTRY, WHATEVER IT IS NAMED. The `.md`
 * exemption is applied LAST, to the readable set only, and putting it first is a
 * real hole rather than a style point: it is a NAME exemption, and this file
 * already states (see `walk`) that a name exemption must never be carried over
 * to an entry whose bytes the route cannot read, because a name is no evidence
 * at all about what is on the other side of a link. Git carries a link's TARGET
 * PATH, which is itself a PHI surface: a target of the shape
 * `../patients/<surname>-<given>-<dob>.txt` is the whole reason the walk refuses
 * links, and naming one `.md` must not buy it a pass here either.
 *
 * ▶ THE SKIP IS A BYTE COMPARISON, NOT A STAT AND NOT A HASH. `git diff-files`
 * and any mtime or size test are exactly what a decoy defeats, and a hash would
 * bind this route to the repository's object format. The blob is fetched either
 * way, so comparing it against what the walk read costs one `Buffer.equals` and
 * skips only a file whose committed bytes have provably already been scanned.
 */
function buildTargetsForIndex(
  entries: readonly IndexEntry[],
  observed: ReadonlyMap<string, Buffer>,
): Target[] {
  refuseUnmerged(
    [...new Set(entries.filter((e) => e.stage !== "0").map((e) => e.path))],
    "the index carries no stage-0 entry for it, so there is no one object id for this route " +
      "to read.",
  );

  refuseUnscannable(
    entries
      .filter((e) => !REGULAR_BLOB_MODES.has(e.mode))
      .map((e) => ({ path: e.path, kind: gitModeKind(e.mode) })),
    // Covers BOTH kinds this can be, because they are not the same thing: for a
    // link git carries the target PATH, and for a gitlink it carries a commit id
    // in ANOTHER repository. Neither is content.
    "git carries a link target or another repository's commit id for such an entry, never " +
      "content, so scanning it would prove nothing about what it refers to.",
    "Remove it from the index, or replace it with a regular file.",
  );

  // NOW the markdown rule, over entries whose bytes this route can actually
  // read. It is `walk()`'s own rule, SHARED rather than copied: `isMarkdownExempt`
  // is the single predicate, so this route cannot start disagreeing with the walk
  // about which markdown belongs to the sweep.
  const readable = entries.filter(
    (e) => REGULAR_BLOB_MODES.has(e.mode) && !isMarkdownExempt(e.path),
  );
  const blobs = readBlobs([...new Set(readable.map((e) => e.oid))]);

  const targets: Target[] = [];
  for (const e of readable) {
    const bytes = blobs.get(e.oid);
    if (bytes === undefined) {
      throw new InvocationError(
        "the git object store did not hand back one of the objects the index records. " +
          "Refusing rather than reporting over a corpus that was not read.",
      );
    }
    const seen = observed.get(e.path);
    // ▶ THE COMPARISON MUST NOT NORMALIZE LINE ENDINGS FIRST, and this is the one
    // edit that would quietly reopen the escape. Under a `.gitattributes` setting
    // `eol=crlf`, or `core.autocrlf=true`, every blob diverges from its
    // working-tree file, so this skip stops firing, every text file is scanned
    // twice and every hit is reported once more under `INDEX_DIVERGENT_ORIGIN`.
    // The direction is fail-safe (a duplicate finding, never a miss) and it is
    // wrong-looking enough that someone will want to "fix" it by normalizing
    // before comparing. Normalizing compares a DERIVED form of the two byte
    // strings, and a decoy differing only in what the normalizer erases would
    // then be skipped, which is the escape this route exists to close. NEITHER
    // CONDITION IS LIVE HERE, measured rather than assumed: this repo has no
    // `.gitattributes` at all and `core.autocrlf` and `core.eol` are both unset,
    // and CI is Linux. So the doubling is recorded, not handled. CHECK THE
    // CONDITION BEFORE PORTING THIS ON, and fix it in the reporter if it fires.
    if (seen !== undefined && seen.equals(bytes)) continue;
    targets.push({
      path: e.path,
      read: () => bytes,
      origin: seen === undefined ? INDEX_ORIGIN : INDEX_DIVERGENT_ORIGIN,
    });
  }
  return targets;
}

// ---------------------------------------------------------------------------
// Cross-cutting shape checks: the format-agnostic FLOOR
// ---------------------------------------------------------------------------

function scanCommonShapes(path: string, content: string, allow: AllowList, hits: Hit[]): void {
  // Dashed SSN anywhere (a dashed \d{3}-\d{2}-\d{4} is always a hit).
  for (const m of content.matchAll(/\b\d{3}-\d{2}-\d{4}\b/g)) {
    hits.push({ path, segment: "(ssn)", value: m[0], reason: "dashed SSN pattern" });
  }
  // Emails whose domain is not an allow-listed reserved / test domain.
  for (const m of content.matchAll(/\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g)) {
    const domain = (m[1] ?? "").toLowerCase();
    if (!allow.emailDomains.has(domain)) {
      hits.push({ path, segment: "(email)", value: m[0], reason: "email with non-test domain" });
    }
  }
}

// ---------------------------------------------------------------------------
// ASTM-specific structured detection: the P (patient) record loci
// ---------------------------------------------------------------------------
//
// The P record concentrates ASTM's PHI: the patient name (field 6,
// `Last^First^Middle`), the mother's maiden name (field 7, a surname), and the
// birthdate (field 8, `YYYYMMDDHHMMSS`). This detector parses the record the way
// the library does: reading the four delimiters from the H record rather than
// assuming them, and flags any name token or DOB that is NOT positively declared
// synthetic in the allow-list.
//
// This is a targeted extension of the floor toward the highest-value loci; a
// full field-level sweep (practice/lab IDs, address, phone, C free text) is a
// later phase. Coded, non-PHI fields (sex, order codes) are deliberately not
// treated as names: parsing the format avoids that false-confidence trap.

interface AstmDelims {
  field: string;
  component: string;
}

/** Read field + component delimiters from the first H record; fall back to the canonical set. */
function readAstmDelims(records: string[]): AstmDelims {
  for (const r of records) {
    if (r.charAt(0) === "H" && r.length >= 5) {
      const field = r.charAt(1);
      const defEnd = r.indexOf(field, 2);
      const def = r.slice(2, defEnd === -1 ? r.length : defEnd);
      if (def.length >= 3) return { field, component: def.charAt(1) };
    }
  }
  return { field: "|", component: "^" };
}

/**
 * A STRING-LITERAL DELIMITER OPENS A RECORD TOO, and leaving that out left two of
 * this repo's three literal shapes unread while the sweep reported clean.
 *
 * A record separator supplies a boundary only where one is IN the literal, so a
 * stream split across array elements and joined at run time, and a literal
 * holding a single record, both arrived as one segment beginning with a quote,
 * which is the same miss the decoded view was added to close. Splitting the
 * source view on the three quote characters as well closes both.
 *
 * IT DOES READ NON-RECORDS AS RECORDS, and the reason once written here ("a
 * boundary can only shorten a record, never invent a field") was wrong: an added
 * boundary creates a new record START, which is the whole point, and a segment
 * that was never a record can begin one. Measured: a line of tabular prose whose
 * cells are pipe-separated is reported at `P-6` and `P-8`. The structural guard
 * below narrows that and does not close it, so this view is NOISIER than the
 * line view by construction, and a noisier PHI gate is the safe direction.
 *
 * The two properties that actually hold, and that make the noise acceptable:
 *
 *   - the split is purely ADDITIVE, so no record the line view found stops being
 *     found. What it can cost is a record whose own content carries a quote,
 *     which is read short, so a value can be MISSED at the margin but the line
 *     view's findings are unaffected;
 *   - every reported value is a SUBSTRING OF THE FILE. Nothing is synthesized,
 *     so a hit always names bytes a reader can go and look at.
 *
 * Delimiters are deliberately NOT read from this view (see
 * `scanAstmPatientLoci`): a quote-split segment of ordinary prose beginning with
 * `H` would otherwise redefine the delimiter set for the whole file, and THAT is
 * the one route by which this split could change what a real record reads as.
 */
const SOURCE_LITERAL_DELIMITERS = /["'`]/;

function scanAstmPatientLoci(
  path: string,
  content: string,
  allow: AllowList,
  hits: Hit[],
  splitOnSourceLiterals = false,
): void {
  const lines = content.split(/\r\n|\r|\n/).filter((r) => r.length > 0);
  // Delimiters come from the LINE view only, whether or not the caller asked for
  // the wider record split. See `SOURCE_LITERAL_DELIMITERS` for why.
  const d = readAstmDelims(lines);
  const records = splitOnSourceLiterals
    ? [
        ...lines,
        ...content
          .split(SOURCE_LITERAL_DELIMITERS)
          .flatMap((seg) => seg.split(/\r\n|\r|\n/))
          .filter((r) => r.length > 0),
      ]
    : lines;
  if (!records.some((r) => r.charAt(0) === "P")) return; // not an ASTM record stream with a patient

  for (const record of records) {
    if (record.charAt(0) !== "P") continue;
    const fields = record.split(d.field);
    // A LINE THAT MERELY STARTS WITH `P` IS NOT A PATIENT RECORD, and reading one
    // as if it were is how this detector reported four patient names out of a
    // shell script whose `PROJECT_PREFIXES='A|B|C|...'` alternation happens to
    // start with the letter and separate on the default field delimiter. This
    // package's own builder writes the sequence number as a P record's second
    // field unconditionally (`buildPatientLine` in `src/records/build.ts`), so
    // that field is the cheap structural test, taken from this reader rather
    // than claimed off a clause of any standard: no clause is cited for it
    // anywhere, here or in `src/`. It is a PRECISION guard and it has a bound: a patient
    // record whose second field is not a short digit run (or empty) is not read
    // here. To see what that costs over the corpus at any moment, drop the
    // clause and re-run `pnpm phi-scan`.
    if (!/^\d{0,6}$/.test((fields[1] ?? "").trim())) continue;

    // Field 6: patient name (Last^First^Middle). Field 7: mother's maiden name (a surname).
    // Each non-empty component of either is a name token that must be declared synthetic.
    for (const [idx, locus] of [
      [5, "P-6 (name)"],
      [6, "P-7 (mother's-maiden)"],
    ] as const) {
      const nameField = fields[idx] ?? "";
      for (const token of nameField.split(d.component)) {
        const t = token.trim();
        if (t.length === 0) continue;
        // A token still carrying a template placeholder is source SYNTAX, not a
        // value: the source-embedded view decodes escape sequences, it does not
        // evaluate expressions. THE BOUND THAT BUYS, STATED HERE AND NOWHERE
        // ELSE: a name interpolated into a stream at run time is not seen by
        // this scan at all, so a fixture that assembles a name from variables is
        // outside it and is the reviewer's to read.
        if (t.includes("${")) continue;
        // A ONE-CHARACTER TOKEN IS NOT AN IDENTIFIER, and exempting each one by
        // name is worse than the rule: the escape-alignment fixtures split into
        // tokens like a bare middle initial or a bare delimiter, and declaring
        // those in the allow-list would exempt that character for the whole
        // repository forever. THE BOUND: a name component of one character is
        // not read here.
        if (t.length < 2) continue;
        if (!allow.names.has(t.toUpperCase())) {
          hits.push({
            path,
            segment: locus,
            value: t,
            reason: "patient name token not declared synthetic in phi-allow-list.txt",
          });
        }
      }
    }

    // Field 8: birthdate. A digit run that is not an allow-listed synthetic DOB is a hit.
    const dob = (fields[7] ?? "").trim();
    if (/^\d{4,}$/.test(dob) && !allow.dobs.has(dob)) {
      hits.push({
        path,
        segment: "P-8 (dob)",
        value: dob,
        reason: "patient birthdate not declared synthetic in phi-allow-list.txt",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// The source-embedded view: an ASTM stream written as a string literal
// ---------------------------------------------------------------------------
//
// ENUMERATING A FILE IS NOT DETECTING WHAT IS IN IT, and in this package the two
// are separate holes with separate fixes. The detector above assumes the file IS
// the document: it splits on newlines and asks whether a line begins with `P`.
// Most of this package's ASTM streams are not files at all. They are `.ts`
// string literals whose record separators are the two characters `\` and `r`, so
// every one of them presented to that detector as a single line beginning with a
// quote or a space, and it returned without looking. That is true even inside
// `src/`, which the walk has always enumerated: a JSDoc `@example` carrying a
// patient name and a birthdate was read by nobody.
//
// So this view decodes the escape sequences a source file uses to embed the
// stream, and the record detector runs over the result IN ADDITION TO the raw
// bytes, never instead of them.

/**
 * Extensions whose bytes are source text that can embed a stream as a literal.
 *
 * A closed set, and deliberately not "every text file". A `.astm` fixture's
 * backslash is DATA: under the canonical declaration `H|\^&` the backslash is
 * the repeat delimiter, so decoding one there would splice a record boundary
 * into the middle of a repeat and let the detector report a patient name the
 * fixture does not contain. Wire data is read as wire data.
 */
const EMBEDDING_SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".py"]);

/**
 * Decode the escape sequences a source file uses to embed a record separator,
 * in ONE left-to-right pass.
 *
 * The single pass is the anti-fabrication clause, not a tidiness preference. A
 * chained or global substitution rewrites `\\r` (an escaped backslash followed
 * by the letter r, which is the two characters `\` and `r` in the string the
 * source denotes) into a real carriage return, and then any `P|` that follows it
 * begins a line and is reported as a patient record the file never contained.
 * Consuming `\\` as a pair first is what makes the decoded view a claim about
 * what the source says rather than about its punctuation. An unrecognized escape
 * keeps its backslash, so nothing is invented for it either.
 */
function decodeEmbeddedEscapes(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = text[i + 1];
    if (n === "\\" || n === '"' || n === "'" || n === "`") {
      out += n;
      i += 1;
    } else if (n === "r") {
      out += "\r";
      i += 1;
    } else if (n === "n") {
      out += "\n";
      i += 1;
    } else if (n === "t") {
      out += "\t";
      i += 1;
    } else if (n === "x" && /^[0-9a-fA-F]{2}$/.test(text.slice(i + 2, i + 4))) {
      out += String.fromCharCode(parseInt(text.slice(i + 2, i + 4), 16));
      i += 3;
    } else if (n === "u" && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
      out += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16));
      i += 5;
    } else {
      out += c;
    }
  }
  return out;
}

/** Stable identity of a hit, so the two views cannot report the same finding twice. */
function hitKey(h: Hit): string {
  return `${h.path} ${h.segment} ${h.value} ${h.reason}`;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Scan one target and return the bytes that were read.
 *
 * The caller keeps them so the index corpus can skip a blob whose content the
 * walk has provably already scanned. Returning the buffer rather than re-reading
 * the file there is what makes that a comparison of the bytes THIS SWEEP READ,
 * not a second read that a tree changing underneath could answer differently.
 */
function scanTarget(target: Target, allow: AllowList, hits: Hit[]): Buffer {
  let buf: Buffer;
  try {
    buf = target.read();
  } catch (err) {
    throw new InvocationError(
      `could not read ${target.path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const text = buf.toString("utf8");

  // The format-agnostic floor: dashed SSN + non-test email. This runs on every target.
  scanCommonShapes(target.path, text, allow, hits);

  // ASTM-specific structured detection at the P-record loci (name + mother's
  // maiden + DOB), delimiter-aware.
  //
  //   ============================================================
  //   WHAT A GREEN FROM THIS SCAN MEANS. This is the one place that
  //   sentence is written, and the one to correct. Every other surface
  //   points here rather than restating it, because a restated bound
  //   goes stale on its own and this one has.
  //
  //   A green means: no dashed SSN and no non-test email anywhere in the
  //   corpus, and no undeclared patient name token, mother's maiden name
  //   token or birthdate in any patient record THIS SCAN READ. It is not
  //   a "no PHI" guarantee, and the reader owns the difference:
  //
  //     - LOCI. Only the name, maiden name and birthdate are read. A
  //       practice or lab id, an address, a phone number and `C`-record
  //       free text are not.
  //     - WHAT COUNTS AS A RECORD. A record is a segment beginning a
  //       line, or (in a source file) beginning a string literal, after
  //       the embedded view's decode. A record assembled from pieces at
  //       run time is not one. A record QUOTED IN PROSE IS read, because
  //       a quote is exactly what this view treats as a record start:
  //       that is coverage this sentence used to disclaim, and the
  //       disclaimer was measured false.
  //     - TOKENS NOT READ. A name component of one character, and one
  //       still carrying a `${` placeholder. Each is argued where it is
  //       applied, below.
  //     - THE STRUCTURAL GUARD. A patient record whose second field is
  //       not a short digit run is not read. Argued below.
  //     - FILES NOT READ. In all mode the corpus is `WALK_ROOT_NAMES`
  //       on disk UNION every path the index carries, and markdown is
  //       exempt from both EXCEPT inside the shipped docs bundle, which
  //       is read because its bytes are published immutably
  //       (`isMarkdownExempt`). So the bytes git carries are read
  //       wherever they sit, and what is left out is working-tree bytes
  //       at a path outside every walk root: the residual is stated
  //       once, at `buildTargetsForIndex`. `--staged` is narrower again,
  //       at its own predicate, and `paths` is the caller's argv.
  //
  //   Keep fixtures synthetic and declare their identifiers in
  //   scripts/phi-allow-list.txt.
  //   ============================================================
  scanAstmPatientLoci(target.path, text, allow, hits);

  // ...and again over the source-embedded view, for a source file whose escape
  // sequences denote the record separators. IN ADDITION TO the pass above, never
  // instead of it: a source file can carry a stream both ways. Deduplicated by
  // hit identity so a stream that reads the same both ways is reported once.
  if (!EMBEDDING_SOURCE_EXTENSIONS.has(extname(target.path).toLowerCase())) return buf;
  const seen = new Set(hits.map(hitKey));
  const embedded: Hit[] = [];
  scanAstmPatientLoci(target.path, decodeEmbeddedEscapes(text), allow, embedded, true);
  for (const h of embedded) {
    const key = hitKey(h);
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(h);
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report(hits: Hit[]): void {
  if (hits.length === 0) {
    process.stdout.write("[phi-scan] OK: no hits\n");
    return;
  }
  // Grouped by path AND origin, so the same path found in the working tree and
  // in the bytes git carries is two groups rather than one mislabelled one.
  const byOrigin = new Map<string, Hit[]>();
  for (const h of hits) {
    const key = `${h.path} ${h.origin ?? ""}`;
    const arr = byOrigin.get(key);
    if (arr) arr.push(h);
    else byOrigin.set(key, [h]);
  }
  const paths = new Set<string>();
  let fromIndex = 0;
  for (const group of byOrigin.values()) {
    const first = group[0];
    if (first === undefined) continue;
    paths.add(first.path);
    // ONLY the divergent origin is counted here, not every index-read hit, and
    // the reason is NOT that the other kind agrees with the working tree. It is
    // that this sweep NEVER LOOKED. `INDEX_DIVERGENT_ORIGIN` means the walk read
    // the file and the bytes differed, which is a measurement; `INDEX_ORIGIN`
    // means no walk root reached the path at all, so whether the file on disk
    // carries these bytes, differs from them, or is not there is a question this
    // run has no answer to. Withholding the sentence is refusing to assert an
    // unmeasured thing, not a claim that the file agrees. The `(git index)`
    // label on the hit's own line is what says where the bytes were read, and
    // that one IS measured. (An earlier draft of this comment asserted the file
    // "still has the same bytes on disk", which is a claim about the whole input
    // space and is false of a path deleted or edited in the working tree.)
    if (first.origin === INDEX_DIVERGENT_ORIGIN) fromIndex += group.length;
    const where = first.origin === undefined ? "" : ` (${first.origin})`;
    process.stderr.write(`[phi-scan] HIT: ${first.path}${where}\n`);
    for (const h of group) {
      process.stderr.write(
        `  segment=${h.segment} value=${JSON.stringify(h.value)} (${h.reason})\n`,
      );
    }
  }
  process.stderr.write(
    `[phi-scan] ${String(hits.length)} hit(s) across ${String(paths.size)} file(s). ` +
      `If a value is genuinely synthetic, declare it in scripts/phi-allow-list.txt OR ` +
      `run with --allow-fixture <path> AND log it in phi-scan-overrides.md.\n`,
  );
  if (fromIndex > 0) {
    // Named explicitly, because the remedy differs: these bytes are the ones git
    // carries, and they are not necessarily the bytes on disk. Editing the file
    // alone does not clear them.
    process.stderr.write(
      `[phi-scan] ${String(fromIndex)} of those are in bytes git carries at that path rather ` +
        `than in the working-tree file, so re-staging the corrected file is part of the fix.\n`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
    validateAllowFixtures(args.allowFixtures);
  } catch (err) {
    if (err instanceof InvocationError) {
      process.stderr.write(`[phi-scan] ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  const allow = loadAllowList();
  const allowed = new Set<string>(args.allowFixtures.map(normalizePath));

  let targets: Target[];
  // Only all mode reads the index corpus, so only all mode holds an index here.
  let index: IndexEntry[] | null = null;
  try {
    if (args.mode === "staged") targets = buildTargetsForStaged();
    else if (args.mode === "paths") targets = buildTargetsForPaths(args.paths);
    else {
      index = readIndex();
      targets = buildTargetsForAll(new Set(index.map((e) => e.path)));
    }
  } catch (err) {
    if (err instanceof InvocationError) {
      process.stderr.write(`[phi-scan] ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  targets = targets.filter((t) => !allowed.has(t.path));

  const hits: Hit[] = [];
  // What the walk actually read, keyed by path. The index corpus below skips a
  // blob whose bytes are already in here, so nothing is scanned or reported
  // twice, and a path whose working-tree bytes DIFFER is scanned both ways.
  const observed = new Map<string, Buffer>();
  const scan = (t: Target): void => {
    const before = hits.length;
    const bytes = scanTarget(t, allow, hits);
    if (t.origin === undefined) {
      observed.set(t.path, bytes);
      return;
    }
    // Stamped onto the hits this target produced, rather than threaded through
    // every detector: the origin is a property of WHERE THE BYTES CAME FROM, and
    // no detector has any business knowing it.
    for (let i = before; i < hits.length; i += 1) {
      const h = hits[i];
      if (h !== undefined) h.origin = t.origin;
    }
  };

  for (const t of targets) {
    try {
      scan(t);
    } catch (err) {
      if (err instanceof InvocationError) {
        process.stderr.write(`[phi-scan] ${err.message}\n`);
        return 2;
      }
      throw err;
    }
  }

  // AN EMPTY INDEX IS NOT A CLEAN CORPUS, IT IS NO CORPUS. `git ls-files` exits 0
  // with no output for a removed `.git/index` (a corrupt one exits non-zero and
  // is refused in `readIndex`), and every clause `refuseUnobserved` states is
  // satisfied by it for free: with no tracked path, no root can be missing one,
  // so the reconciliation passes vacuously and the route below has nothing to
  // read.
  //
  // IT IS REFUSED HERE, AFTER THE WALK HAS BEEN SCANNED, AND THE POSITION IS THE
  // FIX TO A DEFECT RATHER THAN A PREFERENCE. Refused before the walk, this
  // clause made the run STRICTLY WORSE than the superseded scanner's for one
  // input: an empty index with a PHI-bearing fixture on disk exited 1 naming
  // every locus before, and exited 2 naming nothing after. A REFUSAL MUST NOT
  // SWALLOW A REAL HIT is the rule the index route below already carries; it
  // applies to this clause for exactly the same reason. The exit code is still
  // 2, because an incomplete sweep is not a verdict whatever it found on the way.
  if (index !== null && index.length === 0) {
    if (hits.length > 0) report(hits);
    process.stderr.write(
      "[phi-scan] refusing the scan: the git index holds no entries, so there is no corpus to " +
        "reconcile the working tree against and every check against it would pass vacuously. " +
        "Run this from a repository with a populated index.\n",
    );
    return 2;
  }

  // THE INDEX CORPUS, all mode only: the bytes git carries, at every path it
  // carries them, whether or not that path sits under a walk root and whether or
  // not the working tree still agrees with it. The mechanism, everything it
  // closes and everything it deliberately does not do are written down once, at
  // `buildTargetsForIndex`.
  if (index !== null) {
    let indexTargets: Target[];
    try {
      indexTargets = buildTargetsForIndex(index, observed);
    } catch (err) {
      if (err instanceof InvocationError) {
        // A REFUSAL MUST NOT SWALLOW A REAL HIT. An unmerged path or a tracked
        // link ANYWHERE in the index refuses the sweep, and the walk may already
        // have found PHI under a root that yielded perfectly well: printing the
        // refusal alone would make this route's output strictly worse than the
        // base commit's for that input. The exit code is still 2, because an
        // incomplete sweep is not a verdict whatever it found on the way.
        if (hits.length > 0) report(hits);
        process.stderr.write(`[phi-scan] ${err.message}\n`);
        return 2;
      }
      throw err;
    }
    // The same subtraction the walk's targets get. It is UNREACHABLE today
    // (`parseArgs` seeds the positional path set from `--allow-fixture`, so the
    // flag always resolves to `paths` mode and never to all), and it is applied
    // anyway so the two routes cannot disagree about an acknowledged path if that
    // ever changes.
    for (const t of indexTargets.filter((t) => !allowed.has(t.path))) {
      try {
        // The bytes are already in memory, so this cannot fail the way a
        // working-tree read can.
        scan(t);
      } catch (err) {
        if (err instanceof InvocationError) {
          if (hits.length > 0) report(hits);
          process.stderr.write(`[phi-scan] ${err.message}\n`);
          return 2;
        }
        throw err;
      }
    }
  }

  report(hits);
  return hits.length === 0 ? 0 : 1;
}

// EXIT 1 IS RESERVED FOR HITS, so nothing may reach node's default handler: an
// uncaught throw exits 1, and this gate's 1 means "PHI found". Every anticipated
// failure is already an `InvocationError` returning 2 from `main`; this is the
// backstop for the rest (an `EACCES` on the allow-list, a git binary that is not
// there, an allocation the object-store read could not make), so an unexpected
// failure is reported as the invocation error it is rather than impersonating a
// finding. It is not a substitute for handling a condition: it is what stops the
// one code a caller reads as evidence from being produced by accident.
let exitCode: number;
try {
  exitCode = main();
} catch (err) {
  process.stderr.write(
    `[phi-scan] the scan failed and did not complete: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  exitCode = 2;
}
process.exit(exitCode);
