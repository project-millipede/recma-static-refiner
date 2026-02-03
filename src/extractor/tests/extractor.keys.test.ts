import { describe, it, expect, test } from 'vitest';
import { ExtractOptions, extractStaticValueFromExpression } from '..';
import { getExpressionNode } from './estree-utils';
import { ExtractionResult, TestScenario } from './types';

/**
 * Test suite: property key resolution and integrity rules.
 *
 * Coverage:
 * - Syntax vs computed key paths.
 * - Key-type constraints.
 * - Key/value integrity gate.
 *
 * References:
 * - [A]/[B]/[C] in src/extractor/key-extractor.ts
 * - Integrity gate in src/extractor/index.ts
 */

describe('Extractor Keys', () => {
  /**
   * Helper: Extracts a static value from a source expression.
   * Uses fresh options for each call to avoid shared state.
   */
  const extractValue = (code: string): ExtractionResult => {
    const node = getExpressionNode(code);
    const options: ExtractOptions = { preservedKeys: new Set() };
    return extractStaticValueFromExpression(node, options, 'root');
  };

  /**
   * Aspect 1: Syntax Path (Labels)
   * Logic: !computed && isIdentifier
   */
  describe('Pathway A: Syntax (Labels)', () => {
    const scenarios: TestScenario[] = [
      {
        id: 'Identifier Label',
        description: 'Identifier label resolves to string key',
        code: '{ key: 1 }',
        expected: { key: 1 }
      },
      {
        id: 'Keyword Label',
        description: 'Reserved-word label resolves to string key',
        code: '{ class: 1 }',
        expected: { class: 1 }
      },
      {
        id: 'Global Identifier Label',
        description:
          'Label identifiers resolve to string keys (e.g., undefined)',
        code: '{ undefined: 1 }',
        expected: { undefined: 1 }
      }
    ];
    test.for(scenarios)('[$id] $description', ({ code, expected }) => {
      expect(extractValue(code)).toEqual(expected);
    });
  });

  /**
   * Aspect 2: Data Path (Resolution)
   * Logic: computed || isLiteral
   */
  describe('Pathway B: Data (Resolution)', () => {
    const scenarios: TestScenario[] = [
      {
        id: 'String Key',
        description: 'Computed string key resolves',
        code: '{ "a": 1 }',
        expected: { a: 1 }
      },
      {
        id: 'Number Key',
        description: 'Computed numeric key resolves',
        code: '{ 10: 1 }',
        expected: { 10: 1 }
      },
      {
        id: 'NaN Key',
        description: 'Computed NaN key resolves',
        code: '{ [NaN]: 1 }',
        expected: { [NaN]: 1 }
      },
      {
        id: 'Template Key',
        description: 'Computed template key resolves',
        code: '{ [`id-${1}`]: 1 }',
        expected: { 'id-1': 1 }
      }
    ];
    test.for(scenarios)('[$id] $description', ({ code, expected }) => {
      expect(extractValue(code)).toEqual(expected);
    });
  });

  /**
   * Aspect 3: Constraints (Filtering)
   * Logic: typeof resolved must be 'string' | 'number'
   */
  describe('Pathway C: Constraints', () => {
    const scenarios: TestScenario[] = [
      {
        id: 'Undefined Key',
        description: 'Computed undefined key rejected',
        code: '{ [undefined]: 1 }',
        expected: {}
      },
      {
        id: 'Null Key',
        description: 'Computed null key rejected',
        code: '{ [null]: 1 }',
        expected: {}
      },
      {
        id: 'BigInt Key',
        description: 'Computed bigint key rejected',
        code: '{ [1n]: 1 }',
        expected: {}
      },
      {
        id: 'Dynamic Key',
        description: 'Dynamic key rejected',
        code: '{ [someVar]: 1 }',
        expected: {}
      }
    ];
    test.for(scenarios)('[$id] $description', ({ code, expected }) => {
      expect(extractValue(code)).toEqual(expected);
    });
  });

  /**
   * Aspect 4: Integrity
   * Logic: Intersection of Valid Key x Valid Value
   */
  describe('Entry Integrity (Logic)', () => {
    const scenarios: TestScenario[] = [
      {
        id: 'Static Key, Static Value',
        description: 'Entry kept when key and value are static',
        code: '{ a: { nested: 1 } }',
        expected: { a: { nested: 1 } }
      },
      {
        id: 'Static Key, Dynamic Value',
        description: 'Entry dropped when value is dynamic',
        code: '{ a: someVar }',
        expected: {}
      },
      {
        id: 'Dynamic Key, Static Value',
        description: 'Entry dropped when key is dynamic',
        code: '{ [someVar]: 1 }',
        expected: {}
      },
      {
        id: 'Dynamic Key, Dynamic Value',
        description: 'Entry dropped when key and value are dynamic',
        code: '{ [someVar]: someVar }',
        expected: {}
      }
    ];
    test.for(scenarios)('[$id] $description', ({ code, expected }) => {
      expect(extractValue(code)).toEqual(expected);
    });
  });
});
