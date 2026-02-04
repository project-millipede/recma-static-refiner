import type { Container, DiffResult, Node, Options } from '../types';
import { diff } from '..';

/**
 * Diff Input
 * Represents the input payload for a diff test.
 *
 * @template V - The leaf value type contained in the compared structures.
 */
export type DiffInput<V = unknown> = {
  /**
   * The base structure (previous state).
   */
  previous: Container<V>;

  /**
   * The updated structure (current state).
   */
  current: Container<V>;

  /**
   * Optional per-scenario overrides for diff configuration.
   */
  options?: Partial<Options>;
};

/**
 * Diff Runner
 * Represents a configured diff execution function used in tests.
 *
 * @template V - The leaf value type contained in the compared structures.
 */
export type DiffRunner<V = unknown> = (
  input: DiffInput<V>
) => DiffResult<Node<V>>[];

/**
 * Creates a diff runner with a fixed set of base options.
 *
 * Per-scenario options (if provided) are merged first, so the base options win.
 * This ensures each suite can enforce its intended configuration explicitly.
 *
 * @template V - The leaf value type contained in the compared structures.
 * @param baseOptions - The configuration to apply for all runs of this runner.
 * @returns A diff runner that applies the base options on every call.
 */
export function createDiffRunner<V = unknown>(
  baseOptions: Partial<Options> = {}
): DiffRunner<V> {
  return (input: DiffInput<V>) =>
    diff(input.previous, input.current, {
      ...input.options,
      ...baseOptions
    });
}

/**
 * Creates a diff runner for arrays in index-by-index traversal mode.
 *
 * @template V - The leaf value type contained in the compared structures.
 * @returns A diff runner configured with `arrays: 'diff'`.
 */
export function createArrayDiffRunner<V = unknown>(): DiffRunner<V> {
  return createDiffRunner<V>({ arrays: 'diff' });
}

/**
 * Creates a diff runner for atomic arrays using reference equality.
 *
 * @template V - The leaf value type contained in the compared structures.
 * @returns A diff runner configured with `arrays: 'atomic'` and `arrayEquality: 'reference'`.
 */
export function createArrayAtomicReferenceRunner<V = unknown>(): DiffRunner<V> {
  return createDiffRunner<V>({ arrays: 'atomic', arrayEquality: 'reference' });
}

/**
 * Creates a diff runner for atomic arrays using shallow equality.
 *
 * @template V - The leaf value type contained in the compared structures.
 * @returns A diff runner configured with `arrays: 'atomic'` and `arrayEquality: 'shallow'`.
 */
export function createArrayAtomicShallowRunner<V = unknown>(): DiffRunner<V> {
  return createDiffRunner<V>({ arrays: 'atomic', arrayEquality: 'shallow' });
}

/**
 * Creates a diff runner for arrays that are always ignored.
 *
 * @template V - The leaf value type contained in the compared structures.
 * @returns A diff runner configured with `arrays: 'ignore'`.
 */
export function createArrayIgnoreRunner<V = unknown>(): DiffRunner<V> {
  return createDiffRunner<V>({ arrays: 'ignore' });
}
