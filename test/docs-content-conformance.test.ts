import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * STRUCTURAL CONFORMANCE GATE over the docs bundle this package SHIPS.
 *
 * `test/docs-sidebar-ia.test.ts` grades the sidebar against the upstream spine and
 * `test/docs-content.test.ts` runs the executable snippets. Neither grades the PAGES: their
 * frontmatter, their heading shape, their internal links, or the one rule this repo has broken
 * before and will break again, which is naming a release version in prose. This file is that gate.
 *
 * WHY IT IS A GATE AND NOT A REVIEW NOTE. The bundle is tarred into a release asset that
 * `cosyte/docs` re-fetches forever. A released tarball is IMMUTABLE: a wrong page cannot be
 * corrected in place by any later diff to any repo, only superseded by a later release, and it
 * renders wrong on the published site until then. Every rule below is one whose violation would
 * otherwise be found by a reader of the published page.
 *
 * HOW THE RULES ARE WRITTEN. Each is a pure function over an in-memory bundle, so each has both a
 * positive case over the SHIPPED bundle and a negative case over a synthetic one proving the rule
 * actually fires. A rule with no negative case is decoration: it passes on a bundle it cannot see.
 */

const docsContentDir = fileURLToPath(new URL("../docs-content/", import.meta.url));

// ---------------------------------------------------------------------------
// The bundle model
// ---------------------------------------------------------------------------

interface Page {
  /** File name with extension, e.g. `intro.md`. */
  readonly file: string;
  /** Frontmatter keys, values kept as written (unquoted, trimmed). */
  readonly frontmatter: ReadonlyMap<string, string>;
  /** Everything after the frontmatter block. */
  readonly body: string;
}

interface Bundle {
  readonly pages: readonly Page[];
  /** Every file name the bundle ships, markdown or not. */
  readonly files: readonly string[];
  /** Parsed `sidebars.json`, or `undefined` when the bundle ships none. */
  readonly sidebar: unknown;
}

/**
 * Split a page into frontmatter and body.
 *
 * A page with no leading `---` block yields an EMPTY frontmatter map rather than throwing, because
 * "the frontmatter is missing" is one of the defects this gate reports by name. A parser that
 * throws would turn a reported defect into a crashed suite.
 */
function parsePage(file: string, text: string): Page {
  const frontmatter = new Map<string, string>();
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (match === null) return { file, frontmatter, body: text };
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const kv = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (kv === null) continue;
    const key = kv[1];
    const value = (kv[2] ?? "").trim().replace(/^["']|["']$/g, "");
    if (key !== undefined) frontmatter.set(key, value);
  }
  return { file, frontmatter, body: text.slice(match[0].length) };
}

function readShippedBundle(): Bundle {
  const files = readdirSync(docsContentDir).sort();
  const pages = files
    .filter((f) => f.endsWith(".md"))
    .map((f) => parsePage(f, readFileSync(`${docsContentDir}${f}`, "utf8")));
  const sidebarPath = `${docsContentDir}sidebars.json`;
  const sidebar: unknown = existsSync(sidebarPath)
    ? JSON.parse(readFileSync(sidebarPath, "utf8"))
    : undefined;
  return { pages, files, sidebar };
}

/** Build a bundle from literal page sources, for the negative cases. */
function bundleOf(
  sources: Readonly<Record<string, string>>,
  sidebar?: unknown,
  extraFiles: readonly string[] = [],
): Bundle {
  const pages = Object.entries(sources).map(([file, text]) => parsePage(file, text));
  return { pages, files: [...Object.keys(sources), ...extraFiles], sidebar };
}

const shipped = readShippedBundle();

// ---------------------------------------------------------------------------
// Markdown structure helpers
// ---------------------------------------------------------------------------

/** Is this line a fence delimiter? Tracks ``` and ~~~ alike. */
function fenceDelimiter(line: string): string | undefined {
  const m = /^\s*(`{3,}|~{3,})/.exec(line);
  return m?.[1];
}

/**
 * Walk a body line by line, reporting whether each line sits inside a fenced code block.
 *
 * The fence state is the reason this is shared rather than re-derived per rule: a `## ` inside a
 * fenced block is not a heading and a version-shaped token inside one is not prose, and a rule that
 * forgets one of those reports a defect the reader cannot see.
 */
function* walkLines(body: string): Generator<{ line: string; number: number; inFence: boolean }> {
  let fence: string | undefined;
  const lines = body.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const delimiter = fenceDelimiter(line);
    if (fence === undefined && delimiter !== undefined) {
      fence = delimiter[0];
      yield { line, number: index + 1, inFence: true };
      continue;
    }
    if (fence !== undefined && delimiter !== undefined && delimiter[0] === fence) {
      fence = undefined;
      yield { line, number: index + 1, inFence: true };
      continue;
    }
    yield { line, number: index + 1, inFence: fence !== undefined };
  }
}

interface Heading {
  readonly level: number;
  readonly text: string;
  readonly number: number;
}

function headings(body: string): Heading[] {
  const out: Heading[] = [];
  for (const { line, number, inFence } of walkLines(body)) {
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    const hashes = m?.[1];
    const text = m?.[2];
    if (hashes === undefined || text === undefined) continue;
    out.push({ level: hashes.length, text, number });
  }
  return out;
}

/** The body under a level-2 heading, up to the next heading of level 1 or 2. */
function sectionUnder(body: string, title: string): string | undefined {
  const lines = body.split(/\r?\n/);
  const found = headings(body).find((h) => h.level === 2 && h.text === title);
  if (found === undefined) return undefined;
  const next = headings(body).find((h) => h.number > found.number && h.level <= 2);
  return lines.slice(found.number, next === undefined ? undefined : next.number - 1).join("\n");
}

/** Prose from a section: fenced blocks and blank lines removed, joined into one string. */
function proseOf(section: string): string {
  const kept: string[] = [];
  for (const { line, inFence } of walkLines(section)) {
    if (inFence) continue;
    if (line.trim().length === 0) continue;
    kept.push(line.trim());
  }
  return kept.join(" ");
}

/** The fenced blocks of a section, as `{ info, code }` pairs. */
function fencedBlocks(section: string): { info: string; code: string }[] {
  const out: { info: string; code: string }[] = [];
  let open: { info: string; code: string[] } | undefined;
  let fence: string | undefined;
  for (const line of section.split(/\r?\n/)) {
    const delimiter = fenceDelimiter(line);
    if (fence === undefined && delimiter !== undefined) {
      fence = delimiter[0];
      open = {
        info: line
          .trim()
          .replace(/^[`~]+/, "")
          .trim(),
        code: [],
      };
      continue;
    }
    if (fence !== undefined && delimiter !== undefined && delimiter[0] === fence) {
      if (open !== undefined) out.push({ info: open.info, code: open.code.join("\n") });
      fence = undefined;
      open = undefined;
      continue;
    }
    if (open !== undefined) open.code.push(line);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sidebar reachability
// ---------------------------------------------------------------------------

interface SidebarCategory {
  readonly label: string;
  readonly items: readonly unknown[];
}

function isCategory(item: unknown): item is SidebarCategory {
  if (typeof item !== "object" || item === null) return false;
  if (!("type" in item) || item.type !== "category") return false;
  if (!("label" in item) || typeof item.label !== "string") return false;
  return "items" in item && Array.isArray(item.items);
}

function docReferenceId(item: unknown): string | undefined {
  if (typeof item === "string") return item;
  if (typeof item !== "object" || item === null) return undefined;
  if (!("type" in item) || item.type !== "doc") return undefined;
  if (!("id" in item) || typeof item.id !== "string") return undefined;
  return item.id;
}

/** Top-level entries of the `docs` sidebar, or an empty list when the bundle ships none. */
function sidebarEntries(sidebar: unknown): readonly unknown[] {
  if (typeof sidebar !== "object" || sidebar === null || Array.isArray(sidebar)) return [];
  if (!("docs" in sidebar) || !Array.isArray(sidebar.docs)) return [];
  return sidebar.docs;
}

/**
 * Every doc id the sidebar reaches, mapped to the CATEGORY LABEL that holds it.
 *
 * A doc referenced at the top level (the Overview slot) belongs to no category, and is keyed under
 * a pseudo-label so the position rule can still group it. Nesting is followed, because a nested
 * category is a category: a flat read would call its pages uncategorised and let two of them share
 * a position unnoticed.
 */
function categoryByDocId(entries: readonly unknown[], label: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of entries) {
    const id = docReferenceId(entry);
    if (id !== undefined) {
      out.set(id, label);
      continue;
    }
    if (!isCategory(entry)) continue;
    for (const [k, v] of categoryByDocId(entry.items, entry.label)) out.set(k, v);
  }
  return out;
}

const TOP_LEVEL = "(top level)";

// ---------------------------------------------------------------------------
// RULE: required artifacts
// ---------------------------------------------------------------------------

/**
 * `scripts/build-docs-artifacts.sh` refuses a bundle missing either of these, and the docs repo
 * validates the same contract on ingest. Reporting it from the TEST SUITE rather than at artifact
 * build time is the whole point: the build runs on a release, and a release is where the defect
 * becomes permanent.
 */
const REQUIRED_ARTIFACTS = ["intro.md", "sidebars.json"] as const;

function checkRequiredArtifacts(bundle: Bundle): string[] {
  return REQUIRED_ARTIFACTS.filter((name) => !bundle.files.includes(name)).map(
    (name) => `the shipped bundle is missing ${name}`,
  );
}

// ---------------------------------------------------------------------------
// RULE: frontmatter shape and the single level-1 heading
// ---------------------------------------------------------------------------

const REQUIRED_FRONTMATTER = ["id", "title", "sidebar_position"] as const;

function checkFrontmatter(bundle: Bundle): string[] {
  const problems: string[] = [];
  for (const page of bundle.pages) {
    const stem = page.file.replace(/\.md$/, "");
    for (const key of REQUIRED_FRONTMATTER) {
      if (!page.frontmatter.has(key))
        problems.push(`${page.file}: frontmatter is missing \`${key}\``);
    }
    const id = page.frontmatter.get("id");
    if (id !== undefined && id !== stem) {
      problems.push(
        `${page.file}: frontmatter \`id\` is \`${id}\`, which is not the filename stem`,
      );
    }
    const position = page.frontmatter.get("sidebar_position");
    if (position !== undefined && !/^\d+$/.test(position)) {
      problems.push(`${page.file}: \`sidebar_position\` is \`${position}\`, which is not a number`);
    }
    const h1 = headings(page.body).filter((h) => h.level === 1);
    if (h1.length !== 1) {
      problems.push(`${page.file}: carries ${String(h1.length)} level-1 headings, not exactly one`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// RULE: `sidebar_position` is unique within a sidebar category
// ---------------------------------------------------------------------------

/**
 * Two pages in one category declaring the same position leaves their order to whatever the docs
 * site's tie-break happens to be, which is a rendering nobody chose. It is graded PER CATEGORY
 * rather than per bundle because the field is scoped that way: two categories each opening at `1`
 * is correct.
 */
function checkSidebarPositions(bundle: Bundle): string[] {
  const category = categoryByDocId(sidebarEntries(bundle.sidebar), TOP_LEVEL);
  const seen = new Map<string, Map<string, string>>();
  const problems: string[] = [];
  for (const page of bundle.pages) {
    const stem = page.file.replace(/\.md$/, "");
    const position = page.frontmatter.get("sidebar_position");
    if (position === undefined) continue;
    const label = category.get(stem) ?? "(unreferenced)";
    const inCategory = seen.get(label) ?? new Map<string, string>();
    const clash = inCategory.get(position);
    if (clash !== undefined) {
      problems.push(
        `${page.file} and ${clash} both declare \`sidebar_position: ${position}\` in the ` +
          `\`${label}\` category`,
      );
    } else {
      inCategory.set(position, page.file);
    }
    seen.set(label, inCategory);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// RULE: a relative link resolves to a shipped page
// ---------------------------------------------------------------------------

/**
 * A broken sibling link on a published, immutable page is a dead end a later diff cannot repair.
 * Only RELATIVE targets are graded: an external URL is somebody else's uptime, and a target that is
 * a bare fragment names no page at all.
 */
function checkRelativeLinks(bundle: Bundle): string[] {
  const stems = new Set(bundle.pages.map((p) => p.file.replace(/\.md$/, "")));
  const problems: string[] = [];
  for (const page of bundle.pages) {
    for (const m of page.body.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[1] ?? "";
      if (!target.startsWith(".")) continue;
      const withoutAnchor = target.split("#")[0] ?? "";
      const stem = withoutAnchor.replace(/^\.\//, "").replace(/\.md$/, "");
      if (stem.length === 0) continue;
      if (!stems.has(stem)) {
        problems.push(`${page.file}: relative link \`${target}\` names no shipped page`);
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// RULE: no package release version token in prose
// ---------------------------------------------------------------------------

/**
 * THE RULE THIS BUNDLE HAS BROKEN BEFORE. The tarball is immutable and the version moves, so a
 * number written into prose here is a statement that goes false on the next release and cannot be
 * corrected. The number is derived at read time (`npm view @cosyte/astm version`); the pages say
 * what is stable in words instead.
 *
 * WHAT COUNTS AS A TOKEN: `N.N`, `N.N.N` or `N.N.x`, with an optional leading `v`.
 *
 * WHAT IS SCANNED, and this is where the rule earns its keep rather than over-firing. Fenced code
 * blocks are excluded, because a block is a sample a reader copies rather than a claim the page
 * makes. INLINE code spans are NOT excluded wholesale, and must not be: both stale statements this
 * gate exists to prevent were written as inline spans. The line drawn instead is the one that
 * separates a claim from a sample: a span holding NOTHING BUT a version-shaped token is prose
 * presenting a version, and a span holding anything else (an ASTM record, a wire value, a warning
 * code, a delimiter set) is quoted sample data whose digits are not a version.
 *
 * THE EXEMPTIONS ARE PHRASES, NOT NUMBERS, and each names its reason. Keying an exemption on the
 * bare number would exempt that number everywhere on the page forever, including in a sentence
 * about this package's own releases. Each phrase must still occur in its page, so an exemption
 * cannot outlive the text it was written for.
 */
const VERSION_TOKEN_SOURCE = String.raw`v?\d+\.\d+(?:\.(?:\d+|x))?`;
const VERSION_TOKEN_GLOBAL = new RegExp(VERSION_TOKEN_SOURCE, "g");
const VERSION_TOKEN_WHOLE = new RegExp(`^${VERSION_TOKEN_SOURCE}$`);

interface VersionExemption {
  readonly page: string;
  readonly phrase: string;
  readonly why: string;
}

const VERSION_EXEMPTIONS: readonly VersionExemption[] = [
  {
    page: "limitations.md",
    phrase: "version `4.0.0`",
    why:
      "the version of the HL7 v3 ObservationInterpretation code system this library graded the " +
      "abnormal flags against. It is an external vocabulary's designation, not a release of this " +
      "package, and the page already tells the reader to read `flag.vocabulary.version` rather " +
      "than copy the string.",
  },
  {
    page: "troubleshooting.md",
    phrase: "`1.5` and `257`",
    why:
      "two `startFrameNumber` argument values measured to truncate back onto a digit. They are " +
      "inputs a caller passes to this package, not releases of it, and the pair is the " +
      "measurement the paragraph reports.",
  },
];

function maskPhrase(line: string, phrase: string): string {
  let out = line;
  for (;;) {
    const at = out.indexOf(phrase);
    if (at === -1) return out;
    out = out.slice(0, at) + " ".repeat(phrase.length) + out.slice(at + phrase.length);
  }
}

/** Blank out every inline code span that is not, on its own, a version-shaped token. */
function maskSampleSpans(line: string): string {
  return line.replace(/(`+)([^`]*)\1/g, (whole: string, ticks: string, inner: string) =>
    VERSION_TOKEN_WHOLE.test(inner.trim()) ? whole.replace(/`/g, " ") : " ".repeat(whole.length),
  );
}

function checkVersionTokens(bundle: Bundle): string[] {
  const problems: string[] = [];
  for (const exemption of VERSION_EXEMPTIONS) {
    const page = bundle.pages.find((p) => p.file === exemption.page);
    if (page === undefined) continue;
    if (!page.body.includes(exemption.phrase)) {
      problems.push(
        `${exemption.page}: the version exemption for \`${exemption.phrase}\` no longer matches ` +
          `anything on the page. Delete it rather than leaving a standing exemption nobody needs.`,
      );
    }
  }
  for (const page of bundle.pages) {
    const exemptions = VERSION_EXEMPTIONS.filter((e) => e.page === page.file);
    for (const { line, number, inFence } of walkLines(page.body)) {
      if (inFence) continue;
      let text = line;
      for (const e of exemptions) text = maskPhrase(text, e.phrase);
      text = maskSampleSpans(text);
      for (const m of text.matchAll(VERSION_TOKEN_GLOBAL)) {
        problems.push(
          `${page.file}:${String(number)}: prose names a release version token \`${m[0]}\``,
        );
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// RULE: the status statement on the two pages that carry one
// ---------------------------------------------------------------------------

/**
 * The overview and the installation page each open with a status blockquote, and a reader deciding
 * whether to depend on this package reads it before anything else. It has to say what is stable and
 * what is still moving, and it has to say both WITHOUT a number, for the reason the version rule
 * gives. The two markers are graded by name because that is the only way a required statement is
 * gradeable at all: a rule that asks whether prose "says enough" grades nothing.
 */
const STATUS_PAGES = ["intro.md", "installation.md"] as const;
const STATUS_MARKER = /^>\s*\*\*Status:\*\*/;
const STABILITY_CLAIM = /\bstab(?:le|ility|ilise|ilize)\w*\b/i;
const MOVING_SURFACE = /\bstill\b[^.]{0,160}?\b(?:mov(?:e|es|ing)|chang(?:e|es|ing))\b/i;

function statusStatement(body: string): string | undefined {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => STATUS_MARKER.test(l));
  if (start === -1) return undefined;
  const out: string[] = [];
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!line.startsWith(">")) break;
    out.push(line.replace(/^>\s?/, ""));
  }
  return out.join(" ");
}

function checkStatusStatements(bundle: Bundle): string[] {
  const problems: string[] = [];
  for (const name of STATUS_PAGES) {
    const page = bundle.pages.find((p) => p.file === name);
    if (page === undefined) continue;
    const statement = statusStatement(page.body);
    if (statement === undefined) {
      problems.push(`${name}: carries no \`> **Status:**\` blockquote`);
      continue;
    }
    if (!STABILITY_CLAIM.test(statement)) {
      problems.push(`${name}: the status statement names no stability claim`);
    }
    if (!MOVING_SURFACE.test(statement)) {
      problems.push(`${name}: the status statement names no surface that is still moving`);
    }
    // Deliberately stricter than the prose rule above: a status statement has no sample data in
    // it, so a version-shaped token anywhere inside one, inline span or not, is a version.
    for (const m of statement.matchAll(VERSION_TOKEN_GLOBAL)) {
      problems.push(`${name}: the status statement names a version token \`${m[0]}\``);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// RULE: the required pages, graded by heading name
// ---------------------------------------------------------------------------

/**
 * Two questions an integrator must be able to answer off the published site before feeding lab
 * traffic through this package: what it does with patient data, and how to tolerate a documented
 * vendor quirk. Both are graded by REQUIRED HEADING NAME on sidebar-reachable content, which is
 * what makes "the coverage is complete" a test result rather than an opinion.
 */
const PATIENT_DATA_HEADINGS = [
  "What it logs",
  "What it retains",
  "What it writes to disk",
  "What you still own",
] as const;

const PROFILE_APPLY_HEADING = "Apply a vendor profile";
const PROFILE_GATE_HEADING = "The profile safety gate";

/** A profile example has to show BOTH halves: building one, and putting it to work. */
const PROFILE_DEFINES = /\bdefineAstmProfile\s*\(/;
const PROFILE_APPLIES = /\bapplyAstmProfile\s*\(|\bprofile\s*:/;

/** The two claims the safety section must make, because leaving either out misdescribes the gate. */
const DEFAULT_DENY = /\bdefault-deny\b/i;
const NEVER_TOUCHES_A_VALUE =
  /\bnever\b[^.]{0,160}\b(?:touch(?:es)?|alter(?:s)?|change(?:s)?|rewrit(?:e|es))\b[^.]{0,80}\bvalue\b/i;

/** At least one sentence of body text: a heading with nothing under it documents nothing. */
const A_SENTENCE = /[A-Za-z][^.!?]{9,}[.!?]/;

function reachablePages(bundle: Bundle): Page[] {
  const reachable = categoryByDocId(sidebarEntries(bundle.sidebar), TOP_LEVEL);
  return bundle.pages.filter((p) => reachable.has(p.file.replace(/\.md$/, "")));
}

function checkPatientDataPage(bundle: Bundle): string[] {
  const candidates = reachablePages(bundle).filter((page) => {
    const names = new Set(
      headings(page.body)
        .filter((h) => h.level === 2)
        .map((h) => h.text),
    );
    return PATIENT_DATA_HEADINGS.every((h) => names.has(h));
  });
  const page = candidates[0];
  if (page === undefined) {
    return [
      "no sidebar-reachable page carries all four patient-data headings: " +
        PATIENT_DATA_HEADINGS.join(", "),
    ];
  }
  const problems: string[] = [];
  for (const title of PATIENT_DATA_HEADINGS) {
    const section = sectionUnder(page.body, title);
    if (section === undefined || !A_SENTENCE.test(proseOf(section))) {
      problems.push(`${page.file}: \`${title}\` is not followed by a sentence of body text`);
    }
  }
  return problems;
}

function checkVendorProfileContent(bundle: Bundle): string[] {
  const candidates = reachablePages(bundle).filter((page) => {
    const names = new Set(
      headings(page.body)
        .filter((h) => h.level === 2)
        .map((h) => h.text),
    );
    return names.has(PROFILE_APPLY_HEADING) && names.has(PROFILE_GATE_HEADING);
  });
  const page = candidates[0];
  if (page === undefined) {
    return [
      `no sidebar-reachable page carries both \`${PROFILE_APPLY_HEADING}\` and ` +
        `\`${PROFILE_GATE_HEADING}\``,
    ];
  }
  const problems: string[] = [];

  const apply = sectionUnder(page.body, PROFILE_APPLY_HEADING) ?? "";
  const example = fencedBlocks(apply).find(
    (b) => /^ts\b/.test(b.info) && PROFILE_DEFINES.test(b.code) && PROFILE_APPLIES.test(b.code),
  );
  if (example === undefined) {
    problems.push(
      `${page.file}: \`${PROFILE_APPLY_HEADING}\` carries no fenced \`ts\` example that both ` +
        "defines and applies a profile",
    );
  }

  const gate = proseOf(sectionUnder(page.body, PROFILE_GATE_HEADING) ?? "");
  if (!DEFAULT_DENY.test(gate)) {
    problems.push(
      `${page.file}: \`${PROFILE_GATE_HEADING}\` does not state that it is default-deny`,
    );
  }
  if (!NEVER_TOUCHES_A_VALUE.test(gate)) {
    problems.push(
      `${page.file}: \`${PROFILE_GATE_HEADING}\` does not state that a profile never alters an ` +
        "extracted value",
    );
  }
  return problems;
}

// ---------------------------------------------------------------------------
// RULE: the tolerable-code list is never snapshotted into prose
// ---------------------------------------------------------------------------

/**
 * Every snapshot of that list written into prose has gone stale, and this bundle is the one place a
 * stale snapshot cannot be corrected. The set moves with the library, so the page names the
 * accessor and the reader reads the code.
 */
const QUOTED_TOLERABLE_LIST = /\bTOLERABLE_CODES\b|\b\d+\s+tolerable\b/i;

function checkNoToleratedListSnapshot(bundle: Bundle): string[] {
  const problems: string[] = [];
  for (const page of bundle.pages) {
    for (const { line, number } of walkLines(page.body)) {
      if (QUOTED_TOLERABLE_LIST.test(line)) {
        problems.push(
          `${page.file}:${String(number)}: quotes the tolerable-code list or its count; name ` +
            "`isSafetyCriticalCode` instead",
        );
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// The shipped bundle
// ---------------------------------------------------------------------------

describe("the shipped docs bundle conforms", () => {
  it("ships the two artifacts the release build and the docs repo both require", () => {
    expect(checkRequiredArtifacts(shipped)).toEqual([]);
  });

  it("carries `id`, `title` and `sidebar_position` on every page, with one level-1 heading", () => {
    expect(checkFrontmatter(shipped)).toEqual([]);
  });

  it("declares no duplicate `sidebar_position` inside one sidebar category", () => {
    expect(checkSidebarPositions(shipped)).toEqual([]);
  });

  it("resolves every relative link to a shipped page", () => {
    expect(checkRelativeLinks(shipped)).toEqual([]);
  });

  it("names no package release version in prose", () => {
    expect(checkVersionTokens(shipped)).toEqual([]);
  });

  it("carries a version-free status statement on the overview and installation pages", () => {
    expect(checkStatusStatements(shipped)).toEqual([]);
  });

  it("answers what the library does with patient data, under the four required headings", () => {
    expect(checkPatientDataPage(shipped)).toEqual([]);
  });

  it("documents applying a vendor profile and the safety gate that bounds it", () => {
    expect(checkVendorProfileContent(shipped)).toEqual([]);
  });

  it("never snapshots the tolerable-code list or its count into prose", () => {
    expect(checkNoToleratedListSnapshot(shipped)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Each rule is shown to FIRE
// ---------------------------------------------------------------------------
//
// A conformance gate that has only ever been run against a conforming bundle has not been shown to
// grade anything. Every rule above gets a synthetic bundle it must reject, and the assertion is on
// the MESSAGE as well as the count, because a rule that fails for the wrong reason sends the next
// author to the wrong line.

const PAGE = (front: string, body: string): string => `---\n${front}\n---\n\n${body}\n`;

const MINIMAL_SIDEBAR = { docs: ["intro"] };

describe("the conformance gate fires", () => {
  it("names an absent `intro.md` and an absent `sidebars.json`", () => {
    const problems = checkRequiredArtifacts(bundleOf({ "other.md": PAGE("id: other", "# Other") }));
    expect(problems).toHaveLength(2);
    expect(problems.join(" ")).toContain("intro.md");
    expect(problems.join(" ")).toContain("sidebars.json");
  });

  it("names a missing frontmatter key", () => {
    const problems = checkFrontmatter(
      bundleOf({ "intro.md": PAGE("id: intro\ntitle: Intro", "# Intro") }),
    );
    expect(problems).toEqual(["intro.md: frontmatter is missing `sidebar_position`"]);
  });

  it("names an `id` that is not the filename stem", () => {
    const problems = checkFrontmatter(
      bundleOf({
        "intro.md": PAGE("id: getting-started\ntitle: Intro\nsidebar_position: 1", "# Intro"),
      }),
    );
    expect(problems).toEqual([
      "intro.md: frontmatter `id` is `getting-started`, which is not the filename stem",
    ]);
  });

  it("names a page carrying two level-1 headings, and one carrying none", () => {
    const front = "id: intro\ntitle: Intro\nsidebar_position: 1";
    expect(checkFrontmatter(bundleOf({ "intro.md": PAGE(front, "# One\n\n# Two") }))).toEqual([
      "intro.md: carries 2 level-1 headings, not exactly one",
    ]);
    expect(checkFrontmatter(bundleOf({ "intro.md": PAGE(front, "## Only a two") }))).toEqual([
      "intro.md: carries 0 level-1 headings, not exactly one",
    ]);
  });

  it("does not count a `#` inside a fenced block as a heading", () => {
    const front = "id: intro\ntitle: Intro\nsidebar_position: 1";
    const body = "# Intro\n\n```bash\n# a shell comment, not a heading\n```";
    expect(checkFrontmatter(bundleOf({ "intro.md": PAGE(front, body) }))).toEqual([]);
  });

  it("names two pages sharing a `sidebar_position` inside one category", () => {
    const sidebar = {
      docs: [{ type: "category", label: "Troubleshooting", items: ["a", "b"] }],
    };
    const problems = checkSidebarPositions(
      bundleOf(
        {
          "a.md": PAGE("id: a\ntitle: A\nsidebar_position: 1", "# A"),
          "b.md": PAGE("id: b\ntitle: B\nsidebar_position: 1", "# B"),
        },
        sidebar,
      ),
    );
    expect(problems).toEqual([
      "b.md and a.md both declare `sidebar_position: 1` in the `Troubleshooting` category",
    ]);
  });

  it("allows the same position in two DIFFERENT categories", () => {
    const sidebar = {
      docs: [
        { type: "category", label: "Installation", items: ["a"] },
        { type: "category", label: "Guides", items: ["b"] },
      ],
    };
    const problems = checkSidebarPositions(
      bundleOf(
        {
          "a.md": PAGE("id: a\ntitle: A\nsidebar_position: 1", "# A"),
          "b.md": PAGE("id: b\ntitle: B\nsidebar_position: 1", "# B"),
        },
        sidebar,
      ),
    );
    expect(problems).toEqual([]);
  });

  it("names the linking page and the unresolved target of a broken relative link", () => {
    const problems = checkRelativeLinks(
      bundleOf({
        "intro.md": PAGE("id: intro", "# Intro\n\nSee [the guide](./guides-overview)."),
      }),
    );
    expect(problems).toEqual(["intro.md: relative link `./guides-overview` names no shipped page"]);
  });

  it("resolves a relative link written with `.md` and with an anchor", () => {
    const problems = checkRelativeLinks(
      bundleOf({
        "intro.md": PAGE("id: intro", "# Intro\n\n[a](./other.md) and [b](./other#part)."),
        "other.md": PAGE("id: other", "# Other"),
      }),
    );
    expect(problems).toEqual([]);
  });

  it("leaves an absolute URL alone", () => {
    const problems = checkRelativeLinks(
      bundleOf({ "intro.md": PAGE("id: intro", "# Intro\n\n[npm](https://example.com/pkg).") }),
    );
    expect(problems).toEqual([]);
  });

  it("names a version token written as a bare word and one written as an inline span", () => {
    const bare = checkVersionTokens(
      bundleOf({ "intro.md": PAGE("id: intro", "# Intro\n\nStable from 1.2.0 onward.") }),
    );
    expect(bare).toEqual(["intro.md:4: prose names a release version token `1.2.0`"]);

    const span = checkVersionTokens(
      bundleOf({
        "intro.md": PAGE("id: intro", "# Intro\n\nOn the `0.0.x` ladder, before `0.1.0`."),
      }),
    );
    expect(span).toHaveLength(2);
    expect(span.join(" ")).toContain("`0.0.x`");
    expect(span.join(" ")).toContain("`0.1.0`");
  });

  it("catches a `vN.N` form too", () => {
    const problems = checkVersionTokens(
      bundleOf({ "intro.md": PAGE("id: intro", "# Intro\n\nShipped in v2.1.") }),
    );
    expect(problems).toEqual(["intro.md:4: prose names a release version token `v2.1`"]);
  });

  it("does not fire inside a fenced code block", () => {
    const body = "# Intro\n\n```bash\nnpm install @cosyte/astm@1.2.3\n```";
    expect(checkVersionTokens(bundleOf({ "intro.md": PAGE("id: intro", body) }))).toEqual([]);
  });

  it("does not fire on the digits inside a quoted wire sample", () => {
    // The line that made the exemption table necessary: an ASTM record quoted inline carries
    // decimals that are analyte values, not versions. The span is not a version on its own, so it
    // is sample data and the rule leaves it alone.
    const body = "# Intro\n\nSo `R|1|^^^687|28.6&F&|&F&U/L||||F` reads nine fields.";
    expect(checkVersionTokens(bundleOf({ "intro.md": PAGE("id: intro", body) }))).toEqual([]);
  });

  it("does not fire on the Node engine floor, a standard designation, or a LOINC code", () => {
    const body =
      "# Intro\n\n" +
      "Needs Node.js >= 22, targets CLSI LIS02-A2 (formerly ASTM E1394-97) and maps `1920-8`.";
    expect(checkVersionTokens(bundleOf({ "intro.md": PAGE("id: intro", body) }))).toEqual([]);
  });

  it("reports an exemption whose phrase no longer occurs, so none can outlive its text", () => {
    const problems = checkVersionTokens(
      bundleOf({ "limitations.md": PAGE("id: limitations", "# Limitations\n\nNothing here.") }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("no longer matches anything on the page");
  });

  it("names a status statement carrying a version, and one that is absent", () => {
    const withVersion = checkStatusStatements(
      bundleOf({
        "intro.md": PAGE(
          "id: intro",
          "# Intro\n\n> **Status:** the API is not yet stable and can still change, before `0.1.0`.",
        ),
      }),
    );
    expect(withVersion).toEqual(["intro.md: the status statement names a version token `0.1.0`"]);

    const absent = checkStatusStatements(
      bundleOf({
        "installation.md": PAGE("id: installation", "# Installation\n\nNo status here."),
      }),
    );
    expect(absent).toEqual(["installation.md: carries no `> **Status:**` blockquote"]);
  });

  it("names a status statement that omits the stability claim or the moving surface", () => {
    const problems = checkStatusStatements(
      bundleOf({
        "intro.md": PAGE("id: intro", "# Intro\n\n> **Status:** published on npm."),
      }),
    );
    expect(problems).toHaveLength(2);
    expect(problems.join(" ")).toContain("no stability claim");
    expect(problems.join(" ")).toContain("no surface that is still moving");
  });

  it("names a missing patient-data page, and a heading with nothing under it", () => {
    const absent = checkPatientDataPage(
      bundleOf({ "intro.md": PAGE("id: intro", "# Intro") }, MINIMAL_SIDEBAR),
    );
    expect(absent).toHaveLength(1);
    expect(absent[0]).toContain("all four patient-data headings");

    const empty = checkPatientDataPage(
      bundleOf(
        {
          "intro.md": PAGE(
            "id: intro",
            "# Intro\n\n" +
              "## What it logs\n\n" +
              "## What it retains\n\nIt retains nothing at all between calls.\n\n" +
              "## What it writes to disk\n\nIt writes nothing to disk, ever, on any path.\n\n" +
              "## What you still own\n\nYou still own transport, storage and every log line.",
          ),
        },
        MINIMAL_SIDEBAR,
      ),
    );
    expect(empty).toEqual(["intro.md: `What it logs` is not followed by a sentence of body text"]);
  });

  it("does not accept a patient-data page the sidebar cannot reach", () => {
    const problems = checkPatientDataPage(
      bundleOf(
        {
          "orphan.md": PAGE(
            "id: orphan",
            "# Orphan\n\n" +
              PATIENT_DATA_HEADINGS.map((h) => `## ${h}\n\nA sentence of ordinary body text.`).join(
                "\n\n",
              ),
          ),
        },
        MINIMAL_SIDEBAR,
      ),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("no sidebar-reachable page");
  });

  it("names profile content missing its example, its default-deny claim, or its value claim", () => {
    const problems = checkVendorProfileContent(
      bundleOf(
        {
          "intro.md": PAGE(
            "id: intro",
            "# Intro\n\n" +
              `## ${PROFILE_APPLY_HEADING}\n\n` +
              "```ts\nconst site = defineAstmProfile({ name: 'x' });\n```\n\n" +
              `## ${PROFILE_GATE_HEADING}\n\nThe gate refuses some codes.`,
          ),
        },
        MINIMAL_SIDEBAR,
      ),
    );
    expect(problems).toHaveLength(3);
    expect(problems.join(" ")).toContain("defines and applies a profile");
    expect(problems.join(" ")).toContain("default-deny");
    expect(problems.join(" ")).toContain("never alters an extracted value");
  });

  it("names a page that snapshots the tolerable-code list or its count", () => {
    const byName = checkNoToleratedListSnapshot(
      bundleOf({ "intro.md": PAGE("id: intro", "# Intro\n\nRead `TOLERABLE_CODES` for the set.") }),
    );
    expect(byName).toHaveLength(1);
    expect(byName[0]).toContain("intro.md:4");

    const byCount = checkNoToleratedListSnapshot(
      bundleOf({ "intro.md": PAGE("id: intro", "# Intro\n\nThere are 9 tolerable codes today.") }),
    );
    expect(byCount).toHaveLength(1);
  });
});
