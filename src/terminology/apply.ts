/**
 * The **additive, advisory** LIVD annotation layer (Phase 9). {@link applyLivd}
 * reads a parsed {@link AstmMessage} and a consumer-supplied {@link LivdCatalog}
 * and returns a **separate** layer of per-record LOINC annotations — it **never
 * mutates, alters, or drops** the raw reported code or value. Recognition is an
 * annotation, not a rewrite: the wire stays exactly as parsed.
 *
 * **The never-fabricate rule (the safety-critical point).** A vendor code with no
 * single LIVD mapping surfaces as a typed `unmapped`/`ambiguous`/`no-code`
 * annotation — **never** a guessed LOINC. A wrong LOINC mis-identifies a test, so
 * the layer only ever reports a LOINC the wire itself carried (an inline LOINC
 * candidate) or one the consumer's catalog vouched for (labeled `derived`), and
 * otherwise reports nothing but the miss.
 */

import { primaryCode, recognizeUniversalTestId } from "../common/coding-system.js";
import { deepFreeze } from "../common/freeze.js";
import type { UniversalTestId, UniversalTestIdProvenance } from "../common/coding-system.js";
import type { AstmMessage, OrderRecord, ResultRecord } from "../records/types.js";

import type { LivdCatalog } from "./catalog.js";
import { livdAmbiguousMapping, livdUnmappedCode } from "./warnings.js";
import type { AstmLivdWarning } from "./warnings.js";

/**
 * The outcome of annotating one record's Universal Test ID against a LIVD catalog.
 * A distinct case per disposition; there is no case in which a LOINC is guessed.
 *
 * - `mapped` — the vendor/local code resolved to a single LOINC **via the catalog**
 *   (labeled `derived: true`, `source: "livd"`).
 * - `inline-loinc` — the wire itself carried a LOINC in the Universal Test ID's slot
 *   (component 1); surfaced `source: "wire"`, **not** derived and **not** validated.
 * - `unmapped` — a vendor/local code with no catalog entry.
 * - `ambiguous` — a vendor/local code matching more than one distinct LOINC; the
 *   candidates are surfaced but **none is chosen**.
 * - `no-code` — the record carried no usable test code at all (name-only/empty), so
 *   there was nothing to map.
 */
export type LivdMapping =
  | {
      readonly status: "mapped";
      readonly loinc: string;
      readonly loincLongName?: string;
      readonly source: "livd";
      readonly derived: true;
    }
  | { readonly status: "inline-loinc"; readonly loinc: string; readonly source: "wire" }
  | { readonly status: "unmapped" }
  | { readonly status: "ambiguous"; readonly candidates: readonly string[] }
  | { readonly status: "no-code" };

/**
 * One record's LIVD annotation — which record, the code that was looked up
 * (verbatim), how it was recognized, and the mapping outcome. Additive: it points
 * at the record by index and never replaces it.
 *
 * @example
 * ```ts
 * import type { LivdAnnotation } from "@cosyte/astm";
 * const a: LivdAnnotation = {
 *   recordIndex: 3,
 *   recordType: "R",
 *   reportedCode: "687",
 *   provenance: "local-code",
 *   mapping: { status: "mapped", loinc: "1920-8", source: "livd", derived: true },
 * };
 * ```
 */
export interface LivdAnnotation {
  /** The `recordIndex` of the annotated `R`/`O` record. */
  readonly recordIndex: number;
  /** The annotated record's type. */
  readonly recordType: "R" | "O";
  /** The reported primary code that was looked up, verbatim; absent when the record carried no code. */
  readonly reportedCode?: string;
  /** How the reported code was recognized in the Universal Test ID (provenance only, never a lookup). */
  readonly provenance: UniversalTestIdProvenance;
  /** The mapping outcome — never a guessed LOINC. */
  readonly mapping: LivdMapping;
}

/**
 * The result of {@link applyLivd}: the per-record annotations (one per `R`/`O`
 * record) and the value-free warnings for every unmapped or ambiguous code. Both
 * arrays are deeply frozen; the source message is untouched.
 */
export interface LivdResult {
  /** One annotation per `R`/`O` record, in wire order. */
  readonly annotations: readonly LivdAnnotation[];
  /** A value-free warning per `unmapped`/`ambiguous` code — never per `mapped`/`inline-loinc`/`no-code`. */
  readonly warnings: readonly AstmLivdWarning[];
}

/** Map a recognized Universal Test ID against the catalog — the pure core of the annotation. */
function mapTestId(uid: UniversalTestId, catalog: LivdCatalog): LivdMapping {
  // The wire already carries a candidate LOINC in component 1 — surface it as-is,
  // from the wire, never derived and never validated. It is the primary code.
  if (uid.loincCandidate !== undefined) {
    return { status: "inline-loinc", loinc: uid.loincCandidate, source: "wire" };
  }

  const code = primaryCode(uid);
  if (code === undefined) return { status: "no-code" };

  const hit = catalog.lookup(code);
  switch (hit.status) {
    case "mapped":
      return {
        status: "mapped",
        loinc: hit.loinc,
        ...(hit.loincLongName !== undefined ? { loincLongName: hit.loincLongName } : {}),
        source: "livd",
        derived: true,
      };
    case "ambiguous":
      return { status: "ambiguous", candidates: hit.candidates };
    case "unmapped":
      return { status: "unmapped" };
  }
}

/** Recognize a record's Universal Test ID whether it arrived pre-recognized or as raw components. */
function testIdOf(record: ResultRecord | OrderRecord): UniversalTestId | undefined {
  return record.universalTestId;
}

/**
 * Annotate one `R` or `O` record against a LIVD catalog. The building block of
 * {@link applyLivd}; useful when a consumer holds a single record. Never mutates
 * the record and never fabricates a LOINC.
 *
 * @param record - The result/order record to annotate.
 * @param catalog - The consumer-supplied LIVD catalog.
 * @returns The record's annotation.
 * @example
 * ```ts
 * import { parseAstmRecords, results, defineLivdCatalog, lookupLivdForRecord } from "@cosyte/astm";
 * const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
 * const catalog = defineLivdCatalog([{ vendorCode: "687", loinc: "1920-8" }]);
 * lookupLivdForRecord(results(msg)[0]!, catalog).mapping.status; // "mapped"
 * ```
 */
export function lookupLivdForRecord(
  record: ResultRecord | OrderRecord,
  catalog: LivdCatalog,
): LivdAnnotation {
  const uid = testIdOf(record);
  const recognized = uid ?? recognizeUniversalTestId([]);
  const mapping = mapTestId(recognized, catalog);
  const reportedCode = primaryCode(recognized);
  return {
    recordIndex: record.recordIndex,
    recordType: record.type,
    ...(reportedCode !== undefined ? { reportedCode } : {}),
    provenance: recognized.provenance,
    mapping,
  };
}

/**
 * Apply a consumer-supplied LIVD catalog to a parsed message, producing an
 * **additive, advisory** layer of LOINC annotations over its `R` (result) and `O`
 * (order) records. The source message is never mutated; the raw reported codes and
 * values stay exactly as parsed.
 *
 * Fail-safe: with no matching entry a code is `unmapped` (+ an
 * `ASTM_LIVD_UNMAPPED_CODE` warning); with a conflicting mapping it is `ambiguous`
 * (+ an `ASTM_LIVD_AMBIGUOUS_MAPPING` warning); a LOINC is **never** guessed. When
 * the wire already carried an inline LOINC candidate, it is surfaced from the wire
 * (never overwritten by the catalog).
 *
 * @param msg - A parsed ASTM message.
 * @param catalog - The consumer-supplied LIVD catalog (build with {@link defineLivdCatalog}).
 * @returns The annotations and value-free warnings (deeply frozen).
 * @example
 * ```ts
 * import { parseAstmRecords, defineLivdCatalog, applyLivd } from "@cosyte/astm";
 * const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
 * const catalog = defineLivdCatalog([{ vendorCode: "687", loinc: "1920-8", loincLongName: "AST" }]);
 * const { annotations } = applyLivd(msg, catalog);
 * annotations[0]?.mapping; // { status: "mapped", loinc: "1920-8", loincLongName: "AST", source: "livd", derived: true }
 * ```
 */
export function applyLivd(msg: AstmMessage, catalog: LivdCatalog): LivdResult {
  const annotations: LivdAnnotation[] = [];
  const warnings: AstmLivdWarning[] = [];

  for (const record of msg.records) {
    if (record.type !== "R" && record.type !== "O") continue;
    const annotation = lookupLivdForRecord(record, catalog);
    annotations.push(annotation);

    const position = { recordIndex: record.recordIndex, recordType: record.type };
    if (annotation.mapping.status === "unmapped") {
      warnings.push(livdUnmappedCode(position));
    } else if (annotation.mapping.status === "ambiguous") {
      warnings.push(livdAmbiguousMapping(position));
    }
  }

  return deepFreeze({ annotations, warnings });
}
