/**
 * The record-layer **emit** side: {@link serializeAstmRecords}.
 *
 * The inverse of `parseAstmRecords`. Where the parser is liberal (vendor quirks
 * become warnings), the serializer is **conservative**: it always emits a
 * spec-clean stream with the **canonical** delimiter set (`H|\^&`), re-escapes
 * every embedded delimiter so an embedded `|`/`^`/`\`/`&` in a value can never
 * break framing (the exact inverse of the escape codec), and terminates
 * each record with a `CR`.
 *
 * **Round-trip.** `parseAstmRecords(serializeAstmRecords(msg))` reproduces the modeled
 * records — the same components, the same typed accessors, and the canonical delimiter
 * set (a non-canonical source is normalized to `H|\^&` by default).
 *
 * **One delimiter set for the whole stream.** Every record — including `H`, `M` and `S` —
 * is emitted against the delimiters being emitted with, and the header declares that same
 * set. `M` and `S` carry vendor free-form data and are reproduced **byte-for-byte** from
 * their preserved `rawLine` whenever a reader using those delimiters would recover exactly
 * the fields they model, which is the case for any stream already in the emit delimiter
 * set. When it is not — the record arrived under one delimiter set and is being emitted
 * under another — the record is re-encoded from its decoded tree instead, so its fields
 * survive as fields rather than collapsing into one on the next read.
 *
 * **Emit follows the model.** Every record type, `H` included, is emitted from its decoded
 * `AstmField.repeats` tree, so an edit to a record's `fields` is reflected on emit. The one
 * part of a record that is never taken from the model is the header's delimiter
 * declaration: it always states the delimiters actually in use.
 *
 * **Never break framing.** A component leaf that contains a record terminator
 * (`CR`/`LF`) cannot be escaped by the ASTM escape codec (only the four declared
 * delimiters have mnemonics), so emitting it would silently corrupt the wire.
 * The serializer refuses: an embedded `CR`/`LF` is a typed {@link AstmSerializeError},
 * never emitted raw.
 */

import { CANONICAL_DELIMITERS, type Delimiters } from "../common/delimiters.js";
import { tokenizeRecord } from "./tokenize.js";
import type {
  AstmField,
  AstmMessage,
  AstmRecord,
  HeaderRecord,
  ManufacturerRecord,
  ScientificRecord,
} from "./types.js";

/**
 * Thrown by the record/frame emit side when a value cannot be serialized into a
 * spec-clean stream — specifically when a component contains a record terminator
 * (`CR`/`LF`), which the ASTM escape codec cannot encode and which would break
 * framing if emitted raw. Carries a stable code + positional context, never the
 * offending value (PHI discipline).
 *
 * @example
 * ```ts
 * import { serializeAstmRecord, AstmSerializeError, parseAstmRecords } from "@cosyte/astm";
 * const rec = parseAstmRecords("H|\\^&\rL|1\r").records[1]!;
 * try {
 *   serializeAstmRecord(rec);
 * } catch (err) {
 *   if (err instanceof AstmSerializeError) err.code; // "ASTM_EMIT_UNENCODABLE_VALUE"
 * }
 * ```
 */
export class AstmSerializeError extends Error {
  /** Stable discriminant; `ASTM_EMIT_UNENCODABLE_VALUE` for a `CR`/`LF` in a value. */
  public readonly code: "ASTM_EMIT_UNENCODABLE_VALUE";
  /** 0-based ordinal of the record within the message, when known. */
  public readonly recordIndex?: number;
  /** @internal */
  public constructor(message: string, recordIndex?: number) {
    super(message);
    this.name = "AstmSerializeError";
    this.code = "ASTM_EMIT_UNENCODABLE_VALUE";
    if (recordIndex !== undefined) this.recordIndex = recordIndex;
  }
}

/**
 * Escape-encode one component leaf for spec-clean emit — the inverse of
 * `decodeEscapes`. The **escape character itself is encoded first** (`&` → `&E&`)
 * so a later delimiter substitution can never double-encode the `&` it just
 * introduced; then the field / component / repeat delimiters map to their
 * mnemonics.
 *
 * A `CR`/`LF` in the leaf has no escape mnemonic and would break framing, so it
 * is rejected with an {@link AstmSerializeError} rather than emitted raw.
 *
 * @param leaf - One already-decoded component string.
 * @param d - The delimiters to emit against (canonical for spec-clean output).
 * @param recordIndex - The enclosing record's index, for error context.
 * @returns The escaped component text.
 * @example
 * ```ts
 * import { encodeComponent, CANONICAL_DELIMITERS } from "@cosyte/astm";
 * encodeComponent("1^40", CANONICAL_DELIMITERS); // "1&S&40"
 * ```
 */
export function encodeComponent(leaf: string, d: Delimiters, recordIndex?: number): string {
  if (leaf.includes("\r") || leaf.includes("\n")) {
    throw new AstmSerializeError(
      "A value contains a record terminator (CR/LF), which cannot be escaped without breaking framing.",
      recordIndex,
    );
  }
  // Escape the escape char first, then the three structural delimiters.
  return leaf
    .split(d.escape)
    .join(d.escape + "E" + d.escape)
    .split(d.field)
    .join(d.escape + "F" + d.escape)
    .split(d.component)
    .join(d.escape + "S" + d.escape)
    .split(d.repeat)
    .join(d.escape + "R" + d.escape);
}

/** Encode one field from its decoded repeat/component tree, re-escaping each leaf. */
function encodeField(
  repeats: readonly (readonly string[])[],
  d: Delimiters,
  recordIndex?: number,
): string {
  return repeats
    .map((rep) => rep.map((c) => encodeComponent(c, d, recordIndex)).join(d.component))
    .join(d.repeat);
}

/**
 * Serialize a single ASTM record to its spec-clean wire text (no trailing
 * terminator). Emits with the given delimiters, defaulting to the canonical set.
 *
 * The header (`H`) is special-cased: its delimiter-definition field is emitted as
 * the **literal** declaration of `d`, never escaped — escaping it would corrupt the
 * very declaration a reader depends on. Manufacturer (`M`) and scientific (`S`)
 * records are reproduced **byte-identically** from their preserved `rawLine` when
 * they are already in `d`, and re-encoded from their fields when they are not, so
 * their fields never collapse into one on the next read.
 *
 * @param record - The record to serialize.
 * @param d - The delimiters to emit against; defaults to `H|\^&`.
 * @returns The record's wire text, terminator excluded.
 * @throws {@link AstmSerializeError} when a component contains an unencodable `CR`/`LF`.
 * @example
 * ```ts
 * import { serializeAstmRecord, parseAstmRecords } from "@cosyte/astm";
 * const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
 * serializeAstmRecord(msg.records[1]!); // "R|1|^^^687|28.6|U/L||N||F"
 * ```
 */
export function serializeAstmRecord(
  record: AstmRecord,
  d: Delimiters = CANONICAL_DELIMITERS,
): string {
  if (record.type === "M" || record.type === "S") return serializeVerbatimRecord(record, d);

  if (record.type === "H") return serializeHeader(record, d);

  return record.fields.map((f) => encodeField(f.repeats, d, record.recordIndex)).join(d.field);
}

/**
 * Serialize an `M` (manufacturer) or `S` (scientific) record — the two vendor
 * free-form types the parser surfaces byte-for-byte.
 *
 * These records are re-emitted **verbatim from `rawLine` when, and only when, a
 * reader using the emit delimiters would recover exactly the fields the record
 * models**. When it would not — the record arrived under one delimiter set and
 * is being emitted under another — the record is re-encoded from its decoded
 * field tree instead, like every other record type.
 *
 * The choice being made here, and why. A blanket verbatim re-emit produced a
 * **mixed-delimiter stream**: the header declared one delimiter set while the
 * `M`/`S` rows still carried another, so re-parsing the output silently
 * collapsed every field of those rows into one, with no warning. On the
 * analyzer-to-LIS path a collapsed field is a lost result or a lost
 * patient/specimen identifier, and the caller had no signal. The two candidate
 * fixes were to re-encode the disagreeing records, or to refuse/warn on a
 * message whose records disagree. Re-encoding is chosen because (1) it is what
 * the serializer already promises — one spec-clean stream in the declared
 * delimiter set, and a mixed-delimiter stream is not spec-clean; (2) emit
 * returns a string and has no warning channel, so a warning could only be
 * ignored while the corrupt stream still shipped, and a refusal would reject
 * messages this library successfully parsed; and (3) the guard above means bytes
 * change for exactly the streams that were being corrupted and for no others.
 * The invariant that must hold either way is that a round-trip never silently
 * loses a field, in either direction.
 */
function serializeVerbatimRecord(
  record: ManufacturerRecord | ScientificRecord,
  d: Delimiters,
): string {
  if (recoversVerbatim(record, d)) return record.rawLine;
  return record.fields.map((f) => encodeField(f.repeats, d, record.recordIndex)).join(d.field);
}

/**
 * Whether re-tokenizing `record.rawLine` with the emit delimiters recovers the
 * exact field tree the record already models. True whenever the record's own
 * delimiters agree with the emit set (the ordinary case, where the raw bytes are
 * reproduced untouched), and true as well when the line simply contains no
 * delimiter either set would split on.
 */
function recoversVerbatim(record: ManufacturerRecord | ScientificRecord, d: Delimiters): boolean {
  return sameFieldTree(tokenizeRecord(record.rawLine, d), record.fields);
}

/** Structural equality over two tokenized field trees, compared on decoded values. */
function sameFieldTree(a: readonly AstmField[], b: readonly AstmField[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((fieldA, i) => {
    const fieldB = b[i];
    if (fieldB === undefined) return false;
    if (fieldA.repeats.length !== fieldB.repeats.length) return false;
    return fieldA.repeats.every((repA, r) => {
      const repB = fieldB.repeats[r];
      if (repB === undefined || repA.length !== repB.length) return false;
      return repA.every((comp, c) => comp === repB[c]);
    });
  });
}

/**
 * Serialize an `H` (header) record. The delimiter declaration is emitted as the
 * **literal** declaration of the delimiters being emitted against, never escaped
 * and never taken from the model — a header that declares one delimiter set
 * while the records around it use another is the exact corruption this module
 * refuses to produce. Every data field (field 3 onward) is emitted from the
 * header's tokenized {@link HeaderRecord.fields}, so an edit to the model is
 * reflected on emit, like every other record type.
 */
function serializeHeader(header: HeaderRecord, d: Delimiters): string {
  const head = "H" + d.field + d.repeat + d.component + d.escape;
  // fields[0] is the type letter and fields[1] is the delimiter declaration, both regenerated
  // above; the ASTM data fields start at fields[2]. No data fields ⇒ a bare `H|\^&`.
  const dataFields = header.fields.slice(2);
  const rest = dataFields
    .map((f) => d.field + encodeField(f.repeats, d, header.recordIndex))
    .join("");
  return head + rest;
}

/**
 * Serialize a whole ASTM message (or a bare record list) to a spec-clean,
 * `CR`-terminated record stream — the inverse of `parseAstmRecords`.
 *
 * Emit is **conservative**: the canonical `H|\^&` delimiters, every embedded
 * delimiter re-escaped, each record closed with a `CR`. A message parsed with
 * non-canonical delimiters is **normalized** to the canonical set on emit — every
 * record, `M` and `S` included, so the emitted stream is in one delimiter set and
 * re-parsing it recovers every field. Passing `d` explicitly emits against that set
 * instead, and the header declares it.
 *
 * @param input - A parsed {@link AstmMessage} or a list of {@link AstmRecord}s.
 * @param d - The delimiters to emit against; defaults to the canonical `H|\^&` set.
 * @returns The serialized record stream (`CR` after every record).
 * @throws {@link AstmSerializeError} when a component contains an unencodable `CR`/`LF`.
 * @example
 * ```ts
 * import { parseAstmRecords, serializeAstmRecords } from "@cosyte/astm";
 * const raw = "H|\\^&\rP|1\rR|1|^^^687|28.6|U/L||N||F\rL|1\r";
 * serializeAstmRecords(parseAstmRecords(raw)); // === raw
 * ```
 */
export function serializeAstmRecords(
  input: AstmMessage | readonly AstmRecord[],
  d: Delimiters = CANONICAL_DELIMITERS,
): string {
  const records: readonly AstmRecord[] = Array.isArray(input)
    ? (input as readonly AstmRecord[])
    : (input as AstmMessage).records;
  return records.map((r) => serializeAstmRecord(r, d) + "\r").join("");
}

/**
 * Serialize a single {@link AstmField} to its spec-clean wire text, re-escaping
 * each component. A low-level helper for callers assembling a field outside a
 * whole record.
 *
 * @param field - The field to serialize.
 * @param d - The delimiters to emit against; defaults to `H|\^&`.
 * @returns The escaped field text.
 * @example
 * ```ts
 * import { serializeField, tokenizeRecord, CANONICAL_DELIMITERS } from "@cosyte/astm";
 * const fields = tokenizeRecord("R|1|^^^687|1&S&40", CANONICAL_DELIMITERS);
 * serializeField(fields[3]!); // "1&S&40"
 * ```
 */
export function serializeField(field: AstmField, d: Delimiters = CANONICAL_DELIMITERS): string {
  return encodeField(field.repeats, d);
}
