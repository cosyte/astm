import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  WARNING_CODES,
  attachComments,
  comments,
  commentsFor,
  orders,
  parseAstmRecords,
  patient,
  results,
  type AstmRecord,
  type AstmRecordWarning,
  type CommentRecord,
} from "../../src/index.js";

/**
 * Phase-3 coverage: patient/order identity depth, the `C` comment record attached
 * by position, and partial-timestamp hardening — the misfiling-prevention slice.
 */
const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), "latin1");

describe("parseAstmRecords — full patient identity (Tier-1)", () => {
  const msg = parseAstmRecords(fixture("tier1-identity-comments.astm"));

  it("keeps the three patient identifiers DISTINCT and never collapses them", () => {
    const p = patient(msg);
    expect(p?.practiceAssignedId).toBe("PRAC-0001");
    expect(p?.laboratoryAssignedId).toBe("LAB-0009");
    expect(p?.patientIdThree).toBe("NID-7");
    // No two of the three are ever the same field value.
    const ids = [p?.practiceAssignedId, p?.laboratoryAssignedId, p?.patientIdThree];
    expect(new Set(ids).size).toBe(3);
  });

  it("models name components, mother's maiden, birthdate, and sex", () => {
    const p = patient(msg);
    expect(p?.name).toMatchObject({ last: "DOE", first: "JANE", middle: "Q" });
    expect(p?.mothersMaidenName).toBe("KING");
    expect(p?.birthDate?.precision).toBe("day");
    expect(p?.birthDate?.truncated).toBeUndefined();
    expect(p?.sex).toBe("F");
  });

  it("parses the whole fixture with zero warnings", () => {
    expect(msg.warnings).toEqual([]);
  });
});

describe("parseAstmRecords — full order identity (Tier-1)", () => {
  const msg = parseAstmRecords(fixture("tier1-identity-comments.astm"));

  it("surfaces priority (6), action code (~12), and report type (~26) verbatim", () => {
    const [o1, o2] = orders(msg);
    expect(o1?.specimenId).toBe("ACC-42");
    expect(o1?.universalTestId?.localCode).toBe("687");
    expect(o1?.priority).toBe("S");
    expect(o1?.actionCode).toBe("A");
    expect(o1?.reportType).toBe("F");
    // A minimal order populates only priority; the far fields stay undefined (never guessed).
    expect(o2?.priority).toBe("R");
    expect(o2?.actionCode).toBeUndefined();
    expect(o2?.reportType).toBeUndefined();
  });
});

describe("parseAstmRecords — comments attached by position (Tier-1)", () => {
  const msg = parseAstmRecords(fixture("tier1-identity-comments.astm"));

  it("attaches each comment to its immediately-preceding H/P/O/R parent", () => {
    const cs = comments(msg);
    expect(cs).toHaveLength(3);
    // C after P attaches to the P; C after each R attaches to that R — never floated.
    const p = patient(msg);
    const [r1, r2] = results(msg);
    expect(cs[0]?.parentIndex).toBe(p?.recordIndex);
    expect(cs[1]?.parentIndex).toBe(r1?.recordIndex);
    expect(cs[2]?.parentIndex).toBe(r2?.recordIndex);
    expect(cs.every((c) => c.attachedToRoot === false)).toBe(true);
  });

  it("commentsFor resolves a record's own comments", () => {
    const [r1] = results(msg);
    const cs = commentsFor(msg, r1 as AstmRecord);
    expect(cs).toHaveLength(1);
    expect(cs[0]?.text).toBe("WITHIN RANGE");
  });

  it("surfaces comment source/text/type; the type code is surfaced verbatim (OSS-derived)", () => {
    const [onPatient, onResult] = comments(msg);
    expect(onPatient?.source).toBe("I");
    expect(onPatient?.text).toBe("DEMOGRAPHICS VERIFIED");
    expect(onPatient?.commentType).toBe("G"); // surfaced raw — not mapped to a guessed meaning
    expect(onResult?.commentType).toBe("I"); // the one OSS-confirmed value (instrument)
  });
});

describe("parseAstmRecords — comment text is component-capable", () => {
  it("surfaces the full text and the component split, without truncation or a warning", () => {
    // A real transcript shape: C|1|I|111^? QC|I — a structured, component-bearing comment.
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^700|5|U/L||||F\rC|1|I|111^? QC|I\rL|1\r");
    const [c] = comments(msg);
    expect(c?.text).toBe("111^? QC"); // full field, never truncated to "111"
    expect(c?.textComponents).toEqual(["111", "? QC"]);
    // Multi-component comment text is normal structure, NOT the ambiguous-value-split hazard.
    expect(
      msg.warnings.some((w) => w.code === WARNING_CODES.ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT),
    ).toBe(false);
  });
});

describe("attachComments — the orphan fail-safe", () => {
  it("attaches an orphan C (no preceding H/P/O/R) to the root and warns, never dropping it", () => {
    const warnings: AstmRecordWarning[] = [];
    const orphan: CommentRecord = {
      type: "C",
      recordIndex: 0,
      fields: [],
      attachedToRoot: false,
      text: "QC NON-COMPLIANT",
    };
    const out = attachComments([orphan], warnings);
    const c = out[0] as CommentRecord;
    expect(c.attachedToRoot).toBe(true);
    expect(c.parentIndex).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.ASTM_RECORD_ORPHAN_COMMENT);
    // Value-free: position only, no comment text in the warning.
    expect(warnings[0]?.position).toMatchObject({ recordType: "C" });
    expect(warnings[0]?.message).not.toContain("QC NON-COMPLIANT");
  });

  it("consecutive comments share the same preceding parent", () => {
    const warnings: AstmRecordWarning[] = [];
    const recs: AstmRecord[] = [
      {
        type: "H",
        recordIndex: 0,
        fields: [],
        delimiters: { field: "|", repeat: "\\", component: "^", escape: "&" },
        rawLine: "H|\\^&",
      },
      { type: "O", recordIndex: 1, fields: [] },
      { type: "C", recordIndex: 2, fields: [], attachedToRoot: false },
      { type: "C", recordIndex: 3, fields: [], attachedToRoot: false },
    ];
    const out = attachComments(recs, warnings);
    expect((out[2] as CommentRecord).parentIndex).toBe(1);
    expect((out[3] as CommentRecord).parentIndex).toBe(1);
    expect(warnings).toHaveLength(0);
  });
});

describe("parseAstmRecords — partial-timestamp hardening (Tier-2)", () => {
  const msg = parseAstmRecords(fixture("tier2-partial-timestamp.astm"));

  it("preserves a truncated DOB, never zero-fills a fabricated time, and warns", () => {
    const p = patient(msg);
    // "2020010" (7 digits) → month precision, dangling digit preserved in raw, day never invented.
    expect(p?.birthDate?.raw).toBe("2020010");
    expect(p?.birthDate?.precision).toBe("month");
    expect(p?.birthDate?.day).toBeUndefined(); // NOT zero-filled
    expect(p?.birthDate?.truncated).toBe(true);
    expect(
      msg.warnings.some(
        (w) =>
          w.code === WARNING_CODES.ASTM_RECORD_PARTIAL_TIMESTAMP &&
          w.position.recordType === "P" &&
          w.position.fieldIndex === 8,
      ),
    ).toBe(true);
  });

  it("flags a truncated result completion timestamp (field 13)", () => {
    const [r] = results(msg);
    expect(r?.startedAt?.precision).toBe("minute"); // "202404011015" is clean
    expect(r?.startedAt?.truncated).toBeUndefined();
    expect(r?.completedAt?.raw).toBe("2024040110150"); // 13 digits → truncated second
    expect(r?.completedAt?.truncated).toBe(true);
    expect(r?.completedAt?.second).toBeUndefined(); // never zero-filled
    expect(
      msg.warnings.some(
        (w) =>
          w.code === WARNING_CODES.ASTM_RECORD_PARTIAL_TIMESTAMP &&
          w.position.recordType === "R" &&
          w.position.fieldIndex === 13,
      ),
    ).toBe(true);
  });

  it("every warning is value-free — code + position only, no timestamp digits", () => {
    for (const w of msg.warnings) {
      expect(typeof w.position.recordIndex).toBe("number");
      expect(w.message).not.toMatch(/2020010|2024040110150|ROE|RICHARD/u);
    }
  });
});
