/**
 * Two emit-side gaps that both broke the same invariant, a round-trip never
 * silently loses a field, and that both had to be reproduced by executing the
 * shipped code rather than by reading it.
 *
 * 1. A delimiter declaration longer than the three characters a reader takes its
 *    roles from lost the surplus on emit: `H|\^&#` went out as `H|\^&`.
 * 2. A caller-supplied delimiter set was never checked, so emit would write a
 *    stream this library's own parser then rejected outright or, worse, re-read
 *    with a different field tree and no warning at all.
 *
 * These tests assert the fixed behaviour by round-tripping through the real
 * parser, never by inspecting the serializer's internals.
 */

import { describe, expect, it } from "vitest";

import {
  AstmSerializeError,
  CANONICAL_DELIMITERS,
  encodeComponent,
  parseAstmRecords,
  parseFramedAstm,
  serializeAstmRecord,
  serializeAstmRecords,
  serializeField,
  serializeFramedAstm,
  type AstmMessage,
  type Delimiters,
} from "../../src/index.js";

/** Assert a value is defined and return it: the lint-clean alternative to a `!` assertion. */
function def<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a defined value");
  return value;
}

/** The modeled field tree of every record except the header, whose declaration legitimately changes. */
function bodyTree(msg: AstmMessage): string {
  return JSON.stringify(
    msg.records.filter((r) => r.type !== "H").map((r) => r.fields.map((f) => f.repeats)),
  );
}

/** The header's ASTM data fields: everything after the type letter and the declaration. */
function headerData(msg: AstmMessage): string {
  return JSON.stringify(msg.header.fields.slice(2).map((f) => f.repeats));
}

describe("a delimiter declaration longer than three characters", () => {
  it("keeps its surplus characters on emit instead of dropping them", () => {
    const raw = "H|\\^&#|||SENDER^SYS|||||||P|1\rP|1||PID-1\rL|1|N\r";
    const msg = parseAstmRecords(raw);

    expect(def(msg.header.fields[1]).raw).toBe("\\^&#");
    expect(serializeAstmRecords(msg, msg.delimiters)).toBe(raw);
  });

  it("keeps a surplus of several characters", () => {
    const raw = "H|\\^&#$%|||SENDER\rL|1|N\r";
    const msg = parseAstmRecords(raw);

    expect(serializeAstmRecords(msg, msg.delimiters)).toBe(raw);
  });

  it("re-reads to the same four delimiters, so the surplus stays inert", () => {
    const msg = parseAstmRecords("H|\\^&#|||SENDER\rL|1|N\r");
    const reparsed = parseAstmRecords(serializeAstmRecords(msg, msg.delimiters));

    expect(reparsed.delimiters).toEqual(msg.delimiters);
    expect(headerData(reparsed)).toBe(headerData(msg));
  });

  it("drops the surplus when the header is transcoded into a different delimiter set", () => {
    // The surplus belonged to the declaration being replaced; it cannot be read back as
    // surplus of the new one. Dropping inert bytes is not a lost field: the data fields
    // and every other record must still survive intact.
    const msg = parseAstmRecords("H|\\^&#|||SENDER\rP|1||PID-1\rL|1|N\r");
    const alt: Delimiters = { field: "!", repeat: "~", component: "*", escape: "%" };

    const out = serializeAstmRecords(msg, alt);
    expect(def(out.split("\r")[0])).toBe("H!~*%!!!SENDER");

    const reparsed = parseAstmRecords(out);
    expect(reparsed.delimiters).toEqual(alt);
    expect(headerData(reparsed)).toBe(headerData(msg));
    expect(bodyTree(reparsed)).toBe(bodyTree(msg));
  });

  it("drops a surplus that carries the emit field delimiter rather than shifting every data field", () => {
    // Declared under `^` as the field separator, so `|` sits inside the declaration as
    // surplus. Emitted canonically, that `|` would end the declaration field early and
    // push every data field one position along.
    const msg = parseAstmRecords("H^\\|&|^^^SENDER\rL^1^N\r");
    expect(def(msg.header.fields[1]).raw).toBe("\\|&|");

    const out = serializeAstmRecords(msg, CANONICAL_DELIMITERS);
    expect(def(out.split("\r")[0])).toBe("H|\\^&|||SENDER");
    expect(headerData(parseAstmRecords(out))).toBe(headerData(msg));
  });

  it("emits the ordinary three-character declaration unchanged", () => {
    const raw = "H|\\^&|||SENDER\rL|1|N\r";
    expect(serializeAstmRecords(parseAstmRecords(raw))).toBe(raw);
  });

  it("keeps the surplus on the default canonical path too, not only when a set is passed", () => {
    const raw = "H|\\^&#|||SENDER\rL|1|N\r";
    expect(serializeAstmRecords(parseAstmRecords(raw))).toBe(raw);
  });

  it("drops a surplus carrying any control character, because the frame layer reserves them", () => {
    // Only CR/LF are structural to the record layer, but this text also reaches the frame
    // layer through serializeFramedAstm, where STX/ETX/ETB bound a frame. A surplus
    // carrying one truncates the frame body and costs the whole header record on re-read.
    // NUL, STX, ETX, US, ETB, DEL: named by code so no raw control byte enters this file.
    for (const code of [0x00, 0x02, 0x03, 0x17, 0x1f, 0x7f]) {
      const control = String.fromCharCode(code);
      const msg = parseAstmRecords(`H|\\^&${control}|||SENDER\rL|1|N\r`);
      expect(def(serializeAstmRecords(msg, msg.delimiters).split("\r")[0])).toBe("H|\\^&|||SENDER");
    }
  });

  it("survives the frame layer for every printable surplus, and never loses a record", () => {
    for (let code = 0x20; code < 0x7f; code += 1) {
      const surplus = String.fromCharCode(code);
      // The field separator inside the surplus is a separate, already-covered case.
      if (surplus === "|") continue;
      const raw = `H|\\^&${surplus}|||LAB\rP|1||PID-1\rR|1|^^^687|28.6|U/L||N||F\rL|1|N\r`;
      const msg = parseAstmRecords(raw);
      const { message, frameWarnings } = parseFramedAstm(serializeFramedAstm(msg));
      expect(message.records.map((r) => r.type).join("")).toBe("HPRL");
      expect(frameWarnings).toEqual([]);
    }
  });
});

describe("a delimiter set emit cannot reverse", () => {
  const base = parseAstmRecords("H|\\^&|||SENDER\rR|1|^^^687|28.6&S&x|U/L||N||F\rL|1|N\r");

  const unusable: readonly (readonly [string, Delimiters])[] = [
    [
      "a multi-character field separator",
      { field: "||", repeat: "\\", component: "^", escape: "&" },
    ],
    ["an empty escape character", { field: "|", repeat: "\\", component: "^", escape: "" }],
    ["a CR field separator", { field: "\r", repeat: "\\", component: "^", escape: "&" }],
    ["an LF component separator", { field: "|", repeat: "\\", component: "\n", escape: "&" }],
    [
      "field and escape sharing a character",
      { field: "&", repeat: "\\", component: "^", escape: "&" },
    ],
    [
      "repeat and component sharing a character",
      { field: "|", repeat: "^", component: "^", escape: "&" },
    ],
    [
      "component and escape sharing a character",
      { field: "|", repeat: "\\", component: "&", escape: "&" },
    ],
  ];

  for (const [label, d] of unusable) {
    it(`refuses ${label} with a typed error instead of emitting`, () => {
      expect(() => serializeAstmRecords(base, d)).toThrow(AstmSerializeError);
      try {
        serializeAstmRecords(base, d);
        expect.unreachable("expected a typed emit error");
      } catch (err) {
        expect(err).toBeInstanceOf(AstmSerializeError);
        expect((err as AstmSerializeError).code).toBe("ASTM_EMIT_INVALID_DELIMITERS");
      }
    });
  }

  it("refuses a set with a missing or non-string member as the same typed error", () => {
    // The types forbid these, but a JavaScript caller can pass them and used to get a
    // bare TypeError out of the serializer's internals instead of the documented error.
    const missingEscape = { field: "|", repeat: "\\", component: "^" } as unknown as Delimiters;
    const nonString = {
      field: "|",
      repeat: "\\",
      component: "^",
      escape: 38,
    } as unknown as Delimiters;
    // `null` does not take the default parameter the way `undefined` does.
    const nullSet = null as unknown as Delimiters;

    for (const d of [missingEscape, nonString, nullSet]) {
      try {
        serializeAstmRecords(base, d);
        expect.unreachable("expected a typed emit error");
      } catch (err) {
        expect(err).toBeInstanceOf(AstmSerializeError);
        expect((err as AstmSerializeError).code).toBe("ASTM_EMIT_INVALID_DELIMITERS");
      }
    }
  });

  it("never echoes the offending characters into the error message", () => {
    // A caller-supplied separator that fails the one-character rule can be arbitrary
    // text, so quoting it back would put caller data into whatever logs the throw.
    const secret = "NOT-A-DELIMITER-3f8a";
    try {
      serializeAstmRecords(base, { field: secret, repeat: "\\", component: "^", escape: "&" });
      expect.unreachable("expected a typed emit error");
    } catch (err) {
      expect((err as Error).message).not.toContain(secret);
      expect((err as Error).message).toContain("field");
    }
  });

  it("refuses on every public emit entry point, not just the stream serializer", () => {
    const d: Delimiters = { field: "|", repeat: "^", component: "^", escape: "&" };
    const record = def(base.records[1]);

    expect(() => serializeAstmRecord(record, d)).toThrow(AstmSerializeError);
    expect(() => serializeField(def(record.fields[1]), d)).toThrow(AstmSerializeError);
    expect(() => encodeComponent("28.6", d)).toThrow(AstmSerializeError);
  });

  it("keeps the existing unencodable-value code distinct from the new one", () => {
    try {
      encodeComponent("line1\rline2", CANONICAL_DELIMITERS);
      expect.unreachable("expected a typed emit error");
    } catch (err) {
      expect((err as AstmSerializeError).code).toBe("ASTM_EMIT_UNENCODABLE_VALUE");
    }
  });

  it("still emits against a usable non-canonical set, and that stream reads back whole", () => {
    const alt: Delimiters = { field: "!", repeat: "~", component: "*", escape: "%" };
    const msg = parseAstmRecords(
      "H|\\^&|||SENDER^SYS\rP|1||PID-1\rR|1|^^^687|28.6&S&x|U/L||N||F\rM|1|vendor^blob\rL|1|N\r",
    );

    const reparsed = parseAstmRecords(serializeAstmRecords(msg, alt));
    expect(reparsed.delimiters).toEqual(alt);
    expect(bodyTree(reparsed)).toBe(bodyTree(msg));
    expect(headerData(reparsed)).toBe(headerData(msg));
  });

  it("refuses a set the parser accepted but emit cannot reverse, rather than losing structure", () => {
    // The reader tolerates a header whose repeat and component separators are the same
    // character; emitting against it cannot be undone, because a two-repeat field and a
    // two-component field come out as the same bytes. This is the deliberate narrowing:
    // the input turned away is exactly the input that was being corrupted.
    const msg = parseAstmRecords("H|^^&|||SENDER\rR|1|a\\b\rL|1|N\r");
    expect(msg.delimiters.repeat).toBe(msg.delimiters.component);

    expect(() => serializeAstmRecords(msg, msg.delimiters)).toThrow(AstmSerializeError);
    // The canonical default is unaffected: the message still emits spec-clean.
    expect(() => serializeAstmRecords(msg)).not.toThrow();
  });
});
