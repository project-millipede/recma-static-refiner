import type { PropertyPath } from 'estree-util-to-static-value';
import type { LeafOnlyPatchingConstraint } from '../architecture';
import type { Simplify } from './types-helper';

export type { PropertyPath };

/**
 * The mutation primitive describing how to modify the AST.
 */
export type PatchOperation =
  /**
   * Value Replacement
   * Overwrites the value slot of the target AST node.
   * The structural container (Property/Element) remains in place.
   */
  | 'set'

  /**
   * Structural Removal
   * Removes the target AST node (Property/Element) entirely from its parent container.
   */
  | 'delete';

/**
 * Internal helper to strictly enforce the operation contract.
 * - Binds `operation` to the allowed `PatchOperation` union.
 * - Enforces the `path` constraint globally (DRY).
 */
type Patch<Op extends PatchOperation> = {
  /**
   * The mutation action to perform.
   * @see {@link PatchOperation}
   */
  operation: Op;

  /**
   * The logical path to the target AST node.
   *
   * @see {@link PropertyPath}
   *
   * Constraint:
   * Must point to an existing node in the source AST (Leaf-Only).
   */
  path: PropertyPath;
};

export type PatchPhase =
  /**
   * Schema Validation (Op: `set` on AST value)
   * Updates extracted values to match the validated schema (e.g. "5" -> 5).
   * Strictly updates existing leaf values; never deletes.
   */
  | 'diff'

  /**
   * Computed Logic (Op: `set` on AST value)
   * Applies user-defined values computed at build time via `DerivedPatchBuilder`.
   * Requires an existing placeholder slot (e.g. `initialState={null}`) to overwrite.
   */
  | 'derive'

  /**
   * Explicit Pruning (Op: `delete` of AST property)
   * Removes keys explicitly banned by configuration.
   * The only source of removals.
   */
  | 'prune';

/**
 * A patch instruction that updates a value.
 */
export type SetPropertyPatch = Simplify<
  Patch<'set'> & {
    /**
     * The new content to write to the AST.
     *
     * Serialization:
     * The patcher converts this plain JS value into the corresponding ESTree node
     * (e.g. `Literal`, `ArrayExpression`, `ObjectExpression`).
     */
    value: unknown;
  }
>;

/**
 * A patch instruction that removes a node.
 */
export type DeletePropertyPatch = Simplify<Patch<'delete'>>;

/**
 * A mutation instruction restricted to the existing AST structure.
 *
 * Adheres to the **Leaf-Only Patching Constraint**:
 * 1. No Insertions:
 *    New keys cannot be created (ambiguous precedence).
 * 2. Topology Dependent:
 *    Operations require a specific AST node to exist at the target path.
 *
 * @see {@link LeafOnlyPatchingConstraint}
 */
export type PropertyPatch = SetPropertyPatch | DeletePropertyPatch;

/**
 * Resolves the patch type allowed for a given phase.
 *
 * Phase constraint:
 * - `'prune'` => {@link DeletePropertyPatch}
 * - otherwise => {@link SetPropertyPatch}
 */
type PhasePatch<Phase extends PatchPhase> = Phase extends 'prune'
  ? DeletePropertyPatch
  : SetPropertyPatch;

/**
 * Internal helper to bind a patch list to a specific {@link PatchPhase}.
 *
 * This encodes the **Phase → Operation Invariant** at the group level:
 * - `'diff'` and `'derive'` groups are strictly **Set-Only**.
 * - `'prune'` groups are strictly **Delete-Only**.
 */
type PatchGroupOf<Phase extends PatchPhase> = {
  /**
   * The pipeline phase that produced these patches (discriminator).
   * @see {@link PatchPhase}
   */
  phase: Phase;

  /**
   * The patches produced in this phase.
   *
   * Constraint:
   * Strictly narrowed to the operation allowed by the phase.
   */
  patches: readonly PhasePatch<Phase>[];
};

/**
 * A logical grouping of patches organized by their provenance phase.
 *
 * This structure serves as the fundamental unit of work for the patch
 * application pipeline, ensuring that operations are applied in the correct
 * order and adhere to phase-specific constraints (e.g. prune = delete-only).
 *
 * Represents a discriminated union of all possible phase groups.
 *
 * Implementation Note:
 * This definition employs **Distributive Conditional Types**.
 * By evaluating the generic parameter `P` directly (unwrapped), TypeScript
 * iterates over the `PatchPhase` union and generates a distinct
 * `PatchGroupOf<P>` object for each phase, rather than merging them into a
 * loose type.
 *
 * Distinction (Why this matters):
 *
 * 1. With Distribution (Current):
 *    Type resolves to a strict Discriminated Union:
 *    | { phase: 'diff';  patches: SetPropertyPatch[] }
 *    | { phase: 'prune'; patches: DeletePropertyPatch[] }
 *    (Strict correlation: 'prune' implies Delete patches).
 *
 * 2. Without Distribution (e.g. `PatchGroupOf<PatchPhase>`):
 *    Type resolves to a loose Object:
 *    {
 *      phase: 'diff' | 'prune';
 *      patches: (SetPropertyPatch | DeletePropertyPatch)[];
 *    }
 *    (Unsafe: allows a 'prune' phase to contain 'set' patches).
 *
 * @see https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types
 */
export type PatchGroup<P extends PatchPhase = PatchPhase> = P extends any
  ? PatchGroupOf<P>
  : never;
