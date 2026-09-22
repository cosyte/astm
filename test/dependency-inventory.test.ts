/**
 * The dependency inventory: `scripts/check-dependency-inventory.ts`.
 *
 * The inventory is the answer to a consumer who cannot check a zero-dependency
 * sentence written in prose, and it goes on a PUBLIC release page. So a check
 * that can only pass is worth nothing here: every case below either drives the
 * real script RED on a tree carrying the defect it names, or reads the artifact
 * it actually produced.
 *
 * Each case builds a THROWAWAY tree carrying its own copy of the script, its own
 * `package.json` and its own `pnpm-lock.yaml`, because the script derives its
 * repo from its own file location. The cases that read this package's own
 * inventory run the real script on the real tree and assert on what came out.
 * Nothing here stands a double in for the script: the subject always runs.
 *
 * SECURITY: every subprocess call uses spawnSync with array args. No shell form.
 */

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const SCRIPT_NAME = "check-dependency-inventory.ts";
const SCRIPT_PATH = join(REPO_ROOT, "scripts", SCRIPT_NAME);
const TSX_BIN = join(REPO_ROOT, "node_modules", ".bin", "tsx");
const ARTIFACT_RELATIVE = join("dist-artifacts", "dependency-inventory.cdx.json");

/** The documented format the artifact declares, as a consumer would look for it. */
const BOM_FORMAT = "CycloneDX";
const BOM_SPEC_VERSION = "1.6";

const trees: string[] = [];

afterAll(() => {
  for (const t of trees) rmSync(t, { recursive: true, force: true });
});

interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** A pnpm lockfile in the shape this repo's own carries, resolving exactly `ids`. */
function lockfile(ids: readonly string[], lockfileVersion = "9.0"): string {
  const packages = ids.flatMap((id) => [
    `  '${id}':`,
    "    resolution: {integrity: sha512-0000000000000000000000000000000000000000000000000000000000000000000000000000000000000==}",
    "",
  ]);
  // A `snapshots:` section is present in every real lockfile and repeats every id. The parser
  // reads `packages:` alone, so its presence here is what shows a component is not counted twice.
  const snapshots = ids.flatMap((id) => [`  '${id}': {}`, ""]);
  return [
    `lockfileVersion: '${lockfileVersion}'`,
    "",
    "settings:",
    "  autoInstallPeers: true",
    "",
    "importers:",
    "",
    "  .:",
    "    devDependencies:",
    "      example: {}",
    "",
    "packages:",
    "",
    ...packages,
    "snapshots:",
    "",
    ...snapshots,
  ].join("\n");
}

interface TreeOptions {
  readonly manifest?: string;
  readonly lock?: string;
  /** An inventory to place at the artifact path before the run, for the verify cases. */
  readonly artifact?: string | undefined;
}

const DEFAULT_MANIFEST = JSON.stringify({ name: "@example/widget", version: "1.2.3" }, null, 2);
const DEFAULT_IDS = ["@example/scoped-dep@0.4.1", "leaf@2.0.0", "transitive-only@1.9.12"];

/**
 * A throwaway tree with its own copy of the script. A manifest, a lockfile and
 * optionally an artifact are the whole fixture, because those are exactly the
 * three files the script reconciles.
 */
function makeTree(options: TreeOptions = {}): string {
  const root = mkdtempSync(join(tmpdir(), "dependency-inventory-"));
  trees.push(root);
  mkdirSync(join(root, "scripts"));
  copyFileSync(SCRIPT_PATH, join(root, "scripts", SCRIPT_NAME));
  if (options.manifest !== undefined) {
    writeFileSync(join(root, "package.json"), options.manifest);
  } else {
    writeFileSync(join(root, "package.json"), DEFAULT_MANIFEST);
  }
  if (options.lock !== undefined) writeFileSync(join(root, "pnpm-lock.yaml"), options.lock);
  if (options.artifact !== undefined) {
    mkdirSync(join(root, "dist-artifacts"), { recursive: true });
    writeFileSync(join(root, ARTIFACT_RELATIVE), options.artifact);
  }
  return root;
}

function runIn(root: string, args: readonly string[] = []): RunResult {
  const r = spawnSync(TSX_BIN, [join(root, "scripts", SCRIPT_NAME), ...args], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

interface BomComponent {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly purl?: unknown;
  readonly type?: unknown;
}

interface Bom {
  readonly bomFormat?: unknown;
  readonly specVersion?: unknown;
  readonly metadata?: { readonly component?: BomComponent };
  readonly components?: readonly BomComponent[];
}

function readArtifact(root: string): Bom {
  return JSON.parse(readFileSync(join(root, ARTIFACT_RELATIVE), "utf8")) as Bom;
}

/** A sound inventory for the default fixture, which each AC-6 case then breaks in one way. */
function soundArtifact(overrides: Record<string, unknown> = {}): string {
  const component = (name: string, version: string): Record<string, unknown> => ({
    type: "library",
    "bom-ref": `pkg:npm/${name}@${version}`,
    name,
    version,
    purl: `pkg:npm/${name}@${version}`,
  });
  return JSON.stringify(
    {
      bomFormat: BOM_FORMAT,
      specVersion: BOM_SPEC_VERSION,
      version: 1,
      metadata: { component: component("@example/widget", "1.2.3") },
      components: DEFAULT_IDS.map((id) => {
        const at = id.lastIndexOf("@");
        return component(id.slice(0, at), id.slice(at + 1));
      }),
      ...overrides,
    },
    null,
    2,
  );
}

describe("AC-2: the inventory names this package and the version being built", () => {
  it("[AC-2] names the package identity and version the manifest publishes from", () => {
    const root = makeTree({ lock: lockfile(DEFAULT_IDS) });
    const r = runIn(root);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    const subject = readArtifact(root).metadata?.component;
    expect(subject?.name).toBe("@example/widget");
    expect(subject?.version).toBe("1.2.3");
  });

  it("[AC-2] carries the version the manifest carries, on this package's own tree", () => {
    const r = runIn(makeTree({ lock: lockfile(DEFAULT_IDS) }));
    expect(r.code).toBe(0);
    const real = spawnSync(TSX_BIN, [SCRIPT_PATH], { cwd: REPO_ROOT, encoding: "utf8" });
    expect(real.status, `stderr: ${real.stderr ?? ""}`).toBe(0);
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
      version: string;
      name: string;
    };
    const bom = JSON.parse(readFileSync(join(REPO_ROOT, ARTIFACT_RELATIVE), "utf8")) as Bom;
    expect(bom.metadata?.component?.name).toBe(manifest.name);
    expect(bom.metadata?.component?.version).toBe(manifest.version);
  });
});

describe("AC-3: the inventory lists every dependency the build resolves", () => {
  it("[AC-3] lists every package the lockfile resolves, each with its exact version", () => {
    const root = makeTree({ lock: lockfile(DEFAULT_IDS) });
    expect(runIn(root).code).toBe(0);
    const listed = (readArtifact(root).components ?? []).map(
      (c) => `${String(c.name)}@${String(c.version)}`,
    );
    expect(listed.sort()).toEqual([...DEFAULT_IDS].sort());
  });

  it("[AC-3] counts a package once even though the lockfile repeats it in `snapshots:`", () => {
    const root = makeTree({ lock: lockfile(DEFAULT_IDS) });
    expect(runIn(root).code).toBe(0);
    expect(readArtifact(root).components).toHaveLength(DEFAULT_IDS.length);
  });

  it("[AC-3] reads the build-time set transitively, not the manifest's two lists", () => {
    // This package's own tree: `dependencies` is empty and `devDependencies` is not, so a
    // reading of "the manifest's two lists" would produce a handful of entries. The build
    // resolves an order of magnitude more, and every direct devDependency is among them.
    const real = spawnSync(TSX_BIN, [SCRIPT_PATH], { cwd: REPO_ROOT, encoding: "utf8" });
    expect(real.status, `stderr: ${real.stderr ?? ""}`).toBe(0);
    const bom = JSON.parse(readFileSync(join(REPO_ROOT, ARTIFACT_RELATIVE), "utf8")) as Bom;
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const direct = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ];
    const names = new Set((bom.components ?? []).map((c) => String(c.name)));
    for (const name of direct) expect(names.has(name), `${name} is missing`).toBe(true);
    expect((bom.components ?? []).length).toBeGreaterThan(direct.length * 2);
    for (const component of bom.components ?? []) {
      expect(String(component.name).length).toBeGreaterThan(0);
      expect(String(component.version)).toMatch(/^\d+\.\d+\.\d+/);
    }
  });
});

describe("AC-4: the inventory says what format it is written in", () => {
  it("[AC-4] records the documented format and its version inside the artifact", () => {
    const root = makeTree({ lock: lockfile(DEFAULT_IDS) });
    expect(runIn(root).code).toBe(0);
    const bom = readArtifact(root);
    expect(bom.bomFormat).toBe(BOM_FORMAT);
    expect(bom.specVersion).toBe(BOM_SPEC_VERSION);
  });

  it("[AC-4] gives every component a package URL, so the format is parseable with no local knowledge", () => {
    const root = makeTree({ lock: lockfile(["@example/scoped-dep@0.4.1"]) });
    expect(runIn(root).code).toBe(0);
    const [component] = readArtifact(root).components ?? [];
    expect(component?.purl).toBe("pkg:npm/%40example/scoped-dep@0.4.1");
    expect(component?.type).toBe("library");
  });
});

describe("AC-5: an inventory that cannot be produced leaves nothing behind", () => {
  it("[AC-5] refuses with a non-zero status when the lockfile is absent", () => {
    const root = makeTree();
    const r = runIn(root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("cannot produce the inventory");
    expect(r.stderr).toContain("pnpm-lock.yaml");
    expect(existsSync(join(root, ARTIFACT_RELATIVE))).toBe(false);
  });

  it("[AC-5] refuses a lockfile format it has not been read against", () => {
    const root = makeTree({ lock: lockfile(DEFAULT_IDS, "10.0") });
    const r = runIn(root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("lockfileVersion 10.0");
    expect(existsSync(join(root, ARTIFACT_RELATIVE))).toBe(false);
  });

  it("[AC-5] refuses a lockfile that resolves nothing at all", () => {
    const root = makeTree({
      lock: "lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n",
    });
    const r = runIn(root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("no `packages:` section");
    expect(existsSync(join(root, ARTIFACT_RELATIVE))).toBe(false);
  });

  it("[AC-5] refuses a resolution it cannot state as a plain version", () => {
    // A workspace, link, git or tarball resolution writes something other than a version in that
    // position. Carrying it through would put a wrong fact on a public page, so the run stops.
    const root = makeTree({ lock: lockfile(["leaf@workspace:*"]) });
    const r = runIn(root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("does not resolve to a plain version");
    expect(existsSync(join(root, ARTIFACT_RELATIVE))).toBe(false);
  });

  it("[AC-5] refuses a manifest with no version to build against", () => {
    const root = makeTree({
      manifest: JSON.stringify({ name: "@example/widget" }),
      lock: lockfile(DEFAULT_IDS),
    });
    const r = runIn(root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("carries no package version");
    expect(existsSync(join(root, ARTIFACT_RELATIVE))).toBe(false);
  });

  it("[AC-5] removes a stale artifact rather than leaving it to be read as this build's", () => {
    // The release path attaches whatever is at the artifact path. A refusal that left an older
    // inventory sitting there would publish it as this version's, which is the emit-in-place-of
    // this criterion forbids.
    const root = makeTree({ artifact: soundArtifact() });
    expect(existsSync(join(root, ARTIFACT_RELATIVE))).toBe(true);
    const r = runIn(root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("removed the stale artifact");
    expect(existsSync(join(root, ARTIFACT_RELATIVE))).toBe(false);
  });
});

describe("AC-6: a produced inventory that is not true of the build is refused", () => {
  const lock = lockfile(DEFAULT_IDS);

  function verifyOnly(artifact: string | undefined): RunResult {
    return runIn(makeTree({ lock, artifact }), ["--verify-only"]);
  }

  it("[AC-6] refuses a missing inventory, and says so", () => {
    const r = verifyOnly(undefined);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("missing:");
  });

  it("[AC-6] refuses an inventory with no content", () => {
    const r = verifyOnly("");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("empty:");
  });

  it("[AC-6] refuses an inventory that lists no components", () => {
    const r = verifyOnly(soundArtifact({ components: [] }));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("empty:");
  });

  it("[AC-6] refuses an inventory that does not parse", () => {
    const r = verifyOnly("{ this is not json");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("unparseable:");
  });

  it("[AC-6] refuses a document that declares no format to read it as", () => {
    const r = verifyOnly(soundArtifact({ bomFormat: "SomethingElse" }));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("unparseable:");
  });

  it("[AC-6] refuses an inventory that omits this package's own identity", () => {
    const r = verifyOnly(soundArtifact({ metadata: { component: { version: "1.2.3" } } }));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("identity:");
  });

  it("[AC-6] refuses an inventory naming a different package as its subject", () => {
    const r = verifyOnly(
      soundArtifact({ metadata: { component: { name: "@example/other", version: "1.2.3" } } }),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("identity:");
  });

  it("[AC-6] refuses an inventory that omits the version being built", () => {
    const r = verifyOnly(soundArtifact({ metadata: { component: { name: "@example/widget" } } }));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("version:");
  });

  it("[AC-6] refuses an inventory carrying a version the manifest no longer publishes", () => {
    // The stale case the release path has to catch: an inventory produced before the version
    // bump describes the previous release and would be attached to this one.
    const r = verifyOnly(
      soundArtifact({ metadata: { component: { name: "@example/widget", version: "1.2.2" } } }),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("version:");
    expect(r.stderr).toContain("1.2.3");
  });

  it("[AC-6] refuses an inventory that omits a dependency the build resolved, and names it", () => {
    const short = JSON.parse(soundArtifact()) as { components: unknown[] };
    short.components = short.components.slice(0, 1);
    const r = verifyOnly(JSON.stringify(short, null, 2));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("incomplete:");
    expect(r.stderr).toContain("transitive-only@1.9.12");
  });

  it("[AC-6] refuses an inventory carrying a version other than the one resolved", () => {
    const drifted = JSON.parse(soundArtifact()) as { components: { version: string }[] };
    const entry = drifted.components[0];
    if (entry) entry.version = "0.4.2";
    const r = verifyOnly(JSON.stringify(drifted, null, 2));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("incomplete:");
    expect(r.stderr).toContain("@example/scoped-dep@0.4.1");
  });

  it("[AC-6] names every condition that failed, not only the first", () => {
    const r = verifyOnly(
      soundArtifact({
        components: [],
        metadata: { component: { name: "@example/other", version: "0.0.1" } },
      }),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("empty:");
    expect(r.stderr).toContain("identity:");
    expect(r.stderr).toContain("version:");
  });

  it("[AC-6] accepts an inventory that is true of the build, so the refusals above are not vacuous", () => {
    const r = verifyOnly(soundArtifact());
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("OK");
  });
});
