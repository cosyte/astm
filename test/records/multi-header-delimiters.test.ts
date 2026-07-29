/**
 * Multi-header delimiter scoping: a stream may carry several messages (`H` … `L`), and each
 * header declares the delimiters for the records that follow it.
 *
 * The regression under test shipped from `0.0.1` through `0.0.3`: the parser read delimiters
 * **only** from the first header, so every record after a header that redeclared them merged into
 * a single field — a lost result, with **zero** warnings, and accepted by `strict` mode. The
 * fixtures below are synthetic; the patient/specimen identifiers and values are invented.
 *
 * Grounding for the chosen semantics (per-message, forward-scoped) is recorded on
 * `adoptRedeclaredDelimiters` in `src/records/parse.ts` and in `CHANGELOG.md`.
 */

import { describe, expect, it } from "vitest";

import {
  AstmParseError,
  AstmStrictError,
  WARNING_CODES,
  defineAstmProfile,
  AstmProfileDefinitionError,
  parseAstmRecords,
  serializeAstmRecords,
  messages,
  type ResultRecord,
} from "../../src/index.js";

/**
 * These fixtures are multi-message streams, so the flat `results()` refuses them
 * (`ASTM_AMBIGUOUS_MULTI_MESSAGE` — a stream-wide answer would span patients). The
 * delimiter question under test is per-message anyway, so each assertion below reads the
 * message it means through `messages()`.
 */
const resultsOfMessage = (raw: string, index: number): readonly ResultRecord[] =>
  messages(parseAstmRecords(raw))[index]?.results ?? [];

/** Message one, canonical `|\^&`. */
const MSG_CANONICAL = "H|\\^&|||sender\rP|1||LAB-1\rO|1|SPEC-7\rR|1|^^^687|28.6|U/L||N||F\rL|1|N\r";

/** Message two, self-consistently written in a fully different set: field `*`, repeat `~`, component `:`, escape `#`. */
const MSG_REDECLARED =
  "H*~:#***sender2\rP*1**LAB-2\rO*1*SPEC-8\rR*1*::688*99.9*mmol/L**H**F\rL*1*N\r";

const codes = (raw: string): string[] => parseAstmRecords(raw).warnings.map((w) => w.code);

describe("a later header that redeclares the delimiters", () => {
  const msg = parseAstmRecords(MSG_CANONICAL + MSG_REDECLARED);

  it("reads the records after it with the newly-declared set, not the first header's", () => {
    // Before the fix every one of these was a single merged field.
    expect(msg.records.slice(5).map((r) => r.fields.length)).toEqual([5, 4, 3, 9, 3]);
  });

  it("recovers the second message's result instead of silently losing it", () => {
    const second = messages(msg)[1]?.results[0];
    expect(second).toBeDefined();
    expect(second?.value).toBe("99.9");
    expect(second?.units).toBe("mmol/L");
    // The abnormal flag and the final status are the clinically load-bearing pair: before the fix
    // both were absent and `status` read `unspecified` on a result that is flagged high and final.
    expect(second?.abnormalFlags).toBe("H");
    expect(second?.flag?.meaning).toBe("above-normal");
    expect(second?.resultStatus).toBe("F");
    expect(second?.status.isActiveFinal).toBe(true);
  });

  it("also recovers the redeclaring header's own data fields", () => {
    const secondHeader = msg.records[5];
    expect(secondHeader?.type).toBe("H");
    expect(secondHeader?.fields.map((f) => f.raw)).toEqual(["H", "~:#", "", "", "sender2"]);
  });

  it("warns that the set changed, and that the new set is non-canonical", () => {
    expect(msg.warnings.map((w) => w.code)).toEqual([
      WARNING_CODES.ASTM_RECORD_DELIMITERS_REDECLARED,
      WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS,
    ]);
    expect(msg.warnings[0]?.position).toEqual({ recordIndex: 5, recordType: "H" });
  });

  it("carries no delimiter characters in the warning text (PHI/value discipline)", () => {
    for (const w of msg.warnings) {
      expect(w.message).not.toMatch(/[*~:#]/u);
    }
  });

  it("does not reinterpret the bytes it already consumed", () => {
    // Message one is byte-for-byte identical whether or not message two follows it.
    const alone = parseAstmRecords(MSG_CANONICAL);
    const projection = (m: {
      records: readonly { fields: readonly { raw: string }[] }[];
    }): unknown => m.records.slice(0, 5).map((r) => r.fields.map((f) => f.raw));
    expect(projection(msg)).toEqual(projection(alone));
  });

  it("reports each header's own set as that header's provenance", () => {
    expect(msg.records[0]).toMatchObject({ delimiters: { field: "|", component: "^" } });
    expect(msg.records[5]).toMatchObject({
      delimiters: { field: "*", repeat: "~", component: ":", escape: "#" },
    });
    // The message-level set stays the FIRST header's declaration.
    expect(msg.delimiters).toEqual({ field: "|", repeat: "\\", component: "^", escape: "&" });
  });

  it("emits a stream whose records survive a re-read (both messages in one set)", () => {
    const reparsed = parseAstmRecords(serializeAstmRecords(msg));
    expect(
      messages(reparsed).flatMap((m) =>
        m.results.map((r: ResultRecord) => [r.value, r.units, r.abnormalFlags]),
      ),
    ).toEqual([
      ["28.6", "U/L", "N"],
      ["99.9", "mmol/L", "H"],
    ]);
    // Both messages survive the round-trip as messages, each with its own result.
    expect(messages(reparsed).map((m) => m.results.length)).toEqual([1, 1]);
    // Normalized to one set, so the re-read sees no redeclaration at all.
    expect(reparsed.warnings).toEqual([]);
  });

  it("is rejected by strict mode, where before the fix it was silently accepted", () => {
    expect(() => parseAstmRecords(MSG_CANONICAL + MSG_REDECLARED, { strict: true })).toThrow(
      AstmStrictError,
    );
  });
});

describe("a later header that restates the set already in force", () => {
  const raw =
    "H|\\^&|||sender\rP|1||LAB-1\rL|1|N\r" +
    "H|\\^&|||sender2\rP|1||LAB-2\rR|1|^^^688|99.9|mmol/L||H||F\rL|1|N\r";

  it("is a silent no-op — several messages in one delimiter set is an ordinary shape", () => {
    expect(codes(raw)).toEqual([]);
  });

  it("still parses both messages' records in full", () => {
    const msg = parseAstmRecords(raw);
    expect(msg.records.map((r) => r.fields.length)).toEqual([5, 4, 3, 5, 4, 9, 3]);
    expect(messages(msg)[1]?.results[0]?.value).toBe("99.9");
  });

  it("is accepted by strict mode", () => {
    expect(() => parseAstmRecords(raw, { strict: true })).not.toThrow();
  });
});

describe("a later header that cannot declare a usable set", () => {
  it("keeps the set in force and warns when the declaration is too short", () => {
    const raw = "H|\\^&|||sender\rL|1|N\rH|\rR|1|^^^688|99.9|mmol/L||H||F\rL|1|N\r";
    expect(codes(raw)).toEqual([WARNING_CODES.ASTM_RECORD_UNREADABLE_REDECLARATION]);
    // Records after it are still read with the previous set, so nothing is lost.
    expect(resultsOfMessage(raw, 1)[0]?.value).toBe("99.9");
  });

  it("keeps the set in force when the field separator also names another role", () => {
    // `H*~*#` — the field separator `*` reappears as the component separator, so the four roles
    // are indistinguishable and the declaration is refused rather than mis-split.
    const raw = "H|\\^&|||sender\rL|1|N\rH*~*#***s2\rR|1|^^^688|99.9|mmol/L||H||F\rL|1|N\r";
    expect(codes(raw)).toEqual([WARNING_CODES.ASTM_RECORD_UNREADABLE_REDECLARATION]);
  });

  it("reports the inherited set as that header's provenance rather than guessing one", () => {
    const msg = parseAstmRecords("H|\\^&|||sender\rL|1|N\rH|\r");
    expect(msg.records[2]).toMatchObject({
      delimiters: { field: "|", repeat: "\\", component: "^", escape: "&" },
    });
  });

  it("never drops the record", () => {
    const msg = parseAstmRecords("H|\\^&|||sender\rL|1|N\rH|\r");
    expect(msg.records).toHaveLength(3);
    expect(msg.records[2]?.type).toBe("H");
  });

  it("leaves the FIRST header's unusable declaration a fatal, not a warning", () => {
    // There is no earlier set to fall back to, so this must not have been softened.
    expect(() => parseAstmRecords("H|\r")).toThrow(AstmParseError);
    expect(() => parseAstmRecords("H|\r")).toThrow(/declare the four delimiters/u);
  });
});

describe("a redeclaration with no intervening terminator", () => {
  it("is still honored from that header onward", () => {
    // Malformed nesting (no `L` closing message one), but the delimiter question is the same and
    // guessing that the header is 'not really' a header would lose the records after it.
    const raw = "H|\\^&|||sender\rP|1||LAB-1\rH*~:#***s2\rR*1*::688*99.9*mmol/L**H**F\rL*1*N\r";
    const msg = parseAstmRecords(raw);
    expect(messages(msg)[1]?.results[0]?.value).toBe("99.9");
    expect(msg.warnings.map((w) => w.code)).toContain(
      WARNING_CODES.ASTM_RECORD_DELIMITERS_REDECLARED,
    );
  });
});

describe("the new codes are outside the profile tolerance allow-list", () => {
  it("refuses a profile that tries to tolerate a delimiter redeclaration", () => {
    expect(() =>
      defineAstmProfile({
        name: "rogue",
        tolerate: [
          { code: WARNING_CODES.ASTM_RECORD_DELIMITERS_REDECLARED, rationale: "should be refused" },
        ],
      }),
    ).toThrow(AstmProfileDefinitionError);
  });

  it("refuses a profile that tries to tolerate an unreadable redeclaration", () => {
    expect(() =>
      defineAstmProfile({
        name: "rogue",
        tolerate: [
          { code: WARNING_CODES.ASTM_RECORD_UNREADABLE_REDECLARATION, rationale: "refused" },
        ],
      }),
    ).toThrow(/safety-critical/u);
  });
});
