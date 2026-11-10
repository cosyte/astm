// Types for bench/shapes.mjs, so the tests under test/perf build their inputs from the same code
// the benchmarks do.

import type { MessageInput } from "../src/index.js";

/** 1024. */
export declare const KIB: number;
/** 1024 * 1024. */
export declare const MIB: number;
/** The input of the single small result message: one patient, one order, three results. */
export declare function messageInput(i: number): MessageInput;
/** The input of a session of `results` results: ten to an order, two orders a patient. */
export declare function sessionInput(i: number, results: number): MessageInput;
/** The input of one result and a manufacturer record with a base64 payload of about `bytes`. */
export declare function payloadInput(i: number, bytes: number): MessageInput;
/** An input as the de-framed record text a parser reads. */
export declare function text(input: MessageInput): string;
/** An input framed as E1381 sends it. */
export declare function framed(input: MessageInput): Uint8Array;
/** The single small result message, as record text. */
export declare function resultMessage(i: number): string;
/** A session of `results` results, as record text. */
export declare function session(i: number, results: number): string;
/** A session of `results` results, framed. */
export declare function framedSession(i: number, results: number): Uint8Array;
/** A result with a payload of about `bytes` bytes, framed. */
export declare function framedPayload(i: number, bytes: number): Uint8Array;
