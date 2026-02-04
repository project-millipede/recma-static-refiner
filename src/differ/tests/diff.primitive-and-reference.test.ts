import { describe, expect, test } from 'vitest';

import type { TestScenario } from './types';
import { resolveScenarioInput } from './test-utils';
import type { DiffResult } from '../types';
import type { DiffInput } from './helpers';
import { createDiffRunner } from './helpers';

/**
 * Primitive values and reference behavior.
 * Focus: NaN, +0/-0, BigInt primitives, functions, rich-to-non-rich switches.
 */
describe('Leaf equality: NaN, +0/-0, BigInt primitives, functions, type switches.', () => {
  const run = createDiffRunner();

  describe('Type Switches', () => {
    const scenarios: Array<
      TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
    > = [
      {
        id: 'Date, Type Switch',
        description: 'Date vs non-date emits CHANGE.',
        input: {
          previous: { d: new Date(1) },
          current: { d: 'x' }
        },
        expected: [
          {
            type: 'CHANGE',
            path: ['d'],
            value: 'x',
            oldValue: new Date(1)
          }
        ]
      }
    ];

    test.for(scenarios)('[$id] $description', ({ input, expected }) => {
      expect(run(resolveScenarioInput(input))).toStrictEqual(expected);
    });
  });

  describe('BigInt Primitives', () => {
    const scenarios: Array<
      TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
    > = [
      {
        id: 'BigInt, Equal',
        description: 'Equal bigint values emit no diffs.',
        input: {
          previous: { bi: 1n },
          current: { bi: 1n }
        },
        expected: []
      },
      {
        id: 'BigInt, Changed',
        description: 'Different bigint values emit CHANGE.',
        input: {
          previous: { bi: 1n },
          current: { bi: 2n }
        },
        expected: [
          {
            type: 'CHANGE',
            path: ['bi'],
            value: 2n,
            oldValue: 1n
          }
        ]
      }
    ];

    test.for(scenarios)('[$id] $description', ({ input, expected }) => {
      expect(run(resolveScenarioInput(input))).toStrictEqual(expected);
    });
  });

  describe('NaN and Signed Zero', () => {
    const scenarios: Array<
      TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
    > = [
      {
        id: 'NaN, Stable',
        description: 'NaN remains equal to NaN.',
        input: {
          previous: { n: Number.NaN },
          current: { n: Number.NaN }
        },
        expected: []
      },
      {
        id: 'NaN, Change',
        description: 'NaN to number emits CHANGE.',
        input: {
          previous: { n: Number.NaN },
          current: { n: 0 }
        },
        expected: [
          {
            type: 'CHANGE',
            path: ['n'],
            value: 0,
            oldValue: Number.NaN
          }
        ]
      },
      {
        id: 'Signed Zero, Change',
        description: '+0 and -0 are distinct values.',
        input: {
          previous: { z: 0 },
          current: { z: -0 }
        },
        expected: [
          {
            type: 'CHANGE',
            path: ['z'],
            value: -0,
            oldValue: 0
          }
        ]
      }
    ];

    test.for(scenarios)('[$id] $description', ({ input, expected }) => {
      expect(run(resolveScenarioInput(input))).toStrictEqual(expected);
    });
  });

  describe('Functions', () => {
    const stableFn = () => 1;
    const oldFn = () => 1;
    const newFn = () => 1;

    const scenarios: Array<
      TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
    > = [
      {
        id: 'Function, Same Reference',
        description: 'Identical function reference emits no diffs.',
        input: {
          previous: { fn: stableFn },
          current: { fn: stableFn }
        },
        expected: []
      },
      {
        id: 'Function, New Reference',
        description: 'Different function references emit CHANGE.',
        input: {
          previous: { fn: oldFn },
          current: { fn: newFn }
        },
        expected: [
          {
            type: 'CHANGE',
            path: ['fn'],
            value: newFn,
            oldValue: oldFn
          }
        ]
      }
    ];

    test.for(scenarios)('[$id] $description', ({ input, expected }) => {
      expect(run(resolveScenarioInput(input))).toStrictEqual(expected);
    });
  });
});
