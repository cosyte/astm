/**
 * Property-based conformance tests for `@cosyte/astm`, driven by the shared
 * `@cosyte/test-utils` invariant runners. The kit owns the **invariants**; this
 * parser owns the **format-specific arbitraries** below.
 *
 * Active:
 *   - **lenient-mode** — arbitrary / hostile bytes never throw outside the fatal
 *     set, and every recovered warning carries a registered code + position;
 *   - **immutability** — the parsed model rejects mutation (frozen) and never
 *     changes previously-read state; and
 *   - **round-trip** (P7) — `serialize` is the conservative inverse of `parse`:
 *     for any spec-shaped message, `serialize(parse(serialize(x))) === serialize(x)`
 *     (serialization is idempotent, so re-parsing an emitted stream yields the same
 *     canonical form — embedded delimiters re-escaped, delimiters normalized).
 */

import { describe, it } from "vitest";
import fc from "fast-check";
import {
  immutabilityProperty,
  lenientNeverThrowsProperty,
  roundTripProperty,
} from "@cosyte/test-utils";

import {
  AstmParseError,
  FATAL_CODES,
  WARNING_CODES,
  parseAstmRecords,
  serializeAstmRecords,
  type AstmMessage,
} from "../../src/index.js";

const fatalCodes = new Set<string>(Object.values(FATAL_CODES));
const knownWarningCodes = new Set<string>(Object.values(WARNING_CODES));

/** A single ASTM record line built from a random type letter and random fields. */
function recordLine(): fc.Arbitrary<string> {
  const typeLetter = fc.constantFrom("P", "O", "R", "L", "C", "Q", "M", "S", "Z");
  const field = fc.stringMatching(/^[A-Za-z0-9.^\\&/ -]*$/u);
  return fc
    .tuple(typeLetter, fc.array(field, { maxLength: 6 }))
    .map(([t, fields]) => [t, ...fields].join("|"));
}

/**
 * Spec-shaped input: a canonical header followed by random records. It always
 * parses cleanly (leads with a delimiter-declaring `H`), so it feeds both the
 * immutability runner and the "quirky-but-valid" half of the lenient runner.
 */
function specShapedInput(): fc.Arbitrary<string> {
  return fc.array(recordLine(), { maxLength: 8 }).map((lines) => ["H|\\^&", ...lines].join("\r"));
}

/**
 * Hostile / quirky input — arbitrary bytes, header-less streams, and spec-shaped
 * records mixed together. The lenient parser must recover every one into a
 * warning or an *allowed* fatal, never an unclassified throw.
 */
function hostileInput(): fc.Arbitrary<string> {
  return fc.oneof(fc.string(), fc.fullUnicodeString(), specShapedInput());
}

describe("astm conformance (archetype invariants)", () => {
  it("is lenient — arbitrary input never throws a non-fatal, and every warning has a known code", () => {
    lenientNeverThrowsProperty({
      arbitrary: hostileInput(),
      parse: (raw: string) => parseAstmRecords(raw),
      isFatal: (err) => err instanceof AstmParseError && fatalCodes.has(err.code),
      getWarnings: (parsed) => (parsed as AstmMessage).warnings,
      isKnownCode: (code) => knownWarningCodes.has(code),
      hasPositionalContext: (warning) =>
        typeof warning.position === "object" &&
        warning.position !== null &&
        typeof (warning.position as { recordIndex?: unknown }).recordIndex === "number",
    });
  });

  it("is immutable — the parsed model rejects mutation and preserves prior state", () => {
    immutabilityProperty({
      arbitrary: specShapedInput(),
      parse: (raw: string) => parseAstmRecords(raw),
      // The frozen records array must reject a push (throws) — a valid frozen response.
      mutate: (m) => (m.records as unknown[]).push({ type: "L" }),
      getSnapshot: (m) => m.records.map((r) => r.type),
    });
  });

  it("round-trips — the serializer is the conservative inverse of the parser", () => {
    roundTripProperty<AstmMessage>({
      // The parser's own arbitrary: a spec-shaped message, parsed into the model.
      arbitrary: specShapedInput().map((raw) => parseAstmRecords(raw)),
      serialize: (msg) => serializeAstmRecords(msg),
      parse: (raw) => parseAstmRecords(raw),
      // Structural equality via the canonical wire form (the model carries the shared
      // `header === records[0]` reference and re-escapes on emit, so compare canonically).
      equals: (a, b) => serializeAstmRecords(a) === serializeAstmRecords(b),
    });
  });
});
