export type Guard<T> = (value: unknown) => value is T;

/**
 * Mapping of JavaScript `typeof` results to corresponding TypeScript types.
 * Used by the {@link is} factory.
 */
type PrimitiveTypeMap = {
  boolean: boolean;
  number: number;
  bigint: bigint;
  string: string;
  symbol: symbol;
  undefined: undefined;
};

/**
 * Creates a guard for a built-in primitive `typeof` check.
 *
 * @template T  One of the keys of {@link PrimitiveTypeMap}.
 * @param type  The primitive type keyword to compare against `typeof value`.
 * @returns     A guard that returns `true` iff `typeof value === type`.
 */
export function is<T extends keyof PrimitiveTypeMap>(
  type: T
): Guard<PrimitiveTypeMap[T]> {
  return (value: unknown): value is PrimitiveTypeMap[T] =>
    typeof value === type;
}

/** Guard verifying the value is a string. */
export const isString = is('string');

/** Guard verifying the value is a number (including NaN/Infinity). */
export const isNumber = is('number');

/** Guard verifying the value is a boolean. */
export const isBoolean = is('boolean');

/** Guard verifying the value is a bigint. */
export const isBigInt = is('bigint');

/** Guard verifying the value is a symbol. */
export const isSymbol = is('symbol');

/** Guard verifying the value is undefined. */
export const isUndefined = is('undefined');

/**
 * Guard verifying the value is `null`.
 *
 * Note:
 * `null` is a primitive value in JavaScript, but `typeof null === "object"` for
 * historical reasons, so it cannot be expressed via the `is(...)` factory.
 *
 * @param value
 *   Candidate runtime value to test.
 * @returns
 *   `true` iff {@link value} is exactly `null`.
 */
export function isNull(value: unknown): value is null {
  return value === null;
}

/**
 * Guard verifying the value is `NaN`.
 *
 * Note:
 * Uses `Number.isNaN` (no coercion), composed from {@link isNumber}.
 * This intentionally differs from the global `isNaN(...)`, which coerces inputs.
 *
 * @param value
 *   Candidate runtime value to test.
 * @returns
 *   `true` iff {@link value} is a number and is `NaN`.
 */
export function isNaNValue(value: unknown): value is number {
  return isNumber(value) && Number.isNaN(value);
}

/**
 * Guard verifying the value is a finite number.
 *
 * Semantics:
 * - true  for:  0, 1, -1, 1.5, -0
 * - false for:  NaN, Infinity, -Infinity, non-numbers
 *
 * @param value
 *   Candidate runtime value to test.
 * @returns
 *   `true` iff {@link value} is a number and is finite.
 */
export function isFiniteValue(value: unknown): value is number {
  return isNumber(value) && Number.isFinite(value);
}

/**
 * Guard verifying the value is `Infinity`.
 *
 * Note:
 * `Infinity` is a number value (`typeof Infinity === "number"`), so this is a
 * specialized refinement of {@link isNumber}.
 *
 * @param value
 *   Candidate runtime value to test.
 * @returns
 *   `true` iff {@link value} is exactly `Infinity`.
 */
export function isInfinityValue(value: unknown): value is number {
  return isNumber(value) && value === Infinity;
}

/**
 * Guard verifying the value is `-Infinity`.
 *
 * Note:
 * `-Infinity` is a number value (`typeof -Infinity === "number"`), so this is a
 * specialized refinement of {@link isNumber}.
 *
 * @param value
 *   Candidate runtime value to test.
 * @returns
 *   `true` iff {@link value} is exactly `-Infinity`.
 */
export function isNegativeInfinityValue(value: unknown): value is number {
  return isNumber(value) && value === -Infinity;
}

/**
 * Guard verifying the value is `-0`.
 *
 * Why `Object.is`:
 * JavaScript equality cannot distinguish `-0` from `0`:
 * - `-0 === 0` is true
 * - `-0 == 0`  is true
 *
 * `Object.is` can distinguish them:
 * - `Object.is(-0, 0)`   is false
 * - `Object.is(-0, -0)`  is true
 * - `Object.is(0, 0)`    is true
 *
 * Note:
 * This is composed from {@link isNumber} so the guard only claims `number`
 * when the runtime type is actually `number`.
 *
 * @param value
 *   Candidate runtime value to test.
 * @returns
 *   `true` iff {@link value} is a number and is exactly `-0`.
 */
export function isNegativeZeroValue(value: unknown): value is number {
  return isNumber(value) && Object.is(value, -0);
}

/**
 * Map for complex runtime categories to concrete TypeScript types.
 */
type ComplexTypeMap = {
  object: Record<string, unknown>;
  function: (...args: unknown[]) => unknown;
  array: unknown[];
};

/**
 * Creates a guard verifying the given value matches a complex runtime category.
 *
 * Notes:
 * - `"object"` excludes `null` and arrays.
 * - `"array"` uses `Array.isArray`.
 * - `"function"` uses `typeof === "function"`.
 */
export function isComplex<T extends keyof ComplexTypeMap>(
  type: T
): Guard<ComplexTypeMap[T]> {
  return (value: unknown): value is ComplexTypeMap[T] => {
    if (value === null) return false;

    if (type === 'array') {
      return Array.isArray(value);
    }

    if (type === 'object') {
      return typeof value === 'object' && !Array.isArray(value);
    }

    if (type === 'function') {
      return typeof value === 'function';
    }

    return false;
  };
}

/** Guard verifying the value is a non-null object (excluding arrays). */
export const isObject = isComplex('object');

/** Guard verifying the value is a function. */
export const isFunction = isComplex('function');

/** Guard verifying the value is an array. */
export const isArray = isComplex('array');

/**
 * Creates a guard verifying the value is an array whose elements all satisfy `elementGuard`.
 *
 * @param elementGuard
 *   Guard used to validate each element.
 * @returns
 *   A guard that narrows to `T[]` when the input is an array and every element passes.
 */
export function isArrayOf<T>(elementGuard: Guard<T>): Guard<T[]> {
  return (value: unknown): value is T[] =>
    isArray(value) && value.every(elementGuard);
}

/**
 * Creates a guard verifying the value is an object whose values all satisfy `valueGuard`.
 *
 * Notes:
 * - This validates enumerable own-property values via `Object.values(...)`.
 * - Keys are not validated; only value shapes are constrained.
 *
 * @param valueGuard
 *   Guard used to validate each object value.
 * @returns
 *   A guard that narrows to `Record<string, T>` when the input is a non-null
 *   non-array object and every value passes.
 */
export function isObjectOf<T>(valueGuard: Guard<T>): Guard<Record<string, T>> {
  return (value: unknown): value is Record<string, T> =>
    isObject(value) && Object.values(value).every(valueGuard);
}
