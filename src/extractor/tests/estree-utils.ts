import { is, types } from 'estree-toolkit';
import { parse } from 'meriyah';
import { isArray, isRecord } from '../../guards';

/**
 * Checks whether a runtime value is “node-like” enough to be treated as an ESTree node
 * for the purpose of `estree-toolkit` type guards.
 *
 * This is a shallow bridge guard:
 * - ensures the value is an object (not null)
 * - excludes arrays
 * - ensures a string `type` discriminator exists
 *
 * @param value
 *   Runtime value to validate.
 * @returns
 *   `true` if `value` has the minimal shape of an ESTree node; otherwise `false`.
 *   When `true`, TypeScript narrows `value` to `types.Node`.
 */
function isNodeLike(value: unknown): value is types.Node {
  return isRecord(value) && !isArray(value) && typeof value.type === 'string';
}

/**
 * Parses source text as a single expression and returns the inner ESTree expression node.
 *
 * Implementation detail:
 * - wraps the input in parentheses so object literals parse as expressions
 * - validates the returned AST shape:
 *   Program -> first statement is ExpressionStatement -> returns its `expression`
 *
 * @param code
 *   Source text intended to represent a single expression.
 * @returns
 *   The parsed ESTree expression node.
 * @throws
 *   If parsing does not produce the expected Program / ExpressionStatement structure.
 */
export function getExpressionNode(code: string): types.Expression {
  const ast = parse(`(${code})`) as unknown;

  if (!isNodeLike(ast) || !is.program(ast)) {
    throw new Error('Expected parser output to be an ESTree Program node.');
  }

  const first = ast.body.at(0);
  if (!first || !is.expressionStatement(first)) {
    throw new Error('Expected wrapped code to produce an ExpressionStatement.');
  }

  return first.expression;
}
