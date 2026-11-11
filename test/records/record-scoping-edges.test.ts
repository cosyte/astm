/**
 * Edges of the record read that the wider suites pass over: which set a later header puts into
 * force and what it warns, which record a comment hangs from, and the `ALL` query keyword written
 * with white space round it. Every identifier and value below is synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  WARNING_CODES,
  attachComments,
  parseAstmRecords,
  query,
  type AstmRecord,
  type AstmRecordWarning,
  type CommentRecord,
} from "../../src/index.js";

/** Each warning as its code and the record it names. */
function placed(warnings: readonly AstmRecordWarning[]): [string, number | undefined][] {
  return warnings.map((w) => [w.code, w.position?.recordIndex]);
}

describe("a later header that redeclares the delimiters", () => {
  it("warns a standard set put back in force as redeclared, never as non-standard", () => {
    // The first header declares `@` as the repeat delimiter, the second puts the standard set back.
    const msg = parseAstmRecords("H|@^&\rP|1\rL|1\rH|\\^&\rP|2\rL|1\r");
    expect(placed(msg.warnings)).toEqual([
      [WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS, 0],
      [WARNING_CODES.ASTM_RECORD_DELIMITERS_REDECLARED, 3],
    ]);
  });

  it("adopts a set that differs from the one in force only in its escape delimiter", () => {
    const msg = parseAstmRecords("H|\\^&\rP|1\rL|1\rH|\\^!\rM|1|RAW!F!DATA\rL|1\r");
    expect(placed(msg.warnings)).toEqual([
      [WARNING_CODES.ASTM_RECORD_DELIMITERS_REDECLARED, 3],
      [WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS, 3],
    ]);
    // Under the second header `!F!` is the field-delimiter escape, so the value reads `RAW|DATA`.
    const block = msg.records[4];
    expect(block?.type).toBe("M");
    expect(block?.fields[2]?.components[0]).toBe("RAW|DATA");
  });

  it("restating the set in force warns nothing", () => {
    const msg = parseAstmRecords("H|\\^&\rP|1\rL|1\rH|\\^&\rP|2\rL|1\r");
    expect(msg.warnings).toEqual([]);
  });
});

describe("the record a comment hangs from", () => {
  it("is a later header, when the comment follows that header", () => {
    const msg = parseAstmRecords("H|\\^&\rP|1\rL|1\rH|\\^&\rC|1|L|SYNTHETIC NOTE|G\rL|1\r");
    const comment = msg.records[4] as CommentRecord;
    expect(comment.type).toBe("C");
    expect(comment.parentIndex).toBe(3);
    expect(comment.attachedToRoot).toBe(false);
  });

  it.each([
    ["H", 0],
    ["P", 1],
    ["O", 2],
    ["R", 3],
  ] as const)("is the %s record before it when attached after the read", (type, parent) => {
    const chain = ["H", "P", "O", "R"]
      .slice(0, parent + 1)
      .map((t, recordIndex) => ({ type: t, recordIndex, fields: [] }) as unknown as AstmRecord);
    expect(chain[parent]?.type).toBe(type);
    const comment = {
      type: "C",
      recordIndex: parent + 1,
      fields: [],
      attachedToRoot: false,
    } as unknown as AstmRecord;
    const warnings: AstmRecordWarning[] = [];
    const out = attachComments([...chain, comment], warnings);
    expect(out[parent + 1]).toMatchObject({ parentIndex: parent, attachedToRoot: false });
    expect(warnings).toEqual([]);
  });
});

describe("the ALL query keyword", () => {
  it.each(["ALL", " ALL", "ALL ", " all "])("is read from %j", (utid) => {
    const msg = parseAstmRecords(`H|\\^&\rQ|1|^SPEC-1|^SPEC-1|${utid}\rL|1\r`);
    const [q] = query(msg);
    expect(q?.queriesAllTests).toBe(true);
    expect(q?.universalTestId).toBeUndefined();
  });

  it("is not read from a test code that only contains it", () => {
    const [q] = query(parseAstmRecords("H|\\^&\rQ|1|^SPEC-1|^SPEC-1|^^^ALLX\rL|1\r"));
    expect(q?.queriesAllTests).toBe(false);
  });
});
