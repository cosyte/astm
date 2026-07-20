import { describe, expect, it } from "vitest";

import {
  ambiguousValueSplit,
  deepFreeze,
  nonStandardDelimiters,
  unknownEscapeSequence,
  unknownRecordType,
  WARNING_CODES,
} from "../../src/index.js";

describe("warning factories — code + value-free message + position", () => {
  it("builds each warning with its stable code and no field value", () => {
    const pos = { recordIndex: 3, recordType: "R", fieldIndex: 4 };
    const unknown = unknownRecordType({ recordIndex: 2, recordType: "Z" });
    const nonstd = nonStandardDelimiters({ recordIndex: 0, recordType: "H" });
    const esc = unknownEscapeSequence(pos);
    const ambiguous = ambiguousValueSplit(pos);

    expect(unknown.code).toBe(WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE);
    expect(nonstd.code).toBe(WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS);
    expect(esc.code).toBe(WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE);
    expect(ambiguous.code).toBe(WARNING_CODES.ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT);
    expect(esc.position).toEqual(pos);

    // Messages carry no value — only positional/structural language.
    for (const w of [unknown, nonstd, esc, ambiguous]) {
      expect(typeof w.message).toBe("string");
      expect(w.message.length).toBeGreaterThan(0);
    }
  });
});

describe("deepFreeze", () => {
  it("freezes nested objects and arrays", () => {
    const frozen = deepFreeze({ a: [1, 2], b: { c: 3 } });
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.a)).toBe(true);
    expect(Object.isFrozen(frozen.b)).toBe(true);
  });

  it("returns primitives untouched and tolerates already-frozen input", () => {
    expect(deepFreeze(42)).toBe(42);
    expect(deepFreeze(null)).toBeNull();
    const once = deepFreeze({ x: 1 });
    expect(deepFreeze(once)).toBe(once);
  });
});
