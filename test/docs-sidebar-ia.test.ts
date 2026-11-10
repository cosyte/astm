import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The shape of the sidebar this package SHIPS, held to the docs-content standard (cosyte/config,
 * `documentation/decisions/0006-the-docs-content-standard.md`, section 3).
 *
 * `docs-content/sidebars.json` is packed verbatim into the `docs-content.tar.gz` release asset that
 * docs.cosyte.com renders, so it is a published contract, not a local build detail. A released
 * tarball is immutable: a wrong sidebar cannot be fixed after the fact, only superseded by a later
 * release. That is why this is a gate here rather than a note.
 *
 * The shape: `intro` first, as a page; then the categories in a fixed order, of which Installation,
 * Quickstart, How-to guides, Explanation and Troubleshooting are required and Tutorials and
 * Reference appear when there are such pages; then `testing-and-quality` and `performance`, as
 * pages, in that order. A category holds page ids, or categories of page ids one level down, and
 * nothing deeper. Every page is listed exactly once. "API Reference" is never authored here:
 * docs.cosyte.com adds that category itself, from the generated reference.
 *
 * docs.cosyte.com has to accept the four labels Tutorials, How-to guides, Explanation and Reference
 * before a release with this sidebar, as the standard says. That is a dependency of the release,
 * not of this file.
 */
const CATEGORY_ORDER = [
  "Installation",
  "Quickstart",
  "Tutorials",
  "How-to guides",
  "Explanation",
  "Reference",
  "Troubleshooting",
] as const;

const REQUIRED_CATEGORIES: readonly string[] = [
  "Installation",
  "Quickstart",
  "How-to guides",
  "Explanation",
  "Troubleshooting",
];

/** The page each of these categories opens with. */
const OPENING_PAGE: Readonly<Record<string, string>> = {
  Installation: "installation",
  Quickstart: "quickstart",
  Troubleshooting: "troubleshooting",
};

/** The two fixed pages, last, in this order. */
const CLOSING_PAGES = ["testing-and-quality", "performance"] as const;

/** A label docs.cosyte.com adds itself. Authoring it here collides with the site. */
const SITE_ADDED_LABEL = "API Reference";

const docsContentDir = fileURLToPath(new URL("../docs-content/", import.meta.url));

interface Category {
  readonly label: string;
  readonly items: readonly unknown[];
}

/**
 * Narrow the shipped sidebar without an `as` cast. A gate that coerces its input can pass on a shape
 * the site would reject, which is the failure this file exists to prevent.
 */
function topLevelItems(sidebar: unknown): readonly unknown[] {
  if (typeof sidebar !== "object" || sidebar === null || Array.isArray(sidebar)) {
    throw new Error("sidebars.json must be an object with a `docs` sidebar key");
  }
  if (!("docs" in sidebar)) throw new Error("sidebars.json must define a `docs` sidebar");
  const { docs } = sidebar;
  if (!Array.isArray(docs)) throw new Error("the `docs` sidebar must be an array");
  return docs;
}

/**
 * A category carries `type: "category"`, a string `label`, and an `items` array. It says nothing
 * about the contents of `items`, so a category holding a nested category is still recognized as a
 * category and its label is still graded.
 */
function isCategory(item: unknown): item is Category {
  if (typeof item !== "object" || item === null) return false;
  if (!("type" in item) || item.type !== "category") return false;
  if (!("label" in item) || typeof item.label !== "string") return false;
  return "items" in item && Array.isArray(item.items);
}

/** A page reference: a bare id string, the only form the standard uses. */
function pageId(item: unknown): string | undefined {
  return typeof item === "string" ? item : undefined;
}

/** Every page id reachable from a list of sidebar entries, descending through categories. */
function collectPageIds(entries: readonly unknown[]): string[] {
  return entries.flatMap((entry) => {
    const id = pageId(entry);
    if (id !== undefined) return [id];
    return isCategory(entry) ? collectPageIds(entry.items) : [];
  });
}

/** Every category at any depth, so a label cannot hide inside another category. */
function collectCategories(entries: readonly unknown[]): Category[] {
  return entries.flatMap((entry) =>
    isCategory(entry) ? [entry, ...collectCategories(entry.items)] : [],
  );
}

/** What is wrong with the shape of a sidebar, as a list of findings; empty when it conforms. */
function sidebarFindings(sidebar: unknown): string[] {
  const items = topLevelItems(sidebar);
  const findings: string[] = [];

  if (pageId(items[0]) !== "intro") findings.push("the sidebar does not open with the intro page");

  const closing = items.slice(-CLOSING_PAGES.length).map(pageId);
  if (closing.join(",") !== CLOSING_PAGES.join(",")) {
    findings.push(`the sidebar does not end with ${CLOSING_PAGES.join(" then ")}`);
  }

  const middle = items.slice(1, -CLOSING_PAGES.length);
  const labels: string[] = [];
  for (const entry of middle) {
    if (!isCategory(entry)) {
      findings.push(
        `between intro and the closing pages, ${JSON.stringify(entry)} is not a category`,
      );
      continue;
    }
    labels.push(entry.label);
    for (const child of entry.items) {
      if (pageId(child) !== undefined) continue;
      if (!isCategory(child)) {
        findings.push(`"${entry.label}" holds ${JSON.stringify(child)}, which is not a page id`);
        continue;
      }
      for (const grandchild of child.items) {
        if (pageId(grandchild) === undefined) {
          findings.push(`"${entry.label}" > "${child.label}" nests deeper than one level`);
        }
      }
    }
    const opening = OPENING_PAGE[entry.label];
    if (opening !== undefined && pageId(entry.items[0]) !== opening) {
      findings.push(`"${entry.label}" does not open with ${opening}`);
    }
  }

  for (const label of labels) {
    if (!CATEGORY_ORDER.some((known) => known === label)) {
      findings.push(`"${label}" is not a category of the standard`);
    }
  }
  const positions = labels
    .map((label) => CATEGORY_ORDER.findIndex((known) => known === label))
    .filter((position) => position !== -1);
  if (positions.join(",") !== [...new Set(positions)].sort((a, b) => a - b).join(",")) {
    findings.push("the categories are repeated or out of the standard's order");
  }
  for (const required of REQUIRED_CATEGORIES) {
    if (!labels.includes(required)) findings.push(`the required category "${required}" is missing`);
  }
  if (collectCategories(items).some((c) => c.label === SITE_ADDED_LABEL)) {
    findings.push(`"${SITE_ADDED_LABEL}" is added by docs.cosyte.com and must not be authored`);
  }

  const ids = collectPageIds(items);
  const repeated = ids.filter((id, index) => ids.indexOf(id) !== index);
  for (const id of new Set(repeated)) findings.push(`"${id}" is listed more than once`);
  return findings;
}

const shipped: unknown = JSON.parse(readFileSync(`${docsContentDir}sidebars.json`, "utf8"));

describe("the shipped docs sidebar has the standard's shape", () => {
  it("opens with intro, lists the categories in order, and ends with the two quality pages", () => {
    expect(sidebarFindings(shipped)).toEqual([]);
  });

  it("every listed page is a shipped file", () => {
    const missing = collectPageIds(topLevelItems(shipped)).filter(
      (id) => !existsSync(`${docsContentDir}${id}.md`),
    );
    expect(missing).toEqual([]);
  });

  it("every shipped page is listed", () => {
    const listed = collectPageIds(topLevelItems(shipped));
    const shippedPages = readdirSync(docsContentDir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => name.slice(0, -".md".length));
    expect(shippedPages.filter((id) => !listed.includes(id))).toEqual([]);
  });
});

describe("the sidebar gate fires", () => {
  const conforming: { readonly docs: readonly unknown[] } = {
    docs: [
      "intro",
      { type: "category", label: "Installation", items: ["installation"] },
      { type: "category", label: "Quickstart", items: ["quickstart"] },
      { type: "category", label: "How-to guides", items: ["a"] },
      { type: "category", label: "Explanation", items: ["b"] },
      { type: "category", label: "Troubleshooting", items: ["troubleshooting"] },
      "testing-and-quality",
      "performance",
    ],
  };

  function withDocs(docs: unknown[]): unknown {
    return { docs };
  }

  it("accepts a conforming sidebar", () => {
    expect(sidebarFindings(conforming)).toEqual([]);
  });

  it("names a sidebar that does not open with intro or end with the quality pages", () => {
    const docs = [...conforming.docs.slice(1, -1)];
    expect(sidebarFindings(withDocs(docs))).toEqual([
      "the sidebar does not open with the intro page",
      "the sidebar does not end with testing-and-quality then performance",
      'the required category "Installation" is missing',
      'the required category "Troubleshooting" is missing',
    ]);
  });

  it("names a label outside the standard, and categories out of order", () => {
    const docs = [...conforming.docs];
    docs[3] = { type: "category", label: "Guides", items: ["a"] };
    expect(sidebarFindings(withDocs(docs))).toEqual([
      '"Guides" is not a category of the standard',
      'the required category "How-to guides" is missing',
    ]);
    const swapped = [...conforming.docs];
    [swapped[3], swapped[4]] = [swapped[4], swapped[3]];
    expect(sidebarFindings(withDocs(swapped))).toEqual([
      "the categories are repeated or out of the standard's order",
    ]);
  });

  it("names the site-added label, a nested category too deep, and a page listed twice", () => {
    const docs = [...conforming.docs];
    docs[4] = {
      type: "category",
      label: "Explanation",
      items: [
        "b",
        {
          type: "category",
          label: "API Reference",
          items: [{ type: "category", label: "X", items: [] }],
        },
      ],
    };
    docs[3] = { type: "category", label: "How-to guides", items: ["a", "installation"] };
    expect(sidebarFindings(withDocs(docs))).toEqual([
      '"Explanation" > "API Reference" nests deeper than one level',
      '"API Reference" is added by docs.cosyte.com and must not be authored',
      '"installation" is listed more than once',
    ]);
  });

  it("names a category that does not open with its page", () => {
    const docs = [...conforming.docs];
    docs[1] = { type: "category", label: "Installation", items: ["other", "installation"] };
    expect(sidebarFindings(withDocs(docs))).toEqual([
      '"Installation" does not open with installation',
    ]);
  });
});
