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
 * @param onUnknownEscape - Called (with the 0-based field index) for each
 *   unrecognized escape sequence encountered, so the caller can warn.
 * @param onUnpairedEscape - Called (with the 0-based field index) for each escape
 *   character that heads no escape sequence and was therefore read as a literal.
 * @param onSwallowedDelimiter - Called (with the 0-based field index) for each
 *   unrecognized escape sequence whose body is a splitting delimiter in force, so
 *   that delimiter never became a boundary.
 * @param onAmbiguousAlignment - Called (with the 0-based field index) for each
 *   unrecognized escape sequence whose closing escape character could instead have
 *   opened one holding the delimiter that split, so the boundary is one of two
 *   readings the bytes carry.
 * @param onAlignmentShiftedFields - Called (with the 0-based field index) for each
 *   contested **field** boundary the reading took while resuming on an escape
 *   character that heads no sequence, so every later field is one place further
 *   right than the competing alignment puts it. Wired only to the field split: a
 *   repeat or component boundary divides one field and so moves no field-indexed
 *   slot. That is a choice and not a consequence, because components are modeled
 *   inside a field; see {@link ShiftedFieldsSink}.
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
  onUnpairedEscape?: (fieldIndex: number) => void,
  onSwallowedDelimiter?: (fieldIndex: number) => void,
  onAmbiguousAlignment?: (fieldIndex: number) => void,
  onAlignmentShiftedFields?: (fieldIndex: number) => void,
): AstmField[] {
  // The field split reports the ambiguity itself: the segment index it hands back IS the field
  // index, because a gained field boundary is not visible from inside either field it made. The
  // shift report is wired HERE ONLY, for the same reason read from the other side: only a gained
  // FIELD boundary moves every later field, so only this split can see a modeled slot change hands.
  const rawFields = splitEscapeAware(
    record,
    d.field,
    d.escape,
    (fieldIndex) => onAmbiguousAlignment?.(fieldIndex),
    (fieldIndex) => onAlignmentShiftedFields?.(fieldIndex),
  );
  return rawFields.map((raw, fieldIndex) =>
    toField(
      raw,
      d,
      () => onUnknownEscape?.(fieldIndex),
      () => onUnpairedEscape?.(fieldIndex),
      () => onSwallowedDelimiter?.(fieldIndex),
      () => onAmbiguousAlignment?.(fieldIndex),
    ),
  );
}

/**
 * Tokenize an `H` (header) record into its fields.
 *
 * A header cannot go through {@link tokenizeRecord}: its second field is the
 * **delimiter declaration**, which carries all three non-field delimiters
 * *literally* rather than as escape sequences. Run through the generic tokenizer
 * the declaration would be split on its own repeat and component characters and
 * its escape character would be decoded and reported as unpaired, so what the
 * header declares would come back as fragments plus a spurious warning. This
 * tokenizer instead takes the declaration verbatim as one opaque field, never
 * decoded, and applies the ordinary escape-aware tokenizer to the data portion
 * that follows it.
 *
 * `fields[0]` is the type-letter field and `fields[1]` is the delimiter
 * declaration (verbatim, never escape-decoded); the header's ASTM data fields
 * follow from `fields[2]`.
 *
 * @param record - The raw `H` record text (terminator already stripped).
 * @param d - The delimiters declared by this header.
 * @param onUnknownEscape - Called with the 0-based whole-record field index for
 *   each unrecognized escape sequence in the data portion.
 * @param onUnpairedEscape - Called with the 0-based whole-record field index for
 *   each unpaired escape character in the data portion. The declaration itself is
 *   opaque, so the escape character it names never reports here.
 * @param onSwallowedDelimiter - Called with the 0-based whole-record field index
 *   for each unrecognized escape sequence in the data portion whose body is a
 *   splitting delimiter in force. The declaration is opaque, so the delimiters it
 *   names literally never report here.
 * @param onAmbiguousAlignment - Called with the 0-based whole-record field index for
 *   each competing escape alignment in the data portion. The declaration is opaque,
 *   so the characters it names literally never report here either.
 * @param onAlignmentShiftedFields - Called with the 0-based whole-record field index
 *   for each contested field boundary in the data portion whose reading resumes on
 *   an escape character heading no sequence. The declaration is opaque, so it never
 *   reports here either.
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
  onUnpairedEscape?: (fieldIndex: number) => void,
  onSwallowedDelimiter?: (fieldIndex: number) => void,
  onAmbiguousAlignment?: (fieldIndex: number) => void,
  onAlignmentShiftedFields?: (fieldIndex: number) => void,
): AstmField[] {
  // The delimiter-definition field runs from index 2 to the next field separator.
  const defEnd = record.indexOf(d.field, 2);
  const definition = defEnd === -1 ? record.slice(2) : record.slice(2, defEnd);
  const head = [opaqueField(record.slice(0, Math.min(1, record.length))), opaqueField(definition)];
  if (defEnd === -1) return head;
  // Data fields start at whole-record index 2, so shift the tokenizer's local index by 2.
  const data = tokenizeRecord(
    record.slice(defEnd + 1),
    d,
    (i) => onUnknownEscape?.(i + 2),
    (i) => onUnpairedEscape?.(i + 2),
    (i) => onSwallowedDelimiter?.(i + 2),
    (i) => onAmbiguousAlignment?.(i + 2),
    (i) => onAlignmentShiftedFields?.(i + 2),
  );
  return [...head, ...data];
}

/** A field whose text is structural, not data: surfaced verbatim as one component, never decoded. */
function opaqueField(raw: string): AstmField {
  return { raw, components: [raw], repeats: [[raw]] };
}

/** Build one {@link AstmField} from its raw wire text: split into repeats → components, then decode. */
function toField(
  raw: string,
  d: Delimiters,
  onUnknownEscape: () => void,
  onUnpairedEscape: () => void,
  onSwallowedDelimiter: () => void,
  onAmbiguousAlignment: () => void,
): AstmField {
  // Each split reports the competing alignments that would have held ITS delimiter, so a role is
  // asked about exactly once: a character that is a delimiter in a later role survives into the
  // segment that role's pass reads, and one this pass split on cannot reach a later one.
  const rawRepeats = splitEscapeAware(raw, d.repeat, d.escape, () => {
    onAmbiguousAlignment();
  });
  const repeats = rawRepeats.map((rep) =>
    splitEscapeAware(rep, d.component, d.escape, () => {
      onAmbiguousAlignment();
    }).map((comp) =>
      decodeEscapes(comp, d, onUnknownEscape, onUnpairedEscape, onSwallowedDelimiter),
    ),
  );
  // `splitEscapeAware` always returns at least one element, so `repeats[0]` is defined.
  const components = repeats[0] ?? [""];
  return { raw, components, repeats };
}

/**
 * The primary scalar of a field: its first repeat's first component, decoded.
 * Returns `undefined` for a truly empty field so callers can distinguish
 * "absent" from a value: never defaulting a missing value.
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
