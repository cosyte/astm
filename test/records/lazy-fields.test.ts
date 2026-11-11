/**
 * A parsed record's `fields` is an enumerable getter, built on the first read.
 *
 * The parse holds a plain field (no repeat, component or escape character) as its text and builds
 * its node only when `fields` is read. These hold what a caller sees of that: the same frozen array
 * on every read, the same tree a data property held, a record that inherits a parsed record reading
 * its fields, and every way of copying a record (keys, spread, JSON, `structuredClone`) seeing the
 * fields as before.
 */

import { describe, expect, it } from "vitest";

import { parseAstmRecords, tokenizeRecord, type AstmRecord } from "../../src/index.js";

const STREAM =
  "H|\\^&\rP|1||||DOE^JANE||19800101|F\rO|1|S1||GLU\rR|1|^^^GLU|5.5|mmol/L||N||F\rR|2|X|1^2\rC|1|I|note|G\rM|1|BLOB|QUJD\rL|1\r";

function recordAt(index: number): AstmRecord {
  const record = parseAstmRecords(STREAM).records[index];
  if (record === undefined) throw new Error(`no record ${String(index)}`);
  return record;
}

describe("a parsed record's fields", () => {
  it("are an enumerable getter, frozen with the record", () => {
    const record = recordAt(3);
    const descriptor = Object.getOwnPropertyDescriptor(record, "fields");
    expect(Reflect.get(descriptor ?? {}, "get")).toBeTypeOf("function");
    expect(descriptor?.enumerable).toBe(true);
    expect(descriptor?.configurable).toBe(false);
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.keys(record).slice(0, 3)).toEqual(["type", "recordIndex", "fields"]);
  });

  it("read as the same frozen array every time, holding what the tokenizer reads", () => {
    const msg = parseAstmRecords(STREAM);
    const lines = STREAM.split("\r").filter((l) => l.length > 0);
    msg.records.forEach((record, i) => {
      const first = record.fields;
      expect(record.fields).toBe(first);
      expect(Object.isFrozen(first)).toBe(true);
      for (const field of first) {
        expect(Object.isFrozen(field)).toBe(true);
        expect(Object.isFrozen(field.components)).toBe(true);
        expect(Object.isFrozen(field.repeats)).toBe(true);
      }
      if (record.type !== "H")
        expect(first).toEqual(tokenizeRecord(lines[i] ?? "", msg.delimiters));
    });
  });

  it("keep a modeled value's components the same array as its field's", () => {
    const msg = parseAstmRecords(STREAM);
    const order = msg.records[2];
    const result = msg.records[4];
    if (order?.type !== "O" || result?.type !== "R") throw new Error("unexpected records");
    expect(order.universalTestId?.components).toBe(order.fields[4]?.components);
    expect(result.universalTestId?.components).toBe(result.fields[2]?.components);
    expect(result.valueComponents).toBe(result.fields[3]?.components);
  });

  it("are read by every way of copying a record", () => {
    const record = recordAt(3);
    const fields = JSON.parse(JSON.stringify(record.fields)) as unknown;
    expect((JSON.parse(JSON.stringify(record)) as { fields: unknown }).fields).toEqual(fields);
    expect({ ...record }.fields).toBe(record.fields);
    expect(structuredClone(record).fields).toEqual(record.fields);
  });

  it("are read through a record that inherits a parsed record", () => {
    const record = recordAt(5);
    const heir = Object.create(Object.create(record) as object) as AstmRecord;
    expect(heir.fields).toBe(record.fields);
  });

  it("read as undefined when the getter is called on an object that is not a parsed record", () => {
    const get: unknown = Reflect.get(
      Object.getOwnPropertyDescriptor(recordAt(1), "fields") ?? {},
      "get",
    );
    if (typeof get !== "function") throw new Error("fields has no getter");
    expect(Reflect.apply(get, {}, [])).toBeUndefined();
    expect(Reflect.apply(get, undefined, [])).toBeUndefined();
  });

  it("share one frozen empty field", () => {
    const record = recordAt(3);
    const empties = record.fields.filter((f) => f.raw === "");
    expect(empties.length).toBeGreaterThan(1);
    expect(new Set(empties).size).toBe(1);
    expect(empties[0]).toEqual({ raw: "", components: [""], repeats: [[""]] });
  });
});
