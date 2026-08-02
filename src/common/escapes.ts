/**
 * The ASTM escape codec: the fix for a documented silent-misread class.
 *
 * ASTM escapes an embedded delimiter with the escape character on both sides of
 * a single mnemonic letter (the InterSystems mnemonics, cross-verified against
 * the OSS reference implementations):
 *
 * ```
 *   &F&  → field delimiter      (default "|")
 *   &S&  → component delimiter  (default "^")
 *   &R&  → repeat delimiter     (default "\")
 *   &E&  → escape character     (default "&")
 * ```
 *
 * **Why this is a requirement, not a nicety.** A result value can legitimately
 * contain a component delimiter: e.g. a titre written `1^40`. On the wire that
 * is escaped as `1&S&40`. A parser that splits a field into components on the
 * raw component delimiter and *never decodes the escape* is safe here (the
 * escape body `&S&` contains no literal `^`), but a parser that **decodes first
 * and splits second** turns `1&S&40` into `1^40` and then mis-splits it into two
 * components: the silent misread `python-astm` / `Chistousov` exhibit. The
 * correct order, implemented here, is **escape-aware split, then decode each
 * leaf**: the escape sequence survives the split intact and only then decodes to
 * a single literal, so `1&S&40` reads as exactly one component.
 *
 * **An escape sequence is exactly three characters** (the escape character, one
 * body character, and the escape character again), and both functions here agree
 * on that, because they have to: a split that thinks `&X…&` is one atom while the
 * decoder thinks otherwise is the same class of mis-read the ordering above
 * exists to prevent. An escape character that does not sit at the head of such a
 * triple is not an escape at all: it is read as the **literal character it is**,
 * every delimiter after it is still honored, and the parse layer reports it
 * (`ASTM_UNPAIRED_ESCAPE_CHARACTER`). Both functions used to scan forward for the
 * next escape character with no bound, which meant a single unescaped `&` in a
 * value merged every field after it into that value, in silence.
 *
 * Re-escaping (the inverse, for spec-clean emit) lives in the serializer and is
 * deliberately not implemented here.
 */

import type { Delimiters } from "./delimiters.js";

/**
 * A callback the codec calls when it encounters an escape sequence whose body is
 * not one of the four recognized mnemonics. The sequence is preserved verbatim;
 * the callback lets the parser surface a value-free `ASTM_UNKNOWN_ESCAPE_SEQUENCE`
 * warning. Optional so the codec can be used purely.
 */
export type UnknownEscapeSink = () => void;

/**
 * A callback the codec calls when it encounters an escape character that does not
 * head a three-character escape sequence. The character is preserved verbatim as a
 * literal; the callback lets the parser surface a value-free
 * `ASTM_UNPAIRED_ESCAPE_CHARACTER` warning. Optional so the codec can be used purely.
 */
export type UnpairedEscapeSink = () => void;

/**
 * Whether an escape sequence starts at `i`: the escape character, exactly one body
 * character, and the escape character again.
 *
 * **The bound is the point.** Scanning forward for the next escape character with
 * no bound lets an escape character that was never meant as one reach across an
 * arbitrary amount of the record and turn every delimiter it spans into ordinary
 * text. The four mnemonic bodies are single characters, so one is all a real
 * sequence ever needs, and reading no further keeps the decision local: whether a
 * field splits can no longer depend on some later field happening to carry an
 * escape character too.
 *
 * `charAt` returns `""` past the end, which is never equal to a delimiter, so an
 * escape character in the last two positions of `text` is correctly not a sequence.
 */
function isEscapeSequenceAt(text: string, i: number, escape: string): boolean {
  return text.charAt(i) === escape && text.charAt(i + 2) === escape;
}

/**
 * Decode the four recognized ASTM escape mnemonics in a single already-split
 * leaf (a component string), substituting the *active* delimiters read from the
 * header. Unrecognized `&X&` bodies are preserved verbatim and reported through
 * `onUnknown` (never dropped, never guessed), and an escape character that heads
 * no sequence at all is preserved as a literal and reported through `onUnpaired`.
 *
 * This runs **after** splitting, so a decoded delimiter becomes ordinary literal
 * text and can never introduce a new split boundary.
 *
 * @param leaf - One component string, escape-aware split already applied.
 * @param d - The delimiters resolved from the header.
 * @param onUnknown - Called once per unrecognized escape body encountered.
 * @param onUnpaired - Called once per escape character that heads no sequence.
 * @returns The decoded string.
 * @example
 * ```ts
 * import { decodeEscapes, CANONICAL_DELIMITERS } from "@cosyte/astm";
 * decodeEscapes("1&S&40", CANONICAL_DELIMITERS); // "1^40"
 * decodeEscapes("O&Brien", CANONICAL_DELIMITERS); // "O&Brien" (literal, reported)
 * ```
 */
export function decodeEscapes(
  leaf: string,
  d: Delimiters,
  onUnknown?: UnknownEscapeSink,
  onUnpaired?: UnpairedEscapeSink,
): string {
  const esc = d.escape;
  if (!leaf.includes(esc)) return leaf;

  let out = "";
  let i = 0;
  while (i < leaf.length) {
    const ch = leaf.charAt(i);
    if (ch !== esc) {
      out += ch;
      i += 1;
      continue;
    }
    if (!isEscapeSequenceAt(leaf, i, esc)) {
      // An escape character heading no sequence: keep it as the literal character it is,
      // report it, and carry on. Never swallow the remainder of the leaf behind it.
      out += ch;
      i += 1;
      onUnpaired?.();
      continue;
    }
    const body = leaf.charAt(i + 1);
    const replacement = escapeBody(body, d);
    if (replacement === undefined) {
      // Unrecognized escape: preserve the whole `&X&` verbatim, surface it, never guess.
      out += esc + body + esc;
      onUnknown?.();
    } else {
      out += replacement;
    }
    i += 3;
  }
  return out;
}

/** Map one escape body (the char(s) between the escape delimiters) to its literal, or undefined. */
function escapeBody(body: string, d: Delimiters): string | undefined {
  switch (body) {
    case "F":
      return d.field;
    case "S":
      return d.component;
    case "R":
      return d.repeat;
    case "E":
      return d.escape;
    default:
      return undefined;
  }
}

/**
 * Split `text` on `delimiter`, treating an escape sequence (escape, one body
 * character, escape) as an opaque atom so a delimiter that appears *inside* an
 * escape body never causes a split. Returns the raw (still-encoded) segments:
 * decoding is the caller's next step, per the escape-aware-split-then-decode
 * contract.
 *
 * For the four canonical mnemonics the opacity is belt-and-suspenders (their
 * bodies are letters, not delimiters), but it makes the "an escaped delimiter is
 * one token" guarantee hold for any declared delimiter set, including adversarial
 * input. A single body character is all that guarantee needs.
 *
 * An escape character that heads no sequence is **not** an escape: it is ordinary
 * text, and every delimiter after it still splits. Reading it as the opening of a
 * sequence that never closes is what used to merge the whole remainder of a record
 * into one field. Decoding the resulting leaf is what reports it, so this function
 * stays a pure split.
 *
 * @param text - The field or repeat string to split.
 * @param delimiter - The delimiter to split on.
 * @param escape - The active escape character.
 * @returns The raw segments, in order.
 * @example
 * ```ts
 * import { splitEscapeAware } from "@cosyte/astm";
 * splitEscapeAware("a^b^c", "^", "&"); // ["a", "b", "c"]
 * splitEscapeAware("1&S&40", "^", "&"); // ["1&S&40"]  (escape body is opaque)
 * splitEscapeAware("O&Brien^John", "^", "&"); // ["O&Brien", "John"]  (unpaired: literal)
 * ```
 */
export function splitEscapeAware(text: string, delimiter: string, escape: string): string[] {
  if (text.length === 0) return [""];
  const out: string[] = [];
  let current = "";
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (ch === escape && isEscapeSequenceAt(text, i, escape)) {
      // Copy the whole escape sequence verbatim; do not inspect it for delimiters.
      current += text.slice(i, i + 3);
      i += 3;
      continue;
    }
    if (ch === delimiter) {
      out.push(current);
      current = "";
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  out.push(current);
  return out;
}
