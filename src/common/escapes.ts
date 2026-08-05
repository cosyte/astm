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
 * it opens no atom, and the parse layer reports it
 * (`ASTM_UNPAIRED_ESCAPE_CHARACTER`). Both functions used to scan forward for the
 * next escape character with no bound, which meant a single unescaped `&` in a
 * value merged every field after it into that value, in silence.
 *
 * **The atom rule is unchanged and still costs a boundary in one case, which now
 * has a report of its own.** A triple is opaque by design, so where its body is
 * itself a delimiter (`&|&` under the canonical set) that delimiter does not
 * split. That is deliberate: it is what keeps `&F&` one token under a declared
 * set that names `F` as a delimiter. Where the body is not a recognized mnemonic
 * the parse layer reports it as `ASTM_UNKNOWN_ESCAPE_SEQUENCE`, and where that
 * unrecognized body is *also* one of the three splitting roles in force it
 * reports `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` **as well**, which is the
 * code that says a boundary went missing rather than merely that a body was not
 * recognized. Do not "fix" this by narrowing the atom: the narrowing would break
 * the guarantee the atom exists for. The split is unchanged; what changed is that
 * the loss is now reported by a code no profile may tolerate.
 *
 * **The match is greedy and leftmost, and that costs a boundary in the opposite
 * direction, which also has a report of its own.** Triples are taken left to
 * right, so the escape character that *closes* one triple cannot also *open* the
 * next. Where it could have (the character after a triple is a splitting
 * delimiter and the one after that is the escape character), the bytes carry two
 * alignments that disagree about that delimiter: under the reading taken it ends
 * a field, repeat or component, and under the other it sits inside an opaque
 * atom and ends nothing. Where the earlier triple's body was **not** a
 * recognized mnemonic, the reading taken rests on a triple this codec cannot
 * interpret at all, so nothing in its own vocabulary prefers that reading to the
 * competing one, and the parse layer reports
 * `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT`. The split is unchanged
 * here too: the leftmost reading is kept, and what is new is that a boundary
 * which may not be the sender's is no longer reported only by codes a profile
 * may tolerate. Where that earlier body **was** a recognized mnemonic nothing is
 * reported, and the reason is narrower than it looks, so read
 * {@link AmbiguousAlignmentSink} before widening it.
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
 * A callback the codec calls when an **unrecognized** escape body is itself one of
 * the three splitting delimiters in force (field, repeat, component), so the atom
 * rule kept that character out of the split and a boundary the sender's bytes
 * carried never became one. The value is preserved verbatim either way; the
 * callback lets the parser surface a value-free
 * `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` warning. Optional so the codec can
 * be used purely.
 *
 * The **escape** character is deliberately not in that test: it is not a splitting
 * role, so `&&&` under the canonical set loses no boundary. A body that is a
 * *recognized* mnemonic is not in it either, whatever character it is: `&F&` under
 * a set naming `F` as the repeat delimiter is the escaped field delimiter the
 * sender wrote, and reading it as a swallowed repeat boundary would report the
 * escape mechanism working as a defect.
 */
export type SwallowedDelimiterSink = () => void;

/**
 * A callback the split calls when the escape character that **closed** an
 * unrecognized escape sequence could instead have **opened** one whose body is the
 * delimiter being split on, so the two alignments of the same bytes disagree about
 * whether that delimiter ends a field, repeat or component. The leftmost reading is
 * kept and nothing is re-split; the callback lets the parser surface a value-free
 * `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT` warning. Optional so the split can be
 * used purely.
 *
 * Two exclusions, both deliberate. The first is what keeps this off conformant
 * streams, and it is **wider than the case it is justified on**, so the residue is
 * named here rather than left to be found:
 *
 * - **The earlier sequence's body must not be a recognized mnemonic.** The test is
 *   which alignment this codec's own vocabulary supports, not which one is tidier.
 *   Where the earlier body is unrecognized the reading taken rests on a triple the
 *   codec cannot interpret, while the competitor's body is the delimiter character,
 *   which it usually cannot interpret either: nothing prefers one, and that is what
 *   this reports. Where the earlier body is a recognized mnemonic the reading taken
 *   interprets a construct (`&F&` is the sender escaping a field separator, which is
 *   what the mechanism is for) and the competitor interprets none, so the vocabulary
 *   does prefer one, and reporting it would report the escape mechanism working.
 *   **What that argument does not cover, measured.** It does not follow that the
 *   reading taken is *conformant*: under `28.6&F&|&U/L` it is `&F&`, a real
 *   separator, and then a bare escape character, which this package reports as a
 *   deviation of its own. And where the declared set names a mnemonic letter as a
 *   splitting delimiter, both alignments interpret exactly one construct and
 *   neither is preferred, yet the exclusion still silences it. Both residues are
 *   recorded with their measurements rather than closed by widening this test: the
 *   criterion that would cover them is a different one (counting what each
 *   alignment interprets), and swapping criteria moves which streams a published
 *   package refuses.
 * - **The following character must be the delimiter this split is taken on.** The
 *   split runs once per role, so a character that is a delimiter in a *later* role
 *   is reported by that role's pass, on the segment it survives into, and never
 *   twice. A delimiter with no escape character two positions past it is excluded by
 *   the rule that defines the condition rather than by a judgement: the sequence the
 *   competing alignment would need never closes, so there is no competitor.
 *
 * @param segmentIndex - The 0-based index of the segment being accumulated when the
 *   ambiguity was seen, so a caller splitting a record into fields can report which
 *   field it sat in. A caller splitting one field into repeats or components
 *   already knows the field index and ignores this.
 */
export type AmbiguousAlignmentSink = (segmentIndex: number) => void;

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
 * @param onSwallowedDelimiter - Called once per unrecognized escape body that is
 *   itself a splitting delimiter in force, so that delimiter never split.
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
  onSwallowedDelimiter?: SwallowedDelimiterSink,
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
      // ...and if that body is one of the three splitting roles, the atom rule is why it
      // is sitting here rather than having ended a field/repeat/component. That is a lost
      // boundary, not merely an unreadable body, so it gets its own report.
      if (isSplittingDelimiter(body, d)) onSwallowedDelimiter?.();
    } else {
      out += replacement;
    }
    i += 3;
  }
  return out;
}

/**
 * Whether `body` is one of the three roles a split is taken on: field, repeat, or
 * component. The escape role is excluded deliberately, because nothing splits on
 * it, so an `&&&` costs no boundary. Called only for an **unrecognized** body: a
 * recognized mnemonic is the sender escaping a delimiter on purpose, which is the
 * atom rule doing its job.
 */
function isSplittingDelimiter(body: string, d: Delimiters): boolean {
  return body === d.field || body === d.repeat || body === d.component;
}

/**
 * The four recognized escape bodies, mapped to the delimiter role each one stands
 * for. **This is the single definition of "a recognized mnemonic" in the package**,
 * and it has to stay single: the decoder and the split both ask that question, and
 * a decoder that recognizes a body the split does not is the same class of mis-read
 * the split-then-decode ordering exists to prevent.
 */
const MNEMONIC_ROLES = {
  F: "field",
  S: "component",
  R: "repeat",
  E: "escape",
} as const satisfies Record<string, keyof Delimiters>;

/**
 * Whether an escape body is one of the four recognized mnemonics. `Object.hasOwn`
 * rather than `in`, so an inherited property name (`toString`) is not read as one.
 */
function isMnemonicBody(body: string): body is keyof typeof MNEMONIC_ROLES {
  return Object.hasOwn(MNEMONIC_ROLES, body);
}

/** Map one escape body (the char(s) between the escape delimiters) to its literal, or undefined. */
function escapeBody(body: string, d: Delimiters): string | undefined {
  return isMnemonicBody(body) ? d[MNEMONIC_ROLES[body]] : undefined;
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
 * text, and it opens no atom. Reading it as the opening of a sequence that never
 * closes is what used to merge the whole remainder of a record into one field.
 * Decoding the resulting leaf is what reports it, so this function stays a pure
 * split. Note the two rules together: a delimiter after such a character does
 * split, and a delimiter sitting inside a real three-character atom does not. The
 * second of those is reported, from the decode step rather than from here,
 * whenever the atom's body was not a recognized mnemonic.
 *
 * **Atoms are matched greedily, leftmost first, and where that choice decides a
 * boundary it is reported from here.** The escape character closing one triple
 * cannot also open the next, so `28.6&Z&|&U/L` is read as the atom `&Z&`, then a
 * field separator that splits, and not as `&Z`, then the atom `&|&` whose field
 * separator would not have split. Both alignments are in the bytes and they
 * disagree by one boundary. The reading is **not** changed (that would only pick
 * the other alignment, with no more evidence for it); it is reported through
 * `onAmbiguousAlignment`, and only where the earlier body was unrecognized, since
 * a recognized mnemonic is a construct this codec can interpret and the
 * competitor's body usually is not. That exclusion is wider than that argument:
 * see {@link AmbiguousAlignmentSink}.
 *
 * @param text - The field or repeat string to split.
 * @param delimiter - The delimiter to split on.
 * @param escape - The active escape character.
 * @param onAmbiguousAlignment - Called once per unrecognized escape sequence whose
 *   closing escape character could instead have opened a sequence holding this
 *   delimiter, so the boundary taken here is not the only reading of the bytes.
 * @returns The raw segments, in order.
 * @example
 * ```ts
 * import { splitEscapeAware } from "@cosyte/astm";
 * splitEscapeAware("a^b^c", "^", "&"); // ["a", "b", "c"]
 * splitEscapeAware("1&S&40", "^", "&"); // ["1&S&40"]  (escape body is opaque)
 * splitEscapeAware("O&Brien^John", "^", "&"); // ["O&Brien", "John"]  (unpaired: literal)
 * ```
 */
export function splitEscapeAware(
  text: string,
  delimiter: string,
  escape: string,
  onAmbiguousAlignment?: AmbiguousAlignmentSink,
): string[] {
  if (text.length === 0) return [""];
  const out: string[] = [];
  let current = "";
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (ch === escape && isEscapeSequenceAt(text, i, escape)) {
      // The closing escape character of this triple could have been the opening one of the next.
      // Where the alternative alignment would have held THIS delimiter, the two readings differ by
      // a boundary, and the leftmost one is a choice rather than a reading of the bytes.
      if (
        !isMnemonicBody(text.charAt(i + 1)) &&
        text.charAt(i + 3) === delimiter &&
        text.charAt(i + 4) === escape
      ) {
        onAmbiguousAlignment?.(out.length);
      }
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
