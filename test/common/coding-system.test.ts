import { describe, expect, it } from "vitest";

import { primaryCode, recognizeUniversalTestId } from "../../src/index.js";

describe("recognizeUniversalTestId — structural recognizer, verbatim, no lookup", () => {
  it("reads the local code (component 4) as the primary identifier", () => {
    const u = recognizeUniversalTestId(["", "", "", "687"]);
    expect(u.localCode).toBe("687");
    expect(u.provenance).toBe("local-code");
    expect(primaryCode(u)).toBe("687");
  });

  it("recognizes an inline LOINC candidate in component 1 (provenance only)", () => {
    const u = recognizeUniversalTestId(["2345-7", "Glucose", "LN", "687"]);
    expect(u.loincCandidate).toBe("2345-7");
    expect(u.localCode).toBe("687");
    expect(u.provenance).toBe("inline-loinc-candidate");
    // Inline LOINC wins as the primary code when present, else the local code.
    expect(primaryCode(u)).toBe("2345-7");
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
