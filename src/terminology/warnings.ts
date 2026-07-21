/**
 * The **terminology** warning registry (`ASTM_LIVD_*`) for the Phase-9
 * LIVD-aware LOINC recognition layer — the fourth of the package's registries,
 * alongside the record layer's `ASTM_RECORD_*`, the frame codec's `ASTM_FRAME_*`,
 * and the protocol reducer's `ASTM_LTP_*`.
 *
 * A terminology warning is the record of a **safe non-mapping**: a reported
 * vendor test code that a consumer-supplied LIVD catalog did not map to a single
 * LOINC. It never carries a LOINC the catalog did not vouch for — the whole point
 * of the layer is that an unmapped or ambiguous code is surfaced as *unmapped*,
 * **never a guessed LOINC** (mis-identifying a test is safety-critical). Every
 * warning carries a stable code plus positional context ({@link AstmPosition}) and
 * **never** a field value. Consumers compare `warning.code ===
 * LIVD_WARNING_CODES.<CODE>`; renaming a code is a **breaking change**.
 *
 * These codes live in their own registry and are deliberately **not** part of the
 * profile safety gate's universe (`ALL_ASTM_WARNING_CODES`): a LIVD non-mapping is
 * a post-parse advisory produced by the opt-in {@link applyLivd} helper, not a
 * parse-time deviation a vendor profile could ever "tolerate". A profile referencing
 * one is rejected as an unknown code — correctly, since there is nothing here to
 * quiet.
 */

import type { AstmPosition } from "../common/position.js";

/**
 * Stable string codes for every terminology (LIVD) warning. `key === value` so
 * `Object.values(...)` yields a stable snapshot set.
 *
 * @example
 * ```ts
 * import { LIVD_WARNING_CODES } from "@cosyte/astm";
 * LIVD_WARNING_CODES.ASTM_LIVD_UNMAPPED_CODE; // "ASTM_LIVD_UNMAPPED_CODE"
 * ```
 */
export const LIVD_WARNING_CODES = {
  /**
   * A record carried a vendor/local test code, but the consumer-supplied LIVD catalog held **no**
   * entry for it. The code stays surfaced verbatim and the mapping is `unmapped` — a LOINC is
   * **never** guessed. Purely advisory: the raw code and value are untouched.
   */
  ASTM_LIVD_UNMAPPED_CODE: "ASTM_LIVD_UNMAPPED_CODE",
  /**
   * A vendor/local test code matched **more than one distinct LOINC** in the catalog (e.g. the same
   * transmission code used by two devices for different analytes). The mapping is `ambiguous` and the
   * candidate LOINCs are surfaced for inspection, but **none is chosen** — refusing to pick is the
   * fail-safe, since guessing wrong mis-identifies the test.
   */
  ASTM_LIVD_AMBIGUOUS_MAPPING: "ASTM_LIVD_AMBIGUOUS_MAPPING",
} as const;

/**
 * Discriminant type for {@link AstmLivdWarning.code}. Narrowing by this code lets
 * consumers write exhaustive `switch` blocks against {@link LIVD_WARNING_CODES}.
 */
export type LivdWarningCode = (typeof LIVD_WARNING_CODES)[keyof typeof LIVD_WARNING_CODES];

/**
 * A single terminology (LIVD) warning: a stable code, a value-free human-readable
 * message, and positional context. Never carries a test code, a value, or a LOINC.
 *
 * @example
 * ```ts
 * import type { AstmLivdWarning } from "@cosyte/astm";
 * const w: AstmLivdWarning = {
 *   code: "ASTM_LIVD_UNMAPPED_CODE",
 *   message: "Reported test code had no LIVD mapping — surfaced unmapped, never a guessed LOINC.",
 *   position: { recordIndex: 3, recordType: "R" },
 * };
 * ```
 */
export interface AstmLivdWarning {
  readonly code: LivdWarningCode;
  /** Human-readable detail for logs. Never contains a test code, a value, or a LOINC. */
  readonly message: string;
  readonly position: AstmPosition;
}

/**
 * Build an `ASTM_LIVD_UNMAPPED_CODE` warning. The reported code stays verbatim and
 * the mapping is `unmapped`; no LOINC is fabricated.
 *
 * @param position - Where the unmapped code was seen (record ordinal + type; never the code).
 * @returns The warning.
 * @example
 * ```ts
 * import { livdUnmappedCode } from "@cosyte/astm";
 * livdUnmappedCode({ recordIndex: 3, recordType: "R" });
 * ```
 */
export function livdUnmappedCode(position: AstmPosition): AstmLivdWarning {
  return {
    code: LIVD_WARNING_CODES.ASTM_LIVD_UNMAPPED_CODE,
    message: "Reported test code had no LIVD mapping — surfaced unmapped, never a guessed LOINC.",
    position,
  };
}

/**
 * Build an `ASTM_LIVD_AMBIGUOUS_MAPPING` warning. The code matched multiple distinct
 * LOINCs; none is chosen (refusing to pick is the fail-safe).
 *
 * @param position - Where the ambiguous code was seen (record ordinal + type; never the code).
 * @returns The warning.
 * @example
 * ```ts
 * import { livdAmbiguousMapping } from "@cosyte/astm";
 * livdAmbiguousMapping({ recordIndex: 4, recordType: "O" });
 * ```
 */
export function livdAmbiguousMapping(position: AstmPosition): AstmLivdWarning {
  return {
    code: LIVD_WARNING_CODES.ASTM_LIVD_AMBIGUOUS_MAPPING,
    message:
      "Reported test code mapped to multiple distinct LOINCs — surfaced ambiguous, never one guessed.",
    position,
  };
}
