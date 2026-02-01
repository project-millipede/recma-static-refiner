import { type ObjectExpression } from 'estree';
import { type types, is } from 'estree-toolkit';
import { type PropertyPath } from './types';

/**
 * Determines whether a node is a "patchable props root" for this patcher.
 *
 * Patchable (in this module) means:
 * - The node is an object literal (`ObjectExpression`) that provides a stable local
 *   `properties[]` container for traversal and leaf-only edits.
 * - Leaf-only edits are limited to:
 *   - replacing existing `Property.value` nodes
 *   - editing existing `ArrayExpression.elements[index]` slots *within* that literal subtree
 *
 * JSX / compiled output context
 * -----------------------------
 * This function targets the wrapper object literal that becomes the props argument in the
 * compiled component call, conceptually:
 *
 *   _jsx(Component, { ...propsHere })
 *
 * Array patching depends on this wrapper object:
 * - Arrays are patched only when they appear as values inside the wrapper object:
 *
 *     <Comp items={[1, 2, 3]} />
 *     // wrapper: { items: [1, 2, 3] }  (ObjectExpression root)
 *
 * - An `ArrayExpression` is never treated as a valid props root. If the root expression is
 *   not the wrapper object literal (Identifier, CallExpression, conditional/logical
 *   expressions, spreads, etc.), there is no stable local object-literal structure to edit
 *   safely under the leaf-only strategy.
 *
 * @param node
 *   Candidate AST node.
 * @returns
 *   `true` if `node` is an `ObjectExpression`; otherwise `false`.
 */
export function isPatchablePropsRoot(
  node: types.Node | null | undefined
): node is ObjectExpression {
  return !!node && is.objectExpression(node);
}

/**
 * Checks whether a value is an array.
 *
 * Wrapper around `Array.isArray` that acts as a TypeScript **type guard**
 * (`value is T[]`). Note: `T` is not validated at runtime.
 *
 * @typeParam T  Assumed element type (defaults to `unknown`).
 * @param value  Value to test.
 * @returns      `true` if `value` is an array.
 */
export function isArray<T = unknown>(value: unknown): value is T[] {
  return Array.isArray(value);
}

/**
 * Checks whether a `PropertyPath` segment is a valid, existing array index.
 *
 * Guarantees:
 * 1. Numeric-only indexing
 *    - Array path segments must be numbers.
 *    - Prevents treating array object properties (e.g. "length", "map", custom props)
 *      as traversable path segments.
 *
 * 2. Property existence (not value inspection)
 *    - Checks whether the index exists on the array, regardless of the stored value.
 *    - Avoids value-based checks that would treat `undefined` as “missing”.
 *
 * 3. Own-property only
 *    - Uses `Object.hasOwn(arr, key)` rather than `key in arr`.
 *    - The `in` operator checks the prototype chain and can report an index as
 *      present if numeric properties exist on `Array.prototype`.
 *    - `Object.hasOwn` restricts the check to the array instance itself, matching
 *      traversal semantics where the path succeeds only when the array explicitly
 *      contains that index.
 *
 * 4. Order matters
 *    - The numeric type check happens before the existence lookup.
 *    - Ensures string keys never pass due to unrelated array properties.
 *
 * @template T
 *   Element type of the array (compile-time only).
 * @param arr
 *   Array instance to check.
 * @param key
 *   Candidate path segment (must be a number to be a valid array index).
 * @returns
 *   `true` if `key` is a number and that index exists as an own property on `arr`;
 *   otherwise `false`. When `true`, TypeScript narrows `key` to `number`.
 */
export function hasArrayIndex<T>(
  arr: readonly T[],
  key: string | number
): key is number {
  return typeof key === 'number' && Object.hasOwn(arr, key);
}

/**
 * Determines whether a value is a "plain object" (a simple POJO / dictionary
 * object).
 *
 * A value is considered plain if all of the following are true:
 * 1. It is not `null`.
 * 2. `typeof value === "object"`.
 * 3. Its prototype is either:
 *    - `Object.prototype` (typical object literals / `new Object()`), or
 *    - `null` (objects created via `Object.create(null)`).
 *
 * As a result, this returns `false` for common non-plain objects such as:
 * - Arrays
 * - Dates
 * - Maps and Sets
 * - Class instances
 * - Errors, RegExps, DOM nodes, and other host/boxed objects
 *
 * TypeScript:
 * - This function is a **type guard** because it returns a type predicate
 *   (`value is ...`).
 * - When it returns `true`, TypeScript will narrow `value` to
 *   `Record<PropertyKey, T>` in that branch.
 * - The generic `T` is a compile-time hint only; it is **not** validated at
 *   runtime.
 *
 * @typeParam T
 *   The (assumed) type of the object's property values after a successful check.
 * @param value
 *   The value to test.
 * @returns
 *   `true` if `value` is a plain object; otherwise `false`.
 */
export function isPlainObject<T = unknown>(
  value: unknown
): value is Record<PropertyKey, T> {
  if (typeof value !== 'object' || value === null) return false;

  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Narrowing helper for "object-like" values.
 *
 * Many type guards start from `unknown`. This helper provides a safe first step:
 * it checks that the value is a non-null object so properties can be read without
 * runtime errors and without type assertions.
 *
 * @param value
 *   Unknown value to test.
 * @returns
 *   `true` if `value` is a non-null object; otherwise `false`.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Type guard for `PropertyPath` (type narrowing predicate).
 *
 * A `PropertyPath` is the patch planner's stable addressing format for nested props:
 * an array of segments where:
 * - `string` segments address object keys (e.g. `"items"`, `"id"`)
 * - `number` segments address array indices (e.g. `0`, `1`)
 *
 * This guard is used when a `PropertyPath` is obtained from an untyped source (most
 * commonly `JSON.parse` of a serialized path key) to avoid type assertions.
 *
 * @param value
 *   Unknown value to validate.
 * @returns
 *   `true` if `value` is an array of `(string | number)` segments; otherwise `false`.
 */
export function isPropertyPath(value: unknown): value is PropertyPath {
  return (
    Array.isArray(value) &&
    value.every(seg => typeof seg === 'string' || typeof seg === 'number')
  );
}

/**
 * Checks whether a value is a traversable container.
 *
 * A value is considered traversable if it is:
 * 1. An Array, or
 * 2. A plain object (POJO / dictionary-like object).
 *
 * @param value  Value to test.
 * @returns      `true` if `value` is traversable; otherwise `false`.
 */
export function isTraversable(
  value: unknown
): value is Record<PropertyKey, unknown> | unknown[] {
  // Check arrays first since `Array.isArray` is usually a cheap, optimized
  // built-in.
  return isArray(value) || isPlainObject(value);
}
