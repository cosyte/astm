import { describe, expect, it } from "vitest";

import { CANONICAL_DELIMITERS, isNonStandard, readDelimiters } from "../../src/index.js";

describe("readDelimiters", () => {
  it("reads the canonical H|\\^& declaration positionally", () => {
    const d = readDelimiters("H|\\^&");
    expect(d).toEqual({ field: "|", repeat: "\\", component: "^", escape: "&" });
  });

  it("reads delimiters when the header carries trailing fields", () => {
    const d = readDelimiters("H|\\^&|||sender^app^1||||host||P|1|20240101");
    expect(d?.field).toBe("|");
    expect(d?.escape).toBe("&");
  });

  it("honors non-standard delimiters declared in the header (never hardcoded)", () => {
    // A vendor using '#' field, '~' repeat, '*' component, '!' escape.
    const d = readDelimiters("H#~*!");
    expect(d).toEqual({ field: "#", repeat: "~", component: "*", escape: "!" });
  });

  it("returns undefined when the record does not start with H", () => {
    expect(readDelimiters("P|1|X")).toBeUndefined();
  });

  it("returns undefined when the record is too short to declare four delimiters", () => {
    expect(readDelimiters("H|")).toBeUndefined();
    expect(readDelimiters("H")).toBeUndefined();
    expect(readDelimiters("H|\\^")).toBeUndefined();
  });

  it("returns undefined when the field separator collides with another delimiter", () => {
    // definition chars share the field separator '|' → not a coherent declaration.
    expect(readDelimiters("H||^&")).toBeUndefined();
  });
});

describe("isNonStandard", () => {
  it("is false for the canonical set", () => {
    expect(isNonStandard(CANONICAL_DELIMITERS)).toBe(false);
  });

  it("is true when any delimiter differs from canonical", () => {
    expect(isNonStandard({ field: "#", repeat: "\\", component: "^", escape: "&" })).toBe(true);
    expect(isNonStandard({ field: "|", repeat: "~", component: "^", escape: "&" })).toBe(true);
    expect(isNonStandard({ field: "|", repeat: "\\", component: "*", escape: "&" })).toBe(true);
    expect(isNonStandard({ field: "|", repeat: "\\", component: "^", escape: "!" })).toBe(true);
  });
});
