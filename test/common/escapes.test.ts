import { describe, expect, it } from "vitest";

import { CANONICAL_DELIMITERS, decodeEscapes, splitEscapeAware } from "../../src/index.js";

const D = CANONICAL_DELIMITERS;

describe("decodeEscapes", () => {
  it("decodes the four recognized mnemonics to the active delimiters", () => {
    expect(decodeEscapes("a&F&b", D)).toBe("a|b");
    expect(decodeEscapes("1&S&40", D)).toBe("1^40");
    expect(decodeEscapes("x&R&y", D)).toBe("x\\y");
    expect(decodeEscapes("p&E&q", D)).toBe("p&q");
  });

  it("returns the input unchanged when there is no escape character", () => {
    expect(decodeEscapes("28.6", D)).toBe("28.6");
  });

  it("preserves an unrecognized escape body verbatim and reports it once", () => {
    let unknowns = 0;
    const out = decodeEscapes("a&Z&b", D, () => (unknowns += 1));
    expect(out).toBe("a&Z&b");
    expect(unknowns).toBe(1);
  });

  it("preserves a lone unterminated escape char verbatim", () => {
    expect(decodeEscapes("value&", D)).toBe("value&");
  });

  it("substitutes the ACTIVE (non-canonical) delimiters, not hardcoded ones", () => {
    const alt = { field: "#", repeat: "~", component: "*", escape: "!" };
    expect(decodeEscapes("1!S!40", alt)).toBe("1*40");
    expect(decodeEscapes("a!F!b", alt)).toBe("a#b");
  });
});

describe("splitEscapeAware", () => {
  it("splits plain text on the delimiter", () => {
    expect(splitEscapeAware("a^b^c", "^", "&")).toEqual(["a", "b", "c"]);
  });

  it("treats an escape sequence as an opaque atom (never splits inside it)", () => {
    // The escape body is opaque even if it were to contain the delimiter.
    expect(splitEscapeAware("1&S&40", "^", "&")).toEqual(["1&S&40"]);
    expect(splitEscapeAware("a&*&b", "*", "&")).toEqual(["a&*&b"]);
  });

  it('returns [""] for empty input and preserves empty segments', () => {
    expect(splitEscapeAware("", "^", "&")).toEqual([""]);
    expect(splitEscapeAware("a^^b", "^", "&")).toEqual(["a", "", "b"]);
  });

  it("preserves an unterminated escape sequence in the final segment", () => {
    expect(splitEscapeAware("a^b&trailing", "^", "&")).toEqual(["a", "b&trailing"]);
  });
});

describe("escape-aware split THEN decode is the correct order (the silent-misread fix)", () => {
  it("an escaped component delimiter reads as ONE component", () => {
    const segments = splitEscapeAware("1&S&40", D.component, D.escape);
    expect(segments).toHaveLength(1);
    const [only] = segments;
    expect(only).toBeDefined();
    expect(decodeEscapes(only ?? "", D)).toBe("1^40");
  });

  it("a RAW component delimiter genuinely splits into two components", () => {
    const segments = splitEscapeAware("1^40", D.component, D.escape);
    expect(segments).toHaveLength(2);
  });
});
