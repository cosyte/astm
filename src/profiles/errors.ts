/**
 * The definition-time error for the `@cosyte/astm` vendor-profile subsystem.
 *
 * A profile is validated when it is *defined*, not when it is applied — so a
 * misconfigured profile (a bad name, an unknown option key, a tolerated code that
 * is unknown or **safety-critical**) fails loudly at construction, long before it
 * could quiet a real deviation. This is the class that failure throws. It is a
 * programming error (a bad profile literal), distinct from `AstmParseError` (bad
 * input) — so consumers narrow on it separately.
 */

/**
 * Thrown by `defineAstmProfile` when a profile definition is invalid: a missing or
 * empty `name`, an unknown option key, an invalid `transport` value, or a
 * `tolerate` entry whose code is unknown, whose `rationale` is empty, or — the
 * load-bearing safety rule — whose code is **safety-critical** (a result value,
 * abnormal flag, result status, reference range, units, patient/comment context,
 * message-kind, code system, or any frame/LTP integrity warning). Carries the
 * offending profile's `name` when it is known, so a multi-profile build names the
 * culprit.
 *
 * @example
 * ```ts
 * import { defineAstmProfile, AstmProfileDefinitionError } from "@cosyte/astm";
 * try {
 *   defineAstmProfile({
 *     name: "unsafe",
 *     tolerate: [{ code: "ASTM_FRAME_BAD_CHECKSUM", rationale: "no" }],
 *   });
 * } catch (err) {
 *   if (err instanceof AstmProfileDefinitionError) err.profileName; // "unsafe"
 * }
 * ```
 */
export class AstmProfileDefinitionError extends Error {
  /** The offending profile's `name`, when it could be read. */
  public readonly profileName?: string;

  /**
   * Construct a new `AstmProfileDefinitionError`.
   *
   * @param message - A human-readable explanation of what was invalid.
   * @param profileName - The offending profile's name, when known.
   * @internal
   */
  public constructor(message: string, profileName?: string) {
    super(message);
    this.name = "AstmProfileDefinitionError";
    if (profileName !== undefined) this.profileName = profileName;
  }
}
