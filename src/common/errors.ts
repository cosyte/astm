/**
 * Fatal error taxonomy for the `@cosyte/astm` record parser.
 *
 * Tier-3 **fatal** codes mark input the parser cannot recover into a structured
 * `AstmMessage`; anything less severe is a Tier-2 warning (see `./warnings.ts`).
 * `AstmParseError` is thrown directly and consumers narrow via the `code`
 * discriminant. {@link FatalCode} is **closed**: these three are all of it. The frame
 * codec reuses `EMPTY_INPUT` (an empty stream is fatal in both its lenient and strict
 * modes) but does not widen the union, its own thrown errors are separate types with
 * their own discriminants: {@link AstmFrameEncodeError} carries
 * `ASTM_FRAME_EMPTY_RECORD`, and {@link AstmFrameStrictError} carries the rejected
 * warnings rather than a `code`. So narrowing an `AstmParseError` on `code` will only
 * ever see a value from this set.
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
  /** Input was empty or whitespace-only: there is nothing to parse. Shared across layers. */
  EMPTY_INPUT: "EMPTY_INPUT",
  /** The first record is not an `H` (header) record: an ASTM message must lead with `H`. */
  ASTM_RECORD_NO_HEADER: "ASTM_RECORD_NO_HEADER",
  /**
   * The first `H` record could not declare all four delimiters (field/repeat/component/escape).
   * One code, four reasons, and the message says which: the record is not a header, it is shorter
   * than a header plus a three-character definition, its definition field holds fewer than three
   * characters before the next field separator, or its field separator is also one of the other
   * three. Only the second of those is "too short", so read the message rather than assuming it.
   */
  ASTM_RECORD_UNDECLARED_DELIMITERS: "ASTM_RECORD_UNDECLARED_DELIMITERS",
} as const;

/**
 * A value from {@link FATAL_CODES}: the type carried by a thrown {@link AstmParseError}.
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
