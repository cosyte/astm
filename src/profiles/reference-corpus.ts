/**
 * The `referenceCorpus` profile — a **non-vendor**, evidence-backed tolerance
 * grounded firsthand in the **redistributable OSS reference corpus**, not an
 * invented per-vendor deviation matrix.
 *
 * Grounding (firsthand-verified 2026-07-21; the corpus is permissively licensed and
 * in scope for grounding, per the roadmap):
 *
 * - **`kxepal/python-astm` `codec.py`** (BSD) — its `decode_record` /
 *   `decode_component` / `decode_repeated_component` split fields, components, and
 *   repeats on the raw delimiters and **never un-escape** ASTM escape sequences: the
 *   source contains zero handling of `&F&`/`&S&`/`&R&`/`&E&`, and the escape
 *   character is treated as ordinary data. `senaite.astm` / `senaite.lis2a` inherit
 *   the same escape-agnostic decode.
 * - Consequence, and what this profile expects: a stream produced or relayed by a
 *   toolchain built on that escape-agnostic reference stack routinely carries a bare
 *   or non-standard `&…&` body inside a free-text field (units, comments, test
 *   names) that our **escape-aware** tokenizer flags as
 *   `ASTM_UNKNOWN_ESCAPE_SEQUENCE`. We are deliberately stricter than the OSS
 *   references here (roadmap §6 differential note), so the warning is *expected*
 *   noise when talking to that ecosystem — recognizable and non-clinical.
 *
 * **Why this is safe.** The escape codec **preserves an unrecognized `&…&` body
 * byte-for-byte** in the decoded value (`decodeEscapes` never guesses); the value a
 * consumer reads is identical whether or not this profile is active. The profile
 * only re-badges the *warning* — no value, flag, status, or identifier is altered
 * or dropped. And by the safety gate in `defineAstmProfile`, it **cannot** tolerate
 * a result value / flag / status / range / units, a patient or comment context, a
 * message-kind ambiguity, or any frame / LTP integrity warning — those always
 * surface, profile or not.
 *
 * **Honesty.** This is a *reference-corpus* profile, not a claim about any named
 * analyzer vendor. No per-vendor ("cobas does X") behaviour is asserted; a named
 * vendor profile awaits a firsthand vendor-attributed quirk document and stays
 * deferred (`REAL-CORPUS`).
 */

import { defineAstmProfile } from "./define.js";
import type { AstmProfile } from "./types.js";

/**
 * Tolerates the non-standard-escape noise that streams from the escape-agnostic OSS
 * reference stack (`python-astm` / `senaite`) carry — the value is preserved
 * verbatim; only the syntactic warning is expected.
 *
 * @example
 * ```ts
 * import { parseAstmRecords, astmProfiles, WARNING_CODES } from "@cosyte/astm";
 * const msg = parseAstmRecords(raw, { profile: astmProfiles.referenceCorpus });
 * // an unknown-escape deviation arrives as PROFILE_QUIRK_APPLIED (expected), not a bare warning:
 * const quirks = msg.warnings.filter((w) => w.code === WARNING_CODES.PROFILE_QUIRK_APPLIED);
 * ```
 */
export const referenceCorpus: AstmProfile = defineAstmProfile({
  name: "referenceCorpus",
  description:
    "Non-standard-escape tolerance grounded firsthand in the escape-agnostic OSS reference corpus " +
    "(python-astm / senaite). Syntactic encoding noise only — the value is preserved verbatim, never " +
    "a safety-critical value.",
  provenance: {
    source: "kxepal/python-astm codec.py (BSD) + senaite.astm / senaite.lis2a",
    reference:
      "https://github.com/kxepal/python-astm/blob/master/astm/codec.py ; " +
      "https://github.com/senaite/senaite.astm",
    retrieved: "2026-07-21",
    note: "Firsthand-read: decode_record/decode_component/decode_repeated_component split on raw delimiters and never un-escape &F&/&S&/&R&/&E&.",
  },
  tolerate: [
    {
      code: "ASTM_UNKNOWN_ESCAPE_SEQUENCE",
      rationale:
        "The OSS reference stack (python-astm codec.py, firsthand-verified) treats '&' as literal data " +
        "and never decodes escape sequences, so streams from that ecosystem carry non-standard '&…&' " +
        "bodies our escape-aware tokenizer flags. The body is preserved byte-for-byte in the value; " +
        "the deviation is recognizable, syntactic, and non-clinical.",
    },
  ],
});
