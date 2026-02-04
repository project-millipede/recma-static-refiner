import { describe, expect, test } from 'vitest';

import type { TestScenario } from './types';
import { resolveScenarioInput } from './test-utils';
import type { DiffResult } from '../types';
import type { DiffInput } from './helpers';
import { createDiffRunner } from './helpers';

/**
 * Rich types and equality behavior.
 * Focus: Date, RegExp, boxed primitives.
 */
describe('Rich types and equality: Date, RegExp, boxed primitives.', () => {
  const run = createDiffRunner();

  describe('Date', () => {
    const scenarios: Array<
      TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
    > = [
      {
        id: 'Date, Equal',
        description: 'Dates with the same timestamp are equal.',
        input: {
          previous: { d: new Date(1) },
          current: { d: new Date(1) }
        },
        expected: []
      },
      {
        id: 'Date, Changed',
        description: 'Different timestamps emit CHANGE.',
        input: {
          previous: { d: new Date(1) },
          current: { d: new Date(2) }
        },
        expected: [
          {
            type: 'CHANGE',
            path: ['d'],
            value: new Date(2),
            oldValue: new Date(1)
          }
        ]
      }
    ];

    test.for(scenarios)('[$id] $description', ({ input, expected }) => {
      expect(run(resolveScenarioInput(input))).toStrictEqual(expected);
    });
  });

  describe('RegExp', () => {
    const scenarios: Array<
      TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
    > = [
      {
        id: 'RegExp, Equal',
        description: 'Equivalent regex values are equal.',
        input: {
          previous: { re: /a/ },
          current: { re: /a/ }
        },
        expected: []
      },
      {
        id: 'RegExp, Flags Change',
        description: 'Different flags emit CHANGE.',
        input: {
          previous: { re: /a/ },
          current: { re: /a/i }
        },
        expected: [
          {
            type: 'CHANGE',
            path: ['re'],
            value: /a/i,
            oldValue: /a/
          }
        ]
      }
    ];

    test.for(scenarios)('[$id] $description', ({ input, expected }) => {
      expect(run(resolveScenarioInput(input))).toStrictEqual(expected);
    });
  });

  describe('Boxed Primitives', () => {
    const scenarios: Array<
      TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
    > = [
      {
        id: 'Boxed String, Equal',
        description: 'Boxed strings compare by underlying value.',
        input: {
          previous: { s: new String('x') },
          current: { s: new String('x') }
        },
        expected: []
      },
      {
        id: 'Boxed Number, Changed',
        description: 'Boxed numbers emit CHANGE when values differ.',
        input: {
          previous: { n: new Number(1) },
          current: { n: new Number(2) }
        },
        expected: [
          {
            type: 'CHANGE',
            path: ['n'],
            value: new Number(2),
            oldValue: new Number(1)
          }
        ]
      },
      {
        id: 'Boxed Boolean, Changed',
        description: 'Boxed booleans emit CHANGE when values differ.',
        input: {
          previous: { b: new Boolean(true) },
          current: { b: new Boolean(false) }
        },
        expected: [
          {
            type: 'CHANGE',
            path: ['b'],
            value: new Boolean(false),
            oldValue: new Boolean(true)
          }
        ]
      },
      {
        id: 'Boxed Number, NaN',
        description: 'Boxed NaN compares equal to boxed NaN.',
        input: {
          previous: { n: new Number(Number.NaN) },
          current: { n: new Number(Number.NaN) }
        },
        expected: []
      },
      {
        id: 'Boxed BigInt, Equal',
        description: 'Boxed bigints compare by underlying value.',
        input: {
          previous: { bi: Object(1n) },
          current: { bi: Object(1n) }
        },
        expected: []
      },
      {
        id: 'Boxed BigInt, Changed',
        description: 'Boxed bigints emit CHANGE when values differ.',
        input: {
          previous: { bi: Object(1n) },
          current: { bi: Object(2n) }
        },
        expected: [
          {
            type: 'CHANGE',
            path: ['bi'],
            value: Object(2n),
            oldValue: Object(1n)
          }
        ]
      }
    ];

    test.for(scenarios)('[$id] $description', ({ input, expected }) => {
      expect(run(resolveScenarioInput(input))).toStrictEqual(expected);
    });
  });
});
