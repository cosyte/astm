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
 * records: the same components, the same typed accessors, and the canonical delimiter
 * set (a non-canonical source is normalized to `H|\^&` by default). Normalizing sets the
 * four delimiter **roles**; it does not delete a declaration's surplus characters, so a
 * canonically-declared header that arrived carrying surplus keeps it on the default path
 * too.
 *
 * **One delimiter set for the whole stream.** Every record (including `H`, `M` and `S`)
 * is emitted against the delimiters being emitted with, and the header declares that same
 * set. `M` and `S` carry vendor free-form data and are reproduced **byte-for-byte** from
 * their preserved `rawLine` whenever a reader using those delimiters would recover exactly
 * the fields they model, which is the case for any stream already in the emit delimiter
 * set. When it is not, the record arrived under one delimiter set and is being emitted
 * under another, the record is re-encoded from its decoded tree instead, so its fields
 * survive as fields rather than collapsing into one on the next read.
 *
 * **Emit follows the model.** Every record type, `H` included, is emitted from its decoded
 * `AstmField.repeats` tree, so an edit to a record's `fields` is reflected on emit. The one
 * part of a record that is never taken from the model is the header's delimiter
 * declaration, and only in the three positions that carry a role: those always state the
 * repeat, component and escape characters actually in use, whatever the model says. Any
 * further characters the declaration carried, a reader assigns them no role, come from
 * the model like everything else, so a header that arrived as `H|\^&#` goes back out as
 * `H|\^&#` rather than losing the `#`. That holds on the **default** canonical path as
 * well as when a set is passed explicitly: the surplus of a canonically-declared header
 * survives normalization, because normalization is about the four roles and the surplus
 * has none.
 *
 * **Never break framing.** A component leaf that contains a record terminator
 * (`CR`/`LF`) cannot be escaped by the ASTM escape codec (only the four declared
 * delimiters have mnemonics), so emitting it would silently corrupt the wire.
 * The serializer refuses: an embedded `CR`/`LF` is a typed {@link AstmSerializeError},
 * never emitted raw.
 *
 * **A value keeps the bytes the *frame* layer reserves, on purpose.** `STX`, `ETB`
 * and `ETX` are deliberately **not** refused here. They break a record only once it
 * is framed, and this layer returns a `string`, which is not yet on any wire: a
 * consumer on a raw transport, which is a real ASTM deployment this library models
 * (`detectFraming`), gets such a value back byte for byte through parse and emit,
 * measured on every modeled value. Refusing it here would take a
 * byte the caller genuinely supplied away from consumers who never frame anything.
 * `composeAstmFrames` is the total gate on the framed route, including through
 * `serializeFramedAstm`, and refuses it there (`ASTM_FRAME_RESERVED_BYTE`).
 * `CR`/`LF` are different: they end a *record*, so they corrupt this layer's own
 * output, which is why they are refused at this one.
 *
 * **One position is not a modeled value and does not keep the byte:** the surplus
 * of a header's delimiter declaration, where any control character is dropped
 * silently (see `declarationResidual` below, where that disposition is argued and
 * where it long predates the frame-layer refusal). So "the record layer carries
 * these bytes" is a statement about values, not about every byte of every line.
 *
 * **Check the delimiter set before writing.** Three conditions are required for the
 * emitted bytes to read back as the records that produced them (each separator exactly
 * one character, no separator a `CR`/`LF`, no two separators the same character) and a
 * set failing any of them is a typed {@link AstmSerializeError}
 * (`ASTM_EMIT_INVALID_DELIMITERS`) rather than output this library's own parser would
 * reject or silently re-read with a different field tree. These are conditions on the
 * **set alone**, so they are not a readback guarantee on their own: a set can pass all
 * three and still collide with a particular record's type letter, which is why that is
 * checked per record, on the bytes actually written
 * (`ASTM_EMIT_TYPE_LETTER_COLLISION`, see {@link assertTypeLetterSurvives}).
 *
 * **What is still not guaranteed.** Together the two checks guarantee that every
 * record re-reads as its own *type*. They do not guarantee that every *field* of it
 * lands where it did: an escape sequence whose body is itself a delimiter is read as
 * one opaque atom, so that delimiter never becomes a boundary and the fields after it
 * shift. That is reported on the parse side (`ASTM_UNKNOWN_ESCAPE_SEQUENCE`) and is
 * not what these refusals cover.
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
 * spec-clean stream: specifically when a component contains a record terminator
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
  /**
   * Stable discriminant. `ASTM_EMIT_UNENCODABLE_VALUE` for a `CR`/`LF` in a value;
   * `ASTM_EMIT_INVALID_DELIMITERS` for a delimiter set that cannot be emitted
   * reversibly.
   */
  public readonly code: AstmSerializeErrorCode;
  /** 0-based ordinal of the record within the message, when known. */
  public readonly recordIndex?: number;
  /** @internal */
  public constructor(
    message: string,
    recordIndex?: number,
    code: AstmSerializeErrorCode = "ASTM_EMIT_UNENCODABLE_VALUE",
  ) {
    super(message);
    this.name = "AstmSerializeError";
    this.code = code;
    if (recordIndex !== undefined) this.recordIndex = recordIndex;
  }
}

/**
 * The reasons emit refuses rather than writing a stream that cannot be read back.
 *
 * - `ASTM_EMIT_UNENCODABLE_VALUE`: a component holds a record terminator
 *   (`CR`/`LF`), which the escape codec has no mnemonic for.
 * - `ASTM_EMIT_INVALID_DELIMITERS`: the delimiter set to emit against failed one
 *   of the three conditions readback requires (see {@link serializeAstmRecords}).
 *   Those conditions are checked against the *set alone*, so this code means a
 *   set was rejected, not that every unreversible set is.
 * - `ASTM_EMIT_TYPE_LETTER_COLLISION`: this record's type letter would not be the
 *   first character of its own emitted line, so the record would read back as a
 *   **different** record. Raised per record rather than per set, because whether
 *   a set collides depends on which record is being written.
 *
 * @example
 * ```ts
 * import type { AstmSerializeErrorCode } from "@cosyte/astm";
 * const code: AstmSerializeErrorCode = "ASTM_EMIT_INVALID_DELIMITERS";
 * ```
 */
export type AstmSerializeErrorCode =
  | "ASTM_EMIT_UNENCODABLE_VALUE"
  | "ASTM_EMIT_INVALID_DELIMITERS"
  | "ASTM_EMIT_TYPE_LETTER_COLLISION";

/**
 * The three conditions a delimiter set must meet for emit to be reversible, in
 * the order they are checked. Each is a way the emitted bytes would otherwise
 * fail to read back as the records that produced them.
 */
const DELIMITER_ROLES = ["field", "repeat", "component", "escape"] as const;

/**
 * Any C0 control character or `DEL`. Both the record layer and the frame layer
 * reserve characters from this range as structure (`CR`/`LF` end a record,
 * `STX`/`ETX`/`ETB` bound a frame) so none of them is ever carried through as
 * inert text.
 */
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/**
 * Refuse a delimiter set that cannot round-trip, before any bytes are written.
 *
 * **Why this refuses instead of warning.** Emit returns a bare `string` and has
 * no warning channel, so a warning here could only ever be ignored while the
 * unreadable stream still shipped. The three rules below are not style: each one
 * names a case where the emitted bytes provably do not read back as the records
 * that produced them, and every one of them was silent before, two of the six
 * shapes measured emitted a stream this library's own parser then re-read with a
 * **different** field tree and **no** warning at all, and the rest emitted a
 * stream it rejected outright. Refusing at the call is the only disposition that
 * reaches the caller.
 *
 * 1. **Each delimiter is exactly one character.** The reader takes each role from
 *    a single position in the header's declaration, so a multi-character
 *    separator is written but can never be read; an empty one matches everywhere
 *    and shreds the values themselves.
 * 2. **No delimiter is a record terminator.** A `CR`/`LF` separator ends the
 *    record instead of dividing it, truncating the stream.
 * 3. **The four are mutually distinct.** Two roles sharing a character makes the
 *    boundary between them unrecoverable: a two-repeat field emitted with
 *    `repeat` equal to `component` reads back as one repeat of two components,
 *    losing structure with nothing to signal it.
 *
 * This is stricter than what the **parser** tolerates: a header may declare a set
 * where, say, `repeat` and `component` are the same character, and that stream
 * parses. Emitting against such a set is what cannot be undone, so a caller who
 * passes one through (`serializeAstmRecords(msg, msg.delimiters)` on such a
 * stream) now gets a typed error where it previously got silently lossy bytes.
 * That is a deliberate narrowing on a published package: the input it turns away
 * is exactly the input it was corrupting.
 *
 * **What this does not cover, and where the rest of it lives now.** These three
 * rules read the delimiter set and nothing else, so they cannot see a collision
 * that depends on *which record* is being written: a separator equal to a record's
 * type letter (`field` of `R`) satisfies all three and still escapes that letter
 * away. That is checked per record instead, against the bytes actually produced,
 * by {@link assertTypeLetterSurvives} (`ASTM_EMIT_TYPE_LETTER_COLLISION`). Keep
 * the two apart: this one answers "could any record survive this set", and a
 * caller of {@link encodeComponent} or {@link serializeField}, which hold no
 * record, gets only this one.
 *
 * The error never echoes the offending characters. A caller-supplied "delimiter"
 * that fails rule 1 can be arbitrary text, so quoting it back into a message
 * risks putting data into a log; naming the role is enough to fix the call.
 */
function assertEmittableDelimiters(d: Delimiters, recordIndex?: number): void {
  const invalid = (reason: string): never => {
    throw new AstmSerializeError(
      `Cannot emit against these delimiters: ${reason}.`,
      recordIndex,
      "ASTM_EMIT_INVALID_DELIMITERS",
    );
  };

  // A caller reaching this from JavaScript can pass `null` where the types demand a
  // set, and `null` does not take the default parameter the way `undefined` does.
  // Checked first so that case is the documented typed error too.
  if (typeof d !== "object" || d === null) {
    invalid("a delimiter set is required");
  }

  for (const role of DELIMITER_ROLES) {
    // The same caller can omit a member or pass a non-string. Checked before
    // `.length` so that case is the same typed error as any other unusable set,
    // rather than a `TypeError` from inside the serializer.
    const char: unknown = d[role];
    if (typeof char !== "string" || char.length !== 1) {
      invalid(`the ${role} delimiter must be exactly one character`);
    }
    if (char === "\r" || char === "\n") {
      invalid(`the ${role} delimiter must not be a record terminator (CR/LF)`);
    }
  }

  DELIMITER_ROLES.forEach((a, i) => {
    for (const b of DELIMITER_ROLES.slice(i + 1)) {
      if (d[a] === d[b]) {
        invalid(`the ${a} and ${b} delimiters must not be the same character`);
      }
    }
  });
}

/**
 * Escape-encode one component leaf for spec-clean emit: the inverse of
 * `decodeEscapes`. The **escape character itself is encoded first** (`&` → `&E&`)
 * so a later delimiter substitution can never double-encode the `&` it just
 * introduced; then the field / component / repeat delimiters map to their
 * mnemonics.
 *
 * A `CR`/`LF` in the leaf has no escape mnemonic and would break framing, so it
 * is rejected with an {@link AstmSerializeError} rather than emitted raw, as is a
 * delimiter set the result could not be read back with.
 *
 * @param leaf - One already-decoded component string.
 * @param d - The delimiters to emit against (canonical for spec-clean output).
 * @param recordIndex - The enclosing record's index, for error context.
 * @returns The escaped component text.
 * @throws {@link AstmSerializeError} for a `CR`/`LF` in the leaf
 *   (`ASTM_EMIT_UNENCODABLE_VALUE`), or for a delimiter set failing one of the
 *   three conditions readback requires (`ASTM_EMIT_INVALID_DELIMITERS`). This
 *   helper takes a leaf and no record, so it never raises
 *   `ASTM_EMIT_TYPE_LETTER_COLLISION`: a caller assembling a record line out of it
 *   is outside that check and gets no guarantee that a type letter survives.
 * @example
 * ```ts
 * import { encodeComponent, CANONICAL_DELIMITERS } from "@cosyte/astm";
 * encodeComponent("1^40", CANONICAL_DELIMITERS); // "1&S&40"
 * ```
 */
export function encodeComponent(leaf: string, d: Delimiters, recordIndex?: number): string {
  assertEmittableDelimiters(d, recordIndex);
  return encodeLeaf(leaf, d, recordIndex);
}

/**
 * The escape encoder proper, for callers that have already checked `d`. Kept
 * separate so the delimiter check runs once per public call rather than once per
 * component leaf.
 */
function encodeLeaf(leaf: string, d: Delimiters, recordIndex?: number): string {
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
    .map((rep) => rep.map((c) => encodeLeaf(c, d, recordIndex)).join(d.component))
    .join(d.repeat);
}

/**
 * Serialize a single ASTM record to its spec-clean wire text (no trailing
 * terminator). Emits with the given delimiters, defaulting to the canonical set.
 *
 * The header (`H`) is special-cased: its delimiter-definition field is emitted as
 * the **literal** declaration of `d`, never escaped, escaping it would corrupt the
 * very declaration a reader depends on, followed by any characters the modeled
 * declaration carried beyond the three a reader takes its roles from. Manufacturer
 * (`M`) and scientific (`S`) records are reproduced **byte-identically** from their
 * preserved `rawLine` when they are already in `d`, and re-encoded from their fields
 * when they are not, so their fields never collapse into one on the next read.
 *
 * @param record - The record to serialize.
 * @param d - The delimiters to emit against; defaults to `H|\^&`.
 * @returns The record's wire text, terminator excluded.
 * @throws {@link AstmSerializeError} when a component contains an unencodable `CR`/`LF`
 *   (`ASTM_EMIT_UNENCODABLE_VALUE`), when `d` fails one of the three conditions
 *   readback requires (`ASTM_EMIT_INVALID_DELIMITERS`), or when this record's type
 *   letter would not be the first character of its own emitted line
 *   (`ASTM_EMIT_TYPE_LETTER_COLLISION`), which would make it read back as a
 *   different record.
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
  assertEmittableDelimiters(d, record.recordIndex);
  return serializeRecordChecked(record, d);
}

/** {@link serializeAstmRecord} for callers that have already checked `d`. */
function serializeRecordChecked(record: AstmRecord, d: Delimiters): string {
  return assertTypeLetterSurvives(serializeRecordText(record, d), record);
}

/** The emitted wire text, before the type-letter readback check. */
function serializeRecordText(record: AstmRecord, d: Delimiters): string {
  if (record.type === "M" || record.type === "S") return serializeVerbatimRecord(record, d);

  if (record.type === "H") return serializeHeader(record, d);

  return record.fields.map((f) => encodeField(f.repeats, d, record.recordIndex)).join(d.field);
}

/**
 * The letter this record must re-read as: `record.type` for every modeled type,
 * and the verbatim wire letter for an unsupported one. It is the same datum the
 * parser reads (the first character of the line) and the same datum every warning
 * already carries as its `recordType` position, so it is structural rather than a
 * value, and naming it in an error message puts no data into a log.
 */
function recordTypeLetter(record: AstmRecord): string {
  return record.type === "unsupported" ? record.rawType : record.type;
}

/**
 * Refuse a record whose **type letter would not survive its own emit**.
 *
 * **The condition is derived from the reader, and it is checked on the output
 * rather than on the delimiter set.** `parseAstmRecords` takes a record's type
 * from `line.charAt(0)`, before any delimiter-driven tokenization runs, so the
 * one thing emit has to guarantee is that the first character it writes is the
 * letter the record models. Testing the bytes actually produced is what makes
 * this cover every route into them: it needs no list of which delimiter roles are
 * dangerous, and it cannot drift out of step with `encodeLeaf`.
 *
 * **What goes wrong without it.** A record's type letter is just another leaf to
 * {@link encodeComponent}, so a delimiter set naming that letter escapes it away:
 * an `R` record emitted with `field` = `R` goes out as `&F&R1R…` and re-reads as
 * an **unsupported** record, one result in and zero out of `results()`. Such a
 * set passes all three of {@link assertEmittableDelimiters}'s conditions (one
 * character each, no `CR`/`LF`, all four distinct), which is why those are
 * documented as conditions on the set and not as a readback guarantee.
 *
 * **The branch that decides the severity is the one where the record re-reads as
 * a different RECOGNIZED type, and it is silent.** `encodeLeaf` writes an escaped
 * character as `escape` + mnemonic + `escape`, so when the escape character is
 * itself a record type letter the escaped type letter *starts with a valid
 * letter*. Measured: a `P` record emitted with `field` = `P` and `escape` = `R`
 * comes back as an `R` record whose `value` is the patient's laboratory ID and
 * whose `units` are the practice-assigned one, `resultStatus` `F`, so `results()`
 * returns a **fabricated final result built out of patient identifiers**. No
 * unknown-type warning fires, because the letter that arrived is a real one. Over
 * a sweep of every delimiter role against every record type letter, across nine
 * record-set shapes, 750 emitted streams read back as something other than the
 * records that produced them and **303 of those were accepted by
 * `{ strict: true }`** under a profile the safety gate permits, carrying the same
 * `ASTM_NONSTANDARD_DELIMITERS` a *clean* non-canonical stream carries and
 * nothing else. That code is on the tolerable allow-list precisely because "a
 * record's type letter is the first character of its line" is read before
 * tokenization: true of the parse, and no protection at all when the emit is what
 * chose the character.
 *
 * **The escape role is exempt, measured rather than assumed.** A type letter that
 * equals the escape character encodes to `letter` + `E` + `letter`, whose first
 * character is the letter itself, so the record re-reads as its own type and its
 * type field decodes back to the letter. This check accepts it because the output
 * is correct, which is the advantage of testing the output.
 *
 * **What it does not reach**, stated rather than left to be found. It is a check
 * on the *type letter*, not a readback guarantee for the whole record: a set that
 * keeps every type letter can still shift a record's later fields, and
 * {@link encodeComponent} and {@link serializeField} take no record at all, so a
 * caller assembling a line out of those two is not covered by it.
 */
function assertTypeLetterSurvives(text: string, record: AstmRecord): string {
  const letter = recordTypeLetter(record);
  if (text.charAt(0) === letter) return text;
  throw new AstmSerializeError(
    `Cannot emit this ${letter} record against these delimiters: its type letter is not the ` +
      `first character of the emitted record, so the record would read back as a different record.`,
    record.recordIndex,
    "ASTM_EMIT_TYPE_LETTER_COLLISION",
  );
}

/**
 * Serialize an `M` (manufacturer) or `S` (scientific) record: the two vendor
 * free-form types the parser surfaces byte-for-byte.
 *
 * These records are re-emitted **verbatim from `rawLine` when, and only when, a
 * reader using the emit delimiters would recover exactly the fields the record
 * models**. When it would not, the record arrived under one delimiter set and
 * is being emitted under another, the record is re-encoded from its decoded
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
 * the serializer already promises: one spec-clean stream in the declared
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
 * Serialize an `H` (header) record. The three delimiter roles the declaration
 * carries are emitted as the **literal** declaration of the delimiters being
 * emitted against, never escaped and never taken from the model: a header that
 * declares one delimiter set while the records around it use another is the exact
 * corruption this module refuses to produce. Every data field (field 3 onward) is
 * emitted from the header's tokenized {@link HeaderRecord.fields}, so an edit to
 * the model is reflected on emit, like every other record type.
 *
 * Anything the declaration carried **beyond** those three characters is carried
 * through: see {@link declarationResidual}.
 */
function serializeHeader(header: HeaderRecord, d: Delimiters): string {
  const head = "H" + d.field + d.repeat + d.component + d.escape + declarationResidual(header, d);
  // fields[0] is the type letter and fields[1] is the delimiter declaration, both regenerated
  // above; the ASTM data fields start at fields[2]. No data fields ⇒ a bare `H|\^&`.
  const dataFields = header.fields.slice(2);
  const rest = dataFields
    .map((f) => d.field + encodeField(f.repeats, d, header.recordIndex))
    .join("");
  return head + rest;
}

/**
 * The bytes a header's delimiter declaration carries past the three it is read
 * for, `#` in a declaration of `\^&#`, and whether they can be re-emitted.
 *
 * Only three characters of the declaration have a role: repeat, component and
 * escape, taken by position. A vendor may still declare more, and the reader
 * ignores the surplus rather than refusing the stream. Emit used to regenerate
 * the declaration from the three roles alone, so those surplus bytes were
 * **dropped with no signal** and a header that arrived as `H|\^&#` went back out
 * as `H|\^&`.
 *
 * The disposition chosen here is to **preserve** them, not to refuse and not to
 * report. Refusing would reject a stream the parser reads without complaint, on
 * a published package, over bytes it has already decided are inert; reporting is
 * not available at all, because emit returns a bare string with no warning
 * channel. Preserving costs nothing and is the only one of the three that makes
 * the round-trip byte-exact. What the surplus *means* remains unresolved, the
 * clauses that would settle it are not in the freely published material and were
 * not read, but carrying bytes through unread is a strictly smaller claim than
 * deleting them, and it keeps emit aligned with a reader that scopes delimiters
 * forward from every header: the re-read declaration resolves to the same four
 * roles either way.
 *
 * They are dropped whenever they could not be read back as surplus, which is one
 * of two things. Either the modeled declaration no longer begins with the three
 * roles being emitted (the header is being transcoded into a different set, and
 * the surplus belonged to the old declaration) or the surplus is not inert on
 * the wire: it contains the field delimiter, or **any control character**.
 *
 * The control-character rule is wider than the record layer alone needs, and
 * deliberately so. A `CR`/`LF` would end the record and shift every data field
 * along, but this text is also handed to the **frame** layer by
 * `serializeFramedAstm`, where `STX`, `ETX` and `ETB` are structural too: a
 * surplus carrying one of those truncates the frame body, and re-reading the
 * framed stream then drops the whole header record (its sender, its receiver,
 * its control ID) behind nothing but a checksum warning. Rather than enumerate
 * the bytes each layer happens to reserve, and re-derive that list every time a
 * layer is added, no control character is carried at all. The cost is bytes that
 * were unprintable inside a declaration whose meaning is already unresolved.
 *
 * That reasoning has since been overtaken on the frame layer, and this rule is
 * the better of the two dispositions anyway: `composeAstmFrames` now **refuses** a
 * record carrying `STX`/`ETB`/`ETX` (`ASTM_FRAME_RESERVED_BYTE`) instead of
 * truncating a frame at it, so a surplus carried through would turn a spec-clean
 * header into a refused stream rather than a lost record. Dropping unreadable
 * bytes from a declaration whose surplus has no role keeps the emit writable.
 *
 * **What this rule does not reach**, stated rather than left to be discovered.
 * It is keyed on the *character*, so a surplus character above `U+00FF` passes
 * it: nothing in this rule's character classes matches one, and a control
 * character is not what it is. The frame layer is where that is settled now,
 * because that is where a string becomes bytes: `composeAstmFrames` refuses a
 * character with no single byte to stand for
 * (`ASTM_FRAME_UNENCODABLE_CHARACTER`) instead of truncating it to its low byte,
 * which used to let one land on `STX`/`ETX`/`ETB` and break framing, or on an
 * ordinary byte and alter the value in silence. A record-only emit
 * (`serializeAstmRecords`) still carries such a surplus through, and that is
 * deliberate: a returned `string` is not yet bytes and the caller may encode it
 * however their instrument does. Nor does refusing a control character *here*
 * imply one cannot be a **delimiter role**: only `CR`/`LF` are refused as
 * delimiters, so a set declaring `STX` as its component separator is still
 * accepted.
 *
 * Losing a field is a structural loss; dropping inert bytes is not.
 *
 * The surplus is read from `fields[1]`, the tokenized declaration, because
 * `fields` is the emit source for every record type: `rawLine` is provenance
 * and editing it has no effect on emit.
 */
function declarationResidual(header: HeaderRecord, d: Delimiters): string {
  const declaration = header.fields[1]?.raw ?? "";
  const roles = d.repeat + d.component + d.escape;
  if (!declaration.startsWith(roles)) return "";
  const residual = declaration.slice(roles.length);
  if (residual.includes(d.field) || CONTROL_CHARACTER.test(residual)) return "";
  return residual;
}

/**
 * Serialize a whole ASTM message (or a bare record list) to a spec-clean,
 * `CR`-terminated record stream: the inverse of `parseAstmRecords`.
 *
 * Emit is **conservative**: the canonical `H|\^&` delimiters, every embedded
 * delimiter re-escaped, each record closed with a `CR`. A message parsed with
 * non-canonical delimiters is **normalized** to the canonical set on emit: every
 * record, `M` and `S` included, so the emitted stream is in one delimiter set and
 * re-parsing it recovers every field. Passing `d` explicitly emits against that set
 * instead, and the header declares it. Normalization replaces the four delimiter
 * **roles**; a header declaration carrying characters beyond the three that hold a
 * role keeps them, on this path as on any other, rather than being truncated.
 *
 * **`d` is checked before anything is written.** Each of the four separators must be
 * exactly one character, none may be a record terminator, and no two may share a
 * character: otherwise the emitted bytes cannot be read back as the records that
 * produced them, and emit has no warning channel with which to say so. A set that
 * fails is an {@link AstmSerializeError} with code `ASTM_EMIT_INVALID_DELIMITERS`.
 * This is stricter than the parser, which reads some sets it cannot reverse, so
 * `serializeAstmRecords(msg, msg.delimiters)` can refuse a message that parsed:
 * in exactly the cases where it used to emit a stream that read back wrong.
 *
 * **And each record is checked against the set it is being written with.** Those
 * three conditions read the set alone, so they cannot see that `field` = `R`
 * escapes an `R` record's own type letter away. Every record's emitted line is
 * therefore checked to start with the letter the record models, and one that does
 * not is `ASTM_EMIT_TYPE_LETTER_COLLISION` rather than a stream that reads back as
 * different records. What neither check promises is that every *field* lands where
 * it did: an escape sequence whose body is a delimiter is an opaque atom, so that
 * delimiter never becomes a boundary, and the parse side reports that
 * (`ASTM_UNKNOWN_ESCAPE_SEQUENCE`) rather than emit refusing it.
 *
 * @param input - A parsed {@link AstmMessage} or a list of {@link AstmRecord}s.
 * @param d - The delimiters to emit against; defaults to the canonical `H|\^&` set.
 * @returns The serialized record stream (`CR` after every record).
 * @throws {@link AstmSerializeError} when a component contains an unencodable `CR`/`LF`
 *   (`ASTM_EMIT_UNENCODABLE_VALUE`), when `d` fails one of the three conditions
 *   readback requires (`ASTM_EMIT_INVALID_DELIMITERS`), or when a record's type
 *   letter would not be the first character of its own emitted line
 *   (`ASTM_EMIT_TYPE_LETTER_COLLISION`).
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
  assertEmittableDelimiters(d);
  const records: readonly AstmRecord[] = Array.isArray(input)
    ? (input as readonly AstmRecord[])
    : (input as AstmMessage).records;
  return records.map((r) => serializeRecordChecked(r, d) + "\r").join("");
}

/**
 * Serialize a single {@link AstmField} to its spec-clean wire text, re-escaping
 * each component. A low-level helper for callers assembling a field outside a
 * whole record.
 *
 * @param field - The field to serialize.
 * @param d - The delimiters to emit against; defaults to `H|\^&`.
 * @returns The escaped field text.
 * @throws {@link AstmSerializeError} when a component contains an unencodable `CR`/`LF`
 *   (`ASTM_EMIT_UNENCODABLE_VALUE`), or when `d` fails one of the three conditions
 *   readback requires (`ASTM_EMIT_INVALID_DELIMITERS`). Like
 *   {@link encodeComponent} this takes no record, so it never raises
 *   `ASTM_EMIT_TYPE_LETTER_COLLISION`: encoding a record's type-letter field
 *   through it will escape that letter away without objecting.
 * @example
 * ```ts
 * import { serializeField, tokenizeRecord, CANONICAL_DELIMITERS } from "@cosyte/astm";
 * const fields = tokenizeRecord("R|1|^^^687|1&S&40", CANONICAL_DELIMITERS);
 * serializeField(fields[3]!); // "1&S&40"
 * ```
 */
export function serializeField(field: AstmField, d: Delimiters = CANONICAL_DELIMITERS): string {
  assertEmittableDelimiters(d);
  return encodeField(field.repeats, d);
}
