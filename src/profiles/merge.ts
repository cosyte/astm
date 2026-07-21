/**
 * Pure merge helpers consumed by `defineAstmProfile` when `opts.extends` is
 * supplied. Every helper takes a `readonly parents[]` + a self value and returns
 * the merged result; none mutate input. Mirrors the sibling `@cosyte/hl7` /
 * `@cosyte/ccda` profile merge semantics: lineage first-occurrence dedupe,
 * `tolerate` concat + dedupe (parents before self, last-wins on rationale), scalar
 * last-wins (child, else the last parent that carries a value).
 *
 * Zero runtime deps. Post-merge safety re-validation (a tolerated code must not be
 * safety-critical) is the CALLER's responsibility — these helpers are pure reducers.
 *
 * @internal
 */

import type { AstmFraming } from "../ltp/transport.js";
import type { AstmProfile, AstmProfileProvenance, AstmQuirkTolerance } from "./types.js";

/**
 * Normalise the `extends` input to a readonly array. Accepts a single profile or an
 * array; returns `[]` for `undefined` so callers treat "no parents" identically to
 * "zero parents".
 *
 * @internal
 */
export function normaliseParents(
  ext: AstmProfile | readonly AstmProfile[] | undefined,
): readonly AstmProfile[] {
  if (ext === undefined) return [];
  if (Array.isArray(ext)) return ext as readonly AstmProfile[];
  return [ext as AstmProfile];
}

/**
 * Compute lineage: flatten parent lineages (or `[parent.name]` when a parent has
 * none), append `selfName`, dedupe preserving first occurrence.
 *
 * @internal
 */
export function mergeLineage(parents: readonly AstmProfile[], selfName: string): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parents) {
    const parentLineage = p.lineage.length > 0 ? p.lineage : [p.name];
    for (const n of parentLineage) {
      if (!seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  if (!seen.has(selfName)) out.push(selfName);
  return Object.freeze(out);
}

/**
 * Stable signature for a tolerance, used for concat-dedupe: the code plus the
 * optional structural match keys. Two tolerances with the same signature collapse
 * to the last (child-wins on rationale).
 *
 * @internal
 */
function toleranceKey(t: AstmQuirkTolerance): string {
  return `${t.code} ${t.match?.recordType ?? ""} ${String(t.match?.fieldIndex ?? "")}`;
}

/**
 * Merge `tolerate` sets: every parent (left-to-right) then self, deduped by
 * {@link toleranceKey} with the **last** occurrence winning (so a child can refine
 * a parent's rationale for the same code+match). Order of first appearance is
 * preserved.
 *
 * @internal
 */
export function mergeTolerations(
  parents: readonly AstmProfile[],
  self: readonly AstmQuirkTolerance[],
): readonly AstmQuirkTolerance[] {
  const order: string[] = [];
  const byKey = new Map<string, AstmQuirkTolerance>();
  const layer = (list: readonly AstmQuirkTolerance[]): void => {
    for (const t of list) {
      const key = toleranceKey(t);
      if (!byKey.has(key)) order.push(key);
      byKey.set(key, t);
    }
  };
  for (const p of parents) layer(p.tolerate);
  layer(self);
  return Object.freeze(order.map((k) => byKey.get(k) as AstmQuirkTolerance));
}

/**
 * Merge the `provenance` scalar: child wins when provided; otherwise the LAST parent
 * that carries one; otherwise `undefined`.
 *
 * @internal
 */
export function mergeProvenance(
  parents: readonly AstmProfile[],
  self: AstmProfileProvenance | undefined,
): AstmProfileProvenance | undefined {
  if (self !== undefined) return self;
  for (let i = parents.length - 1; i >= 0; i--) {
    const p = parents[i];
    if (p?.provenance !== undefined) return p.provenance;
  }
  return undefined;
}

/**
 * Merge the `description` scalar: child wins when provided; otherwise the LAST
 * parent that carries one; otherwise `undefined`.
 *
 * @internal
 */
export function mergeDescription(
  parents: readonly AstmProfile[],
  self: string | undefined,
): string | undefined {
  if (self !== undefined) return self;
  for (let i = parents.length - 1; i >= 0; i--) {
    const p = parents[i];
    if (p?.description !== undefined) return p.description;
  }
  return undefined;
}

/**
 * Merge the `transport` override scalar: child wins when provided; otherwise the
 * LAST parent that carries one; otherwise `undefined` (let detection decide).
 *
 * @internal
 */
export function mergeTransport(
  parents: readonly AstmProfile[],
  self: AstmFraming | undefined,
): AstmFraming | undefined {
  if (self !== undefined) return self;
  for (let i = parents.length - 1; i >= 0; i--) {
    const p = parents[i];
    if (p?.transport !== undefined) return p.transport;
  }
  return undefined;
}
