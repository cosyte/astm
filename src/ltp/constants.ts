/**
 * The four LTP (low-level transfer protocol) control bytes for ASTM/CLSI-LIS01
 * (was E1381), plus the bare-record-letter set the transport detector keys on.
 *
 * The frame codec (`../frames`) owns the *inside* of a frame (`STX FN text
 * ETB/ETX CS CRLF`); this module owns the *handshake around* frames — the
 * establishment/transfer/termination signalling that the {@link ltpReduce}
 * reducer consumes. These are the raw byte values; the reducer and the transport
 * detector are the only consumers.
 */

/** Enquiry (`0x05`) — the sender's request to establish a transfer. */
export const ENQ = 0x05;
/** Acknowledge (`0x06`) — the receiver accepted the last establishment or frame. */
export const ACK = 0x06;
/** Negative acknowledge (`0x15`) — the receiver rejected the last frame; retransmit, do not accept. */
export const NAK = 0x15;
/** End of transmission (`0x04`) — the sender terminated the transfer; the line returns to neutral. */
export const EOT = 0x04;

/**
 * The ASTM record-type letters that can legally *lead a de-framed record stream*.
 * A raw-TCP stream (framing dropped) begins with a bare record letter — in
 * practice `H` (message header) — where a framed stream begins with `STX` or
 * `ENQ`. The transport detector uses membership here as the "this is raw record
 * bytes, not a frame" signal.
 *
 * The set is the nine ASTM record types (`H`/`P`/`O`/`R`/`C`/`Q`/`M`/`S`/`L`); a
 * conformant record stream always opens with `H`, but tolerating any record
 * letter keeps the detector robust to a capture that starts mid-message.
 */
export const RECORD_TYPE_LETTERS: ReadonlySet<number> = new Set(
  [..."HPORCQMSL"].map((c) => c.charCodeAt(0)),
);
