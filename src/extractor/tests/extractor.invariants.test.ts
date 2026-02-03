import { describe, expect, test } from 'vitest';
import { SKIP_VALUE } from '../constants';
import { ExtractOptions, extractStaticValueFromExpression } from '..';
import { getExpressionNode } from './estree-utils';
import { ExtractionResult, TestScenario } from './types';

/**
 * Test suite: policy invariant proofs for static extraction.
 *
 * Scope:
 * - Array strictness.
 * - Object partiality.
 * - Containment (object absorbs child failure).
 * - Propagation (array bubbles child failure).
 *
 * Related coverage:
 * - Dynamic collapse cases live in extractor.dynamic.test.ts.
 * - Static-only cases live in extractor.static.test.ts.
 */
describe('Static Extraction Strategy (Policy Proofs)', () => {
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
   * Invariant proofs that define how dynamic values affect containers.
   */
  describe('Policy Invariants', () => {
    const scenarios: TestScenario<ExtractionResult>[] = [
      {
        id: 'Array Strictness',
        description:
          'Dynamic element collapses array to SKIP_VALUE.',
        code: '[someVar]',
        expected: SKIP_VALUE
      },
      {
        id: 'Object Partiality',
        description:
          'Dynamic values omitted; static entries preserved.',
        code: '{ a: someVar, b: 1 }',
        expected: { b: 1 }
      },
      {
        id: 'Containment',
        description:
          'Object omits property when child collapses.',
        code: '{ a: [someVar] }',
        expected: {}
      },
      {
        id: 'Propagation',
        description:
          'Array returns SKIP_VALUE when child collapses.',
        code: '[[someVar]]',
        expected: SKIP_VALUE
      }
    ];

    test.for(scenarios)(
      '[$id] $description',
      ({ code, expected }) => {
        expect(extractValue(code)).toEqual(expected);
      }
    );
  });
});
