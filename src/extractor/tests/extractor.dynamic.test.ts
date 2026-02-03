import { describe, expect, test } from 'vitest';
import { SKIP_VALUE } from '../constants';
import {
  ExtractOptions,
  extractStaticProps,
  extractStaticValueFromExpression
} from '..';
import { getExpressionNode } from './estree-utils';
import { ExtractPropsResult, ExtractionResult, TestScenario } from './types';

/**
 * Test suite: dynamic-collapse behavior in the extraction engine.
 *
 * Coverage:
 * - Array collapse on dynamic element forms.
 * - Containment vs propagation in nested structures.
 * - Adapter boundary behavior for dynamic inputs.
 */
describe('Static Extraction Strategy (Dynamic Collapse)', () => {
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
   * Array collapse on dynamic element forms (identifier, member, call, spread).
   */
  describe('Array Collapse (Dynamic Detection)', () => {
    const scenarios: TestScenario<ExtractionResult>[] = [
      {
        id: 'Identifier',
        description: 'Array returns SKIP_VALUE for dynamic identifier element',
        code: '[someVar]',
        expected: SKIP_VALUE
      },
      {
        id: 'Member',
        description: 'Array returns SKIP_VALUE for member expression element',
        code: '[obj.value]',
        expected: SKIP_VALUE
      },
      {
        id: 'Call',
        description: 'Array returns SKIP_VALUE for call expression element',
        code: '[getValue()]',
        expected: SKIP_VALUE
      },
      {
        id: 'Spread',
        description: 'Array returns SKIP_VALUE for spread element',
        code: '[...spread]',
        expected: SKIP_VALUE
      }
    ];

    test.for(scenarios)('[$id] $description', ({ code, expected }) => {
      expect(extractValue(code)).toEqual(expected);
    });
  });

  /**
   * Nested behavior where dynamic children trigger containment or propagation.
   */
  describe('Containment vs Propagation', () => {
    const scenarios: TestScenario<ExtractionResult>[] = [
      {
        id: 'Containment',
        description: 'Object omits child array when it collapses',
        code: '{ a: [someVar] }',
        expected: {}
      },
      {
        id: 'Propagation',
        description: 'Array returns SKIP_VALUE when child array collapses',
        code: '[[someVar]]',
        expected: SKIP_VALUE
      },
      {
        id: 'Partial Object',
        description: 'Array retains object with omitted properties',
        code: '[{ a: someVar }]',
        expected: [{}]
      },
      {
        id: 'Shadowing',
        description:
          'Duplicate key keeps earlier static value over dynamic value',
        code: '{ width: 100, width: someVar }',
        expected: { width: 100 }
      }
    ];

    test.for(scenarios)('[$id] $description', ({ code, expected }) => {
      expect(extractValue(code)).toEqual(expected);
    });
  });

  /**
   * Adapter boundary behavior for dynamic inputs (null vs partial object).
   */
  describe('Adapter Boundaries (Dynamic)', () => {
    /**
     * Helper: Extracts props via the adapter boundary for root-only behavior.
     */
    const extractPropsAdapter = (code: string): ExtractPropsResult => {
      const node = getExpressionNode(code);
      const options: ExtractOptions = { preservedKeys: new Set() };
      return extractStaticProps(node, options, 'root');
    };

    const scenarios: TestScenario<ExtractPropsResult>[] = [
      {
        id: 'Partial Object',
        description: 'Adapter returns partial object; dynamic keys omitted',
        code: '{ a: 1, b: someVar }',
        expected: { a: 1 }
      },
      {
        id: 'Nested Bailout',
        description:
          'Adapter returns null when nested array collapse propagates',
        code: '[[...spread]]',
        expected: null
      }
    ];

    test.for(scenarios)('[$id] $description', ({ code, expected }) => {
      expect(extractPropsAdapter(code)).toEqual(expected);
    });
  });
});
