import type { tryResolveStaticValue } from './extractor/static-resolver';

/**
 * ARCHITECTURE INDEX (GROUPED)
 *
 * RATIONALE
 * 1. Dynamic Analysis Limitations & Passive Preservation
 * 2. Motivation for Preservation (The "Code vs. Data" Problem)
 *
 * DEFINITION
 * 3. Static Data Patterns
 * 4. Runtime Expressions (Non-static Forms)
 * 5. ExpressionRef Placeholder (The Sentinel)
 *
 * POLICY
 * 6. Preserved Props (Transport)
 * 7. Zero-Tolerance Patch Policy
 *
 * LIFECYCLE
 * 8. Preserved Subtree Lifecycle (ExpressionRef Round-Trip)
 *
 * CONCEPT
 * 9. AST Topology Mismatch
 *
 * STRATEGY
 * 10. Leaf-Only Patching
 *
 * Recommended reading flow:
 * RATIONALE -> DEFINITION -> POLICY -> LIFECYCLE -> CONCEPT -> STRATEGY -> POLICY (enforcement)
 */

/**
 * HEADER TAXONOMY
 *
 * - POLICY:
 *   Non-negotiable rule (`must` / `must not`) and enforcement semantics.
 *
 * - STRATEGY:
 *   Chosen implementation approach used to satisfy policies.
 *
 * - DEFINITION:
 *   Formal meaning and scope of a term or boundary.
 *
 * - RATIONALE:
 *   Why a policy or strategy exists.
 *
 * - CONCEPT:
 *   Mental model framing the problem space.
 *
 * - LIFECYCLE:
 *   Step-by-step process flow across phases.
 */

/**
 * ARCHITECTURAL RATIONALE (1)
 * Dynamic Analysis Limitations & Passive Preservation
 *
 * ---
 *
 * This plugin runs at **build time** on an ESTree AST. It does not execute code.
 * Therefore, many runtime expressions cannot be resolved to concrete values.
 *
 * Because dynamic/unsupported expressions cannot be represented as plain data
 * at build time, extraction must treat some subtrees as passthrough (see
 * {@link StaticDataPatterns} for the definition of static data).
 *
 * Terminology
 * -----------
 * - **Extracted data**: the plain JS object produced by `extractStaticValueFromExpression`.
 *   This is what schemas validate and what patch planning diffs against.
 * - **Passthrough code**: AST subtrees that remain in the compiled output unchanged
 *   because they cannot be represented as plain data.
 *
 * Why dynamic values cannot be extracted
 * -------------------------------------
 * 1. The "empty identifier" constraint
 *    At a callsite, references are represented as identifiers:
 *
 *      <Comp id={myId} />
 *      // AST: { type: "Identifier", name: "myId" }
 *
 *    The AST node contains only the identifier name, not its runtime value.
 *    Resolving that value would require scope analysis + evaluation (and potentially
 *    cross-module resolution), which is out of scope for this plugin.
 *
 * 2. Non-evaluability at build time
 *    Expressions like `Date.now()`, `new Map()`, function calls, conditionals,
 *    member expressions, template literals, etc. depend on runtime state or
 *    execution. The plugin cannot (and should not) evaluate them during build.
 *
 * 3. Spread ambiguity and shadowing
 *    Object/JSX spreads can override earlier props at runtime:
 *
 *      <Comp status="active" {...incomingProps} />
 *
 *    Even if `status="active"` is statically visible, the runtime value may be
 *    overwritten by `incomingProps.status` depending on spread ordering.
 *
 * Practical effect
 * ----------------
 * - Dynamic values become invisible to schema validation and patch planning.
 * - Some statically extracted values may still be shadowed at runtime when spreads
 *   are present (see {@link StaticDataPatterns} regarding spread exclusion).
 * - The original AST subtree is left untouched and flows to the final output
 *   ("Passive Preservation").
 *
 * Preserved keys vs passthrough dynamics
 * --------------------------------------
 * - **Preserved keys** (e.g. `children`) are *explicitly* captured as ExpressionRef
 *   placeholders so they can round-trip through validation/patching when nested
 *   inside replaced parent structures.
 *
 * - **Passthrough dynamics** are *implicitly* preserved by omission:
 *   they are not represented in extracted data at all, and therefore will never
 *   be patched. The AST remains unchanged for those values.
 *
 * Implications for validation and transforms
 * ------------------------------------------
 * - Schemas MUST NOT assume dynamic props are present in `inputProps`, because
 *   they may have been omitted by extraction.
 * - `derive` runs on the validated/extracted superset view; it cannot compute
 *   patches from passthrough-only values.
 * - Build-time coercion applies only to statically extractable leaves that are
 *   also patchable under the leaf-only AST strategy.
 *
 * See {@link StaticDataPatterns} for the normative definitions of static data.
 */
type DynamicAnalysisLimitations = never;

/**
 * ARCHITECTURAL RATIONALE (2)
 * Motivation for Preservation (The "Code vs. Data" Problem)
 *
 * ---
 *
 * This section defines the architectural challenge that necessitates the
 * "ExpressionRef Round-Trip" mechanism.
 *
 * 1. The Conflict
 * ---------------
 * **Static Analysis** requires resolving values to **Plain Data**
 * (deterministic strings, numbers, objects) at build time.
 * However, React and MDX components often receive properties that contain
 * **Executable Code** or **Runtime Objects**.
 *
 * 2. Common Runtime Patterns
 * --------------------------
 * Unlike configuration props (`id="123"`), content props often use:
 *
 * - JSX Content: `<Card><Strong>Hello</Strong></Card>`
 *   Nature: A function call (`_jsx(...)`) returning a runtime object.
 *
 * - Render Props: `<List>{item => <Item val={item} />}</List>`
 *   Nature: An executable function definition.
 *
 * - Fragments/Arrays: `<>{[...]}</>`
 *   Nature: Complex structural types often containing mixed content.
 *
 * - References: `<Comp>{content}</Comp>`
 *   Nature: A variable identifier referencing unknown runtime data.
 *
 * 3. The Resolution
 * -----------------
 * Attempting to convert these patterns into static data causes data loss or
 * build failures. Therefore, the system must distinguish between:
 * - **Data Props:** Extracted and validated strictly as static values.
 * - **Preserved Props:** Treated as opaque subtrees and transported verbatim.
 */
type PreservationMotivation = never;

/**
 * ARCHITECTURAL DEFINITION (3)
 * Static Data Patterns
 *
 * ---
 *
 * "Static data" is the subset of ESTree expressions that the extractor can
 * convert into deterministic plain JS data without executing code.
 *
 * The classification is structural: it describes which AST shapes qualify as static and
 * which constraints must hold for nested content.
 *
 * Supported patterns
 * ------------------
 *
 * 1. Directly-resolvable expressions
 *    An expression is considered static if it is resolved by {@link tryResolveStaticValue}.
 *    This includes supported atomic constants and other expression forms that
 *    can be determined without recursion.
 *
 * 2. Containers (recursive)
 *
 *    - ArrayExpression
 *      - Each element must itself match these static data patterns.
 *      - Elisions (holes) are permitted as sparse slots.
 *      - Spread elements (`...x`) are not statically extractable.
 *
 *    - ObjectExpression
 *      - Keys must be statically extractable (see {@link extractPropertyKey}).
 *      - Values must themselves match these static data patterns.
 *      - Spread properties (`...x`) and computed keys are not statically extractable.
 */
export type StaticDataPatterns = never;

/**
 * ARCHITECTURAL DEFINITION (4)
 * Runtime Expressions (Non-static Forms)
 *
 * ---
 *
 * "Runtime Expressions" are AST nodes whose value depends on runtime state or
 * execution, and therefore cannot be converted into deterministic plain data at
 * build time under this extractor’s rules.
 *
 * Resolution exceptions (explicitly supported cases)
 * --------------------------------------------------
 * Some syntax classes below may be handled in narrow, explicitly defined cases:
 *
 * - Constant-like identifiers and fully-static template literals may resolve via
 *   {@link tryResolveStaticValue}.
 *
 * - Runtime subtrees under preserved keys are transported (not evaluated) via
 *   ExpressionRef placeholders (see {@link PreservedPropStrategy}).
 *
 * - Certain structural dynamics are handled by container policy (see
 *   {@link StaticDataPatterns}), e.g. skipping an object spread while still
 *   extracting other static properties.
 *
 * Outside these explicit exceptions, the forms below are treated as non-static.
 *
 * Common patterns
 * ---------------
 *
 * 1. Identifiers
 *    Variables (`props`, `myVar`) and other references whose value is not known
 *    without evaluation or scope resolution.
 *
 * 2. Execution / Construction
 *    Function calls (`getValue()`), instantiation (`new Date()`), and other
 *    executable forms.
 *
 * 3. Logic
 *    Conditionals (`a ? b : c`), logical operators (`a && b`, `a ?? b`), and
 *    similar control-flow constructs.
 *
 * 4. Access
 *    Member expressions (`obj.value`, `arr[0]`) and other lookup operations that
 *    depend on runtime values.
 *
 * 5. Complex strings
 *    Template literals (`` `id-${i}` ``) and other composite string forms unless
 *    every interpolation can be resolved statically.
 *
 * 6. Functions
 *    Function expressions and arrow functions (`() => {}`).
 *
 * 7. JSX
 *    Elements (`<div />`) and fragments (`<>...</>`), which compile to runtime
 *    factory calls.
 *
 * 8. Structural dynamics
 *    Spreads (`...props`) and computed keys (`[key]: val`) that introduce or
 *    conceal structure in ways that are not statically enumerable.
 */
type RuntimeExpressionPatterns = never;

/**
 * ARCHITECTURAL DEFINITION (5)
 * ExpressionRef Placeholder (The Sentinel)
 *
 * ---
 *
 * An "ExpressionRef" is a JSON-serializable sentinel object used to represent
 * an opaque AST node during the data extraction phase.
 *
 * **Purpose:**
 * To allow "Opaque Transport" of runtime code through a pipeline that expects
 * plain data. It acts as a proxy for an AST node that cannot be serialized.
 *
 * **Structure Definition:**
 *
 * 1. **Brand (`__kind`):**
 *    - *Value:* `'recma.expression_ref'`
 *    - *Purpose:* A unique tagged discriminant. It ensures the object is not
 *      mistaken for user data (e.g., a user prop named `__kind`).
 *    - *Usage:* Enables the `isExpressionRef` type guard.
 *
 * 2. **Pointer (`path`):**
 *    - *Value:* `(string | number)[]`
 *    - *Purpose:* A logical pointer to the location of the preserved value
 *      within the extracted props structure.
 *    - *Examples:*
 *      - `["children"]` (Root prop)
 *      - `["items", 0, "content"]` (Nested inside array/object)
 *
 * **Role in Pipeline:**
 * - **Extraction:** Replaces the dynamic AST node with this placeholder.
 * - **Validation:** Passes through as a standard object (schema must allow it).
 * - **Patching:** Detected by the re-builder and swapped back for the real node.
 */
export type ExpressionRefPlaceholder = never;

/**
 * ARCHITECTURAL POLICY (6)
 * Preserved Props (Transport)
 *
 * ---
 *
 * **Context:** Props configured in `preservedKeys` (default: `['children']`).
 *
 * **Policy:** **PASSTHROUGH ALLOWED (Values Only)**
 *
 * 1. **The Rule:**
 *    The Extractor accepts all **Value Expressions** (Patterns 1-7 in
 *    {@link RuntimeExpressionPatterns}).
 *
 *    Note:
 *    Pattern 8 (Structural Dynamics like Spreads) is excluded because
 *    preservation requires a specific, static key to match against
 *    configuration.
 *
 * 2. **Primary Use Case (JSX):**
 *    JSX is treated as **Executable Logic**, not **Static Data**.
 *    Within the AST, it behaves as a runtime expression in either form:
 *    - Explicit `JSXElement` syntax.
 *    - Compiled `_jsx` factory calls.
 *
 *    Because these are **Runtime Expressions**, they are rejected by the main
 *    extraction engine. This strategy serves as the **exclusive** mechanism
 *    for supporting them.
 *
 * **Constraint: Static Key Requirement**
 * Preservation is determined by looking up the property name in the configuration.
 * Therefore, the property MUST have a static key (Identifier or Literal).
 *
 * **Supported Patterns:**
 * Any valid JavaScript expression in the value position is captured verbatim
 * and moved to the output.
 *
 * See {@link RuntimeExpressionPatterns} for the detailed definitions of
 * Identifiers, Execution, Logic, JSX, etc.
 *
 * **Illustrative Examples:**
 *
 * - **Identifiers:** `customProp={myVar}`
 * - **Execution:**   `customProp={createValue()}`
 * - **JSX:**         `children={<Spinner />}`
 *
 * **Rejected Patterns (No Static Key):**
 * Structural Dynamics trigger a bailout because the plugin cannot determine if
 * the property matches a preserved key without a static identifier.
 *
 * **Structural Dynamics (Pattern 8):**
 * - **Spread:**   `{...props}`          (Key is hidden/merged)
 * - **Computed:** `{[getKey()]: value}` (Key is unknown at build time)
 *
 * **Mechanism:**
 * 1. **Match:** Extractor identifies a property with a static key matching `preservedKeys`.
 * 2. **Capture:** The AST node (value) is saved out-of-band.
 * 3. **Placeholder:** `ExpressionRef` is inserted into the extracted data.
 * 4. **Restore:** Patcher writes the original AST node back into the file.
 */
export type PreservedPropStrategy = never;

/**
 * ARCHITECTURAL POLICY (7)
 * Zero-Tolerance Patch Policy
 *
 * ---
 *
 * This policy governs the behavior when a planned patch remains unapplied after
 * the patching phase.
 *
 * The Policy: STRICT (Always Throw)
 * ---------------------------------
 * Any unapplied patch triggers a fatal build error.
 *
 * 1. Rationale
 *    The system operates on **Deterministic Intent**. If the Planner generates a
 *    patch, it indicates that the configuration (Schema, Derived Logic, or Pruning)
 *    explicitly demanded a change.
 *
 *    Failure to apply that change results in a critical discrepancy between the
 *    **Configured Intent** (the expected data shape) and the **Output Code**
 *    (the runtime behavior). To prevent shipping code that violates the
 *    configuration, the build process must abort.
 *
 * 2. Common Failure Triggers
 *    Patches fail when the source code structure prevents safe editing under the
 *    {@link LeafOnlyPatchingConstraint}.
 *
 *    - Missing Slots (Structural Requirements):
 *      Operations require a distinct, statically addressable `Property` node in
 *      the source AST.
 *      - Derive / Validation:
 *        To inject a computed value (Derive) or write back a transformed value
 *        (Validation), a distinct slot (e.g. `initialState={null}`) must
 *        already exist to be overwritten.
 *      - Prune:
 *        To remove a property, the key must exist explicitly as a `Property` node.
 *
 *    - Non-Literal Roots (Dynamic Expressions):
 *      Attempting to patch a props argument defined via dynamic expressions
 *      (e.g. conditionals `cond ? a : b` or variables) rather than a static
 *      Object Literal.
 *      Because the keys are not statically resolvable (see {@link DynamicAnalysisLimitations}),
 *      the structure lacks the static topology required for safe modification.
 *
 * 3. Outcome
 *    - Behavior: A fatal exception is thrown immediately.
 *    - Result: The build process aborts.
 *    - Remediation:
 *      The developer must manually adjust the source code to satisfy the
 *      structural requirements.
 *      For example, explicitly defining a placeholder property
 *      (`initialState={null}`) creates the static `Property` node required for
 *      a Derived Patch to perform an overwrite.
 */
export type ZeroTolerancePatchPolicy = never;

/**
 * ARCHITECTURAL LIFECYCLE (8)
 * Preserved Subtree Lifecycle (ExpressionRef Round-Trip)
 *
 * ---
 *
 * This describes the mechanism used to transport runtime code through the static
 * validation pipeline without executing it.
 *
 * For the motivation regarding dynamic runtime props, see {@link PreservationMotivation}.
 *
 * 1. Mechanism: ExpressionRef Placeholders
 * ----------------------------------------
 * To support runtime props, specific keys (configured via `preservedKeys`) are
 * intercepted during extraction. Instead of resolving the value, the system
 * creates an {@link ExpressionRefPlaceholder} sentinel.
 *
 * The original ESTree AST node is simultaneously captured in a "Side Channel"
 * map, keyed by its logical path.
 *
 * 2. Lifecycle Sequence
 * ---------------------
 *
 * (A) Source AST (before this plugin applies any patches)
 *     _jsx(Component, propsExpr)
 *
 *     propsExpr: ObjectExpression
 *       ├─ age: Literal("20")
 *       ├─ className: Literal("p-4")
 *       └─ children: JSXElement(<Strong>Hello</Strong>)
 *                 │
 *                 │  (extractor sees `children` is a preserved key)
 *                 ▼
 *
 * (B) Extraction output (plain JS "extractedProps")
 *     extractedProps = {
 *       age: "20",
 *       className: "p-4",
 *
 *       // preserved key => NOT decoded as data
 *       children: <ExpressionRefPlaceholder>
 *     }
 *
 *     Side-channel capture (keyed by canonical path key):
 *     preservedExpressionsByPath['["children"]'] = JSXElement(<Strong>Hello</Strong>)
 *                 │
 *                 │  (schema validation + patch planning operate on extracted JS data)
 *                 ▼
 *
 * (C) Planned patches (logical paths)
 *     Example (only touching age):
 *       set ["age"] = 20
 *
 *     Important:
 *     - Patches must not target preserved paths (e.g. ["children"] or descendants).
 *     - Patch *values* may still contain ExpressionRefs when a larger object/array
 *       is replaced using data that still contains preserved placeholders
 *       (e.g. a set patch for ["posts", 0] that includes posts[0].children = ExpressionRef).
 *                 │
 *                 │  (patcher traverses the compiled ESTree AST and applies patches)
 *                 ▼
 *
 * (D) Patch application (encode + inline during rebuild)
 *     - Traversal:
 *       When a Property key is preserved, traversal calls `skipChildren()` so no
 *       patches are applied inside that runtime-expression subtree.
 *
 *     - Rebuild:
 *       When applying a `set` patch, `buildEstreeValue(...)` encodes the JS patch
 *       value into an ESTree Expression:
 *         - primitives -> Literal(...)
 *         - objects    -> ObjectExpression(...)
 *         - arrays     -> ArrayExpression(...)
 *
 *       Inline step (key feature):
 *       If (and only if) the patch value contains ExpressionRef placeholders,
 *       `buildEstreeValue` resolves them via `expressionRefResolver`:
 *
 *         ExpressionRef(path=["children"])
 *           -> expressionRefResolver(ref)
 *           -> preservedExpressionsByPath['["children"]']
 *           -> JSXElement(<Strong>Hello</Strong>)
 *
 *       This guarantees preserved runtime expressions are inlined into any
 *       replaced parent structure instead of emitting the placeholder object.
 *                 │
 *                 ▼
 *
 * (E) Output AST (same AST instance, after mutation)
 *     propsExpr: ObjectExpression
 *       ├─ age: Literal(20)                      // changed
 *       ├─ className: Literal("p-4")             // unchanged
 *       └─ children: JSXElement(<Strong>Hello</Strong>)  // preserved (skipped or re-inlined)
 */
export type PreservedSubtreeLifecycle = never;

/**
 * ARCHITECTURAL CONCEPT (9)
 * AST Topology Mismatch
 *
 * ---
 *
 * This concept defines the structural divergence between the **Plain JavaScript
 * Data Structure** (used by the Extractor/Planner) and the **Physical AST
 * Representation** (manipulated by the Patcher).
 *
 * 1. The Context
 * --------------
 * - **Standard Semantics (Planner):** Sees data as standard JavaScript Objects
 *   (Dictionaries) or Arrays (Lists). It assumes standard access patterns
 *   where order in objects doesn't matter and arrays are dense lists of values.
 * - **Syntax Tree Mechanics (Patcher):** Sees the ESTree nodes. It must manage
 *   interleaved `SpreadElements`, sparse `null` holes, and strict ordering.
 *
 * 2. The Object Topology (The Dictionary-List Mismatch)
 * -----------------------------------------------------
 * (A) Standard JS View: A **Dictionary** (Unordered Key-Value Pairs).
 *     `{ id: "101", role: "admin" }`
 *
 * (B) Physical AST View: A **List** of Properties and Spreads.
 *     ```js
 *     // AST for: <Comp id="101" {...defaults} role="admin" />
 *     properties: [
 *       { type: "Property", key: "id", ... },       // Index 0
 *       { type: "SpreadElement", arg: "defaults" }, // Index 1 (Hidden)
 *       { type: "Property", key: "role", ... }      // Index 2
 *     ]
 *     ```
 * (C) The Conflict: Invisible Spreads (Index 1) make it impossible to determine
 *     correct insertion indices for new properties based solely on plain data.
 *
 * 3. The Array Topology (The Tuple-List Mismatch)
 * -----------------------------------------------
 * (A) Standard JS View: A **List** of Values.
 *     `["A", "B"]`
 *
 * (B) Physical AST View: A **List** of Expressions, Spreads, and Holes.
 *     ```js
 *     // AST for: ["A", ...more, , "B"]
 *     elements: [
 *       { type: "Literal", value: "A" },          // Index 0
 *       { type: "SpreadElement", arg: "more" },   // Index 1 (Hidden/Dynamic)
 *       null,                                     // Index 2 (Hole/Sparse)
 *       { type: "Literal", value: "B" }           // Index 3
 *     ]
 *     ```
 * (C) The Conflict: The Planner sees indices `0` and `1` (logically "A", "B").
 *     The Patcher sees "A" at `0` and "B" at `3`. Without awareness of the
 *     Spread and Hole, the Planner cannot target indices safely.
 */
export type AstTopologyMismatch = never;

/**
 * ARCHITECTURAL STRATEGY (10)
 * Leaf-Only Patching
 *
 * ---
 *
 * This strategy defines the physical limits of AST modification allowed by the
 * plugin. It serves as the enforcement mechanism for the Patch Planning Protocol.
 *
 * Core Philosophy
 * ---------------
 * The AST structure (keys, indices, and their order) is treated as **Read-Only
 * Topology**. Permission is granted only to write to the **Value Slots** of
 * existing nodes.
 *
 * This guarantees that:
 * 1. **Unknown Props/Items** are preserved (since the list length remains).
 * 2. **Runtime Logic (Spreads)** is preserved (since the order remains).
 * 3. **Comments & Formatting** are preserved (since the parent node stays).
 *
 * 1. Motivation
 * -------------
 * This strategy is a direct response to the {@link AstTopologyMismatch}.
 * Because the Planner operates on plain data that omits spreads and holes,
 * it lacks the topological awareness required to safely perform structural
 * mutations (Insertions/Deletions) on the Physical AST.
 *
 * 2. The Invariant (Topology Rule)
 * --------------------------------
 * The Patcher regards the internal structure of containers (`ObjectExpression` properties,
 * `ArrayExpression` elements) as **Fixed Topology**.
 *
 * - **Permitted:** Mutating the `value` of an existing `Property` node at a known index.
 * - **Prohibited:** Mutating the containers themselves (push/splice/shift).
 *
 * 3. Operational Constraints
 * --------------------------
 *
 * (A) COERCION (Value Replacement)
 *     - Context:   Protocol Op `CHANGE`.
 *     - Mechanism:
 *       - Objects: Overwrite `Property.value`.
 *       - Arrays:  Atomic replacement (overwrite the entire `ArrayExpression`).
 *     - Rationale: Topology Invariant.
 *                  The operation is surgically limited to leaf nodes.
 *                  The structural footprint (ordering, comments, spreads) remains identical.
 *     - Policy:    ✅ PERMITTED.
 *
 * (B) INJECTION (Structural Insertion)
 *     - Context:   Protocol Op `CREATE`.
 *     - Mechanism: Inserting new nodes into the container array.
 *     - Rationale: Precedence Ambiguity.
 *                  The Planner cannot determine if the new item should precede or succeed
 *                  invisible `SpreadElement` nodes, risking runtime logic breakage.
 *     - Policy:    ❌ PROHIBITED.
 *
 * (C) STRIPPING (Structural Deletion)
 *     - Context:   Protocol Op `REMOVE`.
 *     - Mechanism: Splicing nodes out of the container array.
 *     - Rationale: Indiscriminate Data Loss.
 *                  1. Physical:
 *                     Destroys runtime logic (spreads) that exist in the AST
 *                     but not in the extracted data.
 *                  2. Logical:
 *                     Validators (e.g. Zod) often strip unknown keys.
 *                     Removing these would destroy valid "Passthrough Props"
 *                     (className, aria-*) that must survive compilation.
 *     - Policy:    ❌ PROHIBITED.
 *
 * 4. Serialization Policy (Rich Data Support)
 * -------------------------------------------
 * The boundary between the **Planner** (Logical) and the **Patcher** (Physical)
 * regarding data types:
 *
 * - Planner Responsibility (Permissive):
 *   The Planner outputs pure JavaScript values (including rich types like
 *   `Date`, `RegExp`, `Set`). It implies that if a value exists in the
 *   Validated Props, it is intended to be written to the AST.
 *
 * - Patcher Responsibility (Deferred Validation):
 *   The Patcher is responsible for converting JS values into AST nodes.
 *   It uses strategies (like `estree-util-value-to-estree`) to construct:
 *   - Primitives: `Literal`
 *   - Arrays/Objects: `ArrayExpression`, `ObjectExpression`
 *   - Rich Types: `NewExpression` (e.g., `new Date(...)`)
 *
 *   Failure Condition:
 *   If the Patcher encounters a truly unserializable type (e.g., `Function`,
 *   `Symbol`, `Promise`), it must throw a build error.
 */
export type LeafOnlyPatchingConstraint = never;
