/**
 * The `referenceCorpus` profile: a **non-vendor**, evidence-backed tolerance
 * grounded firsthand in the **redistributable OSS reference corpus**, not an
 * invented per-vendor deviation matrix.
 *
 * Grounding (firsthand-verified 2026-07-21; the corpus is permissively licensed):
 *
 * - **`kxepal/python-astm` `codec.py`** (BSD), its `decode_record` /
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
 *   references here, so the warning is *expected*
 *   noise when talking to that ecosystem: recognizable and non-clinical.
 *
 * **Why this is safe.** The escape codec **preserves an unrecognized `&…&` body
 * byte-for-byte** in the decoded value (`decodeEscapes` never guesses); the value a
 * consumer reads is identical whether or not this profile is active. The profile
 * only re-badges the *warning*: no value, flag, status, or identifier is altered
 * or dropped. And by the safety gate in `defineAstmProfile`, it **cannot** tolerate
 * a result value / flag / status / range / units, a patient or comment context, a
 * message-kind ambiguity, an unrecognized record type, a declaration naming one
 * character in two delimiter roles, a delimiter an unrecognized
 * escape sequence kept out of the split, or any frame / LTP integrity
 * warning: those always surface, profile or not. The unrecognized-record-type case
 * matters because message grouping reads a record's type letter, so a letter the
 * reader does not recognize may be a header, and a header read as something else
 * joins two messages into one.
 *
 * **Honesty.** This is a *reference-corpus* profile, not a claim about any named
 * analyzer vendor. No per-vendor ("cobas does X") behaviour is asserted; a named
 * vendor profile awaits a firsthand vendor-attributed quirk document.
 */

import { defineAstmProfile } from "./define.js";
import type { AstmProfile } from "./types.js";

/**
 * Tolerates the non-standard-escape noise that streams from the escape-agnostic OSS
 * reference stack (`python-astm` / `senaite`) carry: the value is preserved
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
    "(python-astm / senaite). Mostly syntactic encoding noise, with one measured exception: an " +
    "escape sequence whose body is an unrecognized character that is itself a delimiter in force is " +
    "an opaque atom, so that delimiter does " +
    "not split and a result can lose its units and its status. Read the values; do not rely on " +
    "this profile leaving only cosmetic deviations behind.",
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
        "bodies our escape-aware tokenizer flags. The body is preserved byte-for-byte in the value. " +
        "NOT always non-clinical, and this is measured rather than assumed: where the body is a " +
        "delimiter, that delimiter never became a field boundary, so `28.6&|&U/L` reads as one " +
        "value with no units and no final status. That subset now also raises " +
        "ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE, which this profile cannot tolerate, so " +
        "tolerating this code no longer hides it.",
    },
  ],
});
