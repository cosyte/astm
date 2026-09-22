#!/usr/bin/env tsx
/**
 * `@cosyte/astm` dependency inventory: produce one for the build in this checkout,
 * then refuse it unless it is a truthful description of that build.
 *
 * ===========================================================================
 * WHY THIS EXISTS
 * ===========================================================================
 *
 * A consumer evaluating this package for a regulated lab can read a
 * zero-dependency sentence in prose and has no way to check it. Prose is not
 * checkable and it is not machine-readable, and the sentence is about the
 * RUNTIME set while a build resolves a much larger one. This script replaces
 * the sentence with an artifact: a documented, parseable statement of what this
 * version was built from, produced by the repo itself and published beside the
 * release so nobody has to clone anything to read it.
 *
 * WHAT IT ASSERTS, and each one is a condition that has to be able to fire:
 *
 *   - the inventory can be produced AT ALL. When it cannot, this exits non-zero
 *     and leaves NO artifact behind, including a stale one from an earlier run.
 *     Half an inventory is worse than none, because a lab reads it as complete;
 *   - the inventory is not empty, parses, names this package and the version
 *     being built, and that version is the one the manifest carries. A stale
 *     artifact describing the previous version is the failure this catches;
 *   - the inventory omits no dependency this build resolves. The set is read
 *     from the lockfile rather than from the manifest's two lists, because the
 *     manifest states RANGES and a build resolves versions.
 *
 * WHAT IT DOES NOT ASSERT, stated so its green is not read as wider than it is:
 *
 *   - nothing about whether the dependency set is SAFE. This states what was
 *     resolved. It is not a scan, a licence policy, an attestation or a
 *     signature, and a green run says nothing about any of them;
 *   - nothing about a component the inventory carries that the lockfile does
 *     not. Over-reporting is a different defect with a different fix, and the
 *     refusal here is scoped to omission on purpose;
 *   - nothing about a lockfile format this parser has not been read against.
 *     An unsupported `lockfileVersion` is refused rather than guessed at.
 *
 * WHERE IT RUNS, which is the half that decides whether a refusal costs a
 * failed run or a published version nothing describes:
 *
 *   - `prepublishOnly`, which npm runs BEFORE the registry upload. A refusal
 *     there aborts the publish and the version never becomes public;
 *   - `pnpm check`, so the same production and the same refusal are reachable
 *     from a checkout with no credential and nothing published;
 *   - the release workflow's attach job, which runs AFTER the publish because
 *     the GitHub release it uploads to does not exist before one. That job can
 *     only fail a run, never unpublish, which is exactly why the guard above
 *     is not left to it.
 *
 * NETWORK AND CREDENTIALS: none. Two files are read, one is written, no
 * subprocess is spawned and no registry is contacted, so the same run works in
 * a release job and on a laptop offline.
 *
 * Usage:
 *   tsx scripts/check-dependency-inventory.ts                 produce, then verify
 *   tsx scripts/check-dependency-inventory.ts --verify-only   verify what is on disk
 *
 * Exit codes: 0 (produced and verified), 1 (could not produce, or refused).
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Derived from this file's own location, never `process.cwd()`. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(REPO_ROOT, "package.json");
const LOCKFILE_PATH = join(REPO_ROOT, "pnpm-lock.yaml");
const OUT_DIR = join(REPO_ROOT, "dist-artifacts");

/**
 * The artifact. `dist-artifacts/` is gitignored and is the same directory the
 * release pipeline builds the docs bundles into, so the inventory is produced
 * fresh for the build that publishes and is never committed, which is what
 * keeps it from describing a version other than the one it ships beside.
 */
const OUT_PATH = join(OUT_DIR, "dependency-inventory.cdx.json");

/**
 * The documented format the artifact is written in, recorded INSIDE it so a
 * consumer needs no out-of-band knowledge of how it was made. CycloneDX is an
 * ECMA standard (ECMA-424) with a published JSON schema per spec version, and
 * both fields below are that schema's own identifying keys.
 */
const BOM_FORMAT = "CycloneDX";
const BOM_SPEC_VERSION = "1.6";

/**
 * pnpm lockfile versions whose `packages:` section this parser has actually been
 * read against. An unlisted one is REFUSED rather than parsed hopefully: a
 * format change that moved or re-keyed that section would otherwise produce a
 * confidently short inventory, which is the one outcome worse than no inventory.
 */
const SUPPORTED_LOCKFILE_VERSIONS: readonly string[] = ["9.0"];

/** One resolved package: the only two facts about it that this artifact carries. */
interface Component {
  readonly name: string;
  readonly version: string;
}

/** The identity of the package being built, read from the manifest it publishes from. */
interface Manifest {
  readonly name: string;
  readonly version: string;
}

/** A condition that stops the run, carrying the name a reader has to act on. */
class Refusal extends Error {
  readonly condition: string;

  constructor(condition: string, detail: string) {
    super(`${condition}: ${detail}`);
    this.name = "Refusal";
    this.condition = condition;
  }
}

/** A path as a reader of a public CI log should see it: relative to the repo, never absolute. */
function rel(path: string): string {
  return relative(REPO_ROOT, path) || path;
}

/**
 * A package URL for an npm component.
 *
 * It is name and version re-encoded and carries no further fact, which is why
 * it is safe to publish: it is the identifier an advisory database or an SBOM
 * reader matches on, so omitting it would cost a consumer real work for nothing.
 */
function purlFor(name: string, version: string): string {
  const slash = name.lastIndexOf("/");
  const namespace = slash === -1 ? "" : name.slice(0, slash);
  const bare = slash === -1 ? name : name.slice(slash + 1);
  const prefix = namespace === "" ? "" : `${encodeURIComponent(namespace)}/`;
  return `pkg:npm/${prefix}${encodeURIComponent(bare)}@${encodeURIComponent(version)}`;
}

/** The manifest's identity, refusing anything this artifact would have to guess at. */
function readManifest(path: string): Manifest {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Refusal("manifest", `cannot read ${rel(path)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Refusal("manifest", `${rel(path)} is not valid JSON`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Refusal("manifest", `${rel(path)} did not parse to an object`);
  }
  const { name, version } = parsed as { name?: unknown; version?: unknown };
  if (typeof name !== "string" || name.length === 0) {
    throw new Refusal("manifest", `${rel(path)} carries no package name`);
  }
  if (typeof version !== "string" || version.length === 0) {
    throw new Refusal("manifest", `${rel(path)} carries no package version`);
  }
  return { name, version };
}

/** A `packages:` key, in each of the three ways this lockfile format writes one. */
const PACKAGE_KEY = /^ {2}(?:'([^']+)'|"([^"]+)"|([^\s#'"][^:]*)):\s*$/;

/**
 * A resolved version, as the `packages:` section spells one: a semver core with an optional
 * prerelease and an optional build tail.
 *
 * THE TWO TAILS ARE SEPARATE AND EACH IS OPTIONAL RATHER THAN REPEATED, deliberately. The
 * ambiguous form `(?:[-+][0-9A-Za-z.-]+)*` accepts the same strings and backtracks
 * exponentially on a near miss, because its leading `[-+]` overlaps the `-` inside its own
 * character class: `0.0.0+` followed by 18 repetitions of `--` took 704ms to reject and each
 * further four characters multiplied that by about seven. The version text comes from a lockfile
 * key, which is to say from a registry, and this runs in the publishing path, so that is reachable
 * rather than theoretical. Written this way the prerelease class cannot swallow the `+`, so the
 * split is decided by the first `+` and there is nothing to backtrack over.
 */
const RESOLVED_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Split a `packages:` key into a name and the version resolved for it.
 *
 * The split is on the LAST `@`, because a scoped name opens with one. A key
 * whose tail is not a plain resolved version is REFUSED rather than carried
 * through: a git, tarball or aliased resolution writes something else there,
 * and reporting it as a version would put a wrong fact on a public page.
 */
function splitPackageKey(id: string): Component {
  const at = id.lastIndexOf("@");
  if (at <= 0) {
    throw new Refusal("lockfile", `\`${id}\` in \`packages:\` is not a name and a version`);
  }
  const name = id.slice(0, at);
  const version = id.slice(at + 1);
  if (!RESOLVED_VERSION.test(version)) {
    throw new Refusal(
      "lockfile",
      `\`${id}\` in \`packages:\` does not resolve to a plain version, so this build ` +
        "resolves something this inventory cannot state truthfully",
    );
  }
  return { name, version };
}

/**
 * Every package this build resolves, read from the lockfile rather than from the
 * manifest.
 *
 * The manifest states RANGES and two lists; the lockfile states what those
 * ranges actually resolved to, transitively, runtime and build-time alike. That
 * is what "every dependency the build resolves" means, and it is the set a
 * consumer would have to reproduce an install to see.
 */
function readResolvedComponents(path: string): readonly Component[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Refusal("lockfile", `cannot read ${rel(path)}`);
  }

  let lockfileVersion: string | undefined;
  let section = "";
  let sawPackages = false;
  const components: Component[] = [];

  for (const line of text.split(/\r?\n/)) {
    const top = /^([A-Za-z][A-Za-z0-9_-]*):(.*)$/.exec(line);
    if (top) {
      section = top[1] ?? "";
      if (section === "lockfileVersion") {
        lockfileVersion = (top[2] ?? "").trim().replace(/^['"]|['"]$/g, "");
      }
      if (section === "packages") sawPackages = true;
      continue;
    }
    if (section !== "packages") continue;
    const key = PACKAGE_KEY.exec(line);
    if (!key) continue;
    components.push(splitPackageKey(key[1] ?? key[2] ?? key[3] ?? ""));
  }

  if (lockfileVersion === undefined) {
    throw new Refusal("lockfile", `${rel(path)} declares no \`lockfileVersion\``);
  }
  if (!SUPPORTED_LOCKFILE_VERSIONS.includes(lockfileVersion)) {
    throw new Refusal(
      "lockfile",
      `${rel(path)} is lockfileVersion ${lockfileVersion}, and this script has only been read ` +
        `against ${SUPPORTED_LOCKFILE_VERSIONS.join(", ")}. Read the new format's \`packages:\` ` +
        "section and add the version here deliberately, rather than parsing it hopefully.",
    );
  }
  if (!sawPackages) {
    throw new Refusal("lockfile", `${rel(path)} has no \`packages:\` section`);
  }
  if (components.length === 0) {
    throw new Refusal("lockfile", `${rel(path)} resolves no packages at all`);
  }

  return [...components].sort((a, b) =>
    a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name),
  );
}

/** One entry as the artifact writes it. */
interface BomComponent {
  readonly type: "library";
  readonly "bom-ref": string;
  readonly name: string;
  readonly version: string;
  readonly purl: string;
}

/** The whole artifact. Every field here is published, so there are no others. */
interface Bom {
  readonly bomFormat: string;
  readonly specVersion: string;
  readonly version: number;
  readonly metadata: { readonly component: BomComponent };
  readonly components: readonly BomComponent[];
}

function bomComponentFor({ name, version }: Component): BomComponent {
  const purl = purlFor(name, version);
  return { type: "library", "bom-ref": purl, name, version, purl };
}

/**
 * The artifact, and deliberately nothing more than the artifact.
 *
 * FIELD DISCIPLINE, and it is a safety rule rather than a tidiness one. This
 * ships on a PUBLIC release page, so every field is a field a stranger reads.
 * Only the package's own identity, the resolved component names and their
 * versions go in. No timestamp, no serial number, no producing-tool record, no
 * author, no path and no dependency graph: the first two would make a
 * byte-identical rebuild impossible to check, and the rest would put facts
 * about the machine or the tree on a page that needs component names and
 * versions and nothing else.
 */
function buildBom(pkg: Manifest, resolved: readonly Component[]): Bom {
  return {
    bomFormat: BOM_FORMAT,
    specVersion: BOM_SPEC_VERSION,
    version: 1,
    metadata: { component: bomComponentFor(pkg) },
    components: resolved.map(bomComponentFor),
  };
}

/** One way a produced inventory fails to describe the build it claims to describe. */
interface Failure {
  readonly condition: string;
  readonly detail: string;
}

/**
 * Every named component in a document that has already parsed, or `undefined`
 * when its `components` key is not the array this format requires.
 */
function componentsIn(document: Record<string, unknown>): Component[] | undefined {
  const raw = document["components"];
  if (!Array.isArray(raw)) return undefined;
  const out: Component[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return undefined;
    const { name, version } = entry as { name?: unknown; version?: unknown };
    if (typeof name !== "string" || typeof version !== "string") return undefined;
    out.push({ name, version });
  }
  return out;
}

/**
 * Grade an inventory on disk against the build it claims to describe.
 *
 * Returns every condition that failed, because an artifact can fail more than
 * one and naming only the first would cost a second run to find the second.
 * The conditions are ordered so a later one is never reported off a document
 * the earlier one already showed cannot be read.
 */
function verifyInventory(path: string, pkg: Manifest, resolved: readonly Component[]): Failure[] {
  if (!existsSync(path)) {
    return [{ condition: "missing", detail: `no inventory at ${rel(path)}` }];
  }

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [{ condition: "missing", detail: `the inventory at ${rel(path)} cannot be read` }];
  }
  if (raw.trim().length === 0) {
    return [{ condition: "empty", detail: `the inventory at ${rel(path)} has no content` }];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [
      { condition: "unparseable", detail: `the inventory at ${rel(path)} is not valid JSON` },
    ];
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return [
      { condition: "unparseable", detail: "the inventory did not parse to a document object" },
    ];
  }
  const document = parsed as Record<string, unknown>;
  if (document["bomFormat"] !== BOM_FORMAT || document["specVersion"] !== BOM_SPEC_VERSION) {
    return [
      {
        condition: "unparseable",
        detail:
          "the inventory does not declare itself as " +
          `${BOM_FORMAT} ${BOM_SPEC_VERSION}, so there is no documented format to read it as`,
      },
    ];
  }

  const failures: Failure[] = [];

  const listed = componentsIn(document);
  if (listed === undefined) {
    failures.push({
      condition: "unparseable",
      detail: "`components` is not a list of entries carrying a name and a version",
    });
  } else if (listed.length === 0) {
    failures.push({ condition: "empty", detail: "the inventory lists no components at all" });
  }

  const metadata = document["metadata"];
  const subject =
    typeof metadata === "object" && metadata !== null
      ? (metadata as { component?: unknown }).component
      : undefined;
  const identity =
    typeof subject === "object" && subject !== null
      ? (subject as { name?: unknown; version?: unknown })
      : { name: undefined, version: undefined };

  if (identity.name !== pkg.name) {
    failures.push({
      condition: "identity",
      detail:
        "the inventory does not name this package as its subject: expected " +
        `\`${pkg.name}\`, found ${JSON.stringify(identity.name) ?? "nothing"}`,
    });
  }
  if (identity.version !== pkg.version) {
    failures.push({
      condition: "version",
      detail:
        "the inventory does not carry the version being built: the manifest publishes " +
        `\`${pkg.version}\`, the inventory says ${JSON.stringify(identity.version) ?? "nothing"}`,
    });
  }

  if (listed !== undefined) {
    const present = new Set(listed.map((c) => `${c.name}@${c.version}`));
    const omitted = resolved
      .filter((c) => !present.has(`${c.name}@${c.version}`))
      .map((c) => `${c.name}@${c.version}`);
    if (omitted.length > 0) {
      const shown = omitted.slice(0, 10).join(", ");
      const rest = omitted.length > 10 ? `, and ${String(omitted.length - 10)} more` : "";
      failures.push({
        condition: "incomplete",
        detail:
          `the build resolves ${String(omitted.length)} dependency/dependencies the inventory ` +
          `omits: ${shown}${rest}`,
      });
    }
  }

  return failures;
}

/** Report a produce-side stop, and make sure nothing is left on disk in its place. */
function stopWithoutArtifact(message: string, removeArtifact: boolean): number {
  process.stderr.write(`\n[dependency-inventory] cannot produce the inventory.\n  ${message}\n`);
  if (removeArtifact && existsSync(OUT_PATH)) {
    rmSync(OUT_PATH, { force: true });
    process.stderr.write(
      `  removed the stale artifact at ${rel(OUT_PATH)}: an inventory that could not be ` +
        "produced must not be replaced by an older one that would be read as this build's.\n",
    );
  }
  return 1;
}

function main(argv: readonly string[]): number {
  const verifyOnly = argv.includes("--verify-only");

  let pkg: Manifest;
  let resolved: readonly Component[];
  try {
    pkg = readManifest(MANIFEST_PATH);
    resolved = readResolvedComponents(LOCKFILE_PATH);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    return stopWithoutArtifact(error.message, !verifyOnly);
  }

  if (!verifyOnly) {
    try {
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(OUT_PATH, `${JSON.stringify(buildBom(pkg, resolved), null, 2)}\n`, "utf8");
    } catch {
      return stopWithoutArtifact(`the inventory could not be written to ${rel(OUT_PATH)}`, true);
    }
    process.stdout.write(
      `[dependency-inventory] wrote ${rel(OUT_PATH)}: ${BOM_FORMAT} ${BOM_SPEC_VERSION}, ` +
        `${pkg.name} ${pkg.version}, ${String(resolved.length)} resolved component(s).\n`,
    );
  }

  const failures = verifyInventory(OUT_PATH, pkg, resolved);
  if (failures.length > 0) {
    process.stderr.write(
      `\n[dependency-inventory] REFUSED: ${String(failures.length)} condition(s) failed.\n` +
        `${failures.map((f) => `  - ${f.condition}: ${f.detail}`).join("\n")}\n`,
    );
    return 1;
  }

  process.stdout.write(
    `[dependency-inventory] OK: ${rel(OUT_PATH)} states ${pkg.name} ${pkg.version} and every ` +
      `one of the ${String(resolved.length)} dependency/dependencies this build resolves.\n`,
  );
  return 0;
}

process.exit(main(process.argv.slice(2)));
