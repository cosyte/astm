import { describe, expect, it } from "vitest";

import {
  CANONICAL_DELIMITERS,
  fieldScalar,
  tokenizeHeader,
  tokenizeRecord,
} from "../../src/index.js";

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

describe("tokenizeHeader", () => {
  // The header's declaration carries all three non-field delimiters LITERALLY. Fed to the generic
  // tokenizer it would be split on its own repeat and component characters and its escape character
  // would decode and report as unpaired, so the declaration must stay one opaque, undecoded field.
  it("keeps the delimiter declaration opaque and still splits the data fields", () => {
    const fields = tokenizeHeader("H|\\^&|||analyzer^cobas^1|addr", D);
    expect(fields.map((f) => f.raw)).toEqual(["H", "\\^&", "", "", "analyzer^cobas^1", "addr"]);
    // The declaration is structural, not data: one verbatim component, never escape-decoded.
    expect(fields[1]?.components).toEqual(["\\^&"]);
    expect(fields[4]?.components).toEqual(["analyzer", "cobas", "1"]);
  });

  it("returns just the type letter and the declaration for a bare header", () => {
    expect(tokenizeHeader("H|\\^&", D).map((f) => f.raw)).toEqual(["H", "\\^&"]);
  });

  it("reads a non-canonical declaration and splits on that set", () => {
    const d = { field: "#", repeat: "~", component: "*", escape: "\\" };
    expect(tokenizeHeader("H#~*\\###SYNTH-LAB", d).map((f) => f.raw)).toEqual([
      "H",
      "~*\\",
      "",
      "",
      "SYNTH-LAB",
    ]);
  });

  it("reports an unrecognized escape at its WHOLE-RECORD field index", () => {
    const seen: number[] = [];
    tokenizeHeader("H|\\^&|||a&Z&b", D, (i) => seen.push(i));
    // The data portion's field 2 is the whole record's field index 4 (1-based field 5).
    expect(seen).toEqual([4]);
  });
});
