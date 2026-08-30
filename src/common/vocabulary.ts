/**
 * Vocabulary attribution for the code sets this library grades wire letters
 * against.
 *
 * An `R` record carries single letters whose meaning comes from a published
 * vocabulary, and the ASTM record grammar itself is frozen while those
 * vocabularies keep moving. Reporting a letter as "unrecognized" without saying
 * what it was compared against therefore hides a staleness: a consumer cannot
 * tell a code no published vocabulary defines from a code this library has
 * simply not caught up to.
 *
 * So every interpreted value carries an attribution, and the attribution has
 * exactly two shapes:
 *
 * - {@link NamedVocabulary}: a published code system, named by identifier and
 *   version. **The version says what this library compared against; it is not a
 *   claim about which version the sender meant.**
 * - {@link UnattributedVocabulary}: no citable published source. This is a
 *   positive statement, deliberately distinguishable from an attribution that is
 *   simply absent, and it never carries a code-system identifier.
 *
 * These constants are the single source of truth: the interpreted value and the
 * warning raised beside it both read them, so the two can never drift apart.
 */

/**
 * A published code system this library graded a value against, named by
 * identifier and version.
 *
 * @example
 * ```ts
 * import { ABNORMAL_FLAG_VOCABULARY } from "@cosyte/astm";
 * ABNORMAL_FLAG_VOCABULARY.attributed; // true
 * ABNORMAL_FLAG_VOCABULARY.version;    // the version compared against
 * ```
 */
export interface NamedVocabulary {
  /** Always `true`: a published source is cited. */
  readonly attributed: true;
  /** The code system's canonical identifier, verbatim from the published source. */
  readonly system: string;
  /**
   * The code system version this library compared against, verbatim from the
   * published source. **Not** a claim about the version the sender used.
   */
  readonly version: string;
}

/**
 * The explicit statement that a code set is bound by **no citable published
 * source**. It carries no identifier and no version, because inventing either
 * would be the guess this library exists to refuse.
 *
 * @example
 * ```ts
 * import { RESULT_STATUS_VOCABULARY } from "@cosyte/astm";
 * RESULT_STATUS_VOCABULARY.attributed; // false
 * RESULT_STATUS_VOCABULARY.reason;     // fixed prose: why nothing is cited
 * ```
 */
export interface UnattributedVocabulary {
  /** Always `false`: no published source can be cited for this code set. */
  readonly attributed: false;
  /** Fixed prose saying why nothing is cited. Never a code-system identifier. */
  readonly reason: string;
}

/**
 * What an interpreted wire letter was graded against: either a named published
 * code system or an explicit "no citable source". Discriminate on
 * {@link NamedVocabulary.attributed}.
 */
export type VocabularyAttribution = NamedVocabulary | UnattributedVocabulary;

/**
 * The vocabulary the `R` record's abnormal-flag letters (field 7) are graded
 * against: the HL7 v3 ObservationInterpretation code system, which carries the
 * concepts kept aligned with the HL7 v2 Table 0078 interpretation codes this
 * library has always recognized.
 *
 * The identifier and version are transcribed character for character from that
 * code system's published source of truth. **The version records what this
 * library compared against, not what the sender meant.**
 *
 * @example
 * ```ts
 * import { ABNORMAL_FLAG_VOCABULARY, interpretAbnormalFlag } from "@cosyte/astm";
 * interpretAbnormalFlag("HU").vocabulary === ABNORMAL_FLAG_VOCABULARY; // true
 * ```
 */
export const ABNORMAL_FLAG_VOCABULARY: NamedVocabulary = Object.freeze({
  attributed: true,
  system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
  version: "4.0.0",
});

/**
 * The attribution for the `R` record's result-status letters (field 9): **none**.
 *
 * The letters this library models are the ones real analyzers send, but the
 * normative text that would bind them to a published code set is purchase-gated
 * and has not been read here. A neighbouring HL7 table exists whose letters
 * partly agree, and adopting it would be an assertion nothing in the public
 * record supports. So this library says the set is unattributed rather than
 * citing a source it cannot stand behind.
 *
 * @example
 * ```ts
 * import { interpretResultStatus } from "@cosyte/astm";
 * interpretResultStatus("F").vocabulary.attributed; // false
 * ```
 */
export const RESULT_STATUS_VOCABULARY: UnattributedVocabulary = Object.freeze({
  attributed: false,
  reason:
    "The result-status letter set is graded against no citable published source: " +
    "the normative text that would bind it is purchase-gated and unread here, and " +
    "no neighbouring code system is assumed in its place.",
});

/**
 * Render a vocabulary attribution as fixed prose for a warning message.
 *
 * The result is a function of the attribution constants alone: it embeds no
 * field text, no value, and no position, so a warning built with it stays
 * value-free.
 *
 * @param vocabulary - The attribution to describe.
 * @returns Fixed prose naming the code system and version, or the unattributed reason.
 * @example
 * ```ts
 * import { describeVocabulary, ABNORMAL_FLAG_VOCABULARY } from "@cosyte/astm";
 * describeVocabulary(ABNORMAL_FLAG_VOCABULARY); // "graded against <system> version <version>"
 * ```
 */
export function describeVocabulary(vocabulary: VocabularyAttribution): string {
  return vocabulary.attributed
    ? `graded against ${vocabulary.system} version ${vocabulary.version}`
    : vocabulary.reason;
}
