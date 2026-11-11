/**
 * The parsed message is frozen exactly as `deepFreeze` would freeze it.
 *
 * The parse freezes each field as it builds it and walks the rest of the message once, by its own
 * keys, rather than calling `deepFreeze` over the whole tree. These hold the two to the same
 * result: every object and array a caller can reach is frozen, and a key the message inherits
 * rather than owns is never followed, the way `Object.keys` never lists one.
 */

import { describe, expect, it } from "vitest";

import { parseAstmRecords } from "../../src/index.js";

const STREAM = "H|\\^&\rP|1||||DOE^JANE\rO|1|S1||^^^GLU\rR|1|^^^GLU|5.5|mmol/L|1-2|N||F\rL|1\r";

/** Every object and array reachable from `value` by its own enumerable keys. */
function reachable(value: unknown, out: object[] = []): object[] {
  if (value === null || typeof value !== "object") return out;
  out.push(value);
  for (const key of Object.keys(value)) reachable((value as Record<string, unknown>)[key], out);
  return out;
}

describe("the parsed message is frozen as deepFreeze freezes it", () => {
  it("freezes every object and array a caller can reach", () => {
    const nodes = reachable(parseAstmRecords(STREAM));
    expect(nodes.length).toBeGreaterThan(50);
    expect(nodes.filter((n) => !Object.isFrozen(n))).toEqual([]);
  });

  it("does not follow a key the message inherits rather than owns", () => {
    const inherited = { reachedThroughThePrototype: true };
    Object.defineProperty(Object.prototype, "astmInheritedProbe", {
      value: inherited,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    let frozen: boolean;
    try {
      parseAstmRecords(STREAM);
      frozen = Object.isFrozen(inherited);
    } finally {
      delete (Object.prototype as Record<string, unknown>)["astmInheritedProbe"];
    }
    expect(frozen).toBe(false);
  });
});
