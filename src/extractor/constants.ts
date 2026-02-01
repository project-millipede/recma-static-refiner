/**
 * Represents a successful static resolution.
 *
 * Meaning:
 * - The input node was statically resolvable under the current resolver allowlist.
 * - The returned `value` is what the node **evaluates to** under JavaScript
 *   evaluation rules (i.e., a compile-time simulation of runtime semantics).
 *
 * Usage:
 * - Consumers should branch on `result.success`.
 * - When `success: true`, `value` is available and should be treated as the
 *   node's evaluated constant.
 */
export type StaticSuccess<T> = {
  /**
   * Discriminant flag indicating the resolution succeeded.
   */
  success: true;

  /**
   * The value the node evaluates to (static evaluation result).
   *
   * Note:
   * This may legitimately be `undefined`; this is distinct from failure
   * (`success: false`).
   */
  value: T;
};

/**
 * Represents a failed static resolution.
 *
 * Meaning:
 * - The input node could not be resolved to a static evaluated value under the
 *   current resolver allowlist (e.g., dynamic identifiers, function calls,
 *   unsupported operators, etc.).
 *
 * Contract:
 * - Failure carries no value payload.
 * - Callers should treat this as "dynamic / unresolvable" and apply their
 *   container policy (omit key, bail out, etc.).
 */
export type StaticFailure = {
  /**
   * Discriminant flag indicating the resolution failed.
   */
  success: false;
};

/**
 * Discriminated union representing the outcome of a static resolution attempt.
 *
 * Pattern:
 * - `success: true`  => an evaluated value is available (`StaticSuccess<T>`)
 * - `success: false` => resolution failed (`StaticFailure`)
 *
 * Rationale:
 * This pattern cleanly distinguishes:
 * - "evaluates to undefined" (success with `value === undefined`)
 * from:
 * - "could not resolve"      (failure)
 */
export type StaticResult<T = unknown> = StaticSuccess<T> | StaticFailure;

/**
 * Canonical failure sentinel for "unresolvable".
 *
 * Notes:
 * - Shared sentinel avoids repeated object allocation at failure sites.
 * - Typed as `StaticFailure` to preserve the discriminant precisely.
 */
export const UNRESOLVED: StaticFailure = { success: false } as const;

/**
 * Constructs a successful static resolution result.
 *
 * @param value
 *   The evaluated value to wrap (result of static evaluation).
 * @returns
 *   A {@link StaticSuccess} wrapper containing `value`.
 */
export function resolved<T>(value: T): StaticSuccess<T> {
  return { success: true, value };
}

/**
 * Internal control sentinel for static extraction.
 *
 * Semantics:
 * Represents a "Non-static" signal within the recursion engine.
 * It indicates that a subtree does not match the definitions in
 * {@link StaticDataPatterns} and cannot be decoded into a static value.
 *
 * Architecture:
 * When extraction cannot produce a deterministic value, the extractor returns
 * this sentinel to signal that the subtree is non-static.
 *
 * Call sites handle this signal based on their context:
 *
 * 1. Recursive Containers (Internal):
 *    - Arrays: Reject the entire array (Strict Policy).
 *    - Objects: Omit the specific property (Partial Policy).
 *
 * 2. Root Boundary (External):
 *    - Treat the result as non-extractable (return `null` or `undefined`).
 *
 * Implementation Strategy:
 * Uses `Symbol.for` to ensure global identity.
 * This guarantees that the signal returned by the recursion engine matches the
 * check performed by adapters (like `extractStaticProps`), even if they are
 * loaded from duplicate module instances ("Dual Package" hazard).
 *
 * Contract:
 * - Internal: Used strictly for recursion control.
 * - Public: Must NEVER leak into the final data model.
 */
export const SKIP_VALUE = Symbol.for('recma.extraction.skip');
