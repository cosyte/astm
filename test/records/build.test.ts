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
} from "../../src/index.js";

/** Assert a value is defined and return it — the lint-clean alternative to a `!` assertion. */
function def<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a defined value");
  return value;
}

describe("buildAstmMessage — structure", () => {
  it("emits a canonical header, the body, and an auto L terminator", () => {
    const raw = buildAstmMessage({ records: [{ type: "R", value: "5.0" }] });
    // R | seq | (empty UTID) | value — the value sits at field 4.
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

describe("buildAstmMessage — never fabricate", () => {
  it("leaves an unsupplied result status/flag/units empty — never a defaulted clinical value", () => {
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

  it("keeps the three patient identifiers distinct — none defaults from another", () => {
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

describe("buildAstmMessage — round-trip fidelity by construction", () => {
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
