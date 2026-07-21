/**
 * Framed-vs-raw transport auto-detection for ASTM/CLSI-LIS01.
 *
 * ASTM transport is not uniform, and that is what breaks naive parsers. **Serial**
 * (RS-232) always uses full E1381 framing. Over **TCP it varies within a single
 * vendor**: the Roche cobas 4800 and iNTERFACEWARE Iguana retain the full
 * `ENQ`/`ACK` + `STX`/checksum framing over TCP (**framed-TCP**), while the cobas
 * b121 drops all low-level framing — "TCP itself ensures correctness" — and streams
 * de-framed record bytes directly (**raw-TCP**). A reader must handle both and must
 * not assume the handshake is present.
 *
 * {@link detectFraming} decides which it is from the stream's leading byte: `STX`
 * or `ENQ` ⇒ framed (feed it to the frame codec + {@link ltpReduce}); a bare record
 * letter ⇒ raw (feed it straight to `parseAstmRecords`). Anything else is
 * **ambiguous**, and the fail-safe is to **default to framed** and warn — never to
 * guess silently into data loss — with an explicit override for a profile that
 * knows better.
 */

import { ENQ, RECORD_TYPE_LETTERS } from "./constants.js";
import { STX } from "../frames/constants.js";
import { ltpAmbiguousTransport, type AstmLtpWarning } from "./warnings.js";

/**
 * The transport framing of an ASTM byte stream: `"framed"` (E1381 `STX`/checksum
 * frames, the serial and framed-TCP realities) or `"raw"` (framing dropped,
 * de-framed record bytes streamed directly — the raw-TCP reality).
 */
export type AstmFraming = "framed" | "raw";

/**
 * Options for {@link detectFraming}.
 */
export interface DetectFramingOptions {
  /**
   * A profile-supplied override. When set, detection is bypassed entirely and this
   * value is returned with no warning — the way a Phase-8 vendor profile forces
   * raw for a cobas b121 or framed for a cobas 4800 regardless of the leading byte.
   */
  readonly override?: AstmFraming;
}

/**
 * The result of {@link detectFraming}: the decided framing plus any warning
 * (exactly one `ASTM_LTP_AMBIGUOUS_TRANSPORT` when the lead was unrecognizable and
 * the mode was defaulted; empty otherwise).
 */
export interface DetectFramingResult {
  /** The decided transport framing. */
  readonly framing: AstmFraming;
  /** `true` when the lead byte was unrecognizable and `framing` was defaulted (not inferred). */
  readonly defaulted: boolean;
  /** The detection warnings (a single ambiguity warning, or none). */
  readonly warnings: readonly AstmLtpWarning[];
}

/**
 * Detect whether an ASTM byte stream is framed or raw from its leading byte.
 *
 * - Leading `STX` (`0x02`) or `ENQ` (`0x05`) ⇒ `"framed"`.
 * - A leading bare record letter (`H`/`P`/`O`/`R`/`C`/`Q`/`M`/`S`/`L`) ⇒ `"raw"`.
 * - Anything else (including an empty stream) is **ambiguous** ⇒ defaults to
 *   `"framed"` and emits one `ASTM_LTP_AMBIGUOUS_TRANSPORT` warning.
 *
 * An `override` short-circuits all of the above, returning the forced mode with no
 * warning.
 *
 * @param bytes - The stream to inspect (only the leading byte is read).
 * @param options - Detection options; an `override` forces the result.
 * @returns The decided framing, whether it was defaulted, and any warning.
 * @example
 * ```ts
 * import { detectFraming } from "@cosyte/astm";
 * detectFraming(new Uint8Array([0x02])).framing; // "framed" (STX)
 * detectFraming(new Uint8Array([0x48])).framing; // "raw"    (leading "H")
 * detectFraming(new Uint8Array([0x2a])).framing; // "framed" (ambiguous → defaulted, + warning)
 * detectFraming(new Uint8Array([0x48]), { override: "framed" }).framing; // "framed" (forced)
 * ```
 */
export function detectFraming(
  bytes: Uint8Array,
  options: DetectFramingOptions = {},
): DetectFramingResult {
  if (options.override !== undefined) {
    return { framing: options.override, defaulted: false, warnings: [] };
  }

  const lead = bytes[0];
  if (lead === STX || lead === ENQ) {
    return { framing: "framed", defaulted: false, warnings: [] };
  }
  if (lead !== undefined && RECORD_TYPE_LETTERS.has(lead)) {
    return { framing: "raw", defaulted: false, warnings: [] };
  }

  // Unrecognizable (or empty): default to framed — the safer assumption, since treating a framed
  // stream as raw would feed control/checksum bytes to the record parser and corrupt fields.
  return { framing: "framed", defaulted: true, warnings: [ltpAmbiguousTransport()] };
}
