/**
 * Release-readiness gate: the pending changeset set, the version it resolves to, and the
 * public export surface `documentation/release-readiness.md` puts on record.
 *
 * WHY THIS EXISTS. `0.1.0` is a semantic claim that the public API is settled and stable
 * enough to depend on, so the claim needs a subject that cannot go stale in silence. Three
 * things could drift apart with nothing noticing: the bump the pending changesets actually
 * carry, the surface the record enumerates, and the certification the record makes. Each is
 * graded here against the tree rather than against prose.
 *
 * WHAT IT ASSERTS
 *   - the pending set is non-empty and resolves the package to `0.1.0` off the published
 *     base, which needs at least one `minor` and no `major`;
 *   - the changeset documenting the LIVD catalog change carries `minor`, because its own
 *     text removes public values and a removal is not a fix;
 *   - the record's audit table accounts for every pending changeset and states the bump each
 *     one actually carries;
 *   - the surface the record enumerates is exactly what the entry point re-exports, values
 *     and types both, with every added and every removed identifier named on failure;
 *   - the counts the record states in prose, which sit outside every marker, match what it
 *     enumerates, so the paragraph promising the list cannot go stale is true of itself too;
 *   - an unresolved entry in the record withholds the stability certification, whether it is
 *     written as a bullet or as a sentence, and a region that says nothing does not say "none".
 *
 * WHEN IT GOES RED AFTER THE RELEASE, THAT IS THE DESIGN. Once Changesets consumes this set
 * the pending set is empty and the published base has moved, and this gate fails with a
 * message saying so. An empty pending set is a release that would publish nothing, which is
 * a stop rather than a green audit. Re-audit the next set and move the base, or retire this
 * gate deliberately.
 *
 * Every negative case below is driven on a synthetic input, never by mutating this repo's
 * own files, so each guard is shown firing rather than assumed to.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CHANGESET_DIR = join(REPO_ROOT, ".changeset");
const RECORD_PATH = join(REPO_ROOT, "documentation", "release-readiness.md");
const ENTRY_POINT = join(REPO_ROOT, "src", "index.ts");
const MANIFEST_PATH = join(REPO_ROOT, "package.json");

/** The package the pending set bumps. */
const PACKAGE_NAME = "@cosyte/astm";

/**
 * The published version this audit was taken against, and the base every resolution below is
 * computed from. It is compared against `package.json` rather than trusted: if the two ever
 * disagree, the audit is describing a release that already happened.
 */
const PUBLISHED_BASE = "0.0.22";

/** The version the pending set is prepared to resolve to. */
const PREPARED_VERSION = "0.1.0";

/** The changeset whose own text removes public values, so it cannot be a patch. */
const LIVD_CHANGESET = "livd-catalog-answers-the-analyte.md";

type Bump = "patch" | "minor" | "major";

const BUMP_ORDER: Record<Bump, number> = { patch: 0, minor: 1, major: 2 };

function isBump(word: string): word is Bump {
  return word === "patch" || word === "minor" || word === "major";
}

interface PendingChangeset {
  /** The file name inside `.changeset/`. */
  readonly file: string;
  /** The bump it declares for this package, or `undefined` when it declares none. */
  readonly bump: Bump | undefined;
}

/**
 * The bump a changeset's frontmatter declares for one package.
 *
 * Frontmatter only: the body of a changeset is prose about the change and may legitimately
 * spell any of these words. An unrecognized bump word throws rather than being ignored,
 * because a typo silently dropping a changeset out of the set is the failure this whole file
 * exists to make loud.
 */
function bumpFor(source: string, pkg: string): Bump | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source.trimStart());
  if (!match) throw new Error("changeset has no frontmatter block");
  const frontmatter = match[1] ?? "";
  for (const line of frontmatter.split(/\r?\n/)) {
    const entry = /^\s*["']?(@?[^"':]+)["']?\s*:\s*["']?([A-Za-z]+)["']?\s*$/.exec(line);
    if (!entry) continue;
    if ((entry[1] ?? "").trim() !== pkg) continue;
    const word = (entry[2] ?? "").trim();
    if (!isBump(word)) throw new Error(`${pkg} carries an unrecognized bump: ${word}`);
    return word;
  }
  return undefined;
}

/** Every pending changeset: `.changeset/*.md` other than the tool's own README. */
function readPending(dir: string): PendingChangeset[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .sort()
    .map((file) => ({ file, bump: bumpFor(readFileSync(join(dir, file), "utf8"), PACKAGE_NAME) }));
}

/**
 * The version a pending set resolves to, on the pre-1.0 ladder Changesets applies.
 *
 * An EMPTY set throws. A release that would publish nothing is not a green audit, and the
 * caller that would have certified it gets a stop with the reason in the message.
 */
function resolveNextVersion(base: string, bumps: readonly Bump[]): string {
  if (bumps.length === 0) {
    throw new Error(
      `no pending changeset bumps ${PACKAGE_NAME}: an empty pending set publishes nothing, ` +
        "so there is no release to certify. Audit the next set and move the published base, " +
        "or retire this gate deliberately.",
    );
  }
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(base);
  if (!parts) throw new Error(`published base is not a plain semver version: ${base}`);
  const major = Number(parts[1]);
  const minor = Number(parts[2]);
  const patch = Number(parts[3]);

  let highest: Bump = "patch";
  for (const bump of bumps) if (BUMP_ORDER[bump] > BUMP_ORDER[highest]) highest = bump;

  if (highest === "major") return major === 0 ? "1.0.0" : `${String(major + 1)}.0.0`;
  if (highest === "minor") return `${String(major)}.${String(minor + 1)}.0`;
  return `${String(major)}.${String(minor)}.${String(patch + 1)}`;
}

interface Surface {
  readonly values: readonly string[];
  readonly types: readonly string[];
}

/**
 * Every value and every type the entry point re-exports, read from the source rather than
 * from a runtime import: a runtime import cannot see a type-only export at all, and the
 * stability claim covers both halves.
 *
 * A star export or a namespace re-export throws. Neither can be enumerated from this file
 * alone, and a surface record that silently under-reports is worse than no record.
 */
function extractSurface(source: string): Surface {
  const file = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
  const values: string[] = [];
  const types: string[] = [];

  const isExported = (node: ts.Node): boolean =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  for (const statement of file.statements) {
    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (clause === undefined) {
        throw new Error(
          "the entry point carries a star export, whose surface cannot be enumerated here",
        );
      }
      if (!ts.isNamedExports(clause)) {
        throw new Error(
          "the entry point carries a namespace re-export, whose surface cannot be enumerated here",
        );
      }
      for (const element of clause.elements) {
        const target = statement.isTypeOnly || element.isTypeOnly ? types : values;
        target.push(element.name.text);
      }
      continue;
    }
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) values.push(declaration.name.text);
      }
      continue;
    }
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      isExported(statement) &&
      statement.name !== undefined
    ) {
      values.push(statement.name.text);
      continue;
    }
    if (
      (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
      isExported(statement)
    ) {
      types.push(statement.name.text);
    }
  }
  return { values, types };
}

/** The text between a named pair of marker comments, or `undefined` when the pair is absent. */
function findRegion(document: string, name: string): string | undefined {
  const begin = `<!-- ${name}:begin -->`;
  const end = `<!-- ${name}:end -->`;
  const from = document.indexOf(begin);
  const to = document.indexOf(end);
  if (from === -1 || to === -1 || to < from) return undefined;
  return document.slice(from + begin.length, to);
}

/** The same, refusing rather than returning nothing: a missing region is a broken record. */
function readRegion(document: string, name: string): string {
  const region = findRegion(document, name);
  if (region === undefined) throw new Error(`the record has no \`${name}\` region`);
  return region;
}

/** Every backticked identifier written as its own list item inside a region. */
function identifiersIn(region: string): string[] {
  const out: string[] = [];
  for (const line of region.split(/\r?\n/)) {
    const match = /^-\s+`([A-Za-z_$][A-Za-z0-9_$]*)`\s*$/.exec(line);
    const name = match?.[1];
    if (name !== undefined) out.push(name);
  }
  return out;
}

/** Every `- ` list item in a region. */
function listItemsIn(region: string): string[] {
  return region
    .split(/\r?\n/)
    .filter((line) => /^-\s+\S/.test(line))
    .map((line) => line.trim());
}

/**
 * Every unresolved entry a region carries, under the only reading that cannot be defeated by
 * formatting: a bullet is an entry, and so is any other text that does not open with `None`.
 *
 * WHY IT IS NOT A LIST SCAN. An unresolved entry is written by whoever could not classify a
 * changeset, and nothing obliges them to reach for a bullet. Counting only `- ` lines would leave
 * a sentence-shaped entry invisible and the certification standing over an open question, which
 * is the exact case the rule exists for. Bullets are read first, so a `None.` opener cannot hide
 * one underneath it, and an EMPTY region counts as unresolved because a region that says nothing
 * has not said "none".
 */
function unresolvedEntriesIn(region: string): string[] {
  const items = listItemsIn(region);
  if (items.length > 0) return items;
  const text = region.trim();
  if (text.length === 0) {
    return ["the unresolved region is empty: write `None.`, or list what is unresolved"];
  }
  return /^none\b/i.test(text) ? [] : [text];
}

/**
 * The drift between the surface a record enumerates and the surface the package has, as a
 * message naming both directions, or `""` when the two agree.
 *
 * ADDED is in the package and not in the record; REMOVED is in the record and not in the
 * package. Both are named, because a record that lost an identifier and a package that
 * gained one are different problems with different fixes.
 */
function describeDrift(
  kind: string,
  recorded: readonly string[],
  actual: readonly string[],
): string {
  const recordedSet = new Set(recorded);
  const actualSet = new Set(actual);
  const added = actual.filter((name) => !recordedSet.has(name));
  const removed = recorded.filter((name) => !actualSet.has(name));
  const duplicates = recorded.filter((name, i) => recorded.indexOf(name) !== i);
  const parts: string[] = [];
  if (added.length > 0) parts.push(`${kind} exports ADDED to the package: ${added.join(", ")}`);
  if (removed.length > 0) {
    parts.push(`${kind} exports REMOVED from the package: ${removed.join(", ")}`);
  }
  if (duplicates.length > 0) {
    parts.push(`${kind} exports listed twice in the record: ${duplicates.join(", ")}`);
  }
  return parts.join("; ");
}

interface CertificationGrade {
  /** Every unresolved entry the record still carries. */
  readonly unresolved: readonly string[];
  /** Whether the record makes the stability certification at all. */
  readonly certified: boolean;
  /** The rule broken, when one is. */
  readonly violation: string | undefined;
}

/**
 * The rule that an unresolved entry withholds the certification.
 *
 * A record that cannot classify one of its own changesets has not established the subject of
 * the stability claim, so certifying anyway would be the certification saying more than the
 * audit behind it does.
 */
function gradeCertification(document: string): CertificationGrade {
  const unresolved = unresolvedEntriesIn(readRegion(document, "unresolved"));
  const certification = findRegion(document, "certification") ?? "";
  const certified = certification.trim().length > 0;
  const violation =
    unresolved.length > 0 && certified
      ? `the record certifies the surface while ${String(unresolved.length)} entry/entries ` +
        "remain unresolved"
      : undefined;
  return { unresolved, certified, violation };
}

interface StatedCounts {
  readonly values: number;
  readonly types: number;
  readonly identifiers: number;
}

/**
 * The three counts the record states in prose, in the same paragraph that promises the
 * enumeration cannot go stale in silence.
 *
 * They sit OUTSIDE the marked regions, so the surface comparison below never reads them: an
 * export added to the entry point and dutifully added to the list would leave the sentence
 * quietly wrong. Reading them here is what makes that promise true of the whole paragraph rather
 * than of the list alone.
 */
function statedCounts(document: string): StatedCounts {
  const match = /Counts:\s*\*\*(\d+) values, (\d+) types, (\d+) identifiers\*\*/.exec(document);
  if (!match) {
    throw new Error(
      "the record states no surface counts, so the paragraph promising the enumeration cannot " +
        "go stale has nothing to grade",
    );
  }
  return {
    values: Number(match[1]),
    types: Number(match[2]),
    identifiers: Number(match[3]),
  };
}

/** Every `| file | as written | applied |` row of the audit table. */
function auditRows(region: string): Map<string, string> {
  const rows = new Map<string, string>();
  for (const line of region.split(/\r?\n/)) {
    const cells = line
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);
    if (cells.length !== 3) continue;
    const file = /^`(.+\.md)`$/.exec(cells[0] ?? "")?.[1];
    const applied = /^`([a-z]+)`$/.exec(cells[2] ?? "")?.[1];
    if (file !== undefined && applied !== undefined) rows.set(file, applied);
  }
  return rows;
}

function manifestVersion(): string {
  const parsed: unknown = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("version" in parsed)) {
    throw new Error("package.json did not parse to an object with a `version` field");
  }
  const { version } = parsed;
  if (typeof version !== "string") throw new Error("package.json `version` is not a string");
  return version;
}

const RECORD = readFileSync(RECORD_PATH, "utf8");
const PENDING = readPending(CHANGESET_DIR);
const BUMPS = PENDING.map((entry) => entry.bump).filter((bump): bump is Bump => bump !== undefined);

describe("the pending changeset set", () => {
  it("is not empty, so there is a release to certify", () => {
    // An empty pending set publishes nothing. Certifying one would be a green audit over a
    // release that does not exist.
    expect(BUMPS.length).toBeGreaterThan(0);
  });

  it("is measured against the version this audit was taken on", () => {
    expect(manifestVersion()).toBe(PUBLISHED_BASE);
  });

  it("carries at least one minor and no major", () => {
    expect(BUMPS).toContain("minor");
    expect(BUMPS).not.toContain("major");
  });

  it("resolves the package to the prepared version off the published base", () => {
    expect(resolveNextVersion(PUBLISHED_BASE, BUMPS)).toBe(PREPARED_VERSION);
  });

  it("classifies the LIVD catalog changeset as minor, because it removes public values", () => {
    // Its own text removes `UniversalTestId.loincCandidate`, the `inline-loinc-candidate`
    // provenance token and the `inline-loinc` mapping variant, and changes what the exported
    // `primaryCode()` returns. A removal or a rename of a public value is not a fix.
    const livd = PENDING.find((entry) => entry.file === LIVD_CHANGESET);
    expect(livd, `${LIVD_CHANGESET} is not in the pending set`).toBeDefined();
    expect(livd?.bump).toBe("minor");
  });
});

describe("resolving a pending set", () => {
  it("refuses an empty set rather than certifying a release that publishes nothing", () => {
    expect(() => resolveNextVersion("0.0.22", [])).toThrow(/publishes nothing/);
  });

  it("leaves a patch-only set on the pre-alpha ladder", () => {
    expect(resolveNextVersion("0.0.22", ["patch", "patch"])).toBe("0.0.23");
  });

  it("lifts a set to the next minor as soon as one changeset is minor", () => {
    expect(resolveNextVersion("0.0.22", ["patch", "minor", "patch"])).toBe("0.1.0");
  });

  it("takes a major out of the coordinated batch entirely, which is why it is never silent", () => {
    // `major` on a `0.x` version resolves to `1.0.0`, a different release and a different
    // claim. It is escalated to the operator, never quietly written down to `minor`.
    expect(resolveNextVersion("0.0.22", ["minor", "major"])).toBe("1.0.0");
  });

  it("refuses a base it cannot read", () => {
    expect(() => resolveNextVersion("not-a-version", ["minor"])).toThrow(/plain semver/);
  });

  it("refuses a changeset whose bump word is not a bump", () => {
    expect(() => bumpFor(`---\n"${PACKAGE_NAME}": mnior\n---\n\nbody\n`, PACKAGE_NAME)).toThrow(
      /unrecognized bump/,
    );
  });

  it("reads a bump written with either quoting style", () => {
    expect(bumpFor(`---\n"${PACKAGE_NAME}": minor\n---\n\nbody\n`, PACKAGE_NAME)).toBe("minor");
    expect(bumpFor(`---\n'${PACKAGE_NAME}': patch\n---\n\nbody\n`, PACKAGE_NAME)).toBe("patch");
  });
});

describe("the audit in the release-readiness record", () => {
  const rows = auditRows(readRegion(RECORD, "audit"));

  it("accounts for every pending changeset", () => {
    expect([...rows.keys()].sort()).toEqual(PENDING.map((entry) => entry.file));
  });

  it("states the bump each changeset actually carries", () => {
    for (const entry of PENDING) {
      expect(rows.get(entry.file), `audit row for ${entry.file}`).toBe(entry.bump);
    }
  });
});

describe("the public export surface the record certifies", () => {
  const actual = extractSurface(readFileSync(ENTRY_POINT, "utf8"));
  const recorded: Surface = {
    values: identifiersIn(readRegion(RECORD, "surface:values")),
    types: identifiersIn(readRegion(RECORD, "surface:types")),
  };

  it("enumerates every value the entry point exports", () => {
    expect(describeDrift("value", recorded.values, actual.values)).toBe("");
  });

  it("enumerates every type the entry point exports", () => {
    expect(describeDrift("type", recorded.types, actual.types)).toBe("");
  });

  it("enumerates a surface at all, so an emptied record cannot pass", () => {
    expect(recorded.values.length).toBeGreaterThan(0);
    expect(recorded.types.length).toBeGreaterThan(0);
  });

  it("states counts that match what it enumerates, so the prose cannot go stale either", () => {
    // The counts are prose outside every marker, so nothing else in this file reads them. Without
    // this case the sentence promising the list cannot go stale in silence is itself the thing
    // that goes stale in silence.
    const stated = statedCounts(RECORD);
    expect(stated.values).toBe(recorded.values.length);
    expect(stated.types).toBe(recorded.types.length);
    expect(stated.identifiers).toBe(recorded.values.length + recorded.types.length);
  });

  it("refuses a record that states no counts at all", () => {
    expect(() => statedCounts("an enumeration with no counts above it")).toThrow(
      /states no surface counts/,
    );
  });

  it("names both the added and the removed identifiers when the two differ", () => {
    const message = describeDrift("value", ["kept", "gone"], ["kept", "fresh"]);
    expect(message).toContain("ADDED to the package: fresh");
    expect(message).toContain("REMOVED from the package: gone");
  });

  it("catches a record that lists an identifier twice", () => {
    expect(describeDrift("type", ["A", "A"], ["A"])).toContain("listed twice");
  });

  it("refuses an entry point whose surface cannot be enumerated", () => {
    expect(() => extractSurface(`export * from "./records/parse.js";\n`)).toThrow(/star export/);
    expect(() => extractSurface(`export * as records from "./records/parse.js";\n`)).toThrow(
      /namespace re-export/,
    );
  });

  it("reads a renamed export under the name the package publishes", () => {
    const surface = extractSurface(`export { ENQ as ASTM_ENQ } from "./ltp/constants.js";\n`);
    expect(surface.values).toEqual(["ASTM_ENQ"]);
  });

  it("separates a type-only export from a value export", () => {
    const surface = extractSurface(
      `export type { AstmDate } from "./common/dates.js";\n` +
        `export { parseAstmDate } from "./common/dates.js";\n` +
        `export const VERSION: string = "0.0.0";\n`,
    );
    expect(surface.types).toEqual(["AstmDate"]);
    expect(surface.values).toEqual(["parseAstmDate", "VERSION"]);
  });
});

describe("the stability certification", () => {
  const CERTIFIED = "<!-- certification:begin -->\nsettled and stable\n<!-- certification:end -->";
  const WITHHELD = "<!-- certification:begin -->\n<!-- certification:end -->";
  const NOTHING_OPEN = "<!-- unresolved:begin -->\nNone.\n<!-- unresolved:end -->";
  const ONE_OPEN =
    "<!-- unresolved:begin -->\n- `some-changeset.md`: what does it change?\n<!-- unresolved:end -->";
  const PROSE_OPEN =
    "<!-- unresolved:begin -->\nThe host-query changeset cannot be classified from its own " +
    "text: does it remove a public value?\n<!-- unresolved:end -->";
  const SAYS_NOTHING = "<!-- unresolved:begin -->\n\n<!-- unresolved:end -->";
  const NONE_OVER_A_BULLET =
    "<!-- unresolved:begin -->\nNone.\n- `some-changeset.md`: what does it change?\n" +
    "<!-- unresolved:end -->";

  it("is made by the record, and nothing in it is unresolved", () => {
    const grade = gradeCertification(RECORD);
    expect(grade.unresolved).toEqual([]);
    expect(grade.certified).toBe(true);
    expect(grade.violation).toBeUndefined();
  });

  it("is withheld while an entry is unresolved", () => {
    expect(gradeCertification(`${ONE_OPEN}\n${CERTIFIED}`).violation).toMatch(/unresolved/);
    expect(gradeCertification(`${ONE_OPEN}\n${WITHHELD}`).violation).toBeUndefined();
    expect(gradeCertification(`${NOTHING_OPEN}\n${CERTIFIED}`).violation).toBeUndefined();
  });

  it("sees an unresolved entry written as a sentence, not only as a bullet", () => {
    // Nothing obliges the author of an open question to reach for a bullet, and the region in
    // this repo's own record is a paragraph. A guard that reads only `- ` lines would certify
    // over an unresolved entry it could not see, which is the case the rule exists for.
    expect(gradeCertification(`${PROSE_OPEN}\n${CERTIFIED}`).violation).toMatch(/unresolved/);
    expect(gradeCertification(`${PROSE_OPEN}\n${WITHHELD}`).violation).toBeUndefined();
  });

  it("treats an empty unresolved region as unresolved, because it has not said none", () => {
    const grade = gradeCertification(`${SAYS_NOTHING}\n${CERTIFIED}`);
    expect(grade.unresolved).toHaveLength(1);
    expect(grade.violation).toMatch(/unresolved/);
  });

  it("does not let a none marker hide a bullet written under it", () => {
    expect(gradeCertification(`${NONE_OVER_A_BULLET}\n${CERTIFIED}`).violation).toMatch(
      /unresolved/,
    );
  });

  it("refuses a record with no unresolved region at all", () => {
    expect(() => gradeCertification(CERTIFIED)).toThrow(/no `unresolved` region/);
  });
});
