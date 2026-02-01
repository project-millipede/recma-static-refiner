import type {
  AstTopologyMismatch,
  LeafOnlyPatchingConstraint
} from './architecture';
import type { DeletePropertyPatch } from './types';
import { isPlainObject } from './guards';

/**
 * Creates `delete` patches for root-level keys present in `existingProps`.
 *
 * Only keys found in `existingProps` are considered for deletion.
 *
 * Targeted Pruning (Escape Hatch)
 * -------------------------------
 * This operation provides manual override capabilities that are generally
 * restricted by the {@link LeafOnlyPatchingConstraint}.
 *
 * Operational Constraints
 * -----------------------
 *
 * PRUNING (Targeted Deletion)
 *   - Context:   Manual Configuration (Component Rule).
 *   - Mechanism: Removing `Property` nodes from the root `ObjectExpression`.
 *   - Rationale: Explicit Cleanup (vs. Indiscriminate Data Loss).
 *                1. Physical Safety:
 *                   Mitigated by validating against `existingProps` (guaranteed
 *                   static values). This prevents targeting hidden topology
 *                   (spreads) described in {@link AstTopologyMismatch}.
 *                2. Logical Safety:
 *                   Safeguarded by deliberate configuration. Unlike automatic schema
 *                   stripping, this is a user-defined operation to remove
 *                   specific legacy props.
 *   - Policy:    ✅ PERMITTED.
 *                Authorized because the key is verified to exist in the
 *                static props (Targeted Pruning).
 *
 * Safety invariant
 * ----------------
 * Preserved keys (e.g. `children`) must never be pruned.
 * These represent complex runtime subtrees preserved from the source.
 * Deleting them would irrecoverably drop dynamic content or logic from the
 * compiled output (no reconstruction/inlining possible later).
 *
 * @param existingProps - Source props object providing existing keys eligible
 *                        for pruning.
 * @param pruneKeys - Keys to remove if present in `existingProps`
 * @param preservedKeys - Keys to protect from deletion (e.g. `children`)
 * @returns Array of delete patches for existing, non-preserved root keys
 */
export function planPrunePatches(
  existingProps: unknown,
  pruneKeys: ReadonlyArray<string> | undefined,
  preservedKeys: ReadonlySet<string>
): DeletePropertyPatch[] {
  // No keys configured to prune
  if (!pruneKeys || pruneKeys.length === 0) return [];

  // Input is not a plain object (safeguard)
  if (!isPlainObject(existingProps)) return [];

  const patches: DeletePropertyPatch[] = [];
  const uniquePruneKeys = new Set(pruneKeys);

  // Only iterate keys to prune
  for (const key of uniquePruneKeys) {
    // Safety invariant: never touch preserved runtime keys
    if (preservedKeys.has(key)) continue;

    // Topology Safety:
    // Only target explicit properties verified to exist.
    if (Object.hasOwn(existingProps, key)) {
      patches.push({ operation: 'delete', path: [key] });
    }
  }

  return patches;
}
