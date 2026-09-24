import { execFileSync } from "node:child_process";
import { rmSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  docSnippetSuite,
  extractRunnableSnippets,
  runSnippet,
} from "@cosyte/vitest-config/snippets";

import {
  compileErrors,
  fences,
  fixturesByContent,
  recordStreamLiteral,
} from "./_helpers/first-use.js";

/**
 * Doc/code-agreement gate. Every ```` ```ts runnable ```` block in `docs-content/` is extracted,
 * compiled, and executed, and its inline `// =>` assertions are checked, so a documented example can
 * never silently drift from the shipped code (the documentation analog of the conformance runners).
 *
 * Snippets import the package the way a consumer does: against the **built** ESM artifact, not the
 * source tree. The harness executes each block as a standalone ES module, so it can't resolve the
 * source's internal `.js`→`.ts` imports; the bundled `dist/index.mjs` is self-contained and is also
 * exactly what an installer loads. The shared CI gate runs `test` before `build`, so we provision
 * `dist/` on demand here rather than assuming build order.
 */
const root = join(import.meta.dirname, "..");
const distEntry = join(root, "dist", "index.mjs");
const resolve = (specifier: string): string | undefined =>
  specifier === "@cosyte/astm" ? distEntry : undefined;

beforeAll(() => {
  execFileSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
}, 120_000);

docSnippetSuite({
  docsDir: join(root, "docs-content"),
  resolve,
});

/**
 * The quickstart's FIRST example is the first thing a reader runs from the docs site, so it is held
 * to more than the sweep above: it must be the block the sweep executes, its record stream must be a
 * committed synthetic fixture (the page is public, and `test/fixtures` is the corpus `pnpm phi-scan`
 * reads), and a changed value in it must turn this suite red. Its temp modules live inside the root,
 * as the harness requires, and are removed when the file is done, so nothing is left on disk.
 */
const quickstart = readFileSync(join(root, "docs-content", "quickstart.md"), "utf8");
const firstBlock = fences(quickstart)[0];
const firstRunnable = extractRunnableSnippets(quickstart)[0];
const firstUseTmp = join(root, ".cosyte-first-use-snippets");
/**
 * The snippet harness strips types without checking them, so compiling is checked separately, the
 * way a reader's new TypeScript project compiles the block, against the source entry point the
 * bundler compiles into the published types. A program over the source takes seconds to check, so
 * these cases state their own budget.
 */
const sourcePaths = { "@cosyte/astm": join(root, "src", "index.ts") };
const COMPILE_TIMEOUT = 60_000;

afterAll(() => {
  rmSync(firstUseTmp, { recursive: true, force: true });
});

describe("the quickstart's first example", () => {
  it("AC-AS1: is a runnable TypeScript block, so the sweep above executes it", () => {
    expect(firstBlock?.lang).toBe("ts");
    expect(firstBlock?.tags).toContain("runnable");
    expect(firstBlock?.tags).not.toContain("throws");
    expect(firstRunnable?.code).toBe(firstBlock?.body);
  });

  it(
    "AC-AS1: compiles in a new TypeScript project against the package's types",
    () => {
      expect(compileErrors(root, sourcePaths, firstBlock?.body ?? "")).toEqual([]);
    },
    COMPILE_TIMEOUT,
  );

  it(
    "AC-AS1: a block that does not compile is reported, so it turns this suite red",
    () => {
      const code = firstBlock?.body ?? "";
      expect(code.split("first?.value;").length - 1).toBe(1);
      const mutated = code.replace("first?.value;", "first.value;");
      expect(compileErrors(root, sourcePaths, mutated)).toEqual([
        expect.stringContaining("TS18048"),
      ]);
    },
    COMPILE_TIMEOUT,
  );

  it("AC-AS1: runs against the built package and every claimed value holds", async () => {
    expect(firstRunnable).toBeDefined();
    if (firstRunnable === undefined) return;
    await runSnippet(firstRunnable, { resolve, tmpDir: firstUseTmp });
  });

  it("AC-AS4: its record stream is a byte-for-byte copy of a fixture under test/fixtures", () => {
    const stream = recordStreamLiteral(firstRunnable?.code ?? "");
    expect(stream).toBeDefined();
    const fixtures = fixturesByContent(root, join(root, "test", "fixtures"));
    expect(fixtures.get(stream ?? "")).toBeDefined();
  });

  it("AC-AS3: a changed claimed value turns the run red", async () => {
    const code = firstRunnable?.code ?? "";
    expect(code.split('// => "28.6"').length - 1).toBe(1);
    const mutated = code.replace('// => "28.6"', '// => "31.4"');
    await expect(runSnippet(mutated, { resolve, tmpDir: firstUseTmp })).rejects.toThrow();
  });

  it("AC-AS3: a changed input value turns the run red and leaves the fixture corpus", async () => {
    const code = firstRunnable?.code ?? "";
    expect(code.split("|28.6|").length - 1).toBe(1);
    const mutated = code.replace("|28.6|", "|31.4|");
    const fixtures = fixturesByContent(root, join(root, "test", "fixtures"));
    expect(fixtures.get(recordStreamLiteral(mutated) ?? "")).toBeUndefined();
    await expect(runSnippet(mutated, { resolve, tmpDir: firstUseTmp })).rejects.toThrow();
  });
});
