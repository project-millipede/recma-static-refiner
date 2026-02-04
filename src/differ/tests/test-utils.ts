import { assert } from 'vitest';

import type { ScenarioInput } from './types';

/**
 * Resolves a scenario input that may be a direct value or a builder function.
 *
 * Note: Use builders only when you need fresh references (cycles/aliasing).
 * Prefer named builders defined near the scenario table.
 */
export function resolveScenarioInput<T>(input: ScenarioInput<T>): T {
  if (typeof input === 'function') {
    return (input as () => T)();
  }
  return input;
}

/**
 * Type guard that checks whether a runtime value is an array whose elements
 * all satisfy a provided element predicate.
 *
 * This is useful when the array shape alone is insufficient and the element
 * type must be proven to TypeScript without casts.
 *
 * @template T
 *   The element type established by the `isElement` predicate.
 * @param value
 *   The runtime value to validate.
 * @param isElement
 *   A predicate that returns `true` only when its input is a valid `T`.
 * @returns
 *   `true` when `value` is an array and every element satisfies `isElement`;
 *   otherwise `false`. When `true`, TypeScript narrows `value` to `readonly T[]`.
 */
export function isArrayOf<T>(
  value: unknown,
  isElement: (v: unknown) => v is T
): value is readonly T[] {
  return Array.isArray(value) && value.every(isElement);
}

/**
 * Asserts that a runtime value is an array and that every element satisfies
 * a provided element predicate.
 *
 * This helper is designed for tests: it produces a clear assertion failure
 * and provides reliable TypeScript narrowing via `asserts`.
 *
 * @template T
 *   The element type established by the `isElement` predicate.
 * @param value
 *   The runtime value to validate.
 * @param isElement
 *   A predicate that returns `true` only when its input is a valid `T`.
 * @param message
 *   Optional assertion message used when the value is not an array of `T`.
 * @returns
 *   Nothing. On success, TypeScript narrows `value` to `readonly T[]`.
 *   On failure, an assertion error is thrown.
 */
export function expectArrayOf<T>(
  value: unknown,
  isElement: (v: unknown) => v is T,
  message = 'Expected result to be an array'
): asserts value is readonly T[] {
  assert(isArrayOf(value, isElement), message);
}

/**
 * Asserts that a runtime value is an array.
 *
 * This helper is designed for tests: it produces a clear assertion failure
 * and provides TypeScript narrowing via `asserts`, without requiring casts.
 *
 * @param value
 *   The runtime value to validate.
 * @param message
 *   Optional assertion message used when the value is not an array.
 * @returns
 *   Nothing. On success, TypeScript narrows `value` to `readonly unknown[]`.
 *   On failure, an assertion error is thrown.
 */
export function expectArray(
  value: unknown,
  message = 'Expected result to be an array'
): asserts value is readonly unknown[] {
  assert(Array.isArray(value), message);
}
