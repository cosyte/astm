/**
 * Safety-critical result semantics for the ASTM `R` (result) record — Phase 2.
 *
 * Phase 1 surfaced the `R` record's flag, status, units, and reference-range
 * fields **raw**. This module turns those raw letters into modeled, **fail-safe**
 * semantics, under one rule: **never a confident wrong value.**
 *
 * - An **abnormal flag** (field 7) is recognized against HL7 Table 0078; an
 *   unrecognized flag is surfaced as `undefined` (with a warning) and is **never
 *   coerced to `normal`**.
 * - A **result status** (field 9) is modeled so a **correction (`C`)** or a
 *   **cancellation (`X`)** can never read as an active-final result, and an
 *   **absent** status is a typed `unspecified` — **never assumed `F` (final)**.
 * - A **reference range** (field 6) is parsed into a low/high (or open-ended)
 *   pair; an unparseable range is surfaced **verbatim** — a bound is **never
 *   fabricated**.
 *
 * Every bound and code is surfaced verbatim; nothing is collapsed, reconciled,
 * or converted. Units are handled at the record layer (a numeric value without
 * units warns; units are never defaulted, guessed, or converted — see
 * `./parse.ts`).
 */

/* ────────────────────────────── abnormal flags ────────────────────────────── */

/**
 * The recognized abnormal-flag letters, from **HL7 v2.2 Table 0078** (the flag
 * *value* set — a published fact set, not CLSI prose). Read in the context of an
 * `R` record's field 7: here `S`/`R`/`I` are the microbiology susceptibility
 * codes and `R` is **not** the repeat delimiter.
 */
export type AbnormalFlagCode =
  | "L"
  | "H"
  | "LL"
  | "HH"
  | "<"
  | ">"
  | "N"
  | "A"
  | "AA"
  | "U"
  | "D"
  | "B"
  | "W"
  | "S"
  | "R"
  | "I";

/**
 * The modeled meaning of a recognized {@link AbnormalFlagCode}, plus the two
 * fail-safe sentinels: `undefined` (a flag was present but is not in Table 0078)
 * — which is **never** collapsed to `normal`.
 */
export type AbnormalFlagMeaning =
  | "below-normal"
  | "above-normal"
  | "critically-below-normal"
  | "critically-above-normal"
  | "below-scale"
  | "above-scale"
  | "normal"
  | "abnormal"
  | "very-abnormal"
  | "significant-change-up"
  | "significant-change-down"
  | "better"
  | "worse"
  | "susceptible"
  | "resistant"
  | "intermediate"
  | "undefined";

/**
 * HL7 Table 0078 flag letter → modeled meaning. `U`/`D` are **directional**
 * significant-change flags (up / down) — *not* units or a delta magnitude — a
 * distinction that misreads a trend if collapsed. `LL`/`HH` are panic (critical)
 * low/high; `<`/`>` are off-scale low/high; `AA` is very-abnormal.
 */
const ABNORMAL_FLAG_MEANINGS: Readonly<Record<AbnormalFlagCode, AbnormalFlagMeaning>> = {
  L: "below-normal",
  H: "above-normal",
  LL: "critically-below-normal",
  HH: "critically-above-normal",
  "<": "below-scale",
  ">": "above-scale",
  N: "normal",
  A: "abnormal",
  AA: "very-abnormal",
  U: "significant-change-up",
  D: "significant-change-down",
  B: "better",
  W: "worse",
  S: "susceptible",
  R: "resistant",
  I: "intermediate",
};

/**
 * A recognized (or explicitly *un*recognized) abnormal flag. The raw field text
 * is always preserved; `recognized` is `false` and `meaning` is `"undefined"`
 * for any letter outside Table 0078 — the flag is surfaced, never dropped, and
 * **never coerced to `normal`**.
 *
 * @example
 * ```ts
 * import { interpretAbnormalFlag } from "@cosyte/astm";
 * const f = interpretAbnormalFlag("HH");
 * f.meaning;    // "critically-above-normal"
 * f.recognized; // true
 * ```
 */
export interface AbnormalFlag {
  /** The verbatim field text, exactly as received. */
  readonly raw: string;
  /** The Table 0078 code, present only when the raw text is a recognized flag. */
  readonly code?: AbnormalFlagCode;
  /** The modeled meaning; `"undefined"` (never `"normal"`) for an unrecognized flag. */
  readonly meaning: AbnormalFlagMeaning;
  /** Whether the raw text matched a Table 0078 flag. */
  readonly recognized: boolean;
}

/**
 * Interpret an `R`-record abnormal-flag field (field 7) against HL7 Table 0078.
 *
 * Leading/trailing whitespace is ignored for the lookup but the `raw` text is
 * preserved verbatim. An unrecognized flag yields `{ recognized: false, meaning:
 * "undefined" }` — surfaced, never dropped, and **never `"normal"`**.
 *
 * @param raw - The verbatim field-7 text.
 * @returns The interpreted flag.
 * @example
 * ```ts
 * import { interpretAbnormalFlag } from "@cosyte/astm";
 * interpretAbnormalFlag("U").meaning;   // "significant-change-up"
 * interpretAbnormalFlag("ZZ").meaning;  // "undefined" (never "normal")
 * ```
 */
export function interpretAbnormalFlag(raw: string): AbnormalFlag {
  const key = raw.trim();
  if (isAbnormalFlagCode(key)) {
    return { raw, code: key, meaning: ABNORMAL_FLAG_MEANINGS[key], recognized: true };
  }
  return { raw, meaning: "undefined", recognized: false };
}

function isAbnormalFlagCode(value: string): value is AbnormalFlagCode {
  return Object.prototype.hasOwnProperty.call(ABNORMAL_FLAG_MEANINGS, value);
}

/* ────────────────────────────── result status ────────────────────────────── */

/**
 * The recognized result-status letters (`R`-record field 9). The clinically
 * load-bearing members are **`C` (correction — supersedes a previously
 * transmitted value)** and **`X` (cannot be done / cancelled)**.
 */
export type ResultStatusCode = "F" | "C" | "P" | "R" | "S" | "I" | "X";

/**
 * The modeled meaning of a result status, plus two fail-safe sentinels:
 * `unspecified` (the field was absent — **never assumed `final`**) and
 * `undefined` (a letter was present but is not a recognized status).
 */
export type ResultStatusMeaning =
  | "final"
  | "correction"
  | "preliminary"
  | "previously-transmitted"
  | "partial"
  | "pending"
  | "cancelled"
  | "unspecified"
  | "undefined";

const RESULT_STATUS_MEANINGS: Readonly<Record<ResultStatusCode, ResultStatusMeaning>> = {
  F: "final",
  C: "correction",
  P: "preliminary",
  R: "previously-transmitted",
  S: "partial",
  I: "pending",
  X: "cancelled",
};

/**
 * A modeled result status. The three booleans are the safety surface a consumer
 * reads instead of string-matching the code:
 *
 * - **`isActiveFinal`** is `true` **only** for a plain `F` (final). It is `false`
 *   for a correction (`C`), a cancellation (`X`), a preliminary/partial/pending
 *   result, an absent status, and an unrecognized one — so a superseded or
 *   cancelled result can **never** read as current/final.
 * - **`supersedes`** is `true` for `C` — this value replaces a previously
 *   transmitted one.
 * - **`cancelled`** is `true` for `X` — the result cannot be done / was cancelled.
 *
 * @example
 * ```ts
 * import { interpretResultStatus } from "@cosyte/astm";
 * interpretResultStatus("C").isActiveFinal; // false (a correction is not active-final)
 * interpretResultStatus("X").cancelled;     // true
 * interpretResultStatus(undefined).meaning; // "unspecified" (never "final")
 * ```
 */
export interface ResultStatus {
  /** The verbatim field text, present only when field 9 carried a value. */
  readonly raw?: string;
  /** The recognized status code, present only when the raw text is a known status. */
  readonly code?: ResultStatusCode;
  /** The modeled meaning; `"unspecified"` when absent, `"undefined"` when unrecognized. */
  readonly meaning: ResultStatusMeaning;
  /** Whether the raw text matched a recognized status letter. */
  readonly recognized: boolean;
  /** `true` **only** for a plain `F` (final) — never for `C`, `X`, absent, or unrecognized. */
  readonly isActiveFinal: boolean;
  /** `true` for `C` — this value supersedes a previously transmitted result. */
  readonly supersedes: boolean;
  /** `true` for `X` — the result cannot be done / was cancelled. */
  readonly cancelled: boolean;
}

/**
 * Interpret an `R`-record result-status field (field 9).
 *
 * An **absent** status (`undefined` or empty) is typed `unspecified` — **never
 * assumed `final`**. A **present but unrecognized** letter is `undefined`
 * (recognized `false`). In every non-`F` case `isActiveFinal` is `false`, so a
 * correction, a cancellation, or an unknown status can never read as current.
 *
 * @param raw - The verbatim field-9 text, or `undefined`/empty when absent.
 * @returns The modeled status.
 * @example
 * ```ts
 * import { interpretResultStatus } from "@cosyte/astm";
 * const s = interpretResultStatus("F");
 * s.isActiveFinal; // true
 * s.supersedes;    // false
 * ```
 */
export function interpretResultStatus(raw: string | undefined): ResultStatus {
  if (raw === undefined || raw.trim().length === 0) {
    return {
      meaning: "unspecified",
      recognized: false,
      isActiveFinal: false,
      supersedes: false,
      cancelled: false,
    };
  }
  const key = raw.trim();
  if (isResultStatusCode(key)) {
    return {
      raw,
      code: key,
      meaning: RESULT_STATUS_MEANINGS[key],
      recognized: true,
      isActiveFinal: key === "F",
      supersedes: key === "C",
      cancelled: key === "X",
    };
  }
  return {
    raw,
    meaning: "undefined",
    recognized: false,
    isActiveFinal: false,
    supersedes: false,
    cancelled: false,
  };
}

function isResultStatusCode(value: string): value is ResultStatusCode {
  return Object.prototype.hasOwnProperty.call(RESULT_STATUS_MEANINGS, value);
}

/* ────────────────────────────── reference range ────────────────────────────── */

/**
 * The shape of a parsed reference range.
 *
 * - `closed` — both a low and a high bound (`3.5-5.0`).
 * - `open-low` — an upper bound only (`<5`): everything at or below `high`.
 * - `open-high` — a lower bound only (`>10`): everything at or above `low`.
 * - `unparsed` — the text did not match a recognized form; both bounds are
 *   absent and the raw text is surfaced. **A bound is never fabricated.**
 */
export type ReferenceRangeKind = "closed" | "open-low" | "open-high" | "unparsed";

/**
 * A parsed reference range. Bounds are surfaced as the **verbatim numeric text**
 * (never coerced to a float, never rounded, never converted) so nothing is lost
 * or fabricated.
 *
 * **`[OSS-derived]` — the exact lower/upper delimiter (`-`) and the open-ended
 * `<x`/`>x` forms are taken from the permissively-licensed OSS reference parsers
 * and cross-verified vendor transcripts; they are not confirmed against the
 * purchased CLSI LIS02-A2 (roadmap §10 Q1). Anything that does not match these
 * forms is surfaced verbatim as `unparsed`, never guessed into a bound.**
 *
 * @example
 * ```ts
 * import { parseReferenceRange } from "@cosyte/astm";
 * const r = parseReferenceRange("3.5-5.0");
 * r.kind; // "closed"
 * r.low;  // "3.5"
 * r.high; // "5.0"
 * ```
 */
export interface ReferenceRange {
  /** The verbatim field text, exactly as received. */
  readonly raw: string;
  /** The lower bound, verbatim numeric text (for `closed` and `open-high`). */
  readonly low?: string;
  /** The upper bound, verbatim numeric text (for `closed` and `open-low`). */
  readonly high?: string;
  /** The recognized shape, or `"unparsed"` when the text matched no known form. */
  readonly kind: ReferenceRangeKind;
}

/** Matches a single numeric literal: optional sign, digits, optional fraction. */
const NUMBER = "-?\\d+(?:\\.\\d+)?";
const OPEN_LOW = new RegExp(`^<\\s*(${NUMBER})$`, "u");
const OPEN_HIGH = new RegExp(`^>\\s*(${NUMBER})$`, "u");
const CLOSED = new RegExp(`^(${NUMBER})\\s*-\\s*(${NUMBER})$`, "u");

/**
 * Parse an `R`-record reference-range field (field 6) into a low/high (or
 * open-ended) pair.
 *
 * Recognized forms are `low-high` (closed), `<high` (open-low), and `>low`
 * (open-high). Anything else — including an ambiguous multi-dash string or a
 * bare non-numeric token — is returned as `kind: "unparsed"` with the raw text
 * preserved and **no bound invented**. Bounds are surfaced as verbatim text, not
 * coerced to numbers.
 *
 * @param raw - The verbatim field-6 text.
 * @returns The parsed reference range.
 * @example
 * ```ts
 * import { parseReferenceRange } from "@cosyte/astm";
 * parseReferenceRange("<5").kind;      // "open-low"
 * parseReferenceRange(">10").low;      // "10"
 * parseReferenceRange("weird").kind;   // "unparsed" (never a fabricated bound)
 * ```
 */
export function parseReferenceRange(raw: string): ReferenceRange {
  const text = raw.trim();

  const low = OPEN_LOW.exec(text);
  if (low?.[1] !== undefined) return { raw, high: low[1], kind: "open-low" };

  const high = OPEN_HIGH.exec(text);
  if (high?.[1] !== undefined) return { raw, low: high[1], kind: "open-high" };

  const closed = CLOSED.exec(text);
  if (closed?.[1] !== undefined && closed[2] !== undefined) {
    return { raw, low: closed[1], high: closed[2], kind: "closed" };
  }

  return { raw, kind: "unparsed" };
}
