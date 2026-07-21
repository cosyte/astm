/**
 * Build the multi-line `describe()` output for an {@link AstmProfile}. Omits lines
 * for absent fields; lineage renders as `a → b → c`. Guaranteed non-empty and
 * always starts with `Profile '<name>'` so the "contains the profile name" contract
 * holds regardless of which lines are omitted.
 *
 * @internal
 */

import type { AstmProfile } from "./types.js";

/**
 * Format an {@link AstmProfile} as a human-readable multi-line description.
 *
 * @internal
 */
export function buildDescribe(p: AstmProfile): string {
  const lines: string[] = [`Profile '${p.name}'`];
  if (p.description !== undefined) {
    lines.push(`  description: ${p.description}`);
  }
  // `describe()` is only ever attached by the factory, which always fills `lineage`
  // with at least the profile's own name — so it is non-empty here.
  lines.push(`  lineage: ${p.lineage.join(" → ")}`);
  if (p.transport !== undefined) {
    lines.push(`  transport: forces ${p.transport} framing (detection override)`);
  }
  if (p.provenance !== undefined) {
    lines.push(`  grounded in: ${p.provenance.source} (${p.provenance.reference})`);
  }
  if (p.tolerate.length === 0) {
    lines.push("  tolerates: nothing (conservative baseline)");
  } else {
    lines.push(`  tolerates ${String(p.tolerate.length)} quirk(s):`);
    for (const t of p.tolerate) {
      const scope =
        t.match?.recordType !== undefined
          ? ` @record ${t.match.recordType}${
              t.match.fieldIndex !== undefined ? `.${String(t.match.fieldIndex)}` : ""
            }`
          : t.match?.fieldIndex !== undefined
            ? ` @field ${String(t.match.fieldIndex)}`
            : "";
      lines.push(`    - ${t.code}${scope}: ${t.rationale}`);
    }
  }
  return lines.join("\n");
}
