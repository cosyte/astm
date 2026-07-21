#!/usr/bin/env node
// Dual ESM/CJS smoke of the BUILT package — the release-shape gate. Import the ESM entry and require
// the CJS entry from `dist/`, exercise a real parse through each, and assert the same result. This
// catches a broken dual build (a bad `exports` map, an ESM-only construct leaking into CJS, a missing
// entry) that a source-only test suite would not. Run after `build`; it consumes `dist/`, not `src/`.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = "H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r";
const EXPECTED = "28.6";

function assert(cond, msg) {
  if (!cond) {
    console.error(`smoke: FAIL — ${msg}`);
    process.exit(1);
  }
}

// --- ESM entry -------------------------------------------------------------------------------------
const esm = await import(join(root, "dist/index.mjs"));
assert(typeof esm.parseAstmRecords === "function", "ESM parseAstmRecords missing");
assert(typeof esm.decodeAstmFrames === "function", "ESM decodeAstmFrames missing");
assert(typeof esm.composeAstmFrames === "function", "ESM composeAstmFrames missing");
const esmResult = esm.results(esm.parseAstmRecords(RAW))[0];
assert(
  esmResult?.value === EXPECTED,
  `ESM parse produced ${esmResult?.value}, expected ${EXPECTED}`,
);

// --- CJS entry -------------------------------------------------------------------------------------
const require = createRequire(import.meta.url);
const cjs = require(join(root, "dist/index.cjs"));
assert(typeof cjs.parseAstmRecords === "function", "CJS parseAstmRecords missing");
assert(typeof cjs.decodeAstmFrames === "function", "CJS decodeAstmFrames missing");
assert(typeof cjs.composeAstmFrames === "function", "CJS composeAstmFrames missing");
const cjsResult = cjs.results(cjs.parseAstmRecords(RAW))[0];
assert(
  cjsResult?.value === EXPECTED,
  `CJS parse produced ${cjsResult?.value}, expected ${EXPECTED}`,
);

console.log(`smoke: ok — ESM + CJS both parse a result to ${EXPECTED}`);
