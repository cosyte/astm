/**
 * Positional context shared by warnings and fatal errors in the `@cosyte/astm`
 * record layer.
 *
 * **PHI discipline (the whole point).** A position identifies *where* a
 * deviation occurred — the record's ordinal index, its type letter, and the
 * 1-based field / component indices — and **never** carries a field value. A
 * warning or error may be logged verbatim without leaking a patient name, an
 * identifier, or a result value.
 */

/**
 * Where in a record stream a warning or fatal originated. Every field is
 * positional; none is a value.
 *
 * @example
 * ```ts
 * import type { AstmPosition } from "@cosyte/astm";
 * const at: AstmPosition = { recordIndex: 3, recordType: "R", fieldIndex: 4 };
 * ```
 */
export interface AstmPosition {
  /** 0-based ordinal of the record within the message. */
  readonly recordIndex: number;
  /** The record's type letter (`H`/`P`/`O`/`R`/`L`/…), when known. */
  readonly recordType?: string;
  /** 1-based field index within the record (ASTM fields are 1-indexed). */
  readonly fieldIndex?: number;
  /** 1-based component index within the field, when the deviation is component-scoped. */
  readonly componentIndex?: number;
}
