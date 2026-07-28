import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * IA-conformance gate over the sidebar this package SHIPS.
 *
 * `docs-content/sidebars.json` is packed verbatim into the `docs-content.tar.gz` release asset that
 * `cosyte/docs` ingests, so it is a published contract, not a local build detail. A released tarball
 * is immutable and the docs pipeline re-fetches it forever: a non-canonical sidebar cannot be fixed
 * after the fact by any diff to any repo, only superseded by a later release. That is why this is a
 * gate here rather than a note. It caught nothing when it was written because the bytes were fixed in
 * the same change; its job is the next one.
 *
 * The spine is the one `cosyte/docs` enforces in `scripts/check-ia-conformance.ts`, transcribed here
 * because a parser repo cannot import from the docs site. Two rules are copied with it, and both
 * matter:
 *
 *   - Categories are OPTIONAL. The rule is "if you have it, label it canonically and order it
 *     canonically", so the minimal `{"docs":["intro"]}` is fully conforming. This gate must never
 *     demand a category the package has no content for.
 *   - "API Reference" is RESOLVER-INJECTED and must never be authored here. `cosyte/docs` inserts it
 *     just before "Troubleshooting" when the package ships a `source.tar.gz` that TypeDoc can render,
 *     which this package does. Authoring it is an error in the upstream lint, not a warning.
 *
 * The upstream lint grades a non-canonical label at `warning`, promoted to `error` by its strict
 * default. Here it is simply a failure: there is no mid-adoption state to stage in this repo.
 */
const CANONICAL_SPINE = [
  "Overview",
  "Installation",
  "Quickstart",
  "Core Concepts",
  "Guides",
  "API Reference",
  "Troubleshooting",
] as const;

/** Labels `cosyte/docs` injects itself. Authoring one here collides with the resolver. */
const RESOLVER_INJECTED: readonly string[] = ["API Reference"];

const docsContentDir = fileURLToPath(new URL("../docs-content/", import.meta.url));
const sidebarPath = `${docsContentDir}sidebars.json`;

interface Category {
  readonly label: string;
  readonly items: readonly unknown[];
}

const parsed: unknown = JSON.parse(readFileSync(sidebarPath, "utf8"));

/**
 * Narrow the shipped sidebar without an `as` cast. A gate that coerces its input can pass on a shape
 * the consumer would reject, which is the failure this file exists to prevent.
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
 * A category is anything carrying `type: "category"` and a string `label`, which is exactly what the
 * upstream lint keys on. It deliberately says NOTHING about the shape of `items`: an earlier version
 * of this file also required every entry of `items` to be a string, so a category holding a NESTED
 * category was not recognised as a category at all, and its off-spine label slipped past the spine
 * and order checks that exist to catch it. A narrowing that makes a gate blind to the very defect it
 * grades is worse than no narrowing. `items` is validated where it is consumed instead.
 */
function isCategory(item: unknown): item is Category {
  if (typeof item !== "object" || item === null) return false;
  if (!("type" in item) || item.type !== "category") return false;
  if (!("label" in item) || typeof item.label !== "string") return false;
  return "items" in item && Array.isArray(item.items);
}

/** The `intro`-style top-level doc reference, in either of the two shapes Docusaurus accepts. */
function docReferenceId(item: unknown): string | undefined {
  if (typeof item === "string") return item;
  if (typeof item !== "object" || item === null) return undefined;
  if (!("type" in item) || item.type !== "doc") return undefined;
  if (!("id" in item) || typeof item.id !== "string") return undefined;
  return item.id;
}

/**
 * Every doc id reachable from a list of sidebar entries, descending through nested categories. The
 * recursion is what keeps "every referenced doc exists" and "every shipped doc is reachable" honest
 * if this sidebar ever grows a subcategory: a flat read would call a nested doc unreachable and a
 * nested dangling id absent.
 */
function collectDocIds(entries: readonly unknown[]): string[] {
  return entries.flatMap((entry) => {
    const id = docReferenceId(entry);
    if (id !== undefined) return [id];
    return isCategory(entry) ? collectDocIds(entry.items) : [];
  });
}

/** Every category at any depth, so an off-spine label cannot hide inside a conforming one. */
function collectCategories(entries: readonly unknown[]): Category[] {
  return entries.flatMap((entry) =>
    isCategory(entry) ? [entry, ...collectCategories(entry.items)] : [],
  );
}

const items = topLevelItems(parsed);
const topLevelCategories = items.filter(isCategory);
const categoryLabels = topLevelCategories.map((c) => c.label);
const allCategoryLabels = collectCategories(items).map((c) => c.label);
const referencedIds = collectDocIds(items);

describe("shipped docs sidebar conforms to the cosyte IA spine", () => {
  it("every top-level category label is on the canonical spine", () => {
    const offSpine = categoryLabels.filter(
      (label) => !CANONICAL_SPINE.some((canonical) => canonical === label),
    );
    expect(offSpine).toEqual([]);
  });

  it("does not author the resolver-injected API Reference category, at any depth", () => {
    expect(allCategoryLabels.filter((label) => RESOLVER_INJECTED.includes(label))).toEqual([]);
  });

  it("canonical categories appear in canonical order, with no repeats", () => {
    // Off-spine labels are excluded, exactly as the upstream lint excludes them: they are already
    // reported by the label rule, and letting them participate here turns one defect into a second,
    // confusing failure whose message points at ordering rather than at the label.
    const positions = categoryLabels
      .map((label) => CANONICAL_SPINE.findIndex((canonical) => canonical === label))
      .filter((position) => position !== -1);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(new Set(positions).size).toBe(positions.length);
  });

  it("opens with a top-level doc reference, the Overview slot", () => {
    expect(docReferenceId(items[0])).toBe("intro");
  });

  it("every referenced doc id resolves to a shipped file", () => {
    const missing = referencedIds.filter((id) => !existsSync(`${docsContentDir}${id}.md`));
    expect(missing).toEqual([]);
  });

  it("every shipped doc is reachable from the sidebar", () => {
    const shipped = readdirSync(docsContentDir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => name.slice(0, -".md".length));
    expect(shipped.filter((id) => !referencedIds.includes(id))).toEqual([]);
  });
});
