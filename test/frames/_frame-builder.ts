/**
 * Test-only frame encoder. The real spec-clean encoder is Phase 7; this helper
 * exists so the Phase 5 decoder tests can build well-formed (and deliberately
 * malformed) `<STX> FN text <ETB|ETX> CS <CR><LF>` frames from synthetic record
 * text. All content here is synthetic — plain `H`/`O`/`R`/`L` record bytes with no
 * patient identifiers.
 */

const STX = 0x02;
const ETX = 0x03;
const ETB = 0x17;
const CR = 0x0d;
const LF = 0x0a;

/** Assert a value is defined and return it — the lint-clean alternative to a `!` assertion in tests. */
export function def<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a defined value");
  return value;
}

/** Latin1 bytes of a string (each char → its byte), so `\r` etc. survive 1:1. */
export function bytesOf(s: string): number[] {
  return [...s].map((c) => c.charCodeAt(0));
}

/** Modulo-256 sum over the given bytes (the checksum span: FN through terminator). */
export function checksumOf(bytes: readonly number[]): number {
  return bytes.reduce((sum, b) => (sum + b) & 0xff, 0);
}

/** Two hex chars for a checksum byte, in the requested case (`"upper"` is spec-clean emit). */
export function hex2(n: number, mode: "upper" | "lower" = "upper"): string {
  const s = (n & 0xff).toString(16).padStart(2, "0");
  return mode === "upper" ? s.toUpperCase() : s.toLowerCase();
}

/** Options for {@link frame}. */
export interface FrameOpts {
  /** Frame number digit (`0`–`7`); defaults to `1`. */
  readonly fn?: number;
  /** `"ETB"` intermediate or `"ETX"` final; defaults to `"ETX"`. */
  readonly kind?: "ETB" | "ETX";
  /** Checksum case on the wire; defaults to `"upper"`. */
  readonly checksumCase?: "upper" | "lower";
  /** When set, override the computed checksum with this (wrong) value to force a mismatch. */
  readonly forceChecksum?: number;
  /** When `true`, omit the `CR`/`LF` tail (a tolerated deviation). */
  readonly noCrLf?: boolean;
}

/**
 * Build one framed record as a byte array: `STX FN text (ETB|ETX) CS CR LF`. The
 * checksum spans the frame number, the text, and the terminator (mod 256).
 */
export function frame(text: string, opts: FrameOpts = {}): number[] {
  const fn = opts.fn ?? 1;
  const kind = opts.kind ?? "ETX";
  const term = kind === "ETB" ? ETB : ETX;
  const fnByte = 0x30 + fn;
  const textBytes = bytesOf(text);
  const span = [fnByte, ...textBytes, term];
  const cs = opts.forceChecksum ?? checksumOf(span);
  const csHex = hex2(cs, opts.checksumCase ?? "upper");
  const out = [STX, ...span, ...bytesOf(csHex)];
  if (opts.noCrLf !== true) out.push(CR, LF);
  return out;
}

/** Concatenate frame byte arrays (and any raw inter-frame bytes) into one stream. */
export function stream(...parts: readonly (readonly number[])[]): Uint8Array {
  return Uint8Array.from(parts.flat());
}
