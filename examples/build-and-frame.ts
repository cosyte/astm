/**
 * Build spec-clean records, frame them for the wire, and read them back.
 *
 * `buildAstmMessage` emits only the values you supply: an omitted result status stays empty and
 * reads back as `unspecified`, never as a final result. `serializeFramedAstm` wraps each record in
 * a numbered frame with a computed checksum, and `parseFramedAstm` decodes the frames and parses
 * the records they carry. A frame whose checksum fails is reported and its record never reaches
 * the parser. Every value here is synthetic.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/build-and-frame.ts
 */

import assert from "node:assert/strict";

import {
  buildAstmMessage,
  parseAstmRecords,
  parseFramedAstm,
  results,
  serializeFramedAstm,
} from "@cosyte/astm";

const text = buildAstmMessage({
  header: { fields: ["", "", "analyzer^1"] },
  records: [
    { type: "P", practiceAssignedId: "PRAC-0001", laboratoryAssignedId: "LAB-0009" },
    { type: "O", specimenId: "SPEC-7", universalTestId: ["", "", "", "687"] },
    {
      type: "R",
      universalTestId: ["", "", "", "687"],
      value: "28.6",
      units: "U/L",
      referenceRange: "10-40",
      abnormalFlags: "N",
      resultStatus: "F",
    },
    // No status supplied, so none is written.
    { type: "R", universalTestId: ["", "", "", "688"], value: "5.1", units: "mmol/L" },
  ],
  terminationCode: "N",
});

console.log("Records as built (one per line):");
console.log(text.trimEnd().split("\r").join("\n"));

// Frame the records: STX, frame number, text, ETX, checksum, CR LF.
const framed = serializeFramedAstm(parseAstmRecords(text));
const decoded = parseFramedAstm(framed);
console.log("Frames:", decoded.frames.length);
console.log(
  "Every checksum valid:",
  decoded.frames.every((f) => f.checksum.valid),
);
console.log(
  "Results read back:",
  results(decoded.message).map(
    (r) => `${String(r.value)} ${String(r.units)} (${r.status.meaning})`,
  ),
);

// Corrupt one byte of the first result's value in transit: that frame is refused, not trusted.
const damaged = framed.slice();
damaged[Buffer.from(damaged).indexOf("28.6")] = "3".charCodeAt(0);
const fromDamaged = parseFramedAstm(damaged);
console.log(
  "After corrupting one byte:",
  fromDamaged.frameWarnings.map((w) => w.code),
  "results left:",
  results(fromDamaged.message).map((r) => r.value),
);

// The checks that make this file a test: `pnpm examples` fails if any of them does not hold.
assert.equal(
  text,
  "H|\\^&|||analyzer^1\rP|1|PRAC-0001|LAB-0009\rO|1|SPEC-7||^^^687\r" +
    "R|1|^^^687|28.6|U/L|10-40|N||F\rR|2|^^^688|5.1|mmol/L\rL|1|N\r",
);
assert.equal(decoded.frames.length, 6);
assert.ok(decoded.frames.every((f) => f.checksum.valid && f.trusted));
assert.deepEqual(
  results(decoded.message).map((r) => [r.value, r.status.meaning]),
  [
    ["28.6", "final"],
    ["5.1", "unspecified"],
  ],
);
assert.deepEqual(
  fromDamaged.frameWarnings.map((w) => w.code),
  ["ASTM_FRAME_BAD_CHECKSUM"],
);
assert.deepEqual(
  results(fromDamaged.message).map((r) => r.value),
  ["5.1"],
);
