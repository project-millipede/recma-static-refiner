import type { types } from 'estree-toolkit';
import { is } from 'estree-toolkit';

import type {
  StaticDataPatterns,
  PreservedPropStrategy,
  PreservedSubtreeLifecycle,
  ExpressionRefPlaceholder
} from '../architecture';

import type { PropertyPath } from '../types';

import { isKeyPreserved } from '../utils/path-utils';
import { createExpressionRef } from '../expression-ref';
import { isPlainObject } from '../guards';
import { preserveArrayElision } from '../utils/array-utils';

import { extractPropertyKey } from './key-extractor';
import { tryResolveStaticValue } from './static-resolver';
import { SKIP_VALUE } from './constants';

type PreservedExpressionInfo = {
  path: PropertyPath;
  expression: types.Expression;
};

export type ExtractOptions = {
  preservedKeys: ReadonlySet<string>;
  onPreservedExpression?: (info: PreservedExpressionInfo) => void;
};

/**
 * Builds a human-readable path label for diagnostics.
 *
 * Used to produce clear error messages while walking nested props structures.
 * String segments are appended using dot notation, numeric segments use bracket
 * notation.
 *
 * Example:
 *   formatPath("Component.props", "items") -> "Component.props.items"
 *   formatPath("Component.props.items", 0) -> "Component.props.items[0]"
 *   formatPath("Component.props.items[0]", "id") -> "Component.props.items[0].id"
 *
 * @param base
 *   Current path label prefix (e.g. `"Component.props"`).
 * @param segment
 *   Next segment to append:
 *   - `string` for an object key (e.g. `"items"`, `"id"`)
 *   - `number` for an array index (e.g. `0`, `1`)
 * @returns
 *   A new path label with `segment` appended.
 */
export function formatPath(base: string, segment: string | number): string {
  return typeof segment === 'number'
    ? `${base}[${segment}]`
    : `${base}.${segment}`;
}

/**
 * POLICY: Strict Integration
 *
 * - Protocol:  Enforces **Positional Integrity**.
 * - Behavior:  If the value is static, it is added. If dynamic, the **current container** rejects.
 * - Context:   Array Strategy (All-or-Nothing).
 *
 * @param target - The results array
 * @param value - The potentially static value
 * @returns `SKIP_VALUE` if integrity is compromised, otherwise `void`
 */
function integrateArrayElement(
  target: unknown[],
  value: unknown | typeof SKIP_VALUE
): void | typeof SKIP_VALUE {
  if (value === SKIP_VALUE) {
    return SKIP_VALUE;
  }
  target.push(value);
}

/**
 * POLICY: Selective Integration
 *
 * - Protocol:  Enforces **Partial Extraction**.
 * - Behavior:  If the value is static, it is included. If dynamic, it is **silently omitted**.
 * - Context:   Object Strategy (Best-Effort).
 *
 * @param target - The results object
 * @param key - The property key
 * @param value - The potentially static value
 */
function integrateObjectEntry(
  target: Record<string, unknown>,
  key: string | number,
  value: unknown | typeof SKIP_VALUE
): void {
  if (value !== SKIP_VALUE) {
    target[key] = value;
  }
}

/**
 * Arrays (Position-Addressed) -> STRICT POLICY
 * See {@link StaticDataPatterns} for structural definitions.
 *
 * - Goal: Preserve positional integrity.
 * - Rule: If *any* element is dynamic (including spreads), the **entire array**
 *   is rejected (returns `SKIP_VALUE`).
 * - Elisions: Preserved as sparse slots (hole ≠ explicit `undefined`).
 * - Rationale: Partial extraction is impossible because missing indices would
 *   corrupt the data structure.
 *
 * Control Flow & Propagation:
 * This function implements a "Fail-Fast" recursion strategy.
 *
 * 1. Local Abort:
 *    Processing of the current array stops immediately.
 *    Subsequent elements are ignored as a single dynamic slot invalidates the
 *    entire array.
 *    - Example: In `[1, dynamic = failure, 2]`
 *      -> the failure at index 1 triggers the abort, leaving index 2
 *
 * 2. Upstream Propagation:
 *    The abort signal (`SKIP_VALUE`) is returned to the parent frame,
 *    triggering the resolution logic for container hierarchies (various
 *    Array/Object constellations) reflected in the extractor unit tests.
 *    - Parent is **Array**: Triggers a Chain Reaction.
 *      -> The parent aborts itself (propagating failure further up).
 *    - Parent is **Object**: Triggers Containment.
 *      -> The parent omits this key (absorbing failure).
 *
 * 3. Termination Condition (Propagation Boundary):
 *    The chain reaction halts only when the signal encounters:
 *    - A **Partial Policy** (Object):
 *      The container absorbs the failure (omits the key) and returns a valid
 *      result, stopping the chain.
 *    - The **Public Adapter** (Root):
 *      The entry point intercepts the signal and converts it to `null`,
 *      enforcing a safe exit.
 *
 * @param expressionNode
 *   The ArrayExpression node to decode.
 * @param options
 *   Configuration for preserved keys and side-effect callbacks.
 * @param pathLabel
 *   Human-readable path label for diagnostics (e.g. `"props.items"`).
 * @param pathSegments
 *   Logical path segments used for tracing.
 * @returns
 *   - The fully resolved static array (if integrity checks pass).
 *   - `SKIP_VALUE` (symbol) if *any* element was dynamic (Strict Bailout).
 */
function extractStaticValueFromArrayExpression(
  expressionNode: types.ArrayExpression,
  options: ExtractOptions,
  pathLabel: string,
  pathSegments: PropertyPath
): unknown[] | typeof SKIP_VALUE {
  const candidate: unknown[] = [];

  for (const [index, elementNode] of expressionNode.elements.entries()) {
    /**
     * PHASE 1: STRUCTURAL INTEGRITY (Pre-Recursion)
     * Validate that the slot itself is statically addressable.
     *
     * 1. Check: Elision (Sparse Array Hole)
     *    Rationale: A hole is structurally valid in a sparse array; it is not undefined.
     *    Action: Preserve the empty slot to maintain index alignment.
     *
     * 2. Check: Spread Element (Structural Violation)
     *    Rationale: Spreads make indices non-deterministic at static time.
     *    Action: Execute "Fail-Fast" abort (see "Control Flow & Propagation" above).
     */
    if (elementNode === null) {
      preserveArrayElision(candidate, index);
      continue;
    }

    if (is.spreadElement(elementNode)) {
      return SKIP_VALUE;
    }

    /**
     * PHASE 2: RECURSION (Value Resolution)
     * The slot is structurally valid. Recursively resolve its content.
     */
    const elementLabel = formatPath(pathLabel, index);
    const elementPath: PropertyPath = [...pathSegments, index];

    const extracted = extractStaticValueFromExpression(
      elementNode,
      options,
      elementLabel,
      elementPath
    );

    /**
     * PHASE 3: INTEGRATION & SEMANTIC INTEGRITY (Post-Recursion)
     * Enforce the Strict Policy on the resolved value.
     *
     * 1. Check: Dynamic Value (Semantic Violation)
     *    Rationale: Arrays require all elements to be static to ensure data integrity.
     *    Action: Delegate validation to 'integrateArrayElement' policy.
     *
     * 2. Check: Strict Bailout Signal (SKIP_VALUE returned by policy)
     *    Rationale: Positional integrity is compromised; further processing is futile.
     *    Action: Execute "Fail-Fast" abort (see "Control Flow & Propagation" above).
     */
    const integrationStatus = integrateArrayElement(candidate, extracted);

    if (integrationStatus === SKIP_VALUE) {
      return SKIP_VALUE;
    }
  }

  /**
   * Completion Exit: Static Container Resolved.
   *
   * The candidate has passed all Structural and Semantic checks.
   * (The Strict Policy is satisfied, guaranteeing a valid static array).
   */
  return candidate;
}

/**
 * Objects (Key-Addressed) -> PARTIAL POLICY
 * See {@link StaticDataPatterns} for structural definitions.
 *
 * - Goal: Extract maximum static subset.
 * - Rule: If a value or key is dynamic, **only that entry** is omitted.
 * - Spreads: Object spreads are skipped; extracted values may not reflect
 *   runtime-final values when spreads are present.
 * - Rationale: Keys are structurally independent; skipping dynamic entries
 *   yields the best-available static subset.
 *
 * Preservation (Opaque Subtrees)
 * See {@link PreservedPropStrategy}.
 *
 * Keys matching `options.preservedKeys` bypass the static data check.
 * - The raw AST is captured via `onPreservedExpression`.
 * - The static value is substituted by an {@link ExpressionRefPlaceholder} in the result.
 *
 * @param expressionNode
 *   The ObjectExpression node to decode.
 * @param options
 *   Configuration for preserved keys and side-effect callbacks.
 * @param pathLabel
 *   Human-readable path label for diagnostics (e.g. `"props.style"`).
 * @param pathSegments
 *   Logical path segments used for tracing.
 * @returns
 *   The extracted plain object containing the subset of valid static keys.
 *   (Always returns an object; never returns `SKIP_VALUE`).
 */
function extractStaticValueFromObjectExpression(
  expressionNode: types.ObjectExpression,
  options: ExtractOptions,
  pathLabel: string,
  pathSegments: PropertyPath
): Record<string, unknown> {
  const aggregate: Record<string, unknown> = {};

  for (const propertyNode of expressionNode.properties) {
    /**
     * PHASE 1: FILTERING (Structural Validation)
     * Identify and skip entries that cannot be statically mapped.
     *
     * 1. Check: Spread Element
     *    Rationale: Spreads are not statically addressable keys.
     *    Action: Skip entry (Partial Policy).
     *
     * 2. Check: Key Resolution
     *    Rationale: A stable static key is required to map the value.
     *    Action: Skip entry if key is dynamic (Partial Policy).
     */
    if (is.spreadElement(propertyNode)) {
      continue;
    }

    const key = extractPropertyKey(propertyNode);
    if (key === null) {
      continue;
    }

    const valueLabel = formatPath(pathLabel, key);
    const valuePath: PropertyPath = [...pathSegments, key];

    /**
     * PHASE 2: INTERCEPTION (Alternative Strategy)
     * Handle specific keys defined in options by bypassing standard recursion.
     * (See {@link PreservedSubtreeLifecycle} for the round-trip mechanics).
     *
     * 1. Check: Preserved Key (Opaque Subtree)
     *    Rationale: Key is explicitly preserved by configuration.
     *    Action: Execute Preservation Strategy (see "Preservation" above) and
     *    continue.
     */
    if (isKeyPreserved(key, options.preservedKeys)) {
      if (is.expression(propertyNode.value)) {
        options.onPreservedExpression?.({
          path: valuePath,
          expression: propertyNode.value
        });
      }
      aggregate[key] = createExpressionRef(valuePath);
      continue;
    }

    /**
     * PHASE 3: RECURSION (Standard Strategy)
     * Attempt to resolve the value statically.
     */
    const extracted = extractStaticValueFromExpression(
      propertyNode.value,
      options,
      valueLabel,
      valuePath
    );

    /**
     * PHASE 4: INTEGRATION (Partial Policy)
     * Apply the Selective Integration policy.
     *
     * 1. Check: Value Integration
     *    Rationale: Objects allow partial extraction; dynamic values should not
     *    invalidate the container.
     *    Action: Apply Selective Integration (omit if dynamic, assign if valid).
     */
    integrateObjectEntry(aggregate, key, extracted);
  }

  /**
   * Completion Exit: Best-Effort Result.
   *
   * This function always succeeds in returning an object (containing the
   * subset of valid static keys). It never returns {@link SKIP_VALUE}.
   *
   * Containment Effect:
   * By guaranteeing a valid result object (even if empty), this function
   * absorbs internal dynamic failures so they do not propagate upstream.
   *
   * - Upstream Arrays: Prevent "Strict Propagation" (the array accepts the
   *   partial object as a valid element instead of aborting).
   * - Upstream Objects: Safely assign the partial object to the target key.
   */
  return aggregate;
}

/**
 * Recursively decodes an ESTree node into a plain static JavaScript value.
 *
 * This function acts as the core engine for converting AST structures (Syntax)
 * into analysis-ready data (Semantics). It enforces a strict separation between
 * "Static Data" (extractable) and "Runtime Logic" (skipped).
 *
 * Core Mechanisms:
 * 1. Recursive State Machine
 *    The function traverses the tree depth-first to enforce the structural rules
 *    defined in {@link StaticDataPatterns}.
 *    It communicates with upstream callers via two distinct return signals:
 *    - Data Payload: A valid JS value (primitive, array, object) indicates success.
 *    - `SKIP_VALUE`: A control signal indicating the node is dynamic/unsupported.
 *
 * 2. Container Strategies (Polymorphic Handling)
 *    The extraction logic adapts based on the container type:
 *    - Arrays: See {@link extractStaticValueFromArrayExpression}.
 *    - Objects: See {@link extractStaticValueFromObjectExpression}.
 *
 * 3. Fallthrough (Runtime Logic)
 *    Any node not strictly resolvable as data (Identifiers, FunctionCalls, JSX
 *    Elements, Binary Expressions) falls through to the default case and
 *    returns `SKIP_VALUE`.
 *
 * @param expressionNode
 *   The AST node to decode.
 * @param options
 *   Configuration for preserved keys and side-effect callbacks.
 * @param pathLabel
 *   Human-readable path label for diagnostics (e.g., `"Component.props.items[0]"`).
 * @param pathSegments
 *   Logical path segments used for tracing.
 * @returns
 *   - The extracted static value (if successful).
 *   - `SKIP_VALUE` (symbol) if the node or its subtree is dynamic/unsupported.
 */
export function extractStaticValueFromExpression(
  expressionNode: types.Node,
  options: ExtractOptions,
  pathLabel: string,
  pathSegments: PropertyPath = []
): unknown {
  /**
   * 1. Direct expression resolution
   * Attempt deterministic resolution under current rules.
   * - Success: return the resolved value (subtree complete).
   * - Failure: fall through to container logic (arrays/objects) below.
   */
  const staticResolution = tryResolveStaticValue(expressionNode);

  /**
   * Note (return early):
   * - Terminal: if resolution succeeds, return the resolver payload for this node.
   * - Recursive: otherwise, continue into the array/object cases below and
   *   recurse into their contents.
   */
  if (staticResolution.success) {
    return staticResolution.value;
  }

  /**
   * 2. ArrayExpression
   * Details: See {@link extractStaticValueFromArrayExpression}.
   */
  if (is.arrayExpression(expressionNode)) {
    return extractStaticValueFromArrayExpression(
      expressionNode,
      options,
      pathLabel,
      pathSegments
    );
  }

  /**
   * 3. ObjectExpression
   * Details: See {@link extractStaticValueFromObjectExpression}.
   */
  if (is.objectExpression(expressionNode)) {
    return extractStaticValueFromObjectExpression(
      expressionNode,
      options,
      pathLabel,
      pathSegments
    );
  }

  /**
   * 4. FALLTHROUGH: Dynamic / Unsupported Expression.
   *
   * The node could not be resolved to a static value.
   *
   * RECURSION SIGNAL:
   * Returns {@link SKIP_VALUE}.
   *
   * INTERPRETATION (Upstream Responsibility):
   * - Recursive Containers:
   *   Apply Integration Policy (Strict Abort or Partial Omission).
   * - Root Adapter:
   *   Applies Safety Policy (Converts signal to `null`).
   */
  return SKIP_VALUE;
}

/**
 * Extracts a statically-representable object.
 *
 * Adapter for static extraction specific to Component Props.
 * This function exists to ensure the result is a dictionary (a plain object)
 * before it enters validation and patch planning.
 *
 * Return Policy
 * This function returns an object only when both conditions hold:
 *
 * 1. The expression is statically extractable.
 *    - If extraction returns {@link SKIP_VALUE}, the input is considered **non-static**
 *      under the current extractor rules. This covers:
 *      - **Dynamic** expressions (runtime-dependent), and
 *      - **Unsupported** expression forms (not yet handled by the static resolver).
 *
 * 2. The extracted value is a plain object.
 *
 * If either condition fails, this function returns `null`.
 *
 * Domain Policy: Use Case Driven (Shape Constraint)
 *
 * - The Restriction:
 *   This adapter explicitly rejects Arrays and Primitives, returning `null`.
 *   While the generic engine (`extractStaticValueFromExpression`) supports
 *   these types, they are invalid here because the target model must
 *   structurally be a plain object (dictionary).
 *
 * - The Distinction:
 *   This is distinct from the "Key Type Constraints" defined in
 *   `key-extractor > extractPropertyKey`
 *   Key constraints are safety-driven (preventing bugs), whereas this
 *   restriction is domain-driven (enforcing the Component data model).
 *
 * @param propsNode
 *   ESTree node representing the props expression to extract from.
 * @param options
 *   Options forwarded to {@link extractStaticValueFromExpression}.
 * @param pathLabel
 *   Human-readable label used for diagnostics (e.g. `"Component.props"`).
 * @returns
 *   The extracted object, or `null`.
 */
export function extractStaticProps(
  propsNode: types.Node,
  options: ExtractOptions,
  pathLabel: string
): Record<string, unknown> | null {
  const extracted = extractStaticValueFromExpression(
    propsNode,
    options,
    pathLabel
  );

  // Non-static root.
  if (extracted === SKIP_VALUE) return null;

  // Shape Constraint: See "Domain Policy" in JSDoc.
  if (!isPlainObject(extracted)) return null;

  return extracted;
}
