import { describe, expect, it } from "vitest";

import {
  AstmProfileDefinitionError,
  defineAstmProfile,
  type DefineAstmProfileOptions,
} from "../../src/index.js";

/**
 * What `defineAstmProfile` says when it refuses a definition. The message is the only thing that
 * tells a person which part of a profile literal is wrong (one class covers every refusal), so each
 * refusal is pinned to its whole text and to the profile name it carries, not only to the class.
 */

/** The error a definition throws, or a failure when it does not throw one of ours. */
function refusal(opts: unknown): AstmProfileDefinitionError {
  try {
    defineAstmProfile(opts as DefineAstmProfileOptions);
  } catch (err) {
    expect(err).toBeInstanceOf(AstmProfileDefinitionError);
    return err as AstmProfileDefinitionError;
  }
  return expect.unreachable("the definition was accepted");
}

const KNOWN_KEYS = "Known keys: name, description, tolerate, transport, provenance, extends.";

describe("a definition with no usable name", () => {
  it.each([
    [null, "null"],
    [undefined, "undefined"],
  ])("refuses %s options with a message naming what it received", (opts, shown) => {
    const err = refusal(opts);
    expect(err.message).toBe(
      `defineAstmProfile: options is required and must be an object. Received: ${shown}.`,
    );
    expect(err.profileName).toBeUndefined();
  });

  it("refuses a name that is not a string, and shows the value it got", () => {
    const err = refusal({ name: 42 });
    expect(err.message).toBe(
      "defineAstmProfile: 'name' is required and must be a non-empty string. Received: 42.",
    );
    expect(err.profileName).toBeUndefined();
  });

  it("refuses a name of white space, and shows it quoted", () => {
    const err = refusal({ name: "  " });
    expect(err.message).toBe(
      "defineAstmProfile: 'name' is required and must be a non-empty string. " + 'Received: "  ".',
    );
    expect(err.profileName).toBe("  ");
  });
});

describe("an unknown option key", () => {
  it.each([
    // Two edits from a known key: the hint names it.
    ["nmae", "name"],
    ["tolerat", "tolerate"],
    ["transprot", "transport"],
    ["extnds", "extends"],
    ["descriptoin", "description"],
  ])("offers a hint for %s, two edits or fewer from %s", (key, hint) => {
    const err = refusal({ name: "synthetic-vendor", [key]: true });
    expect(err.message).toBe(
      `Profile 'synthetic-vendor' has unknown option key '${key}'. Did you mean '${hint}'? ${KNOWN_KEYS}`,
    );
    expect(err.profileName).toBe("synthetic-vendor");
  });

  it.each([
    // Three edits from `name`, two once its last letter is dropped: a distance that reads the key
    // one letter short offers `name`.
    "namqqq",
    // Three substitutions from `name` with the first letter kept.
    "nqqq",
    // Nothing like any key.
    "zzzzzzzzzz",
    // One letter, more than two edits from every key.
    "q",
    // The empty key is as far from each key as that key is long, and every key is longer than two.
    "",
  ])("offers no hint for %j, more than two edits from every key", (key) => {
    const err = refusal({ name: "synthetic-vendor", [key]: true });
    expect(err.message).toBe(
      `Profile 'synthetic-vendor' has unknown option key '${key}'. ${KNOWN_KEYS}`,
    );
  });
});

describe("an invalid transport", () => {
  it.each([
    ["serial", '"serial"'],
    ["", '""'],
    [7, "7"],
  ])("refuses %j and lists the two it accepts", (transport, shown) => {
    const err = refusal({ name: "synthetic-vendor", transport });
    expect(err.message).toBe(
      `Profile 'synthetic-vendor' has an invalid 'transport' ${shown}. It must be one of: framed, raw.`,
    );
    expect(err.profileName).toBe("synthetic-vendor");
  });

  it.each(["framed", "raw"] as const)("accepts %s", (transport) => {
    expect(defineAstmProfile({ name: "synthetic-vendor", transport }).transport).toBe(transport);
  });
});

describe("a tolerate entry", () => {
  it.each([
    ["ASTM_NOT_A_REAL_CODE", '"ASTM_NOT_A_REAL_CODE"'],
    [12, "12"],
  ])("refuses an unknown code %j as unknown, not as safety-critical", (code, shown) => {
    const err = refusal({
      name: "synthetic-vendor",
      tolerate: [{ code, rationale: "a synthetic quirk" }],
    });
    expect(err.message).toBe(
      `Profile 'synthetic-vendor' tolerate entry has unknown warning code ${shown}. ` +
        "Only real codes from the record / frame / LTP registries may be named.",
    );
    expect(err.profileName).toBe("synthetic-vendor");
  });

  it("refuses a safety-critical code with the whole reason", () => {
    const err = refusal({
      name: "synthetic-vendor",
      tolerate: [{ code: "ASTM_FRAME_BAD_CHECKSUM", rationale: "a synthetic quirk" }],
    });
    expect(err.message).toBe(
      "Profile 'synthetic-vendor' may not tolerate 'ASTM_FRAME_BAD_CHECKSUM': it is a " +
        "safety-critical warning code (a result value / flag / status / range / units, patient " +
        "or comment context, message-kind ambiguity, code system, an unrecognized record type, " +
        "or a frame / LTP integrity warning). A profile quiets benign structural noise, never a " +
        "deviation that could change a clinical reading, report a lost message boundary, or " +
        'corrupt the wire: it can never make a bad checksum "ok", a cancelled result read ' +
        '"final", or quiet the warning that says two messages were read as one.',
    );
  });

  it.each([
    ["an empty", ""],
    ["a white-space", " \t "],
    ["a missing", undefined],
  ])("refuses %s rationale on a tolerable code", (_label, rationale) => {
    const err = refusal({
      name: "synthetic-vendor",
      tolerate: [{ code: "ASTM_UNKNOWN_ESCAPE_SEQUENCE", rationale }],
    });
    expect(err.message).toBe(
      "Profile 'synthetic-vendor' tolerate entry for 'ASTM_UNKNOWN_ESCAPE_SEQUENCE' needs a " +
        "non-empty 'rationale' documenting the real, grounded deviation it expects.",
    );
    expect(err.profileName).toBe("synthetic-vendor");
  });
});
