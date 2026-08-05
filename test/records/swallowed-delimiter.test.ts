/**
 * An unrecognized escape body that is itself a delimiter now has a report of its own.
 *
 * The escape-aware split treats an `&X&` triple as an opaque atom. That is deliberate and is not
 * changed here: it is what keeps `&F&` one token under a declared set that names `F` as a
 * delimiter. The cost is that where `X` is an unrecognized character that is itself a delimiter in
 * force, that delimiter never becomes a boundary, and the record is read with one fewer division
 * than its bytes carry.
 *
 * That loss was reported only by `ASTM_UNKNOWN_ESCAPE_SEQUENCE`, which is on the profile
 * allow-list, so the shipped `referenceCorpus` profile left `{ strict: true }` accepting a record
 * whose units were gone and whose status read `unspecified` rather than `final`.
 *
 * **This slice adds a second, narrower code and changes nothing else.** The split is untouched, the
 * decoded value is byte-identical, and `ASTM_UNKNOWN_ESCAPE_SEQUENCE` still fires and is still
 * tolerable, because it remains true and benign of every unrecognized body that is *not* a
 * delimiter in force. What is new is that the subset which costs a boundary also raises
 * `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`, which no profile may tolerate.
 *
 * **Two things this does NOT do, stated so they are not read into it.** It does not repair the
 * reading: the value below is the same wrong value it always was. And it does not survive a
 * re-emit: emit rewrites the preserved sequence into recognized mnemonics, and the resulting stream
 * says that value unambiguously, so a second-generation read is silent and is *correct about its
 * own bytes*. The first read of the wire bytes is the only place the condition exists to be caught,
 * and that is where the refusal now lands.
 *
 * **The corpus is named by the constants in this file** (`BODY_ALPHABET` and `bodyStream`): a
 * figure whose corpus is not in the tree cannot be re-derived.
 *
 * All fixtures are **synthetic**. No clause of ASTM E1394 / CLSI LIS01 / LIS02 is claimed: the
 * atom rule and the mnemonic set are this package's own codec, cross-read against the OSS
 * implementations, and nothing here rests on standards text this repo cannot read.
 */

import { describe, expect, it } from "vitest";

import {
  astmProfiles,
  AstmStrictError,
  defineAstmProfile,
  parseAstmRecords,
  results,
  serializeAstmRecords,
  splitEscapeAware,
  TOLERABLE_CODES,
  WARNING_CODES,
} from "../../src/index.js";

const codes = (raw: string): string[] => parseAstmRecords(raw).warnings.map((w) => w.code);

/** The measured fixture: `&|&` under the canonical set, where `|` is the field separator. */
const SWALLOWED = "H|\\^&\rP|1||LAB-0001\rR|1|^^^687|28.6&|&U/L||||F\rL|1|N\r";

/**
 * The committed corpus alphabet for escape bodies: the same twelve punctuation characters the
 * declaration sweep uses. Three of them (`|`, `\`, `^`) are the splitting roles of the canonical
 * set; `&` is its escape role, which splits nothing; the other eight are not delimiters at all.
 */
const BODY_ALPHABET = ["|", "\\", "^", "&", "~", ":", "#", "*", "!", "@", "$", "%"] as const;

/**
 * The committed corpus stream: one spec-clean result record whose value carries an `&X&` sequence
 * with content on both sides, so the record's field layout is identical for every body and the
 * only variable is which warnings the body raises.
 */
const bodyStream = (body: string): string =>
  `H|\\^&\rP|1||LAB-0001\rR|1|^^^687|28.6&${body}&5|U/L||N||F\rL|1|N\r`;

describe("the measured fixture: a swallowed field separator", () => {
  it("reads the same wrong value it always did, and now says a boundary went missing", () => {
    const [only] = results(parseAstmRecords(SWALLOWED));
    expect(only?.value).toBe("28.6&|&U/L");
    expect(only?.units).toBeUndefined();
    expect(only?.status.meaning).toBe("unspecified");
    expect(only?.status.isActiveFinal).toBe(false);

    expect(codes(SWALLOWED)).toEqual([
      WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
      WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE,
    ]);
    const w = parseAstmRecords(SWALLOWED).warnings[1];
    expect(w?.position).toEqual({ recordIndex: 2, recordType: "R", fieldIndex: 4 });
    // A delimiter is a byte off the wire; the message names none of them.
    expect(w?.message).not.toMatch(/[|^&\\]/u);
  });

  it("is refused under the shipped referenceCorpus profile in strict mode", () => {
    expect(() =>
      parseAstmRecords(SWALLOWED, { strict: true, profile: astmProfiles.referenceCorpus }),
    ).toThrow(AstmStrictError);
    try {
      parseAstmRecords(SWALLOWED, { strict: true, profile: astmProfiles.referenceCorpus });
    } catch (err) {
      const escalating = (err as AstmStrictError).warnings.map((x) => x.code);
      // The tolerated one is re-badged and does not escalate; the new one does.
      expect(escalating).toEqual([WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE]);
    }
  });

  it("keeps the tolerable code tolerable and the new one out of reach of a profile", () => {
    expect(TOLERABLE_CODES.has(WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE)).toBe(true);
    expect(TOLERABLE_CODES.has(WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE)).toBe(
      false,
    );
    expect(() =>
      defineAstmProfile({
        name: "nope",
        tolerate: [
          { code: WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE, rationale: "no" },
        ],
      }),
    ).toThrow();
  });

  it("does not narrow the atom: an escaped delimiter is still one token", () => {
    // The guarantee the atom exists for. Narrowing it to close this defect would break this.
    expect(splitEscapeAware("a&F&b", "F", "&")).toEqual(["a&F&b"]);
    expect(splitEscapeAware("28.6&|&U/L", "|", "&")).toEqual(["28.6&|&U/L"]);
  });

  it("does NOT reach through a re-emit, and the second generation is right about its own bytes", () => {
    // Emit launders the preserved sequence into recognized mnemonics. Those bytes then say this
    // value unambiguously, so generation two is silent, and correctly so. The disclosure is that
    // the catch point is the FIRST read, not that the round trip is now guarded.
    const emitted = serializeAstmRecords(parseAstmRecords(SWALLOWED));
    expect(emitted).toContain("28.6&E&&F&&E&U/L");
    expect(codes(emitted)).toEqual([]);
    expect(results(parseAstmRecords(emitted))[0]?.value).toBe("28.6&|&U/L");
  });
});

describe("the sweep over the committed body alphabet", () => {
  it("reports exactly the bodies that are splitting delimiters in force", () => {
    const reported: string[] = [];
    const accepted: string[] = [];
    for (const body of BODY_ALPHABET) {
      const raw = bodyStream(body);
      const seen = codes(raw);
      // Every body in this alphabet is unrecognized, so this fires for all twelve.
      expect(seen).toContain(WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE);
      if (seen.includes(WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE)) {
        reported.push(body);
      }
      try {
        parseAstmRecords(raw, { strict: true, profile: astmProfiles.referenceCorpus });
        accepted.push(body);
      } catch (err) {
        if (!(err instanceof AstmStrictError)) throw err;
      }
    }
    // Three of twelve, enumerated: the field, repeat and component roles of the canonical set.
    expect(reported).toEqual(["|", "\\", "^"]);
    // The escape role is deliberately not among them: nothing splits on it, so `&&&` costs no
    // boundary. The remaining eight are not delimiters at all.
    expect(accepted).toEqual(["&", "~", ":", "#", "*", "!", "@", "$", "%"]);
    expect(reported.length + accepted.length).toBe(BODY_ALPHABET.length);
  });

  it("reads every one of the twelve into the same record, so only the reporting varies", () => {
    for (const body of BODY_ALPHABET) {
      const [only] = results(parseAstmRecords(bodyStream(body)));
      expect(only?.units).toBe("U/L");
      expect(only?.status.meaning).toBe("final");
      expect(only?.value).toBe(`28.6&${body}&5`);
    }
  });

  it("reports it in a header's data fields, at the whole-record field index", () => {
    // The header has its own tokenizer, because its declaration field carries the three non-field
    // delimiters literally. The declaration stays opaque and never reports; the data portion after
    // it does, and its indices are shifted back to whole-record positions.
    const raw = "H|\\^&|28.6&|&U/L|sender\rP|1||LAB-0001\rL|1|N\r";
    expect(codes(raw)).toEqual([
      WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
      WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE,
    ]);
    expect(parseAstmRecords(raw).warnings[1]?.position).toEqual({
      recordIndex: 0,
      recordType: "H",
      fieldIndex: 3,
    });
  });

  it("never reports the delimiters the header's own declaration names literally", () => {
    // `H|&^&` declares repeat and escape as `&`, so the declaration `&^&` has the exact shape of an
    // escape sequence whose body is the component delimiter. It is taken verbatim as one opaque
    // field instead, so it reports nothing, while the data portion after it reports normally: the
    // stream below carries ONE pair of escape warnings, from the data, not two.
    expect(codes("H|&^&|28.6&^&5\rP|1||LAB-0001\rL|1|N\r")).toEqual([
      WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS,
      WARNING_CODES.ASTM_RECORD_DELIMITER_ROLE_COLLISION,
      WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
      WARNING_CODES.ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE,
    ]);
    // A header with no data portion at all reports only what its declaration is worth.
    expect(codes("H|&^&\rP|1||LAB-0001\rL|1|N\r")).toEqual([
      WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS,
      WARNING_CODES.ASTM_RECORD_DELIMITER_ROLE_COLLISION,
    ]);
  });

  it("leaves a recognized mnemonic alone even when it names a delimiter in force", () => {
    // Under a set declaring `F` as the repeat delimiter, `&F&` is the sender escaping the field
    // separator on purpose. Reporting a swallowed repeat boundary there would report the escape
    // mechanism working as a defect.
    const raw = "H|F^&\rP|1||LAB-0001\rR|1|^^^687|28.6&F&5|U/L||N||F\rL|1|N\r";
    expect(codes(raw)).toEqual([WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS]);
    expect(results(parseAstmRecords(raw))[0]?.value).toBe("28.6|5");
  });
});
