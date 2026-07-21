/**
 * `defineAstmProfile()` — the public factory for building immutable
 * {@link AstmProfile} objects with the safety rules enforced and `describe()`
 * attached. Mirrors the sibling `@cosyte/hl7` `defineProfile()` / `@cosyte/ccda`
 * `defineCcdaProfile()` shape (name / lineage / `extends`-merge / `describe`) while
 * modelling ASTM quirks — a tolerated warning code with provenance, plus the
 * optional raw-vs-framed transport override — rather than HL7 v2 Z-segments or
 * C-CDA template deviations.
 *
 * Zero runtime deps. No `any`; immutability at the return boundary via
 * `Object.freeze` (top-level, matching the sibling's boundary-freeze doctrine).
 */

import { buildDescribe } from "./describe.js";
import {
  mergeDescription,
  mergeLineage,
  mergeProvenance,
  mergeTolerations,
  mergeTransport,
  normaliseParents,
} from "./merge.js";
import type { AstmProfile, DefineAstmProfileOptions } from "./types.js";
import {
  validateOptionKeys,
  validateProfileName,
  validateTolerations,
  validateTransport,
} from "./validate.js";

/**
 * Build a frozen {@link AstmProfile} from a validated options object. Throws
 * {@link AstmProfileDefinitionError} on a bad name, an unknown option key, an
 * invalid `transport`, or an invalid `tolerate` entry — including the **safety
 * rule**: a profile may never tolerate a safety-critical warning code (default-deny
 * across all three registries).
 *
 * `extends` composes profiles: lineage, `tolerate`, `transport`, `provenance`, and
 * `description` merge (parents left-to-right, then self; scalars are child-wins).
 * The merged `tolerate` set is re-validated so a safety-critical code cannot sneak
 * in via a hand-crafted parent.
 *
 * @param opts - The profile definition; see {@link DefineAstmProfileOptions}.
 * @returns A frozen, immutable profile with `describe()` attached.
 * @throws {@link AstmProfileDefinitionError} on any invalid definition.
 * @example
 * ```ts
 * import { defineAstmProfile } from "@cosyte/astm";
 * const site = defineAstmProfile({
 *   name: "acme-analyzer",
 *   description: "Acme's inbound raw-TCP analyzer",
 *   transport: "raw",
 *   tolerate: [
 *     { code: "ASTM_RECORD_UNKNOWN_TYPE", rationale: "emits a vendor QC record letter" },
 *   ],
 *   provenance: { source: "Acme host-interface manual", reference: "internal-2026" },
 * });
 * site.lineage; // ["acme-analyzer"]
 * console.log(site.describe?.());
 * ```
 */
export function defineAstmProfile(opts: DefineAstmProfileOptions): AstmProfile {
  // Fail-fast on name so every downstream throw can name the profile.
  validateProfileName(opts);
  validateOptionKeys(opts);
  validateTransport(opts);

  const selfTolerate = opts.tolerate ?? [];
  // Pre-merge validation surfaces the offending profile's own name.
  validateTolerations(selfTolerate, opts.name);

  const parents = normaliseParents(opts.extends);
  const lineage = mergeLineage(parents, opts.name);
  const tolerate = mergeTolerations(parents, selfTolerate);
  const transport = mergeTransport(parents, opts.transport);
  const provenance = mergeProvenance(parents, opts.provenance);
  const description = mergeDescription(parents, opts.description);

  // Post-merge re-validation — a safety-critical code inherited from a hand-crafted
  // parent is refused here.
  validateTolerations(tolerate, opts.name);

  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const profile: Mutable<AstmProfile> = {
    name: opts.name,
    lineage,
    tolerate,
  };
  if (description !== undefined) profile.description = description;
  if (transport !== undefined) profile.transport = transport;
  if (provenance !== undefined) profile.provenance = provenance;

  const finalised = profile as AstmProfile;
  profile.describe = (): string => buildDescribe(finalised);

  return Object.freeze(profile) as AstmProfile;
}
