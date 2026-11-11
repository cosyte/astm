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
 *   character that heads no sequence this codec can interpret. Wired only to the field split: a
 *   repeat or component boundary divides one field and so moves no field-indexed
 *   slot. That is a choice and not a consequence, because components are modeled
 *   inside a field. **What the boundary costs, and the one class in which nothing
 *   moves index, are stated in {@link ShiftedFieldsSink} and not restated here.**
 * @param onAlignmentTruncatedField - Called (with the 0-based field index) for that
 *   same condition on the **repeat** split, where no field-indexed slot moves.
 *   **What the boundary costs, its two index bounds and the one class in which nothing
 *   moves index are stated in {@link TruncatedFieldSink} and not restated here.**
 * @param onAlignmentShiftedComponents - Called (with the 0-based field index) for that same
 *   condition on the **component** split, where no field-indexed slot moves and nothing leaves the
 *   record. **What the boundary costs, its three index bounds and the one class in which nothing
 *   moves index are stated in {@link ShiftedComponentsSink} and not restated here.** All three
 *   splitting roles are wired now.
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
  return tokenizeFields(
    record,
    d,
    {
      onUnknownEscape,
      onUnpairedEscape,
      onSwallowedDelimiter,
      onAmbiguousAlignment,
      onAlignmentShiftedFields,
      onAlignmentTruncatedField,
      onAlignmentShiftedComponents,
    },
    0,
    false,
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
 *   for each contested field boundary in the data portion whose reading resumes on an
 *   escape character heading no sequence this codec can interpret. The declaration is
 *   opaque, so it never reports here either.
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
  return tokenizeHeaderFields(
    record,
    d,
    {
      onUnknownEscape,
      onUnpairedEscape,
      onSwallowedDelimiter,
      onAmbiguousAlignment,
      onAlignmentShiftedFields,
      onAlignmentTruncatedField,
      onAlignmentShiftedComponents,
    },
    false,
  );
}

/**
 * The tokenizer's reports, each called with the 0-based whole-record field index: the sinks of
 * {@link tokenizeRecord} and {@link tokenizeHeader}, held in one object so a field is tokenized
 * without a closure of its own for each of them.
 */
export interface FieldSinks {
  readonly onUnknownEscape?: ((fieldIndex: number) => void) | undefined;
  readonly onUnpairedEscape?: ((fieldIndex: number) => void) | undefined;
  readonly onSwallowedDelimiter?: ((fieldIndex: number) => void) | undefined;
  readonly onAmbiguousAlignment?: ((fieldIndex: number) => void) | undefined;
  readonly onAlignmentShiftedFields?: ((fieldIndex: number) => void) | undefined;
  readonly onAlignmentTruncatedField?: ((fieldIndex: number) => void) | undefined;
  readonly onAlignmentShiftedComponents?: ((fieldIndex: number) => void) | undefined;
}

/**
 * Call one sink, if it is set, as a plain function call with the field index alone: the way each
 * sink has always been called, so a sink never sees the sinks object as its `this`.
 */
function report(sink: ((fieldIndex: number) => void) | undefined, fieldIndex: number): void {
  sink?.(fieldIndex);
}

/**
 * The one empty field the parser hands out for every empty field it reads. It is frozen, so no
 * caller can tell it from a field of its own: an empty field has no text that could differ, and
 * one shared node in place of three objects for each of them is most of what a sparse record
 * costs to hold.
 */
const EMPTY_FIELD: AstmField = Object.freeze({
  raw: "",
  components: Object.freeze([""]),
  repeats: Object.freeze([Object.freeze([""])]),
});

/**
 * Tokenize a record's fields from `offset` on: the body of {@link tokenizeRecord}, and of the
 * parser's own reading, which asks for every node frozen as it is built (`freeze`) so the parsed
 * message needs no walk over its fields afterwards. {@link tokenizeRecord} returns its fields
 * unfrozen, as it always has.
 *
 * @internal
 */
export function tokenizeFields(
  record: string,
  d: Delimiters,
  sinks: FieldSinks,
  offset: number,
  freeze: boolean,
): AstmField[] {
  // The field split reports the ambiguity itself: the segment index it hands back IS the field
  // index, because a gained field boundary is not visible from inside either field it made. The
  // shift report is wired HERE ONLY, for the same reason read from the other side: only a gained
  // FIELD boundary moves every later field, so only this split can see a modeled slot change hands.
  const rawFields = splitEscapeAware(
    record,
    d.field,
    d.escape,
    (fieldIndex) => report(sinks.onAmbiguousAlignment, fieldIndex + offset),
    (fieldIndex) => report(sinks.onAlignmentShiftedFields, fieldIndex + offset),
  );
  const fields = rawFields.map((raw, fieldIndex) =>
    toField(raw, d, sinks, fieldIndex + offset, freeze),
  );
  return freeze ? (Object.freeze(fields) as AstmField[]) : fields;
}

/**
 * The body of {@link tokenizeHeader}, with the same `freeze` switch as {@link tokenizeFields}.
 *
 * @internal
 */
export function tokenizeHeaderFields(
  record: string,
  d: Delimiters,
  sinks: FieldSinks,
  freeze: boolean,
): AstmField[] {
  // The delimiter-definition field runs from index 2 to the next field separator.
  const defEnd = record.indexOf(d.field, 2);
  const definition = defEnd === -1 ? record.slice(2) : record.slice(2, defEnd);
  const head = [
    opaqueField(record.slice(0, Math.min(1, record.length)), freeze),
    opaqueField(definition, freeze),
  ];
  // Data fields start at whole-record index 2, so the tokenizer's local index is shifted by 2.
  const fields =
    defEnd === -1
      ? head
      : [...head, ...tokenizeFields(record.slice(defEnd + 1), d, sinks, 2, freeze)];
  return freeze ? (Object.freeze(fields) as AstmField[]) : fields;
}

/** A field whose text is structural, not data: surfaced verbatim as one component, never decoded. */
function opaqueField(raw: string, freeze: boolean): AstmField {
  if (!freeze) return { raw, components: [raw], repeats: [[raw]] };
  return Object.freeze({
    raw,
    components: Object.freeze([raw]),
    repeats: Object.freeze([Object.freeze([raw])]),
  });
}

/** Build one {@link AstmField} from its raw wire text: split into repeats → components, then decode. */
function toField(
  raw: string,
  d: Delimiters,
  sinks: FieldSinks,
  fieldIndex: number,
  freeze: boolean,
): AstmField {
  // A field with no repeat delimiter, no component delimiter and no escape character is one repeat
  // of one component, its own text: the splits below would each hand back the whole text and report
  // nothing, since every report needs an escape character, and the decode would return it as is.
  if (!raw.includes(d.repeat) && !raw.includes(d.component) && !raw.includes(d.escape)) {
    if (!freeze) {
      const components = [raw];
      return { raw, components, repeats: [components] };
    }
    if (raw.length === 0) return EMPTY_FIELD;
    const components = Object.freeze([raw]);
    return Object.freeze({ raw, components, repeats: Object.freeze([components]) });
  }
  const onUnknownEscape = (): void => report(sinks.onUnknownEscape, fieldIndex);
  const onUnpairedEscape = (): void => report(sinks.onUnpairedEscape, fieldIndex);
  const onSwallowedDelimiter = (): void => report(sinks.onSwallowedDelimiter, fieldIndex);
  const onAmbiguousAlignment = (): void => report(sinks.onAmbiguousAlignment, fieldIndex);
  // The repeat split runs INSIDE one field, so the index it hands back is a repeat index and is
  // discarded: what a caller needs is which field carries the contested boundary, and that is
  // `fieldIndex`. Likewise for the component split, which runs inside one repeat of one field: the
  // index it hands back is a component index and is discarded for the same reason.
  const onAlignmentTruncatedField = (): void => report(sinks.onAlignmentTruncatedField, fieldIndex);
  const onAlignmentShiftedComponents = (): void =>
    report(sinks.onAlignmentShiftedComponents, fieldIndex);
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
  // component after the gained boundary moves along the component list, because `components` IS a component
  // list. So a Universal Test ID's coding scheme and local code, and a patient name's given and
  // middle parts, are read out of positions the competing alignment does not put them in. Unlike
  // the repeat case EVERY gained boundary at or before the LAST MODELED COMPONENT INDEX moves
  // those slots, not only the first, because the shift propagates to the end of the list. Two
  // bounds run the other way and it fires inside both, over-reporting and never under: past the
  // last modeled index nothing NAMED moves (a name models three components, a UTID four), and
  // inside a LATER repeat nothing modeled moves at all, since `components` is `repeats[0]`.
  const rawRepeats = splitEscapeAware(
    raw,
    d.repeat,
    d.escape,
    onAmbiguousAlignment,
    undefined,
    onAlignmentTruncatedField,
  );
  const repeats = rawRepeats.map((rep) => {
    const components = splitEscapeAware(
      rep,
      d.component,
      d.escape,
      onAmbiguousAlignment,
      undefined,
      undefined,
      onAlignmentShiftedComponents,
    ).map((comp) =>
      decodeEscapes(comp, d, onUnknownEscape, onUnpairedEscape, onSwallowedDelimiter),
    );
    return freeze ? Object.freeze(components) : components;
  });
  // `splitEscapeAware` always returns at least one element, so `repeats[0]` is defined.
  /* v8 ignore next -- every return path of splitEscapeAware yields at least one segment, so repeats[0] is set */
  const components = repeats[0] ?? [""];
  if (!freeze) return { raw, components, repeats };
  return Object.freeze({ raw, components, repeats: Object.freeze(repeats) });
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
