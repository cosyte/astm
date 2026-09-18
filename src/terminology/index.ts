/**
 * The **terminology** layer: LIVD-aware LOINC recognition, bring-your-own
 * (no bundled dictionary). Recognize the Universal Test ID's LOINC slot and surface
 * vendor codes verbatim; map vendor codes → LOINC from a
 * **consumer-supplied** IICC LIVD catalog here, additive, advisory, and never a
 * guessed LOINC.
 */

export { defineLivdCatalog } from "./catalog.js";
export type {
  LivdAmbiguityReason,
  LivdCandidate,
  LivdCatalog,
  LivdEntry,
  LivdLookup,
  LivdPublication,
  LivdUnitComparison,
} from "./catalog.js";
export { applyLivd, lookupLivdForRecord } from "./apply.js";
export type { LivdAnnotation, LivdMapping, LivdResult } from "./apply.js";
export {
  LIVD_WARNING_CODES,
  LIVD_CATALOG_IDENTITY_UNDECLARED,
  livdUnmappedCode,
  livdAmbiguousMapping,
  livdCatalogMissingLoincVersion,
} from "./warnings.js";
export type {
  AstmLivdWarning,
  AstmLivdCatalogWarning,
  LivdCatalogIdentity,
  LivdWarningCode,
} from "./warnings.js";
