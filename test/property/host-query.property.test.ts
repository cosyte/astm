import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  parseAstmRecords,
  type ManufacturerRecord,
  type ScientificRecord,
} from "../../src/index.js";

/**
 * Phase-4 headline safety properties, over arbitrary input:
 *
 *   1. **A Q-bearing message is always a request, never a result set.** Whenever
 *      any `Q` record is present, `classification.kind` is `host-query` and
 *      `isHostQueryRequest` is `true` — even if result records are also present
 *      (the `Q` dominates). This is the misclassification fail-safe.
 *   2. **`M`/`S` records round-trip byte-identically.** For arbitrary vendor-defined
 *      content, the parsed record's `rawLine` equals the exact wire line — nothing
 *      is interpreted, lost, or altered.
 */

const CONTENT = fc.stringMatching(/^[A-Za-z0-9.^\\&/ -]*$/u);

describe("Q-bearing message is a request property", () => {
  it("classifies any message containing a Q record as host-query, never a result set", () => {
    const line = fc
      .tuple(
        fc.constantFrom("P", "O", "R", "Q", "C", "M", "S", "L"),
        fc.array(CONTENT, { maxLength: 4 }),
      )
      .map(([t, fields]) => [t, ...fields].join("|"));

    fc.assert(
      fc.property(fc.array(line, { maxLength: 8 }), (lines) => {
        const raw = ["H|\\^&", ...lines].join("\r");
        const msg = parseAstmRecords(raw);
        const hasQ = msg.records.some((r) => r.type === "Q");
        if (hasQ) {
          expect(msg.classification.kind).toBe("host-query");
          expect(msg.classification.isHostQueryRequest).toBe(true);
        } else {
          // No Q ⇒ never classified as a host-query request.
          expect(msg.classification.isHostQueryRequest).toBe(false);
        }
      }),
    );
  });
});

describe("M / S verbatim round-trip property", () => {
  it("preserves an M or S record's exact wire line byte-for-byte", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("M", "S"),
        fc.array(CONTENT, { maxLength: 5 }),
        (type, fields) => {
          const line = [type, ...fields].join("|");
          const msg = parseAstmRecords(`H|\\^&\r${line}\rL|1\r`);
          const rec = msg.records.find(
            (r): r is ManufacturerRecord | ScientificRecord => r.type === "M" || r.type === "S",
          );
          expect(rec?.rawLine).toBe(line);
        },
      ),
    );
  });
});
