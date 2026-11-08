import { describe, expect, it } from "vitest";

import { parseAstmRecords, WARNING_CODES } from "../../src/index.js";

/**
 * The numeric test behind `ASTM_RECORD_UNITS_ABSENT` runs on the result value the sender wrote.
 * Its pattern once held two adjacent optional whitespace runs around an optional comparator, so a
 * value made of a long whitespace run took time quadratic in its length: 50,000 spaces took about
 * three and a half seconds, and a field of a megabyte would have held the parser for many minutes.
 * These cases pin the linear form and prove it classifies values exactly as the old pattern did.
 */

/** A minimal synthetic message with one result whose units field is empty. */
function messageWithValue(value: string): string {
  return `H|\\^&\rP|1\rO|1|ACC\rR|1|^^^687|${value}|||N||F\rL|1|N\r`;
}

function warnsUnitsAbsent(value: string): boolean {
  return parseAstmRecords(messageWithValue(value)).warnings.some(
    (w) => w.code === WARNING_CODES.ASTM_RECORD_UNITS_ABSENT,
  );
}

describe("the numeric-value test behind the units-absent warning", () => {
  it.each(["28.6", "12", "0", "-1.5", "<5", ">10", "< 5", "> -3.25", "  42  ", " < 0.001 "])(
    "warns for the numeric value %j with no units",
    (value) => {
      expect(warnsUnitsAbsent(value)).toBe(true);
    },
  );

  it.each([
    "POSITIVE",
    "1.",
    ".5",
    "1.2.3",
    "<>1",
    ">>2",
    "1e5",
    "+1",
    "12 34",
    "< -",
    "-",
    "<",
    " ",
  ])("does not warn for the value %j, which is not purely numeric", (value) => {
    expect(warnsUnitsAbsent(value)).toBe(false);
  });

  // The first two values took about 3.5 s each with the quadratic pattern (measured locally), and
  // each of the three takes milliseconds with the linear one.
  const RUN = 50_000;

  it.each([
    ["a whitespace run with no number after it", `${" ".repeat(RUN)}x`, false],
    [
      "whitespace, a comparator, whitespace, then no number",
      `${" ".repeat(RUN)}<${" ".repeat(RUN)}x`,
      false,
    ],
    [
      "a number inside long whitespace runs",
      `${" ".repeat(RUN)}<${" ".repeat(RUN)}7${" ".repeat(RUN)}`,
      true,
    ],
  ] as const)("classifies %s in linear time", (_label, value, numeric) => {
    const started = performance.now();
    const warned = warnsUnitsAbsent(value);
    const elapsed = performance.now() - started;
    expect(warned).toBe(numeric);
    expect(elapsed).toBeLessThan(500);
  });
});
