/**
 * The **additive, advisory** LIVD annotation layer. {@link applyLivd}
 * reads a parsed {@link AstmMessage} and a consumer-supplied {@link LivdCatalog}
 * and returns a **separate** layer of per-record LOINC annotations: it **never
 * mutates, alters, or drops** the raw reported code or value. Recognition is an
 * annotation, not a rewrite: the wire stays exactly as parsed.
 *
 * **The never-fabricate rule (the safety-critical point).** A vendor code with no
 * single LIVD mapping surfaces as a typed `unmapped`/`ambiguous`/`no-vendor-code`/
 * `no-code` annotation: **never** a guessed LOINC. A wrong LOINC mis-identifies a
 * test, so the only LOINC this layer ever reports is one the consumer's catalog
 * vouched for (labeled `derived`), and otherwise it reports nothing but the miss.
 *
 * **The wire never answers the analyte-identity question.** The catalog is
 * consulted whenever a vendor/local code is present, and it is consulted with that
 * code alone. A populated component 1 rides along verbatim as
 * {@link LivdAnnotation.unvalidatedWireValue}, is never validated, and is never
 * reported as a LOINC. Where it differs from what the catalog vouched for, the
 * difference is reported as its own fact
 * ({@link LivdAnnotation.wireValueDisagreesWithCatalog}) and is **never resolved**:
 * both values are surfaced, and nothing here picks between them.
 *
 * **The units DO answer, and only for choosing between the catalog's own
 * candidates.** One vendor analyte code legitimately maps to several LOINCs that
 * differ by reporting unit, so the catalog is consulted with the vendor code AND with
 * the units field 5 of the `R` record carried, verbatim. That comparison is exact and
 * case sensitive, never a UCUM semantic comparison, and a unit-selected answer says
 * so on its output. It only ever narrows the candidate list the consumer's own
 * catalog produced: it can never introduce a LOINC, never overrides the catalog, and
 * a record with no readable units simply leaves the ambiguity standing.
 */

import { deepFreeze } from "../common/freeze.js";
import { recognizeUniversalTestId } from "../common/coding-system.js";
import type { UniversalTestId, UniversalTestIdProvenance } from "../common/coding-system.js";
import type { AstmMessage, OrderRecord, ResultRecord } from "../records/types.js";

import type {
  LivdAmbiguityReason,
  LivdCandidate,
  LivdCatalog,
  LivdUnitComparison,
} from "./catalog.js";
import { livdAmbiguousMapping, livdUnmappedCode } from "./warnings.js";
import type { AstmLivdWarning } from "./warnings.js";

/**
 * The outcome of looking one record's Universal Test ID up in a LIVD catalog: a
 * closed, mutually exclusive discriminant. There is no case in which a LOINC is
 * guessed, and no case in which a value the wire carried is reported as a LOINC.
 *
 * - `mapped`, the vendor/local code resolved to a single LOINC **via the catalog**
 *   (labeled `derived: true`, `source: "livd"`).
 * - `unmapped`: a vendor/local code was looked up and the catalog held no entry
 *   for it (a hit whose LOINC is a zero-length string is reported here too: an
 *   empty LOINC is not an answer).
 * - `ambiguous`: a vendor/local code matching more than one distinct LOINC; the
 *   candidates are surfaced but **none is chosen**.
 * - `no-vendor-code`: component 1 is populated and there is no vendor/local code,
 *   so nothing was looked up. The wire value is surfaced unvalidated, and is never
 *   used as a lookup key: the catalog is keyed on the vendor transmission code.
 * - `no-code`: the record carried no usable test code at all (name-only/empty), so
 *   there was nothing to map.
 */
export type LivdMapping =
  | {
      readonly status: "mapped";
      readonly loinc: string;
      readonly loincLongName?: string;
      /** The chosen catalog row's Vendor Specimen Description, verbatim, when supplied. */
      readonly vendorSpecimenDescription?: string;
      /** The chosen catalog row's Vendor Result Description, verbatim, when supplied. */
      readonly vendorResultDescription?: string;
      /** The chosen catalog row's representative unit, verbatim, when supplied. */
      readonly representativeUnit?: string;
      /**
       * Present **if and only if** the record's units chose this LOINC from more than one candidate,
       * and it states what that comparison was: verbatim and case sensitive, not UCUM semantic.
       */
      readonly unitComparison?: LivdUnitComparison;
      readonly source: "livd";
      readonly derived: true;
    }
  | { readonly status: "unmapped" }
  | {
      readonly status: "ambiguous";
      readonly candidates: readonly string[];
      /** Every candidate row with its LIVD attributes, when the catalog supplied any. */
      readonly candidateDetails?: readonly LivdCandidate[];
      /** Why the units did not settle it, when the catalog supplied the attributes to say. */
      readonly reason?: LivdAmbiguityReason;
    }
  | { readonly status: "no-vendor-code" }
  | { readonly status: "no-code" };

/**
 * One record's LIVD annotation: which record, the code the catalog was consulted
 * with (verbatim), how it was recognized, the lookup outcome, and the two facts
 * about a populated component 1 that ride alongside **any** outcome. Additive: it
 * points at the record by index and never replaces it.
 *
 * @example
 * ```ts
 * import type { LivdAnnotation } from "@cosyte/astm";
 * const a: LivdAnnotation = {
 *   recordIndex: 3,
 *   recordType: "R",
 *   reportedCode: "687",
 *   unvalidatedWireValue: "Glucose",
 *   wireValueDisagreesWithCatalog: true,
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
  /**
   * The vendor/local code the catalog was consulted with, verbatim. Absent when no
   * vendor/local code was present, because then nothing was looked up. It is never
   * a component 1 value.
   */
  readonly reportedCode?: string;
  /**
   * Component 1 when populated, verbatim: a wire value this library **does not
   * vouch for**, carried on every outcome and never validated, never promoted to a
   * LOINC, and never used as a lookup key. Absent when component 1 is empty.
   */
  readonly unvalidatedWireValue?: string;
  /**
   * `true` if and only if the catalog vouched for exactly one LOINC for the
   * vendor/local code, component 1 is populated, and that value is not
   * byte-identical to that LOINC. `false` in **every** other case, including where
   * the catalog vouched for no single LOINC (a miss, an ambiguity, no vendor code,
   * no code at all): asserting a disagreement there would claim the catalog spoke
   * about a code it never spoke about.
   *
   * It reports the difference and **nothing else**. Neither value is marked
   * correct, neither is suppressed, and no field says the difference was settled.
   */
  readonly wireValueDisagreesWithCatalog: boolean;
  /** How the identifier was recognized in the Universal Test ID (provenance only, never a lookup). */
  readonly provenance: UniversalTestIdProvenance;
  /** The lookup outcome: never a guessed LOINC. */
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
  /**
   * A value-free warning per `unmapped`/`ambiguous` code: never per `mapped`, and
   * never per `no-vendor-code`/`no-code`, where no lookup happened at all.
   */
  readonly warnings: readonly AstmLivdWarning[];
}

/**
 * Map a recognized Universal Test ID against the catalog: the pure core of the
 * annotation.
 *
 * The lookup key is the vendor/local code and nothing else. A component 1 value is
 * never a key: the catalog is a vendor-transmission-code index, so looking a
 * LOINC-slot value up in it would manufacture hits. Which case this is, is decided
 * by which components are populated, never by what a value looks like.
 */
function mapTestId(
  uid: UniversalTestId,
  catalog: LivdCatalog,
  reportedUnits: string | undefined,
): LivdMapping {
  const code = uid.localCode;
  if (code === undefined) {
    // Positional, both ways: a populated component 1 with no vendor code is a
    // record whose only candidate identifier this library will not vouch for, and
    // that is a different outcome from a record that carried no code at all.
    return uid.unvalidatedWireValue !== undefined
      ? { status: "no-vendor-code" }
      : { status: "no-code" };
  }

  const hit = catalog.lookup(code, reportedUnits);
  switch (hit.status) {
    case "mapped":
      // A zero-length LOINC is not an answer: report the miss exactly as for a
      // catalog holding no entry, never an empty LOINC as catalog-vouched. Anything
      // else the catalog returns is carried verbatim; it is the consumer's data.
      if (hit.loinc.length === 0) return { status: "unmapped" };
      return {
        status: "mapped",
        loinc: hit.loinc,
        ...(hit.loincLongName !== undefined ? { loincLongName: hit.loincLongName } : {}),
        ...(hit.vendorSpecimenDescription !== undefined
          ? { vendorSpecimenDescription: hit.vendorSpecimenDescription }
          : {}),
        ...(hit.vendorResultDescription !== undefined
          ? { vendorResultDescription: hit.vendorResultDescription }
          : {}),
        ...(hit.representativeUnit !== undefined
          ? { representativeUnit: hit.representativeUnit }
          : {}),
        ...(hit.unitComparison !== undefined ? { unitComparison: hit.unitComparison } : {}),
        source: "livd",
        derived: true,
      };
    case "ambiguous":
      return {
        status: "ambiguous",
        candidates: hit.candidates,
        ...(hit.candidateDetails !== undefined ? { candidateDetails: hit.candidateDetails } : {}),
        ...(hit.reason !== undefined ? { reason: hit.reason } : {}),
      };
    case "unmapped":
      return { status: "unmapped" };
  }
}

/**
 * The units the catalog is consulted with: field 5 of an `R` record, verbatim, and
 * nothing else. An `O` record has no units field, and a record whose units are
 * missing, empty, or unreadable because the line was truncated or malformed yields
 * `undefined` here, which the catalog reads as NO UNITS REPORTED. That is a refusal
 * to compare, never a raise and never a dropped record: the annotation is still
 * produced, and a code carrying several candidates stays `ambiguous`.
 */
function unitsOf(record: ResultRecord | OrderRecord): string | undefined {
  return record.type === "R" ? record.units : undefined;
}

/**
 * Whether the wire and the catalog name different codes: `true` only where the
 * catalog vouched for exactly one LOINC and a POPULATED component 1 is not
 * byte-identical to it. Never computed against a candidate list, which would
 * corroborate exactly one candidate of an ambiguous code.
 */
function disagrees(uid: UniversalTestId, mapping: LivdMapping): boolean {
  if (mapping.status !== "mapped") return false;
  const wire = uid.unvalidatedWireValue;
  return wire !== undefined && wire !== mapping.loinc;
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
  const mapping = mapTestId(recognized, catalog, unitsOf(record));
  // The code REPORTED as consulted is the code the catalog was consulted WITH.
  const reportedCode = recognized.localCode;
  const wireValue = recognized.unvalidatedWireValue;
  return {
    recordIndex: record.recordIndex,
    recordType: record.type,
    ...(reportedCode !== undefined ? { reportedCode } : {}),
    ...(wireValue !== undefined ? { unvalidatedWireValue: wireValue } : {}),
    wireValueDisagreesWithCatalog: disagrees(recognized, mapping),
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
 * (+ an `ASTM_LIVD_AMBIGUOUS_MAPPING` warning); a LOINC is **never** guessed. A
 * populated component 1 never short-circuits the lookup and is never reported as a
 * LOINC: it is carried verbatim as an unvalidated wire value, and where it differs
 * from the catalog's answer the difference is reported and left unresolved.
 *
 * A catalog is code a consumer supplies, so a lookup that throws propagates to the
 * caller unchanged: a consumer's own failure is never reported as a catalog miss,
 * and no partially annotated result is returned.
 *
 * @param msg - A parsed ASTM message.
 * @param catalog - The consumer-supplied LIVD catalog (build with {@link defineLivdCatalog}).
 * @returns The annotations and value-free warnings (deeply frozen).
 * @example
 * ```ts
 * import { parseAstmRecords, defineLivdCatalog, applyLivd } from "@cosyte/astm";
 * const msg = parseAstmRecords("H|\\^&\rR|1|Glucose^^^687|28.6|U/L||N||F\rL|1\r");
 * const catalog = defineLivdCatalog([{ vendorCode: "687", loinc: "1920-8", loincLongName: "AST" }]);
 * const [a] = applyLivd(msg, catalog).annotations;
 * a?.mapping; // { status: "mapped", loinc: "1920-8", loincLongName: "AST", source: "livd", derived: true }
 * a?.unvalidatedWireValue; // "Glucose": carried verbatim, vouched for by nothing
 * a?.wireValueDisagreesWithCatalog; // true: reported, never resolved
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
