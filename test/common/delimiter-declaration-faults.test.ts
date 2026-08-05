/**
 * A header that cannot declare a delimiter set is refused for a named reason, and "too short" is no
 * longer said of headers that are not short.
 *
 * `readDelimiters` had four ways to fail and one message described all of them. Three were fine; the
 * fourth was not. `H||^&` is a full-length header whose delimiter-definition field is empty because
 * its own field separator ends the definition where it begins, and it reported "Header record is too
 * short to declare the four delimiters", which sent a reader counting characters instead of looking
 * at the declaration. The fatal **code** is unchanged (`ASTM_RECORD_UNDECLARED_DELIMITERS`): a
 * consumer switching on it sees exactly what it saw before, and no stream's disposition moved. What
 * changed is the sentence a human reads.
 *
 * **The field-separator-reused branch is unreachable and stays.** A field separator occurring in the
 * definition positions sits at index 2, 3 or 4, so it ends the definition where it appears and the
 * truncation rule answers first, every time. The sweep below measures that rather than asserting it,
 * against the alphabet constant in this file. The branch is the statement of an invariant the
 * truncation rule currently enforces on its behalf, and the two are not the same rule: deleting it
 * would leave the invariant unstated and a change to how the definition field is bounded silent.
 *
 * All fixtures are **synthetic**, and no clause of ASTM E1394 / CLSI LIS01 / LIS02 is claimed: the
 * shape of the declaration is read out of this package's own reader.
 */

import { describe, expect, it } from "vitest";

import {
  AstmParseError,
  FATAL_CODES,
  parseAstmRecords,
  readDelimiterDeclaration,
  readDelimiters,
} from "../../src/index.js";

/**
 * The committed corpus alphabet for the field separator in the unreachability sweep: the three
 * non-field roles of the canonical set, its escape role, and eight characters that are not
 * delimiters at all. Each is placed in each of the three definition positions.
 */
const FIELD_SEPARATOR_ALPHABET = [
  "|",
  "\\",
  "^",
  "&",
  "~",
  ":",
  "#",
  "*",
  "!",
  "@",
  "$",
  "%",
] as const;

/** The three positions of the delimiter definition: repeat, component, escape. */
const DEFINITION_POSITIONS = [0, 1, 2] as const;

const faultOf = (header: string): string => {
  const result = readDelimiterDeclaration(header);
  return result.ok ? "ok" : result.fault;
};

const fatalMessage = (raw: string): string => {
  try {
    parseAstmRecords(raw);
  } catch (err) {
    if (err instanceof AstmParseError) {
      expect(err.code).toBe(FATAL_CODES.ASTM_RECORD_UNDECLARED_DELIMITERS);
      return err.message;
    }
    throw err;
  }
  throw new Error("expected a fatal");
};

describe("the reason a declaration could not be read", () => {
  it("names the four conditions apart", () => {
    expect(faultOf("H|\\^&")).toBe("ok");
    expect(faultOf("H|\\^")).toBe("record-too-short");
    expect(faultOf("H|")).toBe("record-too-short");
    expect(faultOf("X|\\^&")).toBe("not-a-header");
    expect(faultOf("H||^&")).toBe("definition-truncated");
    // The type letter is asked BEFORE the length, and this is the assertion that pins it: under the
    // other order every record below comes back "too short", which is a `P` record reported as a
    // short header. That is the same wrong-reason class this whole file exists to close, so it is
    // pinned rather than left to a comment. `X|\^&` above passes under either order.
    expect(faultOf("P|1")).toBe("not-a-header");
    expect(faultOf("")).toBe("not-a-header");
    expect(faultOf("XY")).toBe("not-a-header");
    // A header long enough, with a definition ending one character early at its next separator.
    expect(faultOf("H|\\^|sender")).toBe("definition-truncated");
  });

  it("stops calling a full-length header short", () => {
    const message = fatalMessage("H||^&\rP|1||LAB-0001\rL|1|N\r");
    expect(message).not.toMatch(/too short/iu);
    expect(message).toMatch(/fewer than three/iu);
    // Still true of a header that genuinely is short.
    expect(fatalMessage("H|\\^\rP|1||LAB-0001\rL|1|N\r")).toMatch(/too short/iu);
  });

  it("names no byte off the wire in any of its messages", () => {
    // The one error message in this package that quotes a value is the frame layer's start-frame
    // number, which is the caller's own option. A header's bytes are stream content.
    for (const raw of ["H||^&\rL|1|N\r", "H|\\^\rL|1|N\r"]) {
      expect(fatalMessage(raw)).not.toMatch(/[|^&\\]/u);
    }
  });

  it("keeps the shorthand reader answering exactly as it did", () => {
    expect(readDelimiters("H|\\^&")).toEqual({
      field: "|",
      repeat: "\\",
      component: "^",
      escape: "&",
    });
    for (const header of ["H||^&", "H|\\^", "H|", "X|\\^&", "", "P|1"]) {
      expect(readDelimiters(header)).toBeUndefined();
    }
  });
});

describe("the unreachable branch, measured rather than asserted", () => {
  it("classifies every field-separator collision as a truncated definition, not as a reuse", () => {
    const faults = new Map<string, number>();
    let headers = 0;
    for (const separator of FIELD_SEPARATOR_ALPHABET) {
      for (const position of DEFINITION_POSITIONS) {
        const definition = ["a", "b", "c"];
        definition[position] = separator;
        // "H", the field separator, a three-character definition holding it again, then data.
        const header = `H${separator}${definition.join("")}${separator}sender`;
        headers += 1;
        const fault = faultOf(header);
        faults.set(fault, (faults.get(fault) ?? 0) + 1);
      }
    }
    // Derived from the constants above: twelve separators in three positions each.
    expect(headers).toBe(FIELD_SEPARATOR_ALPHABET.length * DEFINITION_POSITIONS.length);
    expect(faults.get("definition-truncated")).toBe(headers);
    expect(faults.get("field-separator-reused")).toBeUndefined();
    // The outcome is right in every one of them: such a declaration does not resolve at all.
    expect(faults.get("ok")).toBeUndefined();
  });
});
