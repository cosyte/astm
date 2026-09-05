/**
 * The shared `@cosyte/*` conversion-surface conformance table, expressed in ASTM.
 *
 * Every `@cosyte` parser carries this file at this path, covering the same rows
 * R1 to R11, so a divergence between two packages is a failing test here rather
 * than a discovery made by a consumer holding a wrong date. A row this standard
 * cannot express is SKIPPED WITH A WRITTEN REASON naming the ASTM property that
 * makes it inexpressible, never silently dropped: ASTM models no timezone field
 * (R5, R6), retains no fractional-second component (R7), and opens every
 * timestamp with a mandatory four-digit year (R10).
 *
 * Everything is imported from `../src/index.js`, the package root, because "a
 * consumer can import these three names from `@cosyte/astm`" is itself one of the
 * things under test.
 */

import { describe, expect, it } from "vitest";

import {
  astmDateToLocalISO,
  parseAstmDate,
  parseAstmRecords,
  toDate,
  toISO,
  toObject,
  type AstmDate,
  type DateParts,
  type PatientRecord,
} from "../src/index.js";

/** Parse-or-throw helper, so the cases avoid non-null assertions on the optional return. */
function parsed(raw: string): AstmDate {
  const d = parseAstmDate(raw);
  if (d === undefined) throw new Error(`expected "${raw}" to parse`);
  return d;
}

/**
 * A hand-built value, for shapes `parseAstmDate` cannot produce. The cast is the
 * point: these are the inputs a JavaScript caller can still reach the surface
 * with, and none of the three may throw on one.
 */
function handBuilt(shape: Record<string, unknown>): AstmDate {
  const value: unknown = shape;
  return value as AstmDate;
}

// ---------------------------------------------------------------------------
// The package root
// ---------------------------------------------------------------------------

describe("the package root", () => {
  it("exports the three shared names, beside the pre-existing date surface", () => {
    expect(typeof toObject).toBe("function");
    expect(typeof toISO).toBe("function");
    expect(typeof toDate).toBe("function");
    // Additive only: the names that were here before are still here.
    expect(typeof parseAstmDate).toBe("function");
    expect(typeof astmDateToLocalISO).toBe("function");
  });

  it("gives toDate an optional second argument carrying assumeOffsetMinutes and nothing else", () => {
    const day = parsed("20240315");
    expect(toDate(day)).toBeUndefined();
    expect(toDate(day, {})).toBeUndefined();
    expect(toDate(day, { assumeOffsetMinutes: 0 })).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// The shared case table, R1 to R11
// ---------------------------------------------------------------------------

describe("shared case table", () => {
  it("R1 year-precision value: toObject has exactly {year}, toISO is the 4-digit year", () => {
    const value = parsed("2024");
    const parts: DateParts | undefined = toObject(value);
    expect(Object.keys(parts ?? {})).toEqual(["year"]);
    expect(parts).toEqual({ year: 2024 });
    expect(toISO(value)).toBe("2024");
  });

  it("R2 day-precision value, no offset: exact key set, no trailing Z, toDate undefined", () => {
    const value = parsed("20240315");
    expect(Object.keys(toObject(value) ?? {})).toEqual(["year", "month", "day"]);
    expect(toObject(value)).toEqual({ year: 2024, month: 3, day: 15 });
    expect(toISO(value)).toBe("2024-03-15");
    expect(toISO(value)).not.toContain("Z");
    // ASTM states no offset, so with no assumption there is no instant to give.
    expect(toDate(value)).toBeUndefined();
  });

  it("R3 R2 with assumeOffsetMinutes 0: toDate is the UTC midnight instant", () => {
    const instant = toDate(parsed("20240315"), { assumeOffsetMinutes: 0 });
    expect(instant?.toISOString()).toBe("2024-03-15T00:00:00.000Z");
    // Host-zone-independent: the epoch value itself, not a formatted string.
    expect(instant?.getTime()).toBe(Date.UTC(2024, 2, 15, 0, 0, 0, 0));
  });

  it("R4 R2 with assumeOffsetMinutes -300: toDate is 05:00Z that day", () => {
    const instant = toDate(parsed("20240315"), { assumeOffsetMinutes: -300 });
    expect(instant?.toISOString()).toBe("2024-03-15T05:00:00.000Z");
  });

  /*
   * R5 INEXPRESSIBLE IN ASTM, so it is skipped rather than silently omitted.
   * REASON: an ASTM timestamp is a bare run of digits and `AstmDate` has NO
   * TIMEZONE FIELD: the value is local to the instrument that wrote it, and
   * `parseAstmDate` has no syntax to read an explicit offset from. There is
   * therefore no input that could carry the non-zero offset this row needs, and
   * no value whose own offset could out-rank a passed `assumeOffsetMinutes`.
   * What is checkable instead is that the key never appears, asserted live in
   * "the ASTM properties behind the skipped rows" below.
   */
  it.skip("R5 second-precision value with an explicit non-zero offset: ASTM has no timezone field", () => {
    expect(toObject(parsed("20240315093045"))).toHaveProperty("offsetMinutes");
  });

  /*
   * R6 INEXPRESSIBLE IN ASTM, for the same reason as R5.
   * REASON: NO TIMEZONE FIELD. A stated zero offset is a stated offset, and ASTM
   * cannot state one, so `offsetMinutes: 0` is unreachable and `toISO` never has
   * a `Z` to append. Appending one anyway would fabricate the instrument's zone,
   * which is exactly what this surface exists to refuse.
   */
  it.skip("R6 value with an explicit ZERO offset: ASTM has no timezone field", () => {
    expect(toISO(parsed("20240315093045"))).toMatch(/Z$/u);
  });

  /*
   * R7 INEXPRESSIBLE IN ASTM, as this package parses it.
   * REASON: NO RETAINED FRACTIONAL-SECOND COMPONENT. `AstmDate` stops at
   * `second`; `parseAstmDate` ignores the trailing digits some vendors append and
   * keeps the whole run in `raw` only. With no stated fraction on the value there
   * is nothing for the verbatim first-three-digit rule to read, so `millisecond`
   * is never populated and `toISO` renders no fractional digits.
   */
  it.skip("R7 value with stated fractional seconds: ASTM retains no fractional-second component", () => {
    expect(toObject(parsed("20240315093045678"))).toHaveProperty("millisecond");
  });

  it("R8 a value the repo parsed as invalid: all three return undefined, nothing throws", () => {
    // `parseAstmDate` answers `undefined` rather than an invalid object, so the
    // repo's "invalid" IS `undefined` here. A structurally empty hand-built value
    // is the other shape a caller can reach, and it is refused the same way.
    const invalid = parseAstmDate("not a timestamp");
    expect(invalid).toBeUndefined();
    const stateless = handBuilt({ raw: "not a timestamp", precision: "year" });

    expect(() => toObject(invalid)).not.toThrow();
    expect(() => toISO(invalid)).not.toThrow();
    expect(() => toDate(invalid, { assumeOffsetMinutes: 0 })).not.toThrow();
    expect(toObject(invalid)).toBeUndefined();
    expect(toISO(invalid)).toBeUndefined();
    expect(toDate(invalid, { assumeOffsetMinutes: 0 })).toBeUndefined();

    expect(toObject(stateless)).toBeUndefined();
    expect(toISO(stateless)).toBeUndefined();
    expect(toDate(stateless, { assumeOffsetMinutes: 0 })).toBeUndefined();
  });

  it("R9 undefined passed as the value: all three return undefined, nothing throws", () => {
    expect(() => toObject(undefined)).not.toThrow();
    expect(() => toISO(undefined)).not.toThrow();
    expect(() => toDate(undefined)).not.toThrow();
    expect(toObject(undefined)).toBeUndefined();
    expect(toISO(undefined)).toBeUndefined();
    expect(toDate(undefined)).toBeUndefined();

    // `null` reaches the surface from JavaScript even though the types exclude it.
    expect(() => toObject(null)).not.toThrow();
    expect(toObject(null)).toBeUndefined();
    expect(toISO(null)).toBeUndefined();
    expect(toDate(null, { assumeOffsetMinutes: 0 })).toBeUndefined();
  });

  /*
   * R10 INEXPRESSIBLE IN ASTM.
   * REASON: THE MANDATORY LEADING FOUR-DIGIT YEAR. An ASTM timestamp run is
   * most-significant-first and `parseAstmDate` refuses anything with fewer than
   * four leading digits, so the run always opens with the year and a time-only
   * value has no syntax. `AstmDate.year` is correspondingly required, not
   * optional. The yearless shape a JavaScript caller can still hand-build is
   * covered live in "the ASTM properties behind the skipped rows" below, where
   * `toISO` and `toDate` both answer `undefined` rather than rendering a bare
   * time this parser can never have read.
   */
  it.skip("R10 a time-only value: an ASTM timestamp opens with a mandatory four-digit year", () => {
    expect(toISO(parsed("093045"))).toBe("09:30:45");
  });

  it("R11 year 0050 at day precision with a determinate zone: the Date reports year 50", () => {
    const instant = toDate(parsed("00500101"), { assumeOffsetMinutes: 0 });
    expect(instant?.getUTCFullYear()).toBe(50);
    expect(instant?.getUTCMonth()).toBe(0);
    expect(instant?.getUTCDate()).toBe(1);
    // The legacy two-digit-year remapping of `Date.UTC` never reaches the result.
    expect(instant?.getUTCFullYear()).not.toBe(1950);
    expect(toISO(parsed("00500101"))).toBe("0050-01-01");
  });
});

// ---------------------------------------------------------------------------
// What the skipped rows rest on, asserted rather than asserted-by-comment
// ---------------------------------------------------------------------------

describe("the ASTM properties behind the skipped rows", () => {
  it("never carries an offsetMinutes key, at any precision (R5, R6)", () => {
    for (const raw of ["2024", "20240315", "20240315093045"]) {
      expect(toObject(parsed(raw))).not.toHaveProperty("offsetMinutes");
      expect(toISO(parsed(raw))).not.toContain("Z");
      expect(toISO(parsed(raw))).not.toMatch(/[+-]\d\d:\d\d$/u);
    }
  });

  it("never carries a millisecond key, even when the wire ran past seconds (R7)", () => {
    const value = parsed("20240315093045678");
    expect(value.raw).toBe("20240315093045678"); // the digits are kept, on `raw` alone
    expect(toObject(value)).not.toHaveProperty("millisecond");
    expect(toISO(value)).toBe("2024-03-15T09:30:45");
  });

  it("refuses a yearless value rather than rendering a bare time (R10)", () => {
    const timeOnly = handBuilt({
      raw: "093045",
      hour: 9,
      minute: 30,
      second: 45,
      precision: "second",
    });
    expect(toObject(timeOnly)).toEqual({ hour: 9, minute: 30, second: 45 });
    expect(Object.keys(toObject(timeOnly) ?? {})).toEqual(["hour", "minute", "second"]);
    expect(toISO(timeOnly)).toBeUndefined();
    expect(toDate(timeOnly, { assumeOffsetMinutes: 0 })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// toObject
// ---------------------------------------------------------------------------

describe("toObject", () => {
  it("returns a frozen plain object", () => {
    const parts = toObject(parsed("20240315"));
    expect(Object.isFrozen(parts)).toBe(true);
    const mutable = parts as unknown as { year: number };
    expect(() => {
      mutable.year = 1970;
    }).toThrow(TypeError);
    expect(toObject(parsed("20240315"))).toEqual({ year: 2024, month: 3, day: 15 });
  });

  it("carries no parse bookkeeping: no precision, raw, valid or truncated key", () => {
    const parts = toObject(parsed("20240315093045"));
    for (const key of ["precision", "raw", "valid", "truncated", "offsetMinutes", "millisecond"]) {
      expect(parts).not.toHaveProperty(key);
    }
    expect(Object.keys(parts ?? {})).toEqual(["year", "month", "day", "hour", "minute", "second"]);
  });

  it("states the month 1 to 12, spec-native, never the JS Date 0 to 11", () => {
    expect(toObject(parsed("20240315"))?.month).toBe(3); // March, not 2
    expect(toObject(parsed("20241231"))?.month).toBe(12); // December, not 11
    expect(toObject(parsed("20240101"))?.month).toBe(1); // January, not 0
  });

  it("reports exactly the stated components at every precision, zero-filling nothing", () => {
    expect(Object.keys(toObject(parsed("2024")) ?? {})).toEqual(["year"]);
    expect(Object.keys(toObject(parsed("202403")) ?? {})).toEqual(["year", "month"]);
    expect(Object.keys(toObject(parsed("20240315")) ?? {})).toEqual(["year", "month", "day"]);
    expect(Object.keys(toObject(parsed("2024031509")) ?? {})).toEqual([
      "year",
      "month",
      "day",
      "hour",
    ]);
    expect(Object.keys(toObject(parsed("202403150930")) ?? {})).toEqual([
      "year",
      "month",
      "day",
      "hour",
      "minute",
    ]);
    // An absent component is an ABSENT KEY, not a key holding `undefined`.
    expect("hour" in (toObject(parsed("20240315")) ?? {})).toBe(false);
  });

  it("reports only the COMPLETE components of a truncated digit run", () => {
    // 9 digits: year, month, day, and a dangling half-hour digit the parser flags
    // `truncated` and never zero-fills.
    const value = parsed("202403159");
    expect(value.truncated).toBe(true);
    const parts = toObject(value);
    expect(Object.keys(parts ?? {})).toEqual(["year", "month", "day"]);
    expect(parts).toEqual({ year: 2024, month: 3, day: 15 });
    expect(parts).not.toHaveProperty("truncated");
    expect(parts).not.toHaveProperty("hour");
    // The dangling `9` surfaces in no field.
    expect(Object.values(parts ?? {})).not.toContain(9);
    expect(toISO(value)).toBe("2024-03-15");

    // The same, one component further along: 11 digits cut the minute in half.
    const hourish = parsed("20240315093");
    expect(hourish.truncated).toBe(true);
    expect(Object.keys(toObject(hourish) ?? {})).toEqual(["year", "month", "day", "hour"]);
    expect(toObject(hourish)).not.toHaveProperty("truncated");
  });

  it("refuses a value whose components are not real numbers", () => {
    const nonsense = handBuilt({ raw: "2024", year: Number.NaN, precision: "year" });
    expect(toObject(nonsense)).toBeUndefined();
    expect(toISO(nonsense)).toBeUndefined();
    expect(toDate(nonsense, { assumeOffsetMinutes: 0 })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// toISO
// ---------------------------------------------------------------------------

describe("toISO", () => {
  it("truncates to the stated precision and appends nothing", () => {
    expect(toISO(parsed("2024"))).toBe("2024");
    expect(toISO(parsed("202403"))).toBe("2024-03");
    expect(toISO(parsed("20240315"))).toBe("2024-03-15");
    expect(toISO(parsed("2024031509"))).toBe("2024-03-15T09");
    expect(toISO(parsed("202403150930"))).toBe("2024-03-15T09:30");
    expect(toISO(parsed("20240315093045"))).toBe("2024-03-15T09:30:45");
  });

  it("agrees with astmDateToLocalISO on every real calendar date this repo can express", () => {
    for (const raw of [
      "2024",
      "202403",
      "20240315",
      "2024031509",
      "202403150930",
      "20240315093045",
      "20240315093045678", // trailing sub-second digits, kept on `raw` alone
      "20241", // truncated month
      "2020010", // truncated day
      "202403159", // truncated hour
      "20240315093", // truncated minute
      "2024040110150", // truncated second
      "00500101", // a year below 100, padded to four digits by both
      "99991231",
    ]) {
      const value = parsed(raw);
      expect(toISO(value), `toISO disagreed with astmDateToLocalISO on "${raw}"`).toBe(
        astmDateToLocalISO(value),
      );
    }
  });

  it("pads a year below 1000 to four digits", () => {
    expect(toISO(parsed("00500101"))).toBe("0050-01-01");
    expect(toISO(parsed("0999"))).toBe("0999");
  });

  it("emits a string an ISO-8601 reader accepts, or nothing at all", () => {
    for (const raw of [
      "2024",
      "202403",
      "20240315",
      "20240315093045",
      "20241301", // month 13
      "20240132", // day 32
      "20240230", // February has no 30th
      "20240115250000", // hour 25
      "20240115006100", // minute 61
    ]) {
      const iso = toISO(parsed(raw));
      if (iso === undefined) continue;
      expect(
        Number.isNaN(new Date(iso).getTime()),
        `toISO("${raw}") is "${iso}", which new Date() reads as Invalid Date`,
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Components out of calendar range
//
// `parseAstmDate` is lenient by design and returns a populated value for a digit
// run whose components are impossible; that is pinned behaviour and is not
// changed here. The conversions are where it has to be answered, because a JS
// `Date` normalises month 13 into January of the following year and hands back a
// confident, wrong instant that nothing warns about.
// ---------------------------------------------------------------------------

describe("components out of calendar range", () => {
  it("is the premise: parseAstmDate itself still accepts them, unchanged", () => {
    // If this ever goes green the other way, the refusal below has moved into
    // the parser and this whole block is testing something else.
    for (const raw of ["20241301", "20240132", "20240230", "20240115250000"]) {
      expect(parseAstmDate(raw)).toBeDefined();
    }
    expect(parseAstmDate("20241301")?.month).toBe(13);
  });

  it("refuses a month outside 1 to 12, from all three functions", () => {
    for (const raw of ["20241301", "20240015", "20249901"]) {
      const value = parsed(raw);
      expect(toObject(value), `toObject accepted "${raw}"`).toBeUndefined();
      expect(toISO(value), `toISO accepted "${raw}"`).toBeUndefined();
      expect(toDate(value, { assumeOffsetMinutes: 0 }), `toDate accepted "${raw}"`).toBeUndefined();
    }
  });

  it("refuses a day past the end of its own month, leap year included", () => {
    for (const raw of [
      "20240132", // January has 31
      "20240431", // April has 30
      "20240230", // February never has 30
      "20230229", // 2023 is not a leap year
      "19000229", // divisible by 100, not by 400: not a leap year
      "20240100", // day 0
    ]) {
      expect(toObject(parsed(raw)), `toObject accepted "${raw}"`).toBeUndefined();
      expect(toDate(parsed(raw), { assumeOffsetMinutes: 0 })).toBeUndefined();
    }
  });

  it("refuses an impossible time component", () => {
    for (const raw of [
      "2024011524", // hour 24
      "202401152500", // hour 25
      "202401150060", // minute 60
      "20240115006100", // minute 61
      "20240115000060", // second 60, a leap second no JS reader accepts
    ]) {
      expect(toObject(parsed(raw)), `toObject accepted "${raw}"`).toBeUndefined();
      expect(toISO(parsed(raw)), `toISO accepted "${raw}"`).toBeUndefined();
    }
  });

  it("still accepts every legal boundary, so the check does not over-refuse", () => {
    for (const raw of [
      "20240101", // first day of the first month
      "20241231", // last day of the last month
      "20240229", // 29 February in a leap year
      "20000229", // divisible by 400: a leap year
      "20240131",
      "20240430", // April's real last day
      "20240115235959", // the last second of a day
      "00500101", // year 50, and 0 is a legal four-digit year floor
      "99991231",
    ]) {
      expect(toObject(parsed(raw)), `"${raw}" was refused`).toBeDefined();
      expect(toISO(parsed(raw))).toBe(astmDateToLocalISO(parsed(raw)));
      expect(toDate(parsed(raw), { assumeOffsetMinutes: 0 })).toBeInstanceOf(Date);
    }
  });

  it("refuses the WHOLE value, never the in-range prefix of it", () => {
    // Answering `{ year: 1988 }` would report a year-precision date of birth the
    // instrument never sent: a partial answer, which is the thing this surface
    // exists to refuse.
    const value = parsed("19881301");
    expect(toObject(value)).toBeUndefined();
    expect(toObject(value)).not.toEqual({ year: 1988 });
    expect(toISO(value)).toBeUndefined();
  });

  it("refuses a truncated run whose complete components are out of range", () => {
    const value = parsed("1988130"); // year 1988, month 13, dangling day digit
    expect(value.truncated).toBe(true);
    expect(value.month).toBe(13);
    expect(toObject(value)).toBeUndefined();
  });

  it("diverges from astmDateToLocalISO here, deliberately and in one direction", () => {
    // `astmDateToLocalISO` is pinned behaviour and is unchanged: it still renders
    // the digits it was handed. `toISO` answers `undefined` rather than emit a
    // string no ISO-8601 reader accepts. Nothing else about the pair moved.
    const value = parsed("19881301");
    expect(astmDateToLocalISO(value)).toBe("1988-13-01");
    expect(toISO(value)).toBeUndefined();
  });

  it("never converts an out-of-range date of birth, off a real message, to a confident instant", () => {
    const message = "H|\\^&|||analyzer|||||||P|1\rP|1||LAB123||Doe^Jane||19881301|F\rL|1|N\r";
    const parsedMessage = parseAstmRecords(message);
    const patient = parsedMessage.records.find(
      (r): r is PatientRecord => r.type === "P",
    )?.birthDate;
    expect(patient).toBeDefined();

    // A JS `Date` reads month 13 as January of 1989: a date of birth a year out,
    // with nothing on the parse to say so.
    expect(toDate(patient, { assumeOffsetMinutes: 0 })).toBeUndefined();
    expect(toObject(patient)).toBeUndefined();
    expect(toISO(patient)).toBeUndefined();
  });

  it("bounds February at 29 when the year is unstated, refusing only the impossible", () => {
    // Only a JavaScript caller reaches this shape: an ASTM run always opens with
    // the year. A 29 February whose year nobody stated cannot be refused without
    // inventing that year, so it is accepted; a 30 February is impossible in
    // every year, so it is not.
    const leapish = handBuilt({ raw: "0229", month: 2, day: 29, precision: "day" });
    const impossible = handBuilt({ raw: "0230", month: 2, day: 30, precision: "day" });
    expect(toObject(leapish)).toEqual({ month: 2, day: 29 });
    expect(toObject(impossible)).toBeUndefined();
    // Neither is an instant: no year, so no year to build one from.
    expect(toDate(leapish, { assumeOffsetMinutes: 0 })).toBeUndefined();
  });

  it("refuses a component that is not a whole number", () => {
    const fractional = handBuilt({ raw: "2024", year: 2024, month: 3.5, precision: "month" });
    expect(toObject(fractional)).toBeUndefined();
    expect(toISO(fractional)).toBeUndefined();
    expect(toDate(fractional, { assumeOffsetMinutes: 0 })).toBeUndefined();
  });

  it("refuses a year outside the four digits an ASTM run states", () => {
    // Unreachable from `parseAstmDate`, which reads exactly four leading digits,
    // and reachable from JavaScript. A five-digit year is not ISO-8601 without
    // the expanded-representation sign this surface never emits.
    for (const year of [-1, 10_000, 400_000]) {
      const value = handBuilt({ raw: String(year), year, precision: "year" });
      expect(toObject(value), `year ${year} was accepted`).toBeUndefined();
      expect(toISO(value)).toBeUndefined();
      expect(toDate(value, { assumeOffsetMinutes: 0 })).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// toDate
// ---------------------------------------------------------------------------

describe("toDate", () => {
  it("returns undefined at every precision when no zone is assumed", () => {
    for (const raw of [
      "2024",
      "202403",
      "20240315",
      "2024031509",
      "202403150930",
      "20240315093045",
    ]) {
      expect(toDate(parsed(raw)), `"${raw}" answered an instant with no zone`).toBeUndefined();
      expect(toDate(parsed(raw), {})).toBeUndefined();
    }
  });

  it("applies the assumed offset, including an explicit zero meaning UTC", () => {
    const second = parsed("20240315093045");
    expect(toDate(second, { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "2024-03-15T09:30:45.000Z",
    );
    expect(toDate(second, { assumeOffsetMinutes: -300 })?.toISOString()).toBe(
      "2024-03-15T14:30:45.000Z",
    );
    expect(toDate(second, { assumeOffsetMinutes: 330 })?.toISOString()).toBe(
      "2024-03-15T04:00:45.000Z",
    );
  });

  it("fills components below the stated precision to their lowest legal value", () => {
    expect(toDate(parsed("2024"), { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "2024-01-01T00:00:00.000Z",
    );
    expect(toDate(parsed("202403"), { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "2024-03-01T00:00:00.000Z",
    );
    expect(toDate(parsed("2024031509"), { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "2024-03-15T09:00:00.000Z",
    );
  });

  it("leaves the value's own precision untouched: toObject and toISO answer as before", () => {
    const value = parsed("202403");
    const before = toObject(value);
    const isoBefore = toISO(value);
    toDate(value, { assumeOffsetMinutes: -300 });
    expect(toObject(value)).toEqual(before);
    expect(toISO(value)).toBe(isoBefore);
    expect(toISO(value)).toBe("2024-03"); // still month precision, not filled to a day
  });

  it("refuses an offset that is not a real number", () => {
    expect(toDate(parsed("20240315"), { assumeOffsetMinutes: Number.NaN })).toBeUndefined();
  });

  it("never returns an Invalid Date", () => {
    // Past the representable range: report the absence rather than hand back a
    // `Date` that fails every comparison. Unreachable from `parseAstmDate`, which
    // reads a four-digit year, and reachable from JavaScript. The calendar-range
    // check answers first now; the guard on the constructed instant stays behind
    // it, so this holds whichever one catches the value.
    const farFuture = handBuilt({ raw: "400000", year: 400_000, precision: "year" });
    expect(toDate(farFuture, { assumeOffsetMinutes: 0 })).toBeUndefined();
  });
});
