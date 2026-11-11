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

/**
 * {@link deepFreeze} for an object graph the parser built itself: the same walk, freezing the same
 * objects and stopping at the same already-frozen ones, without the key array `Object.keys` makes
 * for every object it visits. An array is walked by index and an object by its own enumerable keys,
 * which for the plain objects and arrays the parser builds are exactly the keys `Object.keys` lists.
 *
 * @internal
 */
export function freezeBuilt<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) freezeBuilt(value[i] as unknown);
    return value;
  }
  const record = value as Record<string, unknown>;
  for (const key in record) {
    if (Object.hasOwn(record, key)) freezeBuilt(record[key]);
  }
  return value;
}
