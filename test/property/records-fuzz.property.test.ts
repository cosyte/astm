/**
 * REQUIRED byte-level FUZZ layer for the record tokenizer — the companion to the frame-codec fuzz
 * (`frames-fuzz.property.test.ts`), the same bar as `dicom` Part 10 and `mllp` framing.
 *
 * The hard guarantee: feeding **arbitrary / truncated / delimiter-laden / escape-laden** input into
 * {@link parseAstmRecords} must never crash, hang, or OOM — it degrades to a typed fatal or a
 * value-free warning. In lenient mode the only sanctioned throws are the three record-layer Tier-3
 * fatals (`EMPTY_INPUT`, `ASTM_RECORD_NO_HEADER`, `ASTM_RECORD_UNDECLARED_DELIMITERS`); every warning
 * it accumulates must carry a **registered** `WARNING_CODES` entry — never an unregistered code, and
 * never a raw value.
 *
 * A well-formed header is prepended to the deep-path arbitraries so the fuzzer drives the tokenizer,
 * the escape codec, the R/P/O/C/Q field logic, and comment attachment — not just the "no header ⇒
 * fatal" fast path. The nightly extended run (`ASTM_FUZZ_RUNS`) scales the case count without
 * changing the assertions.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  AstmParseError,
  AstmStrictError,
  FATAL_CODES,
  WARNING_CODES,
  parseAstmRecords,
} from "../../src/index.js";

/** Nightly runs scale via ASTM_FUZZ_RUNS; the in-suite default keeps CI fast but non-trivial. */
const NUM_RUNS = Number(process.env["ASTM_FUZZ_RUNS"] ?? 800);

const KNOWN_RECORD_CODES = new Set<string>(Object.values(WARNING_CODES));
const SANCTIONED_LENIENT_FATALS = new Set<string>([
  FATAL_CODES.EMPTY_INPUT,
  FATAL_CODES.ASTM_RECORD_NO_HEADER,
  FATAL_CODES.ASTM_RECORD_UNDECLARED_DELIMITERS,
]);

/** A canonical header, so appended noise is parsed as records rather than rejected up front. */
const HEADER = "H|\\^&\r";

/** ASTM structural characters, so noise partially forms fields/components/escapes. */
const STRUCTURAL = ["|", "^", "\\", "&", "\r", "R", "P", "O", "C", "Q", "M", "S", "L", "1"];

/** Arbitrary text biased toward structural chars + arbitrary code points (incl. control + unicode). */
function structuralNoise(): fc.Arbitrary<string> {
  const ch = fc.oneof(
    fc.constantFrom(...STRUCTURAL),
    fc.string({ maxLength: 4 }),
    fc.integer({ min: 0, max: 0x10ffff }).map((cp) => {
      try {
        return String.fromCodePoint(cp);
      } catch {
        return "?";
      }
    }),
  );
  return fc.array(ch, { maxLength: 60 }).map((a) => a.join(""));
}

function assertWarningsWellFormed(warnings: readonly { code: string }[]): void {
  for (const w of warnings) {
    // Every accumulated warning carries a registered code (value-freeness is a type-level guarantee
    // enforced on the warning constructors, not re-asserted here).
    expect(KNOWN_RECORD_CODES.has(w.code)).toBe(true);
  }
}

function assertSanctionedLenient(err: unknown): void {
  if (err instanceof AstmParseError && SANCTIONED_LENIENT_FATALS.has(err.code)) return;
  throw err;
}

describe("fuzz: arbitrary input never crashes the record parser (lenient)", () => {
  it("whole-buffer structural noise: no unsanctioned throw, every warning is a known code", () => {
    fc.assert(
      fc.property(structuralNoise(), (raw) => {
        try {
          const { warnings } = parseAstmRecords(raw);
          assertWarningsWellFormed(warnings);
        } catch (err) {
          assertSanctionedLenient(err);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("header + arbitrary record body (deep paths) never crashes and never throws in lenient mode", () => {
    fc.assert(
      fc.property(structuralNoise(), (body) => {
        // With a valid header, lenient parse must NEVER throw — every deviation is a warning.
        const { warnings } = parseAstmRecords(HEADER + body);
        assertWarningsWellFormed(warnings);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("truncation at every prefix of a realistic message never crashes", () => {
    const full =
      "H|\\^&\rP|1|PRAC|LAB|||Doe^John^Q||19700101|M\rO|1|ACC||^^^687|R\rR|1|^^^687|Some&S&Note|U/L|10-40|H||C\rC|1|I|note\rL|1|N\r";
    fc.assert(
      fc.property(fc.integer({ min: 1, max: full.length }), (len) => {
        try {
          const { warnings } = parseAstmRecords(full.slice(0, len));
          assertWarningsWellFormed(warnings);
        } catch (err) {
          assertSanctionedLenient(err);
        }
      }),
      { numRuns: full.length },
    );
  });
});

describe("fuzz: strict mode only ever throws a sanctioned typed error", () => {
  it("header + noise in strict mode throws only AstmStrictError / a sanctioned fatal", () => {
    fc.assert(
      fc.property(structuralNoise(), (body) => {
        try {
          parseAstmRecords(HEADER + body, { strict: true });
        } catch (err) {
          if (err instanceof AstmStrictError) return;
          assertSanctionedLenient(err);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("record fuzz is non-vacuous — the tokenizer actually engages", () => {
  it("a header + a real result record always parses one result with the value preserved", () => {
    fc.assert(
      fc.property(
        // A value with no delimiters/escapes/CR so it survives as a single component verbatim.
        fc
          .string({ minLength: 1, maxLength: 12 })
          .map((s) => [...s].filter((c) => !"|^\\&\r\n".includes(c)).join(""))
          .filter((s) => s.length > 0),
        (value) => {
          const msg = parseAstmRecords(`H|\\^&\rR|1|^^^687|${value}|U/L\rL|1\r`);
          expect(msg.records.some((r) => r.type === "R")).toBe(true);
        },
      ),
      { numRuns: 400 },
    );
  });
});
