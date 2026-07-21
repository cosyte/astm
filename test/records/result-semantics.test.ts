import { describe, expect, it } from "vitest";

import {
  interpretAbnormalFlag,
  interpretResultStatus,
  parseReferenceRange,
  type AbnormalFlagCode,
  type ResultStatusCode,
} from "../../src/index.js";

/**
 * Unit coverage for the Phase-2 result semantics. The headline safety invariants
 * (a `C`/`X` never reads as active-final; an unrecognized flag never becomes
 * `normal`; an unparseable range never fabricates a bound) are re-asserted as
 * fast-check properties in `../property/result-semantics.property.test.ts`.
 */

describe("interpretAbnormalFlag — HL7 Table 0078", () => {
  const cases: ReadonlyArray<readonly [AbnormalFlagCode, string]> = [
    ["L", "below-normal"],
    ["H", "above-normal"],
    ["LL", "critically-below-normal"],
    ["HH", "critically-above-normal"],
    ["<", "below-scale"],
    [">", "above-scale"],
    ["N", "normal"],
    ["A", "abnormal"],
    ["AA", "very-abnormal"],
    ["U", "significant-change-up"],
    ["D", "significant-change-down"],
    ["B", "better"],
    ["W", "worse"],
    ["S", "susceptible"],
    ["R", "resistant"],
    ["I", "intermediate"],
  ];

  it.each(cases)("recognizes %s → %s", (code, meaning) => {
    const f = interpretAbnormalFlag(code);
    expect(f.recognized).toBe(true);
    expect(f.code).toBe(code);
    expect(f.meaning).toBe(meaning);
    expect(f.raw).toBe(code);
  });

  it("U/D are DIRECTIONAL significant-change, never a units/delta reading", () => {
    expect(interpretAbnormalFlag("U").meaning).toBe("significant-change-up");
    expect(interpretAbnormalFlag("D").meaning).toBe("significant-change-down");
  });

  it("an unrecognized flag → undefined + not recognized, NEVER coerced to normal", () => {
    for (const raw of ["ZZ", "Q", "hh", "n", "?", "1", "LH"]) {
      const f = interpretAbnormalFlag(raw);
      expect(f.recognized).toBe(false);
      expect(f.meaning).toBe("undefined");
      expect(f.meaning).not.toBe("normal");
      expect(f.code).toBeUndefined();
      expect(f.raw).toBe(raw); // surfaced verbatim, never dropped
    }
  });

  it("ignores surrounding whitespace for the lookup but preserves raw", () => {
    const f = interpretAbnormalFlag(" H ");
    expect(f.recognized).toBe(true);
    expect(f.code).toBe("H");
    expect(f.raw).toBe(" H ");
  });
});

describe("interpretResultStatus — F/C/P/R/S/I/X", () => {
  const cases: ReadonlyArray<readonly [ResultStatusCode, string]> = [
    ["F", "final"],
    ["C", "correction"],
    ["P", "preliminary"],
    ["R", "previously-transmitted"],
    ["S", "partial"],
    ["I", "pending"],
    ["X", "cancelled"],
  ];

  it.each(cases)("recognizes %s → %s", (code, meaning) => {
    const s = interpretResultStatus(code);
    expect(s.recognized).toBe(true);
    expect(s.code).toBe(code);
    expect(s.meaning).toBe(meaning);
  });

  it("only a plain F is active-final", () => {
    expect(interpretResultStatus("F").isActiveFinal).toBe(true);
    for (const code of ["C", "P", "R", "S", "I", "X"]) {
      expect(interpretResultStatus(code).isActiveFinal).toBe(false);
    }
  });

  it("a correction (C) supersedes and is NOT active-final", () => {
    const s = interpretResultStatus("C");
    expect(s.supersedes).toBe(true);
    expect(s.isActiveFinal).toBe(false);
    expect(s.cancelled).toBe(false);
  });

  it("a cancellation (X) is cancelled and NOT active-final", () => {
    const s = interpretResultStatus("X");
    expect(s.cancelled).toBe(true);
    expect(s.isActiveFinal).toBe(false);
    expect(s.supersedes).toBe(false);
  });

  it("an ABSENT status → unspecified, never assumed final", () => {
    for (const raw of [undefined, "", "   "]) {
      const s = interpretResultStatus(raw);
      expect(s.meaning).toBe("unspecified");
      expect(s.recognized).toBe(false);
      expect(s.isActiveFinal).toBe(false);
      expect(s.raw).toBeUndefined();
    }
  });

  it("a present but unrecognized status → undefined, never active-final", () => {
    const s = interpretResultStatus("Z");
    expect(s.meaning).toBe("undefined");
    expect(s.recognized).toBe(false);
    expect(s.isActiveFinal).toBe(false);
    expect(s.raw).toBe("Z");
  });
});

describe("parseReferenceRange — bounds surfaced verbatim, never fabricated", () => {
  it("parses a closed range", () => {
    const r = parseReferenceRange("3.5-5.0");
    expect(r.kind).toBe("closed");
    expect(r.low).toBe("3.5");
    expect(r.high).toBe("5.0");
  });

  it("parses closed ranges with negative bounds unambiguously", () => {
    const r = parseReferenceRange("-5.0--1.0");
    expect(r.kind).toBe("closed");
    expect(r.low).toBe("-5.0");
    expect(r.high).toBe("-1.0");
  });

  it("parses open-low (<high) and open-high (>low)", () => {
    const low = parseReferenceRange("<5");
    expect(low.kind).toBe("open-low");
    expect(low.high).toBe("5");
    expect(low.low).toBeUndefined();

    const high = parseReferenceRange(">10");
    expect(high.kind).toBe("open-high");
    expect(high.low).toBe("10");
    expect(high.high).toBeUndefined();
  });

  it("surfaces bounds as verbatim text (no float coercion)", () => {
    const r = parseReferenceRange("3.50-5.00");
    expect(r.low).toBe("3.50"); // trailing zeros preserved, not 3.5
    expect(r.high).toBe("5.00");
  });

  it("marks an unrecognized range unparsed with NO fabricated bound", () => {
    for (const raw of ["weird", "10 to 40", "1-2-3", "", "5", "a-b"]) {
      const r = parseReferenceRange(raw);
      expect(r.kind).toBe("unparsed");
      expect(r.low).toBeUndefined();
      expect(r.high).toBeUndefined();
      expect(r.raw).toBe(raw); // verbatim
    }
  });
});
