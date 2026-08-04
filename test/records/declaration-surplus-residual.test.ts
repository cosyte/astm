/**
 * What a header's delimiter-declaration surplus costs on emit
 * (`src/records/serialize.ts`, `declarationResidual`).
 *
 * Only three characters of a declaration carry a role. A vendor may declare more,
 * and the reader ignores the rest rather than refusing the stream. Emit preserves
 * that surplus, which is what makes the round trip byte-exact, **except** where the
 * surplus could not be read back as surplus: it carries the field delimiter, or any
 * control character. Then the **whole** surplus is dropped, silently, because emit
 * returns a bare string and has no channel to report anything.
 *
 * This file exists because that exception was reachable from three shipped surfaces
 * that stated the preservation rule without it. It pins the cost so the sentences
 * cannot drift back to the unqualified form, and so the disposition (drop, rather
 * than refuse or carry through) is a measured choice rather than an assumption.
 *
 * The characters are built with `String.fromCharCode` rather than embedded, so this
 * file stays plain ASCII: a scanner that treats a source file as binary reports
 * nothing about it, and nothing here is worth making invisible.
 *
 * All fixtures are synthetic.
 */

import { describe, expect, it } from "vitest";

import { parseAstmRecords, serializeAstmRecords } from "../../src/index.js";

/** Every C0 control character plus `DEL`: 33 in total. */
const CONTROL_CODE_POINTS: readonly number[] = [...Array.from({ length: 0x20 }, (_, i) => i), 0x7f];

const CR = 0x0d;
const LF = 0x0a;

/** A spec-clean canonical stream whose header declaration carries `surplus`. */
function streamWithSurplus(surplus: string): string {
  return `H|\\^&${surplus}|||SENDER^SYS\rP|1||LAB-0001\rL|1|N\r`;
}

describe("a surplus that reads back as surplus is preserved, byte for byte", () => {
  it("keeps an ordinary printable surplus on the default canonical path", () => {
    const raw = streamWithSurplus("#$%");
    const msg = parseAstmRecords(raw);
    expect(msg.warnings).toEqual([]);
    expect(serializeAstmRecords(msg)).toBe(raw);
  });
});

describe("31 of the 33 C0/DEL characters are dropped from a surplus, silently", () => {
  const dropped: number[] = [];
  const neverReachedTheRule: number[] = [];
  const carriedThrough: number[] = [];

  for (const cp of CONTROL_CODE_POINTS) {
    const ch = String.fromCharCode(cp);
    const msg = parseAstmRecords(streamWithSurplus(ch));
    const modelled = msg.records[0]?.fields[1]?.raw ?? "";
    if (!modelled.includes(ch)) {
      neverReachedTheRule.push(cp);
      continue;
    }
    if (serializeAstmRecords(msg).includes(ch)) carriedThrough.push(cp);
    else dropped.push(cp);
  }

  it("partitions the 33 characters exactly", () => {
    expect(dropped).toHaveLength(31);
    expect(carriedThrough).toEqual([]);
    // The two that never reach `declarationResidual` are the record terminators:
    // they end the record while it is being read, so no surplus ever holds them.
    expect(neverReachedTheRule.sort((a, b) => a - b)).toEqual([LF, CR]);
  });

  it("says nothing about any of them, on either side of the round trip", () => {
    for (const cp of dropped) {
      const ch = String.fromCharCode(cp);
      const raw = streamWithSurplus(ch);
      const msg = parseAstmRecords(raw);
      expect(msg.warnings).toEqual([]);

      const emitted = serializeAstmRecords(msg);
      expect(emitted).not.toBe(raw);
      expect(emitted.startsWith("H|\\^&|")).toBe(true);

      // And it is stable: the loss happens once, then the stream round-trips.
      expect(serializeAstmRecords(parseAstmRecords(emitted))).toBe(emitted);
    }
  });
});

describe("the drop is all-or-nothing, which is the part no surface stated", () => {
  it("takes the ordinary characters of the surplus with the control character", () => {
    const unitSeparator = String.fromCharCode(0x1f);
    const raw = streamWithSurplus(`#${unitSeparator}$`);
    const msg = parseAstmRecords(raw);
    expect(msg.warnings).toEqual([]);

    const emitted = serializeAstmRecords(msg);
    expect(emitted.split("\r")[0]).toBe("H|\\^&|||SENDER^SYS");
    // Not merely the control character: the `#` and the `$` are gone with it.
    expect(emitted).not.toContain("#");
    expect(emitted).not.toContain("$");
  });
});

describe("the field-delimiter arm of the rule, and where it really fires", () => {
  it("is unreachable from a header parsed under the set being emitted", () => {
    // The reader takes the declaration up to the first field delimiter, so `$` here
    // is a data field rather than part of the surplus, and the surplus that remains
    // (`#`) is preserved.
    const raw = "H|\\^&#|$|||SENDER^SYS\rL|1|N\r";
    const msg = parseAstmRecords(raw);
    expect(msg.records[0]?.fields[1]?.raw).toBe("\\^&#");
    expect(serializeAstmRecords(msg)).toBe(raw);
  });

  it("IS reachable with no delimiter argument at all, which the first draft implied it was not", () => {
    // Do not read the assertion above as "you have to pass a delimiter set to reach
    // it". Like `ASTM_EMIT_TYPE_LETTER_COLLISION`, this is a transcoding condition:
    // a second header declaring a different set has its whole line read as its
    // declaration, because the reader looks for that set's field delimiter and this
    // line has none. Emitting canonically then finds a surplus carrying `|` and drops
    // it, so the second header's data fields go with it. `PRE-EXISTING`.
    const raw = "H|\\^&|||FIRST\rP|1||LAB-0001\rH*\\^&|Q|||SECOND\rL|1|N\r";
    const msg = parseAstmRecords(raw);
    expect(msg.records[2]?.fields[1]?.raw).toBe("\\^&|Q|||SECOND");

    const emitted = serializeAstmRecords(msg);
    expect(emitted.split("\r")[2]).toBe("H|\\^&");
    expect(emitted).not.toContain("SECOND");

    // Not a stop-the-line, and this is the reason: the parse says so, under a
    // safety-critical code no profile may tolerate, so a strict parse refuses.
    const codes = msg.warnings.map((w) => w.code);
    expect(codes).toContain("ASTM_RECORD_FIELDS_UNSEPARATED");
    expect(codes).toContain("ASTM_RECORD_DELIMITERS_REDECLARED");
  });
});
