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

import { describe, expect, it } from "vitest";
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
  type Delimiters,
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

/**
 * The delimiter bytes a header may declare, and the value alphabet drawn from them. Values
 * deliberately re-use delimiter characters: whichever four the header claims, the other
 * seven are ordinary data that emit must escape rather than mis-split.
 */
const DELIMITER_POOL = ["|", "\\", "^", "&", "#", "~", "*", "!", "@", "$", "%"] as const;
const VALUE_POOL = [...["A", "B", "X", "Y", "0", "1", "9", ".", "-"], ...DELIMITER_POOL];

/** Any coherent four-delimiter declaration, canonical or not — all four roles distinct. */
function delimiterSet(): fc.Arbitrary<Delimiters> {
  return fc
    .uniqueArray(fc.constantFrom(...DELIMITER_POOL), { minLength: 4, maxLength: 4 })
    .map((chars) => ({
      field: chars[0] ?? "|",
      repeat: chars[1] ?? "\\",
      component: chars[2] ?? "^",
      escape: chars[3] ?? "&",
    }));
}

/**
 * A well-formed message written in an arbitrary declared delimiter set, carrying the vendor
 * free-form `M`/`S` records alongside the modeled types. Synthetic content only.
 */
function arbitraryDelimiterMessage(): fc.Arbitrary<string> {
  return delimiterSet().chain((d) => {
    const declared = new Set<string>([d.field, d.repeat, d.component, d.escape]);
    const alphabet = VALUE_POOL.filter((c) => !declared.has(c));
    const atom = fc.array(fc.constantFrom(...alphabet), { maxLength: 4 }).map((cs) => cs.join(""));
    const value = fc.array(atom, { minLength: 1, maxLength: 3 }).map((cs) => cs.join(d.component));
    const line = fc
      .tuple(
        fc.constantFrom("M", "S", "M", "S", "P", "O", "R", "C", "Q", "L", "Z"),
        fc.array(value, { minLength: 1, maxLength: 5 }),
      )
      .map(([t, vs]) => [t, ...vs].join(d.field));
    return fc
      .tuple(fc.array(value, { maxLength: 3 }), fc.array(line, { minLength: 1, maxLength: 6 }))
      .map(([headerFields, lines]) => {
        const header =
          "H" +
          d.field +
          d.repeat +
          d.component +
          d.escape +
          headerFields.map((v) => d.field + v).join("");
        return [header, ...lines].join("\r") + "\r";
      });
  });
}

/** The decoded value tree of a record — what a reader actually recovers, delimiters aside. */
function valueTree(
  record: { readonly fields: readonly { readonly repeats: readonly (readonly string[])[] }[] },
  from = 0,
) {
  return record.fields.slice(from).map((f) => f.repeats.map((r) => [...r]));
}

describe("emit is single-delimiter-set — a round-trip never silently loses a field", () => {
  // The defect this pins: `M`/`S` were re-emitted byte-for-byte while the header was
  // normalized, so the output declared one delimiter set and those rows used another.
  // Re-parsing collapsed every field of an `M`/`S` row into one, with ZERO warnings — on the
  // analyzer/LIS path, a silently lost result or specimen identifier.
  it("recovers every field of every record after serialize -> parse, for any declared set", () => {
    fc.assert(
      fc.property(arbitraryDelimiterMessage(), (raw) => {
        const before = parseAstmRecords(raw);
        const after = parseAstmRecords(serializeAstmRecords(before));

        expect(after.records.map((r) => r.type)).toStrictEqual(before.records.map((r) => r.type));
        before.records.forEach((rec, i) => {
          const roundTripped = after.records[i];
          expect(roundTripped).toBeDefined();
          if (roundTripped === undefined) return;
          // The header's delimiter declaration (field 2) legitimately changes with the emit
          // set; its DATA fields, and every field of every other record, must not.
          const from = rec.type === "H" ? 2 : 0;
          expect(valueTree(roundTripped, from)).toStrictEqual(valueTree(rec, from));
        });
      }),
      { numRuns: 300 },
    );
  });

  it("emits a stream whose every record reads under the delimiters the header declares", () => {
    fc.assert(
      fc.property(arbitraryDelimiterMessage(), (raw) => {
        const out = serializeAstmRecords(parseAstmRecords(raw));
        // Serializing the re-parsed stream is a fixed point: nothing was left to normalize.
        expect(serializeAstmRecords(parseAstmRecords(out))).toBe(out);
      }),
      { numRuns: 300 },
    );
  });
});
