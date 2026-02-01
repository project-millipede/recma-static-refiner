import { is, types } from 'estree-toolkit';
import { tryResolveStaticValue } from './static-resolver';

/**
 * Extracts the static name from a property key when it is defined as a
 * non-computed Identifier.
 *
 * ---
 *
 * 1. Concept: Labels vs. References
 *    In JavaScript objects, an Identifier in the key position acts as a
 *    Static Label (string), not a Variable Reference.
 *
 * 2. Scenarios
 *
 *    Scenario A: Static Label (Handled)
 *    - Code:   `{ myVar: 1 }`
 *    - AST:
 *      ```json
 *      {
 *        "type": "Property",
 *        "computed": false,                  // <--- Switch: Label Mode
 *        "key": {
 *          "type": "Identifier",
 *          "name": "myVar"                   // <--- Extracted Name
 *        }
 *      }
 *      ```
 *    - Logic:  Since `computed` is false, the identifier represents the literal
 *              string "myVar", independent of any variable scope.
 *    - Result: Returns "myVar".
 *
 *    Scenario B: Variable Reference (Rejected)
 *    - Code:   `{ [myVar]: 1 }`
 *    - AST:
 *      ```json
 *      {
 *        "type": "Property",
 *        "computed": true,                   // <--- Switch: Expression Mode
 *        "key": {
 *          "type": "Identifier",
 *          "name": "myVar"
 *        }
 *      }
 *      ```
 *    - Logic:   Since `computed` is true, this is a variable lookup.
 *               This function steps aside to allow the Static Resolver to
 *               evaluate it.
 *    - Result:  Returns null.
 *    - Outcome: The node falls through to the Static Resolver, which attempts
 *               to resolve `myVar`.
 *               It fails (because `myVar` is dynamic), and the property is
 *               correctly skipped.
 *
 * 3. Architectural Necessity (The Syntax Filter)
 *    This function acts as a filter to prevent the Static Resolver from incorrectly
 *    evaluating labels as variables.
 *
 *    - Context:
 *      The Static Resolver (`tryResolveStaticValue`) determines what a node
 *      *evaluates to* (simulating runtime behavior).
 *      It treats every Identifier as a Variable Reference to be looked up.
 *
 *    - The Conflict:
 *      If the key from `{ myVar: 1 }` is passed to the resolver:
 *      1. The resolver interprets `myVar` as a Variable Reference.
 *      2. It attempts to look up the value (checking global constants).
 *      3. It fails (since `myVar` is not a constant) and rejects the valid static key.
 *
 *    - The Solution:
 *      By filtering for `computed: false`, this helper captures Static Labels
 *      immediately based on syntax.
 *      -> This bypasses the expression evaluation logic entirely for static named keys.
 *
 * 4. Filtering Logic & Distinction
 *    This function enforces strict syntactic rules to isolate Labels (Syntax)
 *    from Values (Data).
 *
 *    - Filter 1: `!computed`
 *      Rejects variable references (e.g., `{ [key]: ... }`). These belong to the
 *      Data Path (`tryResolveStaticValue`) for resolution.
 *
 *    - Filter 2: `is.identifier`
 *      - Accepts: Identifiers (e.g., `{ key: ... }`).
 *      - Rejects: Literals (e.g., `{ "key": ... }`).
 *
 *      Distinction:
 *      - An Identifier (`key`) is a Name (Syntax). It belongs here.
 *      - A Literal (`"key"`) is a Value (Data).
 *        -> All Values must be handled by the Static Resolver.
 *
 * @param property
 *   The property node to inspect.
 * @returns
 *   The identifier name string if the key acts as a static label; otherwise null.
 */
function tryExtractNamedKey(property: types.Property): string | null {
  if (!property.computed && is.identifier(property.key)) {
    return property.key.name;
  }
  return null;
}

/**
 * Extracts the key name from an Object Property.
 *
 * ---
 *
 * 1. Objective: Static Key Determination
 *    The primary goal is to determine the key (property name) of an object
 *    property so it can be uniquely addressed within the extracted data model.
 *
 *    - Role: Determines the **Key Node**'s static address (`string` or `number`).
 *            This address is required to construct the property path *before* the
 *            main recursive engine descends into the **Value Node**.
 *    - Output: Returns a valid path segment if the key is static and addressable.
 *              Returns `null` if the key is dynamic or not addressable.
 *
 * 2. Architectural Pathways: Syntax vs. Data
 *    The extraction logic chooses a strategy based on whether the key acts as a
 *    syntactic label (unique to keys) or as an expression (shared with values).
 *
 *    [A] Pathway: Syntax (Key-Specific Labels)
 *        Handled by `tryExtractNamedKey`.
 *        - Logic: This strategy is **unique to the Key position**.
 *        - Rule:  It respects the grammar rule where a non-computed Identifier
 *                 acts as a string label (e.g., `{ a: 1 }` -> "a").
 *        - Context Constraint:
 *          This logic must never be applied to a Value node. For example, in
 *          `{ p: a }`, applying this logic would incorrectly treat the variable
 *          `a` as the string literal "a".
 *
 *    [B] Pathway: Data (Universal Resolution)
 *        Handled by `tryResolveStaticValue`.
 *        - Logic: This strategy is **universal (shared with Values)**.
 *        - Rule:  It applies when the key is Computed or a Literal (e.g., `{ [NaN]: 1 }`).
 *                 The node is treated exactly like a Value expression.
 *        - Consistency Guarantee:
 *          By using the shared resolver, the system ensures that static constants
 *          (like `NaN` or template strings) resolve identically regardless of
 *          whether they appear on the left (Key) or right (Value) side of the colon.
 *
 * 3. Context: The Extraction Lifecycle
 *    This function represents Step A of the property processing cycle.
 *    The Main Loop decomposes properties into two distinct operations.
 *
 *    3.1 Syntax Path (Static Labels)
 *
 *    Trace 1: Standard Property `{ a: "b" }`
 *
 *    [Level 1] Property Context
 *    - Step A (Key - Syntax Path): `extractPropertyKey` calls `tryExtractNamedKey`.
 *                                  -> Extracts name `"a"` from Identifier.
 *    < RETURN: "a" (Control returns to Main Loop)
 *
 *    - Step B (Value - Caller): Value is Literal `"b"`. Must Recurse.
 *    > ENTER Level 2: `extractStaticValueFromExpression("b")`
 *
 *        [Level 2] Atomic Value Resolution
 *        - Logic: Node is a leaf (Atomic). Recursion stops.
 *        - Action: Calls `tryResolveStaticValue`.
 *                  -> Resolves Literal `"b"` -> `"b"`.
 *        < EXIT Level 2: Returns `"b"`.
 *
 *    - Resume Level 1: Capture return value `"b"`.
 *    - Step C (Assign - Caller): `result["a"] = "b"`.
 *    < EXIT Level 1: Loop Continues / Returns Result.
 *
 *    3.2 Data Path (Resolved Keys)
 *
 *    Trace 2: Flat Object `{ [NaN]: "b" }`
 *
 *    [Level 1] Property Context
 *    - Step A (Key - Data Path): `extractPropertyKey` calls `tryResolveStaticValue`.
 *                                -> Resolves Key Node `[NaN]` -> Number `NaN`.
 *    < RETURN: NaN (Control returns to Main Loop)
 *
 *    - Step B (Value - Caller): Value is Literal `"b"`. Must Recurse.
 *    > ENTER Level 2: `extractStaticValueFromExpression("b")`
 *
 *        [Level 2] Atomic Value Resolution
 *        - Logic: Node is a leaf (Atomic). Recursion stops.
 *        - Action: Calls `tryResolveStaticValue`.
 *                  -> Resolves Literal `"b"` -> `"b"`.
 *        < EXIT Level 2: Returns `"b"`.
 *
 *    - Resume Level 1: Capture return value `"b"`.
 *    - Step C (Assign - Caller): `result[NaN] = "b"`.
 *    < EXIT Level 1: Loop Continues / Returns Result.
 *
 *    ---
 *
 *    Trace 3: Nested Object `{ [NaN]: { b: 4 } }`
 *
 *    [Level 1] Outer Property Context
 *    - Step A (Key - Data Path): `extractPropertyKey` calls `tryResolveStaticValue`.
 *                                -> Resolves Key Node `[NaN]` -> Number `NaN`.
 *    < RETURN: NaN (Control returns to Main Loop)
 *
 *    - Step B (Value - Caller): Value is Object `{ b: 4 }`. Must Recurse.
 *    > ENTER Level 2: `extractStaticValueFromExpression({ b: 4 })`
 *
 *        [Level 2] Inner Property Context
 *        - Step A (Key - Syntax Path): `extractPropertyKey` calls `tryExtractNamedKey`.
 *                                      -> Extracts name `"b"` from Identifier.
 *        < RETURN: "b" (Control returns to Main Loop)
 *
 *        - Step B (Value - Caller): Value is Literal `4`. Must Recurse.
 *        > ENTER Level 3: `extractStaticValueFromExpression(4)`
 *
 *            [Level 3] Atomic Value Resolution
 *            - Logic: Node is a leaf (Atomic). Recursion stops.
 *            - Action: Calls `tryResolveStaticValue`.
 *                      -> Resolves Literal `4` -> `4`.
 *            < EXIT Level 3: Returns `4`.
 *
 *        - Resume Level 2: Capture return value `4`.
 *        - Step C (Inner Assign - Caller): `innerResult["b"] = 4`.
 *        < EXIT Level 2: Returns `{ b: 4 }`.
 *
 *    - Resume Level 1: Capture return value `{ b: 4 }`.
 *    - Step C (Outer Assign - Caller): `result[NaN] = { b: 4 }`.
 *    < EXIT Level 1: Loop Continues / Returns Result.
 *
 * 4. Implementation Details
 *    [A] Static Named Keys (Syntax)
 *        If non-computed Identifier, extracts name directly.
 *        Example: `{ a: ... }` -> Key is "a".
 *
 *    [B] Data Resolution
 *        If the key is a Literal or a Computed Expression, it represents data.
 *        The logic delegates to the Static Resolver (`tryResolveStaticValue`) to
 *        resolve the static value of the key node.
 *        Examples:
 *        - Literal:  { "a": ... }     -> Key is "a".
 *        - Computed: { ["a"]: ... }   -> Key is "a".
 *        - Computed: { [1]: ... }     -> Key is 1.
 *        - Computed: { [NaN]: ... }   -> Key is NaN.
 *        - Computed (Template): { [`id-${1}`]: ... } -> Key is "id-1".
 *
 *    [C] Key Type Constraints (Strict Validation)
 *        The resolved value is strictly validated against an allowlist of types.
 * 
 *        1. `string`
 *           - Example: `"title"`, `"data-id"`
 *           - Action:  Accepted.
 *           - Result:  Used for standard Dot Notation paths (e.g., `props.title`).

 *        2. `number`
 *           - Example: `0`, `1`, `NaN`
 *           - Action:  Accepted (Preserved as numeric primitive).
 *           - Result:  Used for Bracket Notation paths (e.g., `props[0]`, `props[NaN]`).
 *                      Note: Brackets are mandatory for integers (`props.0` is invalid),
 *                      so this formatting is enforced for all numeric types for consistency.
 *
 *        3. `symbol`
 *           - Example: `Symbol('id')`
 *           - Action:  Rejected (Returns `null`).
 *           - Reason:  Structural Limitation. Symbols cannot be serialized to JSON
 *                      nor uniquely addressed in a static diagnostic string.
 *
 *        4. `null`, `undefined`, `boolean`, `bigint`
 *           - Example: `null`, `true`, `1n`
 *           - Action:  Rejected (Returns `null`).
 *           - Reason:  Policy Rejection. Unlike the JS runtime (which coerces these
 *                      to strings), these types are treated as logic errors to
 *                      prevent polluting the output with unintended keys.
 * 
 *    [D] Policy Divergence (The Rationale for [C])
 *        The constraints in [C] deliberately diverge from the JS Runtime to
 *        ensure Data Safety.
 *
 *        - Runtime Behavior: Implicit Coercion
 *          JS automatically coerces non-string primitives used as computed keys.
 *          e.g., `{ [null]: 1 }` -> `{ "null": 1 }`
 *
 *        - Extractor Behavior: Strict Rejection
 *          This extractor explicitly rejects these types (returning `null`).
 *          Rationale: In static analysis, a key resolving to `null` or `undefined`
 *          usually indicates a logic error or unresolved variable. Omission is
 *          safer than polluting the output model with garbage keys.
 *
 * @param property
 *   The property node to inspect.
 * @returns
 *   A valid path segment (`string` or `number`) if the key is statically
 *   addressable; otherwise `null`.
 */
export function extractPropertyKey(
  property: types.Property
): string | number | null {
  // [A] Static Named Keys (Syntax)
  const namedKey = tryExtractNamedKey(property);
  if (namedKey !== null) {
    return namedKey;
  }

  // [B] Data Resolution
  const resolution = tryResolveStaticValue(property.key);

  if (resolution.success) {
    const resolvedValue = resolution.value;

    // [C] Key Type Constraints
    // See Section [D] "Policy Divergence" in JSDoc for rationale.
    if (
      typeof resolvedValue === 'string' ||
      typeof resolvedValue === 'number'
    ) {
      return resolvedValue;
    }
  }

  // Dynamic Key, Symbol, or Unsupported
  return null;
}
