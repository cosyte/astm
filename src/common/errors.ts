/**
 * Fatal error taxonomy for the `@cosyte/astm` record parser.
 *
 * Tier-3 **fatal** codes mark input the parser cannot recover into a structured
 * `AstmMessage`; anything less severe is a Tier-2 warning (see `./warnings.ts`).
 * `AstmParseError` is thrown directly and consumers narrow via the `code`
 * discriminant. The set is additions-only across phases — the record layer
 * introduces three, one of which (`EMPTY_INPUT`) is shared with every future
 * layer (the frame codec adds its own `ASTM_FRAME_*` fatals later).
 */

import type { AstmPosition } from "./position.js";

/**
 * Stable string codes for every Tier-3 fatal the record parser may throw.
 * Consumers narrow on `err.code` to react to specific structural failures.
 * Renaming a code is a **breaking change**.
 *
 * @example
 * ```ts
 * import { parseAstmRecords, FATAL_CODES, AstmParseError } from "@cosyte/astm";
 * try {
 *   parseAstmRecords("");
 * } catch (err) {
 *   if (err instanceof AstmParseError && err.code === FATAL_CODES.EMPTY_INPUT) {
 *     // handle empty input
 *   }
 * }
 * ```
 */
export const FATAL_CODES = {
  /** Input was empty or whitespace-only — there is nothing to parse. Shared across layers. */
  EMPTY_INPUT: "EMPTY_INPUT",
  /** The first record is not an `H` (header) record — an ASTM message must lead with `H`. */
  ASTM_RECORD_NO_HEADER: "ASTM_RECORD_NO_HEADER",
  /** The `H` record is too short to declare the four delimiters (field/repeat/component/escape). */
  ASTM_RECORD_UNDECLARED_DELIMITERS: "ASTM_RECORD_UNDECLARED_DELIMITERS",
} as const;

/**
 * A value from {@link FATAL_CODES} — the type carried by a thrown {@link AstmParseError}.
 */
export type FatalCode = (typeof FATAL_CODES)[keyof typeof FATAL_CODES];

/**
 * Thrown by {@link parseAstmRecords} when the input violates one of the Tier-3
 * unrecoverable structural rules (empty input, no leading `H`, or an `H` that
 * cannot declare its delimiters). Carries positional context so consumers can
 * log an actionable error.
 *
 * **PHI:** the error carries a stable code + position only, never a field value.
 *
 * @example
 * ```ts
 * import { parseAstmRecords, AstmParseError } from "@cosyte/astm";
 * try {
 *   parseAstmRecords("P|1");
 * } catch (err) {
 *   if (err instanceof AstmParseError && err.code === "ASTM_RECORD_NO_HEADER") {
 *     // err.position is available; err carries no field value
 *   }
 * }
 * ```
 */
export class AstmParseError extends Error {
  public readonly code: FatalCode;
  public readonly position: AstmPosition;

  /**
   * Construct a new `AstmParseError`. Both fields are required so every thrower
   * populates positional context and no PHI-bearing snippet is ever attached.
   *
   * @internal
   */
  public constructor(code: FatalCode, message: string, position: AstmPosition) {
    super(message);
    this.name = "AstmParseError";
    this.code = code;
    this.position = position;
  }
}
