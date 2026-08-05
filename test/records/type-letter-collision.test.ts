/**
 * The record serializer refuses a record whose **type letter would not survive its
 * own emit** (`src/records/serialize.ts`, `ASTM_EMIT_TYPE_LETTER_COLLISION`).
 *
 * Why this file exists, in one line: the recorded defect said such a record
 * "re-reads as an **unsupported** record, one result in, zero out", and that
 * describes only the branch where the escape character is not itself a record type
 * letter. When it is, the escaped type letter *starts with a valid letter*, so the
 * record re-reads as a **different recognized record** and no unknown-type warning
 * fires at all: measured, a `P` record comes back as an `R` whose `value` is the
 * patient's laboratory ID, `units` the practice-assigned one, `resultStatus` `F`.
 * The only warning on that stream is `ASTM_NONSTANDARD_DELIMITERS`, which is the
 * same warning a **clean** non-canonical stream carries and is on the profile
 * safety gate's tolerable allow-list, so `{ strict: true }` accepts it.
 *
 * Every fixture is asserted on what the OLD serializer produced as well as on the
 * new refusal, so the file keeps saying what was wrong if the guard is ever
 * weakened. The old output is rebuilt from the shipped `serializeField`, which
 * takes no record and is therefore outside the guard by construction, so nothing
 * is transcribed twice. Read that precisely: what `legacyStream` reproduces is
 * **this** serializer with the type-letter guard removed, not a historical build of
 * it. The escape encoder underneath has since changed (see
 * `escape-mnemonic-roles.test.ts`), and the guard needed no change when it did,
 * which is the point of checking the bytes rather than the delimiter set.
 * All content is synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  AstmSerializeError,
  AstmStrictError,
  defineAstmProfile,
  encodeComponent,
  parseAstmRecords,
  results,
  serializeAstmRecords,
  serializeField,
  serializeFramedAstm,
  type AstmMessage,
  type AstmRecord,
  type Delimiters,
} from "../../src/index.js";

const CANONICAL: Delimiters = { field: "|", repeat: "\\", component: "^", escape: "&" };

/**
 * What the serializer wrote before this guard existed, rebuilt from the public
 * field encoder rather than transcribed. `serializeField` is `encodeField` with the
 * delimiter check in front of it, so a non-header record's old line is exactly its
 * fields encoded and joined; a header's declaration was, and still is, literal.
 */
function legacyStream(msg: AstmMessage, d: Delimiters): string {
  return msg.records
    .map((r) =>
      r.type === "H"
        ? "H" + d.field + d.repeat + d.component + d.escape
        : r.fields.map((f) => serializeField(f, d)).join(d.field),
    )
    .map((line) => line + "\r")
    .join("");
}

/** The letter a record must re-read as; `rawType` for an unsupported one. */
function typeLetter(r: AstmRecord): string {
  return r.type === "unsupported" ? r.rawType : r.type;
}

const codesOf = (msg: AstmMessage): string[] =>
  [...new Set(msg.warnings.map((w) => w.code))].sort();

/**
 * A profile a vendor integration would legitimately write: the analyzer declares a
 * non-canonical delimiter set, so that warning is expected noise. The safety gate
 * PERMITS this, which is the whole point of the silence measured below.
 */
const vendorNonCanonical = defineAstmProfile({
  name: "vendorNonCanonical",
  description: "Tolerates a vendor analyzer's non-canonical delimiter declaration.",
  tolerate: [
    {
      code: "ASTM_NONSTANDARD_DELIMITERS",
      rationale: "The analyzer declares its own delimiter set and the reader honors it.",
    },
  ],
});

/**
 * A name-free patient record, which is both an ordinary shape on an
 * analyzer-to-LIS interface and the shape that keeps this fixture's warning set
 * honest. Stated rather than left to be discovered: a name in `P-5` lands in the
 * *fabricated* result's reference-range slot below and raises
 * `ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE`, which is not a report of the
 * corruption and would make the silence look fixture-specific. The named variant
 * is asserted at the end of this file so the difference is measured, not implied.
 */
const PATIENT_STREAM =
  "H|\\^&|||SENDER|||||RECEIVER||P|1|20260803120000\r" +
  "P|1||LAB-0001|PRAC-0002|||19800101|F\r" +
  "R|1|^^^687|28.6|U/L||N||F\r" +
  "L|1|N\r";

/** The same stream with the patient named, used only to pin the paragraph above. */
const NAMED_PATIENT_STREAM = PATIENT_STREAM.replace(
  "P|1||LAB-0001|PRAC-0002|||19800101|F",
  "P|1||LAB-0001|PRAC-0002|DOE^JANE||19800101|F",
);

describe("the loud branch: the type letter is escaped away and the record becomes unsupported", () => {
  const collided: Delimiters = { field: "R", repeat: "\\", component: "^", escape: "&" };

  it("is what the old serializer wrote, and it lost the result", () => {
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
    expect(results(msg)).toHaveLength(1);

    const old = legacyStream(msg, collided);
    // The `R` record's own type letter went out as the field-separator escape.
    expect(old).toContain("&F&R1R");
    const reread = parseAstmRecords(old);
    expect(reread.records.map((r) => r.type)).toEqual(["H", "unsupported", "L"]);
    expect(results(reread)).toHaveLength(0); // one result in, none out
  });

  it("is now refused, with a typed code and the record's index", () => {
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
    try {
      serializeAstmRecords(msg, collided);
      expect.unreachable("expected a type-letter collision to be refused");
    } catch (err) {
      expect(err).toBeInstanceOf(AstmSerializeError);
      expect((err as AstmSerializeError).code).toBe("ASTM_EMIT_TYPE_LETTER_COLLISION");
      expect((err as AstmSerializeError).recordIndex).toBe(1);
      // The message quotes nothing from the record: not a value, and not the type
      // letter either. On an unsupported record that letter is a byte off the wire,
      // and `assertEmittableDelimiters` refuses to echo a caller-supplied character
      // for the same reason. The message is a constant.
      const message = (err as AstmSerializeError).message;
      expect(message).not.toContain("28.6");
      expect(message).not.toContain("U/L");
      const unsupported = parseAstmRecords("H*~:#\r|1|GARBLED\rL*1\r");
      try {
        serializeAstmRecords(unsupported);
        expect.unreachable("expected the garbled record to be refused");
      } catch (other) {
        expect((other as AstmSerializeError).message).toBe(message);
        expect(message).not.toContain("|");
      }
    }
  });
});

describe("it is a TRANSCODING condition, so it fires with no delimiter argument", () => {
  // A vendor analyzer declaring its own set, plus one garbled line: the lenient-parse
  // population this library exists to serve. The record's type letter is `|`, which the
  // CANONICAL set escapes away, so the default emit refuses it. "Pass the canonical
  // delimiters instead" is therefore not a remedy, and every surface describing this
  // refusal has to say so.
  const VENDOR_STREAM =
    "H*~:#|||ANALYZER|||||LIS||P|1|20260803120000\r" +
    "P*1**LAB-0001*PRAC-0002***19800101*F\r" +
    "R*1*:::687*28.6*U/L**N**F\r" +
    "|1|CONTINUATION FROM A DROPPED FRAME\r" +
    "L*1*N\r";

  it("refuses on the default canonical path, and through the frame layer too", () => {
    const msg = parseAstmRecords(VENDOR_STREAM);
    expect(msg.records.map(typeLetter)).toEqual(["H", "P", "R", "|", "L"]);

    for (const emit of [
      (): unknown => serializeAstmRecords(msg), // no `d` argument at all
      (): unknown => serializeFramedAstm(msg), // passes no set of its own either
    ]) {
      try {
        emit();
        expect.unreachable("expected the default canonical emit to be refused");
      } catch (err) {
        expect((err as AstmSerializeError).code).toBe("ASTM_EMIT_TYPE_LETTER_COLLISION");
        expect((err as AstmSerializeError).recordIndex).toBe(3);
      }
    }
  });

  it("is what the old serializer silently relabeled", () => {
    // The base emitted this record with its `rawType` changed from `|` to `&`, so the
    // guard is earning its keep here rather than over-refusing: `rawType` is a
    // surfaced field.
    const msg = parseAstmRecords(VENDOR_STREAM);
    const reread = parseAstmRecords(legacyStream(msg, CANONICAL));
    expect(reread.records.map(typeLetter)).toEqual(["H", "P", "R", "&", "L"]);
  });
});

describe("a type letter equal to the ESCAPE character is accepted for the OUTCOME, not for a formula", () => {
  it("encodes as letter + E + letter, and the guard still does not depend on that", () => {
    // This assertion USED to pin the opposite for the second and third sets, which
    // encoded to `RRFRR` and `RRSRR`: the encoder ran as four chained substitutions
    // and protected only the escape character it introduced, so a set naming one of
    // the `E`/`F`/`S` mnemonics in another role re-escaped a mnemonic the encoder had
    // just written. The encoder is a single left-to-right pass now, so the familiar
    // shape holds for every set, and the type field decodes back to the letter.
    //
    // The guard is deliberately NOT rewritten as a rule over the four roles even so.
    // It reads the first character actually written, which is why it needed no change
    // when the encoder underneath it did.
    for (const d of [
      { field: "|", repeat: "\\", component: "^", escape: "R" },
      { field: "E", repeat: "\\", component: "^", escape: "R" },
      { field: "|", repeat: "\\", component: "E", escape: "R" },
    ] satisfies Delimiters[]) {
      expect(encodeComponent("R", d)).toBe("RER");
    }
  });

  it("still round-trips the record TYPE under those sets, which is all that is checked", () => {
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
    for (const d of [
      { field: "E", repeat: "\\", component: "^", escape: "R" },
      { field: "|", repeat: "\\", component: "E", escape: "R" },
    ] satisfies Delimiters[]) {
      const reread = parseAstmRecords(serializeAstmRecords(msg, d));
      expect(reread.records.map(typeLetter)).toEqual(["H", "R", "L"]);
    }
  });
});

describe("the SILENT branch the defect record did not have: the record re-reads as a DIFFERENT recognized record", () => {
  // `encodeLeaf` writes an escaped character as escape + mnemonic + escape, so when
  // the escape character is itself a record type letter the escaped type letter
  // begins with a real letter and the reader never sees an unknown type.
  const masquerade: Delimiters = { field: "P", repeat: "\\", component: "^", escape: "R" };

  it("fabricates a final lab result out of patient identifiers", () => {
    const msg = parseAstmRecords(PATIENT_STREAM);
    expect(results(msg)).toHaveLength(1);

    const reread = parseAstmRecords(legacyStream(msg, masquerade));
    expect(reread.records.map((r) => r.type)).toEqual(["H", "R", "R", "L"]);

    const fabricated = results(reread)[0];
    expect(results(reread)).toHaveLength(2); // one result in, TWO out
    expect(fabricated?.value).toBe("LAB-0001"); // the patient's laboratory ID
    expect(fabricated?.units).toBe("PRAC-0002"); // the practice-assigned ID
    expect(fabricated?.resultStatus).toBe("F"); // reported as FINAL
  });

  it("carries the same warnings a CLEAN non-canonical stream carries, and nothing else", () => {
    const msg = parseAstmRecords(PATIENT_STREAM);
    // A control that collides with no type letter: same shape, same non-canonical
    // declaration, correct readback.
    const clean: Delimiters = { field: "*", repeat: "\\", component: ":", escape: "&" };
    const control = parseAstmRecords(serializeAstmRecords(msg, clean));
    expect(control.records.map((r) => r.type)).toEqual(["H", "P", "R", "L"]);
    expect(results(control)).toHaveLength(1);

    const corrupt = parseAstmRecords(legacyStream(msg, masquerade));
    // Warning-indistinguishable from the clean stream: no code reports the loss.
    expect(codesOf(corrupt)).toEqual(codesOf(control));
    expect(codesOf(corrupt)).toEqual(["ASTM_NONSTANDARD_DELIMITERS"]);
  });

  it("is ACCEPTED by `{ strict: true }` under a profile the safety gate permits", () => {
    const msg = parseAstmRecords(PATIENT_STREAM);
    const corrupt = legacyStream(msg, masquerade);
    // No throw: the fabricated result passes the strictest reading this library offers.
    const strict = parseAstmRecords(corrupt, { strict: true, profile: vendorNonCanonical });
    expect(results(strict)).toHaveLength(2);
    // And the profile is legal: the gate refuses a profile naming a safety-critical
    // code, so this one exists only because ASTM_NONSTANDARD_DELIMITERS is tolerable.
    expect(vendorNonCanonical.name).toBe("vendorNonCanonical");
  });

  it("is refused by strict only where the FIXTURE happens to add an unrelated warning", () => {
    // The named-patient variant of the same corruption. It is caught, but not by
    // anything reporting the corruption: the patient's name lands in the fabricated
    // result's reference-range slot. Pinned so nobody reads the acceptance above as
    // a property of one hand-picked fixture, or this refusal as a guard.
    const named = parseAstmRecords(NAMED_PATIENT_STREAM);
    const corrupt = parseAstmRecords(legacyStream(named, masquerade));
    expect(codesOf(corrupt)).toEqual([
      "ASTM_NONSTANDARD_DELIMITERS",
      "ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE",
    ]);
    expect(results(corrupt)[0]?.referenceRange).toBe("DOE^JANE");
    expect(() =>
      parseAstmRecords(legacyStream(named, masquerade), {
        strict: true,
        profile: vendorNonCanonical,
      }),
    ).toThrow(AstmStrictError);
  });

  it("is now refused before any bytes are written", () => {
    const msg = parseAstmRecords(PATIENT_STREAM);
    try {
      serializeAstmRecords(msg, masquerade);
      expect.unreachable("expected a type-letter collision to be refused");
    } catch (err) {
      expect((err as AstmSerializeError).code).toBe("ASTM_EMIT_TYPE_LETTER_COLLISION");
      expect((err as AstmSerializeError).recordIndex).toBe(1); // the `P` record
    }
  });
});

describe("the escape role is exempt, because the output is correct", () => {
  it("emits and round-trips a set whose escape character IS a record type letter", () => {
    // `R` as the escape character encodes the `R` record's type letter as `RER`,
    // whose first character is the letter itself, so the record re-reads as its own
    // type and its type field decodes back to `R`. Measured, not assumed: this is
    // why the guard tests the emitted bytes rather than listing dangerous roles.
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
    const d: Delimiters = { field: "|", repeat: "\\", component: "^", escape: "R" };
    const emitted = serializeAstmRecords(msg, d);
    const reread = parseAstmRecords(emitted);
    expect(reread.records.map((r) => r.type)).toEqual(["H", "R", "L"]);
    expect(results(reread)[0]?.value).toBe("28.6");
    expect(results(reread)[0]?.units).toBe("U/L");
  });
});

describe("the guard is BICONDITIONAL with the old serializer losing a type letter", () => {
  // The sweep, rather than a handful of fixtures: every one of the four delimiter
  // roles set to every printable ASCII character, against a stream carrying one
  // record of every modeled type plus an unsupported one. For each set, the guard
  // must refuse EXACTLY when the pre-guard serializer would have written a record
  // whose first character is not its own type letter.
  const EVERY_TYPE =
    "H|\\^&|||SENDER|||||RECEIVER||P|1|20260803120000\r" +
    "P|1||LAB-0001|PRAC-0002|DOE^JANE||19800101|F\r" +
    "O|1|SPEC-0003||^^^687|R|20260803120000\r" +
    "R|1|^^^687|28.6|U/L||N||F\r" +
    "C|1|I|NOTE|G\r" +
    "Q|1|LAB-0001^SPEC-0003||ALL\r" +
    "M|1|VENDOR^DATA\r" +
    "S|1|PAYLOAD\r" +
    "Z|1|ROW\r" +
    "L|1|N\r";

  it("refuses if and only if a record would lose its type letter, over every role x printable ASCII", () => {
    const msg = parseAstmRecords(EVERY_TYPE);
    const roles = ["field", "repeat", "component", "escape"] as const;
    const chars: string[] = [];
    for (let c = 0x20; c <= 0x7e; c += 1) chars.push(String.fromCharCode(c));

    let refused = 0;
    let reproduced = 0;
    let mismatches = 0;

    for (const role of roles) {
      for (const ch of chars) {
        const d: Delimiters = { ...CANONICAL, [role]: ch };
        if (new Set(roles.map((r) => d[r])).size !== 4) continue;

        const wouldLoseLetter = msg.records.some(
          (r) =>
            r.type !== "H" &&
            r.fields
              .map((f) => serializeField(f, d))
              .join(d.field)
              .charAt(0) !== typeLetter(r),
        );

        let threw: AstmSerializeError | undefined;
        let emitted: string | undefined;
        try {
          emitted = serializeAstmRecords(msg, d);
        } catch (err) {
          threw = err as AstmSerializeError;
        }

        if (wouldLoseLetter) {
          if (threw?.code === "ASTM_EMIT_TYPE_LETTER_COLLISION") refused += 1;
          else mismatches += 1;
        } else if (emitted !== undefined) {
          // Not merely accepted: it must actually read back as the same records.
          const reread = parseAstmRecords(emitted);
          if (
            reread.records.map(typeLetter).join("") === msg.records.map(typeLetter).join("") &&
            results(reread).length === results(msg).length
          ) {
            reproduced += 1;
          } else {
            mismatches += 1;
          }
        } else {
          mismatches += 1;
        }
      }
    }

    expect(mismatches).toBe(0);
    // Non-vacuity: both halves are genuinely exercised, and by a wide margin.
    expect(refused).toBeGreaterThan(20);
    expect(reproduced).toBeGreaterThan(300);
  });
});

describe("what the guard does NOT reach, pinned so it is not read as wider", () => {
  it("does not cover `serializeField`, which takes no record", () => {
    // Every fixture above depends on this staying true, and a caller assembling a
    // line out of the field encoder is genuinely outside the guard's reach.
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r");
    const d: Delimiters = { field: "R", repeat: "\\", component: "^", escape: "&" };
    const typeField = msg.records[1]?.fields[0];
    if (typeField === undefined) expect.unreachable("the R record must carry a type-letter field");
    expect(serializeField(typeField, d)).toBe("&F&"); // the `R` escaped away, no refusal
  });

  it("is a check on the TYPE LETTER, not a readback guarantee for the whole record", () => {
    // A set that keeps every type letter can still be one this library re-reads
    // differently. A delimiter as an escape body is the standing example: reported
    // (by `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE`, which is not tolerable, and by
    // `ASTM_UNKNOWN_ESCAPE_SEQUENCE`, which is) and untouched by this guard, which
    // reads the type letter only.
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^687|28.6&|&U/L||||F\rL|1\r");
    expect(results(msg)[0]?.value).toBe("28.6&|&U/L");
    expect(results(msg)[0]?.units).toBeUndefined();
    expect(codesOf(msg)).toContain("ASTM_UNKNOWN_ESCAPE_SEQUENCE");
    expect(codesOf(msg)).toContain("ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE");
    // Emitting it is not refused: no type letter is at risk.
    expect(() => serializeAstmRecords(msg)).not.toThrow();
  });

  it("does not change the canonical path", () => {
    const raw = "H|\\^&\rP|1\rR|1|^^^687|28.6|U/L||N||F\rL|1\r";
    expect(serializeAstmRecords(parseAstmRecords(raw))).toBe(raw);
  });

  it("leaves a strict parse of a legitimately non-canonical stream alone", () => {
    const msg = parseAstmRecords(PATIENT_STREAM);
    const clean: Delimiters = { field: "*", repeat: "\\", component: ":", escape: "&" };
    const emitted = serializeAstmRecords(msg, clean);
    expect(() =>
      parseAstmRecords(emitted, { strict: true, profile: vendorNonCanonical }),
    ).not.toThrow();
    expect(() => parseAstmRecords(emitted, { strict: true, profile: null })).toThrow(
      AstmStrictError,
    );
  });
});
