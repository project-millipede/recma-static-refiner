import type { PatchGroup, PatchPhase, PropertyPatch } from './types';
import { stringifyPropertyPath } from './utils/property-path-key';

/**
 * Merges patch groups from multiple phases, deduplicating by path and tracking origin.
 *
 * Deduplication ("last writer wins"):
 * When multiple phases target the same canonical `pathKey` (e.g., `diff` sets
 * 'someKey' and `prune` deletes 'someKey'), the later phase in the input order
 * overwrites the earlier entry in `patchByPathKey`.
 * Only the final winning patch is retained; earlier patches for that path are
 * discarded and will not be applied.
 *
 * Recording the source phase:
 * The `phaseByPathKey` map records which phase "won" for each path, used later
 * for diagnostic annotations and actionable hints.
 *
 * @param groups - Array of patch groups in priority order (typically: diff → derive → prune).
 *                 Later groups overwrite earlier ones for the same pathKey.
 * @returns Object containing:
 *          - `patches`: Winning patches per unique path
 *          - `phaseByPathKey`: Winning phase per unique path
 */
export function consolidatePatches(groups: readonly PatchGroup[]): {
  patches: PropertyPatch[];
  phaseByPathKey: Map<string, PatchPhase>;
} {
  const patchByPathKey = new Map<string, PropertyPatch>();
  const phaseByPathKey = new Map<string, PatchPhase>();

  for (const { phase, patches } of groups) {
    for (const patch of patches) {
      const pathKey = stringifyPropertyPath(patch.path);

      // Last writer wins for both patch and phase
      patchByPathKey.set(pathKey, patch);
      phaseByPathKey.set(pathKey, phase);
    }
  }

  return {
    patches: Array.from(patchByPathKey.values()),
    phaseByPathKey
  };
}
