/**
 * The Phase-9 **terminology** layer: LIVD-aware LOINC recognition, bring-your-own
 * (no bundled dictionary). Recognize the Universal Test ID's LOINC slot and surface
 * vendor codes verbatim (Phase 1); map vendor codes → LOINC from a
 * **consumer-supplied** IICC LIVD catalog here — additive, advisory, and never a
 * guessed LOINC.
 */

export { defineLivdCatalog } from "./catalog.js";
export type { LivdCatalog, LivdEntry, LivdLookup } from "./catalog.js";
export { applyLivd, lookupLivdForRecord } from "./apply.js";
export type { LivdAnnotation, LivdMapping, LivdResult } from "./apply.js";
export { LIVD_WARNING_CODES, livdUnmappedCode, livdAmbiguousMapping } from "./warnings.js";
export type { AstmLivdWarning, LivdWarningCode } from "./warnings.js";
