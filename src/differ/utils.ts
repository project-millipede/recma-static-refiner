import type { Container, Node, Options, DiffResult } from './types';

/**
 * Defines the internal tag strings for "Rich" built-in types that should be
 * treated as atomic values rather than traversable containers.
 *
 * Uses the exact internal tag strings returned by `Object.prototype.toString`
 * (e.g., "[object Date]") instead of checking `constructor.name`.
 *
 * Rationale for using `Object.prototype.toString.call(value)`:
 * 1. Minification Safety:
 *    Build tools often rename class constructors to save space
 *    (e.g., `Date` becomes `class d`).
 *    -> Relying on `.constructor.name` breaks in production.
 *    The internal tag `"[object Date]"` is guaranteed by the spec and
 *    cannot be minified.
 * 2. Robustness:
 *    The `.constructor` property is mutable and can be spoofed or deleted.
 *    -> `Object.prototype.toString` accesses the internal slot of the object.
 */
const Tag = {
  String: '[object String]',
  Number: '[object Number]',
  Boolean: '[object Boolean]',
  BigInt: '[object BigInt]',
  Date: '[object Date]',
  RegExp: '[object RegExp]'
} as const;

/**
 * A lookup set for O(1) checking of rich types.
 */
const RICH_TYPES = new Set<string>([
  // Boxed Primitives
  Tag.String,
  Tag.Number,
  Tag.Boolean,
  Tag.BigInt,
  // Complex Types
  Tag.Date,
  Tag.RegExp
]);

/**
 * Determines if a value is a "Rich" built-in type
 * (Date, RegExp, String, Number, Boolean).
 *
 * Relies on the safe type identification logic defined in `Tag` to avoid
 * issues with minification or cross-realm objects.
 *
 * @param value - The object to inspect.
 * @returns `true` if the object is one of the supported rich types.
 */
export function isRichType(value: object): boolean {
  return RICH_TYPES.has(Object.prototype.toString.call(value));
}

/**
 * Extracts the underlying primitive value from a wrapper object.
 *
 * Precondition:
 * The input object must be a valid wrapper type (`Number`, `String`, `Boolean`)
 * that implements `.valueOf()`.
 *
 * @template T - The expected primitive return type.
 * @param wrapper - The wrapper object to unbox.
 * @returns The unboxed primitive value.
 */
function unbox<T>(wrapper: object): T {
  // Asserts a structural contract containing .valueOf() to allow property
  // access while maintaining type safety.
  return (wrapper as { valueOf(): T }).valueOf();
}

/**
 * Compares two objects representing atomic static values by their content
 * rather than their reference.
 *
 * Supported types:
 * - Boxed Primitives:
 *   - `Number`, `String`, `Boolean`, `BigInt`.
 * - Complex Types:
 *   - `Date` (compared by timestamp),
 *   - `RegExp` (compared by pattern).
 *
 * Uses strict internal type tags to ensure safety before unboxing or converting
 * values for comparison.
 *
 * @param left - The first object to compare.
 * @param right - The second object to compare.
 * @returns `true` if both objects represent the same value.
 */
export function areBoxedPrimitivesEqual(left: object, right: object): boolean {
  const leftTypeTag = Object.prototype.toString.call(left);
  const rightTypeTag = Object.prototype.toString.call(right);

  // If underlying types are different (e.g. String vs Number), they cannot be equal.
  if (leftTypeTag !== rightTypeTag) return false;

  switch (leftTypeTag) {
    // Group 1: Rely on .valueOf() (via unbox)
    case Tag.Number: {
      const leftValue = unbox<number>(left);
      const rightValue = unbox<number>(right);

      /**
       * 1. Special Handling for NaN
       *    In JavaScript, `NaN === NaN` is false.
       *    This check treats two NaN values as equal to prevent reporting a
       *    change whenever a value remains NaN.
       */
      if (Number.isNaN(leftValue)) {
        return Number.isNaN(rightValue);
      }

      /**
       * 2. Standard Equality (Infinity & Finite Numbers)
       *    Unlike NaN, Infinity adheres to standard strict equality rules:
       *    - Infinity === Infinity   -> true
       *    - Infinity === -Infinity  -> false
       */
      return leftValue === rightValue;
    }

    case Tag.String:
      return unbox<string>(left) === unbox<string>(right);
    case Tag.Boolean:
      return unbox<boolean>(left) === unbox<boolean>(right);
    case Tag.BigInt:
      return unbox<bigint>(left) === unbox<bigint>(right);
    case Tag.Date:
      return unbox<number>(left) === unbox<number>(right);

    // Group 2: Relies on .toString()
    case Tag.RegExp:
      return left.toString() === right.toString();

    default:
      return false;
  }
}

/**
 * Determines if two arrays are shallowly equal.
 *
 * This function handles comparison with the following priorities:
 *
 * 1. Reference Equality:
 *    Returns `true` immediately if inputs refer to the same array instance.
 * 2. Content Equality:
 *    Returns `true` if both arrays contain the same elements in the same order.
 * 3. Safety:
 *    Accepts `null` or `undefined` arguments without throwing runtime errors.
 *
 * Note:
 * Uses `Object.is` for comparison. This differs from strict equality (`===`) in two ways:
 * 1. NaN Handling:
 *    Treats `NaN` as equal to `NaN` (whereas `NaN === NaN` is false).
 * 2. Signed Zeros:
 *    Treats `+0` and `-0` as distinct values (whereas `+0 === -0` is true).
 *
 * @template V - The type of elements in the array.
 * @param left - The first array to compare.
 * @param right - The second array to compare.
 * @returns `true` if the arrays are referentially or content-wise equal.
 */
export function areArraysShallowEqual<V>(
  left: readonly V[],
  right: readonly V[]
): boolean {
  if (left === right) return true;

  // Verify lengths are equal, safely handling null or undefined inputs.
  if (left?.length !== right?.length) return false;

  /*
   * Checks if every element in 'left' matches the element at the same index in 'right'
   * Returns false immediately if a mismatch is found.
   */
  return left.every((val, index) => Object.is(val, right[index]));
}

/**
 * Merges the provided partial options with the library's default configuration.
 *
 * Default settings:
 * - `trackCircularReferences`: `true` (prevents stack overflows).
 * - `arrays`: `'atomic'` (treats arrays as single units).
 * - `arrayEquality`: `'reference'` (strictest and fastest equality check).
 * - `keysToSkip`: `[]` (skips nothing).
 *
 * @param options - The user-provided partial options.
 * @returns A complete `Options` object with all fields initialized.
 */
export function normalizeOptions(options: Partial<Options>): Options {
  return {
    trackCircularReferences: true,
    arrays: 'atomic',
    arrayEquality: 'reference',
    keysToSkip: [],
    ...options
  };
}

/**
 * Determines if a value is a traversable container (Object or Array) rather
 * than a primitive or null.
 * Acts as a type guard to narrow `unknown` values to `Container<V>`.
 *
 * @template V - The type of leaf values within the container.
 * @param value - The value to inspect.
 * @returns `true` if the value is a non-null object.
 */
export function isContainer<V>(value: unknown): value is Container<V> {
  return typeof value === 'object' && value !== null;
}

/**
 * Retrieves a child node from a container using a unified string key access
 * mechanism.
 *
 * Implementation Detail:
 * 1. Strict Indexing:
 *    TypeScript enforces strict rules where Arrays must be accessed via numeric
 *    indices, while Objects use string keys.
 * 2. Runtime Disambiguation:
 *    The function checks `Array.isArray` to determine the underlying container type.
 * 3. Type Compliance:
 *    If the container is an Array, the key is converted to a `number`.
 *    This satisfies the type definition while preserving strict type safety.
 *
 * @template V - The type of leaf values within the container.
 * @param container - The parent node (Object or Array).
 * @param key - The property name or index as a string (typically from `Object.keys`).
 * @returns The value at the specified key, or `undefined`.
 */
export function getSafeValue<V>(
  container: Container<V>,
  key: string
): Node<V> | undefined {
  if (Array.isArray(container)) {
    return container[Number(key)];
  }
  return container[key];
}

/**
 * Determines if a specific key should be skipped during comparison based on the
 * configuration.
 *
 * Rules:
 * 1. Object Scope:
 *    Keys are ignored if they appear in `keysToSkip` AND the parent container
 *    is an object.
 * 2. Array Integrity:
 *    Array indices are *never* skipped (even if `keysToSkip` contains numeric
 *    strings) to ensure sequence order is preserved.
 *
 * @param key - The property key to check.
 * @param isContainerArray - Indicates if the parent container is an array.
 * @param keysToSkip - The list of keys to ignore (optional).
 * @returns `true` if the key should be ignored.
 */
export function shouldSkipKey(
  key: string,
  isContainerArray: boolean,
  keysToSkip?: readonly string[]
): boolean {
  // 1. Array Guard:
  //    Indices must be preserved to maintain sequence integrity.
  if (isContainerArray) return false;

  // 2. Availability Check:
  //    Exit early if the skip list is missing or undefined.
  if (!keysToSkip) return false;

  // 3. Membership Check:
  //    Determine if the key is explicitly excluded.
  return keysToSkip.includes(key);
}

/**
 * Converts a raw iteration key (string) into the correct path segment type.
 *
 * - If the container is an Array, the key is converted to a `number`.
 * - If the container is an Object, the key remains a `string`.
 *
 * @param key - The raw key string.
 * @param isContainerArray - Indicates if the parent container is an array.
 * @returns A number if the container is an array, otherwise the original string.
 */
export function formatPathKey(
  key: string,
  isContainerArray: boolean
): string | number {
  return isContainerArray ? Number(key) : key;
}

/**
 * Prepends a path segment to the `path` array of every difference in the
 * provided list.
 *
 * This is used during the recursive "bubble up" phase to construct the full
 * path from the root to the leaf difference.
 *
 * Performance Note:
 * This function uses in-place mutation (`unshift`) to support the "Bottom-Up"
 * path construction strategy.
 *
 * @see compareChildren - For the detailed architectural rationale regarding
 * Bottom-Up (lazy) vs. Top-Down (eager) path construction.
 *
 * @template TNode - The type of the node value (usually `Node<V>`).
 * @param differences - The list of differences generated from child nodes.
 * @param pathSegment - The current property key or index to prepend.
 * @returns The same array of differences with updated paths (mutated in place for performance).
 */
export function prependPath<TNode>(
  differences: DiffResult<TNode>[],
  pathSegment: string | number
): DiffResult<TNode>[] {
  for (const difference of differences) {
    difference.path.unshift(pathSegment);
  }
  return differences;
}

/**
 * Factory function to construct a `DiffChange` object.
 * Standardizes the creation of modification events.
 *
 * @template V - The type of leaf values.
 * @param path - The full path to the changed node.
 * @param value - The new value in the current state.
 * @param oldValue - The previous value in the old state.
 * @returns A structured `DiffChange` object.
 */
export function createChange<V>(
  path: (string | number)[],
  value: Node<V>,
  oldValue: Node<V>
): DiffResult<Node<V>> {
  return { type: 'CHANGE', path, value, oldValue };
}

/**
 * Factory function to construct a `DiffCreate` object.
 * Standardizes the creation of addition events.
 *
 * @template V - The type of leaf values.
 * @param path - The full path to the new node.
 * @param value - The value that was added.
 * @returns A structured `DiffResult` object representing a creation.
 */
export function createCreate<V>(
  path: (string | number)[],
  value: Node<V>
): DiffResult<Node<V>> {
  return { type: 'CREATE', path, value };
}

/**
 * Factory function to construct a `DiffRemove` object.
 * Standardizes the creation of deletion events.
 *
 * @template V - The type of leaf values.
 * @param path - The full path to the removed node.
 * @param oldValue - The value that was removed.
 * @returns A structured `DiffResult` object representing a removal.
 */
export function createRemove<V>(
  path: (string | number)[],
  oldValue: Node<V>
): DiffResult<Node<V>> {
  return { type: 'REMOVE', path, oldValue };
}
