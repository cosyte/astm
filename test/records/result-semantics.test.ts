import { describe, expect, it } from "vitest";

import {
  ABNORMAL_FLAG_CODES,
  ABNORMAL_FLAG_VOCABULARY,
  RESULT_STATUS_VOCABULARY,
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

/**
 * The identifier and version transcribed from the published source of truth for
 * the abnormal-flag code system. Written out here rather than derived, so a
 * silent edit to the constant reds this test instead of passing vacuously.
 */
const FLAG_SYSTEM = "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation";
const FLAG_VERSION = "4.0.0";

/** Every letter this library recognizes as an abnormal flag, and its meaning. */
const FLAG_CASES: ReadonlyArray<readonly [AbnormalFlagCode, string]> = [
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
  ["HU", "significantly-high"],
  ["LU", "significantly-low"],
];

describe("interpretAbnormalFlag: the named flag vocabulary", () => {
  it.each(FLAG_CASES)("recognizes %s → %s", (code, meaning) => {
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

describe("interpretAbnormalFlag: the vocabulary is reported beside the meaning", () => {
  it("names the identifier and version character for character (recognized flag)", () => {
    const f = interpretAbnormalFlag("HH");
    expect(f.meaning).toBe("critically-above-normal");
    expect(f.vocabulary.attributed).toBe(true);
    expect(f.vocabulary.system).toBe(FLAG_SYSTEM);
    expect(f.vocabulary.version).toBe(FLAG_VERSION);
  });

  it("names the SAME identifier and version on an UNRECOGNIZED flag", () => {
    // The whole point: a consumer holding `undefined` can tell a code no published
    // vocabulary defines from one this library has not caught up to.
    const f = interpretAbnormalFlag("ZZ");
    expect(f.recognized).toBe(false);
    expect(f.vocabulary.system).toBe(FLAG_SYSTEM);
    expect(f.vocabulary.version).toBe(FLAG_VERSION);
  });

  it("carries the attribution on EVERY recognized letter", () => {
    for (const [code] of FLAG_CASES) {
      const f = interpretAbnormalFlag(code);
      expect(f.vocabulary).toEqual(ABNORMAL_FLAG_VOCABULARY);
    }
  });

  it("an empty or whitespace-only flag field is unrecognized, raw-preserving, attributed, never normal", () => {
    for (const raw of ["", " ", "   ", "\t", "\r\n"]) {
      const f = interpretAbnormalFlag(raw);
      expect(f.recognized).toBe(false);
      expect(f.meaning).toBe("undefined");
      expect(f.meaning).not.toBe("normal");
      expect(f.code).toBeUndefined();
      expect(f.raw).toBe(raw); // verbatim, including the whitespace
      expect(f.vocabulary.system).toBe(FLAG_SYSTEM);
      expect(f.vocabulary.version).toBe(FLAG_VERSION);
    }
  });
});

describe("interpretAbnormalFlag: the recognized set is exactly these eighteen", () => {
  it("recognizes exactly eighteen codes, and they are the listed ones", () => {
    expect(ABNORMAL_FLAG_CODES).toHaveLength(18);
    expect([...ABNORMAL_FLAG_CODES].sort()).toEqual([...FLAG_CASES.map(([code]) => code)].sort());
  });

  it("every listed code is recognized and nothing else is", () => {
    for (const code of ABNORMAL_FLAG_CODES) {
      expect(interpretAbnormalFlag(code).recognized).toBe(true);
    }
    // Neighbours in the same published code system that this library deliberately
    // does NOT adopt, plus the deprecated forms whose replacements ARE adopted.
    const notAdopted = ["E", "ND", "POS", "NEG", "H>", "L<", "HX", "LX", "EX", "NR", "SYN-R"];
    for (const raw of notAdopted) {
      const f = interpretAbnormalFlag(raw);
      expect(f.recognized).toBe(false);
      expect(f.meaning).toBe("undefined");
      expect(f.raw).toBe(raw);
    }
  });
});

describe("interpretAbnormalFlag: HU / LU are significantly high / low", () => {
  it("HU reads significantly-high and LU significantly-low, not unrecognized", () => {
    const hu = interpretAbnormalFlag("HU");
    expect(hu.recognized).toBe(true);
    expect(hu.code).toBe("HU");
    expect(hu.meaning).toBe("significantly-high");

    const lu = interpretAbnormalFlag("LU");
    expect(lu.recognized).toBe(true);
    expect(lu.code).toBe("LU");
    expect(lu.meaning).toBe("significantly-low");
  });

  it("HU/LU are DISTINCT from each other and from H/L, HH/LL and the directional U/D", () => {
    const meaning = (raw: string): string => interpretAbnormalFlag(raw).meaning;
    const neighbours = ["H", "L", "HH", "LL", "U", "D"];
    for (const n of neighbours) {
      expect(meaning("HU")).not.toBe(meaning(n));
      expect(meaning("LU")).not.toBe(meaning(n));
    }
    expect(meaning("HU")).not.toBe(meaning("LU"));
    // The pre-existing directional readings are untouched by the addition.
    expect(meaning("U")).toBe("significant-change-up");
    expect(meaning("D")).toBe("significant-change-down");
  });

  it("recognition stays exact-match: a case variant is NOT widened in", () => {
    for (const raw of ["hu", "lu", "Hu", "hU", "Lu", "lU"]) {
      const f = interpretAbnormalFlag(raw);
      expect(f.recognized).toBe(false);
      expect(f.meaning).toBe("undefined");
      expect(f.raw).toBe(raw);
    }
  });
});

describe("interpretAbnormalFlag: the sixteen pre-existing meanings are unchanged", () => {
  // The letters and readings this library shipped before HU/LU were added. Written
  // out literally so a regression in any one of them reds here.
  const before: ReadonlyArray<readonly [string, string]> = [
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

  it.each(before)("%s still reads %s", (raw, meaning) => {
    const f = interpretAbnormalFlag(raw);
    expect(f.recognized).toBe(true);
    expect(f.meaning).toBe(meaning);
  });

  it("has exactly two more codes than before", () => {
    expect(ABNORMAL_FLAG_CODES).toHaveLength(before.length + 2);
  });
});

describe("interpretResultStatus: F/C/P/R/S/I/X", () => {
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

describe("interpretResultStatus: the letter set is reported UNATTRIBUTED", () => {
  const STATUSES = ["F", "C", "P", "R", "S", "I", "X"] as const;

  it("says explicitly that no citable published source binds the set", () => {
    const s = interpretResultStatus("F");
    expect(s.vocabulary.attributed).toBe(false);
    expect(s.vocabulary.reason).toBe(RESULT_STATUS_VOCABULARY.reason);
    expect(s.vocabulary.reason.length).toBeGreaterThan(0);
    expect(s.vocabulary.reason).toMatch(/no citable published source/iu);
  });

  it("carries that statement on EVERY recognized status letter", () => {
    for (const code of STATUSES) {
      expect(interpretResultStatus(code).vocabulary).toEqual(RESULT_STATUS_VOCABULARY);
    }
  });

  it("carries it on an unrecognized status too", () => {
    const s = interpretResultStatus("Z");
    expect(s.vocabulary.attributed).toBe(false);
    expect(s.vocabulary).toEqual(RESULT_STATUS_VOCABULARY);
  });

  it("an ABSENT or EMPTY status is unspecified (never final) and STILL carries the statement", () => {
    for (const raw of [undefined, "", " ", "   ", "\t"]) {
      const s = interpretResultStatus(raw);
      expect(s.meaning).toBe("unspecified");
      expect(s.meaning).not.toBe("final");
      expect(s.isActiveFinal).toBe(false);
      expect(s.vocabulary.attributed).toBe(false);
      expect(s.vocabulary).toEqual(RESULT_STATUS_VOCABULARY);
    }
  });

  it("is DISTINGUISHABLE from an absent attribution and never carries an identifier", () => {
    const s = interpretResultStatus("F");
    // Positively present, and positively unattributed: not `undefined`.
    expect(s.vocabulary).toBeDefined();
    expect(s.vocabulary.attributed).toBe(false);
    // Never the flag vocabulary's identifier, nor any identifier at all.
    expect(Object.keys(s.vocabulary)).toEqual(["attributed", "reason"]);
    expect(JSON.stringify(s.vocabulary)).not.toContain(ABNORMAL_FLAG_VOCABULARY.system);
    expect(JSON.stringify(s.vocabulary)).not.toContain(ABNORMAL_FLAG_VOCABULARY.version);
  });

  it("C and X keep their safety readings, unchanged by the attribution", () => {
    const c = interpretResultStatus("C");
    expect(c.meaning).toBe("correction");
    expect(c.supersedes).toBe(true);
    expect(c.isActiveFinal).toBe(false);

    const x = interpretResultStatus("X");
    expect(x.meaning).toBe("cancelled");
    expect(x.cancelled).toBe(true);
    expect(x.isActiveFinal).toBe(false);
  });

  it("a case variant of a status letter stays unrecognized (no widening)", () => {
    for (const raw of ["f", "c", "p", "r", "s", "i", "x"]) {
      const s = interpretResultStatus(raw);
      expect(s.recognized).toBe(false);
      expect(s.meaning).toBe("undefined");
      expect(s.isActiveFinal).toBe(false);
      expect(s.raw).toBe(raw); // surfaced verbatim
    }
  });
});

describe("the two attributions are different things", () => {
  it("the flag set is named and the status set is not", () => {
    expect(ABNORMAL_FLAG_VOCABULARY.attributed).toBe(true);
    expect(RESULT_STATUS_VOCABULARY.attributed).toBe(false);
    expect(interpretAbnormalFlag("N").vocabulary.attributed).toBe(true);
    expect(interpretResultStatus("F").vocabulary.attributed).toBe(false);
  });
});

describe("parseReferenceRange: bounds surfaced verbatim, never fabricated", () => {
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
