import { types } from 'estree-toolkit';

import type {
  ExpressionRefPlaceholder,
  PreservedSubtreeLifecycle
} from './architecture';

import { isPropertyPath, isRecord } from './guards';
import { type PropertyPath } from './types';

/**
 * Discriminant brand used to identify ExpressionRef objects.
 *
 * Implementation Strategy:
 *
 * 1. Mechanism: Global Identity
 *    `Symbol.for('...')` registers the symbol in the global runtime registry.
 *    This ensures that every call with the same key returns the exact same
 *    primitive reference, regardless of where the code is executed within the
 *    JavaScript environment.
 *
 * 2. The Hazard: "Dual Package" / Multiple Bundles
 *    If standard `Symbol()` were used, it would create a strictly unique reference
 *    every time the module is evaluated. In complex build setups, the library
 *    might be loaded twice (e.g., once by the app, once by a plugin dependency):
 *
 *      my-project/
 *        node_modules/
 *          my-library/             <-- Instance 1 (Evaluates Symbol A)
 *          other-plugin/
 *            node_modules/
 *              my-library/         <-- Instance 2 (Evaluates Symbol B)
 *
 *    In this scenario, `Symbol A !== Symbol B`. A type guard running in Instance 2
 *    would fail to recognize data created by Instance 1.
 *
 * 3. Application: Extractor-Patcher Agreement
 *    In this architecture, `ExpressionRef` objects are persistent data carriers
 *    that bridge two distinct lifecycle phases:
 *      - Creation: The Extractor produces these objects.
 *      - Consumption: The Patcher consumes them (via type guards like `isExpressionRef`).
 *    These phases often run in different contexts (e.g., distinct build steps or
 *    bundle chunks). They must agree on the brand identity to successfully
 *    hand off the preserved subtrees.
 *
 * 4. Naming Convention
 *    The prefix `recma.preservation` indicates that this symbol underpins the
 *    "Preserved Subtree" mechanism. This is a shared architectural concept
 *    spanning both extraction and patching, rather than a utility scoped strictly
 *    to the extractor.
 */
const EXPRESSION_REF_KIND = Symbol.for('recma.preservation.expression_ref');

/**
 * Concrete implementation of the {@link ExpressionRefPlaceholder}.
 *
 * This value is carried through extraction/validation as plain data.
 * The actual ESTree expression is stored separately in the side channel.
 */
type ExpressionRef = {
  /**
   * Discriminant brand tag.
   * See {@link ExpressionRefPlaceholder} (Structure: Brand).
   */
  __kind: typeof EXPRESSION_REF_KIND;

  /**
   * Path to the preserved subtree within extracted props.
   * See {@link ExpressionRefPlaceholder} (Structure: Pointer).
   */
  path: PropertyPath;
};

/**
 * Resolves an {@link ExpressionRef} placeholder back into its original ESTree
 * expression.
 *
 * This implements the restoration step of the {@link PreservedSubtreeLifecycle}.
 * It retrieves the original runtime AST node from the "Side Channel" capture
 * map using the path stored in the placeholder.
 *
 * Returning `null` signals that the placeholder cannot be resolved, and patch
 * application should fail.
 *
 * @param ref
 *   The placeholder identifying the location of the preserved subtree.
 * @returns
 *   The original ESTree node to inline, or `null` if the reference is lost.
 */
export type ExpressionRefResolver = (
  ref: ExpressionRef
) => types.Expression | null;

/**
 * Creates an {@link ExpressionRef} placeholder for a preserved subtree at `path`.
 *
 * @param path
 *   Path where the preserved expression is located (e.g. `["children"]`, `["slots", 0]`).
 * @returns
 *   The placeholder object. Example structure:
 *   `{ __kind: Symbol(recma.preservation.expression_ref), path: ["children"] }`
 */
export function createExpressionRef(path: PropertyPath): ExpressionRef {
  return { __kind: EXPRESSION_REF_KIND, path };
}

/**
 * Type guard for {@link ExpressionRef}.
 *
 * Checks if a value is a valid placeholder object by verifying the branded
 * `__kind` tag and the `path` structure.
 *
 * This is used during the **Patching** phase to detect placeholders that need
 * to be resolved back to AST nodes. See {@link PreservedSubtreeLifecycle}.
 *
 * @param value
 *   Unknown value to test.
 * @returns
 *   `true` if `value` is an `ExpressionRef`; otherwise `false`.
 */
export function isExpressionRef(value: unknown): value is ExpressionRef {
  if (!isRecord(value)) return false;

  // 1. Brand check
  if (value.__kind !== EXPRESSION_REF_KIND) return false;

  // 2. Shape check
  return isPropertyPath(value.path);
}
