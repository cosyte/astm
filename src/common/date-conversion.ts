/**
 * The shared `@cosyte/*` date conversion surface, over {@link AstmDate}.
 *
 * `toObject`, `toISO` and `toDate` carry the same names, the same return shapes
 * and the same timezone rule in every `@cosyte` parser, so moving between two of
 * them costs nothing to relearn. They are **additive**: {@link astmDateToLocalISO}
 * and {@link parseAstmDate} are untouched, and `toISO` renders exactly the string
 * `astmDateToLocalISO` renders for every value `parseAstmDate` produces.
 *
 * **ASTM is the strictest case for the rule these functions exist for.** An ASTM
 * timestamp models **no timezone at all**: the value is local to the instrument
 * that wrote it. So an ASTM value is never an absolute instant on its own, and
 * {@link toDate} answers `undefined` until the caller says which zone the
 * instrument was in (`assumeOffsetMinutes`). The host machine's zone is never
 * read and UTC is never assumed: either guess shifts a date of birth by a day in
 * every negative-offset zone, silently, and nothing throws to say so.
 *
 * Nothing here fabricates a component either. A value stated to day precision
 * converts to a day, never to a fabricated midnight, and the components a value
 * did not state are **absent** from {@link DateParts} rather than zero-filled.
 *
 * **Nor does anything here normalise a component that is out of calendar range.**
 * `parseAstmDate` is lenient by design and reads `19881301` into month 13, so the
 * conversions are where that has to be answered. All three refuse such a value
 * (`undefined`, never a throw), because the alternative is what a JS `Date` does
 * with it: month 13 rolls into January of the following year and comes back as a
 * confident, wrong instant that no warning marks. A date of birth is the case
 * that decided it.
 */

import type { AstmDate } from "./dates.js";

/**
 * The calendar components a parsed value actually stated: the shared return
 * shape of {@link toObject} across every `@cosyte` parser.
 *
 * Every value is a `number` and `month` is **spec-native 1 to 12**, never the JS
 * `Date` 0 to 11. A component the value did not state is **absent**: the key is
 * not present at all, rather than present and `undefined`, so `Object.keys()` of
 * the result is exactly the set of stated components and the value's precision is
 * recoverable from it. There is no `precision`, `raw`, `valid` or `truncated` key:
 * this is the calendar reading, not the parse record.
 *
 * Deleting `offsetMinutes` leaves an object `Temporal.PlainDateTime.from` and
 * luxon's `DateTime.fromObject` accept with no key rename and no value
 * adjustment, which is why the keys are singular and the month is 1-based.
 * Neither library is a dependency of this package: the shape is the interop, not
 * an import.
 *
 * `millisecond` and `offsetMinutes` belong to the shared shape and are **never
 * populated by this package**: an ASTM timestamp carries no timezone, and this
 * parser retains no fractional-second component (the digits stay in
 * {@link AstmDate.raw}). They are declared so that code written over two
 * `@cosyte` parsers reads one shape rather than two.
 */
export interface DateParts {
  /** Four-digit calendar year, exactly as stated (`50` is the year 50, not 1950). */
  readonly year?: number;
  /** Calendar month, **1 to 12**, as the standard states it. */
  readonly month?: number;
  /** Day of month, 1 to 31. */
  readonly day?: number;
  /** Hour of day, 0 to 23. */
  readonly hour?: number;
  /** Minute of hour, 0 to 59. */
  readonly minute?: number;
  /** Second of minute, 0 to 59. */
  readonly second?: number;
  /** Millisecond. Never populated here: this parser retains no fractional second. */
  readonly millisecond?: number;
  /** Signed minutes east of UTC. Never populated here: ASTM states no offset. */
  readonly offsetMinutes?: number;
}

/** Same keys as {@link DateParts}, writable, for building one component by component. */
type MutableDateParts = { -readonly [K in keyof DateParts]: DateParts[K] };

/** The options {@link toDate} accepts. Carries `assumeOffsetMinutes` and nothing else. */
export interface ToDateOptions {
  /**
   * The zone to read an offset-less value in, as signed minutes east of UTC
   * (`-300` is UTC-05:00). Supplying `0` means "treat this value as UTC", which
   * is a decision only the caller can make: an ASTM value states no offset, so
   * without this option {@link toDate} returns `undefined` rather than guessing.
   */
  readonly assumeOffsetMinutes?: number;
}

/** A component counts as stated only when it is a real number, never `NaN`. */
function isStated(component: number | undefined): component is number {
  return typeof component === "number" && Number.isFinite(component);
}

/** Two-digit zero-padded rendering, for the ISO components below the year. */
function p2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Proleptic Gregorian, the calendar a JS `Date` reads year 50 on. */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * The highest day number this month can legally carry. With the year unstated
 * February is bounded at 29, because a 29 February whose year nobody stated
 * cannot be refused without inventing that year, and refusing only the
 * impossible is the rule here.
 */
function longestDay(year: number | undefined, month: number): number {
  if (month === 2) return year === undefined || isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** A stated component has to be a whole number inside its bounds; an unstated one passes. */
function inRange(component: number | undefined, low: number, high: number): boolean {
  if (component === undefined) return true;
  return Number.isInteger(component) && component >= low && component <= high;
}

/**
 * Whether every component the value stated names a real point on the calendar.
 *
 * A `false` here refuses the WHOLE value rather than the offending component:
 * dropping month 13 off `19881301` and answering `{ year: 1988 }` would report a
 * year-precision date of birth the sender never sent, which is the partial answer
 * this surface exists to refuse. The year is bounded to the four digits an ASTM
 * run states, so what `toISO` renders is always a calendar date an ISO-8601
 * reader accepts.
 */
function statesARealCalendarDate(parts: DateParts): boolean {
  return (
    inRange(parts.year, 0, 9999) &&
    inRange(parts.month, 1, 12) &&
    inRange(parts.day, 1, parts.month === undefined ? 31 : longestDay(parts.year, parts.month)) &&
    inRange(parts.hour, 0, 23) &&
    inRange(parts.minute, 0, 59) &&
    // 60 is refused with the rest: a leap second is legal in ISO-8601 prose and
    // is an Invalid Date to every JS reader, so accepting it here would hand out
    // a string the next hop cannot read.
    inRange(parts.second, 0, 59)
  );
}

/**
 * Read a parsed ASTM date as the shared {@link DateParts} object: only the
 * components the value stated, frozen, with a spec-native 1-to-12 month.
 *
 * Returns `undefined` for `undefined`, for `null`, for a value that stated no
 * component at all, and for one whose stated components are not a real calendar
 * date (a month outside 1 to 12, a day past the end of that month, an hour past
 * 23, a minute or second past 59). Never throws, whatever it is handed. The
 * truncation flag, the precision and the raw digit run are deliberately not
 * carried over: a dangling half-component was never a complete component, so it
 * appears in no field here.
 *
 * The out-of-range refusal is total, not per component: `"19881301"` answers
 * `undefined`, not `{ year: 1988 }`, because a year-precision date of birth is
 * not what that instrument sent either.
 *
 * @param value - A parsed date, or the `undefined` {@link parseAstmDate} returns.
 * @returns The stated components, frozen, or `undefined`.
 * @example
 * ```ts
 * import { parseAstmDate, toObject } from "@cosyte/astm";
 * toObject(parseAstmDate("20240315")); // { year: 2024, month: 3, day: 15 }
 * Object.keys(toObject(parseAstmDate("2024")) ?? {}); // ["year"]
 * toObject(parseAstmDate("19881301")); // undefined: there is no month 13
 * ```
 */
export function toObject(value: AstmDate | null | undefined): DateParts | undefined {
  if (value === null || value === undefined) return undefined;

  // Insertion order is the shared component order, so `Object.keys()` reads most
  // significant first in every @cosyte parser.
  const parts: MutableDateParts = {};
  if (isStated(value.year)) parts.year = value.year;
  if (isStated(value.month)) parts.month = value.month;
  if (isStated(value.day)) parts.day = value.day;
  if (isStated(value.hour)) parts.hour = value.hour;
  if (isStated(value.minute)) parts.minute = value.minute;
  if (isStated(value.second)) parts.second = value.second;

  if (Object.keys(parts).length === 0) return undefined;
  // `parseAstmDate` is lenient and hands over whatever the digits said, so this
  // is where an impossible calendar component stops. Refused whole: see the
  // function's own note on why the in-range prefix is not an answer.
  if (!statesARealCalendarDate(parts)) return undefined;
  return Object.freeze(parts);
}

/**
 * Render a parsed ASTM date as ISO-8601, truncated to the precision it stated
 * and **never** padded out to a precision it did not.
 *
 * No `Z` and no offset is ever appended, because ASTM states none and appending
 * one would fabricate the instrument's zone. The string is deliberately
 * zone-less. It is identical to what {@link astmDateToLocalISO} returns for every
 * value {@link parseAstmDate} produces **whose components are a real calendar
 * date**; the shared name is the portable route and the repo-native name is
 * unchanged. On a run that is not, the two differ on purpose and only in one
 * direction: `astmDateToLocalISO` still renders the digits it was given
 * (`"1988-13-01"`), because that is its pinned behaviour, and `toISO` answers
 * `undefined` rather than emit a string no ISO-8601 reader accepts.
 *
 * Returns `undefined` for `undefined`, for `null`, for a value stating no
 * component, for one whose components are not a real calendar date, and for one
 * stating no year: an ASTM timestamp opens with a mandatory four-digit year, so a
 * yearless value is not one this parser reads. Never throws.
 *
 * @param value - A parsed date, or the `undefined` {@link parseAstmDate} returns.
 * @returns e.g. `"2024-03-15T09:30"` (minute precision) or `"2024-03"` (month).
 * @example
 * ```ts
 * import { parseAstmDate, toISO } from "@cosyte/astm";
 * toISO(parseAstmDate("202403150930")); // "2024-03-15T09:30"
 * toISO(parseAstmDate("not a date"));   // undefined
 * toISO(parseAstmDate("20240230"));     // undefined: February has no 30th
 * ```
 */
export function toISO(value: AstmDate | null | undefined): string | undefined {
  const parts = toObject(value);
  if (parts === undefined || parts.year === undefined) return undefined;

  // Each component is appended only while the one above it was stated, so a
  // gap ends the string rather than shifting a lower component up into it.
  let out = String(parts.year).padStart(4, "0");
  if (parts.month === undefined) return out;
  out += `-${p2(parts.month)}`;
  if (parts.day === undefined) return out;
  out += `-${p2(parts.day)}`;
  if (parts.hour === undefined) return out;
  out += `T${p2(parts.hour)}`;
  if (parts.minute === undefined) return out;
  out += `:${p2(parts.minute)}`;
  if (parts.second === undefined) return out;
  out += `:${p2(parts.second)}`;
  return out;
}

/**
 * Convert a parsed ASTM date to an absolute-instant JS `Date`, **only** when the
 * caller has made the zone determinate.
 *
 * ASTM carries no timezone, so `toDate` returns `undefined` unless
 * `options.assumeOffsetMinutes` says which zone the instrument was in. The host
 * machine's zone is never read and UTC is never assumed. A value stating no year
 * is never an instant either, and neither is one whose components are not a real
 * calendar date: month 13 becomes January of the next year in a JS `Date`, and
 * that silent roll-over is the reason the range is checked before the instant is
 * built rather than after.
 *
 * Components below the stated precision fill to their lowest legal value (month
 * and day to 1, time to 0) **for instant construction only**: the value itself is
 * unchanged, and {@link toObject} and {@link toISO} report exactly what they
 * reported before the call.
 *
 * @param value - A parsed date, or the `undefined` {@link parseAstmDate} returns.
 * @param options - The zone assumption to apply, as signed minutes east of UTC.
 * @returns The instant, or `undefined` when the zone or the year is unstated.
 * @example
 * ```ts
 * import { parseAstmDate, toDate } from "@cosyte/astm";
 * const d = parseAstmDate("20240315");
 * toDate(d);                              // undefined: no zone was stated
 * toDate(d, { assumeOffsetMinutes: -300 }); // 2024-03-15T05:00:00.000Z
 * toDate(parseAstmDate("19881301"), { assumeOffsetMinutes: 0 }); // undefined, not 1989
 * ```
 */
export function toDate(
  value: AstmDate | null | undefined,
  options?: ToDateOptions,
): Date | undefined {
  const parts = toObject(value);
  if (parts === undefined || parts.year === undefined) return undefined;

  // The value's own offset would win over the caller's assumption, but an ASTM
  // value never states one, so the assumption is the only route to an instant.
  const offsetMinutes = options?.assumeOffsetMinutes;
  if (!isStated(offsetMinutes)) return undefined;

  // setUTCFullYear, never `new Date(y, ...)` or `Date.UTC(y, ...)`: those remap a
  // year below 100 into the 1900s, which would silently move year 50 by 19
  // centuries. Year, month and day are set in one call so the epoch seed cannot
  // roll a 29 February over on the way.
  const instant = new Date(0);
  instant.setUTCFullYear(parts.year, (parts.month ?? 1) - 1, parts.day ?? 1);
  // The millisecond argument is the literal lowest legal value: this parser
  // retains no fractional second, so there is never a stated one to carry.
  instant.setUTCHours(parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0, 0);

  const utcMillis = instant.getTime();
  // A year past the representable range yields an Invalid Date; report the
  // absence rather than handing back a `Date` that fails every comparison.
  if (Number.isNaN(utcMillis)) return undefined;
  return new Date(utcMillis - offsetMinutes * 60_000);
}
