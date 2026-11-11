/**
 * The output-equivalence corpus: synthetic ASTM record streams, framed streams, builder inputs and
 * escape-codec strings, and the functions that record everything a caller can observe of the
 * parse, the tokenizer, the escape codec, the frame codec, the serializers and the builder on each.
 *
 * `test/output-equivalence.test.ts` holds the package to the digests in
 * `test/fixtures/equivalence/output-digests.json`, captured from the source before the work on
 * allocation and freezing. A change that moves one observable byte changes a digest: a parsed
 * record or field, a warning's code, position or message, the order of warnings or tokenizer
 * reports, an error's class, code, index or message, a frame's checksum, a built or framed byte,
 * or whether an object a caller receives is frozen.
 *
 * Every framed stream is decoded whole, and split in two at every byte boundary with each part
 * decoded on its own, so every truncated-frame path is read too.
 *
 * Every byte is synthetic: the benchmark shapes at small sizes, the repository's own synthetic
 * fixtures, streams written here for each path, and noise drawn on fixed seeds.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import fc from "fast-check";

import { framed, messageInput, payloadInput, sessionInput, text } from "../../bench/shapes.mjs";
import * as astm from "../../src/index.js";
import type { Delimiters, MessageInput } from "../../src/index.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/", import.meta.url));

/** A labelled corpus item. */
export interface Item<T> {
  readonly label: string;
  readonly value: T;
}

/** The SHA-256 of an observation. */
function digest(observation: string): string {
  return createHash("sha256").update(observation, "utf8").digest("hex");
}

/**
 * Everything a caller can observe of a value, as text: every own enumerable key in order, every
 * value, whether each object and array is frozen, and the bytes of a typed array.
 */
export function describeValue(value: unknown): string {
  if (value === undefined) return "u";
  if (value === null) return "n";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Object.is(value, -0) ? "-0" : String(value);
  if (typeof value === "boolean") return value ? "t" : "f";
  if (typeof value === "function") return "fn";
  if (value instanceof Uint8Array) {
    return `b${Object.isFrozen(value) ? "F" : ""}:${Buffer.from(value).toString("hex")}`;
  }
  if (value instanceof Error) {
    const own = Object.keys(value)
      .map((k) => `${k}=${describeValue((value as unknown as Record<string, unknown>)[k])}`)
      .join(",");
    return `E(${value.constructor.name}|${value.name}|${JSON.stringify(value.message)}|${own})`;
  }
  const frozen = Object.isFrozen(value) ? "F" : "";
  if (Array.isArray(value)) {
    return `[${frozen}${value.map((v: unknown) => describeValue(v)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.keys(value).map(
      (k) => `${JSON.stringify(k)}:${describeValue((value as Record<string, unknown>)[k])}`,
    );
    return `{${frozen}${entries.join(",")}}`;
  }
  return `?${typeof value}`;
}

/** What a call returns, or what it throws. */
function attempt(fn: () => unknown): string {
  try {
    return `ok:${describeValue(fn())}`;
  } catch (error) {
    return `throw:${describeValue(error)}`;
  }
}

/** Latin-1 bytes of a string, one byte per character. */
function bytes(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "latin1"));
}

/** The delimiter sets every stream is also serialized with. */
const ALT_DELIMITERS: readonly Delimiters[] = [
  { field: "*", repeat: "~", component: "#", escape: "$" },
  { field: "|", repeat: "^", component: "^", escape: "&" },
  { field: "", repeat: "\\", component: "^", escape: "&" },
];

/** The record streams written here, one per path through the record layer. */
function handStreams(): Item<string>[] {
  const s = (label: string, value: string): Item<string> => ({ label, value });
  return [
    s("empty", ""),
    s("blank", "  \r\n "),
    s("no-header", "P|1\rL|1\r"),
    s("short-header", "H|\\\r"),
    s("truncated-declaration", "H||^&\rL|1\r"),
    s("header-only", "H|\\^&"),
    s("header-declaration-only", "H|\\^&|"),
    s("canonical", "H|\\^&|||Synth^1\rP|1\rO|1|S1||^^^GLU\rR|1|^^^GLU|5.5|mmol/L||N||F\rL|1|N\r"),
    s("crlf", "H|\\^&\r\nP|1\r\nR|1|^^^A|1|U\r\nL|1\r\n"),
    s("lf", "H|\\^&\nP|1\nR|1|^^^A|1|U\nL|1\n"),
    s("mixed-endings", "H|\\^&\r\n\rP|1\n\nR|1|^^^A|1|U\r\r\nL|1"),
    s("escaped-component", "H|\\^&\rR|1|^^^T|1&S&40|titer\rL|1\r"),
    s("all-mnemonics", "H|\\^&\rR|1|^^^T|a&F&b&S&c&R&d&E&e|U\rC|1|I|x&S&y^z&R&w|G\rL|1\r"),
    s("unknown-escape", "H|\\^&\rR|1|^^^T|1&X&2|U\rL|1\r"),
    s("unpaired-escape", "H|\\^&\rP|1||||O&Brien^John\rR|1|^^^T|5&|U\rL|1\r"),
    s("swallowed-field", "H|\\^&\rR|1|^^^T|5&|&U\rL|1\r"),
    s("swallowed-component", "H|\\^&\rR|1|^^^T|5&^&U|U\rL|1\r"),
    s("swallowed-repeat", "H|\\^&\rR|1|^^^T|5&\\&U|U\rL|1\r"),
    s("contested-field", "H|\\^&\rR|1|^^^A|28.6&Z&|&U/L||N||F\rL|1\r"),
    s("contested-field-recognized-tail", "H|\\^&\rR|1|^^^A|28.6&Z&|&S&x|U||N||F\rL|1\r"),
    s("contested-repeat", "H|\\^&\rR|1|^^^A&Z&\\&Q|1|U\rL|1\r"),
    s("contested-component", "H|\\^&\rR|1|^^^A&Z&^&Q^B|1|U\rL|1\r"),
    s("contested-mnemonic", "H|\\^&\rR|1|^^^A&S&|&U|1|U\rL|1\r"),
    s("escape-at-end", "H|\\^&\rR|1|^^^A|1|U&\rC|1|I|&&|G\rC|1|I|&&&|G\rL|1&\r"),
    s("double-escape", "H|\\^&\rR|1|^^^A|&&&&&&|U\rL|1\r"),
    s("repeats", "H|\\^&\rR|1|^^^A\\^^^B|1\\2|U\\V\rO|1|S||^^^A\\^^^B\rL|1\r"),
    s("ambiguous-value", "H|\\^&\rR|1|^^^A|1^2|U\rL|1\r"),
    s("units-absent", "H|\\^&\rR|1|^^^A| < 5.5 \rR|2|^^^B|POSITIVE\rR|3|^^^C|-1.5||\rL|1\r"),
    s("ranges", "H|\\^&\rR|1|^^^A|1|U|1-2\rR|2|^^^A|1|U|<5\rR|3|^^^A|1|U|low^high\rL|1\r"),
    s(
      "flags-status",
      "H|\\^&\rR|1|^^^A|1|U||H||C\rR|2|^^^A|1|U||ZZ||Q\rR|3|^^^A|1|U||LL||X\rR|4|^^^A|1|U||||\rL|1\r",
    ),
    s(
      "dates",
      "H|\\^&|||||||||||20260101\rP|1||||Doe||2020010|F\rR|1|^^^A|1|U||||||2026010112|20260101120\rL|1\r",
    ),
    s(
      "patient-names",
      "H|\\^&\rP|1|A|B|C|DOE^^\rP|2||||^JANE^\rP|3||||^^\rP|4||||\rP|5|||||M|19800101|M|x\rL|1\r",
    ),
    s("orders", "H|\\^&\rO|1|S1|I1|^^^A^B|R||||||N||||||||||||||F\rO|2\rL|1\r"),
    s(
      "comments",
      "C|1|I|orphan|G\rH|\\^&\rC|1|I|header note|G\rP|1\rC|1|I|a^b^c|G\rC|2\rO|1\rC|1||x\rR|1|^^^A|1|U\rC|1|I||G\rL|1\rC|1|I|after|G\r",
    ),
    s("comment-first", "H|\\^&\rL|1\rC|1|I|orphan after terminator|G\r"),
    s("query", "H|\\^&\rQ|1|^SPEC1||ALL||||||||O\rQ|2|^S2|^S3|^^^A^B|||||||||\rQ| 1|||all\rL|1\r"),
    s("query-and-result", "H|\\^&\rQ|1|^S||ALL\rR|1|^^^A|1|U\rL|1\r"),
    s("manufacturer", "H|\\^&\rM|1|SYNTH|QC|1&S&2^3\\4|&X&\rS|1|SCI|x^y\rL|1\r"),
    s("unknown-type", "H|\\^&\rZ|1|x\r9|2\r |3\rL|1\r"),
    s("unseparated", "H|\\^&\rR*1*^^^A*1\rP\rP \rL|1\r"),
    s("nonstandard", "H*~#$*x*y~z#w$Q$v\rR*1*###A*1$S$2*U\rL*1\r"),
    s("collision", "H|^^&\rR|1|^^^A|1|U\rL|1\r"),
    s("collision-escape", "H|\\^^\rR|1|^^^A|1^S^2|U\rL|1\r"),
    s(
      "redeclared",
      "H|\\^&\rR|1|^^^A|1|U\rL|1\rH*~#$\rR*1*###A*1*U\rL*1\rH*~#$\rR*2*###B*2*U\rL*1\r",
    ),
    s("redeclared-unreadable", "H|\\^&\rR|1|^^^A|1|U\rL|1\rH|\rR|1|^^^B|2|U\rH\rL|1\r"),
    s("redeclared-collision", "H|\\^&\rL|1\rH|\\\\&\rR|1|^^^A|1|U\rL|1\r"),
    s("header-residual", "H|\\^&X|||S\rL|1\r"),
    s("header-residual-control", "H|\\^&\u0001|||S\rL|1\r"),
    s("high-bytes", "H|\\^&\rP|1||||Müller^Anna\rR|1|^^^A|µ|ÿ\rL|1\r"),
    s("type-letter-escaped", "H|\\^&\rF|1|x\r&|1\rL|1\r"),
    s("long-field", `H|\\^&\rM|1|BLOB|${"ABCD".repeat(300)}|${"x&S&y".repeat(40)}\rL|1\r`),
  ];
}

/** The repository's synthetic `.astm` fixtures, read as Latin-1. */
function fixtureStreams(): Item<string>[] {
  return readdirSync(FIXTURES)
    .filter((f) => f.endsWith(".astm"))
    .sort()
    .map((f) => ({ label: `fixture:${f}`, value: readFileSync(`${FIXTURES}${f}`, "latin1") }));
}

/** The bench shapes, at small sizes. */
function benchInputs(): Item<MessageInput>[] {
  const out: Item<MessageInput>[] = [];
  for (let i = 0; i < 4; i++) out.push({ label: `message-${String(i)}`, value: messageInput(i) });
  out.push({ label: "session-40", value: sessionInput(0, 40) });
  out.push({ label: "session-100", value: sessionInput(1, 100) });
  out.push({ label: "payload-1k", value: payloadInput(0, 1024) });
  out.push({ label: "payload-8k", value: payloadInput(2, 8 * 1024) });
  return out;
}

/** Characters noise is drawn from: every role of the canonical and the alternate sets, and more. */
const NOISE = ["|", "^", "\\", "&", "*", "~", "#", "$", "\r", "\n", "R", "P", "O", "C", "Q", "M"];
const NOISE_TAIL = ["S", "L", "H", "1", "F", "E", "X", " ", ".", "-", "<", "A", "é", "\u0001"];

/** A noise string: structural characters with some letters, drawn on a fixed seed. */
function noise(maxLength: number): fc.Arbitrary<string> {
  return fc.array(fc.constantFrom(...NOISE, ...NOISE_TAIL), { maxLength }).map((a) => a.join(""));
}

/** Noise streams behind a canonical header and behind an alternate one, on fixed seeds. */
function noiseStreams(): Item<string>[] {
  const canonical = fc.sample(noise(80), { seed: 20261110, numRuns: 220 });
  const alternate = fc.sample(noise(80), { seed: 31, numRuns: 60 });
  return [
    ...canonical.map((v, i) => ({ label: `noise:${String(i)}`, value: `H|\\^&\r${v}` })),
    ...alternate.map((v, i) => ({ label: `noise-alt:${String(i)}`, value: `H*~#$\r${v}` })),
  ];
}

/** Every record stream of the corpus. */
export function corpusStreams(): Item<string>[] {
  return [
    ...handStreams(),
    ...fixtureStreams(),
    ...benchInputs().map((x) => ({ label: `bench:${x.label}`, value: text(x.value) })),
    ...noiseStreams(),
  ];
}

/** Every call that records a sink's report, in the order the sinks fired. */
function sinks(log: string[]): ((i?: number) => void)[] {
  return [
    "unknown",
    "unpaired",
    "swallowed",
    "ambiguous",
    "shifted",
    "truncated",
    "components",
  ].map((name) => (i?: number) => {
    log.push(`${name}@${i === undefined ? "-" : String(i)}`);
  });
}

/** The tokenizer's output on one line and every report it made, in order. */
function observeTokenize(line: string, d: Delimiters): string {
  const parts: string[] = [];
  for (const header of [false, true]) {
    const log: string[] = [];
    const s = sinks(log);
    const tokenize = header ? astm.tokenizeHeader : astm.tokenizeRecord;
    const result = attempt(() => tokenize(line, d, s[0], s[1], s[2], s[3], s[4], s[5], s[6]));
    parts.push(`${result}|${log.join(",")}`);
    parts.push(attempt(() => tokenize(line, d)));
  }
  return parts.join("\n");
}

/** Everything observable of one record stream: every parse, extraction, write and tokenizing. */
export function observeStream(stream: string): string {
  const parts: string[] = [];
  const profiles = [undefined, null, ...astm.listAstmProfiles().map((n) => astm.getAstmProfile(n))];
  for (const input of [stream, bytes(stream)]) {
    for (const profile of profiles) {
      for (const strict of [false, true]) {
        const options = {
          ...(strict ? { strict } : {}),
          ...(profile !== undefined ? { profile } : {}),
        };
        parts.push(attempt(() => astm.parseAstmRecords(input, options)));
      }
    }
  }
  let message: astm.AstmMessage | undefined;
  try {
    message = astm.parseAstmRecords(stream, { profile: null });
  } catch {
    message = undefined;
  }
  if (message !== undefined) {
    const msg = message;
    parts.push(attempt(() => astm.messages(msg)));
    parts.push(attempt(() => astm.results(msg)));
    parts.push(attempt(() => astm.patient(msg)));
    parts.push(attempt(() => astm.orders(msg)));
    parts.push(attempt(() => astm.comments(msg)));
    parts.push(attempt(() => astm.query(msg)));
    parts.push(attempt(() => astm.serializeAstmRecords(msg)));
    parts.push(attempt(() => astm.serializeFramedAstm(msg)));
    parts.push(attempt(() => astm.serializeFramedAstm(msg.records, { startFrameNumber: 5 })));
    for (const d of [msg.delimiters, ...ALT_DELIMITERS]) {
      parts.push(attempt(() => astm.serializeAstmRecords(msg, d)));
      for (const rec of msg.records) {
        parts.push(attempt(() => astm.serializeAstmRecord(rec, d)));
        for (const f of rec.fields) parts.push(attempt(() => astm.serializeField(f, d)));
      }
    }
    for (const line of stream.split(/\r\n|\r|\n/u)) {
      parts.push(observeTokenize(line, astm.CANONICAL_DELIMITERS));
      parts.push(observeTokenize(line, msg.delimiters));
    }
  }
  return digest(parts.join("\n"));
}

/** The framed streams: every record stream that frames, and frames written by hand. */
export function corpusFramed(): Item<Uint8Array>[] {
  const out: Item<Uint8Array>[] = [];
  for (const x of benchInputs()) out.push({ label: `bench:${x.label}`, value: framed(x.value) });
  for (const s of [...handStreams(), ...fixtureStreams()]) {
    const lines = s.value.split(/\r\n|\r|\n/u).filter((l) => l.length > 0);
    try {
      out.push({
        label: `framed:${s.label}`,
        value: astm.composeAstmFrames(lines.map((l) => `${l}\r`)),
      });
    } catch {
      // A stream with a character a frame cannot carry has no framing; its record path is read above.
    }
  }
  const frame = (fn: string, body: string, term: string, cs?: string, tail = "\r\n"): string => {
    let sum = 0;
    for (const ch of fn + body + term) sum = (sum + ch.charCodeAt(0)) & 0xff;
    const hex = cs ?? sum.toString(16).toUpperCase().padStart(2, "0");
    return `\u0002${fn}${body}${term}${hex}${tail}`;
  };
  const ETX = "\u0003";
  const ETB = "\u0017";
  const h = "H|\\^&\r";
  const r = "R|1|^^^A|1|U\r";
  const l = "L|1\r";
  const raw = (label: string, value: string): void => {
    out.push({ label: `raw:${label}`, value: bytes(value) });
  };
  raw("good", frame("1", h, ETX) + frame("2", r, ETX) + frame("3", l, ETX));
  raw("enq-eot", `\u0005${frame("1", h, ETX)}\u0004`);
  raw("bad-checksum", frame("1", h, ETX) + frame("2", r, ETX, "00") + frame("3", l, ETX));
  raw(
    "lowercase-checksum",
    frame("1", "R|1|^^^z|9\r", ETX).replace(/[A-F](?=[A-F0-9]\r\n$)/u, (c) => c.toLowerCase()) +
      frame("2", l, ETX),
  );
  raw("hex-garbage", frame("1", h, ETX, "ZZ") + frame("2", l, ETX, "G1"));
  raw("gap", frame("1", h, ETX) + frame("3", r, ETX) + frame("4", l, ETX));
  raw("non-digit-fn", frame("1", h, ETX) + frame("9", r, ETX) + frame("x", l, ETX));
  raw("wrap", frame("7", h, ETX) + frame("0", r, ETX) + frame("1", l, ETX));
  raw("etb", frame("1", "H|\\^", ETB) + frame("2", "&\r", ETX) + frame("3", l, ETX));
  raw("etb-bad", frame("1", "H|\\^", ETB, "00") + frame("2", "&\r", ETX) + frame("3", l, ETX));
  raw("etb-open", frame("1", h, ETX) + frame("2", "R|1|", ETB));
  raw("unterminated", `${frame("1", h, ETX)}\u00022R|1|^^^A`);
  raw("unterminated-then-frame", `\u00021H|\\^&\r${frame("2", r, ETX)}`);
  raw("checksum-truncated", `${frame("1", h, ETX)}\u00022L|1\r\u00033`);
  raw("no-crlf", frame("1", h, ETX, undefined, "") + frame("2", l, ETX, undefined, "\n"));
  raw("oversize", frame("1", `M|1|${"Z".repeat(260)}\r`, ETX) + frame("2", l, ETX));
  raw("stx-only", "\u0002");
  raw("stx-fn", "\u00021");
  raw("garbage", "no frames here");
  raw("empty", "");
  return out;
}

/** Everything observable of one framed stream, whole and split at every byte boundary. */
export function observeFramed(stream: Uint8Array): string {
  const parts: string[] = [];
  const whole = (b: Uint8Array): void => {
    parts.push(attempt(() => astm.decodeAstmFrames(b)));
    parts.push(attempt(() => astm.decodeAstmFrames(b, { strict: true })));
    parts.push(attempt(() => astm.parseFramedAstm(b, { profile: null })));
    parts.push(attempt(() => astm.parseFramedAstm(b, { strict: true, profile: null })));
    parts.push(attempt(() => astm.parseFramedAstm(b)));
  };
  whole(stream);
  if (stream.length <= 2048) {
    for (let k = 1; k < stream.length; k++) {
      parts.push(attempt(() => astm.decodeAstmFrames(stream.subarray(0, k))));
      parts.push(attempt(() => astm.decodeAstmFrames(stream.subarray(k))));
      parts.push(attempt(() => astm.parseFramedAstm(stream.slice(0, k), { profile: null })));
      parts.push(attempt(() => astm.parseFramedAstm(stream.slice(k), { profile: null })));
    }
  }
  return digest(parts.join("\n"));
}

/** Lists of records handed to the frame encoder, one per path through it. */
export function corpusCompose(): Item<{
  records: readonly (Uint8Array | string)[];
  start?: number;
}>[] {
  const c = (
    label: string,
    records: readonly (Uint8Array | string)[],
    start?: number,
  ): Item<{ records: readonly (Uint8Array | string)[]; start?: number }> => ({
    label,
    value: start === undefined ? { records } : { records, start },
  });
  const long = (n: number): string => `M|1|${"0123456789".repeat(Math.ceil(n / 10))}`.slice(0, n);
  const out = [
    c("one", ["H|\\^&\r"]),
    c("bytes", [bytes("H|\\^&\r"), "L|1\r"]),
    c("exact-240", [long(240)]),
    c("exact-241", [long(241)]),
    c("exact-480", [long(480)]),
    c("long-1000", [long(1000), "L|1\r"]),
    c("one-byte", ["x"]),
    c("high", ["éÿ\u0080"]),
    c("empty-list", []),
    c("empty-record", ["H|\\^&\r", ""]),
    c("empty-bytes", [new Uint8Array(0)]),
    c("unencodable", ["H|\\^&\r", "R|1|Ā"]),
    c("reserved-stx", ["H|\u0002"]),
    c("reserved-etx-bytes", [new Uint8Array([0x48, 0x03])]),
    c("reserved-etb", ["H|\\^&\r", "R\u0017"]),
    c("reserved-then-unencodable", ["R|\u0003|€"]),
    c("unencodable-then-reserved", ["R|€|\u0003"]),
    c("empty-then-reserved", ["", "\u0002"]),
  ];
  for (const start of [0, 1, 5, 7, 8, -1, 1.5, Number.NaN]) {
    out.push(c(`start-${String(start)}`, ["H|\\^&\r", long(500), "L|1\r"], start));
  }
  return out;
}

/** Everything observable of one frame-encoder call. */
export function observeCompose(input: {
  records: readonly (Uint8Array | string)[];
  start?: number;
}): string {
  const options = input.start === undefined ? {} : { startFrameNumber: input.start };
  return digest(attempt(() => astm.composeAstmFrames(input.records, options)));
}

/** Builder inputs written for each path through the builder, and the bench shapes. */
export function corpusBuild(): Item<MessageInput>[] {
  const b = (label: string, value: unknown): Item<MessageInput> => ({
    label,
    value: value as MessageInput,
  });
  return [
    ...benchInputs(),
    b("empty", { records: [] }),
    b("header", { header: { fields: ["a", "", "S^1"] }, records: [], terminationCode: "Q" }),
    b("header-cr", { header: { fields: ["a\rb"] }, records: [] }),
    b("escaping", {
      records: [
        { type: "P", name: { last: "O|B", first: "J^K", middle: "\\&" }, sex: "&" },
        { type: "O", specimenId: "a|b", universalTestId: ["", "", "", "X^Y"], priority: "R" },
        { type: "R", value: "1^40", units: "a\\b", referenceRange: "1&2", seq: "9" },
        { type: "C", textComponents: ["a^", "", "b|"], commentType: "G" },
        { type: "C", text: "plain", source: "I" },
        { type: "Q", startingRangeId: "S1", queriesAllTests: true, requestInformationStatus: "O" },
        { type: "Q", universalTestId: ["A", "B"], endingRangeId: "E" },
        { type: "M", fields: ["X", "a^b|c", ""] },
        { type: "S", fields: [] },
      ],
    }),
    b("sparse", {
      records: [
        { type: "P" },
        { type: "P", name: {} },
        { type: "O", universalTestId: [] },
        { type: "O", reportType: "F" },
        { type: "R", instrument: "I" },
        { type: "R", universalTestId: ["", "", "", ""], value: "" },
      ],
    }),
    b("value-cr", { records: [{ type: "R", value: "1\r2" }] }),
    b("value-lf", { records: [{ type: "P", name: { last: "a\nb" } }] }),
    b("verbatim-cr", { records: [{ type: "M", fields: ["a\r"] }] }),
    b("unknown-type", { records: [{ type: "Z" }] }),
    b("high", { records: [{ type: "R", value: "µ€", units: "é" }] }),
  ];
}

/** Everything observable of one builder call, and of framing what it writes. */
export function observeBuild(input: MessageInput): string {
  const parts = [attempt(() => astm.buildAstmMessage(input))];
  try {
    const written = astm.buildAstmMessage(input);
    parts.push(attempt(() => astm.serializeFramedAstm(astm.parseAstmRecords(written))));
  } catch {
    parts.push("unbuilt");
  }
  return digest(parts.join("\n"));
}

/** Strings handed to the escape codec, and the delimiter sets and splitting characters. */
export function corpusCodec(): Item<string>[] {
  const hand = [
    "",
    "a",
    "a^b^c",
    "1&S&40",
    "O&Brien^John",
    "&",
    "&&",
    "&&&",
    "&&&&",
    "^",
    "^^",
    "a&X&b",
    "28.6&Z&|&U/L",
    "28.6&Z&^&U/L",
    "x&Z&\\&Q",
    "&F&&S&&R&&E&",
    "a&^&b^c",
    "a&|&b|c",
    "end&",
    "end&^",
    "é&S&ÿ",
  ];
  const drawn = fc.sample(noise(40), { seed: 7, numRuns: 300 });
  return [...hand, ...drawn].map((value, i) => ({ label: `codec:${String(i)}`, value }));
}

/** Every split and decode of one string, with every report in order. */
export function observeCodec(value: string): string {
  const parts: string[] = [];
  const sets: Delimiters[] = [
    astm.CANONICAL_DELIMITERS,
    ...ALT_DELIMITERS,
    // An escape role that is not one character: the public codec reads it as heading nothing.
    { field: "|", repeat: "\\", component: "^", escape: "" },
    { field: "|", repeat: "\\", component: "^", escape: "&&" },
  ];
  for (const d of sets) {
    const log: string[] = [];
    const s = sinks(log);
    parts.push(
      attempt(() => astm.decodeEscapes(value, d, s[0], s[1], s[2])),
      log.join(","),
    );
    parts.push(attempt(() => astm.decodeEscapes(value, d)));
    parts.push(attempt(() => astm.encodeComponent(value, d)));
  }
  const splitters = ["|", "^", "\\", "&", "*", "", "ab"];
  const escapes = ["&", "$", "^", "", "&&"];
  for (const delimiter of splitters) {
    for (const escape of escapes) {
      const log: string[] = [];
      const s = sinks(log);
      parts.push(
        attempt(() => astm.splitEscapeAware(value, delimiter, escape, s[3], s[4], s[5], s[6])),
        log.join(","),
      );
      parts.push(attempt(() => astm.splitEscapeAware(value, delimiter, escape)));
    }
  }
  return digest(parts.join("\n"));
}
