// Types for bench/astm.bench.mjs, so the tests under test/perf validate the way the benchmarks do.

import type { AstmMessage, AstmParseOptions } from "../src/index.js";

/** The functions of the package these helpers call. */
type Astm = typeof import("../src/index.js");

/** The lenient parse of a wire value: the record parser, or the frame decoder then the parser. */
export declare function parse(
  astm: Astm,
  wire: string | Uint8Array,
  options?: AstmParseOptions,
): AstmMessage;

/** The strict parse of a wire value, split into messages; returns how many results it read. */
export declare function validate(astm: Astm, wire: string | Uint8Array): number;
