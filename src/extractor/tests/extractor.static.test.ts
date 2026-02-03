import { describe, it, expect, test } from 'vitest';
import {
  ExtractOptions,
  extractStaticProps,
  extractStaticValueFromExpression
} from '..';
import { getExpressionNode } from './estree-utils';
import { ExtractPropsResult, ExtractionResult, TestScenario } from './types';
import { expectArray } from './test-utils';

/**
 * Test suite: static-only extraction behavior.
 *
 * Coverage:
 * - Static container shapes.
 * - Sparse array preservation.
 * - Adapter root-shape constraints.
 * - Smoke check for a simple object.
 */
describe('Static Extraction Strategy (Static-Only)', () => {
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
   * Static container shapes with nested arrays and objects.
   */
  describe('Static Containers', () => {
    const scenarios: TestScenario[] = [
      {
        id: 'Array of Primitives',
        description: 'Static array of primitives',
        code: '[1, "a", true]',
        expected: [1, 'a', true]
      },
      {
        id: 'Nested Arrays',
        description: 'Nested static arrays',
        code: '[[1], [2, 3]]',
        expected: [[1], [2, 3]]
      },
      {
        id: 'Nested Objects',
        description: 'Nested static objects',
        code: '{ a: { b: 2 }, c: "x" }',
        expected: { a: { b: 2 }, c: 'x' }
      },
      {
        id: 'Mixed Nesting',
        description: 'Mixed static nesting (objects and arrays)',
        code: '{ items: [1, { id: 2 }], flag: false }',
        expected: { items: [1, { id: 2 }], flag: false }
      }
    ];

    test.for(scenarios)(
      '[$id] $description',
      ({ code, expected }) => {
        expect(extractValue(code)).toEqual(expected);
      }
    );
  });

  /**
   * Sparse array preservation (holes are not coerced to undefined entries).
   */
  describe('Sparse Arrays', () => {
    it('preserves elisions as holes (index is absent, not an explicit undefined element)', () => {
      // 1. Extract a sparse array literal.
      const value = extractValue('[1, , 2]');

      // 2. Assert the result is an array.
      expectArray(value);

      // 3. Assert structural shape (three positions total).
      expect(value).toHaveLength(3);

      // 4. Assert the static elements are preserved.
      const [first, , third] = value;
      expect(first).toBe(1);
      expect(third).toBe(2);

      // 5. Assert the elision is preserved as a hole (index 1 is not an own property).
      expect(Object.hasOwn(value, 1)).toBe(false);
    });
  });

  /**
   * Adapter boundary: root must resolve to a plain object.
   */
  describe('Public Adapter (Root Object)', () => {
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
        id: 'Valid Object',
        description: 'Adapter returns object for static plain-object root',
        code: '{ a: 1 }',
        expected: { a: 1 }
      },
      {
        id: 'Invalid Root Type',
        description: 'Adapter returns null for non-object root',
        code: '[1, 2]',
        expected: null
      }
    ];

    test.for(scenarios)(
      '[$id] $description',
      ({ code, expected }) => {
        expect(extractPropsAdapter(code)).toEqual(expected);
      }
    );
  });

  /**
   * Minimal smoke check for the core extractor.
   */
  describe('Static Smoke', () => {
    it('extracts a simple static object', () => {
      expect(extractValue('{ a: 1 }')).toEqual({ a: 1 });
    });
  });
});
