import type { PropertyPath } from '../types';
import {
  isInfinityValue,
  isNaNValue,
  isNegativeInfinityValue,
  isNegativeZeroValue,
  isNumber
} from './type-guards';

/**
 * PropertyPath segments are the only units that participate in patch indexing.
 * Keep this narrow and strict: a segment is either a string key or a numeric index/key.
 */
export type PropertyPathSegment = string | number;

/**
 * Canonicalizing PropertyPath for stable indexing
 * -----------------------------------------------
 * Patch planning and patch application must agree on a canonical, comparable key
 * for a logical {@link PropertyPath} (e.g. `["items", 0, "id"]`).
 *
 * The implementation uses {@link JSON.stringify} as the canonical key encoding.
 * However, JSON has a lossy edge case: it cannot represent non-finite numbers.
 *
 * Examples (lossy):
 * - `JSON.stringify([NaN])`       -> `"[null]"`
 * - `JSON.stringify([Infinity])`  -> `"[null]"`
 * - `JSON.stringify([-Infinity])` -> `"[null]"`
 *
 * If a path segment is ever a non-finite number (whether produced by the static
 * resolver, introduced by future resolver expansions, or supplied externally),
 * that lossiness can cause collisions in Map/Set indexing.
 *
 * This module prevents that by canonicalizing such segments into stable string
 * tokens before stringification, while keeping finite numbers as numbers.
 *
 * Provenance visibility:
 * Canonicalization is split into stages (Identifier / Unary / Arithmetic / Template)
 * to mirror the resolver architecture (e.g. `tryResolveIdentifier` today, and future
 * unary/binary support), so it remains obvious which class of operation introduced
 * which kind of segment.
 */

/**
 * A single canonicalization strategy applied to one path segment.
 *
 * Note:
 * This operates on segments (not on full JSON trees), which keeps typing strict
 * and avoids JSON.stringify's "root container" callback signature.
 */
export type SegmentCanonicalizer = (
  segment: PropertyPathSegment
) => PropertyPathSegment;

/**
 * Dispatcher: runs a list of segment canonicalizers in order.
 *
 * This mirrors the resolver dispatcher style (e.g. `tryResolveLiteral -> tryResolveIdentifier -> ...`),
 * but applies to PropertyPath serialization stability rather than AST evaluation.
 *
 * @param canonicalizers
 *   Ordered list of canonicalization strategies to apply.
 * @returns
 *   A single canonicalizer that applies all strategies in sequence.
 */
function composeSegmentCanonicalizers(
  canonicalizers: ReadonlyArray<SegmentCanonicalizer>
): SegmentCanonicalizer {
  return function canonicalizeComposed(
    segment: PropertyPathSegment
  ): PropertyPathSegment {
    let currentSegment = segment;
    for (const canonicalize of canonicalizers) {
      currentSegment = canonicalize(currentSegment);
    }
    return currentSegment;
  };
}

/**
 * Identifier-domain canonicalization.
 *
 * Handles non-finite numeric constants that can arise directly from identifier
 * resolution (e.g. `NaN`, `Infinity`).
 *
 * Note:
 * `-Infinity` is not an identifier constant and is intentionally excluded here.
 *
 * @param segment
 *   The current path segment to canonicalize.
 * @returns
 *   The canonicalized segment (may be converted to a string token).
 */
function canonicalizeIdentifierNumberConstants(
  segment: PropertyPathSegment
): PropertyPathSegment {
  if (!isNumber(segment)) return segment;

  if (isNaNValue(segment)) return 'NaN';
  if (isInfinityValue(segment)) return 'Infinity';

  return segment;
}

/**
 * Template-domain canonicalization.
 *
 * Currently a no-op because template resolution yields strings, which are already
 * stable path segments. Kept for symmetry and future extension.
 *
 * @param segment
 *   The current path segment to canonicalize.
 * @returns
 *   The segment unchanged.
 */
function canonicalizeTemplateResults(
  segment: PropertyPathSegment
): PropertyPathSegment {
  return segment;
}

/**
 * Unary-domain canonicalization.
 *
 * Handles numeric edge cases commonly introduced by unary forms (or unary-like results)
 * and ensures deterministic representation for path-key serialization.
 *
 * @param segment
 *   The current path segment to canonicalize.
 * @returns
 *   The canonicalized segment:
 *   - `-0` is normalized to `0`
 *   - `-Infinity` is preserved as the string token `"-Infinity"`
 *   - other values are returned unchanged
 */
export function canonicalizeUnaryNumberResults(
  segment: PropertyPathSegment
): PropertyPathSegment {
  if (!isNumber(segment)) return segment;

  // Canonicalize -0 to 0 to align with stable property-name semantics.
  if (isNegativeZeroValue(segment)) return 0;

  // Preserve negative infinity as a stable token (JSON cannot represent it).
  if (isNegativeInfinityValue(segment)) return '-Infinity';

  return segment;
}

/**
 * Arithmetic-domain canonicalization (future-facing).
 *
 * Safety net for any numeric results produced by arithmetic/binary evaluation once supported
 * (and for externally constructed paths today).
 *
 * @param segment
 *   The current path segment to canonicalize.
 * @returns
 *   The canonicalized segment (non-finite numbers become stable string tokens).
 */
export function canonicalizeArithmeticNumberResults(
  segment: PropertyPathSegment
): PropertyPathSegment {
  if (!isNumber(segment)) return segment;

  if (isNaNValue(segment)) return 'NaN';
  if (isInfinityValue(segment)) return 'Infinity';
  if (isNegativeInfinityValue(segment)) return '-Infinity';

  return segment;
}

/**
 * Master segment canonicalizer for PropertyPath stringification.
 *
 * Ordering is not about correctness (each step is value-based and idempotent),
 * but about keeping provenance explicit and maintainable as resolver capabilities grow.
 */
const propertyPathSegmentCanonicalizer: SegmentCanonicalizer =
  composeSegmentCanonicalizers([
    canonicalizeIdentifierNumberConstants,
    canonicalizeTemplateResults
    // canonicalizeUnaryNumberResults,
    // canonicalizeArithmeticNumberResults
  ]);

/**
 * Produces a canonicalized copy of a {@link PropertyPath} suitable for stable string keys.
 * Does not mutate the input path.
 *
 * @param path
 *   The logical property path to canonicalize.
 * @returns
 *   A new array of canonicalized path segments.
 */
function canonicalizePropertyPath(path: PropertyPath): PropertyPathSegment[] {
  return path.map(segment => propertyPathSegmentCanonicalizer(segment));
}

/**
 * Produces the canonical key used for Map/Set lookups.
 *
 * Use this everywhere you currently use `JSON.stringify(PropertyPath)` for indexing.
 *
 * @param path
 *   The logical property path to stringify.
 * @returns
 *   A stable, canonical string key for indexing.
 */
export function stringifyPropertyPath(path: PropertyPath): string {
  return JSON.stringify(canonicalizePropertyPath(path));
}
