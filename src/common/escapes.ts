/**
 * The ASTM escape codec: the fix for a documented silent-misread class.
 *
 * ASTM escapes an embedded delimiter with the escape character on both sides of
 * a single mnemonic letter (the InterSystems mnemonics, cross-verified against
 * the OSS reference implementations):
 *
 * ```
 *   &F&  → field delimiter      (default "|")
 *   &S&  → component delimiter  (default "^")
 *   &R&  → repeat delimiter     (default "\")
 *   &E&  → escape character     (default "&")
 * ```
 *
 * **Why this is a requirement, not a nicety.** A result value can legitimately
 * contain a component delimiter: e.g. a titre written `1^40`. On the wire that
 * is escaped as `1&S&40`. A parser that splits a field into components on the
 * raw component delimiter and *never decodes the escape* is safe here (the
 * escape body `&S&` contains no literal `^`), but a parser that **decodes first
 * and splits second** turns `1&S&40` into `1^40` and then mis-splits it into two
 * components: the silent misread `python-astm` / `Chistousov` exhibit. The
 * correct order, implemented here, is **escape-aware split, then decode each
 * leaf**: the escape sequence survives the split intact and only then decodes to
 * a single literal, so `1&S&40` reads as exactly one component.
 *
 * **An escape sequence is exactly three characters** (the escape character, one
 * body character, and the escape character again), and both functions here agree
 * on that, because they have to: a split that thinks `&X…&` is one atom while the
 * decoder thinks otherwise is the same class of mis-read the ordering above
 * exists to prevent. An escape character that does not sit at the head of such a
 * triple is not an escape at all: it is read as the **literal character it is**,
 * it opens no atom, and the parse layer reports it
 * (`ASTM_UNPAIRED_ESCAPE_CHARACTER`). Both functions used to scan forward for the
 * next escape character with no bound, which meant a single unescaped `&` in a
 * value merged every field after it into that value, in silence.
 *
 * **The atom rule is unchanged and still costs a boundary in one case, which now
 * has a report of its own.** A triple is opaque by design, so where its body is
 * itself a delimiter (`&|&` under the canonical set) that delimiter does not
 * split. That is deliberate: it is what keeps `&F&` one token under a declared
 * set that names `F` as a delimiter. Where the body is not a recognized mnemonic
 * the parse layer reports it as `ASTM_UNKNOWN_ESCAPE_SEQUENCE`, and where that
 * unrecognized body is *also* one of the three splitting roles in force it
 * reports `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` **as well**, which is the
 * code that says a boundary went missing rather than merely that a body was not
 * recognized. Do not "fix" this by narrowing the atom: the narrowing would break
 * the guarantee the atom exists for. The split is unchanged; what changed is that
 * the loss is now reported by a code no profile may tolerate.
 *
 * **The match is greedy and leftmost, and that costs a boundary in the opposite
 * direction, which also has a report of its own.** Triples are taken left to
 * right, so the escape character that *closes* one triple cannot also *open* the
 * next. Where it could have (the character after a triple is a splitting
 * delimiter and the one after that is the escape character), the bytes carry two
 * alignments that disagree about that delimiter: under the reading taken it ends
 * a field, repeat or component, and under the other it sits inside an opaque
 * atom and ends nothing. Where the earlier triple's body was **not** a
 * recognized mnemonic, the reading taken rests on a triple this codec cannot
 * interpret at all, so nothing in its own vocabulary prefers that reading to the
 * competing one, and the parse layer reports
 * `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT`. The split is unchanged
 * here too: the leftmost reading is kept, and what is new is that a boundary
 * which may not be the sender's is no longer reported only by codes a profile
 * may tolerate. Where that earlier body **was** a recognized mnemonic nothing is
 * reported, and the reason is narrower than it looks, so read
 * {@link AmbiguousAlignmentSink} before widening it.
 *
 * **A second question is asked at the same position, and it is a different one,
 * which is why it is a second code and not a widening of the first.** That report
 * asks whether this codec's vocabulary prefers the reading taken *at* the contested
 * position. It says nothing about what the reading taken makes of the bytes *after*
 * the boundary, and that is where the two alignments really diverge: they resume
 * one character apart, so they disagree about the whole tail. Where the escape
 * character the reading taken resumes on heads no sequence at all, the boundary was
 * bought with a byte this reading cannot read, while the competing alignment is
 * precisely the reading that can. On the **field** separator that gained boundary
 * shifts every later field one place, so a result record's units and **result
 * status** are read out of slots the competing alignment does not put them in, and
 * a status of `final` can be a consequence of the alignment rather than something
 * the sender wrote there. That is `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS`; see
 * {@link ShiftedFieldsSink}, including the tail it deliberately stays silent on, and
 * why that silence is not a claim that nothing was lost there.
 *
 * **The same question asked on the repeat separator has a different answer, so it
 * has a code of its own.** A gained repeat boundary moves no field-indexed slot, and
 * where it is the **first** boundary in the field it still reaches a modeled slot,
 * because a field's modeled reading is taken from its first repeat alone: everything
 * past that boundary leaves the record, so a result value truncates and a Universal
 * Test ID or a patient name loses the components that sat after it. That is
 * `ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD`; see {@link TruncatedFieldSink}, including
 * what it does at a later boundary, where it fires and no modeled slot moves.
 *
 * **The same question asked on the component separator has a third answer again, and
 * so a third code.** There the components neither leave the record nor change field
 * number: they move one slot along, because components are modeled *inside* a field.
 * A Universal Test ID's coding scheme and local code, and a patient's given and middle
 * names, are then read out of positions the competing alignment does not put them in.
 * That is `ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS`; see {@link ShiftedComponentsSink},
 * including what it does inside a later repeat, where it fires and no modeled slot
 * moves. All three roles are wired now; there is no fourth, because nothing splits on
 * the escape role.
 *
 * Re-escaping (the inverse, for spec-clean emit) lives in the serializer and is
 * deliberately not implemented here.
 */

import type { Delimiters } from "./delimiters.js";

/**
 * A callback the codec calls when it encounters an escape sequence whose body is
 * not one of the four recognized mnemonics. The sequence is preserved verbatim;
 * the callback lets the parser surface a value-free `ASTM_UNKNOWN_ESCAPE_SEQUENCE`
 * warning. Optional so the codec can be used purely.
 */
export type UnknownEscapeSink = () => void;

/**
 * A callback the codec calls when it encounters an escape character that does not
 * head a three-character escape sequence. The character is preserved verbatim as a
 * literal; the callback lets the parser surface a value-free
 * `ASTM_UNPAIRED_ESCAPE_CHARACTER` warning. Optional so the codec can be used purely.
 */
export type UnpairedEscapeSink = () => void;

/**
 * A callback the codec calls when an **unrecognized** escape body is itself one of
 * the three splitting delimiters in force (field, repeat, component), so the atom
 * rule kept that character out of the split and a boundary the sender's bytes
 * carried never became one. The value is preserved verbatim either way; the
 * callback lets the parser surface a value-free
 * `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` warning. Optional so the codec can
 * be used purely.
 *
 * The **escape** character is deliberately not in that test: it is not a splitting
 * role, so `&&&` under the canonical set loses no boundary. A body that is a
 * *recognized* mnemonic is not in it either, whatever character it is: `&F&` under
 * a set naming `F` as the repeat delimiter is the escaped field delimiter the
 * sender wrote, and reading it as a swallowed repeat boundary would report the
 * escape mechanism working as a defect.
 */
export type SwallowedDelimiterSink = () => void;

/**
 * A callback the split calls when the escape character that **closed** an
 * unrecognized escape sequence could instead have **opened** one whose body is the
 * delimiter being split on, so the two alignments of the same bytes disagree about
 * whether that delimiter ends a field, repeat or component. The leftmost reading is
 * kept and nothing is re-split; the callback lets the parser surface a value-free
 * `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT` warning. Optional so the split can be
 * used purely.
 *
 * Two exclusions, both deliberate. The first is what keeps this off conformant
 * streams, and it is **wider than the case it is justified on**, so the residue is
 * named here rather than left to be found:
 *
 * - **The earlier sequence's body must not be a recognized mnemonic.** The test is
 *   which alignment this codec's own vocabulary supports, not which one is tidier.
 *   Where the earlier body is unrecognized the reading taken rests on a triple the
 *   codec cannot interpret, while the competitor's body is the delimiter character,
 *   which it usually cannot interpret either: nothing prefers one, and that is what
 *   this reports. Where the earlier body is a recognized mnemonic the reading taken
 *   interprets a construct (`&F&` is the sender escaping a field separator, which is
 *   what the mechanism is for) and the competitor **usually** interprets none, so the
 *   vocabulary usually prefers one, and reporting it would report the escape
 *   mechanism working. Usually, not always: see the second residue below.
 *   **What that argument does not cover, measured.** It does not follow that the
 *   reading taken is *conformant*: under `28.6&F&|&U/L` it is `&F&`, a real
 *   separator, and then a bare escape character, which this package reports as a
 *   deviation of its own. And where the declared set names a mnemonic letter as a
 *   splitting delimiter, both alignments interpret exactly one construct and
 *   neither is preferred, yet the exclusion still silences it. Both residues are
 *   recorded with their measurements rather than closed by widening this test: the
 *   criterion that would cover them is a different one (counting what each
 *   alignment interprets), and swapping criteria moves which streams a published
 *   package refuses.
 * - **The following character must be the delimiter this split is taken on.** The
 *   split runs once per role, so a character that is a delimiter in a *later* role
 *   is reported by that role's pass, on the segment it survives into, and never
 *   twice. A delimiter with no escape character two positions past it is excluded by
 *   the rule that defines the condition rather than by a judgement: the sequence the
 *   competing alignment would need never closes, so there is no competitor.
 *
 * @param segmentIndex - The 0-based index of the segment being accumulated when the
 *   ambiguity was seen, so a caller splitting a record into fields can report which
 *   field it sat in. A caller splitting one field into repeats or components
 *   already knows the field index and ignores this.
 */
export type AmbiguousAlignmentSink = (segmentIndex: number) => void;

/**
 * A callback the split calls when a competing escape alignment decided a boundary
 * **and the reading taken cannot read the byte immediately past it**: the escape
 * character the leftmost reading resumes on heads no escape sequence at all, so it
 * is kept as a bare literal (reported separately as
 * `ASTM_UNPAIRED_ESCAPE_CHARACTER`), while the competing alignment is exactly the
 * reading that gives that character a job, as the close of its own triple.
 *
 * Wired **only to the split taken on the field separator**, because that is the
 * whole of its claim: a gained *field* boundary shifts every later field one place,
 * so a record's modeled slots after it are decided by the alignment rather than by
 * the sender's own positions. On a result record that is the units slot and the
 * **result status** slot: the sender's trailing letter lands in field 9 under the
 * reading taken and in no field at all under the competing one, so a status of
 * `final` can be a consequence of the alignment rather than something the sender
 * put there. A gained *repeat* or *component* boundary divides one field and
 * reaches nothing outside it, so it moves no **field-indexed** slot and is
 * deliberately outside this. **That bound is a choice, not a consequence, and the
 * difference matters**: components are modeled *inside* a field (a Universal Test
 * ID's coding scheme and local code, a patient name's parts), so a gained repeat or
 * component boundary does reach a modeled slot. The **repeat** half of that is
 * reported by {@link TruncatedFieldSink}, on the same tail test and under its own
 * code, because what it costs is a different thing. The **component** half is
 * reported by {@link ShiftedComponentsSink}, on that same tail test and under a code of
 * its own again, because what it costs is a third thing: there the components move one
 * slot along rather than leaving the record. The
 * callback lets the parser surface a value-free
 * `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS` warning. Optional so the split can be used
 * purely.
 *
 * **It is a report, not a repair.** The split is unchanged, every decoded byte is
 * identical, and the status read is the status that was always read. What is new is
 * that the shift is reported by a code no profile may tolerate, where before it was
 * covered only by tolerable ones.
 *
 * **This is independent of {@link AmbiguousAlignmentSink}, and fires alongside it
 * rather than instead of it.** That one asks whether the codec's vocabulary prefers
 * the reading taken *at* the contested position and is silent where the earlier
 * body is a recognized mnemonic; this one asks what the reading taken makes of the
 * bytes *after* the boundary and does not consult the earlier body at all. The two
 * questions are different, so neither test is widened to answer the other.
 *
 * **The tail is weighed one construct deep, and that bound is stated rather than
 * left to be found.** Two tails are excluded, with the same reason: the bytes past
 * the boundary prefer the reading taken.
 *
 * - **The escape character heads a sequence this codec recognizes.** Then the
 *   reading taken interprets it and leaves nothing bare, while the competing
 *   alignment would leave it bare. Under a set naming the field separator `F`,
 *   `28.6&F&F&F&U/L` is the sender escaping that separator, writing it, and
 *   escaping it again: entirely well formed, and refusing it is the over-refusal
 *   that sank the preceding candidate criterion for this family.
 * - **The escape character heads a sequence whose body this codec does not
 *   recognize.** Then the reading taken still consumes it as a sequence and carries
 *   one unreadable body, while the competing alignment would leave *two* escape
 *   characters bare. The preference is stronger there, not weaker.
 *
 * What that bound leaves open is the second of those tails, where the field shift
 * is real and this stays silent. It is measured and named rather than closed by
 * widening the test, because widening it would report a boundary the bytes prefer.
 *
 * @param segmentIndex - The 0-based index of the field being accumulated when the
 *   shifting boundary was taken. Every field after it is one place further right
 *   than the competing alignment puts it.
 */
export type ShiftedFieldsSink = (segmentIndex: number) => void;

/**
 * A callback the split calls on **exactly the condition {@link ShiftedFieldsSink}
 * reports**, wired instead to the split taken on the **repeat** separator. The two
 * sinks test the same predicate, because the predicate is about the bytes and the
 * split does not know which role it is being taken on; they are separate so the
 * caller that does know can name what the gained boundary costs, which is not the
 * same thing in the two roles. Do not "simplify" them into one: the codes would then
 * have to make one claim covering both, and the claim is different.
 *
 * **What a gained repeat boundary costs, and it is not a shift.** No field-indexed
 * slot moves: the units slot and the result-status slot are read out of the same
 * field numbers under either alignment. What the report says is that **the field is
 * read as more repeats than the competing alignment gives it**, and that is true
 * wherever it fires. What that costs depends on **which** boundary was gained, and
 * the two cases are stated separately rather than folded into one claim:
 *
 * - **The gained boundary is the FIRST in the field, and then a modeled slot is
 *   lost.** A field's modeled value and its components are taken from its **first
 *   repeat alone**, so everything past the boundary is still on the wire, still in
 *   `repeats`, and gone from every modeled slot. Under a set naming the repeat
 *   separator `F`, the value `28.6&S&F&U/L` reads as the two repeats `28.6^` and
 *   `&U/L`, and every value extractor answers `28.6^`, while the competing alignment
 *   reads one repeat carrying all of it. The same boundary inside a Universal Test ID
 *   field leaves the components of the first repeat only, so a UTID whose bytes carry
 *   a test code can come back as a single component holding a decoded delimiter, with
 *   the coding scheme and local code read from nothing at all. A patient name loses
 *   its given and middle names the same way.
 * - **The gained boundary is a LATER one, and then no modeled slot moves.** The first
 *   repeat is identical under both alignments, so the value, the components and every
 *   slot taken from them read the same either way; what differs is the repeat
 *   structure after the first. **This still fires there, deliberately and measurably**
 *   (`5.0F28.6&S&F&U/L` under that same set), because the boundary is still one the
 *   bytes do not force and a consumer reading `repeats` is still reading an alignment
 *   guess. Relative to the modeled slots that is **over-reporting, never
 *   under-reporting**, which is the direction this package errs in. Narrowing the sink
 *   to the first boundary would change which streams a published package refuses and
 *   wants its own measurement, so the bound is written down instead of guessed at.
 *
 * **It is a report, not a repair.** The split is unchanged, every decoded byte is
 * identical, `repeats` still carries every one of them, and the value read is the
 * value that was always read. What is new is that the gained boundary is reported by
 * a code no profile may tolerate, where before it was covered only by tolerable ones.
 *
 * **The tail is weighed one construct deep, exactly as in {@link ShiftedFieldsSink},
 * and for the same reason.** Where the escape character the reading taken resumes on
 * heads a sequence this codec recognizes, the bytes prefer the reading taken and the
 * two repeats are the ones the sender wrote: under a set naming the repeat separator
 * `F`, `28.6&F&F&F&U/L` is that separator escaped, written, and escaped again.
 * Refusing that is the over-refusal that sank an earlier candidate criterion for this
 * family. Where it heads a sequence whose body is *unrecognized*, the competing
 * alignment would leave two escape characters bare, so the preference is stronger
 * again. **The truncation in that second case is real and this stays silent about
 * it**: a named residue, measured, not overlooked, and not closed by widening the
 * test, because widening it would report a boundary the bytes prefer.
 *
 * @param segmentIndex - The 0-based index of the repeat being accumulated when the
 *   gained boundary was taken, so `0` is the boundary that ends the first repeat and
 *   is the one that reaches a modeled slot. It is **not** a field index: the caller
 *   splitting one field into repeats already knows which field it is in, and reports
 *   that.
 */
export type TruncatedFieldSink = (segmentIndex: number) => void;

/**
 * A callback the split calls on **exactly the condition {@link ShiftedFieldsSink}
 * reports**, wired instead to the split taken on the **component** separator. The
 * third and last of the three sinks that share that one predicate, for the reason the
 * other two share it: the predicate is about the bytes and the split does not know
 * which role it is being taken on, so the caller that does know names what the gained
 * boundary costs. Do not "simplify" the three into one: the codes would then have to
 * make one claim covering all of them, and the three claims are different.
 *
 * **What a gained component boundary costs, and it is neither of the other two.** No
 * field number changes, so nothing shifts between field-indexed slots, and nothing
 * leaves the record, so nothing truncates. Components are modeled **inside** a field,
 * so what happens is that every component after the gained boundary is one place
 * further right than the competing alignment puts it, and the slots that indexes into
 * are named things: a Universal Test ID's LOINC-candidate slot, test name, **coding
 * scheme** and **local code**; a patient name's last, first and middle. Under the
 * canonical set `&F&^&GLU^L^687` reads four components, so `L` is the coding scheme
 * and `687` the vendor's local code, while the competing alignment reads three and
 * `687` is the **coding scheme**. `DOE&F&^&JANE^A` reads a given name of `&JANE` and a
 * middle name of `A`, while the competing alignment makes `A` the **given** name with
 * no middle name at all.
 *
 * **Every gained boundary in a repeat moves those slots, not only the first.** That is
 * the structural difference from {@link TruncatedFieldSink}: a field is modeled out of
 * its first repeat alone, so there only the first gained boundary reaches a modeled
 * slot, while here the shift propagates from wherever the boundary sits to the end of
 * the component list.
 *
 * **Where the contested boundary sits in a LATER repeat, no modeled slot moves and
 * this still fires**, deliberately and measurably. `components` is `repeats[0]`, so a
 * component boundary gained inside the second or a later repeat changes only
 * `repeats[n]` for that `n`. It fires because the boundary is still one the bytes do
 * not force and a consumer reading `repeats` is still reading an alignment guess.
 * Relative to the modeled slots that is **over-reporting, never under-reporting**.
 * Narrowing it to the first repeat would change which streams a published package
 * refuses and wants its own measurement, so the bound is written down instead of
 * guessed at, and **that axis is swept on its own** rather than left to the shared
 * corpus, which holds it fixed.
 *
 * **It is a report, not a repair.** The split is unchanged, every decoded byte is
 * identical, and the components read are the components that were always read. What is
 * new is that the moved slots are reported by a code no profile may tolerate, where
 * before they were covered only by tolerable ones. **Withholding them is a separate
 * question, deliberately not answered here**: declining to model a slot changes an
 * extracted value for every consumer of a package already on the registry.
 *
 * **The tail is weighed one construct deep, exactly as in the other two sinks, and for
 * the same reason.** Where the escape character the reading taken resumes on heads a
 * sequence this codec recognizes, the bytes prefer the reading taken and the components
 * are the ones the sender wrote: under a set naming the component separator `F`,
 * `GLU&F&F&F&L` is that separator escaped, written, and escaped again. Refusing that is
 * the over-refusal that sank an earlier candidate criterion for this family. Where it
 * heads a sequence whose body is *unrecognized*, the competing alignment would leave
 * two escape characters bare, so the preference is stronger again. **The moved slots in
 * that second case are real and this stays silent about them**: a named residue,
 * measured, not overlooked, and not closed by widening the test, because widening it
 * would report a boundary the bytes prefer.
 *
 * @param segmentIndex - The 0-based index of the component being accumulated when the
 *   gained boundary was taken. Every component after it is one place further right than
 *   the competing alignment puts it. It is **not** a field index, and it is **not** a
 *   repeat index: the caller splitting one repeat into components already knows both,
 *   and reports the field.
 */
export type ShiftedComponentsSink = (segmentIndex: number) => void;

/**
 * Whether an escape sequence starts at `i`: the escape character, exactly one body
 * character, and the escape character again.
 *
 * **The bound is the point.** Scanning forward for the next escape character with
 * no bound lets an escape character that was never meant as one reach across an
 * arbitrary amount of the record and turn every delimiter it spans into ordinary
 * text. The four mnemonic bodies are single characters, so one is all a real
 * sequence ever needs, and reading no further keeps the decision local: whether a
 * field splits can no longer depend on some later field happening to carry an
 * escape character too.
 *
 * `charAt` returns `""` past the end, which is never equal to a delimiter, so an
 * escape character in the last two positions of `text` is correctly not a sequence.
 */
function isEscapeSequenceAt(text: string, i: number, escape: string): boolean {
  return text.charAt(i) === escape && text.charAt(i + 2) === escape;
}

/**
 * Decode the four recognized ASTM escape mnemonics in a single already-split
 * leaf (a component string), substituting the *active* delimiters read from the
 * header. Unrecognized `&X&` bodies are preserved verbatim and reported through
 * `onUnknown` (never dropped, never guessed), and an escape character that heads
 * no sequence at all is preserved as a literal and reported through `onUnpaired`.
 *
 * This runs **after** splitting, so a decoded delimiter becomes ordinary literal
 * text and can never introduce a new split boundary.
 *
 * @param leaf - One component string, escape-aware split already applied.
 * @param d - The delimiters resolved from the header.
 * @param onUnknown - Called once per unrecognized escape body encountered.
 * @param onUnpaired - Called once per escape character that heads no sequence.
 * @param onSwallowedDelimiter - Called once per unrecognized escape body that is
 *   itself a splitting delimiter in force, so that delimiter never split.
 * @returns The decoded string.
 * @example
 * ```ts
 * import { decodeEscapes, CANONICAL_DELIMITERS } from "@cosyte/astm";
 * decodeEscapes("1&S&40", CANONICAL_DELIMITERS); // "1^40"
 * decodeEscapes("O&Brien", CANONICAL_DELIMITERS); // "O&Brien" (literal, reported)
 * ```
 */
export function decodeEscapes(
  leaf: string,
  d: Delimiters,
  onUnknown?: UnknownEscapeSink,
  onUnpaired?: UnpairedEscapeSink,
  onSwallowedDelimiter?: SwallowedDelimiterSink,
): string {
  const esc = d.escape;
  if (!leaf.includes(esc)) return leaf;

  let out = "";
  let i = 0;
  while (i < leaf.length) {
    const ch = leaf.charAt(i);
    if (ch !== esc) {
      out += ch;
      i += 1;
      continue;
    }
    if (!isEscapeSequenceAt(leaf, i, esc)) {
      // An escape character heading no sequence: keep it as the literal character it is,
      // report it, and carry on. Never swallow the remainder of the leaf behind it.
      out += ch;
      i += 1;
      onUnpaired?.();
      continue;
    }
    const body = leaf.charAt(i + 1);
    const replacement = escapeBody(body, d);
    if (replacement === undefined) {
      // Unrecognized escape: preserve the whole `&X&` verbatim, surface it, never guess.
      out += esc + body + esc;
      onUnknown?.();
      // ...and if that body is one of the three splitting roles, the atom rule is why it
      // is sitting here rather than having ended a field/repeat/component. That is a lost
      // boundary, not merely an unreadable body, so it gets its own report.
      if (isSplittingDelimiter(body, d)) onSwallowedDelimiter?.();
    } else {
      out += replacement;
    }
    i += 3;
  }
  return out;
}

/**
 * Whether `body` is one of the three roles a split is taken on: field, repeat, or
 * component. The escape role is excluded deliberately, because nothing splits on
 * it, so an `&&&` costs no boundary. Called only for an **unrecognized** body: a
 * recognized mnemonic is the sender escaping a delimiter on purpose, which is the
 * atom rule doing its job.
 */
function isSplittingDelimiter(body: string, d: Delimiters): boolean {
  return body === d.field || body === d.repeat || body === d.component;
}

/**
 * The four recognized escape bodies, mapped to the delimiter role each one stands
 * for. **This is the single definition of "a recognized mnemonic" in the package**,
 * and it has to stay single: the decoder and the split both ask that question, and
 * a decoder that recognizes a body the split does not is the same class of mis-read
 * the split-then-decode ordering exists to prevent.
 */
const MNEMONIC_ROLES = {
  F: "field",
  S: "component",
  R: "repeat",
  E: "escape",
} as const satisfies Record<string, keyof Delimiters>;

/**
 * Whether an escape body is one of the four recognized mnemonics. `Object.hasOwn`
 * rather than `in`, so an inherited property name (`toString`) is not read as one.
 */
function isMnemonicBody(body: string): body is keyof typeof MNEMONIC_ROLES {
  return Object.hasOwn(MNEMONIC_ROLES, body);
}

/** Map one escape body (the char(s) between the escape delimiters) to its literal, or undefined. */
function escapeBody(body: string, d: Delimiters): string | undefined {
  return isMnemonicBody(body) ? d[MNEMONIC_ROLES[body]] : undefined;
}

/**
 * Split `text` on `delimiter`, treating an escape sequence (escape, one body
 * character, escape) as an opaque atom so a delimiter that appears *inside* an
 * escape body never causes a split. Returns the raw (still-encoded) segments:
 * decoding is the caller's next step, per the escape-aware-split-then-decode
 * contract.
 *
 * For the four canonical mnemonics the opacity is belt-and-suspenders (their
 * bodies are letters, not delimiters), but it makes the "an escaped delimiter is
 * one token" guarantee hold for any declared delimiter set, including adversarial
 * input. A single body character is all that guarantee needs.
 *
 * An escape character that heads no sequence is **not** an escape: it is ordinary
 * text, and it opens no atom. Reading it as the opening of a sequence that never
 * closes is what used to merge the whole remainder of a record into one field.
 * Decoding the resulting leaf is what reports it, so this function stays a pure
 * split. Note the two rules together: a delimiter after such a character does
 * split, and a delimiter sitting inside a real three-character atom does not. The
 * second of those is reported, from the decode step rather than from here,
 * whenever the atom's body was not a recognized mnemonic.
 *
 * **Atoms are matched greedily, leftmost first, and where that choice decides a
 * boundary it is reported from here.** The escape character closing one triple
 * cannot also open the next, so `28.6&Z&|&U/L` is read as the atom `&Z&`, then a
 * field separator that splits, and not as `&Z`, then the atom `&|&` whose field
 * separator would not have split. Both alignments are in the bytes and they
 * disagree by one boundary. The reading is **not** changed (that would only pick
 * the other alignment, with no more evidence for it); it is reported through
 * `onAmbiguousAlignment`, and only where the earlier body was unrecognized, since
 * a recognized mnemonic is a construct this codec can interpret and the
 * competitor's body usually is not. That exclusion is wider than that argument:
 * see {@link AmbiguousAlignmentSink}.
 *
 * @param text - The field or repeat string to split.
 * @param delimiter - The delimiter to split on.
 * @param escape - The active escape character.
 * @param onAmbiguousAlignment - Called once per unrecognized escape sequence whose
 *   closing escape character could instead have opened a sequence holding this
 *   delimiter, so the boundary taken here is not the only reading of the bytes.
 * @param onShiftedFields - Called once per contested boundary where the escape
 *   character this reading resumes on heads no sequence of its own, so the boundary
 *   was bought with a byte the reading cannot read. Wired only by the split taken on
 *   the field separator: see {@link ShiftedFieldsSink} for why, and for the tail it
 *   deliberately does not report.
 * @param onTruncatedField - Called on that same condition, wired only by the split
 *   taken on the repeat separator, where the cost is not a shift but a field read as
 *   more repeats than the competing alignment gives it. Where that boundary is the
 *   **first** in the field the field's modeled reading stops at it; at a later one
 *   nothing modeled moves and this still fires. See {@link TruncatedFieldSink}.
 * @param onShiftedComponents - Called on that same condition again, wired only by the
 *   split taken on the component separator, where nothing shifts between fields and
 *   nothing leaves the record: every component after the boundary moves one slot along,
 *   so a test identity's coding scheme and local code, and a patient's given and middle
 *   names, are read out of positions the competing alignment does not put them in.
 *   Inside a **later repeat** nothing modeled moves and this still fires. See
 *   {@link ShiftedComponentsSink}.
 * @returns The raw segments, in order.
 * @example
 * ```ts
 * import { splitEscapeAware } from "@cosyte/astm";
 * splitEscapeAware("a^b^c", "^", "&"); // ["a", "b", "c"]
 * splitEscapeAware("1&S&40", "^", "&"); // ["1&S&40"]  (escape body is opaque)
 * splitEscapeAware("O&Brien^John", "^", "&"); // ["O&Brien", "John"]  (unpaired: literal)
 * ```
 */
export function splitEscapeAware(
  text: string,
  delimiter: string,
  escape: string,
  onAmbiguousAlignment?: AmbiguousAlignmentSink,
  onShiftedFields?: ShiftedFieldsSink,
  onTruncatedField?: TruncatedFieldSink,
  onShiftedComponents?: ShiftedComponentsSink,
): string[] {
  if (text.length === 0) return [""];
  const out: string[] = [];
  let current = "";
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (ch === escape && isEscapeSequenceAt(text, i, escape)) {
      // The closing escape character of this triple could have been the opening one of the next.
      // Where the alternative alignment would have held THIS delimiter, the two readings differ by
      // a boundary, and the leftmost one is a choice rather than a reading of the bytes.
      const contested = text.charAt(i + 3) === delimiter && text.charAt(i + 4) === escape;
      if (contested && !isMnemonicBody(text.charAt(i + 1))) {
        onAmbiguousAlignment?.(out.length);
      }
      // The other question about the same position, and it is not the same question: what does the
      // reading taken make of the bytes AFTER the boundary it just took? It resumes on the escape
      // character at i+4, which is the one the competing alignment needs to close its own triple.
      // Where that character heads no sequence, the reading taken bought a boundary and cannot read
      // the very byte it paid with; where it heads one, the reading taken interprets it and the
      // competing alignment is the one left holding a bare escape character. Only the first is
      // reported.
      //
      // ONE predicate, THREE sinks, deliberately. This split does not know which delimiter role it
      // is being taken on, and the role decides what the gained boundary costs: on the FIELD
      // separator every later field shifts, so a modeled slot changes hands; on the REPEAT separator
      // nothing shifts, and where the gained boundary is the FIRST one in the field the field's own
      // modeled reading stops at it, because a field is modeled out of its FIRST REPEAT alone; on
      // the COMPONENT separator nothing shifts between fields and nothing leaves the record, and
      // every component after the boundary moves one slot along, because components are modeled
      // INSIDE a field. Each of the last two fires at a position where nothing modeled moves (a
      // later repeat boundary, a component boundary in a later repeat) and does so anyway, which is
      // over-reporting relative to those slots and never under. The caller wires whichever sink
      // names its role. There is no fourth: nothing splits on the escape role.
      if (contested && !isEscapeSequenceAt(text, i + 4, escape)) {
        onShiftedFields?.(out.length);
        onTruncatedField?.(out.length);
        onShiftedComponents?.(out.length);
      }
      // Copy the whole escape sequence verbatim; do not inspect it for delimiters.
      current += text.slice(i, i + 3);
      i += 3;
      continue;
    }
    if (ch === delimiter) {
      out.push(current);
      current = "";
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  out.push(current);
  return out;
}
