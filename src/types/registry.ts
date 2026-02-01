import type { BaseProps, ComponentSchema } from './primitives';
import type { ComponentRule, ComponentRuleBase } from './rules';

/**
 * The generic constraint for rule inference.
 *
 * Purpose:
 * Used by `defineRuleRegistry` to validate the input structure while allowing
 * specific subtypes to pass through via generics.
 *
 * Structure:
 * - Key (`string`):
 *   Represents the component name (e.g., "CustomComponent").
 *   Must match the identifier used in the JSX callsite.
 * - Value ({@link ComponentRuleBase}):
 *   The "Common Denominator" type for rules.
 *   It allows rules with different specific prop interfaces to coexist in the
 *   same object because they all satisfy the base contract of operating on an
 *   `object`.
 */
export type RuleRegistryConstraint = Record<string, ComponentRuleBase>;

/**
 * The concrete registry structure used by the plugin runtime.
 *
 * Purpose:
 * Represents the lookup table used by the component resolver to match AST
 * callsites. Specific prop interfaces are abstracted away at this stage;
 * the runtime relies solely on the structural contract of {@link ComponentRuleBase}
 * to ensure uniform and safe execution.
 */
export type RuleMap = RuleRegistryConstraint;

/**
 * Creates the rule registry with strict type inference.
 *
 * Acts as an identity function that validates the input structure against
 * {@link RuleRegistryConstraint} without widening the type. This preserves
 * specific `Props` interfaces for downstream tooling while enforcing the
 * registry contract.
 *
 * @template T - The specific registry shape (inferred).
 * @param registry - The map of component names to rules.
 * @returns The registry object with specific types preserved.
 */
export function defineRuleRegistry<T extends RuleRegistryConstraint>(
  registry: T
): T {
  return registry;
}

/**
 * Creates a typed rule definition helper for a specific component interface.
 *
 * Implementation Note:
 * Utilizes a curried function pattern to allow explicit definition of the
 * `Props` generic, while automatically inferring the `Schema` type from
 * the provided configuration object.
 *
 * Usage:
 * ```ts
 * defineRule<MyProps>()({
 *   schema: MySchema,
 *   derive: (props, set) => { ... }
 * })
 * ```
 */
export function defineRule<Props extends BaseProps>() {
  return <S extends ComponentSchema = undefined>(
    rule: ComponentRule<Props, S>
  ) => rule;
}

export type PluginOptions = {
  /**
   * Defines the behavior rules for each component.
   * Maps component names to their validation, derivation, and pruning logic.
   */
  rules: RuleMap;

  /**
   * Controls whether validated values are written back to the compiled output.
   *
   * - `true`: Applies patches to the AST (Transpiler Mode).
   * - `false`: Validates props without modifying the source (Linter / Dry-Run Mode).
   *
   * Scenario: Type Correction
   * - Source:  `<Component zIndex="50" />`
   * - Schema:  `zIndex` is a number.
   * - `true`:  Updates AST to `zIndex={50}`.
   * - `false`: Leaves AST as `zIndex="50"` (throws if validation fails).
   *
   * @default true
   */
  applyTransforms?: boolean;

  /**
   * Prop keys identifying **Dynamic Runtime Expressions** (e.g., `children`, `onClick`).
   *
   * Values for these keys are treated as executable code, not static data:
   * - Extraction: Captured as-is; not resolved to static data.
   * - Validation: Passed through via placeholders.
   * - Patching: Protected (traversal stops; the expression remains verbatim).
   *
   * Use this for properties containing variables, functions, or JSX elements.
   *
   * @default ['children']
   */
  preservedKeys?: readonly string[];
};
