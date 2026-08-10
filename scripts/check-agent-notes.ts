#!/usr/bin/env tsx
/**
 * `@cosyte/astm` two-file-contract gate: the contract between THIS repo's
 * `CLAUDE.md` and THIS repo's `documentation/agent-notes.md`, checked.
 *
 * ===========================================================================
 * WHAT THE CONTRACT IS HERE
 * ===========================================================================
 *
 * This repo's guidance is split in two. `CLAUDE.md` is the cursor, the rules and
 * the traps, one line each; `documentation/agent-notes.md` holds the narrative
 * those imperatives point at, byte-verbatim. `CLAUDE.md` says so in its own
 * opening blockquote, and it says something stronger than its siblings do: that
 * a bare anchor written in this file is an anchor in THAT file. Nothing checked
 * any of it.
 *
 * That makes three things able to break in silence, and none of them produces a
 * compile error or a failing test:
 *
 *   1. the narrative file stops existing (a rename, a bad merge, a `git rm`);
 *   2. a section is emptied down to its anchor, so a pointer resolves to
 *      nothing;
 *   3. an anchor is edited on one side of the pair and not the other, so a
 *      pointer dangles.
 *
 * A worker who follows a pointer that no longer resolves gets the imperative and
 * none of the reasoning. That is the exact failure the split was supposed to be
 * safe against: the imperatives here are clinical-safety lessons about a
 * laboratory-instrument parser (a swallowed field separator, a truncated frame,
 * a fabricated LOINC candidate), and several record a claim that measured FALSE
 * after it shipped. A summary of one of those is not a substitute for it.
 *
 * ===========================================================================
 * THIS GATE IS SCOPED TO THIS REPO, DELIBERATELY, AND IS NAMED FOR WHAT IT
 * CHECKS. IT ASSERTS NO UNIVERSAL.
 * ===========================================================================
 *
 * The two-file split landed across the cosyte tree, so the tempting framing is
 * "every repo has these two files, and this gate enforces the contract between
 * them". That framing is FALSE, and a gate written as though it were true would
 * be asserting something its own siblings disprove: several cosyte repos carry
 * no `documentation/agent-notes.md` at all, and for those the honest outcome is
 * a written exemption rather than an invented file.
 *
 * NO LIST AND NO COUNT OF THOSE REPOS IS WRITTEN HERE, and neither should be:
 * the set moves as repos gain the record, and a copy of it in this file cannot
 * self-correct. Derive it from the meta-repo checkout, never from prose:
 *
 *   for d in $(git submodule status | awk '{print $2}'); do
 *     [ -e "$d/documentation/agent-notes.md" ] || echo "$d"; done
 *
 * What this file asserts is what `astm` itself promises, in `astm`'s own CI.
 * That is also why it costs the meta-repo's capped automation plane nothing.
 *
 * ===========================================================================
 * THE POINTER FORM WAS MEASURED AGAINST THIS TREE. IT IS NOT A SIBLING'S.
 * ===========================================================================
 *
 * This is the defect this gate class keeps producing, and it has now produced it
 * twice: a sibling's matcher is ported verbatim into a repo whose dominant
 * spelling is different, and the gate prints "all resolving" over a corpus it
 * never matched. A gate that reports success over a corpus it never opened is
 * worse than no gate. So the forms were COUNTED FIRST, on this tree, and the
 * result is that BOTH sibling matchers score ZERO here:
 *
 *   1. THE PATH-QUALIFIED form (the record's full path, then a `#`, then the
 *      anchor) is what `ccda` and `mllp` write. This tree has NONE.
 *   2. THE BASENAME-QUALIFIED form (the record's basename, then a `#`, then the
 *      anchor) is what `terminology` writes and calls its bare form. This tree
 *      has NONE.
 *   3. THE LIVE FORM HERE IS A THIRD SPELLING THAT NEITHER SIBLING GATE MATCHES:
 *      a backtick-quoted anchor with NO filename in front of it at all, resolved
 *      against the record by the convention `CLAUDE.md` states in its opening
 *      blockquote. Every pointer in this repository is written that way today.
 *
 * No count is written here, because the gate prints one on every run and a
 * numeral in a comment is the staleness class this repo keeps paying for. Forms
 * 1 and 2 are matched anyway, so a pointer pasted in from a sibling is checked
 * from its first day rather than being invisible. Form 3 going to zero is a
 * REFUSAL, because that is what the ported-matcher defect looks like from
 * inside.
 *
 * Every form is scanned in EVERY tracked file, so a pointer written into a
 * source comment or `README.md` is covered without this file declaring a root.
 * The patterns are built from the path constants at run time, so this file never
 * contains a pointer of its own and needs no self-exemption. The em-dash gate
 * next door has to hold itself to its own rule the same way, and a sibling's
 * self-exclusion is a measured false green.
 *
 * ===========================================================================
 * THE ANCHOR SPACE IS THIS RECORD'S, AND IT IS NOT GITHUB HEADING SLUGS
 * ===========================================================================
 *
 * The second half of the same lesson, and it is the half a matcher-only audit
 * would still have got wrong. Measured on this tree: every resolving pointer
 * resolves to an EXPLICIT HTML anchor written into the record, and NOT ONE
 * resolves to a heading slug. The record's headings carry long descriptive
 * titles with dates and status in them, so their computed slugs look nothing
 * like the short stable names the pointers use. A gate that accepted only
 * GitHub's heading slugs, which is what the siblings check, would have reported
 * EVERY pointer in this repository as dangling.
 *
 * Both kinds are accepted, because both genuinely render as link targets on
 * GitHub and rejecting a heading-slug pointer would be a false RED. Which of the
 * two each pointer used is printed on every run rather than assumed.
 *
 * ===========================================================================
 * THE ONE DECLARED EXEMPTION, AND WHY IT CANNOT GO PHANTOM
 * ===========================================================================
 *
 * `CLAUDE.md`'s opening blockquote DEFINES the pointer syntax, and to define it
 * the sentence has to spell a pointer-shaped token as a placeholder. It names no
 * section and is not meant to resolve. Nothing structural separates it from a
 * real pointer: it sits in the same blockquote as a real one, so neither
 * position nor markup discriminates.
 *
 * It is therefore declared below as an exact file-and-anchor pair with its
 * reason, in the same shape `scripts/check-gate-coverage.ts` uses next door: AN
 * ENTRY THERE IS A DISCLOSURE RATHER THAN A SUPPRESSION, printed on every run.
 * The same rule applies here, plus one more that matters more:
 *
 *   AN EXEMPTION THAT MATCHES NOTHING IS A REFUSAL, NOT A PASS.
 *
 * A skip nobody exercises is how an exclusion list goes phantom: the prose keeps
 * describing a thing that no longer exists, and a later reader trusts it. If the
 * placeholder is reworded or removed, this gate stops and says so, and whoever
 * did the rewording deletes the exemption in the same change.
 *
 * The pair is scoped to the file, so the same token written in any OTHER tracked
 * file is a live pointer and still has to resolve.
 *
 * ===========================================================================
 * THE ASSERTION NO SIBLING GATE HAS, AND IT FALLS OUT OF THE SPELLING
 * ===========================================================================
 *
 * Because this tree's pointers name no file, they are interpretable ONLY through
 * the sentence in `CLAUDE.md` that says which file a bare anchor lives in, and
 * only through the link in it that spells the path. In `ccda`, `mllp` and
 * `terminology` every pointer carries its own filename, so losing that link
 * costs a reader nothing. HERE IT COSTS THEM EVERY POINTER AT ONCE: delete that
 * one link and all of them become uninterpretable while every one of them still
 * "resolves" by any anchor check. So the path link is asserted directly. This is
 * the payoff of measuring the tree instead of porting a matcher, and it is not a
 * check any sibling needed.
 *
 * ===========================================================================
 * WHAT IT REFUSES TO GUESS. Every one of these exits 2 and prints CANNOT CHECK.
 * ===========================================================================
 *
 *  - A CHECK CAN PRINT GREEN OVER A CORPUS IT NEVER OPENED, and a denominator
 *    does not detect it: a count counts the files that DID exist. So the corpus
 *    is enumerated from `git ls-files` and RECONCILED as sets. Every tracked path
 *    is opened, or the run refuses.
 *  - THERE IS NO EXCLUSION LIST, NO BINARY SKIP AND NO NUL SKIP, so on a clean
 *    run the read count EQUALS the tracked count and there is no residue for a
 *    reader to interpret. DO NOT ADD ONE, and on this tree that is not a style
 *    preference: this repository tracks TWO NUL-BEARING FILES, both of them
 *    prose-bearing TypeScript sources that a NUL partition would drop in
 *    silence, and one of them is a test. This repo's own em-dash gate records
 *    that exact hazard. A sibling gate that skips NUL-bearing files has to
 *    disclose the miss; here it would be a live hole rather than a latent one.
 *  - Both files the contract is about must be present in what was actually
 *    opened. A phantom path cannot yield green, because green requires having
 *    read them.
 *  - FINDING ZERO POINTERS IS A REFUSAL. An empty result set is
 *    indistinguishable from a clean run by any count.
 *  - FINDING ZERO POINTERS IN THE LIVE FORM IS ALSO A REFUSAL, even when a
 *    sibling form still matches. That is the tripwire for the ported-matcher
 *    defect above. The converse is NOT a refusal: zero path-qualified and zero
 *    basename-qualified pointers is the normal state here, and that asymmetry is
 *    measured rather than assumed.
 *  - A heading carrying a non-ASCII character is a refusal rather than a guess.
 *    The slugifier reproduces GitHub's ASCII behaviour; on anything else it
 *    would silently compute the wrong anchor, and a wrong anchor reads as a
 *    broken pointer or, worse, resolves to the wrong section. Explicit anchors
 *    are literal and need no such guess.
 *  - The declared exemption matching nothing, per the section above.
 *
 * ===========================================================================
 * THE ENCODING LIMIT, PINNED IN BOTH DIRECTIONS RATHER THAN ASSUMED
 * ===========================================================================
 *
 * Every tracked file is decoded as UTF-8. The pointer patterns are pure ASCII
 * and UTF-8 decoding replaces only INVALID sequences, resyncing at the next
 * valid byte, so an ASCII run inside an otherwise non-UTF-8 file survives
 * intact: a pointer in a Windows-1252 file IS matched, pinned by test.
 *
 * The rule in the other direction is exactly one sentence long, and DO NOT
 * restate it as a list of encodings: A POINTER IS MATCHED IF AND ONLY IF THE
 * FILE SPELLS IT IN ITS ASCII BYTES. A UTF-16 file does not, and that miss is
 * pinned too. An encoding that happens to spell it in ASCII bytes is matched,
 * and UTF-7 is such an encoding, because RFC 2152 permits the `#` directly.
 * Naming encodings instead of naming the rule is how the first draft of this
 * paragraph, in a sibling repo, got UTF-7 wrong and nearly propagated it.
 *
 * The miss is disclosed rather than closed, and it is cheap here: every source
 * in this repository is UTF-8 by toolchain, and a miss can only ever hide a
 * pointer, never invent one.
 *
 * ===========================================================================
 * WHAT THIS GATE DOES NOT ASSERT, said plainly so no green is read as wider
 * ===========================================================================
 *
 *  - Not that any other repo has an `agent-notes.md`. See the scope note above.
 *  - Not that every trap in `CLAUDE.md` has a pointer. Recognising "a trap" is a
 *    judgement about prose, and a guard that tried would be the universal-shaped
 *    overclaim this file is written to avoid. The class it cannot see is the
 *    trap phrased as a DELIBERATE OMISSION ("is deliberately left alone", "is
 *    never the default"), which carries no identifier to grep for. Enumerate
 *    those by hand.
 *  - Not that a section's prose is accurate, current, or that the trap it
 *    describes is closed. A POINTER IS NOT A CLOSURE.
 *  - Not that every anchor is pointed at. An unreferenced section is legitimate,
 *    so the unreferenced ones are printed rather than failed.
 *  - Not that an anchor it counted renders as one. An anchor inside an HTML
 *    comment is counted here and produces no target on GitHub, so a pointer at
 *    it would resolve here and go nowhere there. The record contains no HTML
 *    comment today, measured, so this is a LATENT limit rather than a live one.
 *    It is disclosed rather than guarded, because the guard would be a second
 *    markdown implementation and the disclosure is what was missing.
 *  - Not GitHub's duplicate-anchor suffixing beyond the `-1`, `-2` sequence
 *    below, and no other link target in the repo. THIS IS NOT A LINK CHECKER.
 *
 * ONE HAZARD FOLLOWS FROM HAVING NO EXCLUSION LIST: DO NOT WRITE A POINTER INTO
 * A CHANGESET SUMMARY. The summary becomes the `CHANGELOG.md` entry, that file
 * is tracked, and a pointer archived there freezes the anchor it names forever,
 * because renaming the section would red this gate on a published record nobody
 * may hand-edit. Reference a section by TITLE in a changeset, never by anchor.
 *
 * SECURITY: the one subprocess call uses execFileSync with array args. No shell
 * form.
 *
 * Exit codes: 0 (contract holds), 1 (a pointer or section is broken), 2 (the
 * gate cannot make a claim either way).
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/** The always-read file that carries the one-line imperatives. */
const CLAUDE_MD = "CLAUDE.md";
/** The directory the on-demand record lives in. */
const NOTES_DIR = "documentation";
/** The on-demand file that carries the reasoning behind them. */
const NOTES_BASENAME = "agent-notes.md";
/** The on-demand record, as `git ls-files` spells it. */
const NOTES = `${NOTES_DIR}/${NOTES_BASENAME}`;

/**
 * A pointer-shaped token that is deliberately not a pointer, with the reason it
 * is not. Scoped to one file: the same token elsewhere is live and must resolve.
 *
 * THIS IS A DISCLOSURE, NOT A SUPPRESSION. Every entry prints on every run, and
 * an entry that matches nothing REFUSES rather than passing, so a skip cannot go
 * phantom when the prose it describes is reworded away.
 */
const DECLARED_NON_POINTERS: { file: string; anchor: string; why: string }[] = [
  {
    file: CLAUDE_MD,
    anchor: "anchor",
    why:
      "the opening blockquote DEFINES the pointer syntax, and to define it the sentence has " +
      "to spell a pointer-shaped token as a placeholder. It names no section and is not meant " +
      "to resolve. Nothing structural separates it from a real pointer, so it is named here.",
  },
];

/** Escape every RegExp metacharacter, backslash first so its own escape is not re-escaped. */
const escapeForRegExp = (text: string): string => text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");

const ANCHOR = "([A-Za-z0-9._-]+)";

/**
 * Built at run time so this file never contains a pointer of its own.
 *
 * LIVE_RE is the live form in this tree: a backtick-quoted anchor with no
 * filename. The backticks are what make it a pointer rather than prose; an
 * unquoted `#` in running text is a heading, a shell comment or an issue
 * reference, and matching those would produce noise this gate could not defend.
 */
const LIVE_RE = new RegExp("`#" + ANCHOR + "`", "g");
/** BASENAME_RE is `terminology`'s spelling. Zero here today, matched so a paste is not invisible. */
const BASENAME_RE = new RegExp(`(?<![\\w/.-])${escapeForRegExp(NOTES_BASENAME)}#${ANCHOR}`, "g");
/** PATH_RE is `ccda` and `mllp`'s spelling. Zero here today, matched for the same reason. */
const PATH_RE = new RegExp(`${escapeForRegExp(NOTES)}#${ANCHOR}`, "g");

/** The path link that makes every bare anchor in this tree interpretable. */
const PATH_LINK_RE = new RegExp(`\\]\\(\\s*\\.?/?${escapeForRegExp(NOTES)}\\s*\\)`);

const args = process.argv.slice(2);
const rootFlag = args.indexOf("--root");
const ROOT = rootFlag === -1 ? process.cwd() : args[rootFlag + 1];

/** A structural problem: the gate cannot make a claim either way. Never green. */
function refuse(message: string): never {
  process.stderr.write(`agent-notes contract: CANNOT CHECK\n  ${message}\n`);
  process.exit(2);
}

if (ROOT === undefined) refuse("--root was given with no directory after it.");

/** GitHub's ASCII anchor slug. Callers must have rejected non-ASCII headings first. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\- ]/g, "")
    .trim()
    .replace(/ /g, "-");
}

interface Target {
  /** The anchor a pointer must spell to reach this. */
  name: string;
  /** 0-based line it is defined on. */
  line: number;
  /** Where the section it opens begins. */
  bodyStart: number;
  /** Heading depth, or 0 for an explicit anchor, which has no depth. */
  level: number;
  kind: "explicit" | "heading";
  /** The heading text, for reporting. Empty for an explicit anchor. */
  text: string;
}

/**
 * Every link target in the record: explicit HTML anchors AND heading slugs.
 *
 * Fence-aware in both directions. A `#` inside a code block is NOT a heading and
 * counting it would let a pointer resolve to a section that does not exist, and
 * that direction is live in this record, which fences shell transcripts whose
 * comment lines begin with `#`. An anchor inside a fence is likewise inert.
 *
 * The heading relaxations are the bypasses a naive guard lets through: up to
 * three leading spaces is a valid ATX heading, a setext underline is a heading
 * with no `#` at all, and trailing `#`s are a closing sequence rather than text.
 */
function parseTargets(lines: string[]): Target[] {
  const out: Target[] = [];
  let fenceChar: string | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence !== null) {
      const char = (fence[1] ?? "")[0] ?? null;
      if (fenceChar === null) fenceChar = char;
      else if (line.trimStart()[0] === fenceChar) fenceChar = null;
      continue;
    }
    if (fenceChar !== null) continue;

    for (const m of line.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) {
      out.push({
        name: m[1] ?? "",
        line: i,
        bodyStart: i + 1,
        level: 0,
        kind: "explicit",
        text: "",
      });
    }

    const atx = /^ {0,3}(#{1,6}) +(.*?)(?: +#+)? *$/.exec(line);
    if (atx !== null) {
      out.push({
        name: "",
        line: i,
        bodyStart: i + 1,
        level: (atx[1] ?? "").length,
        kind: "heading",
        text: (atx[2] ?? "").trim(),
      });
      continue;
    }
    const under = /^ {0,3}(=+|-+) *$/.exec(line);
    const prev = i > 0 ? (lines[i - 1] ?? "") : "";
    if (
      under !== null &&
      prev.trim() !== "" &&
      !/^ {0,3}#/.test(prev) &&
      !/^ {0,3}[-=*_] *$/.test(prev)
    ) {
      out.push({
        name: "",
        line: i - 1,
        bodyStart: i + 1,
        level: (under[1] ?? "")[0] === "=" ? 1 : 2,
        kind: "heading",
        text: prev.trim(),
      });
    }
  }
  return out;
}

/** Assign heading slugs, reproducing GitHub's `-1`, `-2` duplicate suffixing. */
function assignSlugs(targets: Target[]): Target[] {
  const seen = new Map<string, number>();
  for (const t of targets) {
    if (t.kind !== "heading") continue;
    const base = slugify(t.text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    t.name = n === 0 ? base : `${base}-${n}`;
  }
  return targets;
}

// ---- Enumerate the corpus, from git, and reconcile it -------------------------------

let tracked: string[];
try {
  tracked = execFileSync("git", ["-C", ROOT, "ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter((p) => p !== "");
} catch (error) {
  refuse(`could not list tracked files under ${ROOT}: ${(error as Error).message}`);
}
if (tracked.length === 0) refuse(`${ROOT} has no tracked files, so there is nothing to check.`);

const opened = new Map<string, string>();
const unreadable: string[] = [];
for (const rel of tracked) {
  let buf: Buffer;
  try {
    buf = readFileSync(join(ROOT, rel));
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    unreadable.push(`${rel} (${err.code ?? err.message})`);
    continue;
  }
  // EVERY tracked file is decoded and scanned. NO BINARY SKIP AND NO NUL SKIP.
  // See the encoding note in the header: UTF-8 decoding replaces only invalid
  // sequences, so an ASCII pointer inside an otherwise undecodable file still
  // matches, and a genuinely binary file can only ever cost a false RED, which
  // is cheap. A skip is the other trade, and on this tree it would be a live
  // hole: two tracked TypeScript sources carry a NUL byte.
  opened.set(rel, buf.toString("utf8"));
}

// The reconciliation. Not a count of what was found: an equality against what
// git says exists, so a path that silently went missing cannot pass for a path
// that was clean.
if (opened.size + unreadable.length !== tracked.length) {
  refuse(
    `corpus reconciliation failed: ${tracked.length} tracked, ${opened.size} read, ` +
      `${unreadable.length} unreadable.`,
  );
}
if (unreadable.length > 0) {
  refuse(
    `${unreadable.length} tracked file(s) could not be read, so this run covers less than it ` +
      `claims:\n  ` +
      unreadable.join("\n  "),
  );
}
for (const required of [CLAUDE_MD, NOTES]) {
  if (!opened.has(required)) {
    refuse(
      `${required} is not among the tracked files that were read. This is the contract's own ` +
        `half of the corpus: without it there is nothing to check and nothing to check against.`,
    );
  }
}

// ---- The anchors that exist ---------------------------------------------------------

const notesLines = (opened.get(NOTES) ?? "").split("\n");
const targets = assignSlugs(parseTargets(notesLines));
if (targets.length === 0) {
  refuse(`${NOTES} has no headings and no anchors, so no pointer into it could resolve.`);
}

const nonAscii = targets.filter((t) => t.kind === "heading" && /[^\x20-\x7e]/.test(t.text));
if (nonAscii.length > 0) {
  refuse(
    `${NOTES} has heading(s) with non-ASCII characters, whose anchors this gate would have to ` +
      `guess:\n  ` +
      nonAscii.map((t) => `line ${t.line + 1}: ${t.text}`).join("\n  "),
  );
}

const byName = new Map<string, Target>();
for (const t of targets) if (!byName.has(t.name)) byName.set(t.name, t);

const explicitCount = targets.filter((t) => t.kind === "explicit").length;
const headingCount = targets.filter((t) => t.kind === "heading").length;

// ---- The pointers that claim to reach them ------------------------------------------

function lineOf(text: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index; i += 1) if (text[i] === "\n") n += 1;
  return n;
}

interface Pointer {
  file: string;
  anchor: string;
  form: "live" | "basename" | "path";
  line: number;
}

const pointers: Pointer[] = [];
const exempted: { file: string; anchor: string; line: number }[] = [];

for (const [rel, text] of opened) {
  const scan = (re: RegExp, form: Pointer["form"]): void => {
    for (const m of text.matchAll(re)) {
      const anchor = m[1] ?? "";
      const line = lineOf(text, m.index);
      const declared = DECLARED_NON_POINTERS.find((d) => d.file === rel && d.anchor === anchor);
      if (declared !== undefined) {
        exempted.push({ file: rel, anchor, line });
        continue;
      }
      pointers.push({ file: rel, anchor, form, line });
    }
  };
  scan(PATH_RE, "path");
  scan(BASENAME_RE, "basename");
  scan(LIVE_RE, "live");
}

const live = pointers.filter((p) => p.form === "live");
const basename = pointers.filter((p) => p.form === "basename");
const path = pointers.filter((p) => p.form === "path");

// An exemption that matches nothing is a refusal, not a pass. So is one that
// matches MORE than the single sentence it describes.
//
// THE SECOND HALF IS NOT HYPOTHETICAL: it fired during this gate's own build.
// The trap line added to `CLAUDE.md` announcing this gate spelled the
// placeholder while describing the pointer form, and the exemption silently
// absorbed it, attaching a reason about the opening blockquote to a bullet three
// hundred lines away. Nothing went red. An exclusion that can quietly widen is
// the same defect as one that can go phantom, arriving from the other side, so
// the declaration is pinned to the ONE occurrence it describes.
for (const d of DECLARED_NON_POINTERS) {
  const hits = exempted.filter((e) => e.file === d.file && e.anchor === d.anchor);
  if (hits.length === 0) {
    refuse(
      `the declared non-pointer "${d.anchor}" in ${d.file} matched nothing on this tree. It was ` +
        `declared because: ${d.why}\n  Either the prose was reworded, in which case DELETE the ` +
        `entry in the same change, or the matcher stopped seeing it. A skip nobody exercises is ` +
        `how an exclusion list goes phantom, so this refuses rather than passing.`,
    );
  }
  if (hits.length > 1) {
    refuse(
      `the declared non-pointer "${d.anchor}" in ${d.file} describes ONE sentence but matched ` +
        `${hits.length} occurrences, at line(s) ${hits.map((h) => h.line).join(", ")}. It was ` +
        `declared because: ${d.why}\n  A new occurrence has been silently exempted, and the reason ` +
        `above does not describe it. Spell the new one differently (say "a backticked bare anchor" ` +
        `rather than writing one), or declare it separately with its own reason.`,
    );
  }
}

// Zero pointers is indistinguishable from a clean run by any count, so it refuses.
if (pointers.length === 0) {
  refuse(
    `no pointer into ${NOTES} was found in any of the ${opened.size} tracked files read. Either ` +
      `the two-file contract is gone, or this gate stopped matching the pointers it is about.`,
  );
}
// And zero in the LIVE form refuses too, even with a sibling form still matching:
// this tree writes its pointers as a backtick-quoted bare anchor, so matching
// none of them is the ported-matcher defect (green over a corpus the matcher
// never covered), not a clean run.
if (live.length === 0) {
  refuse(
    `no pointer in this tree's live form (a backtick-quoted anchor with no filename) was found, ` +
      `though ${basename.length + path.length} in a sibling repo's spelling were. Every pointer ` +
      `in this repository is written that way, so this run covered none of them: either the ` +
      `spelling migrated, or this gate stopped matching it. Re-derive the forms against the tree ` +
      `before touching this.`,
  );
}

// ---- The four assertions ------------------------------------------------------------

const problems: string[] = [];

// 1. Every pointer resolves to a target that exists.
const reached = new Set<string>();
for (const p of pointers) {
  const target = byName.get(p.anchor);
  if (target !== undefined) reached.add(p.anchor);
  else {
    problems.push(
      `${p.file}:${p.line}: pointer #${p.anchor} (${p.form} form) matches no anchor and no ` +
        `heading in ${NOTES}.`,
    );
  }
}

// 2. No section a pointer reaches is empty.
//
//    THE BINDING IS THE PART THAT IS SPECIFIC TO THIS TREE, AND GETTING IT WRONG
//    MAKES THE ASSERTION VACUOUS RATHER THAN WRONG, WHICH IS WORSE. Measured: all
//    36 explicit anchors here are a bare tag alone on a line, then a blank line,
//    then a heading. So an anchor is not a section of its own; it is the stable
//    NAME of the section the heading opens. Treated separately, the anchor looks
//    like an empty section (its body is the heading line) and the heading looks
//    unreferenced (no pointer spells its slug), so a naive pass skips BOTH and
//    the check silently covers nothing. An early draft of this gate did exactly
//    that, and a deliberately emptied section still printed OK.
//
//    So an explicit anchor separated from a following heading by blank lines only
//    is BOUND to it: one unit, carrying both names, with the heading's body. A
//    body of its own is optional ONLY when the next unit is deeper, i.e. it is a
//    container for its subsections.
interface Unit {
  names: string[];
  line: number;
  bodyStart: number;
  level: number;
  label: string;
}

const ordered = [...targets].sort((a, b) => a.line - b.line);
const units: Unit[] = [];
for (let i = 0; i < ordered.length; i += 1) {
  const t = ordered[i];
  if (t === undefined) continue;
  const next = ordered[i + 1];
  const between =
    next === undefined
      ? []
      : notesLines.slice(t.bodyStart, next.line).filter((l) => l.trim() !== "");
  if (
    t.kind === "explicit" &&
    next !== undefined &&
    next.kind === "heading" &&
    between.length === 0
  ) {
    units.push({
      names: [t.name, next.name],
      line: t.line,
      bodyStart: next.bodyStart,
      level: next.level,
      label: `anchor "${t.name}" / section "${next.text}"`,
    });
    i += 1;
    continue;
  }
  units.push({
    names: [t.name],
    line: t.line,
    bodyStart: t.bodyStart,
    level: t.kind === "explicit" ? 0 : t.level,
    label: t.kind === "explicit" ? `anchor "${t.name}"` : `section "${t.text}"`,
  });
}

for (let i = 0; i < units.length; i += 1) {
  const u = units[i];
  if (u === undefined) continue;
  const next = units[i + 1];
  const body = notesLines
    .slice(u.bodyStart, next === undefined ? notesLines.length : next.line)
    .join("\n");
  if (body.trim() !== "") continue;
  // A container for deeper subsections legitimately has no body of its own. An
  // explicit anchor bound to nothing (level 0) is never a container.
  if (u.level > 0 && next !== undefined && next.level > u.level) continue;
  const isReached = u.names.some((n) => reached.has(n));
  const why = isReached
    ? "and a pointer resolves to it"
    : "and it is not a container for subsections";
  problems.push(`${NOTES}:${u.line + 1}: ${u.label} is empty ${why}.`);
}

// 3. The record is reachable from the always-read file. If `CLAUDE.md` stops
//    pointing into it, the split has quietly become a deletion for every worker
//    who only reads `CLAUDE.md`, which is every worker.
if (!pointers.some((p) => p.file === CLAUDE_MD)) {
  problems.push(
    `${CLAUDE_MD} carries no pointer into ${NOTES}. The long-form record is unreachable from ` +
      `the file every worker reads.`,
  );
}

// 4. The path link, which is what makes a bare anchor mean anything at all HERE.
//    See the header: this assertion exists because of this tree's spelling, and
//    no sibling repo needs it.
if (!PATH_LINK_RE.test(opened.get(CLAUDE_MD) ?? "")) {
  problems.push(
    `${CLAUDE_MD} does not link ${NOTES} by path. Every pointer in this tree is a bare anchor ` +
      `with no filename, so that link is the only thing that says which file they are anchors ` +
      `in. Without it all ${live.length} of them are uninterpretable, while still "resolving" ` +
      `by any anchor check.`,
  );
}

// ---- Report -------------------------------------------------------------------------

const unreferenced = targets
  .filter((t) => t.kind === "explicit" && !reached.has(t.name))
  .map((t) => t.name);

const summary =
  `  corpus:   ${tracked.length} tracked, ${opened.size} read, ${unreadable.length} unreadable ` +
  `(no file is ever skipped)\n` +
  `  targets:  ${targets.length} in ${NOTES} (${explicitCount} explicit anchors, ` +
  `${headingCount} headings), ${reached.size} of them pointed at\n` +
  `  pointers: ${pointers.length} (${live.length} live bare-anchor form, ` +
  `${basename.length} basename-qualified, ${path.length} path-qualified)\n` +
  (unreferenced.length > 0
    ? `  unreferenced anchors (legitimate, reported not failed): ${unreferenced.join(", ")}\n`
    : "") +
  exempted
    .map(
      (e) =>
        `  DECLARED NON-POINTER: ${e.file}:${e.line} #${e.anchor}\n` +
        `      ${DECLARED_NON_POINTERS.find((d) => d.file === e.file && d.anchor === e.anchor)?.why ?? ""}\n`,
    )
    .join("");

if (problems.length > 0) {
  process.stderr.write(
    `agent-notes contract: ${problems.length} problem(s)\n${summary}\n` +
      problems.map((p) => `  ${p}\n`).join("") +
      `\n  Fix the pointer or restore the section. Do not delete the imperative to get green:\n` +
      `  the reasoning behind it is a clinical-safety lesson this repo paid for.\n`,
  );
  process.exit(1);
}

process.stdout.write(`agent-notes contract: OK\n${summary}`);
