import { describe, expect, it } from "vitest";

import { parseAstmDate, toObject, type AstmDate } from "../../src/index.js";

/**
 * The calendar bounds `toObject` holds a parsed date to, month by month, and what it does with a
 * component that is not a real number. All dates are synthetic.
 */

describe("the last day of each thirty-day month", () => {
  it.each(["04", "06", "09", "11"])("accepts day 30 of month %s and refuses day 31", (month) => {
    expect(toObject(parseAstmDate(`2024${month}30`))).toEqual({
      year: 2024,
      month: Number(month),
      day: 30,
    });
    expect(toObject(parseAstmDate(`2024${month}31`))).toBeUndefined();
  });

  it.each(["01", "03", "05", "07", "08", "10", "12"])("accepts day 31 of month %s", (month) => {
    expect(toObject(parseAstmDate(`2024${month}31`))?.day).toBe(31);
  });
});

describe("a component that is not a finite number", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    "is left out as unstated (%s), never refused as out of range",
    (bad) => {
      const parsed = parseAstmDate("20240315");
      if (parsed === undefined) return expect.unreachable("the date did not parse");
      const date: AstmDate = { ...parsed, day: bad };
      expect(toObject(date)).toStrictEqual({ year: 2024, month: 3 });
    },
  );
});
