import { describe, expect, test } from 'vitest';

import type { TestScenario } from './types';
import { resolveScenarioInput } from './test-utils';
import type { DiffResult } from '../types';
import type { DiffInput } from './helpers';
import {
  createArrayAtomicReferenceRunner,
  createArrayAtomicShallowRunner,
  createArrayDiffRunner,
  createArrayIgnoreRunner
} from './helpers';

describe('Arrays: diff vs atomic vs ignore (index semantics + atomic equality).', () => {
  /**
   * Array Policy: Diff (Index Semantics)
   * Priority: first to highlight index-by-index traversal behavior.
   */
  describe('Array Policy: Diff (Index Semantics)', () => {
    const runDiff = createArrayDiffRunner();

    const scenarios: Array<
      TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
    > = [
      {
        id: 'Reorder by Index',
        description: 'Treats reordering as per-index changes.',
        input: {
          previous: [1, 2],
          current: [2, 1]
        },
        expected: [
          { type: 'CHANGE', path: [0], value: 2, oldValue: 1 },
          { type: 'CHANGE', path: [1], value: 1, oldValue: 2 }
        ]
      },
      {
        id: 'Shift on Removal',
        description: 'Index shifts emit CHANGE then trailing REMOVE.',
        input: {
          previous: [1, 2, 3],
          current: [1, 3]
        },
        expected: [
          { type: 'CHANGE', path: [1], value: 3, oldValue: 2 },
          { type: 'REMOVE', path: [2], oldValue: 3 }
        ]
      },
      {
        id: 'Nested Array Growth',
        description: 'New nested index emits CREATE at deep path.',
        input: {
          previous: [[1]],
          current: [[1, 2]]
        },
        expected: [
          {
            type: 'CREATE',
            path: [0, 1],
            value: 2
          }
        ]
      }
    ];

    test.for(scenarios)('[$id] $description', ({ input, expected }) => {
      const resolved = resolveScenarioInput(input);
      expect(runDiff(resolved)).toStrictEqual(expected);
    });
  });

  /**
   * Array Policy: Atomic (Reference, Default)
   * Priority: default behavior in normalizeOptions.
   */
  describe('Array Policy: Atomic (Reference, Default)', () => {
    const runAtomicReference = createArrayAtomicReferenceRunner();

    const scenarios: Array<
      TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
    > = [
      {
        id: 'Same Contents, New Reference',
        description:
          'New array instance triggers CHANGE under reference equality.',
        input: {
          previous: { a: [1, 2] },
          current: { a: [1, 2] }
        },
        expected: [
          {
            type: 'CHANGE',
            path: ['a'],
            value: [1, 2],
            oldValue: [1, 2]
          }
        ]
      },
      {
        id: 'Same Reference',
        description: 'Shared array reference produces no diffs.',
        input: () => {
          const shared = [1, 2];
          return {
            previous: { a: shared },
            current: { a: shared }
          };
        },
        expected: []
      }
    ];

    test.for(scenarios)('[$id] $description', ({ input, expected }) => {
      const resolved = resolveScenarioInput(input);
      expect(runAtomicReference(resolved)).toStrictEqual(expected);
    });
  });

  /**
   * Array Policy: Atomic (Shallow)
   * Priority: shallow equality variant for atomic arrays.
   */
  describe('Array Policy: Atomic (Shallow)', () => {
    const runAtomicShallow = createArrayAtomicShallowRunner();

    const scenarios: Array<
      TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
    > = [
      {
        id: 'Same Contents, Shallow Equal',
        description: 'Identical contents produce no diffs.',
        input: {
          previous: { a: [1, 2] },
          current: { a: [1, 2] }
        },
        expected: []
      },
      {
        id: 'Signed Zero Difference',
        description: 'Shallow equality uses Object.is for +0/-0.',
        input: {
          previous: { a: [0] },
          current: { a: [-0] }
        },
        expected: [
          {
            type: 'CHANGE',
            path: ['a'],
            value: [-0],
            oldValue: [0]
          }
        ]
      },
      {
        id: 'NaN Matches NaN',
        description: 'Shallow equality treats NaN as equal to NaN.',
        input: {
          previous: { a: [Number.NaN] },
          current: { a: [Number.NaN] }
        },
        expected: []
      },
      {
        id: 'Object Element References',
        description: 'Distinct object elements are not shallow-equal.',
        input: {
          previous: { a: [{ x: 1 }] },
          current: { a: [{ x: 1 }] }
        },
        expected: [
          {
            type: 'CHANGE',
            path: ['a'],
            value: [{ x: 1 }],
            oldValue: [{ x: 1 }]
          }
        ]
      }
    ];

    test.for(scenarios)('[$id] $description', ({ input, expected }) => {
      const resolved = resolveScenarioInput(input);
      expect(runAtomicShallow(resolved)).toStrictEqual(expected);
    });
  });

  /**
   * Array Policy: Ignore
   * Priority: arrays are treated as always equal.
   */
  describe('Array Policy: Ignore', () => {
    const runIgnore = createArrayIgnoreRunner();

    const scenarios: Array<
      TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
    > = [
      {
        id: 'Ignore Differences',
        description: 'Array changes are ignored entirely.',
        input: {
          previous: { a: [1] },
          current: { a: [2] }
        },
        expected: []
      }
    ];

    test.for(scenarios)('[$id] $description', ({ input, expected }) => {
      const resolved = resolveScenarioInput(input);
      expect(runIgnore(resolved)).toStrictEqual(expected);
    });
  });
});
