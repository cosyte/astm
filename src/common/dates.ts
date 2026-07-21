/**
 * The ASTM date/time value — `YYYYMMDDHHMMSS`, precision-preserving, no timezone.
 *
 * ASTM timestamps are a run of digits, most-significant first, truncated at
 * whatever precision the instrument reports. There is **no timezone field**:
 * the value is local to the instrument and this parser never assumes UTC. A
 * date-only value (`YYYYMMDD`) is a normal, complete value at day precision —
 * **not** an error and never zero-filled into a fake time.
 */

/** The precision to which an {@link AstmDate} is populated. */
export type AstmDatePrecision = "year" | "month" | "day" | "hour" | "minute" | "second";

/**
 * A parsed ASTM date/time. Immutable plain data; the populated fields extend
 * exactly as far as {@link AstmDate.precision}. Absent components are left
 * `undefined` rather than defaulted, so a consumer can tell "midnight" from
 * "no time given". No timezone is modeled — the value is instrument-local.
 *
 * @example
 * ```ts
 * import { parseAstmDate } from "@cosyte/astm";
 * const d = parseAstmDate("20240315");
 * d?.precision; // "day"
 * d?.hour;      // undefined  (not 0)
 * ```
 */
export interface AstmDate {
  /** The raw digit string as it appeared on the wire. */
  readonly raw: string;
  readonly year: number;
  readonly month?: number;
  readonly day?: number;
  readonly hour?: number;
  readonly minute?: number;
  readonly second?: number;
  /** How far the components are populated. */
  readonly precision: AstmDatePrecision;
  /**
   * `true` when the digit run does **not** align to a whole-component boundary — an odd number of
   * digits that cuts a two-digit component (month/day/hour/minute/second) in half (lengths 5, 7, 9,
   * 11, 13). The full run is preserved in {@link AstmDate.raw} and the structured value is truncated
   * to the last **complete** component — the dangling digit is **never zero-filled into a fabricated
   * time**. Absent (never `false`) for a clean value. A caller surfaces this as a value-free
   * `ASTM_RECORD_PARTIAL_TIMESTAMP` warning.
   */
  readonly truncated?: true;
}

/**
 * Parse an ASTM `YYYYMMDDHHMMSS` value, preserving whatever precision is
 * present. Returns `undefined` for a value that is not a usable timestamp (fewer
 * than four leading digits for the year, or non-digit content) — a caller keeps
 * the raw field text either way, so nothing is lost. A partial value is parsed,
 * never rejected.
 *
 * Extra trailing digits beyond seconds (fractional seconds some vendors append)
 * are ignored for the structured value; the full input remains in {@link AstmDate.raw}.
 *
 * @param raw - The raw field text.
 * @returns The parsed date, or `undefined` when it is not a timestamp.
 * @example
 * ```ts
 * import { parseAstmDate } from "@cosyte/astm";
 * parseAstmDate("20240315093000")?.precision; // "second"
 * parseAstmDate("202403")?.precision;          // "month"
 * ```
 */
export function parseAstmDate(raw: string): AstmDate | undefined {
  const s = raw.trim();
  if (!/^\d{4,}$/u.test(s)) return undefined;

  const year = Number(s.slice(0, 4));
  // An odd length below the full 14 digits cuts a two-digit component in half — the value is
  // truncated mid-component. The raw run is preserved verbatim; the dangling digit is dropped from
  // the structured value rather than zero-filled into a fabricated time, and the flag lets a caller
  // warn. Extra digits beyond 14 (fractional seconds some vendors append) are not "truncated".
  const truncated = s.length < 14 && s.length % 2 === 1;
  const base = { raw: s, year, ...(truncated ? { truncated: true as const } : {}) };

  if (s.length < 6) return { ...base, precision: "year" };
  const month = Number(s.slice(4, 6));
  if (s.length < 8) return { ...base, month, precision: "month" };
  const day = Number(s.slice(6, 8));
  if (s.length < 10) return { ...base, month, day, precision: "day" };
  const hour = Number(s.slice(8, 10));
  if (s.length < 12) return { ...base, month, day, hour, precision: "hour" };
  const minute = Number(s.slice(10, 12));
  if (s.length < 14) return { ...base, month, day, hour, minute, precision: "minute" };
  const second = Number(s.slice(12, 14));
  return { ...base, month, day, hour, minute, second, precision: "second" };
}

/**
 * Render an {@link AstmDate} as an ISO-8601-*like* string truncated to its
 * precision, with **no** `Z` and **no** offset — because ASTM carries no
 * timezone and appending one would fabricate information. A consumer that knows
 * the instrument's zone can attach it; this function never assumes UTC.
 *
 * @param d - The date to render.
 * @returns e.g. `"2024-03-15T09:30"` (minute precision) or `"2024-03"` (month).
 * @example
 * ```ts
 * import { astmDateToLocalISO, parseAstmDate } from "@cosyte/astm";
 * astmDateToLocalISO(parseAstmDate("20240315")!); // "2024-03-15"
 * ```
 */
export function astmDateToLocalISO(d: AstmDate): string {
  const p2 = (n: number): string => String(n).padStart(2, "0");
  let out = String(d.year).padStart(4, "0");
  if (d.month !== undefined) out += `-${p2(d.month)}`;
  if (d.day !== undefined) out += `-${p2(d.day)}`;
  if (d.hour !== undefined) out += `T${p2(d.hour)}`;
  if (d.minute !== undefined) out += `:${p2(d.minute)}`;
  if (d.second !== undefined) out += `:${p2(d.second)}`;
  return out;
}
