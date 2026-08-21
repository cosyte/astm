/**
 * Code-system **provenance recognition** for the ASTM Universal Test ID.
 *
 * ASTM carries a test identifier as a caret-component field (`^^^687`): the
 * spec's component order is LOINC-slot / test-name / coding-scheme / local-code.
 * In the field the way real analyzers emit it:
 *
 * - **component 1** is a LOINC slot: *almost always empty*, and the governing
 *   mapping guide puts LOINC on the instrument wire explicitly out of scope, so
 *   whatever arrives there is a wire value this library **does not vouch for**
 *   and never treats as an identifier;
 * - **component 4** is the vendor/local code: the identifier that is actually
 *   present, and therefore the **only** identifier a result is keyed on here.
 *
 * Following the sibling parsers' conservative posture, this module is a
 * **structural recognizer, not a dictionary**: it tags where a code came from
 * (its provenance) and surfaces every code verbatim. It does not look codes up,
 * does not validate them, and bundles no LOINC/SNOMED tables. In particular it
 * performs **no LOINC validation of any kind** and never decides what a
 * first-component value "looks like": `2345-7` and `Glucose` in component 1 are
 * treated identically, and the routing is positional throughout.
 */

/** Where a Universal Test ID's usable identifier came from. */
export type UniversalTestIdProvenance =
  /** Component 4 (the vendor/local code) carries the identifier. */
  | "local-code"
  /**
   * Component 1 is populated and there is no vendor/local code, so there is **no**
   * identifier: the value is surfaced unvalidated and is never keyed on.
   */
  | "unvalidated-wire-value-only"
  /** Only the test name (component 2) is present: no code. */
  | "name-only"
  /** Nothing usable in the field. */
  | "empty";

/**
 * A recognized ASTM Universal Test ID. All components are surfaced verbatim
 * (already escape-decoded by the tokenizer); nothing is looked up.
 *
 * @example
 * ```ts
 * import { recognizeUniversalTestId } from "@cosyte/astm";
 * const u = recognizeUniversalTestId(["", "", "", "687"]);
 * u.localCode;   // "687"
 * u.provenance;  // "local-code"
 * ```
 */
export interface UniversalTestId {
  /** The field's components, verbatim and in order. */
  readonly components: readonly string[];
  /**
   * Component 1 when populated, verbatim: a wire value this library **does not
   * vouch for**. It is not validated, is not reported as a LOINC or a LOINC
   * candidate, and is never the code a result is keyed on.
   */
  readonly unvalidatedWireValue?: string;
  /** Component 2: the test / battery name, when present. */
  readonly testName?: string;
  /** Component 3: the coding-scheme selector, when present. */
  readonly codingScheme?: string;
  /** Component 4, the vendor/local code: the only identifier a result is keyed on. */
  readonly localCode?: string;
  /** Where the primary identifier came from. */
  readonly provenance: UniversalTestIdProvenance;
}

/**
 * Recognize a Universal Test ID from a field's already-decoded components.
 *
 * The provenance is decided **positionally**, by which components are populated,
 * and never by what a value looks like.
 *
 * @param components - The component strings (escape-decoded), in order.
 * @returns The recognized, provenance-tagged Universal Test ID.
 * @example
 * ```ts
 * import { recognizeUniversalTestId, primaryCode } from "@cosyte/astm";
 * primaryCode(recognizeUniversalTestId(["", "Glucose", "L", "687"])); // "687"
 * ```
 */
export function recognizeUniversalTestId(components: readonly string[]): UniversalTestId {
  const nonEmpty = (i: number): string | undefined => {
    const c = components[i];
    return c !== undefined && c.length > 0 ? c : undefined;
  };
  const unvalidatedWireValue = nonEmpty(0);
  const testName = nonEmpty(1);
  const codingScheme = nonEmpty(2);
  const localCode = nonEmpty(3);

  let provenance: UniversalTestIdProvenance;
  if (localCode !== undefined) provenance = "local-code";
  else if (unvalidatedWireValue !== undefined) provenance = "unvalidated-wire-value-only";
  else if (testName !== undefined) provenance = "name-only";
  else provenance = "empty";

  const base = { components, provenance };
  return {
    ...base,
    ...(unvalidatedWireValue !== undefined ? { unvalidatedWireValue } : {}),
    ...(testName !== undefined ? { testName } : {}),
    ...(codingScheme !== undefined ? { codingScheme } : {}),
    ...(localCode !== undefined ? { localCode } : {}),
  };
}

/**
 * The primary code to key a result on: the local (vendor) code, and nothing else.
 * Returns `undefined` when the field carries no vendor/local code, **including**
 * when component 1 is populated: never a guess, and never a value this library
 * does not vouch for. Read `unvalidatedWireValue` for that value.
 *
 * @param u - A recognized Universal Test ID.
 * @returns The vendor/local code, or `undefined`.
 * @example
 * ```ts
 * import { primaryCode, recognizeUniversalTestId } from "@cosyte/astm";
 * primaryCode(recognizeUniversalTestId(["2345-7", "Glucose", "LN", "687"])); // "687"
 * primaryCode(recognizeUniversalTestId(["Glucose", "", "", ""]));            // undefined
 * ```
 */
export function primaryCode(u: UniversalTestId): string | undefined {
  return u.localCode;
}
