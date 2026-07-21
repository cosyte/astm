/**
 * The frame codec's thrown error — the `strict`-mode counterpart to its lenient
 * warnings.
 *
 * The frame layer is lenient by default (byte-level deviations become
 * {@link AstmFrameWarning}s), and shares the single {@link FATAL_CODES.EMPTY_INPUT}
 * fatal with the record layer (thrown as an {@link AstmParseError} on an empty
 * stream, in both modes). In `strict` mode every tolerated deviation is rejected
 * instead: {@link decodeAstmFrames} throws {@link AstmFrameStrictError} carrying the
 * warnings it would otherwise have accumulated (code + position, never a value).
 */

import type { AstmFrameWarning } from "./warnings.js";

/**
 * Thrown by {@link decodeAstmFrames} in `strict` mode when the lenient codec would
 * otherwise have accumulated one or more frame warnings (a bad checksum, a
 * sequence gap, an unterminated frame, or an oversize frame). Carries every
 * warning (code + position, never the frame's record bytes) so a caller can see
 * each deviation.
 *
 * @example
 * ```ts
 * import { decodeAstmFrames, AstmFrameStrictError } from "@cosyte/astm";
 * try {
 *   decodeAstmFrames(someFramedBytes, { strict: true });
 * } catch (err) {
 *   if (err instanceof AstmFrameStrictError) err.warnings.length; // >= 1
 * }
 * ```
 */
export class AstmFrameStrictError extends Error {
  public readonly warnings: readonly AstmFrameWarning[];
  /** @internal */
  public constructor(warnings: readonly AstmFrameWarning[]) {
    super(`Strict mode: ${String(warnings.length)} frame deviation(s) rejected.`);
    this.name = "AstmFrameStrictError";
    this.warnings = warnings;
  }
}
