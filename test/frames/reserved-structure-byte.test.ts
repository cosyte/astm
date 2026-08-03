/**
 * The frame encoder refuses a record carrying a byte the framing reads as
 * structure: `STX`, `ETB` or `ETX` (`src/frames/encode.ts`,
 * `ASTM_FRAME_RESERVED_BYTE`).
 *
 * Why this file exists, in one line: writing such a byte through was **silent**
 * in its worst branch. A frame's text ends at the first `ETB`/`ETX` after the
 * `STX`, so an embedded one truncates the frame there, and when the two bytes
 * that follow it happen to be that short frame's checksum the truncated frame
 * **verifies**: the rest of the record is skipped as inter-frame bytes, the next
 * frame number is still in sequence, and both layers report an empty warnings
 * array while a whole result record has been lost.
 *
 * Every fixture below is asserted on what the OLD encoder produced as well as on
 * the new refusal, so the file keeps saying what was wrong if the guard is ever
 * weakened. All content is synthetic.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  AstmFrameEncodeError,
  composeAstmFrames,
  decodeAstmFrames,
  parseAstmRecords,
  parseFramedAstm,
  results,
  serializeAstmRecords,
  serializeFramedAstm,
} from "../../src/index.js";
import { def, frame, stream } from "./_frame-builder.js";

const STX = "\u0002";
const ETB = "\u0017";
const ETX = "\u0003";

/**
 * The old encoder, in the only respect that matters here: it wrote a record's
 * bytes into a frame **as given**, computing the checksum over all of them, and
 * numbered the frames `1, 2, 3 …`. `frame()` does exactly that, so nothing is
 * transcribed twice. Bounded to records under 240 bytes (no split), which every
 * fixture below is.
 */
const composeUnguarded = (records: readonly string[]): Uint8Array =>
  stream(...records.map((r, i) => frame(r, { fn: (1 + i) % 8 })));

/** Read bytes back as a byte string, the way the record parser does. */
const asByteString = (b: Uint8Array): string =>
  Array.from(b)
    .map((byte) => String.fromCharCode(byte))
    .join("");

/**
 * The checksum a frame carrying `body` + `terminator` would declare. Computed
 * here rather than copied in, so a fixture cannot rot into a merely-invalid one
 * and quietly stop measuring the silent branch.
 */
function checksumFor(frameNumber: number, body: string, terminator: string): string {
  let sum = (0x30 + frameNumber) % 256;
  for (const c of body + terminator) sum = (sum + c.charCodeAt(0)) % 256;
  return sum.toString(16).toUpperCase().padStart(2, "0");
}

describe("what writing a frame-structure byte through did, measured through the decoder", () => {
  it("SILENTLY lost a whole result record: an embedded ETX whose next two bytes verify", () => {
    // A comment record whose free text ends with a raw ETX followed by the two
    // characters that ARE the truncated frame's checksum. Nothing here is
    // exotic: the byte is in a value the sender supplied, and the two following
    // bytes match by coincidence about once in 256.
    const body = "C|1|I|SPECIMEN SLIGHTLY HEMOLYZED";
    const comment = `${body}${ETX}${checksumFor(3, body, ETX)}\r`;
    const framed = composeUnguarded([
      "H|\\^&\r",
      "P|1||LAB-0001\r",
      comment,
      "R|1|^^^687|28.6|U/L||N||F\r",
      "L|1\r",
    ]);

    const rt = parseFramedAstm(framed);
    expect(rt.frameWarnings).toEqual([]); // silent
    expect(rt.message.warnings).toEqual([]); // at both layers
    expect(rt.frames.every((f) => f.trusted)).toBe(true);

    // The result record is simply gone, and its text has been absorbed into the
    // comment's free text: one record in, none out.
    expect(rt.message.records.map((r) => r.type)).toEqual(["H", "P", "C", "L"]);
    expect(rt.message.records[2]?.fields[3]?.raw).toBe("SPECIMEN SLIGHTLY HEMOLYZEDR");
    expect(results(rt.message)).toHaveLength(0);
  });

  it("SILENTLY merged the next record into this one: an embedded ETB, by the other door", () => {
    // An ETB does not close a record, it continues it, so the truncated frame
    // stays open and the NEXT record's text is appended to it. Same silence,
    // different shape: two records read back as one.
    const body = "C|1|I|SPECIMEN SLIGHTLY HEMOLYZED";
    const comment = `${body}${ETB}${checksumFor(3, body, ETB)}\r`;
    const framed = composeUnguarded([
      "H|\\^&\r",
      "P|1||LAB-0001\r",
      comment,
      "R|1|^^^687|28.6|U/L||N||F\r",
      "L|1\r",
    ]);

    const rt = parseFramedAstm(framed);
    expect(rt.frameWarnings).toEqual([]);
    expect(rt.message.warnings).toEqual([]);
    expect(rt.message.records.map((r) => r.type)).toEqual(["H", "P", "C", "L"]);
    // The result's every field is now hanging off the comment record.
    expect(rt.message.records[2]?.fields.map((f) => f.raw)).toEqual([
      "C",
      "1",
      "I",
      "SPECIMEN SLIGHTLY HEMOLYZEDR",
      "1",
      "^^^687",
      "28.6",
      "U/L",
      "",
      "N",
      "",
      "F",
    ]);
    expect(results(rt.message)).toHaveLength(0);
  });

  it("lost the record LOUDLY on the other branches, which is the same loss with a warning", () => {
    // Not every embedded byte lands in the silent branch, and the loud ones are
    // still a record that went in and did not come out. An unmatched ETX is a
    // bad checksum; an STX is read as a new frame beginning, so the frame that
    // carried it never terminates.
    const withEtx = composeUnguarded(["H|\\^&\r", `R|1|^^^687|28.6|${ETX}|N||F\r`, "L|1\r"]);
    const etx = parseFramedAstm(withEtx);
    expect(etx.frameWarnings.map((w) => w.code)).toContain("ASTM_FRAME_BAD_CHECKSUM");
    expect(etx.message.records.map((r) => r.type)).toEqual(["H", "L"]); // the R is gone

    const withStx = composeUnguarded(["H|\\^&\r", `R|1|^^^687|28.6|${STX}|N||F\r`, "L|1\r"]);
    const stx = parseFramedAstm(withStx);
    expect(stx.frameWarnings.map((w) => w.code)).toContain("ASTM_FRAME_UNTERMINATED");
    expect(stx.message.records.map((r) => r.type)).not.toContain("R");
  });
});

describe("composeAstmFrames refuses what the framing cannot carry", () => {
  it("throws, naming the record and the byte position, without quoting the byte", () => {
    const record = `R|1|^^^687|28.6|${ETX}|N||F\r`;
    try {
      composeAstmFrames(["H|\\^&\r", record]);
      expect.unreachable("a frame-structure byte must not be framed");
    } catch (err) {
      expect(err).toBeInstanceOf(AstmFrameEncodeError);
      const e = err as AstmFrameEncodeError;
      expect(e.code).toBe("ASTM_FRAME_RESERVED_BYTE");
      expect(e.recordIndex).toBe(1);
      expect(e.characterIndex).toBe(record.indexOf(ETX));
      // Value-free: neither the byte nor its code point appears in the message.
      expect(e.message).not.toContain(ETX);
      expect(e.message).not.toContain("0x03");
    }
  });

  it("refuses all three bytes, wherever in the record they sit", () => {
    for (const ch of [STX, ETB, ETX]) {
      for (const record of [`${ch}R|1|28.6\r`, `R|1|28.6${ch}|U/L\r`, `R|1|28.6|U/L\r${ch}`]) {
        try {
          composeAstmFrames([record]);
          expect.unreachable(`a record carrying ${JSON.stringify(ch)} must not be framed`);
        } catch (err) {
          expect((err as AstmFrameEncodeError).code).toBe("ASTM_FRAME_RESERVED_BYTE");
        }
      }
    }
  });

  it("refuses the SAME bytes supplied as a Uint8Array: encoding them yourself is no route around", () => {
    // The unencodable-character refusal has an escape hatch (encode with your own
    // code page and pass bytes). This one deliberately does not, because the byte
    // is unframable however it arrives.
    for (const code of [0x02, 0x17, 0x03]) {
      const bytes = Uint8Array.from([...new TextEncoder().encode("R|1|28.6"), code, 0x0d]);
      try {
        composeAstmFrames([bytes]);
        expect.unreachable("a reserved byte must not be framed from a Uint8Array either");
      } catch (err) {
        const e = err as AstmFrameEncodeError;
        expect(e.code).toBe("ASTM_FRAME_RESERVED_BYTE");
        expect(e.characterIndex).toBe(8); // the byte index, which is the same position
      }
    }
  });

  it("refuses through serializeFramedAstm, where a parsed value carries the byte", () => {
    const msg = parseAstmRecords(`H|\\^&\rR|1|^^^687|28.6${ETX}9|U/L||N||F\rL|1\r`);
    expect(msg.warnings).toEqual([]); // the record layer is happy to hold it
    try {
      serializeFramedAstm(msg);
      expect.unreachable("a value carrying a reserved byte must not be framed");
    } catch (err) {
      expect((err as AstmFrameEncodeError).code).toBe("ASTM_FRAME_RESERVED_BYTE");
    }
  });

  it("still refuses an empty record and a character above U+00FF with their own codes", () => {
    // The new check runs after both, so neither is re-badged.
    expect(() => composeAstmFrames([""])).toThrow(
      expect.objectContaining({ code: "ASTM_FRAME_EMPTY_RECORD" }),
    );
    expect(() => composeAstmFrames([`R|1|28.6|μmol/L${ETX}\r`])).toThrow(
      expect.objectContaining({ code: "ASTM_FRAME_UNENCODABLE_CHARACTER" }),
    );
  });
});

describe("the RECORD layer is deliberately left alone, and this is why", () => {
  // The cost of this fix is the question it turned on: refusing the byte in
  // `serializeAstmRecord` would refuse a byte the caller genuinely supplied, for
  // consumers who never frame anything. Measured below: at the record layer the
  // byte round-trips exactly, so there is nothing there to fix. It only becomes
  // structure when a frame is built, which is where the refusal now lives.

  it("round-trips all three bytes through parse → serialize → parse, byte for byte", () => {
    for (const ch of [STX, ETB, ETX]) {
      const raw = `H|\\^&\rR|1|^^^687|28.6${ch}9|U/L||N||F\rL|1\r`;
      const first = parseAstmRecords(raw);
      const emitted = serializeAstmRecords(first);
      const second = parseAstmRecords(emitted);

      expect(first.warnings).toEqual([]);
      expect(second.warnings).toEqual([]);
      expect(results(second)[0]?.value).toBe(`28.6${ch}9`);
      expect(results(second)[0]?.units).toBe("U/L");
      expect(results(second)[0]?.status.meaning).toBe("final");
      expect(serializeAstmRecords(second)).toBe(emitted); // byte-stable
    }
  });

  it("leaves serializeAstmRecords returning the string, unrefused", () => {
    const msg = parseAstmRecords(`H|\\^&\rR|1|^^^687|28.6|${ETX}|N||F\rL|1\r`);
    expect(serializeAstmRecords(msg)).toContain(ETX);
  });
});

describe("the refusal removes no valid stream", () => {
  it("still frames a record's own CR, which lives inside frame text", () => {
    // CR and LF are read only AFTER a frame's checksum, so they are not reserved
    // and must not be swept up by a guard aimed at the structure bytes.
    const decoded = decodeAstmFrames(composeAstmFrames(["H|\\^&\r", "L|1\r"]));
    expect(decoded.warnings).toEqual([]);
    expect(asByteString(def(decoded.records[0]))).toBe("H|\\^&\r");
  });

  it("still frames the transfer-control bytes, which are structure only BETWEEN frames", () => {
    // ENQ/ACK/NAK/EOT bound a session; inside a frame's text they are ordinary
    // bytes under the checksum. Measured rather than assumed, because a guard
    // keyed on "control character" instead of on what the decoder reads would
    // have refused these.
    const record = "R|1|^^^687|28.6\u0005\u0006\u0015\u0004|U/L||N||F\r";
    const decoded = decodeAstmFrames(composeAstmFrames([record]));
    expect(decoded.warnings).toEqual([]);
    expect(asByteString(def(decoded.records[0]))).toBe(record);
  });

  it("still passes every other Latin-1 byte through unchanged, including the high half", () => {
    const record = "P|1||LAB-0001||MÜLLER^ANNA||19800101|F\r";
    const decoded = decodeAstmFrames(composeAstmFrames([record]));
    expect(decoded.warnings).toEqual([]);
    expect(asByteString(def(decoded.records[0]))).toBe(record);
  });
});

describe("the property: exactly the three bytes, and never a third outcome", () => {
  /**
   * For any Latin-1 record string, `composeAstmFrames` either **refuses** it or
   * the decoder gives back exactly the bytes it stood for, and which of the two
   * happens is decided by the three reserved bytes and nothing else. Stated as a
   * biconditional on purpose: the "refuses" half alone would be satisfied by a
   * guard that refused far too much.
   */
  const RESERVED = [0x02, 0x17, 0x03];
  /** Every byte the framing does not read as structure. */
  const FRAMABLE_BYTES = Array.from({ length: 256 }, (_, i) => i).filter(
    (b) => !RESERVED.includes(b),
  );

  const latin1Record = fc
    .oneof(
      // Short arm: the whole byte range, so reserved bytes turn up often.
      {
        weight: 3,
        arbitrary: fc.array(fc.integer({ min: 0, max: 0xff }), { minLength: 1, maxLength: 240 }),
      },
      // Long arms: deliberately explicit, because fast-check biases array length
      // low and the 240-byte frame split otherwise goes unexercised. They are
      // also split by hand into a framable one and a refused one, because a
      // 241-byte uniform draw avoids all three reserved bytes only about 6% of
      // the time: left to chance, the REPRODUCTION half never crosses the split.
      // The non-vacuity block below is what measured that.
      {
        weight: 2,
        arbitrary: fc.array(fc.constantFrom(...FRAMABLE_BYTES), {
          minLength: 241,
          maxLength: 700,
        }),
      },
      {
        weight: 1,
        arbitrary: fc
          .tuple(
            fc.array(fc.constantFrom(...FRAMABLE_BYTES), { minLength: 241, maxLength: 700 }),
            fc.constantFrom(...RESERVED),
            fc.nat(),
          )
          .map(([base, reserved, at]) => {
            const i = at % (base.length + 1);
            return [...base.slice(0, i), reserved, ...base.slice(i)];
          }),
      },
    )
    .map((codes) => codes.map((c) => String.fromCharCode(c)).join(""));

  const hasReserved = (record: string): boolean =>
    [...record].some((c) => RESERVED.includes(c.charCodeAt(0)));

  it("refuses a record if and only if it carries one of the three, and reproduces it otherwise", () => {
    fc.assert(
      fc.property(latin1Record, (record) => {
        let framed: Uint8Array;
        try {
          framed = composeAstmFrames([record]);
        } catch (err) {
          return (
            hasReserved(record) &&
            err instanceof AstmFrameEncodeError &&
            err.code === "ASTM_FRAME_RESERVED_BYTE"
          );
        }
        if (hasReserved(record)) return false; // must not have been framed
        const decoded = decodeAstmFrames(framed);
        return decoded.warnings.length === 0 && asByteString(def(decoded.records[0])) === record;
      }),
      { numRuns: 2000 },
    );
  });

  it("is not vacuous: both halves are reached, and the reproduction half crosses the split", () => {
    // Counting runs is not evidence. These are the conditions the property's
    // wording leans on.
    let refusedHalf = 0;
    let refusedMultiFrame = 0;
    let reproducedHalf = 0;
    let reproducedMultiFrame = 0;
    let highByte = 0;
    fc.assert(
      fc.property(latin1Record, (record) => {
        const long = record.length > 240;
        if (hasReserved(record)) {
          refusedHalf += 1;
          if (long) refusedMultiFrame += 1;
          return true;
        }
        reproducedHalf += 1;
        if (long) reproducedMultiFrame += 1;
        if ([...record].some((c) => c.charCodeAt(0) >= 0x80)) highByte += 1;
        return true;
      }),
      { numRuns: 2000 },
    );
    expect(refusedHalf).toBeGreaterThan(200);
    expect(reproducedHalf).toBeGreaterThan(200);
    expect(reproducedMultiFrame).toBeGreaterThan(200);
    expect(refusedMultiFrame).toBeGreaterThan(100);
    expect(highByte).toBeGreaterThan(200);
  });
});

describe("the limits of this refusal, pinned so it is not read as wider", () => {
  it("does not reach a foreign typed array, whose element low byte still becomes structure", () => {
    // Outside the declared `Uint8Array | string` signature and unreachable from
    // TypeScript, but measured rather than assumed, because the doc comment says
    // so and a false sentence in a comment compiles into the published types.
    // The check compares elements against the three byte values, so 0x0103 is not
    // one of them; `Uint8Array.from` then takes its low byte and writes an ETX.
    for (const high of [0x0102, 0x0103, 0x0117]) {
      const foreign = Uint16Array.from([
        ...[..."R|1|28.6"].map((c) => c.charCodeAt(0)),
        high,
        0x0d,
      ]);
      const framed = composeAstmFrames([foreign as unknown as Uint8Array]);
      const decoded = decodeAstmFrames(framed);
      expect(decoded.warnings.length).toBeGreaterThan(0);
      expect(decoded.records).toHaveLength(0); // framed, then lost at decode
    }
  });

  it("does not make an accepted record read back as the same RECORD", () => {
    // Framing integrity is not record-layer readback. A delimiter colliding with
    // a record's type letter frames and de-frames byte-exactly and still re-reads
    // as a different record: a separate open defect, in the record serializer.
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
    const emitted = serializeAstmRecords(msg, {
      field: "R",
      repeat: "\\",
      component: "^",
      escape: "&",
    });
    const rt = parseFramedAstm(composeAstmFrames([emitted])); // frames without objection
    expect(rt.frameWarnings).toEqual([]);
    expect(results(rt.message)).toHaveLength(0); // one result in, none out
  });
});
