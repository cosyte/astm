/**
 * The frame encoder's string-to-bytes step: `composeAstmFrames` refuses a
 * character that has no single byte to stand for, instead of truncating it to
 * its low byte (`src/frames/encode.ts`).
 *
 * Why this file exists, in one line: the truncation altered values in **silence**.
 * A code point's low byte is another perfectly ordinary character, so the
 * substitution checksummed clean and both layers re-read the stream with an empty
 * warnings array. The three fixtures below are the three shapes that reaches, and
 * each is asserted on what the OLD encoder produced, not merely on the new throw,
 * so the file keeps saying what was wrong if the guard is ever weakened.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  AstmFrameEncodeError,
  composeAstmFrames,
  decodeAstmFrames,
  parseAstmRecords,
  parseFramedAstm,
  patient,
  results,
  serializeAstmRecords,
  serializeFramedAstm,
} from "../../src/index.js";
import { def } from "./_frame-builder.js";

/** The old encoder, transcribed: `charCodeAt(i) & 0xff` per character. */
const truncateToLowBytes = (s: string): Uint8Array =>
  Uint8Array.from([...s].flatMap((c) => c.charCodeAt(0) & 0xff));

/** Read bytes back as a byte string, the way the record parser does. */
const asByteString = (b: Uint8Array): string =>
  Array.from(b)
    .map((byte) => String.fromCharCode(byte))
    .join("");

/**
 * Three real characters whose low byte is a different, ordinary character. None
 * is a control character, so no guard keyed on the character class sees any of
 * them, and none of the three is a code point the previous round of work
 * measured (those all landed on `STX`/`ETX`/`ETB`/`CR`).
 */
const MU = "μ"; // GREEK SMALL LETTER MU. Low byte 0xbc, an ordinary printable character.
const L_STROKE = "Ł"; // LATIN CAPITAL LETTER L WITH STROKE. Low byte 0x41, "A".
const Z_DOT = "ż"; // LATIN SMALL LETTER Z WITH DOT ABOVE. Low byte 0x7c, the FIELD separator.

describe("the low byte of a non-Latin-1 character is an ordinary character", () => {
  it("is what made the truncation silent rather than loud", () => {
    expect(String.fromCharCode(MU.charCodeAt(0) & 0xff)).toBe("¼");
    expect(String.fromCharCode(L_STROKE.charCodeAt(0) & 0xff)).toBe("A");
    expect(String.fromCharCode(Z_DOT.charCodeAt(0) & 0xff)).toBe("|");
  });
});

describe("what the truncation did, measured through the decoder", () => {
  it("altered a result's UNITS, with no warning from either layer", () => {
    const record = `R|1|^^^687|28.6|${MU}mol/L||N||F\r`;
    const framed = composeAstmFrames(["H|\\^&\r", truncateToLowBytes(record), "L|1\r"]);
    const decoded = decodeAstmFrames(framed);

    // The framing itself is impeccable. That is the problem.
    expect(decoded.warnings).toEqual([]);
    expect(decoded.frames.every((f) => f.checksum.valid)).toBe(true);

    const readBack = asByteString(def(decoded.records[1]));
    expect(readBack).not.toBe(record);
    expect(readBack).toBe("R|1|^^^687|28.6|¼mol/L||N||F\r");

    const msg = parseAstmRecords(decoded.records.map(asByteString).join(""));
    expect(msg.warnings).toEqual([]);
    expect(results(msg)[0]?.value).toBe("28.6");
    expect(results(msg)[0]?.units).toBe("¼mol/L"); // was micromoles per litre
  });

  it("altered a patient name, with no warning from either layer", () => {
    const record = `P|1||LAB-0001||${L_STROKE}UKASZ^JAN||19800101|M\r`;
    const decoded = decodeAstmFrames(composeAstmFrames([truncateToLowBytes(record)]));
    expect(decoded.warnings).toEqual([]);
    expect(asByteString(def(decoded.records[0]))).toBe("P|1||LAB-0001||AUKASZ^JAN||19800101|M\r");
  });

  it("split one field into two, shifting every field after it, with no warning", () => {
    // The worst of the three: the substituted byte IS the field separator, so the
    // record does not merely read wrong, it reads with a DIFFERENT FIELD TREE.
    const raw = `H|\\^&\rP|1||LAB-0001||GRA${Z_DOT}YNA^ANNA||19800101|F\rL|1\r`;
    const clean = parseAstmRecords(raw);
    expect(clean.warnings).toEqual([]);
    expect(patient(clean)?.sex).toBe("F");

    const framed = composeAstmFrames(
      clean.records.map((r) => truncateToLowBytes(serializeAstmRecords([r]))),
    );
    const rt = parseFramedAstm(framed);

    expect(rt.frameWarnings).toEqual([]);
    expect(rt.message.warnings).toEqual([]); // silent, at both layers
    expect(rt.message.records[1]?.fields.map((f) => f.raw)).toEqual([
      "P",
      "1",
      "",
      "LAB-0001",
      "",
      "GRA",
      "YNA^ANNA", // one field became two
      "",
      "19800101",
      "F",
    ]);
    // Everything after the split shifted one field along: the date of birth is
    // now read as the patient's sex.
    expect(patient(rt.message)?.sex).toBe("19800101");
  });
});

describe("composeAstmFrames refuses what it cannot write", () => {
  it("throws rather than truncating, naming the record and the character position", () => {
    try {
      composeAstmFrames(["H|\\^&\r", `R|1|^^^687|28.6|${MU}mol/L||N||F\r`]);
      expect.unreachable("a character above U+00FF must not be framed");
    } catch (err) {
      expect(err).toBeInstanceOf(AstmFrameEncodeError);
      const e = err as AstmFrameEncodeError;
      expect(e.code).toBe("ASTM_FRAME_UNENCODABLE_CHARACTER");
      expect(e.recordIndex).toBe(1);
      expect(e.characterIndex).toBe(16);
      // Value-free: the message never quotes the character or its code point.
      expect(e.message).not.toContain(MU);
      expect(e.message).not.toContain("03bc");
    }
  });

  it("refuses each of the three shapes, so none of them can reach the wire", () => {
    for (const ch of [MU, L_STROKE, Z_DOT]) {
      expect(() => composeAstmFrames([`R|1|^^^687|28.6|${ch}|N||F\r`])).toThrow(
        AstmFrameEncodeError,
      );
    }
  });

  it("refuses an astral character by the same bound, at its leading surrogate", () => {
    // Each half of a surrogate pair is itself above U+00FF; no separate rule.
    const record = "R|1|^^^687|\u{1f600}\r";
    try {
      composeAstmFrames([record]);
      expect.unreachable("a surrogate pair must not be framed");
    } catch (err) {
      expect((err as AstmFrameEncodeError).code).toBe("ASTM_FRAME_UNENCODABLE_CHARACTER");
      expect((err as AstmFrameEncodeError).characterIndex).toBe(record.indexOf("\u{1f600}"));
    }
  });

  it("refuses through serializeFramedAstm, where a parsed value carries the character", () => {
    const msg = parseAstmRecords(`H|\\^&\rR|1|^^^687|28.6|${MU}mol/L||N||F\rL|1\r`);
    expect(msg.warnings).toEqual([]); // the record layer is happy to hold it
    try {
      serializeFramedAstm(msg);
      expect.unreachable("a value above U+00FF must not be framed");
    } catch (err) {
      expect((err as AstmFrameEncodeError).code).toBe("ASTM_FRAME_UNENCODABLE_CHARACTER");
    }
  });

  it("leaves the record layer alone: serializeAstmRecords still returns the string", () => {
    // A returned string is not yet bytes, so the caller may still encode it with
    // whatever code page their instrument uses. Only the frame layer refuses.
    const msg = parseAstmRecords(`H|\\^&\rR|1|^^^687|28.6|${MU}mol/L||N||F\rL|1\r`);
    expect(serializeAstmRecords(msg)).toContain(`${MU}mol/L`);
  });
});

describe("the refusal removes no capability and no valid stream", () => {
  it("frames the same content when the caller supplies the bytes", () => {
    // The escape hatch the signature already carried: encode it yourself.
    const record = `R|1|^^^687|28.6|${MU}mol/L||N||F\r`;
    const utf8 = new TextEncoder().encode(record);
    const decoded = decodeAstmFrames(composeAstmFrames([utf8]));
    expect(decoded.warnings).toEqual([]);
    expect(new TextDecoder().decode(def(decoded.records[0]))).toBe(record);
  });

  it("passes every Latin-1 byte through unchanged, including the high half", () => {
    // The boundary is U+00FF, not U+007F: MÜLLER and °C are still framed.
    const record = "P|1||LAB-0001||MÜLLER^ANNA||19800101|F\r";
    const decoded = decodeAstmFrames(composeAstmFrames([record]));
    expect(decoded.warnings).toEqual([]);
    expect(asByteString(def(decoded.records[0]))).toBe(record);

    const every = String.fromCharCode(...Array.from({ length: 256 }, (_, i) => i));
    expect(composeAstmFrames([every]).length).toBeGreaterThan(256);
  });

  it("still refuses an empty record with its own code, unchanged", () => {
    try {
      composeAstmFrames(["H|\\^&\r", ""]);
      expect.unreachable("an empty record must not be framed");
    } catch (err) {
      expect((err as AstmFrameEncodeError).code).toBe("ASTM_FRAME_EMPTY_RECORD");
      expect((err as AstmFrameEncodeError).recordIndex).toBe(1);
      expect((err as AstmFrameEncodeError).characterIndex).toBeUndefined();
    }
  });
});

describe("the property, stated with its bound", () => {
  /**
   * For a record given as a string, `composeAstmFrames` either **refuses** it or
   * the decoder gives back exactly the bytes it stood for. Never a third outcome,
   * which is what the truncation was.
   *
   * The two sides are generated **separately and deliberately**, rather than by
   * filtering one arbitrary string generator. A single unfiltered generator over
   * arbitrary code points sends almost every case down the refusal branch, so the
   * reproduction half is measured on a handful of short ASCII strings and carries
   * far less evidence than the property's wording implies. The Latin-1 generator
   * below spans the **whole** 0x00 to 0xFF range and runs long enough to cross the
   * 240-byte frame split, and the non-vacuity block asserts both of those are
   * actually reached rather than merely counting runs.
   *
   * The bound is explicit and is not an oversight: a record already carrying a
   * frame-structure byte (`STX`/`ETX`/`ETB`) is excluded, because the encoder
   * accepts it, frames it as given, and the decoder then reads it wrong. That is a
   * separate open defect about control characters in values, untouched here, and
   * writing the property without the exclusion would claim it had been fixed.
   */
  const FRAME_STRUCTURE_BYTES = ["\u0002", "\u0003", "\u0017"];

  /** Every code unit in 0x00 to 0xFF, long enough to be split across frames. */
  /**
   * Every byte except the three the frame layer reserves as structure. The LONG
   * arm draws from this alphabet rather than filtering afterwards: a 241-byte
   * uniform-random record has only about a 6% chance of avoiding all three, so a
   * filtered long arm is almost entirely discarded and the 240-byte split goes
   * unexercised. The non-vacuity block below is what measured that.
   */
  const FRAMABLE_BYTES = Array.from({ length: 256 }, (_, i) => i).filter(
    (b) => b !== 0x02 && b !== 0x03 && b !== 0x17,
  );

  const latin1Record = fc
    .oneof(
      // fast-check biases array length low, so one arbitrary with a large
      // maxLength never actually crosses the split. The long arm is explicit.
      {
        weight: 3,
        arbitrary: fc.array(fc.integer({ min: 0, max: 0xff }), { minLength: 1, maxLength: 240 }),
      },
      {
        weight: 2,
        arbitrary: fc.array(fc.constantFrom(...FRAMABLE_BYTES), {
          minLength: 241,
          maxLength: 700,
        }),
      },
    )
    .map((codes) => codes.map((c) => String.fromCharCode(c)).join(""));

  /** The same, with one character above U+00FF spliced in at an arbitrary position. */
  const recordWithUnencodable = fc
    .tuple(latin1Record, fc.integer({ min: 0x100, max: 0x10ffff }), fc.nat())
    .map(([base, code, at]) => {
      const i = at % (base.length + 1);
      return base.slice(0, i) + String.fromCodePoint(code) + base.slice(i);
    });

  const framable = (record: string): boolean =>
    !FRAME_STRUCTURE_BYTES.some((c) => record.includes(c));

  it("refuses every record string carrying a character above U+00FF", () => {
    fc.assert(
      fc.property(recordWithUnencodable, (record) => {
        try {
          composeAstmFrames([record]);
          return false; // must not have been framed
        } catch (err) {
          return (
            err instanceof AstmFrameEncodeError && err.code === "ASTM_FRAME_UNENCODABLE_CHARACTER"
          );
        }
      }),
      { numRuns: 2000 },
    );
  });

  it("reproduces every framable Latin-1 record byte for byte, with no warning", () => {
    fc.assert(
      fc.property(latin1Record.filter(framable), (record) => {
        const decoded = decodeAstmFrames(composeAstmFrames([record]));
        return decoded.warnings.length === 0 && asByteString(def(decoded.records[0])) === record;
      }),
      { numRuns: 2000 },
    );
  });

  it("is not vacuous: the reproduction half reaches high bytes and the frame split", () => {
    // Counting runs is not evidence. These are the two conditions the property's
    // wording actually leans on, and an earlier draft of this file reached neither.
    let highByte = 0;
    let multiFrame = 0;
    let excluded = 0;
    fc.assert(
      fc.property(latin1Record, (record) => {
        if (!framable(record)) {
          excluded += 1;
          return true;
        }
        if ([...record].some((c) => c.charCodeAt(0) >= 0x80)) highByte += 1;
        if (record.length > 240) multiFrame += 1;
        return true;
      }),
      { numRuns: 2000 },
    );
    expect(highByte).toBeGreaterThan(500);
    expect(multiFrame).toBeGreaterThan(300);
    expect(excluded).toBeGreaterThan(0); // the bound excludes something real
  });
});

describe("the limit of this refusal, pinned so it is not read as wider", () => {
  // A record whose value carries an ETX is a single byte, so the guard above has
  // nothing to say about it: it is framed as given and the decoder reads the
  // embedded byte as the frame terminator. That is a different open defect,
  // deliberately not closed here. BOTH its branches are pinned, because an
  // earlier draft of this file pinned only the first and then described the
  // whole defect as failing loudly, which the second branch falsifies.

  it("does not touch a raw control character in a value: the branch that warns", () => {
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|\u0003|N||F\rL|1\r");
    const rt = parseFramedAstm(serializeFramedAstm(msg));
    expect(rt.frameWarnings.map((w) => w.code)).toContain("ASTM_FRAME_BAD_CHECKSUM");
    expect(rt.message.records.map((r) => r.type)).toEqual(["H", "L"]); // the R is gone
  });

  it("does not touch a raw control character in a value: the branch that is SILENT", () => {
    // When the two bytes after the embedded ETX happen to BE the truncated
    // frame's checksum, the short frame verifies, the tail is skipped as
    // inter-frame bytes and the frame numbers still run in sequence. Nothing
    // warns, and a whole result record is lost into the previous record's text.
    const body = "C|1|I|SPECIMEN SLIGHTLY HEMOLYZED";
    // The checksum composeAstmFrames would emit for that prefix in frame 3
    // (H, P, then this comment), computed here rather than copied, so the
    // fixture cannot rot into a merely-invalid one and quietly stop measuring.
    let sum = (0x30 + 3) % 256;
    for (const c of body) sum = (sum + c.charCodeAt(0)) % 256;
    sum = (sum + 0x03) % 256; // the embedded ETX, read as this frame's terminator
    const forged = sum.toString(16).toUpperCase().padStart(2, "0");

    const msg = parseAstmRecords(
      `H|\\^&\rP|1||LAB-0001\r${body}\u0003${forged}\rR|1|^^^687|28.6|U/L||N||F\rL|1\r`,
    );
    expect(results(msg)).toHaveLength(1); // one final result went in

    const rt = parseFramedAstm(serializeFramedAstm(msg));
    expect(rt.frameWarnings).toEqual([]); // silent
    expect(rt.message.warnings).toEqual([]); // at both layers
    expect(rt.frames.every((f) => f.trusted)).toBe(true);
    expect(rt.message.records.map((r) => r.type)).toEqual(["H", "P", "C", "L"]);
    expect(results(rt.message)).toHaveLength(0); // and the result is simply gone
  });
});
