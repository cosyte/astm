/**
 * The **consumer-supplied** LIVD catalog: a vendor-test-code → LOINC index built
 * from an IICC LIVD ("LOINC to Vendor IVD") mapping the consumer provides.
 *
 * **Bring-your-own, by design.** `@cosyte/astm` bundles
 * **no** LOINC, SNOMED, or LIVD data: LOINC is © Regenstrief (redistributable
 * only with its attribution notice) and the public CDC LIVD publication is a
 * SARS-CoV-2-specific file that also carries SNOMED CT (separately licensed), not
 * a general-analyte, public-domain catalog. So the package stays a **structural
 * recognizer, not a dictionary**: it recognizes the Universal Test ID's LOINC slot
 * and surfaces vendor codes verbatim, and this module lets a consumer
 * *supply* their own LIVD file to map those codes, the terminology data, and its
 * license obligations, are the consumer's.
 *
 * **Grounded firsthand on the IICC LIVD digital format / HL7 LIVD IG.** The
 * mapping key is the **Vendor Analyte Code**: the vendor *transmission code* the
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
 *
 * **One vendor analyte code to many LOINCs is the ORDINARY case, and the units are
 * what tell them apart.** The mapping guide this catalog format comes from describes
 * the relationship as many-to-many by design, and its own worked examples are the
 * commonest chemistry analytes: a serum glucose maps to one LOINC as a mass
 * concentration and to another as a substance concentration, and a urine analyte maps
 * to one LOINC at `mmol/L` (a spot specimen) and to another at `mmol/(24.h)` (a 24
 * hour collection). The guide's remedy is to define a mapping per unit, so
 * {@link LivdEntry.representativeUnit} carries that unit and
 * {@link LivdCatalog.lookup} compares it with the units the `R` record reported.
 *
 * **That comparison is VERBATIM and CASE SENSITIVE, and it is not UCUM.** Nothing is
 * normalized, converted, case folded or scaled on either side: a catalog saying
 * `mg/dL` does not match a feed saying `MG/DL`, and a catalog saying `mg/L` never
 * matches `ug/dL` however convertible the two are. UCUM defines a case-insensitive
 * variant of every terminal symbol and requires a program claiming full conformance
 * to compare unit expressions by their SEMANTICS, so a verbatim string comparison is
 * a deliberately limited choice rather than UCUM conformance. It is the only
 * comparison that cannot invent an equivalence, and because a consumer could
 * otherwise read a matched unit as a conformance claim this package does not make,
 * every unit-selected answer states what the comparison was
 * ({@link LivdUnitComparison}).
 *
 * **The three LIVD attributes are carried verbatim and only one of them is matched
 * on.** {@link LivdEntry.vendorSpecimenDescription} and
 * {@link LivdEntry.vendorResultDescription} are free text the guide says is there to
 * help a laboratory choose by hand and is "not intended to be parsed by an IVD
 * Software System that automates the mapping": they are stored and surfaced, never
 * matched on, never normalized. Only the representative unit ever selects.
 */

import { deepFreeze } from "../common/freeze.js";

/**
 * One LIVD mapping row a consumer supplies: a vendor test code and the LOINC it
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
   * The **Vendor Analyte Code**: the vendor transmission code the instrument sends (the local code
   * in an ASTM Universal Test ID, component 4). The mapping key; compared **verbatim** (exact,
   * case-sensitive) against the reported code, never normalized or fuzzy-matched.
   */
  readonly vendorCode: string;
  /**
   * The **LOINC Code** this vendor code maps to (e.g. `"1920-8"`). Taken from the consumer's catalog
   * as-is and **never validated, altered, or invented**: the parser does not ship a LOINC table and
   * cannot check it; it only carries what the catalog says.
   */
  readonly loinc: string;
  /** The **LOINC Long Common Name**, when the catalog supplies it: an optional human-readable label. */
  readonly loincLongName?: string;
  /** The **Vendor Analyte Name**: the vendor's human-readable analyte label, when supplied. */
  readonly vendorAnalyteName?: string;
  /** The device **Manufacturer**, when the catalog scopes the mapping to a device (optional provenance). */
  readonly manufacturer?: string;
  /** The device **Model**, when the catalog scopes the mapping to a device (optional provenance). */
  readonly model?: string;
  /**
   * The **Vendor Specimen Description**: the vendor's own human-readable text for the specimen this
   * mapping is for, such as `"Serum or Plasma"`. Carried **verbatim** (never trimmed, case folded or
   * normalized) and surfaced for a human to read. **Never matched on**: the mapping guide states this
   * text is not intended to be parsed by software that automates the mapping, so choosing on it would
   * be a string guess. Optional, so an existing catalog keeps working unchanged.
   */
  readonly vendorSpecimenDescription?: string;
  /**
   * The **Vendor Result Description**: the vendor's own human-readable text for the result this
   * mapping produces (binary, ordinal, nominal, or a numeric result with its unit). Carried
   * **verbatim** and surfaced for a human to read; **never matched on**, for the same reason as
   * {@link LivdEntry.vendorSpecimenDescription}. Optional.
   */
  readonly vendorResultDescription?: string;
  /**
   * The **representative unit of measure** for this mapping, preferably a UCUM unit (e.g. `"mg/dL"`,
   * `"mmol/L"`, `"mmol/(24.h)"`). This is the **one** attribute a lookup ever selects on: when a
   * vendor analyte code carries several candidate LOINCs, the candidate whose representative unit is
   * **exactly equal** to the units the `R` record reported is chosen, compared verbatim and case
   * sensitively with no normalization, conversion or scale factor on either side.
   *
   * Absent, empty or whitespace only means **not unit qualified**: such a candidate is never selected
   * by a unit comparison, though it is still surfaced among an ambiguous answer's candidates.
   * Optional, so an existing catalog keeps working unchanged.
   */
  readonly representativeUnit?: string;
}

/**
 * How a candidate was selected on its unit, stated on the answer so a consumer cannot
 * read a matched unit as a UCUM conformance claim this package does not make.
 *
 * Present on a {@link LivdLookup} **only** when a unit comparison actually chose
 * between candidate LOINCs. Its whole content is a disclosure: the comparison was a
 * verbatim, case-sensitive string equality, and **not** a UCUM semantic comparison.
 * Nothing was normalized, case folded, scaled or converted on either side.
 *
 * @example
 * ```ts
 * import type { LivdUnitComparison } from "@cosyte/astm";
 * const c: LivdUnitComparison = {
 *   comparison: "verbatim-case-sensitive",
 *   ucumSemantic: false,
 *   reportedUnits: "mg/dL",
 *   representativeUnit: "mg/dL",
 *   note: "...",
 * };
 * ```
 */
export interface LivdUnitComparison {
  /** Always `"verbatim-case-sensitive"`: an exact string equality, nothing normalized. */
  readonly comparison: "verbatim-case-sensitive";
  /** Always `false`. This package does not compare unit expressions by their semantics. */
  readonly ucumSemantic: false;
  /** The units the record reported, verbatim. */
  readonly reportedUnits: string;
  /** The chosen candidate's representative unit, verbatim. Byte-identical to `reportedUnits`. */
  readonly representativeUnit: string;
  /** A human-readable restatement of the two facts above, for a log or a review screen. */
  readonly note: string;
}

/**
 * One candidate mapping behind an `ambiguous` answer: the LOINC plus the LIVD
 * attributes that tell candidates apart, so a human can choose what this package
 * refuses to guess.
 *
 * One per catalog row for the vendor code, in catalog order, so a LOINC appearing in
 * two rows appears twice. Every candidate is surfaced, including one that is not unit
 * qualified: it can never be selected on a unit, but hiding it would hide a mapping
 * the consumer's own catalog holds.
 *
 * @example
 * ```ts
 * import type { LivdCandidate } from "@cosyte/astm";
 * const c: LivdCandidate = {
 *   loinc: "2345-7",
 *   vendorSpecimenDescription: "Serum or Plasma",
 *   representativeUnit: "mg/dL",
 *   unitQualified: true,
 * };
 * ```
 */
export interface LivdCandidate {
  /** The candidate LOINC, verbatim from the catalog row. Never validated. */
  readonly loinc: string;
  /** The row's LOINC Long Common Name, when supplied. */
  readonly loincLongName?: string;
  /** The row's Vendor Specimen Description, verbatim, when supplied. Never matched on. */
  readonly vendorSpecimenDescription?: string;
  /** The row's Vendor Result Description, verbatim, when supplied. Never matched on. */
  readonly vendorResultDescription?: string;
  /** The row's representative unit, verbatim, when supplied. */
  readonly representativeUnit?: string;
  /**
   * `false` when the representative unit is absent, empty or whitespace only. Such a candidate is
   * **never** selected by a unit comparison against any reported units, and is surfaced here anyway.
   */
  readonly unitQualified: boolean;
}

/**
 * Why a code carrying several candidate LOINCs stayed `ambiguous` after the unit
 * comparison ran, or why the comparison could not run at all.
 *
 * - `no-reported-units`: the record reported no usable units (absent, empty or whitespace only), so
 *   nothing could be compared. A unit-qualified candidate is never chosen in this case.
 * - `no-candidate-matched-units`: units were reported and **no** unit-qualified candidate's
 *   representative unit was exactly equal to them.
 * - `multiple-candidates-matched-units`: units were reported and **more than one distinct** candidate
 *   LOINC matched them exactly. Picking one would be a guess.
 *
 * Every one of them surfaces every candidate and chooses no LOINC.
 */
export type LivdAmbiguityReason =
  | "no-reported-units"
  | "no-candidate-matched-units"
  | "multiple-candidates-matched-units";

/**
 * The outcome of looking a vendor code up in a {@link LivdCatalog}. A distinct
 * value per safe disposition: a hit is `mapped`; a miss is `unmapped`; a code that
 * matched more than one **distinct** LOINC and that the reported units did not
 * settle is `ambiguous` with the candidates surfaced but **none chosen**. There is
 * deliberately no "guessed" case.
 *
 * **The added fields are all optional, and a catalog carrying none of the three LIVD
 * attributes answers byte-identically to how it answered before they existed.** They
 * appear only where the consumer's own catalog rows supply something to put in them.
 */
export type LivdLookup =
  /**
   * Exactly one LOINC: one entry, several entries that all agree on the same LOINC, or several
   * candidates of which exactly one had a representative unit equal to the units the record
   * reported (and then, and only then, `unitComparison` says how that comparison was made).
   */
  | {
      readonly status: "mapped";
      readonly loinc: string;
      readonly loincLongName?: string;
      /** The chosen row's Vendor Specimen Description, verbatim, when supplied. Never matched on. */
      readonly vendorSpecimenDescription?: string;
      /** The chosen row's Vendor Result Description, verbatim, when supplied. Never matched on. */
      readonly vendorResultDescription?: string;
      /**
       * The chosen row's representative unit, verbatim, when supplied.
       *
       * **This is provenance about the CATALOG ROW, not a restatement of what the record
       * reported.** Where a vendor code carried a single candidate LOINC across several rows
       * that spell the unit differently, the answer takes the FIRST row's attributes (exactly
       * as it has always taken the first row's `loincLongName`), so this can name a unit the
       * record did not report. Only {@link LivdUnitComparison} asserts the two were equal, and
       * it is present only where a unit actually chose between candidates.
       */
      readonly representativeUnit?: string;
      /**
       * Present **if and only if** a unit comparison chose this LOINC from more than one candidate.
       * Absent where the code carried a single candidate LOINC, which is answered whether or not the
       * units agree: nothing was selected on a unit there, so claiming it was would be false.
       */
      readonly unitComparison?: LivdUnitComparison;
    }
  /** No entry for this code: a miss. The code stays verbatim; no LOINC is invented. */
  | { readonly status: "unmapped" }
  /** More than one distinct LOINC, unsettled: surfaced for inspection, never resolved to one. */
  | {
      readonly status: "ambiguous";
      /** Every distinct candidate LOINC, deduplicated, in first-seen catalog order. */
      readonly candidates: readonly string[];
      /**
       * Every candidate row with its LIVD attributes, one per catalog row (so a LOINC held by two
       * rows appears twice), including rows that are not unit qualified. Present only where at least
       * one row for this vendor code carries one of the three LIVD attributes.
       */
      readonly candidateDetails?: readonly LivdCandidate[];
      /**
       * Why the unit comparison did not settle it. Present under the same condition as
       * `candidateDetails`: a catalog carrying none of the LIVD attributes answers exactly as it did
       * before this field existed.
       */
      readonly reason?: LivdAmbiguityReason;
    };

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
   * more than one distinct LOINC that the reported units did not settle: never a
   * guess.
   *
   * `reportedUnits` are the units the `R` record carried, verbatim. They are compared
   * with each candidate's {@link LivdEntry.representativeUnit} by exact,
   * case-sensitive string equality and by nothing else. Omitting them, or passing an
   * empty or whitespace-only string, means **no units were reported**: no
   * unit-qualified candidate is chosen and a code carrying several candidates stays
   * `ambiguous`. A code carrying exactly one candidate LOINC is answered either way.
   *
   * Implementing this interface by hand stays source compatible: a `lookup` declared
   * with the vendor code alone simply ignores the units, and answers as it always did.
   *
   * @param vendorCode - The reported vendor/local test code.
   * @param reportedUnits - The units the record reported, verbatim, when it reported any.
   * @returns The lookup outcome.
   */
  lookup(vendorCode: string, reportedUnits?: string): LivdLookup;
}

/**
 * The disclosure sentence carried on every unit-selected answer. A constant: it
 * describes the comparison this package makes and carries no field data.
 */
const VERBATIM_UNIT_NOTE =
  "Selected by comparing the units the record reported with the catalog entry's representative " +
  "unit verbatim and case sensitively (exact string equality). This is NOT a UCUM semantic " +
  "comparison: neither side was normalized, case folded, scaled or converted, and this package " +
  "does not claim full UCUM conformance.";

/** Whether a row carries any of the three LIVD attributes, i.e. has something new to say. */
function carriesLivdAttributes(entry: LivdEntry): boolean {
  return (
    entry.vendorSpecimenDescription !== undefined ||
    entry.vendorResultDescription !== undefined ||
    entry.representativeUnit !== undefined
  );
}

/**
 * Whether a row can ever be selected on its unit. Absent, empty and whitespace only
 * are all NOT unit qualified: a blank is not a unit, and treating it as one would let
 * a blank on the wire select a candidate.
 */
function isUnitQualified(entry: LivdEntry): boolean {
  const unit = entry.representativeUnit;
  return unit !== undefined && unit.trim() !== "";
}

/**
 * The reported units, or `undefined` when the record reported none usable. Absent,
 * empty and whitespace only are one case: no units were reported. This is the ONLY
 * place either side is inspected beyond an equality, and it decides nothing about
 * equality itself, which stays byte-exact.
 */
function usableUnits(reportedUnits: string | undefined): string | undefined {
  if (reportedUnits === undefined || reportedUnits.trim() === "") return undefined;
  return reportedUnits;
}

/** Surface one catalog row as a candidate, every attribute verbatim. */
function candidateOf(entry: LivdEntry): LivdCandidate {
  return {
    loinc: entry.loinc,
    ...(entry.loincLongName !== undefined ? { loincLongName: entry.loincLongName } : {}),
    ...(entry.vendorSpecimenDescription !== undefined
      ? { vendorSpecimenDescription: entry.vendorSpecimenDescription }
      : {}),
    ...(entry.vendorResultDescription !== undefined
      ? { vendorResultDescription: entry.vendorResultDescription }
      : {}),
    ...(entry.representativeUnit !== undefined
      ? { representativeUnit: entry.representativeUnit }
      : {}),
    unitQualified: isUnitQualified(entry),
  };
}

/**
 * The disclosure for a unit-selected answer. One argument, deliberately: the whole
 * selection rule is that the two strings are equal, so carrying them separately would
 * make room for an answer whose two units differ, which is the thing that cannot have
 * happened. Both fields are the record's units, verbatim.
 */
function unitComparisonOf(matchedUnits: string): LivdUnitComparison {
  return {
    comparison: "verbatim-case-sensitive",
    ucumSemantic: false,
    reportedUnits: matchedUnits,
    representativeUnit: matchedUnits,
    note: VERBATIM_UNIT_NOTE,
  };
}

/**
 * The `mapped` answer for one row. Every optional field is spread conditionally, so a
 * row carrying none of them yields exactly the object this function's caller returned
 * before the LIVD attributes existed.
 */
function mappedFrom(entry: LivdEntry, unitComparison?: LivdUnitComparison): LivdLookup {
  return {
    status: "mapped",
    loinc: entry.loinc,
    ...(entry.loincLongName !== undefined ? { loincLongName: entry.loincLongName } : {}),
    ...(entry.vendorSpecimenDescription !== undefined
      ? { vendorSpecimenDescription: entry.vendorSpecimenDescription }
      : {}),
    ...(entry.vendorResultDescription !== undefined
      ? { vendorResultDescription: entry.vendorResultDescription }
      : {}),
    ...(entry.representativeUnit !== undefined
      ? { representativeUnit: entry.representativeUnit }
      : {}),
    ...(unitComparison !== undefined ? { unitComparison } : {}),
  };
}

/** The refusal: every candidate surfaced, every row's attributes surfaced, no LOINC chosen. */
function ambiguous(
  candidates: readonly string[],
  candidateDetails: readonly LivdCandidate[],
  reason: LivdAmbiguityReason,
): LivdLookup {
  return { status: "ambiguous", candidates, candidateDetails, reason };
}

/**
 * Build a {@link LivdCatalog} from LIVD entries a consumer supplies. Entries are
 * indexed by their `vendorCode` (verbatim). When several entries share a vendor
 * code:
 *
 * - all agreeing on the same `loinc` → a single `mapped` result (the first entry's
 *   optional `loincLongName` and LIVD attributes are kept), whether or not the
 *   reported units equal that entry's representative unit;
 * - disagreeing (two distinct LOINCs) → the reported units decide, by exact
 *   case-sensitive equality against each row's
 *   {@link LivdEntry.representativeUnit}. Exactly one distinct LOINC matching is
 *   `mapped`, and the answer states that the comparison was verbatim. None matching,
 *   more than one matching, or no units reported is an `ambiguous` result carrying
 *   every distinct candidate and **no** choice between them.
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
 * @example
 * ```ts
 * import { defineLivdCatalog } from "@cosyte/astm";
 * // One vendor analyte code, two LOINCs, told apart by their representative unit.
 * const glucose = defineLivdCatalog([
 *   { vendorCode: "GLU", loinc: "2345-7", representativeUnit: "mg/dL" },
 *   { vendorCode: "GLU", loinc: "15074-8", representativeUnit: "mmol/L" },
 * ]);
 * glucose.lookup("GLU", "mmol/L").status; // "mapped": 15074-8, on a verbatim unit match
 * glucose.lookup("GLU", "MMOL/L").status; // "ambiguous": the comparison is case sensitive
 * glucose.lookup("GLU").status; // "ambiguous": no units reported, so nothing to compare
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
    lookup(vendorCode: string, reportedUnits?: string): LivdLookup {
      const bucket = index.get(vendorCode);
      if (!bucket || bucket.length === 0) return { status: "unmapped" };

      const distinct = [...new Set(bucket.map((e) => e.loinc))];

      // ONE candidate LOINC is answered as it always was, whether or not the units
      // agree: nothing is being chosen between, so a unit cannot narrow it and an
      // answer that read `mapped` before this feature never becomes `ambiguous`.
      if (distinct.length === 1) {
        const [first] = bucket;
        if (first === undefined) return { status: "unmapped" };
        return deepFreeze(mappedFrom(first));
      }

      // Several candidates. A catalog that carries none of the LIVD attributes has
      // nothing to compare and nothing new to say, so its answer is byte-identical to
      // the one it gave before this feature existed.
      if (!bucket.some(carriesLivdAttributes)) {
        const plain: LivdLookup = { status: "ambiguous", candidates: distinct };
        return deepFreeze(plain);
      }

      const details = bucket.map(candidateOf);
      const units = usableUnits(reportedUnits);
      if (units === undefined) {
        return deepFreeze(ambiguous(distinct, details, "no-reported-units"));
      }

      // The whole comparison, and the only one there is: exact, case-sensitive string
      // equality. Nothing is trimmed, case folded, scaled or converted on either side.
      const matches = bucket.filter((e) => isUnitQualified(e) && e.representativeUnit === units);
      const matchedLoincs = [...new Set(matches.map((e) => e.loinc))];
      const [chosen] = matches;
      if (matchedLoincs.length === 1 && chosen !== undefined) {
        return deepFreeze(mappedFrom(chosen, unitComparisonOf(units)));
      }
      return deepFreeze(
        ambiguous(
          distinct,
          details,
          matchedLoincs.length === 0
            ? "no-candidate-matched-units"
            : "multiple-candidates-matched-units",
        ),
      );
    },
  };
  return Object.freeze(catalog);
}
