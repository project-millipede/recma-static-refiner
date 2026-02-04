import { describe, expect, test } from 'vitest';

import type { TestScenario } from './types';
import { resolveScenarioInput } from './test-utils';
import type { DiffResult } from '../types';
import type { DiffInput } from './helpers';
import { createDiffRunner } from './helpers';

/**
 * Basic object-level operations.
 * Focus: CREATE/CHANGE/REMOVE, leaf replacement, deterministic ordering.
 * Excludes arrays and options coverage.
 */
describe('Basic object operations: CREATE/CHANGE/REMOVE, leaf replacement, deterministic ordering.', () => {
  const run = createDiffRunner();

  const scenarios: Array<
    TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
  > = [
    {
      id: 'Static Key, Added Key',
      description: 'Adds a new own key in the current object.',
      input: {
        previous: { a: 1 },
        current: { a: 1, b: 2 }
      },
      expected: [
        {
          type: 'CREATE',
          path: ['b'],
          value: 2
        }
      ]
    },
    {
      id: 'Static Key, Dynamic Value',
      description: 'Existing key changes value.',
      input: {
        previous: { a: 1 },
        current: { a: 2 }
      },
      expected: [
        {
          type: 'CHANGE',
          path: ['a'],
          value: 2,
          oldValue: 1
        }
      ]
    },
    {
      id: 'Static Key, Removed Key',
      description: 'Removes an own key present only in previous.',
      input: {
        previous: { a: 1, b: 2 },
        current: { a: 1 }
      },
      expected: [
        {
          type: 'REMOVE',
          path: ['b'],
          oldValue: 2
        }
      ]
    },
    {
      id: 'Container to Null',
      description: 'Leaf replacement: object becomes null.',
      input: {
        previous: { obj: { a: 1 } },
        current: { obj: null }
      },
      expected: [
        {
          type: 'CHANGE',
          path: ['obj'],
          value: null,
          oldValue: { a: 1 }
        }
      ]
    },
    {
      id: 'Container to Primitive',
      description: 'Leaf replacement: object becomes primitive.',
      input: {
        previous: { obj: { a: 1 } },
        current: { obj: 'x' }
      },
      expected: [
        {
          type: 'CHANGE',
          path: ['obj'],
          value: 'x',
          oldValue: { a: 1 }
        }
      ]
    },
    {
      id: 'Deterministic Ordering',
      description: 'Removals/changes appear before creations.',
      input: {
        previous: { a: 1, b: 2 },
        current: { b: 3, c: 4 }
      },
      expected: [
        {
          type: 'REMOVE',
          path: ['a'],
          oldValue: 1
        },
        {
          type: 'CHANGE',
          path: ['b'],
          value: 3,
          oldValue: 2
        },
        {
          type: 'CREATE',
          path: ['c'],
          value: 4
        }
      ]
    }
  ];

  test.for(scenarios)('[$id] $description', ({ input, expected }) => {
    expect(run(resolveScenarioInput(input))).toStrictEqual(expected);
  });
});
