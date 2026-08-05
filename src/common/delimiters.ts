/**
 * The ASTM delimiter model and its self-declaration reader.
 *
 * ASTM/CLSI-LIS02 messages are **self-describing**: every `H` (header) record
 * declares the four delimiters it uses, in the bytes immediately after the `H`.
 * A parser MUST read them from the record and MUST NOT hardcode them: a vendor
 * is free to declare non-standard delimiters and a conformant reader follows.
 *
 * The canonical declaration is `H|\^&`:
 *
 * | position                 | char | role                    |
 * |--------------------------|------|-------------------------|
 * | immediately after `H`    | `\|`  | **field** delimiter     |
 * | delimiter-definition [0] | `\`  | **repeat** delimiter    |
 * | delimiter-definition [1] | `^`  | **component** delimiter |
 * | delimiter-definition [2] | `&`  | **escape** delimiter    |
 *
 * Note ASTM differs from HL7 v2 here: ASTM's `\` is the **repeat** delimiter and
 * `&` is the **escape** delimiter, where HL7 uses `\` for escape and `~` for
 * repetition. Getting this mapping wrong silently mis-reads values, so the roles
 * are read positionally from the record, never assumed.
 */

/**
 * The four ASTM delimiters resolved from an `H` record. Immutable; carried on
 * the parsed message as delimiter provenance.
 *
 * @example
 * ```ts
 * import { readDelimiters } from "@cosyte/astm";
 * const d = readDelimiters("H|\\^&");
 * d.field;     // "|"
 * d.repeat;    // "\\"
 * d.component; // "^"
 * d.escape;    // "&"
 * ```
 */
export interface Delimiters {
  /** Field separator: the char immediately after `H` in the header. */
  readonly field: string;
  /** Repeat (repetition) separator: ASTM `\` by default. */
  readonly repeat: string;
  /** Component separator: ASTM `^` by default. */
  readonly component: string;
  /** Escape character: ASTM `&` by default (introduces `&F&`/`&S&`/`&R&`/`&E&`). */
  readonly escape: string;
}

/**
 * The canonical ASTM delimiter set (`H|\^&`). Used only as documentation and as
 * a comparison baseline for the non-standard-delimiter warning: never as a
 * parse-time default (delimiters are always read from the header).
 *
 * @example
 * ```ts
 * import { CANONICAL_DELIMITERS } from "@cosyte/astm";
 * CANONICAL_DELIMITERS.repeat; // "\\"
 * ```
 */
export const CANONICAL_DELIMITERS: Delimiters = {
  field: "|",
  repeat: "\\",
  component: "^",
  escape: "&",
};

/** The result of reading delimiters from a header record: either resolved or a declared failure. */
export type DelimiterReadResult =
  | { readonly ok: true; readonly delimiters: Delimiters }
  | { readonly ok: false };

/**
 * Read the four delimiters from a header record's raw text (a single `H`
 * record, its terminator already stripped).
 *
 * Returns `undefined` when the record cannot declare all four delimiters: it is
 * shorter than `H` + a field separator + a 3-char delimiter definition, or the
 * field separator it names also appears among the other three.
 *
 * What the caller does with that depends on **which** header it is. On the first
 * header it is the `ASTM_RECORD_UNDECLARED_DELIMITERS` fatal, because there is no
 * earlier set to fall back to. On any later header (a stream may carry several
 * messages, each declaring its own set) the delimiters already in force are kept
 * and an `ASTM_RECORD_UNREADABLE_REDECLARATION` warning is raised instead; a set is
 * never guessed and no record is dropped.
 *
 * **A set two of whose other three roles share a character is resolved, not
 * refused**, because the stream is still readable and refusing it would drop
 * records the sender did send. What it costs is the boundary between those two
 * roles, which the bytes no longer carry: see {@link hasCollidingRoles}, which
 * the parse path calls to report it (`ASTM_RECORD_DELIMITER_ROLE_COLLISION`).
 *
 * This function does not throw: delimiter resolution and the escalation decision are
 * kept separate so the reader stays pure and testable.
 *
 * @param headerRecord - The raw `H` record text (no trailing CR/LF).
 * @returns The resolved delimiters, or a declared failure.
 * @example
 * ```ts
 * import { readDelimiters } from "@cosyte/astm";
 * const d = readDelimiters("H|\\^&|||sender");
 * d.field; // "|"
 * ```
 */
export function readDelimiters(headerRecord: string): Delimiters | undefined {
  // Need "H" + field-sep + at least the 3-char delimiter definition (repeat/component/escape).
  if (headerRecord.length < 5) return undefined;
  if (headerRecord.charAt(0) !== "H") return undefined;

  const field = headerRecord.charAt(1);
  // The delimiter-definition field runs from index 2 up to the next field separator.
  const defEnd = headerRecord.indexOf(field, 2);
  const definition = headerRecord.slice(2, defEnd === -1 ? headerRecord.length : defEnd);
  if (definition.length < 3) return undefined;

  const repeat = definition.charAt(0);
  const component = definition.charAt(1);
  const escape = definition.charAt(2);

  // A field separator that also appears among the other three delimiters is not a coherent
  // declaration: the four roles must be distinguishable. Refuse rather than mis-split.
  if (field === repeat || field === component || field === escape) return undefined;

  return { field, repeat, component, escape };
}

/**
 * Whether a resolved set names one character in two roles, so the boundary
 * between those two roles cannot be recovered from the bytes.
 *
 * {@link readDelimiters} already refuses a declaration whose **field** separator
 * is one of the other three (it returns `undefined`, which is the
 * `ASTM_RECORD_UNDECLARED_DELIMITERS` fatal on the first header and the
 * `ASTM_RECORD_UNREADABLE_REDECLARATION` warning on a later one), so what is left
 * to test here is the three unordered pairs among the remaining roles:
 * **repeat/component, repeat/escape, and component/escape**. Three pairs, named
 * rather than counted, because the count is only meaningful with the list.
 *
 * Such a declaration is read and honored (nothing is guessed, no record is
 * dropped) and the loss it causes is real and was previously silent. Measured on
 * the canonical-looking `H|^^&`, where the repeat and component roles are both
 * `^`: the field `A^B^C^D` reads back as **four repeats of one component each**,
 * so a two-repeats-of-two-components reading is unrecoverable and `components`
 * holds only `A`. On `H|\&&`, where the component and escape roles are both `&`,
 * the same character splits (`A&B` reads as two components) or opens an atom
 * (`A&F&B` reads as the single component `A|B`) depending only on what follows
 * it. Emit refuses such a set outright (`ASTM_EMIT_INVALID_DELIMITERS`).
 *
 * @param d - A resolved delimiter set.
 * @returns `true` iff two of the repeat / component / escape roles share a character.
 * @example
 * ```ts
 * import { hasCollidingRoles, readDelimiters } from "@cosyte/astm";
 * hasCollidingRoles(readDelimiters("H|\\^&")!); // false
 * hasCollidingRoles(readDelimiters("H|^^&")!); // true (repeat === component)
 * ```
 */
export function hasCollidingRoles(d: Delimiters): boolean {
  return d.repeat === d.component || d.repeat === d.escape || d.component === d.escape;
}

/**
 * Whether a resolved delimiter set differs from the canonical `H|\^&`. A `true`
 * result is a tolerated vendor quirk, surfaced as a value-free warning so a
 * consumer can notice a non-standard stream without the parser refusing it.
 *
 * @example
 * ```ts
 * import { isNonStandard, readDelimiters } from "@cosyte/astm";
 * isNonStandard(readDelimiters("H|\\^&")!); // false
 * ```
 */
export function isNonStandard(d: Delimiters): boolean {
  return (
    d.field !== CANONICAL_DELIMITERS.field ||
    d.repeat !== CANONICAL_DELIMITERS.repeat ||
    d.component !== CANONICAL_DELIMITERS.component ||
    d.escape !== CANONICAL_DELIMITERS.escape
  );
}
