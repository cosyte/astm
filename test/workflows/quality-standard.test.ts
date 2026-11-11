/**
 * How this repository adopts the shared testing standard, checked from the files that carry it:
 * the floor file, the scripts, the mutation config, the property runner and the workflow callers.
 *
 * Each piece is quiet when it goes missing. A floor file without a metric is a metric nobody holds,
 * a caller that drops an input turns its job into a skipped check that still reads green, and a
 * property that calls fast-check directly runs its own depth whatever the nightly job asks for. So
 * each is read here, and a pass means each was found as it should be.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const WORKFLOWS = join(REPO_ROOT, ".github", "workflows");
const PROPERTY_DIR = join(REPO_ROOT, "test", "property");

function read(...parts: string[]): string {
  return readFileSync(join(REPO_ROOT, ...parts), "utf8");
}

/** Import a module of this repository by its path, typed as the caller says it is. */
async function importModule<T>(...parts: string[]): Promise<T> {
  const specifier: string = pathToFileURL(join(REPO_ROOT, ...parts)).href;
  return (await import(specifier)) as T;
}

/** The commit a caller's `uses:` line names for a shared workflow, or `undefined`. */
function sharedCommit(text: string, workflow: string): string | undefined {
  const pattern = new RegExp(
    `uses: cosyte/\\.github/\\.github/workflows/${workflow.replace(".", "\\.")}@([0-9a-f]{40}) # `,
    "u",
  );
  return pattern.exec(text)?.[1];
}

/** The fuzz targets: they keep their own time-budgeted nightly run (`nightly-fuzz.yml`). */
const FUZZ_TARGETS = [
  "frames-fuzz.property.test.ts",
  "multi-header.property.test.ts",
  "records-fuzz.property.test.ts",
];

describe("the floor file", () => {
  it("holds a coverage floor for each of the four metrics and a mutation floor, each 0 to 100", () => {
    const floor = JSON.parse(read("quality-floor.json")) as {
      packages: Record<string, { coverage?: Record<string, unknown>; mutation?: unknown }>;
    };
    expect(Object.keys(floor.packages)).toEqual(["."]);
    const entry = floor.packages["."];
    expect(Object.keys(entry?.coverage ?? {}).sort()).toEqual([
      "branches",
      "functions",
      "lines",
      "statements",
    ]);
    for (const value of [...Object.values(entry?.coverage ?? {}), entry?.mutation]) {
      expect(typeof value).toBe("number");
      expect(value as number).toBeGreaterThan(0);
      expect(value as number).toBeLessThanOrEqual(100);
    }
  });

  it("holds coverage at 100 on every metric, the thresholds vitest.config.ts gates", () => {
    const floor = JSON.parse(read("quality-floor.json")) as {
      packages: Record<string, { coverage: Record<string, number> }>;
    };
    expect(floor.packages["."]?.coverage).toEqual({
      lines: 100,
      branches: 100,
      functions: 100,
      statements: 100,
    });
  });
});

describe("the scripts", () => {
  it("run the shared tools: the ratchet, the mutation runs and the property suites", () => {
    const { scripts } = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(scripts["quality:check"]).toBe("cosyte-ratchet check --skip mutation");
    expect(scripts["quality:mutation"]).toBe("cosyte-ratchet check --skip coverage");
    expect(scripts["quality:raise"]).toBe("cosyte-ratchet raise");
    expect(scripts["mutate"]).toBe("cosyte-mutate");
    expect(scripts["mutate:full"]).toBe("cosyte-mutate full");
    expect(scripts["test:properties"]).toMatch(/^vitest run test\/property /u);
    for (const target of FUZZ_TARGETS) {
      expect(scripts["test:properties"], target).toContain(
        target.replace(/^[a-z]+-fuzz/u, "*-fuzz"),
      );
    }
  });
});

describe("the mutation config", () => {
  it("is the shared StrykerJS config over every source file, on the mutation suite", async () => {
    const { default: config } = await importModule<{
      default: { mutate: string[]; vitest: { configFile?: string }; testRunner?: string };
    }>("stryker.config.mjs");
    expect(config.testRunner).toBe("vitest");
    expect(config.mutate).toContain("src/**/*.ts");
    expect(config.vitest.configFile).toBe("vitest.mutation.config.ts");
  });

  it("leaves out of the mutation suite only tests that read a clock, test the tooling or run a child process", async () => {
    const { default: config } = await importModule<{
      default: { test: { exclude: string[] } };
    }>("vitest.mutation.config.ts");
    const own = config.test.exclude.filter((pattern) => pattern.startsWith("test/"));
    expect(own.sort()).toEqual([
      "test/dependency-inventory.test.ts",
      "test/docs-content-phi.test.ts",
      "test/docs-content.test.ts",
      "test/perf/**",
      "test/readme-usage.test.ts",
      "test/scripts/**",
    ]);
  });
});

describe("the property suites", () => {
  it("run every property through the shared runner, never fast-check's own depth", () => {
    const files = readdirSync(PROPERTY_DIR).filter(
      (name) => name.endsWith(".property.test.ts") && !FUZZ_TARGETS.includes(name),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      expect(read("test", "property", name), name).not.toMatch(/\bfc\.(assert|check)\(/u);
    }
  });
});

describe("the workflow callers", () => {
  it("ci.yml turns on every system, Bun, Deno, the coverage ratchet and the mutation job", () => {
    const ci = read(".github", "workflows", "ci.yml");
    for (const input of ["run-bun", "run-deno", "run-coverage-ratchet", "run-mutation"]) {
      expect(ci).toMatch(new RegExp(`^      ${input}: true$`, "mu"));
    }
    expect(ci).toMatch(/^ {6}os: '\["ubuntu-latest", "windows-latest", "macos-latest"\]'$/mu);
  });

  it("the nightly property run and the sharded weekly mutation run are scheduled, at the reference ci.yml uses", () => {
    const commit = sharedCommit(read(".github", "workflows", "ci.yml"), "ci.yml");
    expect(commit).toBeDefined();
    for (const file of ["nightly-properties.yml", "weekly-mutation.yml"]) {
      expect(existsSync(join(WORKFLOWS, file)), file).toBe(true);
      const text = read(".github", "workflows", file);
      expect(sharedCommit(text, file), file).toBe(commit);
      expect(text, file).toMatch(/^ {2}schedule:\n(?: {4}#.*\n)* {4}- cron: "[^"]+"$/mu);
    }
    const nightly = read(".github", "workflows", "nightly-properties.yml");
    expect(nightly).toContain('property-runs: "10000"');
    expect(nightly).toMatch(/^ {6}test-cmd: "pnpm test:properties /mu);
    const weekly = read(".github", "workflows", "weekly-mutation.yml");
    expect(weekly).toMatch(/^ {6}mutate-cmd: "pnpm mutate:full"$/mu);
    expect(weekly).toMatch(/^ {6}shard-count: \d+$/mu);
  });
});
