#!/usr/bin/env bash
# scripts/check-no-emdash.sh
# Brand rule (founder directive, 2026-07-24): cosyte never uses the em dash.
# The em dash (U+2014) reads as an AI tell, so it is banned outright across
# every cosyte surface. Source of truth: `knowledgebase/06-brand/voice-and-tone.md`,
# which names commit messages explicitly.
#
# Ported into astm on 2026-07-30 from the sibling `hl7` copy, with two deliberate
# divergences recorded below. Unlike every other repo this gate has landed in, astm
# was NOT clean when it arrived: the same change swept 1,129 occurrences from 108 of
# the 142 tracked files, including `package.json`'s npm `description` (published, and
# visible on the registry) and six `docs-content/` pages that publish to
# docs.cosyte.com. So this gate is not purely a regression stop here; it is the half
# that keeps the sweep from growing back.
#
# The fix is never to re-encode the character: rewrite the sentence with a
# period, a colon, a comma, or parentheses.
#
# Two modes:
#   check-no-emdash.sh                 scan every tracked file
#   check-no-emdash.sh --stdin LABEL   scan text on stdin (CI feeds it the PR
#                                      title, body, and commit messages: the
#                                      voice rule names commit messages, and this
#                                      repo squash-merges, so the PR title and body
#                                      ARE the message that lands on main)
#
# Note: this script itself is excluded from the tracked-file scan (it necessarily
# names the encodings it bans). It matches by codepoint and by encoding, so it
# never contains the literal character.
set -euo pipefail

# ---------------------------------------------------------------------------
# DIVERGENCE 1 OF 2: NEUTRALISE AN INTERPOSED `grep`.
# ---------------------------------------------------------------------------
#
# This is NOT hypothetical housekeeping, and it is not carried over from hl7 (whose
# copy omits it). The development container this gate was written in ships a shell
# FUNCTION named `grep` that execs `ugrep` with `-G --ignore-files --hidden -I`
# forced on. Two of those forced flags would each, on their own, turn this file into
# the exact defect it exists to close:
#
#   * `-I` SKIPS ANY FILE THE TOOL CALLS BINARY, SILENTLY, AT EXIT 0. GNU grep
#     instead reports "binary file matches" on stderr, which refuse_if_incomplete
#     below escalates to a hard red. A tool that skips the file prints nothing,
#     exits 0, and this gate reports OK over a live violation it never opened.
#     That matters more here than in hl7: see divergence 2.
#   * `-G` FORCES BASIC REGULAR EXPRESSIONS, under which the `|` alternation in
#     PATTERN is a LITERAL. The pattern would silently match nothing, which is
#     indistinguishable from a clean tree.
#
# A shell function is not exported to a child process, so `bash scripts/check-no-emdash.sh`
# gets the real binary and CI is unaffected. But `export -f grep` in a caller's
# environment WOULD reach here, so the function is unset rather than assumed absent.
# `unset -f` on a name that is not a function is a no-op, so this costs nothing.
#
# This mirrors `scripts/check-no-internal-refs.sh`, which is this repo's reference
# implementation of the shape. Do not land a weaker variant in the one repo that
# already carries the strong one.
unset -f grep xargs sed awk 2>/dev/null || true

# LOCALE PIN, load-bearing. `grep -P` compiles `\x{NNNN}` as a Unicode codepoint only
# in PCRE's UTF-8 mode, which GNU grep enables from the locale. Under LC_CTYPE=POSIX
# (a bare container, cron, `sh -c`, any shell that inherits no locale) GNU grep 3.8
# instead ABORTS with "character code point value in \x{} or \o{} is too large".
#
# The pin cannot be traded for a raw-byte pattern: `\xe2\x80\x94` matches the em dash
# under POSIX but NOT under a UTF-8 locale, where PCRE reads it as three characters.
# One pattern cannot cover both, so the locale is fixed and the pattern follows it.
export LC_ALL=C.UTF-8

# Matches U+2014 as the literal character and as its encodings: %E2%80%94 (URL),
# the JS backslash-u escape, and the &mdash; / &#8212; / &#x2014; HTML entities.
#
# THE ENTITY ARMS ARE NOT DECORATION. The reference sweep of this rule in
# `claude-containers` found the gate caught what the hand sweep missed precisely
# because a `package.json` held `&mdash;` rather than the literal character. Measured
# on this tree at the time of landing: zero entity or escape forms, but the arms stay.
#
# THE ENCODED ARMS ARE CASE-INSENSITIVE AND TOLERATE LEADING ZEROS, and both halves are
# load-bearing rather than defensive. Lowercase hex is equally valid percent-encoding,
# and `&#X2014;` / `&#08212;` / `&#x02014;` are all valid HTML character references, so
# a case-sensitive zero-intolerant pattern claims coverage it does not have.
#
# TWO ARMS ARE DELIBERATELY OUTSIDE THE CASE-INSENSITIVE GROUP, and the reason is not the
# same for both. The literal `\x{2014}` is a codepoint, which has no case. The SOURCE
# ESCAPE `\u2014` does have one and it is significant: no language spells this character
# `\U2014` (JavaScript is `\u2014` or `\u{2014}`, and Python's `\U` requires eight hex
# digits), so a case-insensitive arm there buys zero true positives and reds an ordinary
# Windows path such as `C:\Users\U2014\x`. Measured as a live false positive before this
# was split out. Do not "tidy" it back inside the group.
PATTERN='\x{2014}|\\u2014|(?i:%E2%80%94|&mdash;|&#0*8212;|&#x0*2014;)'

# The literal-only arm, used to scan THIS script (see the self-exclusion note at the
# bottom). This file must be able to name the encoded forms, but it has no reason to
# contain the character itself, so the one arm it can be held to is the codepoint.
LITERAL_PATTERN='\x{2014}'

# SELF-TEST: prove the scanner can still MATCH what it is meant to catch before any
# clean result is believed. `printf` emits U+2014 as its UTF-8 bytes, so this file
# still never contains the literal character.
if ! printf 'a\xe2\x80\x94b\n' | grep -qP "$PATTERN"; then
  echo "ERROR: check-no-emdash - the scanner cannot match a known em dash." >&2
  echo "       grep -P is unavailable or not in UTF-8 mode (LC_ALL=${LC_ALL})." >&2
  echo "       Refusing to report a clean tree on a scanner that cannot see." >&2
  exit 1
fi

fail_with_hits() {
  local what="$1" hits="$2"
  echo "$hits" >&2
  echo "" >&2
  echo "ERROR: check-no-emdash - em dash (U+2014, or an encoded form) found in ${what}." >&2
  echo "       cosyte never uses em dashes (founder directive; 06-brand/voice-and-tone.md)." >&2
  echo "       Rewrite with a period, colon, comma, or parentheses." >&2
  exit 1
}

# Anything the scanner writes to stderr means it did not read everything it was
# given, and an incomplete scan must never print OK. Both modes route grep's stderr
# here and refuse to continue if it is non-empty, because exit status cannot carry
# that signal: grep exits 1 on "no match", which xargs in turn reports as 123, so
# "clean" and "died part way through the batch" are indistinguishable by code.
ERRLOG=$(mktemp)
FILELIST=$(mktemp)
BINPROBE=$(mktemp)
trap 'rm -f "$ERRLOG" "$FILELIST" "$BINPROBE"' EXIT

refuse_if_incomplete() {
  [ -s "$ERRLOG" ] || return 0
  cat "$ERRLOG" >&2
  echo "" >&2
  # GNU grep >= 3.5 prints "grep: FILE: binary file matches" on STDERR with nothing
  # on stdout, so a match in input it cannot read as text arrives here rather than in
  # the hit list. Name that case, or the run reds blaming an I/O failure that never
  # happened and sends a reader hunting it. On THIS repo that branch is reachable in
  # normal use (see divergence 2). Both paths exit 1; this only chooses the wording.
  if grep -qi 'binary file' "$ERRLOG"; then
    echo "ERROR: check-no-emdash - the input named above MATCHED the em-dash pattern," >&2
    echo "       but grep classifies it as binary, so the hit has no line number. Treat" >&2
    echo "       it as a real violation and rewrite the text; do not silence it here." >&2
  fi
  if grep -qiv 'binary file' "$ERRLOG"; then
    echo "ERROR: check-no-emdash - the scan reported errors, so it did not read all of" >&2
    echo "       its input. Refusing to report green from an incomplete scan." >&2
  fi
  exit 1
}

# ---------------------------------------------------------------------------
# DIVERGENCE 2 OF 2: THE SCANNER VISIBILITY PROBE.
# ---------------------------------------------------------------------------
#
# The self-test above asserts what the scanner MATCHES. This one asserts what it
# READS, and nothing above can substitute for it: a tool that silently skips a file
# produces the same empty output as a tool that read the file and found it clean.
# Exit status cannot tell them apart either; both are 0.
#
# THIS REPO IS THE ONE WHERE IT IS NOT THEORETICAL. hl7's copy of this gate states,
# correctly for hl7, that no tracked file holds a NUL byte. THAT IS FALSE HERE:
# `test/records/parse.test.ts` is a genuine UTF-8 TypeScript source file that embeds a
# literal NUL in a fixture string, because it tests that the parser never throws on
# arbitrary hostile bytes. It held 8 em dashes on the base commit of the sweep this
# gate shipped with, and a NUL-partitioning census MISSED ALL EIGHT on the first pass.
# So on this tree an em dash really can live inside input a scanner may classify as
# binary, and a gate that silently skips such input reports OK over live violations.
#
# The property worth pinning is therefore not "grep is GNU" (a version string is easy
# to satisfy and proves nothing about behaviour) but "a violation inside input this
# tool may classify as binary reaches me SOMEHOW": as a hit on stdout, or as a
# diagnostic on stderr. Either is fine. Silence is not.
#
# Assume any grep-based sweep is wrong about NUL until it has proved otherwise. This
# is that proof, and it runs on every invocation rather than once at review time.
printf 'clean line\n\000 seeded \xe2\x80\x94 violation\n' > "$BINPROBE"
PROBE_ERR=$(mktemp)
PROBE_OUT=$(grep -H -nP -e "$PATTERN" -- "$BINPROBE" 2>"$PROBE_ERR" || true)
PROBE_DIAG=$(cat "$PROBE_ERR" 2>/dev/null || true)
rm -f "$PROBE_ERR"
if [ -z "$PROBE_OUT" ] && [ -z "$PROBE_DIAG" ]; then
  echo "ERROR: check-no-emdash - the grep in use SILENTLY SKIPPED a probe file holding a" >&2
  echo "       NUL byte and a seeded em dash: no hit on stdout, no diagnostic on stderr," >&2
  echo "       exit 0. That is a scanner that cannot see its subject, and it is" >&2
  echo "       indistinguishable from a clean tree. The known cause is a \`grep\`" >&2
  echo "       interposed with \`-I\` forced (this container ships one as a shell" >&2
  echo "       function; \`export -f grep\` would reach a child script). Run this gate" >&2
  echo "       with a real GNU grep. Do NOT 'fix' this by deleting the probe: a green" >&2
  echo "       report from a scanner that skips files is the defect this gate prevents," >&2
  echo "       and this repo tracks a NUL-bearing text file that really does carry prose." >&2
  exit 1
fi

# ---- stdin mode: text that is not a file (commit messages, PR title and body) ----
if [ "${1:-}" = "--stdin" ]; then
  LABEL="${2:-stdin}"
  HITS=$(grep -nP -e "$PATTERN" - 2>>"$ERRLOG" || true)
  refuse_if_incomplete
  [ -n "$HITS" ] && fail_with_hits "$LABEL" "$HITS"
  echo "check-no-emdash: OK (no em dashes in ${LABEL})"
  exit 0
fi

# ---- default mode: every tracked file ----
#
# `git ls-files` is relative to the working directory, so from a subdirectory it
# lists a subtree and the scan would report OK having skipped the rest of the repo.
# Anchor at the top level, which also keeps the self-exclusion path below correct.
cd "$(git rev-parse --show-toplevel)"

# Everything below closes a way for the scan to report green without having looked:
#
#   -0 -r on xargs, fed by `git ls-files -z`: -r drops the grep invocation entirely
#   when the file list is empty (without it, grep falls back to reading stdin and
#   prints OK), and the NUL separator is what makes the list verbatim. Unseparated,
#   `git ls-files` C-quotes any path holding a space, a quote, or a non-ASCII byte,
#   and grep is then handed a name no file has.
#
#   the file list is built as its own command, not as the head of the pipeline, so a
#   `git ls-files` that fails (an unreadable or corrupt index) stops the run. Piped,
#   its status is erased by the `|| true` the no-match case needs, and the scan would
#   report OK over an empty list. An empty list is refused for the same reason.
#
#   -e before the pattern and -- after the file list, so neither a pattern nor a
#   tracked filename that starts with a dash is read as a grep option. A file named
#   `-q` would otherwise silence the whole batch and the gate would print OK.
#
#   NO -I, and on this repo that is load-bearing rather than precautionary. -I skips
#   any file grep reads as binary, which here includes `test/records/parse.test.ts`
#   (a NUL in a hostile-bytes fixture) -- a real source file that really did carry em
#   dashes. With -I those would be skipped in silence. Without it, a match there
#   surfaces as "Binary file X matches" on stderr, which refuse_if_incomplete turns
#   red with the wording above. Fail closed, not open. Do not re-add -I.
#
#   KNOWN LIMIT, unchanged from the hl7 copy and restated because this is a parser
#   repo. The pattern matches U+2014 as UTF-8 and as the five textual encodings listed
#   with it. It does NOT match an em dash encoded in some other charset (a CP1252 0x97
#   fixture, a UTF-16 document). Measured, not assumed: such a file scans clean and
#   this gate stays GREEN. There is none today (all 142 tracked files decode as UTF-8,
#   checked 2026-07-30). This is accepted rather than fixed: the ban is a rule about
#   prose that people write, and fixture bytes are grounded data, not brand copy. If a
#   legacy-charset fixture ever lands, a reviewer covers it, not this script.
#
#   stderr is captured and any of it fails the run (see refuse_if_incomplete above).
#
# The one file the scan does not cover is this script, which has to name the encodings
# it bans. Nothing checks the checker, so keep it free of the literal character: it
# matches by codepoint and by encoding and never spells one out.
git ls-files -z > "$FILELIST"

if [ ! -s "$FILELIST" ]; then
  echo "ERROR: check-no-emdash - no tracked files to scan. Refusing to report green" >&2
  echo "       from a scan that read nothing." >&2
  exit 1
fi

# A TRACKED FILENAME can itself hold the character, and scanning file CONTENTS never
# looks at one. Cheap to close, so it is closed rather than listed as a known limit.
#
# NO `-o` HERE. With `-z` the "line" grep reports IS the whole NUL-terminated path, which
# is the actionable thing; `-o` would print only the matched character and leave a reader
# with a red gate and no filename. That is the same unactionable-report shape `-H` exists
# to prevent one block below, so it is not repeated here.
NAME_HITS=$(grep -zaP -e "$PATTERN" -- "$FILELIST" 2>>"$ERRLOG" | tr '\000' '\n' || true)
refuse_if_incomplete
[ -n "$NAME_HITS" ] && fail_with_hits "a tracked FILENAME (not its contents)" "$NAME_HITS"

# `-H` forces the filename onto every hit. Without it a batch that xargs happens to run
# with a single operand prints bare `LINE:text`, and the report names no file.
HITS=$(grep -zvxF 'scripts/check-no-emdash.sh' < "$FILELIST" |
  xargs -0 -r grep -d skip -H -nP -e "$PATTERN" -- 2>>"$ERRLOG" || true)

refuse_if_incomplete

[ -n "$HITS" ] && fail_with_hits "the tracked files listed above" "$HITS"

# THE SELF-EXCLUSION IS NOT A FREE PASS. This file is excluded from the scan above
# because it must spell the encoded forms, but that exclusion was a demonstrated false
# green: an em dash appended to this script scanned OK. It has no reason to contain the
# LITERAL character, so it is held to that one arm here. The exclusion now costs the
# script only its ability to name encodings, which is the whole reason it exists.
SELF_HITS=$(grep -H -nP -e "$LITERAL_PATTERN" -- 'scripts/check-no-emdash.sh' 2>>"$ERRLOG" || true)
refuse_if_incomplete
[ -n "$SELF_HITS" ] && fail_with_hits "this script itself" "$SELF_HITS"

echo "check-no-emdash: OK (no em dashes in the tracked files, their names, or this script)"
