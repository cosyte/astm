/**
 * The record-layer **builder**: {@link buildAstmMessage} — Phase 7.
 *
 * A builder produces spec-clean E1394 records **by construction** from typed
 * caller input, under two disciplines:
 *
 * - **Never fabricate.** A builder emits **only** the values the caller supplied.
 *   An unsupplied field is left **empty**, never filled with a default clinical
 *   value — no defaulted result status, abnormal flag, units, value, or patient
 *   identifier. (Leaving a field empty is not a guess; inventing an `F` status or
 *   an `N` flag would be.) A consumer that parses a built result whose status the
 *   caller omitted reads `status.meaning === "unspecified"`, never `"final"`.
 * - **Compute, don't guess, the structure.** The record type letters, the
 *   delimiter declaration (canonical `H|\^&`), the message terminator (`L`), and
 *   the per-record sequence counters are **structural** — computed by the builder,
 *   not clinical values. The caller may override any sequence number.
 *
 * Every value is escape-encoded on emit (via the serializer), so an embedded
 * delimiter can never break framing, and a value carrying an unencodable `CR`/`LF`
 * is a typed {@link AstmSerializeError} rather than a corrupted wire.
 */

import { CANONICAL_DELIMITERS } from "../common/delimiters.js";
import { AstmSerializeError, encodeComponent } from "./serialize.js";

/** A patient name split into its components; only the supplied parts are emitted. */
export interface PatientNameInput {
  readonly last?: string;
  readonly first?: string;
  readonly middle?: string;
}

/** Input for a `P` (patient) record. The three IDs stay distinct — none defaults from another. */
export interface PatientInput {
  readonly type: "P";
  /** Structural sequence number; auto-computed when omitted. */
  readonly seq?: string;
  /** Field 3 — practice-assigned patient ID. */
  readonly practiceAssignedId?: string;
  /** Field 4 — laboratory-assigned patient ID. */
  readonly laboratoryAssignedId?: string;
  /** Field 5 — a third patient identifier. */
  readonly patientIdThree?: string;
  /** Field 6 — patient name (`Last^First^Middle`). */
  readonly name?: PatientNameInput;
  /** Field 7 — mother's maiden name. */
  readonly mothersMaidenName?: string;
  /** Field 8 — birthdate (`YYYYMMDDHHMMSS`), emitted verbatim, never reformatted. */
  readonly birthDate?: string;
  /** Field 9 — sex, emitted verbatim (never defaulted). */
  readonly sex?: string;
}

/** Input for an `O` (order) record. */
export interface OrderInput {
  readonly type: "O";
  readonly seq?: string;
  /** Field 3 — specimen / accession ID. */
  readonly specimenId?: string;
  /** Field 4 — instrument specimen ID. */
  readonly instrumentSpecimenId?: string;
  /** Field 5 — Universal Test ID components (verbatim, in order; e.g. `["", "", "", "687"]`). */
  readonly universalTestId?: readonly string[];
  /** Field 6 — priority, emitted verbatim. */
  readonly priority?: string;
  /** Field 12 — action code, emitted verbatim. */
  readonly actionCode?: string;
  /** Field 26 — report type, emitted verbatim. */
  readonly reportType?: string;
}

/** Input for an `R` (result) record. No clinical field is defaulted; unsupplied ⇒ empty. */
export interface ResultInput {
  readonly type: "R";
  readonly seq?: string;
  /** Field 3 — Universal Test ID components (verbatim). */
  readonly universalTestId?: readonly string[];
  /** Field 4 — the measured value, emitted verbatim (never defaulted). */
  readonly value?: string;
  /** Field 5 — units (vendor free text; never defaulted, guessed, or converted). */
  readonly units?: string;
  /** Field 6 — reference range, emitted verbatim. */
  readonly referenceRange?: string;
  /** Field 7 — abnormal flags, emitted verbatim (never defaulted to `N`). */
  readonly abnormalFlags?: string;
  /** Field 9 — result status, emitted verbatim (never defaulted to `F`). */
  readonly resultStatus?: string;
  /** Field 11 — operator. */
  readonly operator?: string;
  /** Field 12 — test-started timestamp (`YYYYMMDDHHMMSS`), verbatim. */
  readonly startedAt?: string;
  /** Field 13 — test-completed timestamp, verbatim. */
  readonly completedAt?: string;
  /** Field 14 — instrument identifier. */
  readonly instrument?: string;
}

/** Input for a `C` (comment) record. */
export interface CommentInput {
  readonly type: "C";
  readonly seq?: string;
  /** Field 3 — comment source. */
  readonly source?: string;
  /** Field 4 — comment text (a single component). Use {@link CommentInput.textComponents} for a structured comment. */
  readonly text?: string;
  /** Field 4 — comment text as explicit components (takes precedence over `text` when set). */
  readonly textComponents?: readonly string[];
  /** Field 5 — comment type code, emitted verbatim. */
  readonly commentType?: string;
}

/** Input for a `Q` (request-information) record. */
export interface QueryInput {
  readonly type: "Q";
  readonly seq?: string;
  /** Field 3 — starting range ID, emitted verbatim. */
  readonly startingRangeId?: string;
  /** Field 4 — ending range ID, emitted verbatim. */
  readonly endingRangeId?: string;
  /** Field 5 — Universal Test ID components; ignored when {@link QueryInput.queriesAllTests} is set. */
  readonly universalTestId?: readonly string[];
  /** Field 5 — emit the literal `ALL` universal-query keyword instead of a Universal Test ID. */
  readonly queriesAllTests?: boolean;
  /** Field 13 — request-information status, emitted verbatim. */
  readonly requestInformationStatus?: string;
}

/**
 * Input for an `M` (manufacturer) or `S` (scientific) record — vendor-defined
 * free-form data. Emitted verbatim from the caller's fields; never interpreted.
 */
export interface VerbatimInput {
  readonly type: "M" | "S";
  /** Data fields (after the type letter), emitted verbatim in order. */
  readonly fields: readonly string[];
}

/** Any record the message builder can emit (the terminator `L` is appended automatically). */
export type AstmRecordInput =
  | PatientInput
  | OrderInput
  | ResultInput
  | CommentInput
  | QueryInput
  | VerbatimInput;

/** Optional header fields (after the delimiter declaration). */
export interface HeaderInput {
  /** Extra `H`-record fields (field 3 onward), emitted verbatim in order. Field 2 is always `\^&`. */
  readonly fields?: readonly string[];
}

/** The message to build: an optional header, the body records, and an optional terminator code. */
export interface MessageInput {
  /** Header fields; the canonical `H|\^&` declaration is always emitted. */
  readonly header?: HeaderInput;
  /** The body records, in order. `H` and `L` are supplied by the builder. */
  readonly records: readonly AstmRecordInput[];
  /**
   * Field 3 of the auto-appended `L` (terminator) record — the termination code
   * (e.g. `N` normal). Omitted by default (not defaulted to a value the caller
   * did not choose); the `L` seq is always emitted.
   */
  readonly terminationCode?: string;
}

/** Join a positional field array into a record line, trimming trailing empty fields. */
function line(fields: readonly (readonly string[])[]): string {
  const d = CANONICAL_DELIMITERS;
  const encoded = fields.map((comps) => comps.map((c) => encodeComponent(c, d)).join(d.component));
  // Trim trailing empty fields — an absent trailing field and an empty one are equivalent on parse.
  let end = encoded.length;
  while (end > 0 && encoded[end - 1] === "") end -= 1;
  return encoded.slice(0, end).join(d.field);
}

/** Build the components of a Universal Test ID field from a verbatim component list. */
function utid(components: readonly string[] | undefined): readonly string[] {
  return components === undefined ? [""] : [...components];
}

/** Set a 1-based ASTM field position in a sparse builder array (index 0 is the type letter). */
function at(fields: string[][], position1: number, value: string | undefined): void {
  if (value === undefined) return;
  fields[position1 - 1] = [value];
}

function buildPatientLine(input: PatientInput, seq: string): string {
  const f: string[][] = [["P"], [seq]];
  at(f, 3, input.practiceAssignedId);
  at(f, 4, input.laboratoryAssignedId);
  at(f, 5, input.patientIdThree);
  if (input.name !== undefined) {
    f[5] = [input.name.last ?? "", input.name.first ?? "", input.name.middle ?? ""];
  }
  at(f, 7, input.mothersMaidenName);
  at(f, 8, input.birthDate);
  at(f, 9, input.sex);
  return line(padGaps(f));
}

function buildOrderLine(input: OrderInput, seq: string): string {
  const f: string[][] = [["O"], [seq]];
  at(f, 3, input.specimenId);
  at(f, 4, input.instrumentSpecimenId);
  if (input.universalTestId !== undefined) f[4] = [...utid(input.universalTestId)];
  at(f, 6, input.priority);
  at(f, 12, input.actionCode);
  at(f, 26, input.reportType);
  return line(padGaps(f));
}

function buildResultLine(input: ResultInput, seq: string): string {
  const f: string[][] = [["R"], [seq]];
  if (input.universalTestId !== undefined) f[2] = [...utid(input.universalTestId)];
  at(f, 4, input.value);
  at(f, 5, input.units);
  at(f, 6, input.referenceRange);
  at(f, 7, input.abnormalFlags);
  at(f, 9, input.resultStatus);
  at(f, 11, input.operator);
  at(f, 12, input.startedAt);
  at(f, 13, input.completedAt);
  at(f, 14, input.instrument);
  return line(padGaps(f));
}

function buildCommentLine(input: CommentInput, seq: string): string {
  const f: string[][] = [["C"], [seq]];
  at(f, 3, input.source);
  if (input.textComponents !== undefined) f[3] = [...input.textComponents];
  else at(f, 4, input.text);
  at(f, 5, input.commentType);
  return line(padGaps(f));
}

function buildQueryLine(input: QueryInput, seq: string): string {
  const f: string[][] = [["Q"], [seq]];
  at(f, 3, input.startingRangeId);
  at(f, 4, input.endingRangeId);
  if (input.queriesAllTests === true) f[4] = ["ALL"];
  else if (input.universalTestId !== undefined) f[4] = [...utid(input.universalTestId)];
  at(f, 13, input.requestInformationStatus);
  return line(padGaps(f));
}

function buildVerbatimLine(input: VerbatimInput, seq: string): string {
  // M / S records are surfaced VERBATIM by the parser, so the builder emits the caller's field text
  // byte-for-byte (never escaped — the caller owns the exact bytes). A CR/LF is still refused: it
  // cannot be represented inside a record and would break framing.
  return [input.type, seq, ...input.fields.map(guardWireSafe)].join(CANONICAL_DELIMITERS.field);
}

/** Reject a verbatim field carrying a record terminator (`CR`/`LF`), which would break framing. */
function guardWireSafe(value: string): string {
  if (value.includes("\r") || value.includes("\n")) {
    throw new AstmSerializeError(
      "A verbatim field contains a record terminator (CR/LF), which would break framing.",
    );
  }
  return value;
}

/** Fill sparse gaps in a positional field array with a single empty component. */
function padGaps(fields: string[][]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < fields.length; i += 1) out[i] = fields[i] ?? [""];
  return out;
}

/**
 * Build a spec-clean ASTM/CLSI-LIS02 record stream from typed input.
 *
 * The builder emits the canonical `H|\^&` header (plus any header fields), then
 * every body record with each supplied field at its correct 1-based position and
 * every value escape-encoded, then an `L` terminator. **Nothing clinical is
 * defaulted** — an unsupplied field is empty, never a guessed value — and the
 * structural pieces (delimiters, record types, sequence counters, terminator) are
 * computed. The result parses back to an equal message: build → parse fidelity by
 * construction.
 *
 * @param input - The message to build.
 * @returns The serialized, `CR`-terminated record stream.
 * @throws {@link AstmSerializeError} when a value contains an unencodable `CR`/`LF`.
 * @example
 * ```ts
 * import { buildAstmMessage, parseAstmRecords, results } from "@cosyte/astm";
 * const raw = buildAstmMessage({
 *   records: [{ type: "R", universalTestId: ["", "", "", "687"], value: "28.6", units: "U/L" }],
 * });
 * results(parseAstmRecords(raw))[0]?.value; // "28.6"
 * ```
 */
export function buildAstmMessage(input: MessageInput): string {
  const lines: string[] = [];

  // Header: the canonical delimiter declaration is emitted LITERALLY (never escaped — escaping the
  // very declaration a reader depends on would corrupt it); any extra header fields are escaped.
  const d = CANONICAL_DELIMITERS;
  // Header data fields (sender name / version etc.) are emitted verbatim — they legitimately carry
  // component structure (`analyzer^cobas^1`); only a framing-breaking CR/LF is refused.
  const headerFields = input.header?.fields ?? [];
  const headerRest = headerFields.map((v) => d.field + guardWireSafe(v)).join("");
  lines.push("H" + d.field + d.repeat + d.component + d.escape + headerRest);

  // Per-record-type sequence counters (structural; the caller may override each seq).
  const counters = new Map<string, number>();
  const nextSeq = (type: string, override?: string): string => {
    if (override !== undefined) return override;
    const n = (counters.get(type) ?? 0) + 1;
    counters.set(type, n);
    return String(n);
  };

  for (const rec of input.records) {
    switch (rec.type) {
      case "P":
        lines.push(buildPatientLine(rec, nextSeq("P", rec.seq)));
        break;
      case "O":
        lines.push(buildOrderLine(rec, nextSeq("O", rec.seq)));
        break;
      case "R":
        lines.push(buildResultLine(rec, nextSeq("R", rec.seq)));
        break;
      case "C":
        lines.push(buildCommentLine(rec, nextSeq("C", rec.seq)));
        break;
      case "Q":
        lines.push(buildQueryLine(rec, nextSeq("Q", rec.seq)));
        break;
      case "M":
      case "S":
        lines.push(buildVerbatimLine(rec, nextSeq(rec.type)));
        break;
      default: {
        // Exhaustiveness — an unrecognized record type is a structural error, not a guess.
        const bad = rec as { type?: unknown };
        throw new TypeError(`Unknown ASTM record type to build: ${String(bad.type)}`);
      }
    }
  }

  // Terminator: structural. Field 3 termination code only when the caller chose one.
  const term: string[][] = [["L"], ["1"]];
  if (input.terminationCode !== undefined) term[2] = [input.terminationCode];
  lines.push(line(padGaps(term)));

  return lines.map((l) => l + "\r").join("");
}
