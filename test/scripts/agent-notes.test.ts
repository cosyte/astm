/**
 * Unit tests for scripts/check-agent-notes.ts.
 *
 * THIS FILE IS WHERE THE GATE'S TEETH ARE, AND THAT IS A CHOICE RATHER THAN AN
 * ACCIDENT. A required job gates all of its STEPS, so a check placed inside the
 * `ci / verify` matrix blocks a merge for as long as that matrix is required,
 * with no ruleset change of its own. A fourth workflow would have been a new
 * context, and a context is requireable only once its workflow has completed on
 * `main`, which is a ruleset change this repo cannot observe from inside itself.
 * REPORTING IS NOT GATING. Which contexts are actually required is deliberately
 * not written down here: read the live answer with
 * `gh api repos/cosyte/astm/rulesets`, never from prose.
 *
 * A check like this is worthless if it can only pass, so every case below either
 * drives the gate RED on a tree carrying the defect it names, or pins one of the
 * bounds it discloses. THE EMPTY-SECTION CASES EARNED THEIR KEEP DURING THE
 * BUILD: an early draft bound explicit anchors and headings separately, which
 * made that assertion VACUOUS rather than wrong (the anchor looked like an empty
 * section, the heading looked unreferenced, and a naive pass skipped both), and
 * a deliberately emptied section printed OK. Only a positive control caught it.
 *
 * Each case builds a THROWAWAY git tree, because the gate enumerates its corpus
 * with `git ls-files`. Nothing here reads or writes this package's own record.
 *
 * SECURITY: every subprocess call uses spawnSync with array args. No shell form.
 */

import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

const REPO_ROOT = process.cwd();
const CHECKER = join(REPO_ROOT, "scripts", "check-agent-notes.ts");
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
 * The placeholder the gate declares as a non-pointer. EVERY fixture carries it,
 * because an exemption that matches nothing is a refusal by design, and one case
 * omits it deliberately to prove that.
 */
const PLACEHOLDER = "a bare `#anchor` below is an anchor in that file";

/** A minimal `CLAUDE.md`: the path link, the placeholder, and whatever pointers a case wants. */
function claudeMd(body: string, opts: { pathLink?: boolean; placeholder?: boolean } = {}): string {
  const link =
    opts.pathLink === false
      ? "documentation/agent-notes.md"
      : "[the record](documentation/agent-notes.md)";
  const ph =
    opts.placeholder === false ? "a bare anchor below is an anchor in that file" : PLACEHOLDER;
  return `# Guide\n\n> The narrative lives in ${link}. ${ph}.\n\n${body}\n`;
}

/** Build a throwaway git tree from a map of relative path to contents. */
function makeTree(files: Record<string, string | Buffer>): string {
  const dir = mkdtempSync(join(tmpdir(), "astm-agent-notes-"));
  trees.push(dir);
  for (const [rel, contents] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, contents);
  }
  for (const args of [
    ["init", "-q"],
    ["add", "-A"],
  ]) {
    const r = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  }
  return dir;
}

function run(root: string): RunResult {
  const r = spawnSync(TSX_BIN, [CHECKER, "--root", root], { encoding: "utf8", cwd: REPO_ROOT });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** A record whose anchors are explicit tags bound to headings, which is this tree's shape. */
function record(sections: { anchor: string; heading: string; body: string }[]): string {
  return (
    `# astm: agent notes\n\n` +
    sections.map((s) => `<a id="${s.anchor}"></a>\n\n## ${s.heading}\n\n${s.body}\n`).join("\n")
  );
}

const TWO_SECTIONS = record([
  { anchor: "defect-1", heading: "Defect 1: something measured false", body: "The measurement." },
  { anchor: "status-history", heading: "Status", body: "What shipped, per phase." },
]);

describe("the contract holds", () => {
  it("passes on a well-formed tree and reports what it covered", () => {
    const dir = makeTree({
      "CLAUDE.md": claudeMd("Never do X. Why: `#defect-1`. Phases: `#status-history`."),
      "documentation/agent-notes.md": TWO_SECTIONS,
    });
    const r = run(dir);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("agent-notes contract: OK");
    expect(r.stdout).toContain("2 live bare-anchor form");
    expect(r.stdout).toMatch(/2 tracked, 2 read, 0 unreadable/);
  });

  it("covers a pointer in a source comment, not just markdown", () => {
    const dir = makeTree({
      "CLAUDE.md": claudeMd("Why: `#defect-1`."),
      "documentation/agent-notes.md": TWO_SECTIONS,
      "src/thing.ts":
        "// The standing trap here is recorded at `#status-history`.\nexport const x = 1;\n",
    });
    const r = run(dir);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("2 live bare-anchor form");
  });

  it("does not red a container heading that legitimately has no body of its own", () => {
    const dir = makeTree({
      "CLAUDE.md": claudeMd("Why: `#defects`."),
      "documentation/agent-notes.md": `# astm: agent notes\n\n<a id="defects"></a>\n\n## Known defects\n\n### Defect 1\n\nThe body.\n`,
    });
    expect(run(dir).code).toBe(0);
  });
});

describe("a broken contract is caught", () => {
  it("reds when a pointer names an anchor that does not exist", () => {
    const dir = makeTree({
      "CLAUDE.md": claudeMd("Why: `#defect-1`. Why: `#defect-99`."),
      "documentation/agent-notes.md": TWO_SECTIONS,
    });
    const r = run(dir);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("#defect-99");
    expect(r.stderr).toContain("matches no anchor and no heading");
  });

  it("reds when the section an anchor is BOUND to is emptied", () => {
    const dir = makeTree({
      "CLAUDE.md": claudeMd("Why: `#defect-1`. Phases: `#status-history`."),
      "documentation/agent-notes.md": record([
        { anchor: "defect-1", heading: "Defect 1: something", body: "The measurement." },
        { anchor: "status-history", heading: "Status", body: "" },
      ]),
    });
    const r = run(dir);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('anchor "status-history" / section "Status" is empty');
    expect(r.stderr).toContain("a pointer resolves to it");
  });

  it("reds when a section is emptied even though no pointer spells its heading slug", () => {
    // The vacuity case. Every pointer in this repo resolves through an explicit
    // anchor, never a heading slug, so a check that only examined slugs would
    // cover nothing at all here.
    const dir = makeTree({
      "CLAUDE.md": claudeMd("Why: `#defect-1`."),
      "documentation/agent-notes.md": record([
        { anchor: "defect-1", heading: "Defect 1: a long title nobody would ever spell", body: "" },
      ]),
    });
    const r = run(dir);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("is empty");
  });

  it("reds when CLAUDE.md stops linking the record by path, since bare anchors need it", () => {
    const dir = makeTree({
      "CLAUDE.md": claudeMd("Why: `#defect-1`.", { pathLink: false }),
      "documentation/agent-notes.md": TWO_SECTIONS,
    });
    const r = run(dir);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("does not link documentation/agent-notes.md by path");
  });

  it("reds when CLAUDE.md carries no pointer at all, even if another file does", () => {
    const dir = makeTree({
      "CLAUDE.md": claudeMd("No pointers here."),
      "documentation/agent-notes.md": TWO_SECTIONS,
      "README.md": "See `#defect-1`.\n",
    });
    const r = run(dir);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("carries no pointer into");
  });
});

describe("it refuses rather than guessing", () => {
  it("refuses when no pointer is found anywhere", () => {
    const dir = makeTree({
      "CLAUDE.md": claudeMd("Nothing points anywhere."),
      "documentation/agent-notes.md": TWO_SECTIONS,
    });
    const r = run(dir);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("CANNOT CHECK");
    expect(r.stderr).toContain("no pointer into");
  });

  it("refuses when the LIVE form is gone but a sibling repo's spelling still matches", () => {
    // The ported-matcher tripwire. A gate that reported OK here would be the
    // exact defect this class keeps producing, one direction later.
    const dir = makeTree({
      "CLAUDE.md": claudeMd("Why: [x](documentation/agent-notes.md#defect-1)."),
      "documentation/agent-notes.md": TWO_SECTIONS,
    });
    const r = run(dir);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("live form");
    expect(r.stderr).toContain("Re-derive the forms against the tree");
  });

  it("refuses when the declared non-pointer matches nothing, so a skip cannot go phantom", () => {
    const dir = makeTree({
      "CLAUDE.md": claudeMd("Why: `#defect-1`.", { placeholder: false }),
      "documentation/agent-notes.md": TWO_SECTIONS,
    });
    const r = run(dir);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('declared non-pointer "anchor"');
    expect(r.stderr).toContain("goes phantom");
  });

  it("refuses when the declared non-pointer silently widens to a second occurrence", () => {
    // Fired for real during this gate's build: the trap line announcing the gate
    // spelled the placeholder while describing the pointer form, and the
    // exemption absorbed it with a reason that did not describe it. An exclusion
    // that can quietly widen is the phantom defect from the other side.
    const dir = makeTree({
      "CLAUDE.md": claudeMd("Why: `#defect-1`. The form is a bare `#anchor`, spelled out."),
      "documentation/agent-notes.md": TWO_SECTIONS,
    });
    const r = run(dir);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("describes ONE sentence but matched 2 occurrences");
  });

  it("refuses when a tracked file is missing from the worktree", () => {
    const dir = makeTree({
      "CLAUDE.md": claudeMd("Why: `#defect-1`."),
      "documentation/agent-notes.md": TWO_SECTIONS,
      "src/gone.ts": "export const x = 1;\n",
    });
    rmSync(join(dir, "src", "gone.ts"));
    const r = run(dir);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("could not be read");
    expect(r.stderr).toContain("covers less than it claims");
  });

  it("refuses when the record is absent entirely", () => {
    const dir = makeTree({ "CLAUDE.md": claudeMd("Why: `#defect-1`.") });
    const r = run(dir);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("documentation/agent-notes.md is not among the tracked files");
  });

  it("refuses on a non-ASCII heading rather than guessing its slug", () => {
    const dir = makeTree({
      "CLAUDE.md": claudeMd("Why: `#defect-1`."),
      "documentation/agent-notes.md": `# astm: agent notes\n\n<a id="defect-1"></a>\n\n## Defect 1: café semantics\n\nBody.\n`,
    });
    const r = run(dir);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("non-ASCII");
  });
});

describe("the corpus and the encoding bound, pinned in both directions", () => {
  it("reads a NUL-bearing source rather than skipping it, and sees a pointer in it", () => {
    // Not hypothetical: this repository tracks NUL-bearing TypeScript sources,
    // one of them a test. A NUL partition would drop them in silence.
    const dir = makeTree({
      "CLAUDE.md": claudeMd("Why: `#defect-1`."),
      "documentation/agent-notes.md": TWO_SECTIONS,
      "src/nul.ts": Buffer.from(`export const SEP = " ";\n// see \`#status-history\`\n`, "utf8"),
    });
    const r = run(dir);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/3 tracked, 3 read, 0 unreadable/);
    expect(r.stdout).toContain("2 live bare-anchor form");
  });

  it("matches a pointer spelled in ASCII bytes inside a Windows-1252 file", () => {
    const win1252 = Buffer.concat([
      Buffer.from("// caf", "ascii"),
      Buffer.from([0xe9]),
      Buffer.from(" see `#status-history`\n", "ascii"),
    ]);
    const dir = makeTree({
      "CLAUDE.md": claudeMd("Why: `#defect-1`."),
      "documentation/agent-notes.md": TWO_SECTIONS,
      "src/legacy.ts": win1252,
    });
    const r = run(dir);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("2 live bare-anchor form");
  });

  it("does NOT match a pointer in a UTF-16 file, which is the disclosed miss", () => {
    const dir = makeTree({
      "CLAUDE.md": claudeMd("Why: `#defect-1`."),
      "documentation/agent-notes.md": TWO_SECTIONS,
      "src/utf16.ts": Buffer.from("// see `#status-history`\n", "utf16le"),
    });
    const r = run(dir);
    expect(r.code).toBe(0);
    // One pointer, not two: the UTF-16 spelling is invisible, by the stated rule.
    expect(r.stdout).toContain("1 live bare-anchor form");
  });

  it("ignores an anchor that is inside a fenced code block", () => {
    const dir = makeTree({
      "CLAUDE.md": claudeMd("Why: `#defect-1`. Why: `#fenced`."),
      "documentation/agent-notes.md":
        `# astm: agent notes\n\n<a id="defect-1"></a>\n\n## Defect 1\n\nBody.\n\n` +
        '```html\n<a id="fenced"></a>\n```\n',
    });
    const r = run(dir);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("#fenced");
  });
});

describe("this repository's own tree", () => {
  it("passes its own contract", () => {
    const r = run(REPO_ROOT);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
  });

  it("is written in the live bare-anchor form, which is why the sibling matchers are not used", () => {
    // The measurement this gate was derived from, pinned so a silent migration
    // of the spelling shows up here rather than as a gate that covers nothing.
    const r = run(REPO_ROOT);
    const m =
      /pointers: (\d+) \((\d+) live bare-anchor form, (\d+) basename-qualified, (\d+) path-qualified\)/.exec(
        r.stdout,
      );
    expect(m).not.toBeNull();
    const [, total, liveN] = m as RegExpExecArray;
    expect(Number(liveN)).toBeGreaterThan(0);
    expect(Number(liveN)).toBe(Number(total));
  });

  it("resolves its pointers through explicit anchors, which heading slugs alone would miss", () => {
    const notes = readFileSync(join(REPO_ROOT, "documentation", "agent-notes.md"), "utf8");
    const explicit = new Set([...notes.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)].map((m) => m[1]));
    expect(explicit.size).toBeGreaterThan(0);
    const claude = readFileSync(join(REPO_ROOT, "CLAUDE.md"), "utf8");
    const anchors = [...claude.matchAll(/`#([A-Za-z0-9._-]+)`/g)]
      .map((m) => m[1] as string)
      .filter((a) => a !== "anchor");
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) expect(explicit.has(a)).toBe(true);
  });
});
