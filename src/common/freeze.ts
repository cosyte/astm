/**
 * Deep-freeze helper for the immutable ASTM model.
 *
 * The parser returns plain readonly data; `deepFreeze` makes that immutability
 * enforced at runtime (a stray `msg.records[0].fields[0] = …` throws in strict
 * mode and is a no-op otherwise), which the shared `immutabilityProperty`
 * invariant asserts. Zero-dep, Node stdlib only.
 */

/**
 * Recursively freeze an object graph (objects and arrays), returning the same
 * reference typed as deeply readonly. Cyclic graphs are not produced by the
 * parser, so a simple recursive walk suffices.
 *
 * @param value - The value to freeze in place.
 * @returns The same value, now deeply frozen.
 * @example
 * ```ts
 * import { deepFreeze } from "@cosyte/astm";
 * const frozen = deepFreeze({ a: [1, 2] });
 * Object.isFrozen(frozen.a); // true
 * ```
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}
