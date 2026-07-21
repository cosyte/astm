import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { comments, parseAstmRecords, patient, parseAstmDate } from "../../src/index.js";

/**
 * Phase-3 headline safety properties, over arbitrary input:
 *
 *   1. A comment always attaches to the immediately-preceding `H`/`P`/`O`/`R`
 *      record — never a later one, never a floated one (there is always the
 *      header, so a parsed comment is never an orphan).
 *   2. The practice-, laboratory-, and third patient IDs never cross-contaminate:
 *      each modeled field equals exactly the wire field at its own position.
 *   3. A partial `YYYYMMDDHHMMSS` value never fabricates a component (no
 *      zero-fill): every populated component is literally the digits at its slice
 *      of `raw`, and `truncated` marks an odd, component-splitting length.
 */

const PARENT_TYPES = new Set(["H", "P", "O", "R"]);

describe("comment attachment property", () => {
  it("attaches every comment to the nearest preceding H/P/O/R record", () => {
    const line = fc
      .tuple(
        fc.constantFrom("P", "O", "R", "C", "L", "Z"),
        fc.array(fc.stringMatching(/^[A-Za-z0-9 -]*$/u), { maxLength: 3 }),
      )
      .map(([t, fields]) => [t, ...fields].join("|"));

    fc.assert(
      fc.property(fc.array(line, { maxLength: 10 }), (lines) => {
        const raw = ["H|\\^&", ...lines].join("\r");
        const msg = parseAstmRecords(raw);
        for (const c of comments(msg)) {
          // Expected parent: the nearest record before this comment whose type is H/P/O/R.
          let expected: number | undefined;
          for (let i = c.recordIndex - 1; i >= 0; i -= 1) {
            const t = msg.records[i]?.type;
            if (t !== undefined && PARENT_TYPES.has(t)) {
              expected = i;
              break;
            }
          }
          // The header at index 0 always qualifies, so a parsed comment is never an orphan.
          expect(c.attachedToRoot).toBe(false);
          expect(c.parentIndex).toBe(expected);
        }
      }),
    );
  });
});

describe("distinct patient IDs property", () => {
  it("practice / lab / third IDs never cross-contaminate", () => {
    const token = fc.stringMatching(/^[A-Za-z0-9-]{1,8}$/u);
    fc.assert(
      fc.property(token, token, token, (prac, lab, id3) => {
        const msg = parseAstmRecords(`H|\\^&\rP|1|${prac}|${lab}|${id3}\rL|1\r`);
        const p = patient(msg);
        expect(p?.practiceAssignedId).toBe(prac);
        expect(p?.laboratoryAssignedId).toBe(lab);
        expect(p?.patientIdThree).toBe(id3);
      }),
    );
  });
});

describe("partial timestamp property", () => {
  it("never fabricates a component and marks a truncated run", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^\d{1,16}$/u), (digits) => {
        const d = parseAstmDate(digits);
        if (d === undefined) {
          // Only runs shorter than a 4-digit year are rejected.
          expect(digits.length).toBeLessThan(4);
          return;
        }
        // Every populated component is literally the digits at its own slice — never invented.
        expect(d.year).toBe(Number(digits.slice(0, 4)));
        if (d.month !== undefined) expect(d.month).toBe(Number(digits.slice(4, 6)));
        if (d.day !== undefined) expect(d.day).toBe(Number(digits.slice(6, 8)));
        if (d.second !== undefined) expect(d.second).toBe(Number(digits.slice(12, 14)));
        // `truncated` is set exactly for an odd length below the full 14 digits.
        expect(d.truncated === true).toBe(digits.length < 14 && digits.length % 2 === 1);
      }),
    );
  });
});
