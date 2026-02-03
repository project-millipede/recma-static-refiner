import { describe, it, expect, test } from 'vitest';
import {
  tryResolveIdentifier,
  tryResolveLiteral,
  tryResolveStaticValue,
  tryResolveTemplate
} from '../static-resolver';
import { getExpressionNode } from './estree-utils';

/**
 * Test suite: static resolver helpers and dispatcher.
 *
 * Coverage:
 * - Literal helper resolution (including RegExp).
 * - Identifier helper resolution (constant allowlist).
 * - Template helper resolution (static interpolation only).
 * - Dispatcher integration (tryResolveStaticValue).
 */
describe('Static Resolver', () => {
  describe('Literal Resolution', () => {
    /**
     * Helper: Parses source code and runs tryResolveLiteral.
     */
    const resolveLiteral = (code: string) =>
      tryResolveLiteral(getExpressionNode(code));
    const scenarios = [
      {
        id: 'String',
        description: 'Literal string',
        code: '"hello"',
        expected: 'hello'
      },
      {
        id: 'Number',
        description: 'Literal number',
        code: '42',
        expected: 42
      },
      {
        id: 'Boolean',
        description: 'Literal boolean',
        code: 'true',
        expected: true
      },
      {
        id: 'BigInt',
        description: 'Literal bigint',
        code: '1n',
        expected: 1n
      },
      {
        id: 'Null',
        description: 'Literal null',
        code: 'null',
        expected: null
      }
    ];

    test.for(scenarios)('[$id] $description', ({ code, expected }) => {
      // 1. Resolve the literal expression.
      const result = resolveLiteral(code);

      // 2. Assert the resolver succeeded.
      expect(result.success).toBe(true);
      if (!result.success) return;

      // 3. Assert NaN explicitly (NaN !== NaN).
      if (typeof expected === 'number' && Number.isNaN(expected)) {
        expect(result.value).toBeNaN();
        return;
      }

      // 4. Assert the resolved value matches the expectation.
      expect(result.value).toEqual(expected);
    });

    it('resolves RegExp literals', () => {
      // 1. Resolve the regex literal.
      const result = resolveLiteral('/abc/g');

      // 2. Assert the resolver succeeded.
      expect(result.success).toBe(true);
      if (!result.success) return;

      // 3. Assert the RegExp instance is preserved.
      expect(result.value).toEqual(/abc/g);
    });
  });

  describe('Identifier Resolution', () => {
    /**
     * Helper: Parses source code and runs tryResolveIdentifier.
     */
    const resolveIdentifier = (code: string) =>
      tryResolveIdentifier(getExpressionNode(code));
    const scenarios = [
      {
        id: 'Undefined',
        description: 'Identifier constant: undefined',
        code: 'undefined',
        expected: undefined
      },
      {
        id: 'NaN',
        description: 'Identifier constant: NaN',
        code: 'NaN',
        expected: NaN
      },
      {
        id: 'Infinity',
        description: 'Identifier constant: Infinity',
        code: 'Infinity',
        expected: Infinity
      }
    ];

    test.for(scenarios)('[$id] $description', ({ code, expected }) => {
      // 1. Resolve the identifier constant.
      const result = resolveIdentifier(code);

      // 2. Assert the resolver succeeded.
      expect(result.success).toBe(true);
      if (!result.success) return;

      // 3. Assert NaN explicitly (NaN !== NaN).
      if (typeof expected === 'number' && Number.isNaN(expected)) {
        expect(result.value).toBeNaN();
        return;
      }

      // 4. Assert the resolved value matches the expectation.
      expect(result.value).toEqual(expected);
    });

  });

  describe('Template Literal Resolution', () => {
    /**
     * Helper: Parses source code and runs tryResolveTemplate.
     */
    const resolveTemplate = (code: string) =>
      tryResolveTemplate(getExpressionNode(code));
    const scenarios = [
      {
        id: 'Static Template',
        description: 'Template literal with resolvable interpolation',
        code: '`id-${1}`',
        expected: 'id-1'
      },
      {
        id: 'Nested Template',
        description: 'Nested resolvable template literal',
        code: '`group-${`item-${100}`}-active`',
        expected: 'group-item-100-active'
      }
    ];

    test.for(scenarios)('[$id] $description', ({ code, expected }) => {
      // 1. Resolve the template literal.
      const result = resolveTemplate(code);

      // 2. Assert the resolver succeeded.
      expect(result.success).toBe(true);
      if (!result.success) return;

      // 3. Assert the resolved template string matches the expectation.
      expect(result.value).toEqual(expected);
    });

  });

  describe('Dispatcher Resolution', () => {
    /**
     * Helper: Parses source code and runs tryResolveStaticValue.
     */
    const resolveStatic = (code: string) =>
      tryResolveStaticValue(getExpressionNode(code));
    const scenarios = [
      {
        id: 'Literal',
        description: 'Dispatcher resolves literal values',
        code: '"hello"',
        expected: 'hello'
      },
      {
        id: 'Identifier',
        description: 'Dispatcher resolves constant identifiers',
        code: 'Infinity',
        expected: Infinity
      },
      {
        id: 'Template',
        description: 'Dispatcher resolves static template literals',
        code: '`id-${1}`',
        expected: 'id-1'
      }
    ];

    test.for(scenarios)('[$id] $description', ({ code, expected }) => {
      // 1. Resolve through the dispatcher.
      const result = resolveStatic(code);

      // 2. Assert the resolver succeeded.
      expect(result.success).toBe(true);
      if (!result.success) return;

      // 3. Assert the resolved value matches the expectation.
      expect(result.value).toEqual(expected);
    });
  });
});
