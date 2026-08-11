#!/usr/bin/env tsx
/**
 * `@cosyte/astm` PHI scanner: the CI / pre-commit half of the PHI commit-gate.
 *
 * ===========================================================================
 * 🛑🛑 PROVISIONAL. DO NOT MERGE THIS FILE AS IT STANDS. 🛑🛑
 *
 * This is the honest port onto `@cosyte/script-utils/phi-scan` **0.0.2, the
 * engine as it exists today**, and it is recorded rather than shipped. Two
 * things below are PROCESS, not this repo's vocabulary, and under the standing
 * instruction that all process lives in the engine and is parameterized, both
 * MUST move there before any of this lands:
 *
 *   1. THE SOURCE-EMBEDDED VIEW (`decodeEmbeddedEscapes`,
 *      `EMBEDDING_SOURCE_EXTENSIONS`, `SOURCE_LITERAL_DELIMITERS`, and the
 *      two-view dedupe). NOTHING ABOUT IT IS ASTM. Every sibling parser writes
 *      its fixtures as source string literals, so every sibling needs it. Only
 *      the extension allow-list is data.
 *   2. THE DELIMITER READER (`readAstmDelims`). ASTM self-declares its
 *      delimiters in the `H` record's own bytes, and so do HL7 v2 (`MSH`) and
 *      X12 (`ISA`). The LAYOUT is data; reading it is process.
 *
 * AND ONE MEASURED ENGINE GAP BLOCKS THE PORT EVEN AS WRITTEN. `DetectContext`
 * hands a detector the reported LOCUS, never the target's own path, so a target
 * read from the bytes git carries arrives as `<path> (as git carries it)` and
 * `extname` over it answers with the tail of the origin label. The
 * source-embedded view therefore NEVER RUNS ON THE UNION HALF. Reproduced, on a
 * tracked `.ts` whose committed blob carries a patient name and a birthdate as
 * a string literal and whose working-tree copy is clean:
 *
 *     superseded scanner (this repo, `main`)   exit 1, 3 hits, both names + DOB
 *     this file on engine 0.0.2                exit 0, `[phi-scan] OK: no hits`
 *
 * That is a SILENT DETECTION REGRESSION on exactly the route the union half
 * exists for. The remedy is the engine owning the view (item 1), NOT a local
 * helper here recovering the path from the locus: a shim was written, measured
 * to restore all three hits, and then DELETED on purpose. A small local
 * workaround in the fleet's easiest repo is how the pattern spreads to the other
 * twelve, and deleting exactly that is what this whole item is for.
 *
 * The full parameter derivation, and what the engine must grow to accept it, is
 * in `documentation/agent-notes.md`, "#phi-scan-parameters".
 * ===========================================================================
 *
 * ===========================================================================
 * WHAT IS IN THIS FILE, AND WHAT IS NOT.
 *
 * The MACHINERY is `@cosyte/script-utils/phi-scan`, a devDependency: argument
 * parsing, the allow-list and the override log, target enumeration on all three
 * routes, the union of the working-tree walk with the bytes git carries, content
 * deduplication, THE COMPLETENESS RULE, every refusal, and the cross-cutting
 * SSN/email FLOOR. Read that module's docblock for what each rule closes and
 * what it costs; nothing is restated here, because a claim written down twice is
 * a claim that drifts.
 *
 * IT IS A DEPENDENCY AND NOT A COPY, AND THAT IS THE POINT. This file used to
 * carry the whole engine, and every sibling parser carried its own copy of it, so
 * a newly-found escape cost one pull request and one adversarial review PER REPO.
 * Now it costs one pull request in `cosyte/config` and a version bump here.
 *
 * IT IS A devDependency, NEVER A RUNTIME ONE. The zero-dep rule governs what
 * ships; a dev-time gate does not ship.
 *
 * WHAT STAYS LOCAL is what genuinely differs: THE FIVE PER-REPO AXES below, and
 * the ASTM-SPECIFIC FIELD DETECTION in `detect` at the bottom of this file.
 * ===========================================================================
 *
 * ===========================================================================
 * EXIT CONTRACT, DEFINED HERE AND NOT INHERITED:
 *
 *   0  the scan ran, READ EVERY TARGET IT ENUMERATED, and found nothing.
 *   1  HITS. Reserved for "this corpus contains something that looks like PHI".
 *      It is NOT exclusive: an allow-list, or an override log, that EXISTS but
 *      cannot be READ throws a plain `Error` and takes node's own exit 1, which
 *      a caller reads as "hits found". The engine names that escape rather than
 *      claiming to have closed it.
 *   2  EVERY STATE THE ENGINE RAISES IN WHICH THE SCAN CANNOT ACCOUNT FOR
 *      SOMETHING. The full list is in the engine's `run()` docblock.
 *
 * 1 IS RESERVED BECAUSE CI AND THE PRE-COMMIT HOOK BRANCH ON THE CODE. A caller
 * must be able to tell "PHI was found here" from "this scan is not trustworthy".
 *
 * DO NOT PORT THESE NUMBERS INTO, OR OUT OF, A SIBLING PARSER. The `@cosyte/*`
 * scanners do not agree on them and are not required to. That is why the engine
 * has no default for them.
 * ===========================================================================
 */

import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runPhiScan, type DetectContext } from "@cosyte/script-utils/phi-scan";

/**
 * The repository this scan is about, derived from THIS FILE's own location and
 * never from `process.cwd()`, which is what the engine would otherwise default
 * to.
 *
 * Every scan root, the allow-list, the override log and the index the engine
 * reconciles against hang off it, so a cwd-derived root points the whole gate at
 * whatever tree the caller happened to be standing in: run from a parent
 * checkout it walks that tree, reads that tree's allow-list, and reports
 * `OK: no hits` having never opened this package. Pinned by a negative control
 * that runs this package's scanner with its cwd set to another repository.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ===========================================================================
// ██  THE FIVE PER-REPO AXES  ███████████████████████████████████████████████
// ===========================================================================
//
// A PORT IS NOT A COPY. Five things genuinely differ between the sibling
// `@cosyte/*` scanners, and every one of them is a PARAMETER of the shared
// engine rather than a fork of it. Re-derived HERE for this repo:
//
//   1. EXIT CODES        `EXIT_CODES`. No default exists, deliberately.
//   2. ROOTS+EXCLUSIONS  `SCAN_ROOTS`, and the READ filter (left at the
//                        engine's shared Markdown exemption).
//   3. `--staged` SCOPE  `isStagedReadable`.
//   4. GITLINKS          `regularBlobModes`, defaulted by the engine to git's
//                        two regular-blob modes. Nothing to set here.
//   5. EOL NORMALIZATION No parameter: the engine's walk/index deduplication is
//                        BY CONTENT, so a repo whose index carries LF and whose
//                        working tree carries CRLF scans BOTH forms. It is
//                        listed because a port must CHECK it, not skip it, and
//                        it was checked: this repo has no `.gitattributes`,
//                        `core.autocrlf` and `core.eol` are both unset, and CI
//                        is Linux, so the two copies do not diverge here.
// ===========================================================================

/** AXIS 1: this repo's exit contract, stated in the header block above. */
const EXIT_CODES = { clean: 0, hits: 1, refuse: 2 } as const;

/**
 * AXIS 2: the roots the sweep is about, for BOTH of its halves.
 *
 * THE WHOLE REPOSITORY, AND THAT IS A WIDENING RATHER THAN A RESTATEMENT OF THE
 * SUPERSEDED SCANNER. This file used to declare `["src", "test", "scripts"]`
 * while its hand-written index route read the blob behind EVERY index entry,
 * under a root or not. The shared engine does not work that way: its union half,
 * its index refusals and its `--staged` containment check all key on
 * `isUnderScanRoot`, so carrying the three names across would have narrowed the
 * corpus rather than ported it. Measured on this tree at adoption time: 18
 * tracked non-markdown files sit outside those three names, and they are read
 * today. `["."]` keeps them read.
 *
 * BE EXACT ABOUT WHAT "EVERYTHING" READS, BECAUSE IT IS NOT EVERY TRACKED FILE.
 * The engine's default read filter drops `.md` on both sweeping routes, so a
 * tracked markdown file is read by neither. That boundary is the engine's own
 * and moving it is a decision taken there; it is named here so this constant is
 * not read as a claim that nothing is left out. The engine prunes gitignored
 * directories during descent and skips `.git` by name, so `dist/`, `coverage/`
 * and `node_modules/` cost nothing.
 *
 * `docs-content/` used to be excluded by not being named. It is in scope now:
 * its markdown is still exempt by the read filter, and its one non-markdown file
 * is read.
 */
const SCAN_ROOTS: readonly string[] = ["."];

/**
 * AXIS 3: the READ half of scope for `--staged`, i.e. which regular blobs a
 * COMMIT is blocked on.
 *
 * IT IS NARROWER THAN `SCAN_ROOTS`, AND IT IS UNCHANGED BY THIS ADOPTION,
 * DELIBERATELY. Widening it decides what a COMMIT is blocked on rather than what
 * this scanner can see, which is a hook decision taken on its own evidence and
 * declined three times in this lineage for that reason. So a commit staging only
 * `test/**\/*.test.ts` or `scripts/**` is not blocked by the pre-commit hook and
 * the rest of the corpus is caught in CI instead. That residual is stated rather
 * than closed.
 *
 * 🛑 THIS IS NOT `isUnderScanRoot`. The engine's non-regular and non-blob
 * refusals key on the ROOT half of scope, never on this read filter: a
 * `.md`-named symbolic link must be refused even though no route would read a
 * `.md` FILE. A link's name is no evidence about what is on the other side of
 * it. Two sibling ports collapsed the two predicates and both had the routes
 * disagree about the same entry.
 *
 * ⚖️ THE ENGINE ENFORCES CONTAINMENT RATHER THAN ASSUMING IT: a staged path this
 * admits that no scan root covers is REFUSED. With `SCAN_ROOTS` at `["."]`
 * nothing can be outside, so that refusal is unreachable from this
 * configuration. It is not "satisfied by construction" and this sentence does
 * not license narrowing the roots without re-deriving it.
 */
function isStagedReadable(relPath: string): boolean {
  return (
    relPath.startsWith("test/fixtures/") || (relPath.startsWith("src/") && relPath.endsWith(".ts"))
  );
}

// ---------------------------------------------------------------------------
// ASTM-specific structured detection: the P (patient) record loci
// ---------------------------------------------------------------------------
//
// The P record concentrates ASTM's PHI: the patient name (field 6,
// `Last^First^Middle`), the mother's maiden name (field 7, a surname), and the
// birthdate (field 8, `YYYYMMDDHHMMSS`). This detector parses the record the way
// the library does: reading the delimiters from the H record rather than
// assuming them, and flags any name token or DOB that is NOT positively declared
// synthetic in the allow-list.
//
// This is a targeted extension of the engine's floor toward the highest-value
// loci; a full field-level sweep (practice/lab IDs, address, phone, C free text)
// is a later phase. Coded, non-PHI fields (sex, order codes) are deliberately
// not treated as names: parsing the format avoids that false-confidence trap.

/** A hit as this detector raises it. The engine fills in the locus. */
type AstmHit = Omit<Parameters<DetectContext["hit"]>[0], never>;

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
  content: string,
  allow: DetectContext["allow"],
  hits: AstmHit[],
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
    // anywhere, here or in `src/`. It is a PRECISION guard and it has a bound: a
    // patient record whose second field is not a short digit run (or empty) is
    // not read here. To see what that costs over the corpus at any moment, drop
    // the clause and re-run `pnpm phi-scan`.
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
function hitKey(h: AstmHit): string {
  return `${h.segment} ${h.value} ${h.reason}`;
}

/**
 * THE ASTM-SPECIFIC FIELD DETECTION: the half the shared engine deliberately
 * does not own, because it differs per healthcare standard.
 *
 * The engine has already run the cross-cutting floor (SSN + email shapes) over
 * `ctx.text` and reported any hits against the correct locus. Everything below
 * is this repo's.
 *
 *   ============================================================
 *   WHAT A GREEN FROM THIS SCAN MEANS. This is the one place that
 *   sentence is written, and the one to correct. Every other surface
 *   points here rather than restating it, because a restated bound
 *   goes stale on its own and this one has.
 *
 *   A green means: no dashed SSN and no non-test email anywhere in the
 *   corpus, and no undeclared patient name token, mother's maiden name
 *   token or birthdate in any patient record THIS SCAN READ. It is not
 *   a "no PHI" guarantee, and the reader owns the difference:
 *
 *     - LOCI. Only the name, maiden name and birthdate are read. A
 *       practice or lab id, an address, a phone number and `C`-record
 *       free text are not.
 *     - WHAT COUNTS AS A RECORD. A record is a segment beginning a
 *       line, or (in a source file) beginning a string literal, after
 *       the embedded view's decode. A record assembled from pieces at
 *       run time is not one. A record QUOTED IN PROSE IS read, because
 *       a quote is exactly what this view treats as a record start:
 *       that is coverage this sentence used to disclaim, and the
 *       disclaimer was measured false.
 *     - TOKENS NOT READ. A name component of one character, and one
 *       still carrying a `${` placeholder. Each is argued where it is
 *       applied, above.
 *     - THE STRUCTURAL GUARD. A patient record whose second field is
 *       not a short digit run is not read. Argued above.
 *     - FILES NOT READ. In all mode the corpus is the whole repository
 *       on disk UNION every path the index carries, and `.md` is exempt
 *       from both, so a tracked markdown file is read by neither
 *       sweeping route. `--staged` is narrower again, at
 *       `isStagedReadable`, and `paths` is the caller's argv.
 *
 *   Keep fixtures synthetic and declare their identifiers in
 *   scripts/phi-allow-list.txt.
 *   ============================================================
 *
 * @param ctx The target's text and bytes, the parsed allow-list, and `hit`.
 */
function detect(ctx: DetectContext): void {
  const hits: AstmHit[] = [];

  // The line view: the file IS the document.
  scanAstmPatientLoci(ctx.text, ctx.allow, hits);

  // ...and again over the source-embedded view, for a source file whose escape
  // sequences denote the record separators. IN ADDITION TO the pass above, never
  // instead of it: a source file can carry a stream both ways. Deduplicated by
  // hit identity so a stream that reads the same both ways is reported once.
  if (EMBEDDING_SOURCE_EXTENSIONS.has(extname(ctx.path).toLowerCase())) {
    const seen = new Set(hits.map(hitKey));
    const embedded: AstmHit[] = [];
    scanAstmPatientLoci(decodeEmbeddedEscapes(ctx.text), ctx.allow, embedded, true);
    for (const h of embedded) {
      const key = hitKey(h);
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(h);
    }
  }

  // Raised through `ctx.hit`, never against a path built here: the union half
  // scans bytes that may not be the ones on disk, and a hit naming an
  // undecorated path a developer then opens and finds clean is its own defect.
  for (const h of hits) ctx.hit(h);
}

process.exit(
  runPhiScan({
    repoRoot: REPO_ROOT,
    exitCodes: EXIT_CODES,
    scanRoots: SCAN_ROOTS,
    isStagedReadable,
    detect,
    // `excludedPaths` is deliberately NOT set: this repo excludes no path from
    // the scan, and its own scanner test composes every violator value it feeds
    // in rather than writing one, so it needs no exclusion to stay green.
    //
    // `isWalkReadable` is deliberately NOT set: the engine's default is the
    // shared Markdown exemption, which is the boundary this scanner already
    // had, so if that boundary ever moves it moves for every repo at once
    // through a version bump.
    //
    // `regularBlobModes` is deliberately NOT set: git's two regular-blob modes
    // are the engine's default and this repo agrees with them.
  }),
);
