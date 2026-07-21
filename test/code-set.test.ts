import { describe, expect, it } from "vitest";
import { sortedCodeSet } from "@cosyte/test-utils";

import { FATAL_CODES, WARNING_CODES } from "../src/index.js";

/**
 * The warning/fatal code surface is part of the public contract — a rename or
 * removal is a breaking change. These snapshots turn any such change into a
 * reviewable diff (a deliberate tripwire), and assert the tiers stay disjoint.
 */
describe("stable code surface", () => {
  it("warning codes are stable", () => {
    expect(sortedCodeSet(WARNING_CODES)).toMatchInlineSnapshot(`
      [
        "ASTM_NONSTANDARD_DELIMITERS",
        "ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND",
        "ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT",
        "ASTM_RECORD_ORPHAN_COMMENT",
        "ASTM_RECORD_PARTIAL_TIMESTAMP",
        "ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG",
        "ASTM_RECORD_UNDEFINED_RESULT_STATUS",
        "ASTM_RECORD_UNINTERPRETED_QUERY_STATUS",
        "ASTM_RECORD_UNITS_ABSENT",
        "ASTM_RECORD_UNKNOWN_TYPE",
        "ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE",
        "ASTM_UNKNOWN_ESCAPE_SEQUENCE",
      ]
    `);
  });

  it("fatal codes are stable (EMPTY_INPUT shared across layers)", () => {
    expect(sortedCodeSet(FATAL_CODES)).toMatchInlineSnapshot(`
      [
        "ASTM_RECORD_NO_HEADER",
        "ASTM_RECORD_UNDECLARED_DELIMITERS",
        "EMPTY_INPUT",
      ]
    `);
  });

  it("keeps each registry key === value", () => {
    for (const [k, v] of Object.entries(WARNING_CODES)) expect(k).toBe(v);
    for (const [k, v] of Object.entries(FATAL_CODES)) expect(k).toBe(v);
  });

  it("warning and fatal code sets are disjoint", () => {
    const warns = new Set<string>(Object.values(WARNING_CODES));
    for (const f of Object.values(FATAL_CODES)) expect(warns.has(f)).toBe(false);
  });
});
