import { describe, expect, it } from "vitest";

import { defineAstmProfile } from "../../src/index.js";

/**
 * The whole text `describe()` writes: one line a fact, a line only for a fact the profile states,
 * and each tolerance with the place it is narrowed to. Every name and reference is synthetic.
 */

const UNKNOWN_ESCAPE = "ASTM_UNKNOWN_ESCAPE_SEQUENCE";

describe("describe()", () => {
  it("writes only the name, the lineage and the empty tolerance list for a bare profile", () => {
    const bare = defineAstmProfile({ name: "synthetic-bare" });
    expect(bare.describe?.()).toBe(
      [
        "Profile 'synthetic-bare'",
        "  lineage: synthetic-bare",
        "  tolerates: nothing (conservative baseline)",
      ].join("\n"),
    );
  });

  it("writes every stated fact, each tolerance with its scope, one line each", () => {
    const parent = defineAstmProfile({ name: "synthetic-parent" });
    const child = defineAstmProfile({
      name: "synthetic-child",
      extends: parent,
      description: "a synthetic analyzer interface",
      transport: "raw",
      provenance: { source: "a synthetic manual", reference: "https://example.com/manual" },
      tolerate: [
        {
          code: UNKNOWN_ESCAPE,
          rationale: "seen in result values",
          match: { recordType: "R", fieldIndex: 4 },
        },
        { code: UNKNOWN_ESCAPE, rationale: "seen in patient records", match: { recordType: "P" } },
        { code: UNKNOWN_ESCAPE, rationale: "seen in field 5", match: { fieldIndex: 5 } },
        { code: "ASTM_NONSTANDARD_DELIMITERS", rationale: "the analyzer's own set" },
      ],
    });
    expect(child.describe?.()).toBe(
      [
        "Profile 'synthetic-child'",
        "  description: a synthetic analyzer interface",
        "  lineage: synthetic-parent → synthetic-child",
        "  transport: forces raw framing (detection override)",
        "  grounded in: a synthetic manual (https://example.com/manual)",
        "  tolerates 4 quirk(s):",
        `    - ${UNKNOWN_ESCAPE} @record R.4: seen in result values`,
        `    - ${UNKNOWN_ESCAPE} @record P: seen in patient records`,
        `    - ${UNKNOWN_ESCAPE} @field 5: seen in field 5`,
        "    - ASTM_NONSTANDARD_DELIMITERS: the analyzer's own set",
      ].join("\n"),
    );
  });
});
