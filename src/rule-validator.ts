import type { ComponentRuleBase } from './types';

/**
 * Validates the runtime integrity of a `ComponentRule`.
 *
 * This function enforces the structural contract of a rule object at runtime.
 * It ensures the input is a non-null object and satisfies the logical
 * requirement that at least one configuration property ('schema', 'derive', or
 * 'pruneKeys') must be defined.
 *
 * @param rule - The rule object from the registry.
 * @param componentName - The component name context for error reporting.
 * @returns The validated rule object.
 * @throws Error if the rule is not an object or lacks active configuration.
 */
export function validateRule(
  rule: ComponentRuleBase | undefined | null,
  componentName: string
): ComponentRuleBase {
  // 1. Validate object structure
  if (!rule || typeof rule !== 'object') {
    throw new Error(
      `[ValidationPlugin] Invalid rule for "${componentName}": Expected a rule object, got ${typeof rule}.`
    );
  }

  // 2. Validate functional requirements
  const isEffective =
    rule.schema != null || rule.derive != null || rule.pruneKeys != null;

  if (!isEffective) {
    throw new Error(
      `[ValidationPlugin] Invalid rule for "${componentName}": The rule is empty. ` +
        `It must define at least one of: 'schema', 'derive', or 'pruneKeys'.`
    );
  }

  return rule;
}
