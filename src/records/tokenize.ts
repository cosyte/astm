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
 * @param onAlignmentTruncatedField - Called (with the 0-based field index) for that
 *   same condition on the **repeat** split, where no field-indexed slot moves and the
 *   field is instead read as more repeats than the competing alignment gives it.
 *   Where that boundary is the **first** in the field the field's own modeled reading
 *   stops at it, because a field is modeled out of its first repeat alone; at a later
 *   one nothing modeled moves and this still fires. See {@link TruncatedFieldSink}.
 * @param onAlignmentShiftedComponents - Called (with the 0-based field index) for that same
 *   condition on the **component** split, where no field-indexed slot moves and nothing leaves the
 *   record: every component after the boundary is one place further right than the competing
 *   alignment puts it, so a Universal Test ID's coding scheme and local code, and a patient's given
 *   and middle names, are read out of positions the sender did not put them in. Every gained
 *   boundary in a repeat moves those slots, not only the first. Inside a **later** repeat nothing
 *   modeled moves and this still fires. See {@link ShiftedComponentsSink}. All three splitting
 *   roles are wired now.
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
  onAlignmentTruncatedField?: (fieldIndex: number) => void,
  onAlignmentShiftedComponents?: (fieldIndex: number) => void,
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
      // The repeat split runs INSIDE one field, so the index it hands back is a repeat index and is
      // discarded: what a caller needs is which field carries the contested boundary, and that is
      // the index this map is already iterating.
      () => onAlignmentTruncatedField?.(fieldIndex),
      // Likewise for the component split, which runs inside one repeat of one field: the index it
      // hands back is a component index and is discarded for the same reason.
      () => onAlignmentShiftedComponents?.(fieldIndex),
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
 * @param onAlignmentTruncatedField - Called with the 0-based whole-record field index
 *   for each contested **repeat** boundary in the data portion on that same tail
 *   test. The declaration is opaque, so it never reports here either.
 * @param onAlignmentShiftedComponents - Called with the 0-based whole-record field index for each
 *   contested **component** boundary in the data portion on that same tail test. The declaration is
 *   opaque, so it never reports here either.
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
  onAlignmentTruncatedField?: (fieldIndex: number) => void,
  onAlignmentShiftedComponents?: (fieldIndex: number) => void,
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
    (i) => onAlignmentTruncatedField?.(i + 2),
    (i) => onAlignmentShiftedComponents?.(i + 2),
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
  onAlignmentTruncatedField: () => void,
  onAlignmentShiftedComponents: () => void,
): AstmField {
  // Each split reports the competing alignments that would have held ITS delimiter, so a role is
  // asked about exactly once: a character that is a delimiter in a later role survives into the
  // segment that role's pass reads, and one this pass split on cannot reach a later one.
  //
  // The truncation report is wired to the REPEAT split only. `components` below is `repeats[0]`,
  // so a FIRST repeat boundary this reading gained and the competing alignment does not have takes
  // every modeled slot of this field with it: the value, and a UTID's or a name's components. At a
  // later boundary `repeats[0]` is the same under both readings, so nothing modeled moves and the
  // report fires anyway, over-reporting relative to those slots and never under.
  //
  // The component split below is wired to the THIRD sink on that same predicate, and what it costs
  // is neither of the other two: nothing leaves the record and no field number changes, and every
  // component after the gained boundary moves one slot along, because `components` IS a component
  // list. So a Universal Test ID's coding scheme and local code, and a patient name's given and
  // middle parts, are read out of positions the competing alignment does not put them in. Unlike
  // the repeat case EVERY gained boundary in a repeat moves those slots, not only the first,
  // because the shift propagates to the end of the list. Inside a LATER repeat nothing modeled
  // moves, since `components` is `repeats[0]`, and it fires there anyway: over-reporting relative
  // to those slots and never under, the same direction as above.
  const rawRepeats = splitEscapeAware(
    raw,
    d.repeat,
    d.escape,
    () => {
      onAmbiguousAlignment();
    },
    undefined,
    () => {
      onAlignmentTruncatedField();
    },
  );
  const repeats = rawRepeats.map((rep) =>
    splitEscapeAware(
      rep,
      d.component,
      d.escape,
      () => {
        onAmbiguousAlignment();
      },
      undefined,
      undefined,
      () => {
        onAlignmentShiftedComponents();
      },
    ).map((comp) =>
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
