/**
 * Record tokenizer: split one raw ASTM record into typed {@link AstmField}s.
 *
 * The split is **escape-aware first, decode second** (see `../common/escapes.ts`):
 * a field / repeat / component boundary is only recognized on an *unescaped*
 * delimiter, and each resulting component leaf is decoded afterwards. That
 * ordering is the whole reason an embedded escaped component delimiter (`&S&`)
 * reads as a single component instead of being mis-split.
 */

import type { Delimiters } from "../common/delimiters.js";
import { decodeEscapes, splitEscapeAware } from "../common/escapes.js";
import type { AstmField } from "./types.js";

/**
 * Tokenize a single record string (its terminator already stripped) into its
 * fields. `fields[0]` is the type-letter field; ASTM data fields follow at
 * 1-based indices.
 *
 * @param record - The raw record text.
 * @param d - The delimiters resolved from the header.
 * @param onUnknownEscape - Called (with the 1-based field index) for each
 *   unrecognized escape sequence encountered, so the caller can warn.
 * @returns The record's fields.
 * @example
 * ```ts
 * import { tokenizeRecord, CANONICAL_DELIMITERS } from "@cosyte/astm";
 * const fields = tokenizeRecord("R|1|^^^687|28.6|U/L", CANONICAL_DELIMITERS);
 * fields[3].components[0]; // "28.6"
 * ```
 */
export function tokenizeRecord(
  record: string,
  d: Delimiters,
  onUnknownEscape?: (fieldIndex: number) => void,
): AstmField[] {
  const rawFields = splitEscapeAware(record, d.field, d.escape);
  return rawFields.map((raw, fieldIndex) => toField(raw, d, () => onUnknownEscape?.(fieldIndex)));
}

/**
 * Tokenize an `H` (header) record into its fields.
 *
 * A header cannot go through {@link tokenizeRecord}: its second field is the
 * **delimiter declaration**, which carries the escape character *literally*
 * rather than as an escape sequence. The generic escape-aware split treats that
 * lone escape character as the opening of an unterminated escape and swallows
 * the whole remainder of the record into one field, so every data field after
 * the declaration is lost. This tokenizer instead takes the declaration verbatim
 * as one opaque field and applies the ordinary escape-aware tokenizer to the
 * data portion that follows it.
 *
 * `fields[0]` is the type-letter field and `fields[1]` is the delimiter
 * declaration (verbatim, never escape-decoded); the header's ASTM data fields
 * follow from `fields[2]`.
 *
 * @param record - The raw `H` record text (terminator already stripped).
 * @param d - The delimiters declared by this header.
 * @param onUnknownEscape - Called with the 0-based whole-record field index for
 *   each unrecognized escape sequence in the data portion.
 * @returns The header's fields.
 * @example
 * ```ts
 * import { tokenizeHeader, CANONICAL_DELIMITERS } from "@cosyte/astm";
 * const fields = tokenizeHeader("H|\\^&|||sender", CANONICAL_DELIMITERS);
 * fields[1].raw; // "\\^&"
 * fields[4].raw; // "sender"
 * ```
 */
export function tokenizeHeader(
  record: string,
  d: Delimiters,
  onUnknownEscape?: (fieldIndex: number) => void,
): AstmField[] {
  // The delimiter-definition field runs from index 2 to the next field separator.
  const defEnd = record.indexOf(d.field, 2);
  const definition = defEnd === -1 ? record.slice(2) : record.slice(2, defEnd);
  const head = [opaqueField(record.slice(0, Math.min(1, record.length))), opaqueField(definition)];
  if (defEnd === -1) return head;
  // Data fields start at whole-record index 2, so shift the tokenizer's local index by 2.
  const data = tokenizeRecord(record.slice(defEnd + 1), d, (i) => onUnknownEscape?.(i + 2));
  return [...head, ...data];
}

/** A field whose text is structural, not data: surfaced verbatim as one component, never decoded. */
function opaqueField(raw: string): AstmField {
  return { raw, components: [raw], repeats: [[raw]] };
}

/** Build one {@link AstmField} from its raw wire text: split into repeats → components, then decode. */
function toField(raw: string, d: Delimiters, onUnknownEscape: () => void): AstmField {
  const rawRepeats = splitEscapeAware(raw, d.repeat, d.escape);
  const repeats = rawRepeats.map((rep) =>
    splitEscapeAware(rep, d.component, d.escape).map((comp) =>
      decodeEscapes(comp, d, onUnknownEscape),
    ),
  );
  // `splitEscapeAware` always returns at least one element, so `repeats[0]` is defined.
  const components = repeats[0] ?? [""];
  return { raw, components, repeats };
}

/**
 * The primary scalar of a field: its first repeat's first component, decoded.
 * Returns `undefined` for a truly empty field so callers can distinguish
 * "absent" from a value — never defaulting a missing value.
 *
 * @example
 * ```ts
 * import { fieldScalar, tokenizeRecord, CANONICAL_DELIMITERS } from "@cosyte/astm";
 * const f = tokenizeRecord("R|1|^^^687|28.6", CANONICAL_DELIMITERS);
 * fieldScalar(f[3]); // "28.6"
 * ```
 */
export function fieldScalar(field: AstmField | undefined): string | undefined {
  if (field === undefined) return undefined;
  const first = field.components[0];
  return first !== undefined && first.length > 0 ? first : undefined;
}
