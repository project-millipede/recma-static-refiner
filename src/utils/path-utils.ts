import { hasArrayIndex, isArray, isPlainObject } from '../guards';
import { PropertyPath } from '../types';

/**
 * Checks whether a single object key is configured to be preserved.
 *
 * Implicitly coerces numeric keys to strings to match standard JavaScript
 * behavior (e.g., matching AST key `0` against config `"0"`).
 *
 * @param key
 *   The object key to test.
 * @param preservedKeys
 *   The configured preserve set.
 * @returns
 *   `true` if the key (normalized to string) is present in `preservedKeys`.
 */
export function isKeyPreserved(
  key: string | number,
  preservedKeys: ReadonlySet<string>
): boolean {
  const lookupKey = String(key);
  return preservedKeys.has(lookupKey);
}

/**
 * Checks whether a property path should be excluded from diffing/patching.
 *
 * Once a preserved key appears anywhere in the path, the entire subtree beneath
 * that key is treated as opaque and skipped.
 *
 * Example:
 * - preservedKeys = new Set(['children'])
 * - path = ['children']              -> preserved (true)
 * - path = ['children', 0]           -> preserved (true)
 * - path = ['props', 'children', 1]  -> preserved (true)
 * - path = ['title']                 -> not preserved (false)
 *
 * @param path
 *   The property path segments produced by diffing.
 * @param preservedKeys
 *   Keys that should cause the path (and its subtree) to be preserved.
 * @returns
 *   `true` if any string segment in `path` matches a preserved key; otherwise `false`.
 */
export function isPathPreserved(
  path: PropertyPath,
  preservedKeys: ReadonlySet<string>
): boolean {
  for (const segment of path) {
    if (typeof segment === 'string' && isKeyPreserved(segment, preservedKeys)) {
      return true;
    }
  }
  return false;
}

export const TRAVERSE_MISSING = Symbol('recma.traverse.missing');

/**
 * Performs a single, guarded traversal step into a container value.
 *
 * Traversal rules:
 * 1. Arrays: the segment must be a numeric index that exists on the array.
 * 2. Objects: the segment must be an own property key.
 * 3. Everything else: not traversable.
 *
 * @param current
 *   The current container value to traverse into.
 * @param key
 *   The next path segment (array index or object key).
 * @returns
 *   The value at `current[key]`, or `TRAVERSE_MISSING` if the step is invalid.
 */
export function traverseStep(
  current: unknown,
  key: string | number
): unknown | typeof TRAVERSE_MISSING {
  // 1. Arrays
  if (isArray(current)) {
    if (!hasArrayIndex(current, key)) return TRAVERSE_MISSING;
    return current[key];
  }

  // 2. Objects
  if (isPlainObject(current)) {
    // Own-property check: ignores prototype/inherited properties to ensure
    // traversal only follows keys defined directly on the object instance.
    if (!Object.hasOwn(current, key)) return TRAVERSE_MISSING;

    return current[key];
  }

  // 3. Not traversable
  return TRAVERSE_MISSING;
}

/**
 * Checks whether a `PropertyPath` exists within the original, extracted structure.
 *
 * Purpose:
 * - Enforces the current "leaf-only" constraint by answering a single question:
 *   "Is there already something at this path that can be updated?"
 *
 * Current behavior:
 * - Returns `true` only when every segment can be traversed successfully using
 *   the same traversal rules as the differ/patcher (arrays by numeric index,
 *   objects by own keys).
 * - Returns `false` when any segment is missing or the structure is not traversable.
 *
 * Why this matters:
 * - The current patching strategy replaces values of existing AST nodes and does
 *   not insert new structural nodes (e.g. adding a missing property).
 * - This function can be used as a guard to avoid producing patches that would
 *   require structural insertion (such as schema defaults for missing props).
 *
 * Future extension:
 * - If structural "CREATE" is implemented, this function remains useful for
 *   verifying parent/container existence (e.g. checking `path.slice(0, -1)`)
 *   before attempting an insertion.
 *
 * @param root
 *   Root value to traverse.
 * @param path
 *   Path segments to check for existence.
 * @returns
 *   `true` if every segment can be traversed successfully; otherwise `false`.
 */
export function hasPath(root: unknown, path: PropertyPath): boolean {
  let current: unknown = root;

  for (const key of path) {
    const next = traverseStep(current, key);
    if (next === TRAVERSE_MISSING) return false;
    current = next;
  }

  return true;
}
