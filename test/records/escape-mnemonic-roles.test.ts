/**
 * The record serializer's escape encoder is a single left-to-right pass, so a
 * delimiter set naming one of the `E` / `F` / `S` / `R` mnemonics in another role
 * can no longer alter a value (`src/records/serialize.ts`, `encodeLeaf`).
 *
 * **The defect.** The encoder used to run as four chained whole-string
 * substitutions: escape character first, then field, component and repeat. Going
 * first protected the escape character it introduced, but nothing protected the
 * mnemonic letters it introduced, so a later substitution could re-escape a
 * mnemonic the encoder had just written. Under `{ field: "E", escape: "R" }` a leaf
 * of `R` went out as `RRFRR` and read back as `RER`.
 *
 * **Why the old bytes are transcribed here and nowhere else in this suite.** The
 * sibling files rebuild pre-fix output from a shipped export that sits outside the
 * guard under test. That is not available for this one: the defect was in the
 * encoder itself, so no shipped surface still reproduces it. `legacyEncodeLeaf`
 * below is therefore a deliberate transcription of the four chained substitutions,
 * and it is checked against the shipped encoder on every set where the two must
 * agree, so it cannot quietly become a strawman that proves nothing.
 *
 * All fixtures are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  TOLERABLE_CODES,
  encodeComponent,
  parseAstmRecords,
  results,
  serializeAstmRecords,
  tokenizeRecord,
  type AstmMessage,
  type AstmRecord,
  type Delimiters,
} from "../../src/index.js";

/** The four chained substitutions the encoder used to be, transcribed verbatim. */
function legacyEncodeLeaf(leaf: string, d: Delimiters): string {
  return leaf
    .split(d.escape)
    .join(d.escape + "E" + d.escape)
    .split(d.field)
    .join(d.escape + "F" + d.escape)
    .split(d.component)
    .join(d.escape + "S" + d.escape)
    .split(d.repeat)
    .join(d.escape + "R" + d.escape);
}

const MNEMONICS = new Set(["E", "F", "S", "R"]);

/**
 * The sweep alphabet: the four canonical delimiters, the four mnemonic letters this
 * file is about, a common vendor set, and neutral punctuation. Ordered four-role
 * sets drawn from it are P(12,4) = 11,880, which is the whole space, not a sample.
 */
const ALPHABET = ["|", "\\", "^", "&", "E", "F", "S", "R", "*", "~", ":", "#"];

function* delimiterSets(): Generator<Delimiters> {
  const n = ALPHABET.length;
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++) {
      if (b === a) continue;
      for (let c = 0; c < n; c++) {
        if (c === a || c === b) continue;
        for (let e = 0; e < n; e++) {
          if (e === a || e === b || e === c) continue;
          yield {
            field: ALPHABET[a] as string,
            repeat: ALPHABET[b] as string,
            component: ALPHABET[c] as string,
            escape: ALPHABET[e] as string,
          };
        }
      }
    }
}

function namesMnemonic(d: Delimiters): boolean {
  return [d.field, d.repeat, d.component, d.escape].some((ch) => MNEMONICS.has(ch));
}

/**
 * The comparable shape of a parsed stream. The header's type letter and delimiter
 * declaration are excluded on purpose: transcoding a message into another set is
 * *supposed* to rewrite the declaration, so comparing it would report a difference
 * for every non-canonical set and drown the real ones. Every header data field is
 * compared like any other record's.
 */
function fieldTree(msg: AstmMessage): string {
  return JSON.stringify(
    msg.records.map((r) => [
      r.type === "unsupported" ? r.rawType : r.type,
      (r.type === "H" ? r.fields.slice(2) : r.fields).map((f) =>
        f.repeats.map((rep) => rep.slice()),
      ),
    ]),
  );
}

/**
 * A synthetic stream whose values carry characters that become delimiters in the
 * sweep.
 *
 * `M` and `S` are here deliberately: they reach `serializeVerbatimRecord`, which
 * re-emits from `rawLine` when a reader using the emit delimiters would recover the
 * modelled fields and re-encodes from the field tree when it would not. That is a
 * separate code path from the ordinary one, and a first draft of this file exercised
 * neither it nor the unsupported-record branch (swept just below).
 */
const STREAM =
  [
    "H|\\^&|||SENDER^SYS|||||||P|1",
    "P|1||LAB-0001|PRAC-0001|SMITH^JANE||19800101|F",
    "O|1|SPEC-7||^^^GLU|R|20260801120000",
    "R|1|^^^GLU|28.6|U/L||N||F",
    "R|2|^^^EFSR|E&S&F|S&R&R||H||F",
    "R|3|^^^ACC-42|1&S&40|mg&F&dL||N||F",
    "C|1|I|NOTE %+@!$/ TEXT|G",
    "M|1|VENDOR^BLOCK|RAW&F&DATA",
    "S|1|SCI^BLOCK|E&S&F",
    "L|1|N",
  ].join("\r") + "\r";

/**
 * The same stream carrying an unsupported record, swept separately.
 *
 * It is NOT in `STREAM`, and the reason is a measurement rather than tidiness: an
 * unsupported record raises `ASTM_RECORD_UNKNOWN_TYPE` on every re-parse, which is
 * safety-critical, so every divergence on this corpus is refused by `{ strict: true }`
 * and the strict-accepted tier below would read zero for a reason that has nothing to
 * do with the defect. Kept apart so each corpus measures one thing.
 */
const STREAM_WITH_UNSUPPORTED = STREAM.replace("L|1|N\r", "Z|1|UNMODELLED^ROW\rL|1|N\r");

describe("the transcribed pre-fix encoder is faithful, not a strawman", () => {
  it("agrees with the shipped encoder on every set that names no mnemonic", () => {
    let checked = 0;
    for (const d of delimiterSets()) {
      if (namesMnemonic(d)) continue;
      checked += 1;
      for (const leaf of ["28.6", "SMITH^JANE", "a|b\\c^d&e", "EFSR", ""]) {
        expect(legacyEncodeLeaf(leaf, d)).toBe(encodeComponent(leaf, d));
      }
    }
    // Non-vacuity: the agreement is asserted over a real population, not zero sets.
    expect(checked).toBe(1680);
  });

  it("disagrees exactly where the defect was, and the recorded bytes are reproduced", () => {
    const collidingField: Delimiters = { field: "E", repeat: "\\", component: "^", escape: "R" };
    expect(legacyEncodeLeaf("R", collidingField)).toBe("RRFRR");
    expect(encodeComponent("R", collidingField)).toBe("RER");
  });
});

describe("the pre-fix encoder altered values, which is why this is a fix and not a doc change", () => {
  it("changed a result's value and units under a set the serializer accepts", () => {
    // `{ component: "E", escape: "^" }`: the encoder wrote `^E^` for an embedded `^`
    // and the component pass then re-escaped the `E` inside it.
    const d: Delimiters = { field: "|", repeat: "\\", component: "E", escape: "^" };
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^GLU|28.6|U&S&E&S&L||N||F\rL|1\r");
    const before = results(msg)[0];
    expect(before?.value).toBe("28.6");
    expect(before?.units).toBe("U^E^L");

    const legacy = parseAstmRecords(legacyStream(msg, d));
    const after = results(legacy)[0];
    expect(after?.units).not.toBe("U^E^L");

    // The shipped encoder recovers it exactly.
    const fixed = parseAstmRecords(serializeAstmRecords(msg, d));
    expect(results(fixed)[0]?.value).toBe("28.6");
    expect(results(fixed)[0]?.units).toBe("U^E^L");
  });

  it("reported nothing outside the safety gate's tolerable allow-list while doing it", () => {
    const d: Delimiters = { field: "|", repeat: "\\", component: "E", escape: "^" };
    const msg = parseAstmRecords("H|\\^&\rR|1|^^^GLU|28.6|U&S&E&S&L||N||F\rL|1\r");
    const legacy = parseAstmRecords(legacyStream(msg, d));

    expect(fieldTree(legacy)).not.toBe(fieldTree(msg));
    const codes = [...new Set(legacy.warnings.map((w) => w.code))];
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) expect(TOLERABLE_CODES.has(code)).toBe(true);
  });
});

/**
 * One record's pre-fix wire text: the shipped serializer with `legacyEncodeLeaf`
 * substituted for the encoder, and nothing else changed. The header's declaration is
 * literal here exactly as it is in the shipped one, and its data fields (index 2
 * onward) are encoded like any other record's.
 *
 * **The reconstruction is faithful only for a header whose declaration carries no
 * surplus, and both corpora in this file satisfy that.** It does not reproduce
 * `declarationResidual`, so a header declaring `H|\^&#` would come back here without
 * its `#` while the real serializer keeps it, and the difference would be credited to
 * the encoder change. That bound is written down rather than closed because this is
 * the SECOND time this reconstruction has silently diverged from the real one: the
 * verbatim `M`/`S` path below was missing on the first draft, with the same effect. If
 * you give either corpus a header surplus, which the other half of this slice makes a
 * natural thing to want, reproduce the residual here first or the sweep starts lying.
 */
function legacyLine(msg: AstmMessage, index: number, d: Delimiters): string {
  const record = msg.records[index];
  if (record === undefined) return "";
  const encode = (repeats: readonly (readonly string[])[]): string =>
    repeats.map((rep) => rep.map((c) => legacyEncodeLeaf(c, d)).join(d.component)).join(d.repeat);
  if (record.type === "H") {
    const head = "H" + d.field + d.repeat + d.component + d.escape;
    return (
      head +
      record.fields
        .slice(2)
        .map((f) => d.field + encode(f.repeats))
        .join("")
    );
  }
  // `M`/`S` take the verbatim path in the real serializer, before and after the fix,
  // and reproducing it here is what keeps this a faithful reconstruction rather than a
  // second serializer. Omitting it made `legacyLine` differ from the real pre-fix
  // output on those records, which would have credited the encoder fix with byte
  // changes it did not make.
  if ((record.type === "M" || record.type === "S") && recoversVerbatim(record, d)) {
    return record.rawLine;
  }
  return record.fields.map((f) => encode(f.repeats)).join(d.field);
}

/** `recoversVerbatim` from the serializer, rebuilt on the exported tokenizer. */
function recoversVerbatim(
  record: Extract<AstmRecord, { type: "M" | "S" }>,
  d: Delimiters,
): boolean {
  const a = tokenizeRecord(record.rawLine, d);
  const b = record.fields;
  if (a.length !== b.length) return false;
  return a.every((fieldA, i) => {
    const fieldB = b[i];
    if (fieldB === undefined || fieldA.repeats.length !== fieldB.repeats.length) return false;
    return fieldA.repeats.every((repA, r) => {
      const repB = fieldB.repeats[r];
      if (repB === undefined || repA.length !== repB.length) return false;
      return repA.every((comp, c) => comp === repB[c]);
    });
  });
}

/** The pre-fix stream, rebuilt from the transcribed encoder above. */
function legacyStream(msg: AstmMessage, d: Delimiters): string {
  return msg.records.map((_, i) => legacyLine(msg, i, d) + "\r").join("");
}

/**
 * One pass over the whole four-role space, collecting everything the assertions
 * below need. Done once because each set costs two serializations and two parses,
 * and running the space per assertion is what made this file slow enough to time
 * out on its first draft.
 */
interface SweepResult {
  readonly total: number;
  readonly refused: number;
  readonly accepted: number;
  readonly acceptedNamingMnemonic: number;
  readonly partitionDisagreements: readonly Delimiters[];
  readonly divergingNow: readonly Delimiters[];
  readonly divergedBefore: number;
  readonly divergedBeforeStrictAccepted: number;
  readonly bytesChanged: number;
  readonly bytesChangedNamingNoMnemonic: readonly Delimiters[];
}

function sweep(stream: string): SweepResult {
  const source = parseAstmRecords(stream);
  const expected = fieldTree(source);
  const letters = source.records.map((r) => (r.type === "unsupported" ? r.rawType : r.type));

  let total = 0;
  let refused = 0;
  let accepted = 0;
  let acceptedNamingMnemonic = 0;
  let divergedBefore = 0;
  let divergedBeforeStrictAccepted = 0;
  let bytesChanged = 0;
  const partitionDisagreements: Delimiters[] = [];
  const divergingNow: Delimiters[] = [];
  const bytesChangedNamingNoMnemonic: Delimiters[] = [];

  for (const d of delimiterSets()) {
    total += 1;

    // What the pre-fix serializer wrote, and whether the type-letter guard would
    // have refused it: the guard reads the first character of each line.
    const legacyLines = source.records.map((_, i) => legacyLine(source, i, d));
    const legacyRefuses = legacyLines.some((line, i) => line.charAt(0) !== letters[i]);

    let emitted: string | undefined;
    try {
      emitted = serializeAstmRecords(source, d);
    } catch {
      emitted = undefined;
    }
    if ((emitted === undefined) !== legacyRefuses) partitionDisagreements.push(d);

    if (emitted === undefined) {
      refused += 1;
      continue;
    }
    accepted += 1;
    if (namesMnemonic(d)) acceptedNamingMnemonic += 1;

    if (fieldTree(parseAstmRecords(emitted)) !== expected) divergingNow.push(d);

    const legacyText = legacyLines.map((line) => line + "\r").join("");
    if (legacyText !== emitted) {
      bytesChanged += 1;
      if (!namesMnemonic(d)) bytesChangedNamingNoMnemonic.push(d);
    }
    // Identical bytes re-parse identically, and the assertion above says the shipped
    // bytes round-trip, so only the sets whose bytes changed can have diverged before.
    // Skipping the rest is what keeps this pass affordable.
    if (legacyText !== emitted) {
      const before = parseAstmRecords(legacyText);
      if (fieldTree(before) !== expected) {
        divergedBefore += 1;
        const codes = [...new Set(before.warnings.map((w) => w.code))];
        if (codes.every((c) => TOLERABLE_CODES.has(c))) divergedBeforeStrictAccepted += 1;
      }
    }
  }

  return {
    total,
    refused,
    accepted,
    acceptedNamingMnemonic,
    partitionDisagreements,
    divergingNow,
    divergedBefore,
    divergedBeforeStrictAccepted,
    bytesChanged,
    bytesChangedNamingNoMnemonic,
  };
}

describe("the whole four-role space of the sweep alphabet", () => {
  const result = sweep(STREAM);

  it("covers the space it claims to, and both branches are populated", () => {
    // Non-vacuity, asserted on what the sweep REACHED rather than on a run count.
    expect(result.total).toBe(11880);
    expect(result.refused).toBeGreaterThan(0);
    expect(result.accepted).toBeGreaterThan(0);
    expect(result.acceptedNamingMnemonic).toBeGreaterThan(1000);
  });

  it("round-trips the field tree for every set the serializer accepts", () => {
    expect(result.divergingNow).toEqual([]);
  });

  it("did not, before the fix, and the divergences were accepted by strict", () => {
    // This is what makes the assertion above load-bearing rather than vacuous.
    expect(result.divergedBefore).toBeGreaterThan(0);
    // The dangerous tier: everything reported is on the tolerable allow-list, so a
    // gate-legal profile plus `{ strict: true }` accepted the altered value.
    expect(result.divergedBeforeStrictAccepted).toBeGreaterThan(0);
  });

  it("changes bytes only for sets that name a mnemonic in a delimiter role", () => {
    expect(result.bytesChangedNamingNoMnemonic).toEqual([]);
    expect(result.bytesChanged).toBe(result.divergedBefore);
  });

  it("does not move the accept/refuse partition", () => {
    // The type-letter guard reads the first character written. A leaf beginning with
    // a delimiter still begins with the escape character once encoded, and one
    // beginning with the escape character still begins with itself, so which records
    // are refused is unchanged by the encoder rewrite.
    expect(result.partitionDisagreements).toEqual([]);
  });

  it("leaves a canonical message byte-identical", () => {
    expect(serializeAstmRecords(parseAstmRecords(STREAM))).toBe(STREAM);
  });
});

describe("the unsupported-record branch, swept on its own corpus", () => {
  // A record whose type letter comes off the wire rather than from the model takes a
  // different path through the type-letter check. Only the round-trip and partition
  // claims are made here: see `STREAM_WITH_UNSUPPORTED` for why the strict tier is
  // not measurable on this corpus.
  const result = sweep(STREAM_WITH_UNSUPPORTED);

  it("round-trips the field tree and does not move the partition either", () => {
    expect(result.divergingNow).toEqual([]);
    expect(result.partitionDisagreements).toEqual([]);
    expect(result.accepted).toBeGreaterThan(0);
    expect(result.refused).toBeGreaterThan(0);
  });

  it("still diverged before the fix, so this corpus is not vacuous", () => {
    expect(result.divergedBefore).toBeGreaterThan(0);
    expect(result.bytesChanged).toBe(result.divergedBefore);
  });
});

describe("the emitted bytes themselves, pinned as literals", () => {
  /**
   * Every other assertion in this file reads the emitted stream back through this
   * package's own parser. That is a real constraint (the decoder is not what this
   * slice changed), but it cannot see an encoder and decoder that agree with each
   * other and are both wrong: a sibling repo shipped an off-byte element map whose
   * whole suite stayed green for exactly that reason, because every assertion was
   * write-then-read. These literals are transcribed bytes, and each is derived in
   * the comment beside it rather than snapshotted, so a reviewer can check the
   * string without running anything.
   */
  const SOURCE =
    "H|\\^&\r" +
    "P|1||LAB-0001|PRAC-0001|O&BRIEN^JANE||19800101|F\r" +
    "R|1|^^^GLU|28.6|U&S&E&S&L||N||F\r" +
    "L|1|N\r";

  it("parses the fixture to the values the literals below are derived from", () => {
    const msg = parseAstmRecords(SOURCE);
    // `O&BRIEN` carries a lone escape character, read as the literal it is.
    expect(msg.warnings.map((w) => w.code)).toEqual(["ASTM_UNPAIRED_ESCAPE_CHARACTER"]);
    expect(results(msg)[0]?.value).toBe("28.6");
    // `U&S&E&S&L` decodes to one component holding two literal component delimiters.
    expect(results(msg)[0]?.units).toBe("U^E^L");
  });

  it("emits the canonical set literally", () => {
    // Unchanged except that the lone `&` the parser kept as a literal is written
    // back in its spec-clean form, `&E&`.
    expect(serializeAstmRecords(parseAstmRecords(SOURCE))).toBe(
      "H|\\^&\r" +
        "P|1||LAB-0001|PRAC-0001|O&E&BRIEN^JANE||19800101|F\r" +
        "R|1|^^^GLU|28.6|U&S&E&S&L||N||F\r" +
        "L|1|N\r",
    );
  });

  it("emits a set whose FIELD delimiter is the `F` mnemonic's neighbour `E`, escape `R`", () => {
    // escape = `R`, so a literal `R` is written `RER`: `PRAC-0001` becomes
    // `PRERAC-0001`, and the `R` record's own type letter becomes `RER`, which still
    // STARTS with `R` and so survives the type-letter check. field = `E`, so a
    // literal `E` is written `RFR`: `O&BRIEN` becomes `O&BRERIRFRN`.
    expect(
      serializeAstmRecords(parseAstmRecords(SOURCE), {
        field: "E",
        repeat: "\\",
        component: "^",
        escape: "R",
      }),
    ).toBe(
      "HE\\^R\r" +
        "PE1EELAB-0001EPRERAC-0001EO&BRERIRFRN^JANRFREE19800101EF\r" +
        "RERE1E^^^GLUE28.6EURSRRFRRSRLEENEEF\r" +
        "LE1EN\r",
    );
  });

  it("emits a set whose COMPONENT delimiter is the `S` mnemonic's neighbour `E`, escape `^`", () => {
    // escape = `^`, component = `E`. The units component `U^E^L` holds both: each
    // `^` is written `^E^` and the `E` between them is written `^S^`, giving
    // `U^E^^S^^E^L`. Under the pre-fix encoder the component pass re-escaped the `E`
    // that the escape pass had just written, which is the defect this file exists for.
    expect(
      serializeAstmRecords(parseAstmRecords(SOURCE), {
        field: "|",
        repeat: "\\",
        component: "E",
        escape: "^",
      }),
    ).toBe(
      "H|\\E^\r" +
        "P|1||LAB-0001|PRAC-0001|O&BRI^S^NEJAN^S^||19800101|F\r" +
        "R|1|EEEGLU|28.6|U^E^^S^^E^L||N||F\r" +
        "L|1|N\r",
    );
  });

  it("emits a vendor set naming no mnemonic, where the fix changed nothing", () => {
    // No role is `E`/`F`/`S`/`R`, so nothing the encoder writes can collide with
    // anything it writes later, and these bytes are identical before and after.
    expect(
      serializeAstmRecords(parseAstmRecords(SOURCE), {
        field: "*",
        repeat: "~",
        component: ":",
        escape: "#",
      }),
    ).toBe(
      "H*~:#\r" +
        "P*1**LAB-0001*PRAC-0001*O&BRIEN:JANE**19800101*F\r" +
        "R*1*:::GLU*28.6*U^E^L**N**F\r" +
        "L*1*N\r",
    );
  });

  it("emits a set whose ESCAPE character is the `F` mnemonic itself", () => {
    // escape = `F`, so a literal `F` is written `FEF`: the result status `F` becomes
    // `FEF`, and the units `U^E^L` become `UFSFEFSFL`.
    expect(
      serializeAstmRecords(parseAstmRecords(SOURCE), {
        field: "|",
        repeat: "\\",
        component: "^",
        escape: "F",
      }),
    ).toBe(
      "H|\\^F\r" +
        "P|1||LAB-0001|PRAC-0001|O&BRIEN^JANE||19800101|FEF\r" +
        "R|1|^^^GLU|28.6|UFSFEFSFL||N||FEF\r" +
        "L|1|N\r",
    );
  });
});
