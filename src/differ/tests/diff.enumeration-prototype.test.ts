import { describe, expect, test } from 'vitest';

import type { TestScenario } from './types';
import { resolveScenarioInput } from './test-utils';
import type { DiffResult } from '../types';
import type { DiffInput } from './helpers';
import { createDiffRunner } from './helpers';

function createNullProtoRecord(): Record<string, unknown> {
  const obj: Record<string, unknown> = Object.create(null);
  return obj;
}

function createNonEnumerable(
  key: string,
  value: unknown
): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  Object.defineProperty(obj, key, {
    value,
    enumerable: false,
    configurable: true,
    writable: true
  });
  return obj;
}

function createSymbolOnlyObject(
  symbolKey: symbol,
  value: unknown
): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  Object.defineProperty(obj, symbolKey, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  });
  return obj;
}

/**
 * Enumeration and prototype behavior.
 * Focus: symbol keys, non-enumerables, inherited keys, null-proto objects.
 */
describe('Enumeration/prototype behavior: symbols, non-enumerables, inherited keys, null-proto.', () => {
  const run = createDiffRunner();

  describe('Symbol Keys', () => {
    const scenarios: Array<
      TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
    > = [
      {
        id: 'Symbol-Only Keys',
        description: 'Symbol-only differences are ignored by Object.keys.',
        input: () => {
          const s = Symbol('s');
          return {
            previous: createSymbolOnlyObject(s, 1),
            current: createSymbolOnlyObject(s, 2)
          };
        },
        expected: []
      }
    ];

    test.for(scenarios)('[$id] $description', ({ input, expected }) => {
      expect(run(resolveScenarioInput(input))).toStrictEqual(expected);
    });
  });

  describe('Non-Enumerable Keys', () => {
    const scenarios: Array<
      TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
    > = [
      {
        id: 'Non-Enumerable Change',
        description: 'Non-enumerable changes are ignored by Object.keys.',
        input: () => {
          const previous = createNonEnumerable('hidden', 1);
          const current = createNonEnumerable('hidden', 2);
          return { previous, current };
        },
        expected: []
      }
    ];

    test.for(scenarios)('[$id] $description', ({ input, expected }) => {
      expect(run(resolveScenarioInput(input))).toStrictEqual(expected);
    });
  });

  describe('Prototype Chain', () => {
    const scenarios: Array<
      TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
    > = [
      {
        id: 'Inherited Key Present',
        description:
          'Inherited current property is treated as present via `in`.',
        input: () => {
          const proto: Record<string, unknown> = { a: 1 };
          const current: Record<string, unknown> = Object.create(proto);
          const previous: Record<string, unknown> = { a: 2 };

          return { previous, current };
        },
        expected: [
          {
            type: 'CHANGE',
            path: ['a'],
            value: 1,
            oldValue: 2
          }
        ]
      }
    ];

    test.for(scenarios)('[$id] $description', ({ input, expected }) => {
      expect(run(resolveScenarioInput(input))).toStrictEqual(expected);
    });
  });

  describe('Null-Prototype Objects', () => {
    const scenarios: Array<
      TestScenario<DiffInput<unknown>, DiffResult<unknown>[]>
    > = [
      {
        id: 'Null-Proto, Equal',
        description: 'Null-prototype objects compare by their enumerable keys.',
        input: () => {
          const previous = createNullProtoRecord();
          const current = createNullProtoRecord();
          previous.a = 1;
          current.a = 1;
          return { previous, current };
        },
        expected: []
      },
      {
        id: 'Null-Proto, Change',
        description: 'Null-prototype keys still produce diffs.',
        input: () => {
          const previous = createNullProtoRecord();
          const current = createNullProtoRecord();
          previous.a = 1;
          current.a = 2;
          return { previous, current };
        },
        expected: [
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
      expect(run(resolveScenarioInput(input))).toStrictEqual(expected);
    });
  });
});
