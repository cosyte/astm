import { describe, expect, it } from "vitest";

import {
  parseAstmRecords,
  primaryCode,
  recognizeUniversalTestId,
  results,
} from "../../src/index.js";
import type { UniversalTestId } from "../../src/index.js";

/**
 * The Universal Test ID the parser recognized for a stream's first `R` record.
 * No catalog and no terminology call: this is the catalog-free recognition path.
 */
function testIdOf(raw: string): UniversalTestId {
  const u = results(parseAstmRecords(raw))[0]?.universalTestId;
  if (u === undefined) throw new Error("expected a recognized Universal Test ID");
  return u;
}

describe("recognizeUniversalTestId: structural recognizer, verbatim, no lookup", () => {
  it("reads the local code (component 4) as the primary identifier", () => {
    const u = recognizeUniversalTestId(["", "", "", "687"]);
    expect(u.localCode).toBe("687");
    expect(u.provenance).toBe("local-code");
    expect(primaryCode(u)).toBe("687");
  });

  it("carries a populated component 1 as an unvalidated wire value, never as a code", () => {
    const u = recognizeUniversalTestId(["2345-7", "Glucose", "LN", "687"]);
    expect(u.unvalidatedWireValue).toBe("2345-7");
    expect(u.localCode).toBe("687");
    // The vendor local code is what a result is keyed on. Component 1 never is.
    expect(u.provenance).toBe("local-code");
    expect(primaryCode(u)).toBe("687");
  });

  it("surfaces test name and coding scheme verbatim", () => {
    const u = recognizeUniversalTestId(["", "Complete Blood Count", "L", ""]);
    expect(u.testName).toBe("Complete Blood Count");
    expect(u.provenance).toBe("name-only");
    expect(primaryCode(u)).toBeUndefined(); // never guessed from a name
  });

  it("classifies an empty field as empty with no primary code", () => {
    const u = recognizeUniversalTestId(["", "", "", ""]);
    expect(u.provenance).toBe("empty");
    expect(primaryCode(u)).toBeUndefined();
  });

  it("tolerates a field with fewer than four components", () => {
    const u = recognizeUniversalTestId(["", "Glucose"]);
    expect(u.testName).toBe("Glucose");
    expect(u.localCode).toBeUndefined();
  });
});

/**
 * The catalog-free recognition path carries no LOINC claim of any kind. This library
 * performs no LOINC validation and never decides what a first-component value "looks
 * like": a test name and a code-shaped string are treated identically, positionally,
 * and neither is ever the code a result is keyed on.
 */
describe("a first component is an unvalidated wire value, never the code a result is keyed on", () => {
  it("keys on the vendor local code and carries the first component verbatim", () => {
    for (const wire of ["Glucose", "2345-7"]) {
      const u = testIdOf(`H|\\^&\rR|1|${wire}^^^687|28.6|U/L||N||F\rL|1\r`);
      expect(u.unvalidatedWireValue).toBe(wire);
      expect(u.localCode).toBe("687");
      // The keyed code is the vendor local code for both, so nothing read the
      // CONTENT of component 1 to decide it.
      expect(primaryCode(u)).toBe("687");
      expect(u.provenance).toBe("local-code");
    }
  });

  it("treats a name and a code-shaped value in component 1 identically", () => {
    const name = testIdOf("H|\\^&\rR|1|Glucose^^^687|28.6|U/L||N||F\rL|1\r");
    const codeShaped = testIdOf("H|\\^&\rR|1|2345-7^^^687|28.6|U/L||N||F\rL|1\r");
    expect(name.provenance).toBe(codeShaped.provenance);
    expect(primaryCode(name)).toBe(primaryCode(codeShaped));
  });

  it("regression: a populated first component with no vendor local code keys on NOTHING", () => {
    // The defect-register case. The keyed code a consumer reads is ABSENT: the same
    // absence recognition already yields for a record carrying nothing usable, and
    // emphatically not the first-component value.
    const u = testIdOf("H|\\^&\rR|1|Glucose|28.6|U/L||N||F\rL|1\r");
    expect(primaryCode(u)).toBeUndefined();
    expect(primaryCode(u)).not.toBe("Glucose");
    // Still reported, verbatim, as a value the library does not vouch for.
    expect(u.unvalidatedWireValue).toBe("Glucose");
    expect(u.localCode).toBeUndefined();
    expect(u.provenance).toBe("unvalidated-wire-value-only");
    // And distinguishable from a Universal Test ID that carried nothing at all.
    const nothing = recognizeUniversalTestId([]);
    expect(u).not.toEqual(nothing);
    expect(u.provenance).not.toBe(nothing.provenance);
  });

  it("names no public value of a recognition result a LOINC or a LOINC candidate", () => {
    for (const wire of ["Glucose", "2345-7", " "]) {
      const u = recognizeUniversalTestId([wire, "", "", "687"]);
      for (const key of Object.keys(u)) expect(key).not.toMatch(/loinc/i);
      expect(u.provenance).not.toMatch(/loinc/i);
    }
  });
});
