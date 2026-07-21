/**
 * The **host-query flow**: classify a message as a request, a result upload, an
 * order download, or indeterminate — Phase 4.
 *
 * On real analyzers the host-query mode is first-class and sometimes mandatory
 * (on the Roche cobas 4800 there is *no* results-sending-only option): the
 * analyzer sends an `H/P/Q/L` **request** and the LIS answers with an `H/P/O/L`
 * **response**. Misreading a query as a result upload (or the reverse) breaks the
 * order flow, so this module makes the distinction **explicit**:
 *
 * **The `Q` record dominates.** Any message carrying a `Q` (request-information)
 * record is classified `host-query` — a request — and is **never** treated as a
 * result set, even if a result record is also present (an anomaly, which the
 * parser flags separately with `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND`). This is the
 * whole point: a `Q`-bearing message can never silently read as a result upload.
 */

import type { AstmMessageClassification, AstmRecord } from "./types.js";

/**
 * Classify a record stream by the host-query flow. Pure and total — it only reads
 * the record type letters, never a field value.
 *
 * `Q` dominates: a message with any `Q` record is a `host-query` request even when
 * a result (`R`) record is also present, so a query is never misread as a result
 * upload. (The `Q`+`R` anomaly is separately warned at parse time.)
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
  for (const r of records) {
    if (r.type === "Q") hasQuery = true;
    else if (r.type === "R") hasResults = true;
    else if (r.type === "O") hasOrders = true;
  }

  // `Q` dominates so a query is never read as a result set; then results, then orders.
  let kind: AstmMessageClassification["kind"];
  if (hasQuery) kind = "host-query";
  else if (hasResults) kind = "results";
  else if (hasOrders) kind = "orders";
  else kind = "indeterminate";

  return { kind, hasQuery, hasResults, hasOrders, isHostQueryRequest: kind === "host-query" };
}
