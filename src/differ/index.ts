import type { Container, CycleEntry, DiffResult, Node, Options } from './types';

import {
  areBoxedPrimitivesEqual,
  createChange,
  createCreate,
  createRemove,
  formatPathKey,
  getSafeValue,
  isContainer,
  shouldSkipKey,
  isRichType,
  normalizeOptions,
  prependPath
} from './utils';

import {
  type ArrayStrategy,
  checkArrayStrategy,
  getArrayStrategy
} from './strategies';

/**
 * Checks if the current pair of containers has already been processed in the
 * current recursion stack.
 *
 * Logic:
 * 1. Traversal:
 *    Iterates through the provided `stack`
 *    (the history of the current recursion path).
 * 2. Comparison:
 *    Checks if the exact pair of references (`previous` and `current`) matches
 *    any pair already recorded in the history.
 * 3. Detection:
 *    If a match is found, it confirms a circular reference
 *    (a "back-edge" in the graph traversal).
 *
 * @template V - The type of leaf values within the containers.
 * @param stack - The current recursion path history (list of ancestor pairs).
 * @param previous - The container from the base state currently being visited.
 * @param current - The container from the new state currently being visited.
 * @returns `true` if the pair exists in the stack, indicating a cycle.
 */
function isCycleDetected<V>(
  stack: readonly CycleEntry<V>[],
  previous: Container<V>,
  current: Container<V>
): boolean {
  for (const [seenPrevious, seenCurrent] of stack) {
    // If both sides match an ancestor pair by reference, we have looped.
    if (seenPrevious === previous && seenCurrent === current) return true;
  }
  return false;
}

/**
 * Conditionally adds the current pair of containers to the recursion history stack.
 *
 * Logic:
 * 1. Configuration Check:
 *    Verifies if `trackCircularReferences` is enabled in the options.
 *    If disabled, the function returns the original stack immediately (no-op).
 * 2. Entry Creation:
 *    Constructs a `CycleEntry` tuple containing the `previous` and `current`
 *    container references.
 * 3. Immutable Update:
 *    Returns a **new** array containing the existing history plus the new entry.
 *    This ensures the stack is strictly path-scoped and does not leak to sibling branches.
 *
 * @template V - The type of leaf values within the containers.
 * @param options - The global configuration object.
 * @param stack - The current recursion path history.
 * @param previous - The container from the base state.
 * @param current - The container from the new state.
 * @returns A new stack array with the entry added, or the original stack if tracking is disabled.
 */
function pushCycleEntry<V>(
  options: Options,
  stack: readonly CycleEntry<V>[],
  previous: Container<V>,
  current: Container<V>
): readonly CycleEntry<V>[] {
  if (!options.trackCircularReferences) return stack;

  // Create the tuple explicitly to satisfy the CycleEntry type definition
  const newEntry: CycleEntry<V> = [previous, current];
  return stack.concat([newEntry]);
}

/**
 * Iterates over the keys (or indices) of two containers to identify additions,
 * removals, and modifications.
 *
 * Logic:
 * 1. Deletions & Updates: Iterates over keys in the `previousContainer`.
 *    - If a key is missing in `currentContainer`, emits a `REMOVE`.
 *    - If a key exists in both, proceeds to recursive or shallow comparison.
 * 2. Recursion: If both values are traversable containers, checks for cycles and recurses.
 * 3. Leaf Comparison: If values are primitives or "Rich Types" (e.g., Date), compares them by value/reference.
 * 4. Additions: Iterates over keys in the `currentContainer`.
 *    - If a key is missing in `previousContainer`, emits a `CREATE`.
 *
 * Execution Flow (Depth-First, Bottom-Up):
 * The algorithm performs a Depth-First Traversal, descending into the tree
 * until it identifies a specific node (leaf or container) that has changed.
 * Once a difference is detected, the full property path is constructed lazily
 * as the recursion stack returns.
 *
 * Trace Example:
 * _Comparing `prev: { users: [{ name: "Alice" }] }` vs
 *            `curr: { users: [{ name: "Bob" }] }`_
 *
 * 1. Dive (Root → Leaf):
 *    - Root: Iterates keys. Finds `"users"`.
 *      - Condition: Both values are Arrays (compatible containers).
 *      - Action: Recurse into the Array.
 *    - Array: Iterates indices. Finds index `0`.
 *      - Condition: Both values are Objects (compatible containers).
 *      - Action: Recurse into the Object.
 *    - Leaf: Iterates keys. Finds `"name"`.
 *      - Condition: Values are strings (Atomic/Leaves), not containers.
 *      - Action: Compare values directly.
 *
 * 2. Detection (Leaf Level):
 *    - Compares `"Alice"` vs `"Bob"`. Mismatch found.
 *    - Diff Created: `{ type: 'CHANGE', path: ['name'], ... }`
 *
 * 3. Bubble Up (Leaf → Root):
 *    - Recursion returns to Array Level. Prepends index `0`.
 *      -> Path updates to `[0, 'name']`.
 *    - Recursion returns to Root Level. Prepends key `"users"`.
 *      -> Path updates to `['users', 0, 'name']`.
 *
 * Rationale for Bottom-Up Strategy:
 * 1. GC Pressure:
 *    A Top-Down approach (passing accumulated paths down) forces array
 *    allocation for *every* node visited, creating significant Garbage
 *    Collection overhead.
 * 2. Laziness:
 *    The Bottom-Up approach is lazy; the cost of path construction (array
 *    allocation + shifting) is incurred only when actual differences are
 *    detected.
 *
 * @template V - The type of leaf values in the tree structure.
 * @param previousContainer - The container from the base state.
 * @param currentContainer - The container from the new state.
 * @param options - The normalized configuration object.
 * @param cycleStack - The current recursion history for cycle detection.
 * @param arrayStrategy - The pre-calculated strategy for array comparisons.
 * @returns An array of differences found within these containers.
 */
function compareChildren<V>(
  previousContainer: Container<V>,
  currentContainer: Container<V>,
  options: Options,
  cycleStack: readonly CycleEntry<V>[],
  arrayStrategy: ArrayStrategy<V>
): DiffResult<Node<V>>[] {
  const differences: DiffResult<Node<V>>[] = [];

  const isPreviousArray = Array.isArray(previousContainer);
  const isCurrentArray = Array.isArray(currentContainer);
  const previousKeys = Object.keys(previousContainer);

  // =========================================================================
  // Phase 1: Detect Removals and Modifications
  //
  // Strategy: Iterate over the OLD state (`previousContainer`).
  // 1. If a key is missing in the NEW state, it was REMOVED.
  // 2. If a key exists in both, compare values to find CHANGES.
  // =========================================================================
  for (const key of previousKeys) {
    // 1. Configuration Check (Skip List)
    if (shouldSkipKey(key, isPreviousArray, options.keysToSkip)) continue;

    const previousValue = getSafeValue(previousContainer, key)!;
    const pathSegment = formatPathKey(key, isPreviousArray);

    // 2. Removal Check
    if (!(key in currentContainer)) {
      differences.push(createRemove([pathSegment], previousValue));
      continue;
    }

    const currentValue = getSafeValue(currentContainer, key)!;

    // -----------------------------------------------------------------------
    // Step 3: Deep Comparison (Recursion)
    //
    // Strategy:
    // 1. Validate: Both values must be compatible containers (e.g., both Arrays or both Objects).
    // 2. Guard: Check for circular references (if tracking is enabled).
    // 3. Filter: "Rich Types" (Date, RegExp) are treated as atomic leaves, not containers.
    // 4. Execute: Recurse into children and prepend the current path segment to results.
    // -----------------------------------------------------------------------
    if (
      isContainer(previousValue) &&
      isContainer(currentValue) &&
      Array.isArray(previousValue) === Array.isArray(currentValue)
    ) {
      if (
        options.trackCircularReferences &&
        isCycleDetected(cycleStack, previousValue, currentValue)
      ) {
        continue;
      }

      if (!isRichType(previousValue)) {
        const nextStack = pushCycleEntry(
          options,
          cycleStack,
          previousValue,
          currentValue
        );

        const childDiffs = compare(
          previousValue,
          currentValue,
          options,
          nextStack,
          arrayStrategy
        );

        differences.push(...prependPath(childDiffs, pathSegment));
        continue;
      }
    }

    // -----------------------------------------------------------------------
    // Step 4: Leaf Comparison (Shallow)
    //
    // Condition: Values are Primitives, "Rich Types", or Mismatched Containers.
    // Strategy:
    // 1. Compare values directly using `Object.is`.
    // 2. handle "Boxed Primitives" (e.g., `new Number(1)`) explicitly to ensure value equality.
    // 3. Emit a CHANGE if values differ.
    // -----------------------------------------------------------------------
    const hasValueMismatch = !Object.is(previousValue, currentValue);

    const areBoxedPrimitives =
      isContainer(previousValue) &&
      isContainer(currentValue) &&
      areBoxedPrimitivesEqual(previousValue, currentValue);

    if (hasValueMismatch && !areBoxedPrimitives) {
      differences.push(
        createChange([pathSegment], currentValue, previousValue)
      );
    }
  }

  // =========================================================================
  // Phase 2: Detect Additions
  //
  // Strategy: Iterate over the NEW state (`currentContainer`).
  // 1. If a key is missing in the OLD state, it was CREATED.
  // 2. Note: Modifications were already caught in Phase 1, skip them here.
  // =========================================================================
  const currentKeys = Object.keys(currentContainer);

  for (const key of currentKeys) {
    if (shouldSkipKey(key, isCurrentArray, options.keysToSkip)) continue;

    if (!(key in previousContainer)) {
      const currentValue = getSafeValue(currentContainer, key)!;
      differences.push(
        createCreate([formatPathKey(key, isCurrentArray)], currentValue)
      );
    }
  }

  return differences;
}

/**
 * The central recursive dispatch function. Determines the comparison method
 * based on node type and configuration.
 *
 * Logic:
 * 1. Array Optimization:
 *    If both nodes are arrays, consults the active `ArrayStrategy`.
 *    - If the strategy is `'atomic'` or `'ignore'`, it performs the check
 *      immediately and returns results.
 *    - If the strategy is `'diff'`, it proceeds to step 2.
 * 2. Traversal:
 *    Delegates to `compareChildren` to iterate over keys (for Objects) or
 *    indices (for Arrays in 'diff' mode) and recursively compare child nodes.
 *
 * @template V - The type of leaf values in the tree structure.
 * @param previous - The container from the base state.
 * @param current - The container from the new state.
 * @param options - The normalized configuration object.
 * @param cycleStack - The current recursion history for cycle detection.
 * @param arrayStrategy - The pre-calculated strategy for array comparisons.
 * @returns An array of differences found at this level or below.
 */
function compare<V>(
  previous: Container<V>,
  current: Container<V>,
  options: Options,
  cycleStack: readonly CycleEntry<V>[],
  arrayStrategy: ArrayStrategy<V>
): DiffResult<Node<V>>[] {
  // 1. Array Strategy Check
  if (Array.isArray(previous) && Array.isArray(current)) {
    const { shouldRecurse, diffs } = checkArrayStrategy(
      arrayStrategy,
      previous,
      current
    );

    // 2. Early Exit (Atomic/Ignore)
    if (!shouldRecurse) return diffs;
  }

  // 3. Recursive Traversal (Objects or 'diff' mode Arrays)
  return compareChildren(previous, current, options, cycleStack, arrayStrategy);
}

/**
 * Calculates the deep structural difference between two traversable containers
 * (Objects or Arrays).
 *
 * Logic:
 * 1. Configuration:
 *    Normalizes the provided `options` by merging them with library defaults
 *    (e.g., enabling circular reference tracking, setting array mode to 'atomic').
 * 2. Strategy Resolution:
 *    Constructs the specific `ArrayStrategy` object required to handle array
 *    comparisons (Atomic vs Diff) based on the configuration.
 * 3. Execution:
 *    Initiates the recursive comparison algorithm starting at the provided root
 *    nodes with an empty recursion history.
 *
 * @template V - The type of leaf values in the tree structure.
 * @param previous - The original structure (base state).
 * @param current - The new structure (updated state).
 * @param options - Optional configuration settings to customize behavior.
 * @returns An array of differences describing the operations required to transform `previous` into `current`.
 */
export function diff<V>(
  previous: Container<V>,
  current: Container<V>,
  options: Partial<Options> = {}
): DiffResult<Node<V>>[] {
  const normalized = normalizeOptions(options);
  const strategy = getArrayStrategy<V>(normalized);

  // Pass '[]' (empty array) as the initial cycleStack.
  // This initializes the recursion state while keeping the public API clean.
  return compare(previous, current, normalized, [], strategy);
}
