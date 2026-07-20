/**
 * The ASTM escape codec — the Phase-1 fix for a documented silent-misread class.
 *
 * ASTM escapes an embedded delimiter with the escape character on both sides of
 * a single mnemonic letter (the InterSystems mnemonics, cross-verified in the
 * roadmap's OSS references):
 *
 * ```
 *   &F&  → field delimiter      (default "|")
 *   &S&  → component delimiter  (default "^")
 *   &R&  → repeat delimiter     (default "\")
 *   &E&  → escape character     (default "&")
 * ```
 *
 * **Why this is a requirement, not a nicety.** A result value can legitimately
 * contain a component delimiter — e.g. a titre written `1^40`. On the wire that
 * is escaped as `1&S&40`. A parser that splits a field into components on the
 * raw component delimiter and *never decodes the escape* is safe here (the
 * escape body `&S&` contains no literal `^`), but a parser that **decodes first
 * and splits second** turns `1&S&40` into `1^40` and then mis-splits it into two
 * components — the silent misread `python-astm` / `Chistousov` exhibit. The
 * correct order, implemented here, is **escape-aware split, then decode each
 * leaf**: the escape sequence survives the split intact and only then decodes to
 * a single literal, so `1&S&40` reads as exactly one component.
 *
 * Re-escaping (the inverse, for spec-clean emit) belongs to the serialize phase
 * (P7) and is deliberately not implemented here.
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
 * Decode the four recognized ASTM escape mnemonics in a single already-split
 * leaf (a component string), substituting the *active* delimiters read from the
 * header. Unrecognized `&…&` bodies are preserved verbatim and reported through
 * `onUnknown` (never dropped, never guessed).
 *
 * This runs **after** splitting, so a decoded delimiter becomes ordinary literal
 * text and can never introduce a new split boundary.
 *
 * @param leaf - One component string, escape-aware split already applied.
 * @param d - The delimiters resolved from the header.
 * @param onUnknown - Called once per unrecognized escape body encountered.
 * @returns The decoded string.
 * @example
 * ```ts
 * import { decodeEscapes, CANONICAL_DELIMITERS } from "@cosyte/astm";
 * decodeEscapes("1&S&40", CANONICAL_DELIMITERS); // "1^40"
 * ```
 */
export function decodeEscapes(leaf: string, d: Delimiters, onUnknown?: UnknownEscapeSink): string {
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
    // Look for the closing escape char. An escape body is the single char between them.
    const close = leaf.indexOf(esc, i + 1);
    if (close === -1) {
      // A lone, unterminated escape char — preserve the remainder verbatim and stop.
      out += leaf.slice(i);
      break;
    }
    const body = leaf.slice(i + 1, close);
    const replacement = escapeBody(body, d);
    if (replacement === undefined) {
      // Unrecognized escape — preserve the whole `&…&` verbatim, surface it, never guess.
      out += esc + body + esc;
      onUnknown?.();
    } else {
      out += replacement;
    }
    i = close + 1;
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
 * Split `text` on `delimiter`, treating any escape sequence (`escape …
 * escape`) as an opaque atom so a delimiter that appears *inside* an escape body
 * never causes a split. Returns the raw (still-encoded) segments — decoding is
 * the caller's next step, per the escape-aware-split-then-decode contract.
 *
 * For the four canonical mnemonics this is belt-and-suspenders (their bodies are
 * letters, not delimiters), but it makes the "an escaped delimiter is one token"
 * guarantee hold for any declared delimiter set, including adversarial input.
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
 * ```
 */
export function splitEscapeAware(text: string, delimiter: string, escape: string): string[] {
  if (text.length === 0) return [""];
  const out: string[] = [];
  let current = "";
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (ch === escape) {
      // Copy the whole escape sequence verbatim; do not inspect it for delimiters.
      const close = text.indexOf(escape, i + 1);
      if (close === -1) {
        current += text.slice(i);
        break;
      }
      current += text.slice(i, close + 1);
      i = close + 1;
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
