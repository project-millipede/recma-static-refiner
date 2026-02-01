import type { NodePath, types } from 'estree-toolkit';
import { is } from 'estree-toolkit';

import type { RuleMap, ComponentRuleBase } from './types';
import { getJsxRuntimeCallArgs } from './call-utils';
import { validateRule } from './rule-validator';

/**
 * Data extracted from a JSX runtime callsite that matches a registered component.
 *
 * Matching rules live on `ResolveComponentMatch`. This type only describes the
 * data returned on success.
 */
export type ComponentMatch = {
  /**
   * Statically resolved component name from the JSX runtime call’s first argument.
   *
   * Examples:
   * - `_jsx(TimelineIngestor, props)`     -> `"TimelineIngestor"`
   * - `_jsx("TimelineIngestor", props)`   -> `"TimelineIngestor"` (rare but valid)
   */
  componentName: string;

  /**
   * Canonical rule configuration for this component.
   *
   * Represents the validated registry entry used by the processing pipeline.
   *
   * Guarantees:
   * - The object is a structurally valid `ComponentRuleBase`.
   * - At least one feature (`schema`, `derive`, `pruneKeys`) is active.
   */
  componentRule: ComponentRuleBase;

  /**
   * NodePath for the props argument expression in the JSX runtime call.
   *
   * This points at the second argument in calls like:
   *   `_jsx(Component, propsExpr)`
   *
   * It is later used as:
   * - the extraction root (decode static values from the props expression), and
   * - the mutation target (apply leaf-only patches back into the same AST subtree).
   */
  propsExpressionPath: NodePath<types.Expression>;
};

/**
 * Resolves a `ComponentMatch` from a CallExpression path.
 *
 * Returns a match only when ALL of these are true:
 * 1. The node is a CallExpression to a supported JSX factory (`jsx`, `jsxs`, `jsxDEV`),
 *    including common local aliases like `_jsx`.
 * 2. The component argument (arg0) exists and a stable name can be resolved statically
 *    (Identifier or string Literal).
 * 3. The resolved component name exists in the rule registry.
 * 4. The props argument (arg1) exists and is an ESTree Expression.
 *
 * Returns `null` when any check fails (the callsite is skipped).
 *
 * Note:
 * A successful match does NOT guarantee props are statically extractable or patchable.
 * That is decided later by extraction + patching policy.
 */
export type ResolveComponentMatch = (
  path: NodePath<types.CallExpression>
) => ComponentMatch | null;

/**
 * Attempts to resolve a stable component name from the JSX runtime factory
 * "component" argument.
 *
 * Accepted forms:
 * - `Identifier`
 *   → `Card`   in `jsx(Card, props)`
 * - string literal (`Literal` with `value: string`)
 *   → `"Card"` in `jsx("Card", props)` (rare but valid)
 *
 * All other node shapes are treated as unsupported (e.g. `UI.Card`,
 * `getComp()`) and return `null`.
 *
 * @param node
 *   AST node used as the first argument to the JSX runtime factory call.
 * @returns
 *   The component name if it can be resolved statically; otherwise `null`.
 */
function extractComponentName(node: types.Node | null): string | null {
  if (!node) return null;

  // `jsx(Card, props)` → Card
  if (is.identifier(node)) {
    return node.name;
  }

  // `jsx("Card", props)` → "Card"
  if (is.literal(node) && typeof node.value === 'string') {
    return node.value;
  }

  return null;
}

/**
 * Creates a `ResolveComponentMatch` function for a given rule registry.
 *
 * Match criteria
 * --------------
 * 1. JSX runtime call:
 *    - Detect a supported JSX factory callsite and extract argument NodePaths.
 *    - Must yield a component argument (arg0) and a props argument (arg1),
 *      where arg1 is an ESTree Expression.
 *
 * 2. Component name:
 *    - Resolve a stable component name from the component argument.
 *    - Unsupported shapes (e.g. `UI.Card`, `getComp()`) are skipped.
 *
 * 3. Registry membership:
 *    - Only proceed when the resolved component name exists in `rules`.
 *
 * 4. Rule validation:
 *    - Ensure the registry entry conforms to the `ComponentRule` shape so
 *      downstream processing relies on a guaranteed interface.
 *    - Prevents empty or malformed configuration objects from entering the pipeline.
 *
 * Implementation note:
 * - Component-name membership is checked via a precomputed `Set` for O(1) lookups.
 */
export function createComponentResolver(rules: RuleMap): ResolveComponentMatch {
  const registeredComponentNames = new Set(Object.keys(rules));

  return (path: NodePath<types.CallExpression>): ComponentMatch | null => {
    // 1. Match JSX runtime call.
    const args = getJsxRuntimeCallArgs(path);
    if (!args) return null;

    // 2. Resolve component name.
    const componentName = extractComponentName(args.componentPath.node);
    if (!componentName) return null;

    // 3. Check registry membership.
    if (!registeredComponentNames.has(componentName)) return null;

    // Registry lookup is keyed by the resolved name; treat missing as non-match.
    const ruleEntry = rules[componentName];
    if (!ruleEntry) return null;

    // 4. Validate Registry Entry.
    const componentRule = validateRule(ruleEntry, componentName);

    return {
      componentName,
      componentRule,
      propsExpressionPath: args.propsPath
    };
  };
}
