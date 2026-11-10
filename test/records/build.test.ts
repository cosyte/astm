/**
 * Unit tests for the record-layer builder (`src/records/build.ts`): typed input →
 * spec-clean records by construction, under the never-fabricate discipline.
 */

import { describe, expect, it } from "vitest";

import {
  AstmSerializeError,
  buildAstmMessage,
  parseAstmRecords,
  results,
  patient,
  query,
  comments,
  orders,
  type AstmRecordInput,
} from "../../src/index.js";

/** Assert a value is defined and return it: the lint-clean alternative to a `!` assertion. */
function def<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a defined value");
  return value;
}

describe("buildAstmMessage: structure", () => {
  it("emits a canonical header, the body, and an auto L terminator", () => {
    const raw = buildAstmMessage({ records: [{ type: "R", value: "5.0" }] });
    // R | seq | (empty UTID) | value: the value sits at field 4.
    expect(raw).toBe("H|\\^&\rR|1||5.0\rL|1\r");
    const msg = parseAstmRecords(raw);
    expect(msg.records.map((r) => r.type)).toEqual(["H", "R", "L"]);
  });

  it("auto-numbers per-record-type sequence counters, and honors an override", () => {
    const raw = buildAstmMessage({
      records: [
        { type: "P" },
        { type: "O" },
        { type: "R", value: "1" },
        { type: "R", value: "2" },
        { type: "R", seq: "99", value: "3" },
      ],
    });
    const seqs = parseAstmRecords(raw)
      .records.filter((r) => r.type === "R")
      .map((r) => (r as { seq?: string }).seq);
    expect(seqs).toEqual(["1", "2", "99"]);
  });

  it("emits header fields verbatim", () => {
    const raw = buildAstmMessage({
      header: { fields: ["", "", "analyzer^cobas^1"] },
      records: [],
    });
    expect(raw).toBe("H|\\^&|||analyzer^cobas^1\rL|1\r");
  });
});

describe("buildAstmMessage: never fabricate", () => {
  it("leaves an unsupplied result status/flag/units empty: never a defaulted clinical value", () => {
    const raw = buildAstmMessage({
      records: [{ type: "R", universalTestId: ["", "", "", "687"], value: "5.0" }],
    });
    const r = def(results(parseAstmRecords(raw))[0]);
    expect(r.value).toBe("5.0");
    // Absent status is `unspecified`, NEVER assumed `final`.
    expect(r.status.meaning).toBe("unspecified");
    expect(r.status.isActiveFinal).toBe(false);
    expect(r.units).toBeUndefined();
    expect(r.abnormalFlags).toBeUndefined();
  });

  it("keeps the three patient identifiers distinct: none defaults from another", () => {
    const raw = buildAstmMessage({
      records: [{ type: "P", practiceAssignedId: "PRAC-1", laboratoryAssignedId: "LAB-9" }],
    });
    const p = def(patient(parseAstmRecords(raw)));
    expect(p.practiceAssignedId).toBe("PRAC-1");
    expect(p.laboratoryAssignedId).toBe("LAB-9");
    expect(p.patientIdThree).toBeUndefined();
  });

  it("refuses to emit a value that would break framing (CR/LF)", () => {
    expect(() => buildAstmMessage({ records: [{ type: "R", value: "a\rb" }] })).toThrow(
      AstmSerializeError,
    );
  });
});

describe("buildAstmMessage: round-trip fidelity by construction", () => {
  it("build → parse reproduces every supplied field", () => {
    const raw = buildAstmMessage({
      records: [
        {
          type: "P",
          practiceAssignedId: "PRAC-1",
          name: { last: "ROE", first: "RICHARD" },
          birthDate: "19850612",
          sex: "M",
        },
        {
          type: "R",
          universalTestId: ["", "", "", "687"],
          value: "28.6",
          units: "U/L",
          referenceRange: "10-40",
          abnormalFlags: "N",
          resultStatus: "F",
        },
      ],
    });
    const msg = parseAstmRecords(raw);
    const p = def(patient(msg));
    expect(p.name?.last).toBe("ROE");
    expect(p.birthDate?.raw).toBe("19850612");
    const r = def(results(msg)[0]);
    expect(r.value).toBe("28.6");
    expect(r.units).toBe("U/L");
    expect(r.status.isActiveFinal).toBe(true);
    expect(r.flag?.meaning).toBe("normal");
    expect(r.range?.kind).toBe("closed");
  });

  it("escape-encodes a value that contains a delimiter so it reads as one component", () => {
    const raw = buildAstmMessage({
      records: [{ type: "R", universalTestId: ["", "", "", "687"], value: "1^40" }],
    });
    expect(raw).toContain("1&S&40"); // the caret was escaped on emit
    expect(results(parseAstmRecords(raw))[0]?.value).toBe("1^40");
  });

  it("builds a host-query request classified as host-query, never a result set", () => {
    const raw = buildAstmMessage({
      records: [{ type: "P" }, { type: "Q", startingRangeId: "^SPEC-7", queriesAllTests: true }],
    });
    const msg = parseAstmRecords(raw);
    expect(msg.classification.kind).toBe("host-query");
    expect(query(msg)[0]?.queriesAllTests).toBe(true);
  });

  it("emits M/S verbatim data fields", () => {
    const raw = buildAstmMessage({
      records: [{ type: "M", fields: ["QC^LEVEL2", "4.21^ACCEPT"] }],
    });
    expect(raw).toContain("M|1|QC^LEVEL2|4.21^ACCEPT");
  });
});

describe("buildAstmMessage: every record kind and every optional field", () => {
  it("emits a comment's source, text and type at fields 3, 4 and 5", () => {
    const raw = buildAstmMessage({
      records: [
        { type: "R", value: "1" },
        { type: "C", source: "I", text: "SYNTH NOTE", commentType: "G" },
      ],
    });
    expect(raw).toContain("\rC|1|I|SYNTH NOTE|G\r");
    const c = def(comments(parseAstmRecords(raw))[0]);
    expect(c.source).toBe("I");
    expect(c.commentType).toBe("G");
  });

  it("emits textComponents as one structured field, ahead of a plain text also supplied", () => {
    const raw = buildAstmMessage({
      records: [{ type: "C", text: "IGNORED", textComponents: ["SYNTH", "PART B"] }],
    });
    expect(raw).toBe("H|\\^&\rC|1||SYNTH^PART B\rL|1\r");
    expect(raw).not.toContain("IGNORED");
  });

  it("leaves a bare comment's fields empty and numbers comments on their own counter", () => {
    const raw = buildAstmMessage({ records: [{ type: "C" }, { type: "C", text: "SECOND" }] });
    expect(raw).toBe("H|\\^&\rC|1\rC|2||SECOND\rL|1\r");
  });

  it("emits a query's Universal Test ID when ALL is not asked for", () => {
    const raw = buildAstmMessage({
      records: [
        {
          type: "Q",
          startingRangeId: "SPEC-7",
          endingRangeId: "SPEC-9",
          universalTestId: ["", "", "", "687"],
          requestInformationStatus: "O",
        },
      ],
    });
    expect(raw).toContain("\rQ|1|SPEC-7|SPEC-9|^^^687||||||||O\r");
    const q = def(query(parseAstmRecords(raw))[0]);
    expect(q.queriesAllTests).toBe(false);
  });

  it("emits ALL in place of a Universal Test ID when queriesAllTests is set", () => {
    const raw = buildAstmMessage({
      records: [{ type: "Q", universalTestId: ["", "", "", "687"], queriesAllTests: true }],
    });
    expect(raw).toContain("\rQ|1|||ALL\r");
    expect(raw).not.toContain("687");
  });

  it("leaves a query's test field empty when neither ALL nor a test ID is given", () => {
    const raw = buildAstmMessage({ records: [{ type: "Q", queriesAllTests: false }] });
    expect(raw).toBe("H|\\^&\rQ|1\rL|1\r");
  });

  it("emits every order field the caller supplied at its position", () => {
    const raw = buildAstmMessage({
      records: [
        {
          type: "O",
          specimenId: "SPEC-1",
          instrumentSpecimenId: "INST-1",
          universalTestId: ["", "", "", "687"],
          priority: "R",
          actionCode: "N",
          reportType: "F",
        },
      ],
    });
    expect(raw).toContain("\rO|1|SPEC-1|INST-1|^^^687|R||||||N||||||||||||||F\r");
    const o = def(orders(parseAstmRecords(raw))[0]);
    expect(o.specimenId).toBe("SPEC-1");
  });

  it("emits every result field the caller supplied at its position", () => {
    const raw = buildAstmMessage({
      records: [
        {
          type: "R",
          value: "28.6",
          operator: "SYNTH-OP",
          startedAt: "20260101080000",
          completedAt: "20260101081500",
          instrument: "SYNTH-ANALYZER",
        },
      ],
    });
    expect(raw).toContain(
      "\rR|1||28.6|||||||SYNTH-OP|20260101080000|20260101081500|SYNTH-ANALYZER\r",
    );
  });

  it("emits the patient identifiers and demographics the caller supplied, and only those", () => {
    const raw = buildAstmMessage({
      records: [
        {
          type: "P",
          patientIdThree: "ID3",
          name: { first: "JANE" },
          mothersMaidenName: "SYNTHETIC",
          birthDate: "19700101",
          sex: "F",
        },
      ],
    });
    // A name with only a first part leaves last and middle empty, never filled in.
    expect(raw).toContain("\rP|1|||ID3|^JANE^|SYNTHETIC|19700101|F\r");
    const p = def(patient(parseAstmRecords(raw)));
    expect(p.patientIdThree).toBe("ID3");
    expect(p.mothersMaidenName).toBe("SYNTHETIC");
    expect(p.sex).toBe("F");
  });

  it("emits a name with only a last part, leaving first and middle empty", () => {
    const raw = buildAstmMessage({ records: [{ type: "P", name: { last: "DOE" } }] });
    expect(raw).toContain("\rP|1||||DOE^^\r");
    const name = def(patient(parseAstmRecords(raw))).name;
    expect(name?.last).toBe("DOE");
    expect(name?.first ?? "").toBe("");
    expect(name?.middle ?? "").toBe("");
  });

  it("trims a trailing field the caller set to the empty string", () => {
    const raw = buildAstmMessage({ records: [{ type: "R", value: "5.0", units: "" }] });
    expect(raw).toBe("H|\\^&\rR|1||5.0\rL|1\r");
  });

  it("emits the termination code only when the caller chose one", () => {
    expect(buildAstmMessage({ records: [], terminationCode: "N" })).toBe("H|\\^&\rL|1|N\r");
    expect(buildAstmMessage({ records: [] })).toBe("H|\\^&\rL|1\r");
  });

  it("numbers M and S records on their own counters", () => {
    const raw = buildAstmMessage({
      records: [
        { type: "M", fields: ["A"] },
        { type: "S", fields: ["B"] },
        { type: "M", fields: ["C"] },
      ],
    });
    expect(raw).toBe("H|\\^&\rM|1|A\rS|1|B\rM|2|C\rL|1\r");
  });

  it.each(["a\rb", "a\nb"])(
    "refuses a verbatim M field carrying a record terminator (%j)",
    (bad) => {
      expect(() => buildAstmMessage({ records: [{ type: "M", fields: [bad] }] })).toThrow(
        AstmSerializeError,
      );
    },
  );

  it("refuses a header field carrying a record terminator", () => {
    expect(() => buildAstmMessage({ header: { fields: ["SYNTH\nLAB"] }, records: [] })).toThrow(
      AstmSerializeError,
    );
  });

  it("refuses a record type it does not build, from a JavaScript caller with no type checks", () => {
    const forged = { type: "X" } as unknown as AstmRecordInput;
    expect(() => buildAstmMessage({ records: [forged] })).toThrow(
      new TypeError("Unknown ASTM record type to build: X"),
    );
  });
});
