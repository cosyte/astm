import { describe, expect, it } from "vitest";

import { astmDateToLocalISO, parseAstmDate, type AstmDate } from "../../src/index.js";

/** Parse-or-throw helper so the tests avoid non-null assertions on the optional return. */
function parsed(raw: string): AstmDate {
  const d = parseAstmDate(raw);
  if (d === undefined) throw new Error(`expected "${raw}" to parse`);
  return d;
}

describe("parseAstmDate — precision-preserving, no timezone", () => {
  it("parses a full YYYYMMDDHHMMSS at second precision", () => {
    const d = parseAstmDate("20240315093045");
    expect(d).toMatchObject({
      year: 2024,
      month: 3,
      day: 15,
      hour: 9,
      minute: 30,
      second: 45,
      precision: "second",
    });
  });

  it("preserves partial precision and does NOT zero-fill the missing components", () => {
    expect(parseAstmDate("2024")).toMatchObject({ year: 2024, precision: "year" });
    expect(parseAstmDate("202403")).toMatchObject({ month: 3, precision: "month" });
    const day = parseAstmDate("20240315");
    expect(day?.precision).toBe("day");
    expect(day?.hour).toBeUndefined(); // not defaulted to 0
    expect(parseAstmDate("2024031509")?.precision).toBe("hour");
    expect(parseAstmDate("202403150930")?.precision).toBe("minute");
  });

  it("keeps the raw string and ignores trailing sub-second digits", () => {
    const d = parseAstmDate("20240315093045678");
    expect(d?.raw).toBe("20240315093045678");
    expect(d?.precision).toBe("second");
    expect(d?.second).toBe(45);
  });

  it("returns undefined for non-timestamp values (never a fabricated date)", () => {
    expect(parseAstmDate("")).toBeUndefined();
    expect(parseAstmDate("abc")).toBeUndefined();
    expect(parseAstmDate("202")).toBeUndefined();
  });

  it("flags an odd digit run as truncated and stops at the last COMPLETE component", () => {
    // 7 digits: year + month + a half-given day. Day is dropped (not zero-filled), raw preserved.
    const d = parseAstmDate("2020010");
    expect(d?.precision).toBe("month");
    expect(d?.day).toBeUndefined(); // never zero-filled into a fabricated day
    expect(d?.raw).toBe("2020010"); // the dangling digit is preserved
    expect(d?.truncated).toBe(true);
    // 13 digits: truncated second.
    expect(parseAstmDate("2024040110150")?.truncated).toBe(true);
    // 5 digits: truncated month.
    expect(parseAstmDate("20241")?.truncated).toBe(true);
  });

  it("does NOT flag clean component-aligned lengths (4/6/8/10/12/14) or trailing sub-seconds", () => {
    for (const clean of [
      "2024",
      "202403",
      "20240315",
      "2024031509",
      "202403150930",
      "20240315093045",
    ]) {
      expect(parseAstmDate(clean)?.truncated).toBeUndefined();
    }
    // >14 digits (fractional seconds) is extra precision, not truncation — not flagged.
    expect(parseAstmDate("20240315093045678")?.truncated).toBeUndefined();
  });
});

describe("astmDateToLocalISO — no Z, no offset (never assumes UTC)", () => {
  it("renders each precision without a timezone marker", () => {
    expect(astmDateToLocalISO(parsed("2024"))).toBe("2024");
    expect(astmDateToLocalISO(parsed("202403"))).toBe("2024-03");
    expect(astmDateToLocalISO(parsed("20240315"))).toBe("2024-03-15");
    expect(astmDateToLocalISO(parsed("2024031509"))).toBe("2024-03-15T09");
    expect(astmDateToLocalISO(parsed("202403150930"))).toBe("2024-03-15T09:30");
    expect(astmDateToLocalISO(parsed("20240315093045"))).toBe("2024-03-15T09:30:45");
  });

  it("never appends a UTC designator", () => {
    expect(astmDateToLocalISO(parsed("20240315093045"))).not.toContain("Z");
  });
});
