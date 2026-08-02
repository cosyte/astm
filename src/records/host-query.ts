/**
 * The **host-query flow**: classify a message as a request, a result upload, an
 * order download, or indeterminate.
 *
 * On real analyzers the host-query mode is first-class and sometimes mandatory
 * (on the Roche cobas 4800 there is *no* results-sending-only option): the
 * analyzer sends an `H/P/Q/L` **request** and the LIS answers with an `H/P/O/L`
 * **response**. Misreading a query as a result upload (or the reverse) breaks the
 * order flow, so this module makes the distinction **explicit**:
 *
 * **The `Q` record dominates.** Any message carrying a `Q` (request-information)
 * record is classified `host-query`, a request, and is **never** treated as a
 * result set, even if a result record is also present (an anomaly, which the
 * parser flags separately with `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND`). This is the
 * whole point: a `Q`-bearing message can never silently read as a result upload.
 *
 * **A letter the reader could not recognize blocks a positive answer.** The rule
 * above is stated on a count of type letters, so it only holds while every letter
 * was legible. A record whose type is unsupported may be the very `Q` the rule
 * exists to honor, and reading such a message as a result set is exactly the
 * outcome the rule forbids. So an unsupported record, with no `Q` to settle the
 * question, yields `indeterminate` rather than `results` or `orders`: the honest
 * answer is that the kind is not knowable, and the parser reports the unreadable
 * letter separately with `ASTM_RECORD_UNKNOWN_TYPE`. A `Q` that *was* read still
 * dominates, because an unreadable letter can only ever add a kind, never remove
 * the query that is already there.
 */

import type { AstmMessageClassification, AstmRecord } from "./types.js";

/**
 * Classify a record stream by the host-query flow. Pure and total: it only reads
 * the record type letters, never a field value.
 *
 * `Q` dominates: a message with any `Q` record is a `host-query` request even when
 * a result (`R`) record is also present, so a query is never misread as a result
 * upload. (The `Q`+`R` anomaly is separately warned at parse time.)
 *
 * An **unsupported** record letter with no `Q` alongside it yields `indeterminate`,
 * never `results` or `orders`: an unreadable letter may have been the `Q`, and
 * claiming a positive kind over it is how a query comes to read as a result set.
 * {@link AstmMessageClassification.hasUnrecognized} reports why the answer is
 * withheld, and the `has*` counts stay truthful throughout.
 *
 * @param records - The parsed records, in wire order.
 * @returns The message classification.
 * @example
 * ```ts
 * import { classifyMessage, parseAstmRecords } from "@cosyte/astm";
 * const msg = parseAstmRecords("H|\\^&\rP|1\rQ|1|^SPEC-7||ALL\rL|1\r");
 * classifyMessage(msg.records).kind; // "host-query"
 * ```
 */
export function classifyMessage(records: readonly AstmRecord[]): AstmMessageClassification {
  let hasQuery = false;
  let hasResults = false;
  let hasOrders = false;
  let hasUnrecognized = false;
  for (const r of records) {
    if (r.type === "Q") hasQuery = true;
    else if (r.type === "R") hasResults = true;
    else if (r.type === "O") hasOrders = true;
    else if (r.type === "unsupported") hasUnrecognized = true;
  }

  // `Q` dominates so a query is never read as a result set; then results, then orders.
  //
  // An unrecognized letter sits between the two: it cannot cancel a `Q` that was read (the query is
  // there on the wire either way), but with no `Q` read it leaves the kind genuinely unknown, and
  // answering `results` over it is precisely the misreading the `Q`-dominates rule exists to
  // prevent. Withholding the positive answer keeps that guarantee true of a mangled letter as well
  // as a legible one, and costs only a claim the reader was not entitled to make.
  let kind: AstmMessageClassification["kind"];
  if (hasQuery) kind = "host-query";
  else if (hasUnrecognized) kind = "indeterminate";
  else if (hasResults) kind = "results";
  else if (hasOrders) kind = "orders";
  else kind = "indeterminate";

  return {
    kind,
    hasQuery,
    hasResults,
    hasOrders,
    hasUnrecognized,
    isHostQueryRequest: kind === "host-query",
  };
}
