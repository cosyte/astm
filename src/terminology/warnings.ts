/**
 * The **terminology** warning registry (`ASTM_LIVD_*`) for the LIVD-aware LOINC
 * recognition layer: the fourth of the package's registries,
 * alongside the record layer's `ASTM_RECORD_*`, the frame codec's `ASTM_FRAME_*`,
 * and the protocol reducer's `ASTM_LTP_*`.
 *
 * A terminology warning is the record of a **safe non-mapping**: a reported
 * vendor test code that a consumer-supplied LIVD catalog did not map to a single
 * LOINC. It never carries a LOINC the catalog did not vouch for: the whole point
 * of the layer is that an unmapped or ambiguous code is surfaced as *unmapped*,
 * **never a guessed LOINC** (mis-identifying a test is safety-critical). Every
 * warning carries a stable code and a message that is a **constant**, and
 * **never** a field value, a reported code or any text the consumer stored in
 * their catalog. Consumers compare `warning.code ===
 * LIVD_WARNING_CODES.<CODE>`; renaming a code is a **breaking change**.
 *
 * **Two shapes, by what the warning is about.** A warning about a RECORD carries
 * positional context ({@link AstmPosition}) and is an {@link AstmLivdWarning}: one
 * per unmapped or ambiguous code, produced while a message is annotated. A warning
 * about the CATALOG ITSELF carries no position, because no record is implicated: it
 * is an {@link AstmLivdCatalogWarning}, raised once where the catalog is defined,
 * and it names the catalog through a structured field
 * ({@link LivdCatalogIdentity}) rather than through its message text, so a consumer
 * who logs only the message can never emit text they stored in their catalog.
 *
 * These codes live in their own registry and are deliberately **not** part of the
 * profile safety gate's universe (`ALL_ASTM_WARNING_CODES`): a LIVD non-mapping is
 * a post-parse advisory produced by the opt-in {@link applyLivd} helper, not a
 * parse-time deviation a vendor profile could ever "tolerate". A profile referencing
 * one is rejected as an unknown code: correctly, since there is nothing here to
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
   * entry for it. The code stays surfaced verbatim and the mapping is `unmapped`: a LOINC is
   * **never** guessed. Purely advisory: the raw code and value are untouched.
   */
  ASTM_LIVD_UNMAPPED_CODE: "ASTM_LIVD_UNMAPPED_CODE",
  /**
   * A vendor/local test code matched **more than one distinct LOINC** in the catalog (e.g. the same
   * transmission code used by two devices for different analytes). The mapping is `ambiguous` and the
   * candidate LOINCs are surfaced for inspection, but **none is chosen**: refusing to pick is the
   * fail-safe, since guessing wrong mis-identifies the test.
   */
  ASTM_LIVD_AMBIGUOUS_MAPPING: "ASTM_LIVD_AMBIGUOUS_MAPPING",
  /**
   * A consumer-supplied LIVD catalog was defined **without a LOINC version**, so a mapping it
   * produces cannot say which version of LOINC it was made against. Advisory and **never a
   * refusal**: the catalog is still built, still indexed and still answers exactly as it would
   * have. Raised **once, where the catalog is defined**, and never per record: it is a fact about
   * the catalog rather than about any message, so it never joins the per-record warning stream.
   */
  ASTM_LIVD_CATALOG_NO_LOINC_VERSION: "ASTM_LIVD_CATALOG_NO_LOINC_VERSION",
} as const;

/**
 * Discriminant type for every code in {@link LIVD_WARNING_CODES}, the per-record
 * codes and the catalog-level one alike. Narrowing by this code lets consumers
 * write exhaustive `switch` blocks against the registry. It tracks the registry
 * exactly, so `Object.values(LIVD_WARNING_CODES)` stays a snapshot of this type.
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
 *   message: "Reported test code had no LIVD mapping, surfaced unmapped, never a guessed LOINC.",
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
    message: "Reported test code had no LIVD mapping, surfaced unmapped, never a guessed LOINC.",
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
      "Reported test code mapped to multiple distinct LOINCs, surfaced ambiguous, never one guessed.",
    position,
  };
}

/**
 * What a LIVD catalog declared about its own identity: the two publication elements
 * that name a publication, or the explicit statement that it declared neither.
 *
 * The same two shapes the rest of this package uses for attribution: a named source,
 * or a positive "nothing citable", never an absent field and never an invented name.
 * Discriminate on `declared`.
 *
 * @example
 * ```ts
 * import type { LivdCatalogIdentity } from "@cosyte/astm";
 * const named: LivdCatalogIdentity = { declared: true, publisher: "Example Diagnostics" };
 * ```
 */
export type LivdCatalogIdentity =
  | {
      /** Always `true`: the catalog declared at least one of the two elements below. */
      readonly declared: true;
      /** The **Publisher** the catalog declared, verbatim, when it declared one. */
      readonly publisher?: string;
      /** The **Publication Version ID** the catalog declared, verbatim, when it declared one. */
      readonly publicationVersion?: string;
    }
  | {
      /** Always `false`: the catalog declared neither a publisher nor a publication version. */
      readonly declared: false;
      /** Fixed prose saying that no identity was declared. Never an invented or indexed name. */
      readonly reason: string;
    };

/**
 * The identity reported for a catalog that declared neither a publisher nor a
 * publication version: a positive statement that it declared none.
 *
 * It exists so that case is said rather than left to an absent field, and so nothing
 * has to invent a name, an ordinal or a position to stand in for one. Frozen.
 *
 * @example
 * ```ts
 * import { LIVD_CATALOG_IDENTITY_UNDECLARED } from "@cosyte/astm";
 * LIVD_CATALOG_IDENTITY_UNDECLARED.declared; // false
 * ```
 */
export const LIVD_CATALOG_IDENTITY_UNDECLARED: LivdCatalogIdentity = Object.freeze({
  declared: false,
  reason:
    "The catalog declared neither a publisher nor a publication version, so it declared no " +
    "identity at all. Nothing stands in for one here: no name is invented, no ordinal or " +
    "position is substituted, and no value from the catalog's rows is borrowed to label it.",
});

/**
 * The message every `ASTM_LIVD_CATALOG_NO_LOINC_VERSION` warning carries. A constant:
 * it describes the situation and carries no consumer-supplied text, no record content
 * and no patient data. What the catalog declared rides in the warning's structured
 * `catalog` field instead, so logging the message alone emits nothing the consumer
 * stored.
 */
const CATALOG_NO_LOINC_VERSION_MESSAGE =
  "The LIVD catalog declared no LOINC version, so an annotation it produces cannot state which " +
  "version of LOINC the mapping was made against. The catalog is built and usable, and nothing " +
  "about a lookup changes. What the catalog declared about itself is on this warning's catalog " +
  "field, never in this message.";

/**
 * A catalog-level terminology warning: a stable code, a value-free constant message,
 * and the catalog's own declared identity. It carries no position, because no record
 * is implicated, and it is never produced while a message is annotated.
 *
 * @example
 * ```ts
 * import type { AstmLivdCatalogWarning } from "@cosyte/astm";
 * const w: AstmLivdCatalogWarning = {
 *   code: "ASTM_LIVD_CATALOG_NO_LOINC_VERSION",
 *   message: "...",
 *   catalog: { declared: true, publisher: "Example Diagnostics", publicationVersion: "2026-01" },
 * };
 * ```
 */
export interface AstmLivdCatalogWarning {
  /** Always `ASTM_LIVD_CATALOG_NO_LOINC_VERSION`. */
  readonly code: typeof LIVD_WARNING_CODES.ASTM_LIVD_CATALOG_NO_LOINC_VERSION;
  /**
   * Human-readable detail for logs. A **constant**: never a test code, a value, a LOINC, or any
   * text the consumer supplied. The catalog is named by the `catalog` field, not by this string.
   */
  readonly message: string;
  /** What the catalog declared about itself, or the positive statement that it declared none. */
  readonly catalog: LivdCatalogIdentity;
}

/**
 * Build an `ASTM_LIVD_CATALOG_NO_LOINC_VERSION` warning. Advisory: the catalog it
 * describes is still built and still answers every lookup exactly as it would have.
 *
 * @param catalog - What the catalog declared about its identity; pass
 *   {@link LIVD_CATALOG_IDENTITY_UNDECLARED} where it declared none.
 * @returns The warning.
 * @example
 * ```ts
 * import { livdCatalogMissingLoincVersion, LIVD_CATALOG_IDENTITY_UNDECLARED } from "@cosyte/astm";
 * livdCatalogMissingLoincVersion(LIVD_CATALOG_IDENTITY_UNDECLARED);
 * ```
 */
export function livdCatalogMissingLoincVersion(
  catalog: LivdCatalogIdentity,
): AstmLivdCatalogWarning {
  return {
    code: LIVD_WARNING_CODES.ASTM_LIVD_CATALOG_NO_LOINC_VERSION,
    message: CATALOG_NO_LOINC_VERSION_MESSAGE,
    catalog,
  };
}
