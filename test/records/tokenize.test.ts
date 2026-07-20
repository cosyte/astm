import { describe, expect, it } from "vitest";

import { CANONICAL_DELIMITERS, fieldScalar, tokenizeRecord } from "../../src/index.js";

const D = CANONICAL_DELIMITERS;

describe("tokenizeRecord", () => {
  it("splits a record into fields, with the type letter as field[0]", () => {
    const fields = tokenizeRecord("R|1|^^^687|28.6|U/L", D);
    expect(fields[0]?.components[0]).toBe("R");
    expect(fields[1]?.components[0]).toBe("1");
    expect(fields[3]?.components[0]).toBe("28.6");
    expect(fields[4]?.components[0]).toBe("U/L");
  });

  it("splits a caret field into components", () => {
    const fields = tokenizeRecord("R|1|^^^687", D);
    expect(fields[2]?.components).toEqual(["", "", "", "687"]);
  });

  it("splits repeats and exposes the first repeat as components", () => {
    const fields = tokenizeRecord("O|1|ACC|SPEC|^^^A\\^^^B", D);
    const utid = fields[4];
    expect(utid?.repeats).toHaveLength(2);
    expect(utid?.components).toEqual(["", "", "", "A"]);
    expect(utid?.repeats[1]).toEqual(["", "", "", "B"]);
  });

  it("preserves the raw field text (escapes not decoded) alongside decoded components", () => {
    const fields = tokenizeRecord("R|1|^^^9|1&S&40", D);
    expect(fields[3]?.raw).toBe("1&S&40");
    expect(fields[3]?.components).toEqual(["1^40"]);
  });

  it("reports the 1-based field index of an unrecognized escape", () => {
    const seen: number[] = [];
    tokenizeRecord("R|1|^^^9|a&Z&b", D, (i) => seen.push(i));
    // field index is 0-based inside the tokenizer; parse.ts adds 1 for the warning.
    expect(seen).toEqual([3]);
  });
});

describe("fieldScalar", () => {
  it("returns the first non-empty component, or undefined", () => {
    const fields = tokenizeRecord("R|1||value", D);
    expect(fieldScalar(fields[1])).toBe("1");
    expect(fieldScalar(fields[2])).toBeUndefined(); // empty field
    expect(fieldScalar(fields[3])).toBe("value");
    expect(fieldScalar(undefined)).toBeUndefined();
  });
});
