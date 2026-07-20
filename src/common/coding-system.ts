/**
 * Code-system **provenance recognition** for the ASTM Universal Test ID.
 *
 * ASTM carries a test identifier as a caret-component field (`^^^687`): the
 * spec's component order is LOINC-slot / test-name / coding-scheme / local-code.
 * In the field the way real analyzers emit it:
 *
 * - **component 1** is a LOINC slot — *almost always empty*; a few vendors place
 *   an inline LOINC when one exists;
 * - **component 4** is the vendor/local code — the identifier that is actually
 *   present, and therefore the **primary** identifier here.
 *
 * Following the sibling parsers' conservative posture, this module is a
 * **structural recognizer, not a dictionary**: it tags where a code came from
 * (its provenance) and surfaces every code verbatim. It does not look codes up,
 * does not validate them, and bundles no LOINC/SNOMED tables.
 */

/** Where a Universal Test ID's usable identifier came from. */
export type UniversalTestIdProvenance =
  /** Component 1 (the LOINC slot) is populated — a candidate LOINC, recognized not validated. */
  | "inline-loinc-candidate"
  /** Component 4 (the vendor/local code) carries the identifier. */
  | "local-code"
  /** Only the test name (component 2) is present — no code. */
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
  /** Component 1 when populated — a *candidate* LOINC (provenance only, never validated). */
  readonly loincCandidate?: string;
  /** Component 2 — the test / battery name, when present. */
  readonly testName?: string;
  /** Component 3 — the coding-scheme selector, when present. */
  readonly codingScheme?: string;
  /** Component 4 — the vendor/local code: the primary identifier when no inline LOINC is given. */
  readonly localCode?: string;
  /** Where the primary identifier came from. */
  readonly provenance: UniversalTestIdProvenance;
}

/**
 * Recognize a Universal Test ID from a field's already-decoded components.
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
  const loincCandidate = nonEmpty(0);
  const testName = nonEmpty(1);
  const codingScheme = nonEmpty(2);
  const localCode = nonEmpty(3);

  let provenance: UniversalTestIdProvenance;
  if (loincCandidate !== undefined) provenance = "inline-loinc-candidate";
  else if (localCode !== undefined) provenance = "local-code";
  else if (testName !== undefined) provenance = "name-only";
  else provenance = "empty";

  const base = { components, provenance };
  return {
    ...base,
    ...(loincCandidate !== undefined ? { loincCandidate } : {}),
    ...(testName !== undefined ? { testName } : {}),
    ...(codingScheme !== undefined ? { codingScheme } : {}),
    ...(localCode !== undefined ? { localCode } : {}),
  };
}

/**
 * The primary code to key a result on: the inline LOINC candidate when a vendor
 * supplied one, otherwise the local (vendor) code. Returns `undefined` when the
 * field carries no code at all (name-only or empty) — never a guess.
 *
 * @param u - A recognized Universal Test ID.
 * @returns The primary code, or `undefined`.
 * @example
 * ```ts
 * import { primaryCode, recognizeUniversalTestId } from "@cosyte/astm";
 * primaryCode(recognizeUniversalTestId(["2345-7", "Glucose", "LN", "687"])); // "2345-7"
 * ```
 */
export function primaryCode(u: UniversalTestId): string | undefined {
  return u.loincCandidate ?? u.localCode;
}
