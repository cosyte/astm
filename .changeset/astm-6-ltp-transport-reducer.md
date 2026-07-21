---
"@cosyte/astm": patch
---

Transport variants + pure LTP protocol reducer (ASTM-6, roadmap Phase 6) — the LTP **protocol** layer
(`src/ltp/`) sits above the frame codec, with no live I/O: the consumer owns the wire and clock, this
layer decides. `detectFraming(bytes, opts?)` auto-detects the transport reality from the leading byte —
`STX`/`ENQ` ⇒ **framed** (serial, and the cobas 4800 / iNTERFACEWARE Iguana framed-over-TCP reality); a
bare record letter (`H`/`P`/`O`/`R`/`C`/`Q`/`M`/`S`/`L`) ⇒ **raw** (the cobas b121 raw-TCP reality,
framing dropped and records streamed directly); an unrecognizable lead **defaults to framed and warns**
(`ASTM_LTP_AMBIGUOUS_TRANSPORT`), never a silent guess into data loss, with an `override` for a
Phase-8 profile. `ltpReduce(state, event)` (seeded by `ltpInitialState()`) is a **pure, socket-free**
receiver-side state machine over the four LTP control signals (`enq`/`ack`/`nak`/`eot`) plus a
codec-decoded `frame`, returning `{ state, actions, warnings }` — actions
`sendAck`/`sendNak`/`sendEot`/`deliverRecord`. It models the LIS01-A2 establishment → transfer →
termination phases as `neutral ⇄ transfer`, reassembles `ETB…ETX` runs into delivered records, and
tracks the `0`–`7` frame sequence. **ACK-failsafe (borrowed from `mllp`, safety-critical):** a frame
the codec did not vouch for — a bad checksum, an unterminated frame, or one out of sequence — is
answered with `NAK`, **never** a fabricated positive `ACK`, and its bytes are **never** appended to a
record or delivered; a `NAK` drives retransmit, not acceptance (`ASTM_LTP_FRAME_REJECTED`). A duplicate
of the last-accepted frame is idempotently re-`ACK`ed without re-appending; a partial record left open
at an `EOT` or `ENQ` restart is discarded, never delivered as if whole. Adds the `ASTM_LTP_*` warning
registry (a third registry alongside `ASTM_RECORD_*` / `ASTM_FRAME_*`; value-free — a code plus at most
a frame number): `ASTM_LTP_AMBIGUOUS_TRANSPORT`, `ASTM_LTP_UNEXPECTED_EVENT`, `ASTM_LTP_FRAME_REJECTED`.
New exports: `detectFraming`, `ltpInitialState`, `ltpReduce`, the control bytes `ASTM_ENQ` / `ASTM_ACK`
/ `ASTM_NAK` / `ASTM_EOT`, `LTP_WARNING_CODES` + the `ltpAmbiguousTransport` / `ltpUnexpectedEvent` /
`ltpFrameRejected` builders, and the `AstmFraming` / `DetectFramingOptions` / `DetectFramingResult` /
`LtpPhase` / `LtpState` / `LtpEvent` / `LtpAction` / `LtpTransition` / `AstmLtpWarning` / `LtpWarningCode`
types. Property tests assert the reducer never emits `ACK` after an untrusted frame, a full
`ENQ → frames → EOT` session reassembles exactly the source records, and a raw-TCP stream equals its
framed twin. The framing layer is now feature-complete for decode; serialize/build (P7) and the
socket/serial adapter + exact numeric timeout/retry timing remain deferred — we model transitions, not
timers.
