/**
 * `M` and `S` records are written from `rawLine` only while reading that line back would give the
 * fields the record holds. A record whose fields differ from its line in any one place (a field, a
 * repeat or a component more or fewer, or one value changed) is written from its fields, because
 * `fields` is what emit writes and `rawLine` is only where the record came from. Also here: the
 * refusals of an unusable delimiter set, with their whole messages. All values are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  AstmSerializeError,
  CANONICAL_DELIMITERS,
  parseAstmRecords,
  serializeAstmRecord,
  serializeAstmRecords,
  type AstmRecord,
  type Delimiters,
} from "../../src/index.js";

/** The record at index 1 of a one-record message: the line after the header. */
function recordOf(line: string): AstmRecord {
  const record = parseAstmRecords(`H|\\^&\r${line}\rL|1\r`).records[1];
  if (record === undefined) throw new Error("expected a record");
  return record;
}

/** The record read from `line`, holding the fields read from `fieldsFrom`. */
function withFieldsOf(line: string, fieldsFrom: string): AstmRecord {
  return { ...recordOf(line), fields: recordOf(fieldsFrom).fields };
}

describe("an M or S record whose fields differ from its line", () => {
  it.each([
    ["a field more", "M|1|VENDOR^BLOCK|RAW", "M|1|VENDOR^BLOCK|RAW|EXTRA"],
    ["a repeat more", "M|1|VENDOR^BLOCK|RAW", "M|1|VENDOR^BLOCK|RAW\\MORE"],
    ["a component more", "M|1|VENDOR^BLOCK|RAW", "M|1|VENDOR^BLOCK|RAW^MORE"],
    ["the second repeat changed", "M|1|VENDOR|RAW\\ONE", "M|1|VENDOR|RAW\\TWO"],
    ["the second component changed", "S|1|SCI^ONE|RAW", "S|1|SCI^TWO|RAW"],
  ])("is written from its fields with %s", (_label, line, fieldsFrom) => {
    expect(serializeAstmRecord(withFieldsOf(line, fieldsFrom))).toBe(fieldsFrom);
  });

  it("is written from its line while the line reads back as its fields", () => {
    // `&X41&` is not a mnemonic the escape codec knows, so it reads back as itself and the line is
    // written as it came, where writing from the fields would escape its `&`.
    const line = "M|1|VENDOR^BLOCK|RAW&X41&";
    expect(serializeAstmRecord(recordOf(line))).toBe(line);
  });
});

describe("an unusable delimiter set", () => {
  /** The error a serialize throws, or a failure when it does not throw one of ours. */
  function refusal(run: () => unknown): AstmSerializeError {
    try {
      run();
    } catch (err) {
      expect(err).toBeInstanceOf(AstmSerializeError);
      return err as AstmSerializeError;
    }
    return expect.unreachable("the delimiters were accepted");
  }

  const message = parseAstmRecords("H|\\^&\rP|1\rL|1\r");

  it("refuses null as the typed error, not a TypeError", () => {
    const err = refusal(() => serializeAstmRecords(message, null as unknown as Delimiters));
    expect(err.code).toBe("ASTM_EMIT_INVALID_DELIMITERS");
    expect(err.message).toBe("Cannot emit against these delimiters: a delimiter set is required.");
  });

  it.each([
    ["\r", "field"],
    ["\n", "field"],
  ])("refuses a record terminator in a role, naming the role", (char) => {
    const err = refusal(() =>
      serializeAstmRecords(message, { ...CANONICAL_DELIMITERS, field: char }),
    );
    expect(err.message).toBe(
      "Cannot emit against these delimiters: the field delimiter must not be a record terminator (CR/LF).",
    );
  });

  it("carries no record index when the whole message was being written", () => {
    const err = refusal(() =>
      serializeAstmRecords(message, { ...CANONICAL_DELIMITERS, repeat: "^" }),
    );
    expect(err.message).toBe(
      "Cannot emit against these delimiters: the repeat and component delimiters must not be the same character.",
    );
    expect(err.recordIndex).toBeUndefined();
  });

  it("carries the record index when one record was being written", () => {
    const record = message.records[1] as AstmRecord;
    const err = refusal(() =>
      serializeAstmRecord(record, { ...CANONICAL_DELIMITERS, repeat: "^" }),
    );
    expect(err.recordIndex).toBe(1);
  });
});
