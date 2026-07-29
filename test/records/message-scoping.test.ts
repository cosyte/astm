/**
 * Message scoping: `patient()` and `results()` were scoped to the whole **stream**, not to a
 * message, so pairing them across a multi-message stream filed one patient's results against
 * another.
 *
 * The regression under test shipped from `0.0.1` through `0.0.3`. It needed **no** delimiter
 * redeclaration and **no** unusual delimiters: an ordinary two-message stream in one canonical
 * set reproduced it, with **zero** warnings and no strict-mode objection. `TWO_PATIENTS` below
 * is that reproduction, kept as the regression fixture.
 *
 * All fixtures are **synthetic**: the patient identifiers, names, specimen IDs, and values are
 * invented and correspond to no real person or specimen.
 *
 * Grounding is recorded on `messages()` in `src/records/messages.ts` and in `CHANGELOG.md`:
 * LIS02-A2 §2 grounds the `H` … `L` message as the bounded unit, and the choice to let a second
 * `H` open the next message — the same boundary the parser already uses to scope delimiters — is
 * a reasoned choice with no clause claimed for it.
 */

import { describe, expect, it } from "vitest";

import {
  AMBIGUOUS_CODES,
  AstmAmbiguousStreamError,
  comments,
  commentsFor,
  messages,
  orders,
  parseAstmRecords,
  patient,
  query,
  results,
} from "../../src/index.js";

/**
 * The reproduction: two ordinary messages, one canonical delimiter set, two different patients.
 * Patient ALPHA has an in-range result; patient BRAVO has a high one. Pairing the flat accessors
 * used to file BRAVO's high result against ALPHA.
 */
const TWO_PATIENTS =
  "H|\\^&|||ANALYZER^1|||||LIS||P|LIS2-A2|20260101120000\r" +
  "P|1|PRAC-0001|LAB-0001||SYNTHA^ALPHA\r" +
  "O|1|SPEC-0001||^^^687|R\r" +
  "R|1|^^^687|10.0|U/L||N||F\r" +
  "L|1|N\r" +
  "H|\\^&|||ANALYZER^1|||||LIS||P|LIS2-A2|20260101130000\r" +
  "P|1|PRAC-0002|LAB-0002||SYNTHB^BRAVO\r" +
  "O|1|SPEC-0002||^^^999|R\r" +
  "R|1|^^^999|999.9|U/L||H||F\r" +
  "L|1|N\r";

/** One ordinary message — the shape that must keep behaving exactly as it did. */
const ONE_PATIENT =
  "H|\\^&|||ANALYZER^1\r" +
  "P|1|PRAC-0001|LAB-0001||SYNTHA^ALPHA\r" +
  "O|1|SPEC-0001||^^^687|R\r" +
  "R|1|^^^687|28.6|U/L||N||F\r" +
  "C|1|I|checked|G\r" +
  "L|1|N\r";

describe("the misattribution reproduction", () => {
  const msg = parseAstmRecords(TWO_PATIENTS);

  it("is an ordinary stream: one delimiter set, no redeclaration, no warnings", () => {
    expect(msg.warnings).toEqual([]);
    expect(() => parseAstmRecords(TWO_PATIENTS, { strict: true })).not.toThrow();
    expect(msg.records.filter((r) => r.type === "H")).toHaveLength(2);
  });

  it("carries both patients' results, which is why a stream-wide answer misattributes", () => {
    expect(msg.records.filter((r) => r.type === "R")).toHaveLength(2);
    expect(msg.records.filter((r) => r.type === "P")).toHaveLength(2);
  });

  it("refuses to answer patient() rather than returning the first P in the stream", () => {
    expect(() => patient(msg)).toThrow(AstmAmbiguousStreamError);
    try {
      patient(msg);
      expect.unreachable();
    } catch (err) {
      const e = err as AstmAmbiguousStreamError;
      expect(e.code).toBe(AMBIGUOUS_CODES.ASTM_AMBIGUOUS_MULTI_MESSAGE);
      expect(e.messageCount).toBe(2);
      // Positioned at the SECOND header — where the ambiguity becomes visible.
      expect(e.position).toEqual({ recordIndex: 5, recordType: "H" });
    }
  });

  it("refuses to answer results() rather than returning every R in the stream", () => {
    expect(() => results(msg)).toThrow(AstmAmbiguousStreamError);
  });

  it("refuses the other stream-scoped accessors on the same grounds", () => {
    for (const accessor of [orders, comments, query]) {
      expect(() => accessor(msg)).toThrow(AstmAmbiguousStreamError);
    }
  });

  it("carries no value in the thrown error — a stable code, a position, and counts only", () => {
    try {
      results(msg);
      expect.unreachable();
    } catch (err) {
      const e = err as AstmAmbiguousStreamError;
      const serialized = `${e.message} ${JSON.stringify(e.position)}`;
      for (const value of ["PRAC-0001", "LAB-0002", "SYNTHB", "ALPHA", "999.9", "SPEC-0002"]) {
        expect(serialized).not.toContain(value);
      }
    }
  });
});

describe("messages() — the path that pairs a patient with the results that are actually theirs", () => {
  const msg = parseAstmRecords(TWO_PATIENTS);
  const split = messages(msg);

  it("splits the stream into its two messages", () => {
    expect(split).toHaveLength(2);
    expect(split.map((m) => m.index)).toEqual([0, 1]);
  });

  it("pairs each patient with only their own results", () => {
    expect(split[0]?.patient?.practiceAssignedId).toBe("PRAC-0001");
    expect(split[0]?.results.map((r) => r.value)).toEqual(["10.0"]);
    expect(split[1]?.patient?.practiceAssignedId).toBe("PRAC-0002");
    expect(split[1]?.results.map((r) => r.value)).toEqual(["999.9"]);
  });

  it("keeps the high result with BRAVO and away from ALPHA — the clinical point", () => {
    expect(split[0]?.results.map((r) => r.abnormalFlags)).toEqual(["N"]);
    expect(split[1]?.results.map((r) => r.abnormalFlags)).toEqual(["H"]);
  });

  it("scopes orders to their own message too", () => {
    expect(split[0]?.orders.map((o) => o.specimenId)).toEqual(["SPEC-0001"]);
    expect(split[1]?.orders.map((o) => o.specimenId)).toEqual(["SPEC-0002"]);
  });

  it("is total: every record of the stream lands in exactly one message, none lost", () => {
    const regrouped = split.flatMap((m) => m.records);
    expect(regrouped).toEqual([...msg.records]);
    expect(new Set(regrouped.map((r) => r.recordIndex)).size).toBe(msg.records.length);
  });

  it("leads each message with its own header", () => {
    expect(split.map((m) => m.records[0]?.type)).toEqual(["H", "H"]);
    expect(split.map((m) => m.header.recordIndex)).toEqual([0, 5]);
  });

  it("never throws — it is the safe path on any stream", () => {
    expect(() => messages(parseAstmRecords(ONE_PATIENT))).not.toThrow();
    expect(() => messages(msg)).not.toThrow();
  });

  it("returns a frozen view — the model stays immutable", () => {
    expect(Object.isFrozen(split)).toBe(true);
    expect(Object.isFrozen(split[0])).toBe(true);
    expect(Object.isFrozen(split[0]?.results)).toBe(true);
  });
});

describe("message boundaries agree with the delimiter scope the parser already enforces", () => {
  /** Message two written in a fully different, self-consistent set (as in the #22 fixtures). */
  const REDECLARED =
    "H|\\^&|||sender\rP|1||LAB-1\rO|1|SPEC-7\rR|1|^^^687|28.6|U/L||N||F\rL|1|N\r" +
    "H*~:#***sender2\rP*1**LAB-2\rO*1*SPEC-8\rR*1*::688*99.9*mmol/L**H**F\rL*1*N\r";

  const split = messages(parseAstmRecords(REDECLARED));

  it("gives each message the delimiter set its records were actually read with", () => {
    expect(split[0]?.delimiters.field).toBe("|");
    expect(split[1]?.delimiters.field).toBe("*");
    expect(split[1]?.delimiters.component).toBe(":");
  });

  it("reports the same set the header itself resolved to", () => {
    for (const m of split) expect(m.delimiters).toEqual(m.header.delimiters);
  });

  it("still separates the two patients' results under a redeclaration", () => {
    expect(split[0]?.results.map((r) => r.value)).toEqual(["28.6"]);
    expect(split[1]?.results.map((r) => r.value)).toEqual(["99.9"]);
  });
});

describe("a single-message stream keeps behaving exactly as before", () => {
  const msg = parseAstmRecords(ONE_PATIENT);

  it("answers patient() and results() unchanged", () => {
    expect(patient(msg)?.practiceAssignedId).toBe("PRAC-0001");
    expect(patient(msg)?.laboratoryAssignedId).toBe("LAB-0001");
    expect(results(msg).map((r) => r.value)).toEqual(["28.6"]);
    expect(orders(msg).map((o) => o.specimenId)).toEqual(["SPEC-0001"]);
    expect(comments(msg).map((c) => c.text)).toEqual(["checked"]);
    expect(query(msg)).toEqual([]);
  });

  it("yields exactly one message whose records are the whole stream", () => {
    const [only] = messages(msg);
    expect(messages(msg)).toHaveLength(1);
    expect(only?.records).toEqual([...msg.records]);
    expect(only?.patient?.practiceAssignedId).toBe("PRAC-0001");
  });
});

describe("edge cases, decided deliberately", () => {
  it("a message with NO patient answers `undefined`, not an error — a result-only upload is ordinary", () => {
    const msg = parseAstmRecords("H|\\^&\rO|1|SPEC-0003\rR|1|^^^687|5.0|U/L||N||F\rL|1|N\r");
    expect(patient(msg)).toBeUndefined();
    const [only] = messages(msg);
    expect(only?.patient).toBeUndefined();
    expect(only?.patients).toEqual([]);
    expect(only?.results).toHaveLength(1);
    expect(msg.warnings).toEqual([]);
  });

  it("a message with SEVERAL patients refuses patient() rather than guessing the first", () => {
    const msg = parseAstmRecords(
      "H|\\^&\rP|1|PRAC-0001\rR|1|^^^687|1.0|U/L||N||F\rP|2|PRAC-0002\rR|2|^^^687|2.0|U/L||N||F\rL|1|N\r",
    );
    try {
      patient(msg);
      expect.unreachable();
    } catch (err) {
      const e = err as AstmAmbiguousStreamError;
      expect(e.code).toBe(AMBIGUOUS_CODES.ASTM_AMBIGUOUS_MULTI_PATIENT);
      expect(e.patientCount).toBe(2);
      expect(e.position).toEqual({ recordIndex: 3, recordType: "P" });
    }
    // The message view surfaces every patient and declines to pick one.
    const [only] = messages(msg);
    expect(only?.patient).toBeUndefined();
    expect(only?.patients.map((p) => p.practiceAssignedId)).toEqual(["PRAC-0001", "PRAC-0002"]);
    // results() is still answerable: it is scoped to the message, and the message is one message.
    expect(results(msg)).toHaveLength(2);
  });

  it("results before the patient still belong to the message that carried them", () => {
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|7.0|U/L||N||F\rP|1|PRAC-0001\rL|1|N\r");
    const [only] = messages(msg);
    expect(only?.patient?.practiceAssignedId).toBe("PRAC-0001");
    expect(only?.results.map((r) => r.value)).toEqual(["7.0"]);
    expect(patient(msg)?.practiceAssignedId).toBe("PRAC-0001");
  });

  it("records after the terminator stay with the message their header opened", () => {
    const msg = parseAstmRecords("H|\\^&\rP|1|PRAC-0001\rL|1|N\rM|1|vendor\r");
    const split = messages(msg);
    expect(split).toHaveLength(1);
    expect(split[0]?.records.map((r) => r.type)).toEqual(["H", "P", "L", "M"]);
  });

  it("a message without a terminator is still a message", () => {
    const msg = parseAstmRecords("H|\\^&\rP|1|PRAC-0001\rH|\\^&\rP|1|PRAC-0002\r");
    const split = messages(msg);
    expect(split).toHaveLength(2);
    expect(split.map((m) => m.patient?.practiceAssignedId)).toEqual(["PRAC-0001", "PRAC-0002"]);
  });

  it("commentsFor() keeps working on a multi-message stream — its parent names the message", () => {
    const msg = parseAstmRecords(
      "H|\\^&\rP|1|PRAC-0001\rR|1|^^^687|1.0|U/L||N||F\rC|1|I|first|G\rL|1|N\r" +
        "H|\\^&\rP|1|PRAC-0002\rR|1|^^^687|2.0|U/L||N||F\rC|1|I|second|G\rL|1|N\r",
    );
    const split = messages(msg);
    const firstResult = split[0]?.results[0];
    const secondResult = split[1]?.results[0];
    expect(firstResult).toBeDefined();
    expect(secondResult).toBeDefined();
    if (firstResult !== undefined) {
      expect(commentsFor(msg, firstResult).map((c) => c.text)).toEqual(["first"]);
    }
    if (secondResult !== undefined) {
      expect(commentsFor(msg, secondResult).map((c) => c.text)).toEqual(["second"]);
    }
  });
});
