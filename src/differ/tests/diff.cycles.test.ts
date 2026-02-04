import { describe, expect, test } from 'vitest';

import type { TestScenario } from './types';
import { resolveScenarioInput } from './test-utils';
import type { DiffResult, Options } from '../types';
import type { DiffInput } from './helpers';
import { createDiffRunner } from './helpers';

/**
 * Cyclic references.
 * Focus: self-cycle, ancestor references, alias-path duplicates.
 */
describe('Cycles: self-cycle, ancestor references, alias-path duplicates.', () => {
  const runWithCycles = createDiffRunner({
    trackCircularReferences: true
  } as Partial<Options>);

  describe('Self-Cycle', () => {
    const scenarios: Array<
      TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
    > = [
      {
        id: 'Self-Cycle, Stable',
        description: 'Self-referential object does not recurse infinitely.',
        input: () => {
          const obj: Record<string, unknown> = {};
          obj.self = obj;
          return {
            previous: obj,
            current: obj,
            options: { trackCircularReferences: true }
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

  describe('Ancestor Reference', () => {
    const scenarios: Array<
      TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
    > = [
      {
        id: 'Ancestor Reference, Stable',
        description:
          'Nested object referencing an ancestor does not recurse infinitely.',
        input: () => {
          const a: Record<string, unknown> = {};
          const obj: Record<string, unknown> = { a };
          a.b = obj;

          return {
            previous: obj,
            current: obj,
            options: { trackCircularReferences: true }
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

  describe('Alias Paths', () => {
    const scenarios: Array<
      TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
    > = [
      {
        id: 'Alias Path, Duplicate Diffs',
        description: 'Alias edges can emit additional diffs at nested paths.',
        input: () => {
          const previous: Record<string, unknown> = {};
          previous.self = previous;
          previous.a = 1;

          const current: Record<string, unknown> = {};
          current.self = current;
          current.a = 2;

          return {
            previous,
            current,
            options: { trackCircularReferences: true }
          };
        },
        expected: [
          {
            type: 'CHANGE',
            path: ['self', 'a'],
            value: 2,
            oldValue: 1
          },
          {
            type: 'CHANGE',
            path: ['a'],
            value: 2,
            oldValue: 1
          }
        ]
      }
    ];

    test.for(scenarios)('[$id] $description', ({ input, expected }) => {
      expect(runWithCycles(resolveScenarioInput(input))).toStrictEqual(
        expected
      );
    });
  });
});
