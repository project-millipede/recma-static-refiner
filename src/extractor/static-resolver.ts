import { is, types } from 'estree-toolkit';
import { type StaticResult, UNRESOLVED, resolved } from './constants';

/**
 * Resolves atomic values from ESTree `Literal` nodes.
 *
 * Supported Types:
 * - Primitives: `string`, `number`, `boolean`, `bigint`.
 * - Special Literals: `null`, `RegExp`.
 *
 * ---
 *
 * Architectural Note:
 * Why are Objects handled in a "Literal" resolver?
 *
 * Structural containers like `ObjectExpression` (`{}`) are handled via
 * recursion in the main loop. In contrast, this function handles specific
 * *atomic tokens* that present a unique combination of traits:
 * 1. They parse as `Literal` nodes (atomic leaves).
 * 2. They evaluate to `typeof === 'object'` at runtime.
 *
 * Case Breakdown:
 * A. `null` (The Null Literal)
 * - Code:   `const x = null;`
 * - AST:    `{ type: "Literal", value: null }`
 * - Reason: Syntactically atomic.
 *           1. It is a single token, not a structure.
 *           2. In JS, `typeof null === 'object'` is a known legacy quirk.
 *           3. It is a standard static primitive value.
 *
 * B. `RegExp` (The Regex Literal)
 * - Code:   `const x = /abc/g;`
 * - AST:    `{ type: "Literal", value: <RegExp Object>, regex: { pattern: "abc", flags: "g" } }`
 * - Reason: Syntactic Sugar.
 *           1. The parser sees `/.../` syntax and marks it as type `Literal`.
 *           2. The parser automatically instantiates a `RegExp` object
 *              and attaches it to `node.value`.
 *           3. Thus, `node.value` is an instance of `RegExp` despite the
 *              node not being a `NewExpression`.
 *
 * C. `Date` (Exclusion)
 * - Code:   `const x = new Date();`
 * - AST:    `{ type: "NewExpression", callee: { name: "Date" } }`
 * - Reason: No Literal Syntax.
 *           1. JavaScript has no "Date Literal" syntax.
 *           2. Dates are always created via constructors (`new ...`).
 *           3. They appear as `NewExpression` nodes, never as `Literal` nodes,
 *              so this function never encounters them.
 *
 * @param node
 *   The AST node to inspect.
 * @returns
 *   A `StaticResult`:
 *   - `success: true` when `node` is a supported `Literal` form
 *   - `success: false` otherwise
 */
function tryResolveLiteral(node: types.Node): StaticResult {
  if (is.literal(node)) {
    // Access the native JavaScript value pre-evaluated by the parser.
    // (e.g., a real BigInt, RegExp instance, or primitive).
    switch (typeof node.value) {
      case 'string':
      case 'number':
      case 'boolean':
      case 'bigint':
        return resolved(node.value);

      case 'object':
        // Case A: Null
        if (node.value === null) {
          return resolved(null);
        }
        // Case B: RegExp
        if (node.value instanceof RegExp) {
          return resolved(node.value);
        }
        break;
    }
  }
  return UNRESOLVED;
}

/**
 * Resolves values from ESTree `Identifier` nodes that represent global constants.
 *
 * Supported Values:
 * - `undefined`, `NaN`, `Infinity`.
 *
 * ---
 *
 * 1. Architectural Note: Constant Folding
 *    Although `undefined`, `NaN`, and `Infinity` are syntactically Identifiers
 *    (variable names), static analysis treats them as Constants.
 *
 *    - Syntax:
 *         `const x = undefined;` -> AST: `{ type: "Identifier", name: "undefined" }`
 *
 *    - Context:
 *         Unlike `null` (a keyword), these are technically global variables.
 *
 *    Rationale: Primitive Resolution & Syntactic Unification
 *    Mapping these identifier names to their underlying runtime values allows
 *    the system to treat different syntactic forms as equivalent.
 *
 *    Principle: Semantic Equivalence
 *    JavaScript often allows multiple syntactic forms for the same value.
 *    Resolving the runtime value rather than preserving the AST structure
 *    ensures that distinct source patterns produce identical data.
 *
 *    Example: Unifying `undefined`
 *    1. Identifier Form: `undefined` (Handled here).
 *    2. Unary Form:      `void 0`    (Requires Unary support).
 *
 *    Both forms evaluate to the primitive `undefined`.
 *    Although this function currently only handles the Identifier form, the
 *    architecture is designed to unify these into the same constant once Unary
 *    expression support is enabled in the future.
 *
 * 2. Usage Symmetry (Positional Equivalence)
 *    The principle of equivalence extends to **Syntactic Position**.
 *    This function resolves based strictly on the Node Type (`Identifier`) and
 *    ignores the grammatical context (e.g., Key vs. Value).
 *    This ensures identical output for the same constant regardless of where it
 *    appears in the structure.
 *
 *    Scenario A: As a Value
 *    - Code:   `{ offset: NaN }`
 *    - AST:
 *      ```json
 *      {
 *        "type": "Property",
 *        "value": {                         // <--- Position: Value
 *          "type": "Identifier",            // <--- Input Node (Passed to function)
 *          "name": "NaN"                    // <--- Checked Name
 *        }
 *      }
 *      ```
 *    - Result: Returns the number `NaN`.
 *
 *    Scenario B: As a Key (Computed Property)
 *    - Code:   `{ [NaN]: "data" }`
 *    - AST:
 *      ```json
 *      {
 *        "type": "Property",
 *        "key": {                           // <--- Position: Key
 *          "type": "Identifier",            // <--- Input Node (Passed to function)
 *          "name": "NaN"                    // <--- Checked Name
 *        },
 *        "value": { "value": "data" }
 *      }
 *      ```
 *    - Result: Returns the number `NaN`.
 *
 * @param node
 *   The AST node to inspect.
 * @returns
 *   A `StaticResult`:
 *   - `success: true` when `node` is a supported global-constant identifier
 *   - `success: false` otherwise
 */
function tryResolveIdentifier(node: types.Node): StaticResult {
  if (is.identifier(node)) {
    // Switch on `node.name` (the variable name).
    // Unlike Literals (which store data in `.value`), Identifiers store
    // the label they refer to in the `.name` property.
    switch (node.name) {
      case 'undefined':
        return resolved(undefined);
      case 'NaN':
        return resolved(NaN);
      case 'Infinity':
        return resolved(Infinity);
    }
  }
  return UNRESOLVED;
}

/**
 * Resolves static template strings by stitching together text and static
 * values.
 *
 * ---
 *
 * 1. AST Structure (The "Bookend" Rule)
 *    A Template Literal always starts and ends with a Quasi (static text).
 *    The parser enforces a strict alternating structure:
 *    [Quasi] -> [Expr] -> [Quasi].
 *
 *    If a template ends with an expression (e.g., `${x}`), the parser must
 *    insert an empty string Quasi at the end ("") to close the structure.
 *    This guarantees that Quasis.length === Expressions.length + 1.
 *
 * 2. Algorithmic Strategy (The "Zipper" Pattern)
 *    Iterating over `quasis` (instead of `expressions`) ensures the structural
 *    frame is respected. This covers every node in order, including the "Tail"
 *    (the final text part) which has no following expression.
 *
 * 3. Implementation Details
 *    [A] Safety: Invalid Escape Sequences
 *        The `cooked` property represents the interpreted string value, whereas
 *        `raw` represents the source text with escape sequences preserved.
 *        - Requirement:
 *          Resolution must use `cooked` to capture the actual runtime string.
 *          Example: `Line\nBreak`
 *          - `cooked`: "Line\nBreak" (Contains actual newline character).
 *          - `raw`:    "Line\\nBreak" (Contains literal backslash and 'n').
 *        - Safety:
 *          In ES2018+, templates can contain invalid escapes (e.g., `\u` without digits).
 *          In such cases, `cooked` is undefined. If the string cannot be interpreted,
 *          resolution is considered failed.
 *
 *    [B] Recursion & Value Resolution
 *        To handle the interpolation `${...}`, the logic delegates to the
 *        Master Dispatcher (`tryResolveStaticValue`).
 *        Important:
 *        Its specific role here is to resolve the *Expression Node* into a
 *        concrete *Static Value*. *
 *        - Recursion:
 *          This allows for nested templates (e.g., `${ `inner` }`).
 *        - Dynamics (All-or-Nothing):
 *          If a single interpolation fails resolution (e.g., runtime props,
 *          function calls, or unsupported operators like `${1+1}`), the entire
 *          template is rejected. Partial resolution is not possible.
 *
 *    [C] Spec Compliance: Stringification
 *        Explicit string conversion (via `${}`) is required before adding values to the
 *        accumulator array.
 *        - Reason: `Array.prototype.join('')` converts null/undefined to empty strings ("").
 *        - Requirement: Template literals must convert them to string representations
 *          ("null", "undefined").
 *
 * ---
 *
 * Examples
 *
 * 1. Standard Interpolation
 *    - Code:   `v${ 1 }.${ 0 }`
 *    - Quasis: [ "v",  ".",  "" ]
 *      -> The empty tail closes the template after `${0}`
 *    - Exprs:  [  1,    0       ]
 *    - Logic:  "v" + String(1) + "." + String(0) + "" -> "v1.0"
 *
 * 2. Nested Template (Recursion)
 *    - Code:   `group-${ `item-${ 100 }` }-active`
 *
 *      Outer Node:
 *      - Quasis: [ "group-", "-active" ]
 *        -> Ends with text "-active", so no empty tail needed
 *      - Exprs:  [ TemplateLiteral (Inner) ]
 *
 *      Inner Node:
 *      - Quasis: [ "item-", "" ]
 *        -> Ends with `${100}`, so empty tail required
 *      - Exprs:  [ 100 ]
 *
 *      Logic Flow:
 *      1. Outer Loop 0: Push "group-"
 *      2. Outer Expr 0: Recurse into Inner Template...
 *         a. Inner Loop 0: Push "item-"
 *         b. Inner Expr 0: Resolve 100 -> Push "100"
 *         c. Inner Loop 1: Push "" (Tail)
 *         -> Return "item-100"
 *      3. Outer Loop 1: Push "-active"
 *      -> Result: "group-item-100-active"
 *
 * @param node
 *   The AST node to inspect.
 * @returns
 *   A `StaticResult`:
 *   - `success: true` when the template and all interpolations are statically resolvable
 *   - `success: false` otherwise
 */
function tryResolveTemplate(node: types.Node): StaticResult {
  if (is.templateLiteral(node)) {
    const parts: string[] = [];

    const expressions = node.expressions;

    // Iterates over Quasis to frame the structure
    // See [2] Algorithmic Strategy
    for (const [index, quasi] of node.quasis.entries()) {
      // Step 1: Resolve Quasi (The Static Text)
      // See [A] Safety: Invalid Escape Sequences.
      const text = quasi.value.cooked;
      if (typeof text !== 'string') return UNRESOLVED;

      parts.push(text);

      // Step 2: Resolve Expression (The Interpolation `${...}`)
      // Loop runs N+1 times (Quasis); this block runs N times (Expressions).
      if (index < expressions.length) {
        const expression = expressions[index];
        if (!expression) return UNRESOLVED;

        // See [B] Recursion & Value Resolution
        const result = tryResolveStaticValue(expression);

        if (!result.success) return UNRESOLVED;

        // See [C] Spec Compliance: Stringification
        parts.push(`${result.value}`);
      }
    }

    return resolved(parts.join(''));
  }
  return UNRESOLVED;
}

/**
 * Master Dispatcher: Static Value Resolution
 *
 * Orchestrates the resolution of AST nodes into atomic static values.
 *
 * ---
 *
 * 1. Scope: Strictly Declarative Data
 *    This function resolves AST nodes that represent atomic static constants
 *    explicitly defined in the source code. It covers primitives, global
 *    constants, and deterministic string composition.
 *
 * 2. Implementation Limits (Deferred Support)
 *    While strictly static and deterministic, the following operations are
 *    currently excluded to maintain implementation simplicity.
 *    They will return UNRESOLVED until support is added:
 *
 *    - Unary Operators:      Math/Logic on scalars (e.g., `-1`, `!true`, `void 0`)
 *    - Binary Operators:     Arithmetic (e.g., `1 + 1`)
 *    - Logical Operators:    Short-circuiting (e.g., `true || "default"`, `null ?? "val"`)
 *    - Conditional Logic:    Ternary operators (e.g., `true ? "a" : "b"`)
 *    - Sequence Expressions: Comma operators (e.g., `(0, 10)`)
 *
 * @param node
 *   The AST node to inspect.
 * @returns
 *   A `StaticResult`:
 *   - `success: true` with the value the node evaluates to when a resolution strategy succeeds
 *   - `success: false` otherwise
 */
export function tryResolveStaticValue(node: types.Node): StaticResult {
  let result: StaticResult;

  // 1. Atomic Constants
  if ((result = tryResolveLiteral(node)).success) return result;
  if ((result = tryResolveIdentifier(node)).success) return result;

  // 2. String Interpolation
  if ((result = tryResolveTemplate(node)).success) return result;

  // 3. Fallback
  // The node did not qualify for any supported static strategy.
  // It is treated as dynamic (unresolvable).
  //
  // This catches:
  // - Runtime Dynamics (Variables, Function Calls, Member Access).
  // - Deferred Static Logic (see Section 2: Implementation Limits).
  return UNRESOLVED;
}
