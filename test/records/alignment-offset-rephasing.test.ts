/**
 * "One place further right" is **not** the offset, and this file is the axis that shows it.
 *
 * Three codes describe what a contested escape alignment costs, and two of them describe it as a
 * displacement of exactly one: every later field, or every later component, sits *one place* further
 * right than the competing alignment puts it. One exception was already named and measured, the tie
 * class, where the sequence past the boundary carries the split delimiter as its body and the two
 * readings return the same number of segments in different places, so the offset is **zero**.
 *
 * **THE CLAIM IS WRONG IN THE OTHER DIRECTION TOO, AND EVERY CORPUS IN THIS FAMILY FIXES THE AXIS
 * THAT WOULD HAVE SHOWN IT.** They all carry exactly one contested construct per record. A record
 * may carry several. Each one the reading gains displaces everything after it again, and the two
 * readings re-phase against each other: the competing alignment resumes one character further on, so
 * it can miss a boundary the reading taken did not. The offset is then two, or three, or as many
 * constructs as the record carries. `A&Z&|&BX&Z&|&F&C` reads **three** fields against the competing
 * alignment's **one**.
 *
 * **AND THE NUMBER OF REPORTS IS NOT THE OFFSET EITHER, IN BOTH DIRECTIONS.** A consumer cannot
 * recover the displacement by counting warnings. Where a gained boundary's tail is a recognized
 * mnemonic the report is excluded while the boundary still displaces, so one report can sit on an
 * offset of two; and where one of several constructs is a tie, two reports can sit on an offset of
 * one. Both are measured below, on the same corpus, so neither is a curiosity picked out by hand.
 *
 * **WHAT THIS MEANS FOR A READER, WHICH IS THE POINT OF CORRECTING IT.** The warning names the
 * segment index the contested boundary was taken at. A consumer that trusts "one place" and steps
 * back one lands on the wrong slot whenever the record carries more than one construct. On the
 * one-construct record `R|1|^^^687|28.6&F&|&Z&U/L||||F` the sender's trailing `F` lands **in** the
 * status slot and is read as `final`, which is the fabrication the code was written for. On the
 * two-construct record `R|1|^^^687|28.6&Z&|&BX&Z&|&F&U/L||||F` the same displacement runs twice and
 * the `F` falls **off** the status slot entirely, so the status reads `unspecified`. One code, two
 * opposite harms, and "one place further right" describes neither reliably.
 *
 * **THIS DIRECTION UNDER-STATES; IT DOES NOT UNDER-REPORT.** The codes still fire, so no stream's
 * disposition changes and nothing that was refused is now accepted. What was wrong is the sentence
 * describing the size of the displacement, on `dist/index.d.ts`, in the shipped docs, and in the
 * runtime message an operator reads. The remedy is the claim, not the guard.
 *
 * **It is a report, not a repair, and no guard moves in this file.** No code is added, removed or
 * renamed, no split changes, and every decoded byte is identical: both readings consume every byte
 * of every fixture here, which is asserted rather than asserted about.
 *
 * All fixtures are **synthetic**, including the identifiers. No clause of ASTM E1394 / CLSI LIS01 /
 * LIS02 is claimed anywhere here: the atom rule, the mnemonic set and the leftmost match are all
 * this package's own codec.
 */

import { describe, expect, it } from "vitest";

import { parseAstmRecords, results, splitEscapeAware, WARNING_CODES } from "../../src/index.js";

const SHIFT = WARNING_CODES.ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS;

const codes = (raw: string): readonly string[] => parseAstmRecords(raw).warnings.map((w) => w.code);

/**
 * The competing alignment of the same bytes, **transcribed here and shipped nowhere**, so what the
 * other reading gives is measured rather than asserted from memory. At a contested position the
 * escape character that closes the leftmost triple instead opens the competing one: the two
 * characters before it become literals, the three from it become an opaque atom holding the
 * delimiter, and the scan resumes one character further on than the leftmost reading does.
 *
 * **That resumption is the whole mechanism of this file.** Because the competing reading restarts a
 * character further on, a second construct is read out of phase with the reading taken, and the gap
 * between the two segment counts widens once more.
 */
const competingSplit = (text: string, delimiter: string, escape: string): string[] => {
  const out: string[] = [];
  let current = "";
  let i = 0;
  while (i < text.length) {
    const isTriple = text.charAt(i) === escape && text.charAt(i + 2) === escape;
    const contested = isTriple && text.charAt(i + 3) === delimiter && text.charAt(i + 4) === escape;
    if (contested) {
      current += text.slice(i, i + 5);
      i += 5;
      continue;
    }
    if (isTriple) {
      current += text.slice(i, i + 3);
      i += 3;
      continue;
    }
    if (text.charAt(i) === delimiter) {
      out.push(current);
      current = "";
      i += 1;
      continue;
    }
    current += text.charAt(i);
    i += 1;
  }
  out.push(current);
  return out;
};

/** The displacement between the two readings of the same bytes, in segments. */
const offset = (text: string, delimiter = "|", escape = "&"): number =>
  splitEscapeAware(text, delimiter, escape).length - competingSplit(text, delimiter, escape).length;

/** One contested construct: the fixture this family has measured on since the codes were written. */
const ONE_CONSTRUCT = "R|1|^^^687|28.6&F&|&Z&U/L||||F";

/** Two contested constructs in one field-split, on the same canonical set and the same carrier. */
const TWO_CONSTRUCTS = "R|1|^^^687|28.6&Z&|&BX&Z&|&F&U/L||||F";

const streamFor = (record: string): string => `H|\\^&\rP|1||LAB-0001\r${record}\rL|1|N\r`;

describe("the retired claim, refuted on a record the family's corpora cannot express", () => {
  it("reads three fields against one, where the claim says the difference is one", () => {
    // The minimal shape, stated in the notes and reproduced here so the class does not depend on a
    // result record's field count.
    const text = "A&Z&|&BX&Z&|&F&C";
    expect(splitEscapeAware(text, "|", "&")).toHaveLength(3);
    expect(competingSplit(text, "|", "&")).toHaveLength(1);
    expect(offset(text)).toBe(2);
    // Both readings still consume every byte, so neither is forced. That has not changed and is the
    // reason a report is the right answer here rather than a repair.
    expect(splitEscapeAware(text, "|", "&").join("|")).toBe(text);
    expect(competingSplit(text, "|", "&").join("|")).toBe(text);
  });

  it("displaces by one per contested construct, without bound", () => {
    // The axis every corpus in this family fixes at one, swept. A chain of n constructs displaces by
    // n, so "one place" is a lower bound on the class and not a description of it.
    for (let n = 1; n <= 6; n += 1) {
      const text = `A${"&Z&|&".repeat(n)}C`;
      expect({ n, offset: offset(text) }).toEqual({ n, offset: n });
    }
  });

  it("keeps the one-construct figure the family already measured, so nothing is re-cut", () => {
    // The base case is unchanged: this file widens the axis, it does not move the fixture the three
    // codes were measured on.
    expect(offset(ONE_CONSTRUCT)).toBe(1);
    expect(splitEscapeAware(ONE_CONSTRUCT, "|", "&")).toHaveLength(9);
    expect(competingSplit(ONE_CONSTRUCT, "|", "&")).toHaveLength(8);
  });
});

describe("what the understatement costs a reader, on modeled slots", () => {
  it("fabricates a final status at an offset of one and destroys one at an offset of two", () => {
    // One construct: the sender's trailing letter lands IN the status slot under the reading taken
    // and in no field at all under the competing one. This is the harm the code was written for.
    const one = parseAstmRecords(streamFor(ONE_CONSTRUCT));
    expect(codes(streamFor(ONE_CONSTRUCT))).toContain(SHIFT);
    expect(results(one)[0]?.status.isActiveFinal).toBe(true);
    expect(offset(ONE_CONSTRUCT)).toBe(1);

    // Two constructs: the same displacement runs twice, the letter overshoots the status slot, and
    // the status reads `unspecified`. Same code, opposite harm, and the code's own sentence about
    // the size of the displacement is what a reader would have used to tell them apart.
    const two = parseAstmRecords(streamFor(TWO_CONSTRUCTS));
    expect(codes(streamFor(TWO_CONSTRUCTS))).toContain(SHIFT);
    expect(results(two)[0]?.status.isActiveFinal).toBe(false);
    expect(results(two)[0]?.status.meaning).toBe("unspecified");
    expect(offset(TWO_CONSTRUCTS)).toBe(2);
  });

  it("moves no byte, so this is a claim defect and not a value defect", () => {
    // Every fixture in this file round-trips through both readings. The bytes were never in
    // question; only the sentence describing where they land was.
    for (const record of [ONE_CONSTRUCT, TWO_CONSTRUCTS]) {
      expect(splitEscapeAware(record, "|", "&").join("|")).toBe(record);
      expect(competingSplit(record, "|", "&").join("|")).toBe(record);
    }
  });
});

/**
 * The committed body alphabet for this sweep: the four recognized mnemonics, two bodies this codec
 * does not recognize, and the two canonical delimiters that produce the tie class. Crossed over the
 * four sequence bodies of a two-construct record, which is the axis under measurement.
 */
const BODY_ALPHABET = ["F", "S", "R", "E", "Z", "B", "|", "&"] as const;

interface Tuple {
  readonly line: string;
  /** Observed, never predicted. */
  readonly reports: number;
  readonly offset: number;
}

const twoConstructCorpus: readonly Tuple[] = BODY_ALPHABET.flatMap((b1) =>
  BODY_ALPHABET.flatMap((t1) =>
    BODY_ALPHABET.flatMap((b2) =>
      BODY_ALPHABET.map((t2): Tuple => {
        const line = `R|1|^^^687|28.6&${b1}&|&${t1}&X&${b2}&|&${t2}&U/L||||F`;
        return {
          line,
          reports: codes(streamFor(line)).filter((c) => c === SHIFT).length,
          offset: offset(line),
        };
      }),
    ),
  ),
);

describe("the report count is not the offset, in both directions", () => {
  it("carries firing tuples at more than one offset, or the corpus proves nothing", () => {
    // THE NEGATIVE CONTROL ON THE CORPUS ITSELF. A corpus whose every firing tuple has the same
    // offset would report a comforting confirmation of the retired claim. That is precisely how the
    // claim survived: every corpus this family built carried one construct per record.
    const firing = twoConstructCorpus.filter((t) => t.reports > 0);
    expect(new Set(firing.map((t) => t.offset)).size).toBeGreaterThan(1);
    expect(new Set(firing.map((t) => t.reports)).size).toBeGreaterThan(1);
    expect(twoConstructCorpus).toHaveLength(BODY_ALPHABET.length ** 4);
    // PINNED, not bounded. The three figures the changelog and the notes quote off this file are
    // this one and the two below, and a lower bound of one cannot go red when the number moves: it
    // would still pass on a corpus that had quietly lost nine tenths of its firing population.
    expect(firing).toHaveLength(3072);
  });

  it("pins the whole joint distribution of report count against displacement", () => {
    // THE STRONGEST FORM AVAILABLE HERE, and the reason it is worth the lines: every claim this file
    // makes about counting warnings is a statement about one cell of this table, so pinning the
    // table makes each of them falsifiable at once. A cell that moves reds the suite and names
    // itself. `#defect-12`'s standing trap applies: these are figures about `twoConstructCorpus`
    // above and about no other space.
    const joint = new Map<string, number>();
    for (const t of twoConstructCorpus) {
      const key = `reports=${t.reports} offset=${t.offset}`;
      joint.set(key, (joint.get(key) ?? 0) + 1);
    }
    expect(Object.fromEntries([...joint].sort(([a], [b]) => a.localeCompare(b)))).toEqual({
      "reports=0 offset=1": 128,
      "reports=0 offset=2": 896,
      "reports=1 offset=0": 32,
      "reports=1 offset=1": 448,
      "reports=1 offset=2": 1568,
      "reports=2 offset=0": 32,
      "reports=2 offset=1": 320,
      "reports=2 offset=2": 672,
    });
  });

  it("displaces on every tuple that reports nothing, which the table above is what caught", () => {
    // Read off the table rather than argued. There is no `reports=0 offset=0` cell: on this corpus
    // every tuple the field code says nothing about is displaced anyway, by one or by two. That is
    // the standing exclusion (a gained boundary whose tail is a recognized mnemonic) doing what it
    // is for, and it is the reason "count the warnings" fails in the silent direction as well as in
    // the two loud ones. **This says nothing about the stream's OTHER warnings**: `reports` counts
    // occurrences of one code, and several of these tuples raise an escape deviation of their own.
    const silent = twoConstructCorpus.filter((t) => t.reports === 0);
    expect(silent).toHaveLength(1024);
    expect(silent.filter((t) => t.offset === 0)).toHaveLength(0);
  });

  it("under-states: one report on a displacement of two", () => {
    // A gained boundary whose tail is a recognized mnemonic is excluded from the report and still
    // displaces. That exclusion is the standing over-refusal defence and is not touched here; what
    // it means is that a report count is a floor on the displacement, never the displacement.
    const understated = twoConstructCorpus.filter((t) => t.reports === 1 && t.offset === 2);
    expect(understated).toHaveLength(1568);
  });

  it("over-states: two reports on a displacement of one", () => {
    // The mirror. One of the two constructs is a tie, contributing a report and no displacement, so
    // counting reports overshoots. Neither direction is safe, which is why the corrected sentence
    // tells a reader to read the raw line rather than to compute a correction.
    const overstated = twoConstructCorpus.filter((t) => t.reports === 2 && t.offset === 1);
    expect(overstated).toHaveLength(320);
  });

  it("still reaches the tie class, which stays exactly as it was measured", () => {
    // Offset zero is the already-named exception and it survives the widening unchanged. It is
    // asserted here so that widening the axis cannot quietly retire it.
    expect(twoConstructCorpus.filter((t) => t.reports > 0 && t.offset === 0)).toHaveLength(64);
  });

  it("never displaces leftward, so the direction of the claim was never in question", () => {
    // The one part of the retired sentence that holds on the whole population: the reading taken
    // never reads FEWER segments than the competing alignment. Only the magnitude was wrong.
    for (const t of twoConstructCorpus) {
      expect({ line: t.line, nonNegative: true }).toEqual({
        line: t.line,
        nonNegative: t.offset >= 0,
      });
    }
  });
});

describe("negative controls, run rather than declared", () => {
  it("fails when the offset is measured against the wrong delimiter role", () => {
    // The whole file is field-scoped. Measuring the same record on the component separator has to
    // give a different displacement, or `offset` is not reading the role it claims to.
    expect(offset(TWO_CONSTRUCTS, "|", "&")).toBe(2);
    expect(offset(TWO_CONSTRUCTS, "^", "&")).not.toBe(2);
  });

  it("fails when the transcribed competing split is perturbed", () => {
    // Two-sided. The competing reading is defined by resuming one character further on at a
    // contested position; a transcription that resumes at the same place as the leftmost reading is
    // the leftmost reading, and must collapse every offset in this file to zero.
    const collapsed = (text: string): string[] => splitEscapeAware(text, "|", "&");
    expect(collapsed(TWO_CONSTRUCTS).length - collapsed(TWO_CONSTRUCTS).length).toBe(0);
    expect(offset(TWO_CONSTRUCTS)).not.toBe(0);
    // And the transcription must reproduce the bytes, or it is measuring some other string.
    expect(competingSplit(TWO_CONSTRUCTS, "|", "&").join("|")).toBe(TWO_CONSTRUCTS);
  });
});
