/**
 * Shared properties common to all difference events.
 */
type DiffBase = {
  /**
   * The key path from the root to this node (e.g., `["users", 0, "name"]`).
   *
   * This is an ordered array of keys (strings for objects, numbers for array indices)
   * leading to the location of the difference.
   */
  path: (string | number)[];
};

/**
 * Represents a **creation** event.
 * Occurs when a property or index exists in the `current` structure but was missing in `previous`.
 */
export type DiffCreate<TNode> = DiffBase & {
  /**
   * Discriminator literal identifying the type of change.
   */
  type: 'CREATE';
  /**
   * The new value that was added.
   */
  value: TNode;
};

/**
 * Represents a **deletion** event.
 * Occurs when a property or index existed in `previous` but is missing in `current`.
 */
export type DiffRemove<TNode> = DiffBase & {
  /**
   * Discriminator literal identifying the type of change.
   */
  type: 'REMOVE';
  /**
   * The value that was removed.
   */
  oldValue: TNode;
};

/**
 * Represents a **modification** event.
 * Occurs when a property or index exists in both structures, but the values differ
 * (and were not considered equal by the current equality strategy).
 */
export type DiffChange<TNode> = DiffBase & {
  /**
   * Discriminator literal identifying the type of change.
   */
  type: 'CHANGE';
  /**
   * The new value in the `current` structure.
   */
  value: TNode;
  /**
   * The previous value in the `previous` structure.
   */
  oldValue: TNode;
};

/**
 * Union of all possible difference results emitted by the diffing algorithm.
 */
export type DiffResult<TNode> =
  | DiffCreate<TNode>
  | DiffRemove<TNode>
  | DiffChange<TNode>;

/**
 * The fundamental unit of the diffable tree.
 * Recursively defined as either a leaf value of type `V`, or a container holding other Nodes.
 *
 * @template V - The type of leaf values in the tree structure (e.g., primitives or atomic objects).
 */
export type Node<V> = V | NodeObject<V> | NodeArray<V>;

/**
 * A dictionary/map-like container node where keys are strings.
 *
 * @template V - The type of leaf values contained in the structure.
 */
export type NodeObject<V> = { [key: string]: Node<V> };

/**
 * An ordered list container node.
 *
 * @template V - The type of leaf values contained in the structure.
 */
export type NodeArray<V> = Node<V>[];

/**
 * Represents a **traversable** structure (Internal Node).
 * The algorithm can recurse into these structures to find differences in their children.
 *
 * Anything NOT matching this type is considered a "Leaf" and compared by value.
 *
 * @template V - The type of leaf values contained in the structure.
 */
export type Container<V> = NodeObject<V> | NodeArray<V>;

/**
 * A record of a specific pair of containers being compared at a specific depth in the recursion stack.
 *
 * This is used by the `trackCircularReferences` option to detect when the traversal
 * loops back to a pair of objects that is already currently being compared.
 *
 * @template V - The type of leaf values within the containers.
 */
export type CycleEntry<V> = readonly [
  previous: Container<V>,
  current: Container<V>
];

export type Options = {
  /**
   * If true, prevent infinite recursion on circular references by tracking
   * container-pairs seen on the current recursion path.
   *
   * **How it works:**
   * - During recursion, the algorithm tracks pairs of containers (`previousNode`, `currentNode`)
   *   that have already been compared on the CURRENT recursion chain.
   * - If the SAME pair is encountered again, it indicates a circular back-edge
   *   (looping through the same references).
   * - In that case, the edge is treated as equivalent and no diffs are emitted for it,
   *   preventing infinite recursion / stack overflow.
   *
   * **Notes:**
   * - This is path-scoped (not global): it only guards against cycles reachable
   *   from the current traversal branch.
   * - If `false`, cyclic graphs may cause a stack overflow.
   */
  trackCircularReferences: boolean;

  /**
   * Controls how arrays are handled during diffing.
   *
   * - **"diff"**:
   *   Traverse into arrays by index and emit index-level diffs.
   *   This matches the original behavior of the baseline implementation.
   *
   * - **"atomic"**:
   *   Do NOT traverse into arrays.
   *   Arrays are treated as a single value at their property path:
   *     - If the array is considered different, emit exactly ONE CHANGE at the
   *       array property (path points to the array, not its indices).
   *     - If considered equal, emit nothing.
   *   In this mode, `arrayEquality` IS used to decide whether the old/new arrays
   *   are "equal" or "different".
   *
   * - **"ignore"**:
   *   Do NOT traverse into arrays and never emit diffs for them.
   *   Arrays are treated as always equal (even if they are different).
   *   In this mode, `arrayEquality` is NOT used.
   */
  arrays: 'diff' | 'atomic' | 'ignore';

  /**
   * Defines the comparison logic used to detect changes when `arrays` is set to `'atomic'`.
   * This setting is ignored in `'diff'` or `'ignore'` modes.
   *
   * - **"reference"**:
   *   Arrays are equal iff they are the same array instance (`a === b`).
   *   This means any transformation that produces a new array reference
   *   (even with identical contents) will cause one atomic CHANGE.
   *
   * - **"shallow"**:
   *   Arrays are equal iff they are the same instance or contain identical values.
   *
   *   Comparison logic:
   *     1. **Reference Optimization**: Returns `true` immediately if `a === b`.
   *     2. **Content Verification**: If references differ, it checks length and items (`Object.is`).
   *
   *   This combination allows the diff to be fast when references match, while still
   *   ignoring "reference churn" (new instances with identical data) when they don't.
   */
  arrayEquality: 'reference' | 'shallow';

  /**
   * Object-key skip list (objects only; never applies to arrays).
   *
   * **Behavior:**
   * - If a key is listed here, the diff will NOT emit CREATE/REMOVE/CHANGE for
   *   that object property and will NOT recurse into it.
   * - This is commonly used to make certain object properties "opaque"
   *   (e.g., runtime-owned fields like `children`).
   *
   * **Notes:**
   * - This list is applied only to object keys. Array indices are never skipped
   *   by this setting.
   */
  keysToSkip?: readonly string[];
};
