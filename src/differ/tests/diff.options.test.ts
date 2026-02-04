import { describe, expect, test } from 'vitest';

import type { TestScenario } from './types';
import { resolveScenarioInput } from './test-utils';
import type { DiffResult } from '../types';
import type { DiffInput } from './helpers';
import { createDiffRunner } from './helpers';

/**
 * Options coverage.
 * Focus: keysToSkip and trackCircularReferences.
 * Note: array policy matrix + arrayEquality are covered in diff.arrays.test.ts.
 */
describe('Options coverage: arrays policy matrix, arrayEquality, keysToSkip, trackCircularReferences.', () => {
  describe('keysToSkip', () => {
    const run = createDiffRunner();

    const scenarios: Array<
      TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
    > = [
      {
        id: 'Skip Prevents Recursion',
        description:
          'Skipped keys emit no diffs even when nested values change.',
        input: {
          previous: { a: 1, skip: { x: 1 } },
          current: { a: 2, skip: { x: 2 } },
          options: { keysToSkip: ['skip'] }
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
        id: 'Skip Suppresses Create Remove',
        description:
          'Skipped keys emit no CREATE/REMOVE when added or removed.',
        input: {
          previous: { skip: 1 },
          current: {},
          options: { keysToSkip: ['skip'] }
        },
        expected: []
      },
      {
        id: 'Skip Does Not Apply To Arrays',
        description: 'Array indices are never skipped, even if listed.',
        input: {
          previous: [1],
          current: [],
          options: { keysToSkip: ['0'], arrays: 'diff' }
        },
        expected: [
          {
            type: 'REMOVE',
            path: [0],
            oldValue: 1
          }
        ]
      }
    ];

    test.for(scenarios)('[$id] $description', ({ input, expected }) => {
      expect(run(resolveScenarioInput(input))).toStrictEqual(expected);
    });
  });

  describe('trackCircularReferences', () => {
    const runWithCycles = createDiffRunner({
      trackCircularReferences: true
    });

    const scenarios: Array<
      TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
    > = [
      {
        id: 'Self-Cycle, Guarded',
        description: 'Cycle tracking prevents infinite recursion.',
        input: () => {
          const obj: Record<string, unknown> = {};
          obj.self = obj;
          return {
            previous: obj,
            current: obj
          };
        },
        expected: []
      }
    ];

    test.for(scenarios)('[$id] $description', ({ input, expected }) => {
      expect(runWithCycles(resolveScenarioInput(input))).toStrictEqual(
        expected
      );
    });
  });
});
