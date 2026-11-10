// Benchmarks for @cosyte/astm, on @cosyte/bench, against the built entry a consumer imports.
//
// A reading of this build (throughput, latency p50/p95/p99, allocations, peak heap, a long run for
// leaks, and the cold import with every file it loads and its gzip size):
//   pnpm build && pnpm bench:reading --out bench-results/reading.json
// One benchmark or one case only (as `<benchmark> / <size>` in the results):
//   pnpm bench:reading --only "parse: result session"
// A base against head comparison, the base built in another checkout:
//   pnpm bench:compare --base <base checkout>/dist/index.mjs --head dist/index.mjs
// The budgets, and the single-call time and peak memory of the sizes a reading cannot settle:
//   node bench/budgets.mjs bench-results/reading.json
//   pnpm bench:profile --out bench-results/profile
// On a pull request CI runs the comparison in its bench-compare job, and the Bench workflow takes a
// reading and a profile on a GitHub-hosted runner. Both are advisory: they post their numbers and
// fail nothing.
//
// The suite is handed the module under test rather than importing it, so one file measures both
// builds. Every input is synthetic and built in code by bench/shapes.mjs: no file is read.

import { defineBenchmark, defineSuite } from "@cosyte/bench";

import { framed, KIB, MIB, messageInput, payloadInput, sessionInput, text } from "./shapes.mjs";

// Four shapes, each at the size real traffic has and, where the shape grows, at sizes well past it.
// `wire` is the record text a parser reads (`text`) or the framed bytes (`framed`). The pull request
// comparison runs only the first size of each shape: it runs every case 24 times in fresh processes
// inside a 600 second budget, and a call of a large size takes a large part of a second. A reading
// measures every size.
export const SHAPES = [
  {
    name: "result message",
    wire: text,
    sizes: [
      // The message an analyzer sends for every specimen, all day: one patient, one order, three
      // results, about 400 bytes. 64 of them, so a pass is not one message repeated.
      { label: "3 results, 400 B", inputs: 64, build: (i) => messageInput(i), compare: true },
    ],
  },
  {
    name: "result session",
    wire: text,
    sizes: [
      // A batch of results in one message: a patient for every 20 results, two orders of ten
      // results each and a comment under each order.
      { label: "100 results, 9 KiB", inputs: 8, build: (i) => sessionInput(i, 100), compare: true },
      { label: "1,000 results, 89 KiB", inputs: 2, build: (i) => sessionInput(i, 1_000) },
      { label: "10,000 results, 888 KiB", inputs: 1, build: (i) => sessionInput(i, 10_000) },
    ],
  },
  {
    name: "framed session",
    wire: framed,
    sizes: [
      // The same sessions as they arrive on the wire: one frame a record, each with its checksum.
      {
        label: "100 results, 10 KiB",
        inputs: 8,
        build: (i) => sessionInput(i, 100),
        compare: true,
      },
      { label: "1,000 results, 97 KiB", inputs: 2, build: (i) => sessionInput(i, 1_000) },
      { label: "10,000 results, 974 KiB", inputs: 1, build: (i) => sessionInput(i, 10_000) },
    ],
  },
  {
    name: "framed payload",
    wire: framed,
    sizes: [
      // One result and a manufacturer record with a base64 histogram behind it, split over frames
      // of 240 bytes: the large opaque payload of this package.
      {
        label: "66 KiB",
        inputs: 4,
        build: (i) => payloadInput(i, 64 * KIB),
        compare: true,
      },
      { label: "264 KiB", inputs: 1, build: (i) => payloadInput(i, 256 * KIB) },
      { label: "1.03 MiB", inputs: 1, build: (i) => payloadInput(i, MIB) },
    ],
  },
];

/** The bytes a wire value carries: a string's length (every character is Latin-1), or its bytes. */
function byteLength(wire) {
  return typeof wire === "string" ? wire.length : wire.byteLength;
}

/** The sizes of a shape as @cosyte/bench takes them: each corpus built in code, with its bytes. */
function sizes(shape) {
  return shape.sizes.map((size) => ({
    label: size.label,
    compare: size.compare ?? false,
    build: () => {
      const inputs = Array.from({ length: size.inputs }, (_v, i) => {
        const message = size.build(i);
        return { message, wire: shape.wire(message) };
      });
      return { inputs, bytes: inputs.reduce((n, x) => n + byteLength(x.wire), 0) };
    },
  }));
}

/** The lenient parse of a wire value: the record parser, or the frame decoder then the parser. */
export function parse(astm, wire, options) {
  return typeof wire === "string"
    ? astm.parseAstmRecords(wire, options)
    : astm.parseFramedAstm(wire, options).message;
}

/**
 * Validate a wire value the way a receiver that refuses any deviation does: the strict parse,
 * which throws on the first warning (a bad checksum or a frame out of sequence included), then the
 * stream split into its messages and every result counted. Returns how many results it read.
 */
export function validate(astm, wire) {
  const msg = parse(astm, wire, { strict: true });
  let read = 0;
  for (const m of astm.messages(msg)) read += m.results.length;
  return read;
}

/**
 * The parsed message of an input, read once and kept, so the framed write times only itself. The
 * first call on each input also parses it; the warmup runs every input many times before any sample
 * is taken, so no sample includes that parse.
 */
function parsedOf(astm, parsed) {
  return (x) => {
    let msg = parsed.get(x);
    if (msg === undefined) {
      msg = parse(astm, x.wire);
      parsed.set(x, msg);
    }
    return msg;
  };
}

/**
 * Build a shape the way a host writes it: the record text from `buildAstmMessage`'s input, or, for
 * a framed shape, a parsed message serialized and framed by `serializeFramedAstm`.
 */
export function builder(astm, shape) {
  if (shape.wire === text) return (x) => astm.buildAstmMessage(x.message);
  const message = parsedOf(astm, new WeakMap());
  return (x) => astm.serializeFramedAstm(message(x));
}

const benchmarks = [];
for (const shape of SHAPES) {
  benchmarks.push(
    defineBenchmark({
      // The lenient read every caller starts with.
      name: `parse: ${shape.name}`,
      sizes: sizes(shape),
      bind: (astm) => (x) => parse(astm, x.wire),
      weigh: (msg) => msg.records.length + msg.warnings.length,
    }),
    defineBenchmark({
      name: `validate: ${shape.name}`,
      sizes: sizes(shape),
      bind: (astm) => (x) => validate(astm, x.wire),
      weigh: (read) => read,
    }),
    defineBenchmark({
      name: `build: ${shape.name}`,
      sizes: sizes(shape),
      bind: (astm) => builder(astm, shape),
      weigh: (out) => byteLength(out),
    }),
  );
}

export default defineSuite({ name: "@cosyte/astm", benchmarks });
