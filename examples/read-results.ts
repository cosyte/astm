/**
 * Read results off a de-framed ASTM record stream.
 *
 * `examples/data/result-stream.astm` is synthetic: one patient, one order and two results, the
 * records separated by CR as they arrive off an analyzer. The example parses it, prints each result
 * with its units, flag and status, and checks the values it printed.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/read-results.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseAstmRecords, patient, results } from "@cosyte/astm";

const stream = readFileSync(new URL("data/result-stream.astm", import.meta.url), "utf8");
const msg = parseAstmRecords(stream);

// The practice- and laboratory-assigned IDs stay distinct: collapsing them misfiles results.
const who = patient(msg);
console.log("Practice-assigned patient ID:", who?.practiceAssignedId);
console.log("Laboratory-assigned patient ID:", who?.laboratoryAssignedId);

// Values and units come back as sent: never converted, never defaulted.
for (const r of results(msg)) {
  console.log(
    `Test ${String(r.universalTestId?.localCode)}: ${String(r.value)} ${String(r.units)}`,
    `(range ${String(r.referenceRange)}), flag ${String(r.flag?.meaning)},`,
    `status ${r.status.meaning}, active final: ${String(r.status.isActiveFinal)}`,
  );
}
console.log("Warnings:", msg.warnings.length);

// The checks that make this file a test: `pnpm examples` fails if any of them does not hold.
assert.equal(who?.practiceAssignedId, "PRAC-0001");
assert.equal(who?.laboratoryAssignedId, "LAB-0009");
assert.deepEqual(
  results(msg).map((r) => [r.universalTestId?.localCode, r.value, r.units, r.flag?.meaning]),
  [
    ["687", "28.6", "U/L", "normal"],
    ["688", "5.1", "mmol/L", "above-normal"],
  ],
);
assert.ok(results(msg).every((r) => r.status.isActiveFinal));
assert.equal(msg.warnings.length, 0);
