import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ALL_ASTM_WARNING_CODES,
  AstmProfileDefinitionError,
  AstmStrictError,
  FRAME_WARNING_CODES,
  LTP_WARNING_CODES,
  SAFETY_CRITICAL_CODES,
  TOLERABLE_CODES,
  WARNING_CODES,
  applyAstmProfile,
  applyAstmProfileToWarnings,
  astmProfiles,
  defineAstmProfile,
  detectFraming,
  getAstmProfile,
  getDefaultAstmProfile,
  isSafetyCriticalCode,
  listAstmProfiles,
  parseAstmRecords,
  resolveProfileTransport,
  setDefaultAstmProfile,
  unknownEscapeSequence,
  unknownRecordType,
  type AstmProfile,
  type AstmRecordWarning,
} from "../../src/index.js";

/**
 * Phase-8 coverage: the vendor-profile engine — `defineAstmProfile`, the
 * definition-time safety gate, the quirk-tolerance transform, the registry, the
 * transport override, and the built-ins. The load-bearing claims: a profile can
 * NEVER tolerate a safety-critical deviation, and a tolerated deviation is
 * downgraded (never dropped, and the extracted value is never altered).
 */

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), "latin1");
const ESCAPE_FIXTURE = "tier2-profile-unknown-escape.astm";

afterEach(() => {
  // Only mutable module-scoped state in the subsystem — clear it so no default bleeds.
  setDefaultAstmProfile(null);
});

describe("defineAstmProfile — construction & shape", () => {
  it("builds a frozen profile with lineage = [name] and an attached describe()", () => {
    const p = defineAstmProfile({ name: "acme", description: "Acme inbound" });
    expect(p.name).toBe("acme");
    expect(p.lineage).toEqual(["acme"]);
    expect(p.tolerate).toEqual([]);
    expect(Object.isFrozen(p)).toBe(true);
    const text = p.describe?.() ?? "";
    expect(text).toContain("Profile 'acme'");
    expect(text).toContain("tolerates: nothing");
  });

  it("carries a transport override and renders it in describe()", () => {
    const p = defineAstmProfile({ name: "raw-analyzer", transport: "raw" });
    expect(p.transport).toBe("raw");
    expect(p.describe?.()).toContain("forces raw framing");
  });

  it("renders tolerated quirks (with structural scope) and provenance in describe()", () => {
    const p = defineAstmProfile({
      name: "x",
      provenance: { source: "src", reference: "ref" },
      tolerate: [
        {
          code: "ASTM_UNKNOWN_ESCAPE_SEQUENCE",
          rationale: "vendor house escape",
          match: { recordType: "R", fieldIndex: 5 },
        },
      ],
    });
    const text = p.describe?.() ?? "";
    expect(text).toContain("grounded in: src (ref)");
    expect(text).toContain("tolerates 1 quirk(s):");
    expect(text).toContain("@record R.5");
  });
});

describe("defineAstmProfile — extends composition", () => {
  it("merges lineage, tolerate (parent before self), transport, description, provenance", () => {
    const parent = defineAstmProfile({
      name: "base",
      description: "base desc",
      transport: "framed",
      provenance: { source: "base-src", reference: "base-ref" },
      tolerate: [{ code: "ASTM_RECORD_UNKNOWN_TYPE", rationale: "base vendor record" }],
    });
    const child = defineAstmProfile({
      name: "child",
      extends: parent,
      transport: "raw", // child wins
      tolerate: [{ code: "ASTM_NONSTANDARD_DELIMITERS", rationale: "child delimiters" }],
    });
    expect(child.lineage).toEqual(["base", "child"]);
    expect(child.transport).toBe("raw");
    expect(child.description).toBe("base desc"); // inherited (child omitted)
    expect(child.provenance?.source).toBe("base-src"); // inherited
    expect(child.tolerate.map((t) => t.code)).toEqual([
      "ASTM_RECORD_UNKNOWN_TYPE",
      "ASTM_NONSTANDARD_DELIMITERS",
    ]);
  });

  it("child refines a parent tolerance rationale for the same code+match (last-wins)", () => {
    const parent = defineAstmProfile({
      name: "p",
      tolerate: [{ code: "ASTM_RECORD_UNKNOWN_TYPE", rationale: "old" }],
    });
    const child = defineAstmProfile({
      name: "c",
      extends: [parent],
      tolerate: [{ code: "ASTM_RECORD_UNKNOWN_TYPE", rationale: "refined" }],
    });
    expect(child.tolerate).toHaveLength(1);
    expect(child.tolerate[0]?.rationale).toBe("refined");
  });
});

describe("defineAstmProfile — validation throws", () => {
  it("rejects missing/empty/non-string name", () => {
    // @ts-expect-error — deliberately invalid
    expect(() => defineAstmProfile(undefined)).toThrow(AstmProfileDefinitionError);
    // @ts-expect-error — deliberately invalid
    expect(() => defineAstmProfile({})).toThrow(AstmProfileDefinitionError);
    expect(() => defineAstmProfile({ name: "   " })).toThrow(AstmProfileDefinitionError);
  });

  it("rejects an unknown option key with a did-you-mean hint", () => {
    expect(() =>
      // @ts-expect-error — deliberately invalid key close to "tolerate"
      defineAstmProfile({ name: "x", tolerated: [] }),
    ).toThrow(/unknown option key 'tolerated'.*Did you mean 'tolerate'/su);
  });

  it("rejects an invalid transport value", () => {
    expect(() =>
      // @ts-expect-error — deliberately invalid transport
      defineAstmProfile({ name: "x", transport: "tcp" }),
    ).toThrow(/invalid 'transport'/u);
  });

  it("rejects an unknown warning code", () => {
    expect(() =>
      // @ts-expect-error — not a real code
      defineAstmProfile({ name: "x", tolerate: [{ code: "NOPE", rationale: "r" }] }),
    ).toThrow(/unknown warning code/u);
  });

  it("rejects an empty rationale", () => {
    expect(() =>
      defineAstmProfile({
        name: "x",
        tolerate: [{ code: "ASTM_RECORD_UNKNOWN_TYPE", rationale: "  " }],
      }),
    ).toThrow(/needs a non-empty 'rationale'/u);
  });

  it("re-validates a merged tolerate set — a rogue hand-crafted parent cannot smuggle a code", () => {
    const rogue = {
      name: "rogue",
      lineage: ["rogue"],
      tolerate: [{ code: WARNING_CODES.ASTM_RECORD_UNDEFINED_RESULT_STATUS, rationale: "x" }],
    } as unknown as AstmProfile;
    expect(() => defineAstmProfile({ name: "child", extends: rogue })).toThrow(
      AstmProfileDefinitionError,
    );
  });
});

describe("the safety gate — a profile can never tolerate a safety-critical deviation", () => {
  const safetyExamples: readonly string[] = [
    WARNING_CODES.ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT,
    WARNING_CODES.ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG,
    WARNING_CODES.ASTM_RECORD_UNDEFINED_RESULT_STATUS,
    WARNING_CODES.ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE,
    WARNING_CODES.ASTM_RECORD_UNITS_ABSENT,
    WARNING_CODES.ASTM_RECORD_ORPHAN_COMMENT,
    WARNING_CODES.ASTM_RECORD_PARTIAL_TIMESTAMP,
    WARNING_CODES.ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND,
    WARNING_CODES.PROFILE_QUIRK_APPLIED,
    FRAME_WARNING_CODES.ASTM_FRAME_BAD_CHECKSUM,
    FRAME_WARNING_CODES.ASTM_FRAME_SEQUENCE_GAP,
    FRAME_WARNING_CODES.ASTM_FRAME_UNTERMINATED,
    FRAME_WARNING_CODES.ASTM_FRAME_OVERSIZE,
    LTP_WARNING_CODES.ASTM_LTP_AMBIGUOUS_TRANSPORT,
    LTP_WARNING_CODES.ASTM_LTP_UNEXPECTED_EVENT,
    LTP_WARNING_CODES.ASTM_LTP_FRAME_REJECTED,
  ];

  it.each(safetyExamples)("refuses to tolerate %s at definition time", (code) => {
    expect(() =>
      defineAstmProfile({
        name: "unsafe",
        // @ts-expect-error — the union permits the code; the gate refuses it at runtime
        tolerate: [{ code, rationale: "should be refused" }],
      }),
    ).toThrow(/safety-critical/u);
  });

  it("cannot make a bad checksum 'ok' — the exact roadmap example", () => {
    expect(() =>
      defineAstmProfile({
        name: "bad",
        tolerate: [{ code: FRAME_WARNING_CODES.ASTM_FRAME_BAD_CHECKSUM, rationale: "no" }],
      }),
    ).toThrow(AstmProfileDefinitionError);
  });

  it("the tolerable allow-list and the safety set partition every known code (complete + disjoint)", () => {
    for (const code of ALL_ASTM_WARNING_CODES) {
      const tolerable = TOLERABLE_CODES.has(code);
      const critical = SAFETY_CRITICAL_CODES.has(code);
      expect(tolerable !== critical).toBe(true); // exactly one is true
      expect(isSafetyCriticalCode(code)).toBe(critical);
    }
    // The only four tolerable codes are the benign, value-preserving ones.
    expect([...TOLERABLE_CODES].sort()).toEqual(
      [
        WARNING_CODES.ASTM_NONSTANDARD_DELIMITERS,
        WARNING_CODES.ASTM_RECORD_UNINTERPRETED_QUERY_STATUS,
        WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE,
        WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
      ].sort(),
    );
  });

  it("every frame and LTP code is safety-critical (byte/protocol integrity is never tolerable)", () => {
    for (const c of Object.values(FRAME_WARNING_CODES)) expect(isSafetyCriticalCode(c)).toBe(true);
    for (const c of Object.values(LTP_WARNING_CODES)) expect(isSafetyCriticalCode(c)).toBe(true);
  });
});

describe("the tolerance transform — downgrade, never drop or alter", () => {
  const profile = defineAstmProfile({
    name: "t",
    tolerate: [{ code: "ASTM_UNKNOWN_ESCAPE_SEQUENCE", rationale: "vendor escape" }],
  });

  it("re-badges a tolerated warning to PROFILE_QUIRK_APPLIED with the original preserved", () => {
    const w = unknownEscapeSequence({ recordIndex: 4, recordType: "R", fieldIndex: 5 });
    const out = applyAstmProfile(profile, w);
    expect(out.code).toBe(WARNING_CODES.PROFILE_QUIRK_APPLIED);
    expect(out.expected).toBe(true);
    expect(out.profile).toBe("t");
    expect(out.toleratedCode).toBe(WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE);
    expect(out.position).toEqual(w.position); // position preserved, PHI-free
  });

  it("passes an untolerated warning through by identity", () => {
    const w = unknownRecordType({ recordIndex: 2, recordType: "Z" });
    expect(applyAstmProfile(profile, w)).toBe(w);
  });

  it("does not re-badge an already-expected warning", () => {
    const already: AstmRecordWarning = {
      code: WARNING_CODES.PROFILE_QUIRK_APPLIED,
      message: "x",
      position: { recordIndex: 0 },
      expected: true,
    };
    expect(applyAstmProfile(profile, already)).toBe(already);
  });

  it("honors structural match narrowing (recordType + fieldIndex)", () => {
    const scoped = defineAstmProfile({
      name: "scoped",
      tolerate: [
        {
          code: "ASTM_UNKNOWN_ESCAPE_SEQUENCE",
          rationale: "only in R.5",
          match: { recordType: "R", fieldIndex: 5 },
        },
      ],
    });
    const inScope = unknownEscapeSequence({ recordIndex: 4, recordType: "R", fieldIndex: 5 });
    const outOfScope = unknownEscapeSequence({ recordIndex: 3, recordType: "C", fieldIndex: 4 });
    expect(applyAstmProfile(scoped, inScope).code).toBe(WARNING_CODES.PROFILE_QUIRK_APPLIED);
    expect(applyAstmProfile(scoped, outOfScope)).toBe(outOfScope);
  });

  it("applyAstmProfileToWarnings returns a NEW array and never mutates the input", () => {
    const input: AstmRecordWarning[] = [
      unknownEscapeSequence({ recordIndex: 1, recordType: "R", fieldIndex: 5 }),
      unknownRecordType({ recordIndex: 2, recordType: "Z" }),
    ];
    const snapshot = input.map((w) => w.code);
    const out = applyAstmProfileToWarnings(input, profile);
    expect(out).not.toBe(input);
    expect(input.map((w) => w.code)).toEqual(snapshot); // input untouched
    expect(out).toHaveLength(input.length); // nothing dropped
    expect(out[0]?.code).toBe(WARNING_CODES.PROFILE_QUIRK_APPLIED);
    expect(out[1]?.code).toBe(WARNING_CODES.ASTM_RECORD_UNKNOWN_TYPE);
  });

  it("no profile → a shallow copy with every warning intact", () => {
    const input = [unknownRecordType({ recordIndex: 2, recordType: "Z" })];
    const out = applyAstmProfileToWarnings(input, undefined);
    expect(out).not.toBe(input);
    expect(out).toEqual(input);
  });
});

describe("registry & transport accessor", () => {
  it("lists and looks up the built-ins", () => {
    expect(listAstmProfiles()).toEqual(["default", "referenceCorpus"]);
    expect(getAstmProfile("referenceCorpus")).toBe(astmProfiles.referenceCorpus);
    expect(getAstmProfile("nope")).toBeUndefined();
  });

  it("set/get the process default and clear it", () => {
    expect(getDefaultAstmProfile()).toBeUndefined();
    setDefaultAstmProfile(astmProfiles.referenceCorpus);
    expect(getDefaultAstmProfile()).toBe(astmProfiles.referenceCorpus);
    setDefaultAstmProfile(null);
    expect(getDefaultAstmProfile()).toBeUndefined();
  });

  it("resolveProfileTransport returns the override or undefined", () => {
    expect(resolveProfileTransport(undefined)).toBeUndefined();
    expect(resolveProfileTransport(astmProfiles.default)).toBeUndefined();
    expect(resolveProfileTransport(defineAstmProfile({ name: "r", transport: "raw" }))).toBe("raw");
  });
});

describe("built-ins", () => {
  it("default tolerates nothing and forces no transport", () => {
    expect(astmProfiles.default.tolerate).toEqual([]);
    expect(astmProfiles.default.transport).toBeUndefined();
  });

  it("referenceCorpus tolerates exactly the unknown-escape noise, with firsthand provenance", () => {
    expect(astmProfiles.referenceCorpus.tolerate.map((t) => t.code)).toEqual([
      WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE,
    ]);
    expect(astmProfiles.referenceCorpus.provenance?.reference).toContain("python-astm");
  });
});

describe("integration with parseAstmRecords", () => {
  it("without a profile: the unknown-escape deviation is a bare warning", () => {
    const msg = parseAstmRecords(fixture(ESCAPE_FIXTURE));
    expect(msg.warnings.map((w) => w.code)).toContain(WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE);
    expect(msg.profile).toBeUndefined();
  });

  it("with referenceCorpus: it is downgraded to PROFILE_QUIRK_APPLIED, and the VALUE is unchanged", () => {
    const bare = parseAstmRecords(fixture(ESCAPE_FIXTURE));
    const withProfile = parseAstmRecords(fixture(ESCAPE_FIXTURE), {
      profile: astmProfiles.referenceCorpus,
    });

    const quirk = withProfile.warnings.find((w) => w.code === WARNING_CODES.PROFILE_QUIRK_APPLIED);
    expect(quirk?.expected).toBe(true);
    expect(quirk?.toleratedCode).toBe(WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE);
    // No bare unknown-escape warning remains.
    expect(
      withProfile.warnings.some((w) => w.code === WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE),
    ).toBe(false);
    // Warning count preserved (downgraded, not dropped).
    expect(withProfile.warnings).toHaveLength(bare.warnings.length);
    // The extracted records/values are byte-identical with and without the profile.
    expect(withProfile.records).toEqual(bare.records);
    expect(withProfile.profile).toEqual({
      name: "referenceCorpus",
      lineage: ["referenceCorpus"],
    });
  });

  it("strict mode: an expected quirk does NOT throw; the same deviation without a profile DOES", () => {
    expect(() => parseAstmRecords(fixture(ESCAPE_FIXTURE), { strict: true })).toThrow(
      AstmStrictError,
    );
    expect(() =>
      parseAstmRecords(fixture(ESCAPE_FIXTURE), {
        strict: true,
        profile: astmProfiles.referenceCorpus,
      }),
    ).not.toThrow();
  });

  it("the process default applies, and { profile: null } opts out of it", () => {
    setDefaultAstmProfile(astmProfiles.referenceCorpus);
    const viaDefault = parseAstmRecords(fixture(ESCAPE_FIXTURE));
    expect(viaDefault.warnings.some((w) => w.code === WARNING_CODES.PROFILE_QUIRK_APPLIED)).toBe(
      true,
    );
    const optOut = parseAstmRecords(fixture(ESCAPE_FIXTURE), { profile: null });
    expect(optOut.warnings.some((w) => w.code === WARNING_CODES.ASTM_UNKNOWN_ESCAPE_SEQUENCE)).toBe(
      true,
    );
    expect(optOut.profile).toBeUndefined();
  });
});

describe("transport override — the raw-vs-framed knob a profile carries", () => {
  it("forces raw framing for a stream whose leading byte would auto-detect framed", () => {
    const rawProfile = defineAstmProfile({ name: "raw-analyzer", transport: "raw" });
    // 0x02 = STX → would auto-detect "framed"; the override forces "raw" with no warning.
    const bytes = new Uint8Array([0x02, 0x48]);
    const override = resolveProfileTransport(rawProfile);
    const detected = detectFraming(bytes, override !== undefined ? { override } : {});
    expect(detected.framing).toBe("raw");
    expect(detected.warnings).toHaveLength(0);
  });
});

describe("edge branches — describe scopes, merge inheritance, match narrowing, hint", () => {
  it("describe() renders a field-only scope and a record-only scope", () => {
    const fieldOnly = defineAstmProfile({
      name: "f",
      tolerate: [
        { code: "ASTM_UNKNOWN_ESCAPE_SEQUENCE", rationale: "r", match: { fieldIndex: 5 } },
      ],
    });
    expect(fieldOnly.describe?.()).toContain("@field 5");

    const recordOnly = defineAstmProfile({
      name: "rec",
      tolerate: [{ code: "ASTM_RECORD_UNKNOWN_TYPE", rationale: "r", match: { recordType: "Z" } }],
    });
    const text = recordOnly.describe?.() ?? "";
    expect(text).toContain("@record Z");
    expect(text).not.toContain("@record Z.");
  });

  it("a scoped tolerance does not apply when the field index differs", () => {
    const scoped = defineAstmProfile({
      name: "sc",
      tolerate: [
        { code: "ASTM_UNKNOWN_ESCAPE_SEQUENCE", rationale: "R.5 only", match: { fieldIndex: 5 } },
      ],
    });
    const wrongField = unknownEscapeSequence({ recordIndex: 4, recordType: "R", fieldIndex: 6 });
    expect(applyAstmProfile(scoped, wrongField)).toBe(wrongField);
  });

  it("merge uses [parent.name] when a parent has an empty lineage, and inherits transport", () => {
    const emptyLineageParent = {
      name: "legacy",
      lineage: [],
      tolerate: [],
      transport: "framed",
    } as unknown as AstmProfile;
    const child = defineAstmProfile({ name: "c", extends: emptyLineageParent });
    expect(child.lineage).toEqual(["legacy", "c"]);
    expect(child.transport).toBe("framed"); // inherited from the parent
  });

  it("an unknown option key far from every known key throws with no did-you-mean hint", () => {
    let message = "";
    try {
      // @ts-expect-error — deliberately far-from-known key
      defineAstmProfile({ name: "x", zzzzzzzz: true });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/unknown option key 'zzzzzzzz'/u);
    expect(message).not.toMatch(/Did you mean/u);
  });
});
