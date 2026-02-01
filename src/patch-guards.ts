import type { PropertyPatch } from './types';
import { stringifyPropertyPath } from './utils/property-path-key';

type PreservationCheckOptions = {
  /**
   * Scope of the restriction check:
   * - 'root-only': Only check the top-level property key (e.g. props.children).
   * - 'anywhere': Check all segments in the path (e.g. props.items[0].children).
   */
  scope: 'root-only' | 'anywhere';

  /**
   * Label used in error messages to describe the restricted keys
   * (e.g. "preserved", "ignored", "restricted").
   */
  keyTypeLabel: string;
};

/**
 * Finds the first restricted key in a patch path based on the check scope.
 *
 * @param patch - The patch containing the path to check.
 * @param restrictedKeys - Set of keys that must not be targeted.
 * @param scope - Checking scope determining whether to check root only or any segment.
 * @returns The first restricted key string found, or null if path is valid.
 *
 * @example
 * // Root-only check (depth 0 only)
 * findRestrictedKey({ path: ['children'] }, new Set(['children']), 'root-only');
 * // Returns: 'children'
 *
 * @example
 * // Anywhere check (finds nested violations)
 * findRestrictedKey({ path: ['items', 0, 'children'] }, new Set(['children']), 'anywhere');
 * // Returns: 'children'
 */
function findRestrictedKey(
  patch: PropertyPatch,
  restrictedKeys: ReadonlySet<string>,
  scope: 'root-only' | 'anywhere'
): string | null {
  if (scope === 'root-only') {
    const [first] = patch.path;
    return typeof first === 'string' && restrictedKeys.has(first)
      ? first
      : null;
  }

  for (const segment of patch.path) {
    if (typeof segment === 'string' && restrictedKeys.has(segment)) {
      return segment;
    }
  }
  return null;
}

/** Helper to capitalize first letter for error messages */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Asserts that patches respect preservation constraints by not targeting restricted keys.
 * Constructs and throws descriptive error messages when violations are detected,
 * including the full path context for 'anywhere' scope violations.
 *
 * @param patches - Array of patches to validate against preservation constraints.
 * @param restrictedKeys - Set of keys that must not be targeted by any patch.
 * @param componentName - Display name of the component for diagnostic context.
 * @param options - Configuration specifying check scope (root-only/anywhere) and
 *                  key type label for error message construction.
 * @returns void
 * @throws When any patch targets a restricted key. The error message is
 *         dynamically constructed to include:
 *         - The key type label (e.g. "preserved")
 *         - The specific violated key name
 *         - The component name
 *         - The full JSON path (if scope is 'anywhere')
 */
export function assertPatchesRespectPreservation(
  patches: readonly PropertyPatch[],
  restrictedKeys: ReadonlySet<string>,
  componentName: string,
  options: PreservationCheckOptions
): void {
  for (const patch of patches) {
    const violatedKey = findRestrictedKey(patch, restrictedKeys, options.scope);

    // No violation found for this patch
    if (!violatedKey) continue;

    // Construct error message dynamically based on scope and options
    const pathDetail =
      options.scope === 'anywhere'
        ? ` at ${stringifyPropertyPath(patch.path)}`
        : '';

    const capitalizedLabel = capitalize(options.keyTypeLabel);

    throw new Error(
      `[recma] Patch targets ${options.keyTypeLabel} key "${violatedKey}"${pathDetail} for ${componentName}. ` +
        `${capitalizedLabel} keys must not be patched as they represent runtime-owned subtrees.`
    );
  }
}
