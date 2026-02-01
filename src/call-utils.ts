import type { NodePath, types } from 'estree-toolkit';
import { is } from 'estree-toolkit';

/**
 * JSX factory export names documented for the React automatic runtime.
 *
 * - Production runtime uses `jsx` and `jsxs`.
 * - Development runtime uses `jsxDEV`.
 *
 * Compilers frequently alias these imports to local identifiers (e.g. `jsx` → `_jsx`),
 * so callsites may use underscored names even though the export name is unchanged.
 */
const JSX_FACTORY_EXPORTS = new Set(['jsx', 'jsxs', 'jsxDEV']);

function normalizeJsxFactoryName(name: string): string {
  return name.startsWith('_') ? name.slice(1) : name;
}

/**
 * Returns the NodePath for the Nth argument of a CallExpression.
 *
 * @param callPath
 *   NodePath expected to reference a CallExpression.
 * @param index
 *   Zero-based argument index.
 * @returns
 *   NodePath for the argument at `index`, or `null` if the node is not a call
 *   expression or the argument does not exist.
 */
export function getCallArgumentPath(
  callPath: NodePath,
  index: number
): NodePath | null {
  const node = callPath.node;

  // Guard: only CallExpressions have an `arguments` list.
  if (!node || !is.callExpression(node)) return null;

  const argPaths = callPath.get('arguments');

  // Guard: estree-toolkit returns an array of NodePaths for `arguments`.
  if (!Array.isArray(argPaths)) return null;

  return argPaths.at(index) ?? null;
}

/**
 * Type guard for the JSX factory "props argument" path.
 *
 * This checks the *argument node kind* only:
 * - `true` when the argument exists and its node is an ESTree `Expression`.
 * - `false` when the argument is missing or is a non-expression node
 *   (e.g. a SpreadElement in `jsx(Component, ...args)`).
 *
 * Note:
 * This does not validate the contents of the expression.
 * For example, `jsx(Component, { ...props })` passes here because the argument
 * is an ObjectExpression; spreads inside object/array literals are handled
 * later by the extractor's dynamic-value policy.
 *
 * @param path
 *   Candidate NodePath for the props argument.
 * @returns
 *   `true` if the path exists and points to an Expression node.
 */
function isJsxPropsArgumentExpressionPath(
  path: NodePath | null
): path is NodePath<types.Expression> {
  return !!path?.node && is.expression(path.node);
}

/**
 * Extracts the component and props argument NodePaths from a JSX factory call.
 *
 * Supported call targets (including common local aliasing):
 * - `jsx(Component, props)` / `_jsx(Component, props)`
 * - `jsxs(Component, props)` / `_jsxs(Component, props)`
 * - `jsxDEV(Component, props, ...)` / `_jsxDEV(Component, props, ...)`
 *
 * @param callPath
 *   NodePath that may reference a JSX factory CallExpression.
 * @returns
 *   - `{ componentPath, propsPath }` when:
 *     1. the callee matches a supported JSX factory name, and
 *     2. the first argument (component) exists, and
 *     3. the second argument (props) exists and is an `Expression`.
 *   - `null` when any of the above conditions are not met (e.g. non-matching callee,
 *     missing arguments, or a non-expression props argument such as a spread argument).
 */
export function getJsxRuntimeCallArgs(
  callPath: NodePath
): { componentPath: NodePath; propsPath: NodePath<types.Expression> } | null {
  const node = callPath.node;

  // Guard: must be a call expression to have arguments + a callee.
  if (!node || !is.callExpression(node)) return null;

  // Guard: only supports identifier callees (e.g. `jsx`, `_jsx`), not `obj.jsx(...)`.
  if (!is.identifier(node.callee)) return null;

  // Normalize local alias names (e.g. `_jsx` -> `jsx`) and match official exports.
  const calleeName = normalizeJsxFactoryName(node.callee.name);
  if (!JSX_FACTORY_EXPORTS.has(calleeName)) return null;

  // JSX factory signature: (Component, props, ...)
  const componentPath = getCallArgumentPath(callPath, 0);
  const propsPath = getCallArgumentPath(callPath, 1);

  if (!componentPath) return null;
  // Guard: require the props *argument* to be an Expression node.
  if (!isJsxPropsArgumentExpressionPath(propsPath)) return null;

  return { componentPath, propsPath };
}
