/**
 * The **consumer-supplied** LIVD catalog: a vendor-test-code → LOINC index built
 * from an IICC LIVD ("LOINC to Vendor IVD") mapping the consumer provides.
 *
 * **Bring-your-own, by design (roadmap §5, Phase 9).** `@cosyte/astm` bundles
 * **no** LOINC, SNOMED, or LIVD data — LOINC is © Regenstrief (redistributable
 * only with its attribution notice) and the public CDC LIVD publication is a
 * SARS-CoV-2-specific file that also carries SNOMED CT (separately licensed), not
 * a general-analyte, public-domain catalog. So the package stays a **structural
 * recognizer, not a dictionary**: it recognizes the Universal Test ID's LOINC slot
 * and surfaces vendor codes verbatim (Phase 1), and this module lets a consumer
 * *supply* their own LIVD file to map those codes — the terminology data, and its
 * license obligations, are the consumer's.
 *
 * **Grounded firsthand on the IICC LIVD digital format / HL7 LIVD IG.** The
 * mapping key is the **Vendor Analyte Code** — the vendor *transmission code* the
 * instrument sends for an automated test, which is exactly the local code an ASTM
 * analyzer puts in the Universal Test ID (`R`/`O` field, component 4). The mapping
 * target is the **LOINC Code** (with the LOINC Long Common Name as an optional
 * human-readable label). Manufacturer/Model are optional provenance a consumer can
 * carry for their own auditing; this catalog keys on the vendor code alone and,
 * crucially, **refuses to choose** when one code maps to more than one LOINC.
 *
 * **Scope the catalog to the source device fleet.** The ASTM Universal Test ID
 * carries no manufacturer to disambiguate against, so two different instruments that
 * reuse the same transmission code for different analytes would both match a single
 * catalog entry. Supply a catalog built for the analyzers you actually receive from;
 * conflicting entries *within* one catalog are caught and surfaced as `ambiguous`
 * (never resolved to a guess), but cross-device code reuse the catalog cannot see is
 * a catalog-hygiene concern the consumer owns.
 */

import { deepFreeze } from "../common/freeze.js";

/**
 * One LIVD mapping row a consumer supplies — a vendor test code and the LOINC it
 * maps to, plus optional human-readable / provenance fields. Modeled on the IICC
 * LIVD digital format's data elements.
 *
 * @example
 * ```ts
 * import type { LivdEntry } from "@cosyte/astm";
 * const e: LivdEntry = { vendorCode: "687", loinc: "1920-8", loincLongName: "AST" };
 * ```
 */
export interface LivdEntry {
  /**
   * The **Vendor Analyte Code** — the vendor transmission code the instrument sends (the local code
   * in an ASTM Universal Test ID, component 4). The mapping key; compared **verbatim** (exact,
   * case-sensitive) against the reported code — never normalized or fuzzy-matched.
   */
  readonly vendorCode: string;
  /**
   * The **LOINC Code** this vendor code maps to (e.g. `"1920-8"`). Taken from the consumer's catalog
   * as-is and **never validated, altered, or invented** — the parser does not ship a LOINC table and
   * cannot check it; it only carries what the catalog says.
   */
  readonly loinc: string;
  /** The **LOINC Long Common Name**, when the catalog supplies it — an optional human-readable label. */
  readonly loincLongName?: string;
  /** The **Vendor Analyte Name** — the vendor's human-readable analyte label, when supplied. */
  readonly vendorAnalyteName?: string;
  /** The device **Manufacturer**, when the catalog scopes the mapping to a device (optional provenance). */
  readonly manufacturer?: string;
  /** The device **Model**, when the catalog scopes the mapping to a device (optional provenance). */
  readonly model?: string;
}

/**
 * The outcome of looking a vendor code up in a {@link LivdCatalog}. A distinct
 * value per safe disposition — a hit is `mapped`; a miss is `unmapped`; a code that
 * matched more than one **distinct** LOINC is `ambiguous` with the candidates
 * surfaced but **none chosen**. There is deliberately no "guessed" case.
 */
export type LivdLookup =
  /** Exactly one LOINC (one entry, or several entries that all agree on the same LOINC). */
  | {
      readonly status: "mapped";
      readonly loinc: string;
      readonly loincLongName?: string;
    }
  /** No entry for this code — a miss. The code stays verbatim; no LOINC is invented. */
  | { readonly status: "unmapped" }
  /** More than one distinct LOINC — surfaced for inspection, never resolved to one. */
  | { readonly status: "ambiguous"; readonly candidates: readonly string[] };

/**
 * An immutable, consumer-supplied LIVD catalog. Look a vendor code up with
 * {@link LivdCatalog.lookup}; the catalog **never** picks between conflicting
 * LOINCs and **never** mutates. Build one with {@link defineLivdCatalog}.
 */
export interface LivdCatalog {
  /** The number of distinct vendor codes indexed (not the number of input rows). */
  readonly size: number;
  /**
   * Look a vendor code up, verbatim (exact, case-sensitive). Returns `mapped` on a
   * single-LOINC hit, `unmapped` on a miss, and `ambiguous` when the code carries
   * more than one distinct LOINC — never a guess.
   *
   * @param vendorCode - The reported vendor/local test code.
   * @returns The lookup outcome.
   */
  lookup(vendorCode: string): LivdLookup;
}

/**
 * Build a {@link LivdCatalog} from LIVD entries a consumer supplies. Entries are
 * indexed by their `vendorCode` (verbatim). When several entries share a vendor
 * code:
 *
 * - all agreeing on the same `loinc` → a single `mapped` result (the first entry's
 *   optional `loincLongName` is kept);
 * - disagreeing (two distinct LOINCs) → an `ambiguous` result carrying every
 *   distinct candidate, and **no** choice between them.
 *
 * The returned catalog is deeply frozen; nothing is mutated after construction.
 *
 * @param entries - The consumer's LIVD mapping rows.
 * @returns An immutable catalog.
 * @example
 * ```ts
 * import { defineLivdCatalog } from "@cosyte/astm";
 * const catalog = defineLivdCatalog([
 *   { vendorCode: "687", loinc: "1920-8", loincLongName: "AST" },
 *   { vendorCode: "690", loinc: "1742-6", loincLongName: "ALT" },
 * ]);
 * catalog.lookup("687"); // { status: "mapped", loinc: "1920-8", loincLongName: "AST" }
 * catalog.lookup("999"); // { status: "unmapped" }
 * ```
 */
export function defineLivdCatalog(entries: readonly LivdEntry[]): LivdCatalog {
  const index = new Map<string, LivdEntry[]>();
  for (const entry of entries) {
    const bucket = index.get(entry.vendorCode);
    if (bucket) bucket.push(entry);
    else index.set(entry.vendorCode, [entry]);
  }

  const catalog: LivdCatalog = {
    size: index.size,
    lookup(vendorCode: string): LivdLookup {
      const bucket = index.get(vendorCode);
      if (!bucket || bucket.length === 0) return { status: "unmapped" };

      const distinct = [...new Set(bucket.map((e) => e.loinc))];
      if (distinct.length > 1) {
        return deepFreeze({ status: "ambiguous", candidates: distinct });
      }

      const [first] = bucket;
      if (first === undefined) return { status: "unmapped" };
      return deepFreeze({
        status: "mapped",
        loinc: first.loinc,
        ...(first.loincLongName !== undefined ? { loincLongName: first.loincLongName } : {}),
      });
    },
  };
  return Object.freeze(catalog);
}
