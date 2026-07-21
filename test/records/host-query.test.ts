import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  WARNING_CODES,
  classifyMessage,
  orders,
  parseAstmRecords,
  query,
  results,
  type ManufacturerRecord,
  type QueryRecord,
  type ScientificRecord,
} from "../../src/index.js";

/**
 * Phase-4 coverage: the `Q` (request-information) record, the host-query flow
 * classification (a `Q`-bearing message is a request, never a result set), and the
 * `M`/`S` records surfaced verbatim (never interpreted into clinical fields).
 */
const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), "latin1");

describe("host-query flow — a Q-bearing message is a request, never a result set (Tier-1)", () => {
  const request = parseAstmRecords(fixture("tier1-host-query-request.astm"));
  const response = parseAstmRecords(fixture("tier1-host-query-response.astm"));

  it("classifies an H/P/Q/L request as host-query, not a result set", () => {
    expect(request.classification.kind).toBe("host-query");
    expect(request.classification.isHostQueryRequest).toBe(true);
    expect(request.classification.hasQuery).toBe(true);
    expect(request.classification.hasResults).toBe(false);
    // The load-bearing safety fact: there are no results to read from a request.
    expect(results(request)).toHaveLength(0);
    expect(query(request)).toHaveLength(1);
    expect(request.warnings).toEqual([]);
  });

  it("classifies the H/P/O/L response as an order download (a query answer), not a request", () => {
    expect(response.classification.kind).toBe("orders");
    expect(response.classification.isHostQueryRequest).toBe(false);
    expect(response.classification.hasOrders).toBe(true);
    expect(orders(response)).toHaveLength(1);
    expect(response.warnings).toEqual([]);
  });
});

describe("Q (Request Information) record — fields surfaced verbatim (Tier-1)", () => {
  const msg = parseAstmRecords(fixture("tier1-host-query-request.astm"));
  const [q] = query(msg);

  it("surfaces the starting/ending range IDs verbatim (full field, never truncated)", () => {
    // The caret component structure is [OSS-derived]/paywalled — the FULL field text is preserved.
    expect(q?.startingRangeId).toBe("^SPEC-7");
    expect(q?.endingRangeId).toBe("^SPEC-7");
    expect(q?.seq).toBe("1");
  });

  it("recognizes the literal ALL universal-query keyword (flagged OSS-derived), not a test name", () => {
    expect(q?.queriesAllTests).toBe(true);
    // When ALL is present the universal test ID is not synthesized into a bogus test name.
    expect(q?.universalTestId).toBeUndefined();
  });
});

describe("Q record — a specific universal test ID (not ALL)", () => {
  it("recognizes a caret universal test ID the same way an O/R record does", () => {
    const msg = parseAstmRecords("H|\\^&\rP|1\rQ|1|^SPEC-1|^SPEC-1|^^^687\rL|1\r");
    const [q] = query(msg);
    expect(q?.queriesAllTests).toBe(false);
    expect(q?.universalTestId?.localCode).toBe("687");
    expect(q?.requestInformationStatus).toBeUndefined();
    expect(msg.warnings).toEqual([]);
  });
});

describe("Q record — request-information status is surfaced verbatim + flagged uninterpreted (Tier-2)", () => {
  const msg = parseAstmRecords(fixture("tier2-host-query-status.astm"));
  const [q] = query(msg);

  it("surfaces the status code verbatim and never maps it to a guessed meaning", () => {
    expect(q?.requestInformationStatus).toBe("X");
    // The record exposes the raw code only — there is no interpreted `meaning`/`status` field on a Q.
    expect("meaning" in (q as QueryRecord)).toBe(false);
  });

  it("emits a value-free ASTM_RECORD_UNINTERPRETED_QUERY_STATUS warning (code set paywalled)", () => {
    const w = msg.warnings.find(
      (x) => x.code === WARNING_CODES.ASTM_RECORD_UNINTERPRETED_QUERY_STATUS,
    );
    expect(w).toBeDefined();
    expect(w?.position).toMatchObject({ recordType: "Q", fieldIndex: 13 });
    expect(w?.message).not.toContain("X"); // value-free
  });

  it("surfaces the WHOLE field-13 verbatim — multi-component or leading-empty — and always warns", () => {
    const uninterp = WARNING_CODES.ASTM_RECORD_UNINTERPRETED_QUERY_STATUS;
    // A multi-component status is the FULL field, never truncated to the first component.
    const multi = parseAstmRecords("H|\\^&\rQ|1|^S||||||||||O^F\rL|1\r");
    expect(query(multi)[0]?.requestInformationStatus).toBe("O^F");
    expect(multi.warnings.some((w) => w.code === uninterp)).toBe(true);
    // A status whose first component is empty is still present → surfaced verbatim AND warned.
    const leadingEmpty = parseAstmRecords("H|\\^&\rQ|1|^S||||||||||^F\rL|1\r");
    expect(query(leadingEmpty)[0]?.requestInformationStatus).toBe("^F");
    expect(leadingEmpty.warnings.some((w) => w.code === uninterp)).toBe(true);
  });
});

describe("M / S records — surfaced VERBATIM, never interpreted into clinical fields (Tier-2)", () => {
  const raw = fixture("tier2-manufacturer-qc.astm");
  const msg = parseAstmRecords(raw);
  const m = msg.records.find((r): r is ManufacturerRecord => r.type === "M");
  const s = msg.records.find((r): r is ScientificRecord => r.type === "S");

  it("preserves the M record byte-identically and interprets nothing", () => {
    expect(m).toBeDefined();
    expect(m?.rawLine).toBe("M|1|QC^LEVEL2^LOT-88^20240315|4.21^mmol/L^ACCEPT");
    // No typed clinical accessors exist — the value/units in a QC record must NEVER be read as a result.
    for (const key of ["value", "units", "abnormalFlags", "resultStatus", "status", "flag"]) {
      expect(key in (m as object)).toBe(false);
    }
  });

  it("preserves the S record byte-identically", () => {
    expect(s?.rawLine).toBe("S|1|CALIB^SLOPE^0.998^INTERCEPT^0.002");
    for (const key of ["value", "units", "status"]) {
      expect(key in (s as object)).toBe(false);
    }
  });

  it("does not warn on M/S (they are modeled, not unknown types) and does not classify them as results", () => {
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE)).toBe(false);
    expect(msg.classification.hasResults).toBe(false);
    expect(msg.classification.kind).toBe("indeterminate"); // QC/maintenance: no Q/R/O
  });

  it("round-trips the M/S content byte-identically from the tokenized field tree too", () => {
    // Rebuilding from the raw field texts reproduces the exact wire line (field delimiter is `|`).
    expect((m as ManufacturerRecord).fields.map((f) => f.raw).join("|")).toBe(m?.rawLine);
    expect((s as ScientificRecord).fields.map((f) => f.raw).join("|")).toBe(s?.rawLine);
  });
});

describe("classifyMessage — the pure classifier and the Q-dominates fail-safe", () => {
  it("classifies results, orders, and indeterminate messages", () => {
    expect(
      classifyMessage(parseAstmRecords("H|\\^&\rR|1|^^^687|5|U/L||||F\rL|1\r").records).kind,
    ).toBe("results");
    expect(classifyMessage(parseAstmRecords("H|\\^&\rO|1|ACC\rL|1\r").records).kind).toBe("orders");
    expect(classifyMessage(parseAstmRecords("H|\\^&\rL|1\r").records).kind).toBe("indeterminate");
  });

  it("a Q dominates an R — a Q-bearing message is host-query (request), never a result set, and warns", () => {
    // A contradictory message carrying BOTH a Q and an R: Q wins so it is never read as a result upload.
    const msg = parseAstmRecords("H|\\^&\rQ|1|^SPEC-7||ALL\rR|1|^^^687|5|U/L||||F\rL|1\r");
    expect(msg.classification.kind).toBe("host-query");
    expect(msg.classification.isHostQueryRequest).toBe(true);
    expect(msg.classification.hasResults).toBe(true); // the R is still surfaced, never dropped
    const w = msg.warnings.find((x) => x.code === WARNING_CODES.ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND);
    expect(w).toBeDefined();
    expect(w?.position).toMatchObject({ recordType: "H" });
  });
});
