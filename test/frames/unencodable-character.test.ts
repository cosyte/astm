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
   * The bound is explicit and is not an oversight: a record already carrying a
   * frame-structure byte (`STX`/`ETX`/`ETB`) is excluded, because the encoder
   * accepts it, frames it as given, and the decoder then reads it wrong. That is a
   * separate open defect about control characters in values, untouched here, and
   * writing the property without the exclusion would claim it had been fixed.
   */
  const FRAME_STRUCTURE_BYTES = ["\u0002", "\u0003", "\u0017"];

  it("either refuses a record string or reproduces it byte for byte", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 300, unit: "binary" }), (record) => {
        if ([...record].some((c) => c.charCodeAt(0) > 0xff)) {
          try {
            composeAstmFrames([record]);
            return false; // must not have been framed
          } catch (err) {
            return (
              err instanceof AstmFrameEncodeError && err.code === "ASTM_FRAME_UNENCODABLE_CHARACTER"
            );
          }
        }
        if (FRAME_STRUCTURE_BYTES.some((c) => record.includes(c))) return true; // out of scope
        const decoded = decodeAstmFrames(composeAstmFrames([record]));
        return decoded.warnings.length === 0 && asByteString(def(decoded.records[0])) === record;
      }),
      { numRuns: 2000 },
    );
  });

  it("is not vacuous: the generator reaches both sides of the bound", () => {
    const seen = { refused: 0, reproduced: 0 };
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 40, unit: "binary" }), (record) => {
        if ([...record].some((c) => c.charCodeAt(0) > 0xff)) seen.refused += 1;
        else if (!FRAME_STRUCTURE_BYTES.some((c) => record.includes(c))) seen.reproduced += 1;
        return true;
      }),
      { numRuns: 2000 },
    );
    expect(seen.refused).toBeGreaterThan(0);
    expect(seen.reproduced).toBeGreaterThan(0);
  });
});

describe("the limit of this refusal, pinned so it is not read as wider", () => {
  it("does not touch a raw control character already in a value", () => {
    // A record whose value carries an ETX is a single byte, so this guard has
    // nothing to say about it. It is framed as given and the frame layer then
    // rejects the record behind a checksum warning: a different open defect,
    // deliberately not closed here.
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|\u0003|N||F\rL|1\r");
    const rt = parseFramedAstm(serializeFramedAstm(msg));
    expect(rt.frameWarnings.map((w) => w.code)).toContain("ASTM_FRAME_BAD_CHECKSUM");
    expect(rt.message.records.map((r) => r.type)).toEqual(["H", "L"]); // the R is gone
  });
});
