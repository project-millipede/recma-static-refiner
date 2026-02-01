import type { NodeArray, Options, DiffResult, Node } from './types';
import { areArraysShallowEqual, createChange } from './utils';

/**
 * Defines the signature for functions that determine if two arrays are equivalent
 * according to a specific 'atomic' equality logic (e.g., reference vs shallow).
 */
type ArrayComparator<V> = (a: NodeArray<V>, b: NodeArray<V>) => boolean;

/**
 * Represents the active strategy for handling array comparisons.
 * This discriminated union encapsulates the logic required for the selected mode.
 */
export type ArrayStrategy<V> =
  | {
      /**
       * Identifies the strategy where arrays are traversed index-by-index (recursion).
       */
      mode: 'diff';
    }
  | {
      /**
       * Identifies the strategy where arrays are skipped entirely (treated as always equal).
       */
      mode: 'ignore';
    }
  | {
      /**
       * Identifies the strategy where arrays are compared as a single unit.
       */
      mode: 'atomic';
      /**
       * The specific equality function (e.g., reference check or shallow comparison)
       * configured to determine if the array node has changed.
       */
      comparator: ArrayComparator<V>;
    };

/**
 * Factory function that selects and configures the appropriate array comparison strategy
 * based on the provided user options.
 *
 * For 'atomic' mode, this resolves the specific `ArrayComparator` (reference vs shallow)
 * needed to perform the equality check.
 *
 * @param options - The full options object containing `arrays` and `arrayEquality` settings.
 * @returns The configured strategy object ready for use in the diffing loop.
 */
export function getArrayStrategy<V>(options: Options): ArrayStrategy<V> {
  switch (options.arrays) {
    case 'diff':
      return { mode: 'diff' };
    case 'ignore':
      return { mode: 'ignore' };
    case 'atomic': {
      const comparator: ArrayComparator<V> =
        options.arrayEquality === 'reference'
          ? (a, b) => a === b
          : (a, b) => areArraysShallowEqual(a, b);
      return { mode: 'atomic', comparator };
    }
    default:
      throw new Error(`Invalid array policy: ${options.arrays}`);
  }
}

/**
 * Executes the selected array strategy against two array nodes.
 *
 * This function determines the next step in the algorithm:
 * 1. **Atomic/Ignore**: Handles the comparison immediately and returns any resulting diffs.
 *    Signals `shouldRecurse: false` because the array is treated as a leaf or ignored.
 * 2. **Diff**: Returns `shouldRecurse: true`, signaling the caller to iterate over
 *    the array indices and compare them individually.
 *
 * @param strategy - The active array strategy configuration.
 * @param previous - The array from the base state.
 * @param current - The array from the new state.
 * @returns An object containing the recursion instruction and any immediate diffs.
 */
export function checkArrayStrategy<V>(
  strategy: ArrayStrategy<V>,
  previous: NodeArray<V>,
  current: NodeArray<V>
): { shouldRecurse: boolean; diffs: DiffResult<Node<V>>[] } {
  switch (strategy.mode) {
    case 'ignore':
      // Treat arrays as always equal; emit no diffs and do not traverse.
      return { shouldRecurse: false, diffs: [] };

    case 'atomic':
      // Check equality using the configured comparator.
      // If equal: emit no diffs.
      // If different: emit one atomic CHANGE for the entire array.
      return strategy.comparator(previous, current)
        ? { shouldRecurse: false, diffs: [] }
        : {
            shouldRecurse: false,
            diffs: [createChange([], current, previous)]
          };

    case 'diff':
      // Signal the caller to perform standard index-by-index recursion.
      return { shouldRecurse: true, diffs: [] };
  }
}
