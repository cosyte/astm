/**
 * The record-layer **emit** side: {@link serializeAstmRecords} — Phase 7.
 *
 * The inverse of `parseAstmRecords`. Where the parser is liberal (vendor quirks
 * become warnings), the serializer is **conservative**: it always emits a
 * spec-clean stream with the **canonical** delimiter set (`H|\^&`), re-escapes
 * every embedded delimiter so an embedded `|`/`^`/`\`/`&` in a value can never
 * break framing (the exact inverse of the Phase-1 escape codec), and terminates
 * each record with a `CR`.
 *
 * **Round-trip by construction.** Serialization emits from a record's **decoded**
 * component tree (`AstmField.repeats`) and re-escapes each leaf, so
 * `parseAstmRecords(serializeAstmRecords(msg))` reproduces the same modelled
 * fields — the same components, the same typed accessors, and the canonical
 * delimiter set (a non-canonical source is normalized to `H|\^&`, a documented
 * Phase-7 behavior; round-tripping a vendor's own delimiters is a Phase-8
 * profile concern).
 *
 * **Never break framing.** A component leaf that contains a record terminator
 * (`CR`/`LF`) cannot be escaped by the ASTM escape codec (only the four declared
 * delimiters have mnemonics), so emitting it would silently corrupt the wire.
 * The serializer refuses: an embedded `CR`/`LF` is a typed {@link AstmSerializeError},
 * never emitted raw.
 */

import { CANONICAL_DELIMITERS, type Delimiters } from "../common/delimiters.js";
import { tokenizeRecord } from "./tokenize.js";
import type { AstmField, AstmMessage, AstmRecord, HeaderRecord } from "./types.js";

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
 * the **literal** canonical declaration (`\^&`), never escaped — escaping it would
 * corrupt the very declaration a reader depends on. Manufacturer (`M`) and
 * scientific (`S`) records are surfaced **byte-identically** from their preserved
 * `rawLine` — verbatim in, verbatim out.
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
  // M / S records are surfaced verbatim on the wire — re-emit their exact bytes.
  if (record.type === "M" || record.type === "S") return record.rawLine;

  if (record.type === "H") return serializeHeader(record, d);

  return record.fields.map((f) => encodeField(f.repeats, d, record.recordIndex)).join(d.field);
}

/**
 * Serialize an `H` (header) record. The delimiter declaration is emitted as the
 * **literal** canonical set (`\^&`), never escaped. The header's data fields
 * (field 3 onward) are reconstructed from {@link HeaderRecord.rawLine} rather than
 * its tokenized {@link HeaderRecord.fields} — the escape character appearing
 * literally in the delimiter-definition field defeats the generic escape-aware
 * split, so the raw header is the reliable source. They are re-tokenized with the
 * header's own declared delimiters and re-emitted against the canonical set.
 */
function serializeHeader(header: HeaderRecord, d: Delimiters): string {
  const head = "H" + d.field + d.repeat + d.component + d.escape;
  const src = header.delimiters;
  // The delimiter-definition field runs from index 2 to the next field separator; the header's data
  // portion begins one byte past it. No trailing separator ⇒ a bare `H|\^&` with no data fields.
  const defEnd = header.rawLine.indexOf(src.field, 2);
  if (defEnd === -1) return head;
  const dataPortion = header.rawLine.slice(defEnd + 1);
  const dataFields = tokenizeRecord(dataPortion, src);
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
 * non-canonical delimiters is **normalized** to the canonical set on emit (a
 * documented Phase-7 behavior — vendor-delimiter round-tripping is Phase 8).
 *
 * @param input - A parsed {@link AstmMessage} or a list of {@link AstmRecord}s.
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
