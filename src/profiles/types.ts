/**
 * Public type surface for the `@cosyte/astm` vendor-profile subsystem. An
 * {@link AstmProfile} bundles a **named, provenance-backed set of expected
 * deviations** ("quirks") a class of real-world ASTM streams is known to carry,
 * plus an optional **transport override** (the raw-vs-framed-TCP knob). It mirrors
 * the sibling `@cosyte/hl7` `defineProfile` and `@cosyte/ccda` `defineCcdaProfile`
 * shape (`name` / `lineage` / `describe()` / `extends`-merge) but models ASTM's
 * quirks — a warning code the stream is expected to trip, and its framing reality —
 * rather than HL7 v2 Z-segments or C-CDA template deviations.
 *
 * A profile **never changes an extracted value**. It operates purely at the
 * warning layer (downgrading an *already-emitted*, non-safety-critical warning to
 * a {@link WARNING_CODES.PROFILE_QUIRK_APPLIED}) and at the transport-detection
 * layer (forcing framed/raw before a single byte is parsed). The two load-bearing
 * safety rules, enforced by `defineAstmProfile`:
 *
 * 1. **A profile can never tolerate a safety-critical warning code** — a result
 *    value, abnormal flag, result status, reference range, units, patient/comment
 *    context, message-kind ambiguity, code system, or any frame/LTP integrity
 *    warning (see `src/profiles/safety.ts`). Naming one is a *definition-time
 *    throw*, not a silent relaxation — so a profile can never make a bad checksum
 *    "ok" or a cancelled result read "final."
 * 2. **A tolerated deviation is downgraded, never dropped.** The parser still
 *    records it (re-coded {@link WARNING_CODES.PROFILE_QUIRK_APPLIED}, flagged
 *    `expected: true`, carrying the original `toleratedCode`) so nothing is
 *    silently hidden — Postel's Law with a receipt.
 */

import type { WarningCode } from "../common/warnings.js";
import type { FrameWarningCode } from "../frames/warnings.js";
import type { LtpWarningCode } from "../ltp/warnings.js";
import type { AstmFraming } from "../ltp/transport.js";

/**
 * Any warning code from any of the three registries — the record layer
 * (`ASTM_RECORD_*` / `ASTM_NONSTANDARD_DELIMITERS` / `ASTM_UNKNOWN_ESCAPE_SEQUENCE`),
 * the frame codec (`ASTM_FRAME_*`), or the LTP protocol layer (`ASTM_LTP_*`). A
 * {@link QuirkTolerance} may *name* any of them, but the safety gate refuses all
 * but the small, benign, record-layer subset — so the union exists mainly to let
 * the gate reject a frame/LTP code with a precise, typed message.
 */
export type AnyAstmWarningCode = WarningCode | FrameWarningCode | LtpWarningCode;

/**
 * Provenance for an {@link AstmProfile} — the **real, cited public artifact** a
 * profile's quirks are grounded in. A quirk is encoded only when a real
 * (de-identified) document or a redistributable reference corpus grounds it; this
 * record is where that grounding is stated, so a reviewer can trace every
 * tolerated deviation back to evidence rather than invention.
 *
 * @example
 * ```ts
 * import type { AstmProfileProvenance } from "@cosyte/astm";
 * const prov: AstmProfileProvenance = {
 *   source: "kxepal/python-astm codec.py",
 *   reference: "https://github.com/kxepal/python-astm/blob/master/astm/codec.py",
 *   retrieved: "2026-07-21",
 * };
 * ```
 */
export interface AstmProfileProvenance {
  /** Short human-readable name of the grounding source (corpus, transcript, or spec). */
  readonly source: string;
  /** A citation the grounding can be traced to — a URL, DOI, or repo+path. */
  readonly reference: string;
  /** When the grounding was last verified (ISO date) or the pinned commit SHA. */
  readonly retrieved?: string;
  /** Optional clarifying note about what in the source grounds the quirks. */
  readonly note?: string;
}

/**
 * Optional structural narrowing for a {@link QuirkTolerance}. When present, the
 * tolerance applies only to warnings whose PHI-free {@link AstmPosition} matches
 * every provided field — so a profile can expect a deviation on one record type
 * (e.g. an unknown escape only inside `R` result values) without blanket-tolerating
 * it everywhere. Matching is on **structural identifiers only** (record-type
 * letter, 1-based field index); there is no matching on any field *value*, by
 * construction.
 *
 * @example
 * ```ts
 * import type { AstmQuirkMatch } from "@cosyte/astm";
 * const onlyResultUnits: AstmQuirkMatch = { recordType: "R", fieldIndex: 5 };
 * ```
 */
export interface AstmQuirkMatch {
  /** Match only warnings carrying this record-type letter in their position. */
  readonly recordType?: string;
  /** Match only warnings carrying this 1-based field index in their position. */
  readonly fieldIndex?: number;
}

/**
 * One expected deviation declared by a profile. `code` names an **existing,
 * non-safety-critical** warning code the profile expects; `rationale` documents
 * why (grounded in the profile's {@link AstmProfileProvenance}); optional `match`
 * narrows it to a structural location. `defineAstmProfile` throws if `code` is
 * safety-critical or is not a real warning code, or if `rationale` is empty.
 *
 * @example
 * ```ts
 * import type { AstmQuirkTolerance } from "@cosyte/astm";
 * const t: AstmQuirkTolerance = {
 *   code: "ASTM_UNKNOWN_ESCAPE_SEQUENCE",
 *   rationale: "Corpus stacks that treat '&' as literal data emit non-standard escape bodies.",
 * };
 * ```
 */
export interface AstmQuirkTolerance {
  /** The existing, non-safety-critical warning code this profile expects. */
  readonly code: AnyAstmWarningCode;
  /** Why the profile expects this deviation — grounded in its provenance. */
  readonly rationale: string;
  /** Optional structural narrowing (record type / field index). */
  readonly match?: AstmQuirkMatch;
}

/**
 * A frozen, immutable vendor/conformance profile. Produced by
 * {@link defineAstmProfile}; consumers pass it to `parseAstmRecords(raw, { profile })`
 * (or register it as the process default), and feed its {@link AstmProfile.transport}
 * to `detectFraming(bytes, { override })`. Hand-authoring the object literal is
 * supported but discouraged — the factory validates the safety rules and attaches
 * `describe()`.
 *
 * @example
 * ```ts
 * import { parseAstmRecords, astmProfiles } from "@cosyte/astm";
 * const msg = parseAstmRecords(raw, { profile: astmProfiles.referenceCorpus });
 * msg.profile?.name; // "referenceCorpus"
 * ```
 */
export interface AstmProfile {
  /** The profile's unique name (registry key / attribution label). */
  readonly name: string;
  /** Optional human-readable description. */
  readonly description?: string;
  /** Resolved lineage — `[...parents, name]`, first-occurrence deduped. */
  readonly lineage: readonly string[];
  /** The expected, non-safety-critical deviations this profile tolerates. */
  readonly tolerate: readonly AstmQuirkTolerance[];
  /**
   * The raw-vs-framed-TCP override. When set, a consumer forces this framing via
   * `detectFraming(bytes, { override: profile.transport })` — the way a profile
   * that knows a vendor's transport reality (e.g. framing dropped over raw TCP)
   * bypasses leading-byte auto-detection. Absent means "let detection decide."
   */
  readonly transport?: AstmFraming;
  /** The cited public grounding for this profile's quirks (absent for `default`). */
  readonly provenance?: AstmProfileProvenance;
  /** Multi-line human-readable summary; always present on factory-built profiles. */
  readonly describe?: () => string;
}

/**
 * Options accepted by {@link defineAstmProfile}. Mirrors the {@link AstmProfile}
 * shape minus the derived `lineage`/`describe`, plus the `extends` input key. Every
 * field except `name` is optional.
 *
 * @example
 * ```ts
 * import { defineAstmProfile, type DefineAstmProfileOptions } from "@cosyte/astm";
 * const opts: DefineAstmProfileOptions = {
 *   name: "my-analyzer",
 *   transport: "raw",
 *   tolerate: [{ code: "ASTM_RECORD_UNKNOWN_TYPE", rationale: "partial vendor grammar" }],
 * };
 * const p = defineAstmProfile(opts);
 * ```
 */
export interface DefineAstmProfileOptions {
  readonly name: string;
  readonly description?: string;
  readonly tolerate?: readonly AstmQuirkTolerance[];
  readonly transport?: AstmFraming;
  readonly provenance?: AstmProfileProvenance;
  readonly extends?: AstmProfile | readonly AstmProfile[];
}
