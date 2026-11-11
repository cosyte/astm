import { describe, expect, it } from "vitest";

import { defineAstmProfile } from "../../src/index.js";

/**
 * How `extends` merges what several parents say. A scalar comes from the child, else from the last
 * parent that carries it, so a later parent that is silent never erases an earlier one. A tolerance
 * is one entry per code and structural match, so two entries that narrow the same code to
 * different places are both kept. Every name and reference below is synthetic.
 */

const UNKNOWN_ESCAPE = "ASTM_UNKNOWN_ESCAPE_SEQUENCE";

const provenance = {
  source: "a synthetic analyzer manual",
  reference: "https://example.com/synthetic-manual",
};

describe("a scalar the last parent leaves out", () => {
  const informed = defineAstmProfile({
    name: "synthetic-informed",
    description: "a synthetic parent that says everything",
    transport: "raw",
    provenance,
  });
  const silent = defineAstmProfile({ name: "synthetic-silent" });
  const child = defineAstmProfile({ name: "synthetic-child", extends: [informed, silent] });

  it("comes from the parent before it that carries one", () => {
    expect(child.description).toBe("a synthetic parent that says everything");
    expect(child.transport).toBe("raw");
    expect(child.provenance).toEqual(provenance);
  });

  it("comes from the later parent when both carry one", () => {
    const later = defineAstmProfile({
      name: "synthetic-later",
      description: "the later parent",
      transport: "framed",
      provenance: { ...provenance, note: "later" },
    });
    const merged = defineAstmProfile({ name: "synthetic-merged", extends: [informed, later] });
    expect(merged.description).toBe("the later parent");
    expect(merged.transport).toBe("framed");
    expect(merged.provenance?.note).toBe("later");
  });

  it("is absent when no parent carries one", () => {
    const bare = defineAstmProfile({ name: "synthetic-bare", extends: [silent] });
    expect(bare.description).toBeUndefined();
    expect(bare.transport).toBeUndefined();
    expect(bare.provenance).toBeUndefined();
  });
});

describe("tolerances for one code narrowed to different places", () => {
  it("keeps one entry per record type", () => {
    const parent = defineAstmProfile({
      name: "synthetic-by-record",
      tolerate: [
        { code: UNKNOWN_ESCAPE, rationale: "seen in P records", match: { recordType: "P" } },
        { code: UNKNOWN_ESCAPE, rationale: "seen in R records", match: { recordType: "R" } },
      ],
    });
    const child = defineAstmProfile({ name: "synthetic-by-record-child", extends: parent });
    expect(child.tolerate.map((t) => t.match?.recordType)).toEqual(["P", "R"]);
  });

  it("keeps one entry per field index", () => {
    const parent = defineAstmProfile({
      name: "synthetic-by-field",
      tolerate: [
        {
          code: UNKNOWN_ESCAPE,
          rationale: "seen in field 4",
          match: { recordType: "R", fieldIndex: 4 },
        },
        {
          code: UNKNOWN_ESCAPE,
          rationale: "seen in field 5",
          match: { recordType: "R", fieldIndex: 5 },
        },
      ],
    });
    const child = defineAstmProfile({ name: "synthetic-by-field-child", extends: parent });
    expect(child.tolerate.map((t) => t.match?.fieldIndex)).toEqual([4, 5]);
  });

  it("lets the child restate one, keeping its place and taking the child's reason", () => {
    const parent = defineAstmProfile({
      name: "synthetic-restated",
      tolerate: [
        { code: UNKNOWN_ESCAPE, rationale: "parent reason", match: { recordType: "P" } },
        { code: UNKNOWN_ESCAPE, rationale: "other place", match: { recordType: "R" } },
      ],
    });
    const child = defineAstmProfile({
      name: "synthetic-restated-child",
      extends: parent,
      tolerate: [{ code: UNKNOWN_ESCAPE, rationale: "child reason", match: { recordType: "P" } }],
    });
    expect(child.tolerate.map((t) => t.rationale)).toEqual(["child reason", "other place"]);
  });
});
