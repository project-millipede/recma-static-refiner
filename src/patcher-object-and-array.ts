import { type AssignmentProperty } from 'estree';
import {
  type NodePath,
  type Visitors,
  types,
  is,
  traverse
} from 'estree-toolkit';
import { valueToEstree } from 'estree-util-value-to-estree';

import type {
  StaticDataPatterns,
  PreservedPropStrategy,
  PreservedSubtreeLifecycle
} from './architecture';
import type { PropertyPatch, PropertyPath } from './types';

import { extractPropertyKey } from './extractor/key-extractor';
import { isPatchablePropsRoot, isPlainObject } from './guards';

import { type ExpressionRefResolver, isExpressionRef } from './expression-ref';

import { isArrayElision } from './utils/array-utils';
import { isKeyPreserved } from './utils/path-utils';
import { stringifyPropertyPath } from './utils/property-path-key';

/**
 * Select the first remaining unapplied patch key.
 *
 * Selection order
 * ---------------
 * 1. Prefer unapplied "set" patches (`setPatchByPathKey`) if any remain.
 *    - Reason: "set" patches are the more informative / primary operations.
 *    - The map keys are already canonical `pathKey` strings.
 *
 * 2. Otherwise pick an unapplied "delete" key (`deletePathKeys`) if any remain.
 *    - The set stores canonical `pathKey` strings as well.
 *
 * Return value
 * ------------
 * - returns the canonical `pathKey` string (e.g. '["items",1,"id"]')
 * - returns `undefined` if nothing remains unapplied
 */
export function getFirstUnappliedPathKey(
  setPatchByPathKey: Map<string, Extract<PropertyPatch, { operation: 'set' }>>,
  deletePathKeys: Set<string>
): string | undefined {
  const firstSetKeyIterator = setPatchByPathKey.keys().next();
  if (!firstSetKeyIterator.done) return firstSetKeyIterator.value;

  const firstDeleteKeyIterator = deletePathKeys.values().next();
  if (!firstDeleteKeyIterator.done) return firstDeleteKeyIterator.value;

  return undefined;
}

/**
 * Rebuilds an ESTree `Expression` from an extracted/validated JS value.
 *
 * Responsibilities
 * ----------------
 * 1. Inline preserved-subtree placeholders:
 *    - `ExpressionRef` values (e.g. for `children`) are resolved back to their
 *      original captured ESTree expression and inlined into the output.
 *
 * 2. Encode data-like values:
 *    - Arrays -> `ArrayExpression`
 *    - Plain objects -> `ObjectExpression`
 *    - Primitives/null -> `valueToEstree(...)`
 *
 * @param value
 *   JS value to encode as an ESTree `Expression` (may include `ExpressionRef`
 *   placeholders).
 * @param expressionRefResolver
 *   Resolver used to inline `ExpressionRef` placeholders into real ESTree
 *   expressions.
 * @returns
 *   ESTree `Expression` node representing `value`.
 */
function buildEstreeValue(
  value: unknown,
  expressionRefResolver: ExpressionRefResolver
): types.Expression {
  /**
   * 1. Inline ExpressionRef placeholders (inline-only)
   */
  if (isExpressionRef(value)) {
    const resolvedExpression = expressionRefResolver(value);
    if (!resolvedExpression) {
      throw new Error(
        `[recma] Cannot inline ExpressionRef at path "${value.path.join('.')}".`
      );
    }
    return resolvedExpression;
  }

  /**
   * 2. Encode data-like values into ESTree
   */
  if (Array.isArray(value)) {
    const elements: Array<types.Expression | null> = new Array(value.length);

    for (let slotIndex = 0; slotIndex < value.length; slotIndex++) {
      // Elision (`,,`): encode as `null` in `ArrayExpression.elements`.
      if (isArrayElision(value, slotIndex)) {
        elements[slotIndex] = null;
        continue;
      }

      elements[slotIndex] = buildEstreeValue(
        value[slotIndex],
        expressionRefResolver
      );
    }

    return {
      type: 'ArrayExpression',
      elements
    } satisfies types.ArrayExpression;
  }

  if (isPlainObject(value)) {
    const properties: types.Property[] = [];

    for (const [key, child] of Object.entries(value)) {
      properties.push({
        type: 'Property',

        /**
         * Static object key (no brackets):
         * - `{ foo: 1 }`        ✅
         * - `{ [foo]: 1 }`      ❌
         */
        computed: false,

        /**
         * Always emit explicit key/value pairs:
         * - `{ foo: foo }`      ✅
         * - `{ foo }`           ❌ (shorthand)
         */
        shorthand: false,

        /**
         * Not method syntax:
         * - `{ foo: () => {} }` ✅ (value is an expression)
         * - `{ foo() {} }`      ❌ (method)
         */
        method: false,

        /**
         * Regular initializer property:
         * - `{ foo: value }`    ✅
         * - `{ get foo() {} }`  ❌
         * - `{ set foo(v) {} }` ❌
         */
        kind: 'init',

        /**
         * Use a string-literal key so any JS object key is representable
         * (including keys that are not valid identifiers, e.g. `"data-id"`, `"1"`, `"a b"`).
         */
        key: { type: 'Literal', value: key },

        /**
         * Encode the value as an ESTree expression.
         * "Recursive" means nested arrays/objects are encoded by calling `buildEstreeValue`
         * again for their children until primitives/ExpressionRefs are reached.
         */
        value: buildEstreeValue(child, expressionRefResolver)
      });
    }

    return {
      type: 'ObjectExpression',
      properties
    } satisfies types.ObjectExpression;
  }

  /**
   * Fallback: encode simple "leaf" values as ESTree expressions.
   *
   * Examples:
   * 1. "x"    -> Literal("x")
   * 2. 1      -> Literal(1)
   * 3. true   -> Literal(true)
   * 4. null   -> Literal(null)
   */
  return valueToEstree(value);
}

/**
 * Attempts to append an object-key segment (e.g. `"meta"`, `"id"`) when the current
 * cursor is a `Property` inside an `ObjectExpression`.
 *
 * Return values (3-state):
 * - `NodePath`  : matched; a segment was appended and the returned path is the next cursor.
 * - `undefined` : not applicable; caller should try other segment types and keep climbing.
 * - `null`      : applicable but unsupported (dynamic/computed key); path reconstruction
 *                 cannot continue and the caller should abort with `null`.
 *
 * @param cursor
 *   Current node path while walking upward through the AST.
 * @param pathSegments
 *   Collected `PropertyPath` segments (built in reverse order while climbing).
 * @returns
 *   Next cursor on match, `undefined` if not applicable, or `null` if the key is dynamic.
 */
function tryAppendObjectKeySegment(
  cursor: NodePath<types.Node>,
  pathSegments: PropertyPath
): NodePath<types.Node> | null | undefined {
  const parentNode = cursor.parentPath?.node;
  if (!parentNode) return undefined;

  if (is.property(cursor.node) && is.objectExpression(parentNode)) {
    const keySegment = extractPropertyKey(cursor.node);

    // computed/dynamic key cannot be represented as PropertyPath
    if (keySegment === null) return null;

    pathSegments.push(keySegment);
    return cursor.parentPath;
  }

  return undefined;
}

/**
 * Attempts to append an array-index segment (e.g. `0`, `1`, `2`) when the current
 * cursor is a node occupying an `elements[index]` slot in an `ArrayExpression`.
 *
 * Return values (2-state):
 * - `NodePath`  : matched; an index segment was appended and the returned path is the next cursor.
 * - `undefined` : not applicable; caller should try other segment types and keep climbing.
 *
 * @param cursor
 *   Current node path while walking upward through the AST.
 * @param pathSegments
 *   Collected `PropertyPath` segments (built in reverse order while climbing).
 * @returns
 *   Next cursor on match, otherwise `undefined`.
 */
function tryAppendArrayIndexSegment(
  cursor: NodePath<types.Node>,
  pathSegments: PropertyPath
): NodePath<types.Node> | undefined {
  const parentNode = cursor.parentPath?.node;
  if (!parentNode) return undefined;

  if (is.arrayExpression(parentNode) && typeof cursor.key === 'number') {
    const indexSegment = cursor.key;
    pathSegments.push(indexSegment);
    return cursor.parentPath;
  }

  return undefined;
}

/**
 * Computes the logical `PropertyPath` from the patchable props root to `targetPath`.
 *
 * The patcher uses this mapping to translate an AST position (`NodePath`) into the
 * `(string | number)[]` addressing used by the patch planner (e.g. `["items", 0, "id"]`).
 *
 * Unsupported / dynamic shapes return `null`:
 * - computed/dynamic object keys
 * - other AST relationships that cannot be expressed as a `PropertyPath`
 *
 * @param targetPath
 *   Node path within the props object literal subtree.
 * @returns
 *   Root-relative `PropertyPath` for the node, or `null` if the path cannot be represented.
 */
function getRelativePathFromRoot(
  targetPath: NodePath<types.Node>
): PropertyPath | null {
  const pathSegments: PropertyPath = [];
  let cursor: NodePath<types.Node> | null = targetPath;

  // Walk upward from the target node until the props root is reached.
  while (cursor?.parentPath) {
    const parentNode = cursor.parentPath.node;
    const node = cursor.node;
    if (!parentNode || !node) break;

    /**
     * 1. Property value -> hop to the owning Property node.
     *    This keeps the cursor at the "property container" level so the next
     *    step can record the property key segment.
     */
    if (is.property(parentNode) && cursor.key === 'value') {
      cursor = cursor.parentPath as NodePath<types.Node>;
      continue;
    }

    /**
     * 2. Object property segment (e.g. .meta / .id)
     */
    const nextFromObject = tryAppendObjectKeySegment(cursor, pathSegments);
    if (nextFromObject === null) return null; // dynamic/computed key
    if (nextFromObject) {
      cursor = nextFromObject;
      continue;
    }

    /**
     * 3. Array index segment (e.g. [0], [1])
     */
    const nextFromArray = tryAppendArrayIndexSegment(cursor, pathSegments);
    if (nextFromArray) {
      cursor = nextFromArray;
      continue;
    }

    // Otherwise keep climbing.
    cursor = cursor.parentPath as NodePath<types.Node>;
  }

  // Segments were collected while walking upward (leaf -> root), so reverse them
  // to produce root -> leaf order (e.g. ["items", 0, "id"]).
  return pathSegments.reverse();
}

type PatchIndex = {
  /**
   * Lookup for "set" operations by serialized path key.
   *
   * Note:
   * Only one set patch can exist per pathKey; later patches overwrite earlier ones.
   */
  setPatchByPathKey: Map<string, Extract<PropertyPatch, { operation: 'set' }>>;

  /**
   * Membership set of serialized path keys to delete.
   */
  deletePathKeys: Set<string>;
};

/**
 * Builds fast lookup tables keyed by a canonical path key.
 *
 * Why this exists
 * ---------------
 * During AST traversal a fresh `PropertyPath` array (e.g. `["items", 0, "id"]`)
 * is computed for each visited node. Patch presence must be checked without
 * scanning the full patch list every time.
 *
 * The challenge: Map keys are identity-based for arrays/objects
 * -------------------------------------------------------------
 * Using `Map<PropertyPath, Patch>` does NOT work because arrays are compared by
 * reference identity, not by “same contents”:
 *
 *   const m = new Map<(string|number)[], string>();
 *   m.set(["items", 0, "id"], "patch");
 *   m.get(["items", 0, "id"]); // undefined (different array instance)
 *
 * Middle ground: JSON.stringify as a canonical key
 * ------------------------------------------------
 * `PropertyPath` is converted to a stable string key via `JSON.stringify`.
 * This gives value-like equality (same segments => same key) with minimal code:
 *
 *   const key = JSON.stringify(["items", 0, "id"]); // '["items",0,"id"]'
 *
 * Tradeoff:
 * String allocation occurs, but the implementation remains small, flat, and
 * unambiguous for `(string | number)[]`.
 *
 * @param patches
 *   Patch list produced by the planner.
 * @returns
 *   Lookup structures used during traversal:
 *   - `setPatchByPathKey`: serialized path -> "set" patch
 *   - `deletePathKeys`: serialized paths to delete
 */
function buildPatchIndex(patches: readonly PropertyPatch[]): PatchIndex {
  const setPatchByPathKey = new Map<
    string,
    Extract<PropertyPatch, { operation: 'set' }>
  >();
  const deletePathKeys = new Set<string>();

  for (const patch of patches) {
    const pathKey = stringifyPropertyPath(patch.path);

    if (patch.operation === 'set') {
      setPatchByPathKey.set(pathKey, patch); // last one wins
    } else {
      deletePathKeys.add(pathKey);
    }
  }

  return { setPatchByPathKey, deletePathKeys };
}

type PatchApplyState = {
  preservedKeys: ReadonlySet<string>;
  setPatchByPathKey: Map<string, Extract<PropertyPatch, { operation: 'set' }>>;
  deletePathKeys: Set<string>;
  expressionRefResolver: ExpressionRefResolver;
};

function applyObjectPropertyPatchesIfNeeded(
  path: NodePath<AssignmentProperty | types.Property, types.Node>,
  state: PatchApplyState
) {
  /**
   * 1. Preconditions
   * ----------------
   * Only proceed when the `Property` node exists and has a static key.
   */
  if (!path.node) return;

  const propertyKey = extractPropertyKey(path.node);
  if (propertyKey === null) return;

  /**
   * 2. Skip preserved runtime-expression subtrees
   * ---------------------------------------------
   *
   * Patch application traverses and edits the compiled ESTree AST (not the
   * extracted/validated JS values). Some props (e.g. `children`) are treated as
   * preserved runtime-expression subtrees: their values may contain JSX, calls,
   * or functions and must be preserved as-is.
   *
   * Why traversal is skipped:
   * 1. Extraction-time representation differs from patch-time traversal:
   *    extraction may model these values as `ExpressionRef` placeholders, but
   *    patching walks the real AST subtree, which still contains the original
   *    runtime expression.
   * 2. Safety:
   *    descending into these subtrees risks applying patches inside runtime code
   *    that was intentionally excluded from static evaluation.
   *
   * Result:
   * - Traversal does not descend into the subtree.
   * - Any patch targeting this property or anything below it remains unapplied
   *   and is surfaced by reporting.
   */
  if (isKeyPreserved(propertyKey, state.preservedKeys)) {
    // Prevent traversal from entering the runtime-expression subtree.
    path.skipChildren();
    return;
  }

  /**
   * 3. Compute lookup key for this property
   * --------------------------------------
   * `getRelativePathFromRoot` maps the current `Property` node back to a logical
   * `PropertyPath` from the props root (e.g. ["title"], ["items", 1, "id"]).
   *
   * This works uniformly for:
   * - top-level props:            ["title"]
   * - nested object props:        ["meta", "author", "name"]
   * - object props inside arrays: ["items", 1, "id"]
   *
   * The property value node type is not relevant here: `value` may be a Literal,
   * ObjectExpression, ArrayExpression, etc. The patcher replaces the `value`
   * expression in-place (leaf-only).
   */
  const propPath = getRelativePathFromRoot(path);
  if (!propPath) return;

  const pathKey = stringifyPropertyPath(propPath);

  /**
   * 4. Apply deletion (remove property entry)
   * -----------------------------------------
   * Deletes at object-key level remove the `Property` node.
   */
  if (state.deletePathKeys.has(pathKey)) {
    path.remove();
    state.deletePathKeys.delete(pathKey);
    return;
  }

  /**
   * 5. Apply set (replace property value expression)
   * -----------------------------------------------
   */
  const patch = state.setPatchByPathKey.get(pathKey);
  if (!patch) return;

  path
    .get('value')
    .replaceWith(buildEstreeValue(patch.value, state.expressionRefResolver));

  state.setPatchByPathKey.delete(pathKey);
}

function applyArrayElementPatchesIfNeeded(
  path: NodePath<types.ArrayExpression>,
  state: PatchApplyState
) {
  /**
   * 1. Preconditions
   * ----------------
   * Only proceed when the current node exists and can be mapped to a `PropertyPath`.
   */
  if (!path.node) return;

  const arrayPath = getRelativePathFromRoot(path);
  if (!arrayPath) return;

  /**
   * 2. Iterate array slots
   * ----------------------
   * Array patches target index slots (e.g. ["items", 1]). The visitor runs on the
   * parent `ArrayExpression`, so it iterates `elements[index]` directly to ensure
   * every index is checked regardless of the element node type.
   *
   * `path.get('elements')` is used to obtain `NodePath`s for each slot so existing
   * elements can be replaced via `replaceWith(...)`.
   *
   * Note:
   * This currently scans all array slots. If very large array literals become common and
   * only a small subset of indices are patched, an optimization can index slot-level
   * patches by `arrayPath` to visit only the touched indices (O(k) vs O(n)).
   */
  const elementPaths = path.get('elements') as NodePath<types.Node>[];

  for (let index = 0; index < elementPaths.length; index++) {
    const elementPath = elementPaths[index];

    /**
     * 3. Compute lookup key for this slot
     * ----------------------------------
     */
    const itemPath: PropertyPath = [...arrayPath, index];
    const pathKey = stringifyPropertyPath(itemPath);

    /**
     * Array slot vs. nested property (important distinction)
     * ------------------------------------------------------
     * This function applies slot-level patches that target the element itself:
     * - delete ["items", 1] => creates a hole at index 1 (indices do not shift)
     * - set    ["items", 1] => replaces the entire element at index 1
     *
     * Nested paths target properties inside an element object and are handled
     * later by the `Property` visitor during traversal:
     * - set ["items", 1, "id"] => updates the `id` property inside items[1]
     *   (no hole; the element object remains in place)
     */

    /**
     * 4. Apply deletion (keeps array shape)
     * -------------------------------------
     * Deletions produce a hole to avoid shifting indices.
     *
     * Array-index deletes are supported here (delete => hole to avoid shifting indices).
     * In the current pipeline, delete patches are typically produced for:
     * 1. Object-key removals from diffing (when enabled).
     * 2. Explicit prune steps (object keys only).
     * Numeric-path deletes are only possible if an upstream planner emits them explicitly.
     */
    if (state.deletePathKeys.has(pathKey)) {
      path.node.elements[index] = null;
      state.deletePathKeys.delete(pathKey);
      continue;
    }

    /**
     * 5. Apply set (replace element or fill hole)
     * -------------------------------------------
     * Slot-level set replaces the entire element expression at `elements[index]`
     * or fills the slot if it is currently empty.
     */
    const patch = state.setPatchByPathKey.get(pathKey);
    if (!patch) continue;

    const newValue = buildEstreeValue(patch.value, state.expressionRefResolver);

    if (elementPath?.node) {
      // Use the visitor method to preserve traversal context when the node exists.
      elementPath.replaceWith(newValue);
    } else {
      // If the slot is currently a hole (null), `elementPath.replaceWith`
      // cannot be used because there is no node to replace.
      // Direct assignment to the parent AST node is required to fill the hole.
      path.node.elements[index] = newValue;
    }

    state.setPatchByPathKey.delete(pathKey);
  }
}

export type ApplyPatchesOptions = {
  /**
   * Resolver used to inline ExpressionRef placeholders back into real ESTree expressions.
   */
  expressionRefResolver: ExpressionRefResolver;
};

export type ApplyPatchesResult = {
  /**
   * A canonical key for one remaining unapplied patch, used as the primary
   * “pointer” for diagnostics.
   *
   * Canonical key format:
   * - Produced by `JSON.stringify(PropertyPath)`
   * - Example: '["items",1,"id"]'
   *
   * Selection order:
   * - Prefer remaining "set" keys, otherwise return a remaining "delete" key.
   */
  firstUnappliedPathKey?: string;

  /**
   * Canonical keys for unapplied "set" operations.
   *
   * Each key corresponds to a planned `set` patch that could not be applied
   * during traversal (e.g. the target path does not exist in the AST, or the
   * AST shape is non-literal where leaf-only edits are not possible).
   */
  remainingSetPathKeys: string[];

  /**
   * Canonical keys for unapplied "delete" operations.
   *
   * Each key corresponds to a planned `delete` patch that could not be applied.
   * Deletes can target object properties (removing a `Property`) or array slots
   * (clearing an element), but are still constrained by leaf-only rules.
   */
  remainingDeletePathKeys: string[];

  /**
   * Total number of remaining unapplied "set" patch keys.
   *
   * Convenience field derived from `remainingSetPathKeys.length`.
   */
  remainingSetCount: number;

  /**
   * Total number of remaining unapplied "delete" patch keys.
   *
   * Convenience field derived from `remainingDeletePathKeys.length`.
   */
  remainingDeleteCount: number;
};

/**
 * Finalizes an ApplyPatchesResult snapshot from the patch-application indexes.
 *
 * Patch application uses canonical path keys (`JSON.stringify(PropertyPath)`) as
 * the single source of truth for patch indexing:
 * - `setPatchByPathKey` holds remaining unapplied "set" patches
 * - `deletePathKeys` holds remaining unapplied "delete" patches
 *
 * As patches are applied during traversal, entries are removed from these
 * collections. Any keys that remain represent patches that could not be applied
 * under the current AST shape (e.g. missing path, non-literal root, array holes).
 *
 * @param setPatchByPathKey
 *   Map of remaining unapplied "set" patches keyed by canonical path key.
 * @param deletePathKeys
 *   Set of remaining unapplied "delete" patch keys in canonical key form.
 * @returns
 *   Snapshot describing:
 *   - one primary unapplied key for diagnostics (`firstUnappliedPathKey`), and
 *   - complete remaining key lists + counts for reporting/summary.
 */
function finalizeApplyPatchesResult(
  setPatchByPathKey: Map<string, Extract<PropertyPatch, { operation: 'set' }>>,
  deletePathKeys: Set<string>
): ApplyPatchesResult {
  const remainingSetPathKeys = Array.from(setPatchByPathKey.keys());
  const remainingDeletePathKeys = Array.from(deletePathKeys.values());

  const firstUnappliedPathKey = getFirstUnappliedPathKey(
    setPatchByPathKey,
    deletePathKeys
  );

  return {
    firstUnappliedPathKey,
    remainingSetPathKeys,
    remainingDeletePathKeys,
    remainingSetCount: remainingSetPathKeys.length,
    remainingDeleteCount: remainingDeletePathKeys.length
  };
}

/**
 * Creates the ESTree visitor implementation for applying patches.
 *
 * Only two visitor hooks are required:
 * 1. `Property`
 *    - Applies object-key patches by replacing/removing `Property` nodes.
 * 2. `ArrayExpression`
 *    - Applies array-index patches by iterating the array `elements`
 *      (via `applyArrayElementPatchesIfNeeded`).
 *
 * Not needed (and why):
 * - `Literal` / `ObjectExpression` visitors for array patching.
 *   Array elements are not limited to literals or object literals; they can be any
 *   expression node type (Identifier, CallExpression, JSXElement, etc.).
 *
 *   If array patching only ran in `Literal` / `ObjectExpression` visitors, then element
 *   patches are applied only when the element happens to be one of those types and are
 *   silently missed for other element types.
 *
 * Example (why patch at `ArrayExpression`):
 *
 *   // Source
 *   items={[ 1, foo, { a: 1 }, foo() ]}
 *
 *   // Element node types:
 *   //   index 0 -> Literal
 *   //   index 1 -> Identifier
 *   //   index 2 -> ObjectExpression
 *   //   index 3 -> CallExpression
 *
 *   // Patches targeting these indices:
 *   //   ["items", 0]  // would be observed by a `Literal` visitor
 *   //   ["items", 1]  // would be missed without an `Identifier` visitor
 *   //   ["items", 2]  // would be observed by an `ObjectExpression` visitor
 *   //   ["items", 3]  // would be missed without a `CallExpression` visitor
 *
 * Applying array-index patches from the parent `ArrayExpression` iterates `elements[0..n]`,
 * so every index is checked regardless of the element node type.
 *
 * @returns
 *   A visitor object compatible with `estree-toolkit` traversal.
 */
function createPatchApplicationVisitors(): Visitors<PatchApplyState> {
  return {
    Property(path, state) {
      applyObjectPropertyPatchesIfNeeded(path, state);
    },

    ArrayExpression(path, state) {
      applyArrayElementPatchesIfNeeded(path, state);
    }
  };
}

/**
 * Applies a list of patches to the ESTree AST.
 *
 * This function handles the physical mutation of the AST. It performs the final
 * step of the {@link PreservedSubtreeLifecycle} ("ExpressionRef Round-Trip"):
 *
 * 1. **Data Props:**
 *    Static values are encoded directly into ESTree nodes (e.g., `Literal`,
 *    `ArrayExpression`). See {@link StaticDataPatterns}.
 *
 * 2. **Preserved Props:**
 *    Opaque runtime subtrees (captured as `ExpressionRef` placeholders) are
 *    resolved back to their original AST nodes and inlined.
 *    See {@link PreservedPropStrategy}.
 *
 * @param propsRootPath - NodePath to the props ObjectExpression.
 * @param patches - List of operations to apply.
 * @param preservedKeys - Keys that must be skipped during traversal.
 * @param options - Contains the `expressionRefResolver`.
 */
export function applyPatchesToEstree(
  propsRootPath: NodePath<types.Node>,
  patches: PropertyPatch[],
  preservedKeys: ReadonlySet<string>,
  options: ApplyPatchesOptions
): ApplyPatchesResult {
  /**
   * Entry guard:
   * Leaf-only patching requires a patchable props root (see `isPatchablePropsRoot`).
   * If the root is not patchable, no patches can be applied safely, so patch
   * application returns with all patches still tracked as unapplied for
   * reporting.
   */

  // Precompute O(1) patch lookups by pathKey during traversal.
  // Also used to report unapplied patches on early exit.
  const { setPatchByPathKey, deletePathKeys } = buildPatchIndex(patches);

  if (!isPatchablePropsRoot(propsRootPath.node)) {
    // Non-literal props roots cannot be edited under leaf-only patching;
    // return all patches as unapplied.
    return finalizeApplyPatchesResult(setPatchByPathKey, deletePathKeys);
  }

  const state: PatchApplyState = {
    preservedKeys,
    setPatchByPathKey,
    deletePathKeys,
    expressionRefResolver: options.expressionRefResolver
  };

  // Create visitors with the documented strategy
  const visitors = createPatchApplicationVisitors();

  traverse(propsRootPath.node, visitors, state);

  return finalizeApplyPatchesResult(setPatchByPathKey, deletePathKeys);
}
