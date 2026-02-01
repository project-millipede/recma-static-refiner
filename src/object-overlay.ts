import { isPlainObject } from './guards';
import { isKeyPreserved } from './utils/path-utils';

/**
 * A plain object record restricted to string keys.
 *
 * This type definition intentionally excludes `symbol` keys to align with the
 * runtime behavior of `Object.keys()`, which is used for iteration in the
 * overlay logic.
 *
 * - Strings & Numbers: Supported
 *   Numeric keys are implicitly converted to strings by the JavaScript runtime.
 * - Symbols: Excluded.
 *   This utility is designed for standard data structures and does not support
 *   the structural merging of Symbol-keyed properties.
 */
export type PlainObjectRecord = Record<string, unknown>;

/**
 * Core implementation of the object overlay logic.
 *
 * The execution flow follows a **Filter → Traverse → Commit** pipeline:
 *
 * 1. Filter Phase (Exclusion Rules):
 *
 * 1.1 Preservation Rule (Value Integrity):
 *     Keys listed in `preservedKeys` (e.g., `children`) are skipped entirely.
 *     This ensures that specialized runtime constructs in `base` are
 *     protected from being overwritten by overlay results.
 *
 * 1.2 Injection Rule (Structural Stability):
 *     Keys present in `overlay` but missing from `base` are skipped.
 *     This prevents structural expansion, ensuring that the merge operation
 *     strictly adheres to the fixed topology of the base object.
 *
 * 2. Traverse Phase (Recursion):
 *
 *    For keys passing the exclusion rules, the function delegates to the
 *    internal value dispatcher (`overlayValue`) to handle type-specific
 *    overlay logic.
 *
 * 3. Commit Phase (Update & Optimization):
 *
 * 3.1 Change Detection (Commit Guard):
 *     Updates are skipped if the merged value is equivalent to the existing
 *     value. Equality checks adhere to the Comparison Policy defined above.
 *
 * 3.2 Lazy Allocation (Reference Preservation):
 *     A new object container is allocated only when a property value diverges
 *     from the base source. If all values match, the original object is
 *     returned to preserve referential equality.
 *
 * @param base The source object (structural foundation).
 * @param overlay The object containing new values to apply.
 * @param preservedKeys Set of keys to exclude from the overlay process.
 * @returns A new object with overlay values applied, or the original base if no changes occurred.
 */
function overlayObject(
  base: PlainObjectRecord,
  overlay: PlainObjectRecord,
  preservedKeys: ReadonlySet<string>
): PlainObjectRecord {
  let resultObject: PlainObjectRecord | undefined;

  for (const candidateKey of Object.keys(overlay)) {
    // 1.1 Filter Phase (Preservation Rule)
    if (isKeyPreserved(candidateKey, preservedKeys)) continue;

    // 1.2 Filter Phase (Injection Rule)
    if (!Object.hasOwn(base, candidateKey)) continue;

    const basePropValue = base[candidateKey];
    const overlayPropValue = overlay[candidateKey];

    // 2. Traverse Phase (Recursion)
    const mergedValue = overlayValue(
      basePropValue,
      overlayPropValue,
      preservedKeys
    );

    // 3.1 Commit Phase (Change Detection)
    if (Object.is(mergedValue, basePropValue)) continue;

    // 3.2 Commit Phase (Lazy Allocation)
    //     Allocate a new object container only upon the first confirmed
    //     divergence.
    if (!resultObject) resultObject = { ...base };
    resultObject[candidateKey] = mergedValue;
  }

  return resultObject ?? base;
}

/**
 * Internal dispatcher for arbitrary values.
 *
 * Implements the **Mutual Recursion** pattern to decouple:
 *
 * - Iteration Logic (`overlayObject`):
 *   Key traversal, exclusion filtering, and write optimization.
 * - Structural Resolution (`overlayValue`):
 *   Identifies the data topology to apply the matching overlay strategy.
 *
 * This separation keeps the update loop in `overlayObject` clean and focused on
 * the "Filter → Traverse → Commit" pipeline without cluttering it with type
 * checks.
 *
 * ---
 *
 * Applies specific structural strategies based on the value type, mapping to
 * the high-level strategies defined in `overlayObject`:
 *
 * 1. Subtree Pruning:
 *    Checks for identity before inspecting types.
 *    If the values are equivalent according to the global Comparison Policy,
 *    the original base reference is returned.
 *    -> This halts recursion for unchanged subtrees.
 *
 * 2. Array Strategy (Atomic Replacement):
 *    Arrays are treated as atomic units.
 *    -> The overlay array strictly replaces the base array.
 *       (Index-by-index merging is prohibited to prevent data corruption.)
 *
 * 3. Object Strategy (Recursive Merge):
 *    Objects are treated as open sets.
 *    -> Execution delegates to `overlayObject` to apply the Left Join logic,
 *       preserving keys that exist in the base object but are missing from the overlay.
 *
 * 4. Primitive Strategy (Value Replacement):
 *    Primitives are treated as terminal values.
 *    -> The overlay value overwrites the base value.
 *
 * @param basePropValue The value derived from the base object property.
 * @param overlayPropValue The value derived from the overlay object property.
 * @param preservedKeys Set of keys to exclude during recursive object merges.
 * @returns The resolved value based on the specific overlay strategy.
 */
function overlayValue(
  basePropValue: unknown,
  overlayPropValue: unknown,
  preservedKeys: ReadonlySet<string>
): unknown {
  // 1. Subtree Pruning
  if (Object.is(basePropValue, overlayPropValue)) return basePropValue;

  // 2. Array Strategy (Atomic Replacement)
  if (Array.isArray(basePropValue) && Array.isArray(overlayPropValue)) {
    return overlayPropValue;
  }

  // 3. Object Strategy (Recursive Merge)
  if (isPlainObject(basePropValue) && isPlainObject(overlayPropValue)) {
    return overlayObject(basePropValue, overlayPropValue, preservedKeys);
  }

  // 4. Primitive Strategy (Value Replacement)
  return overlayPropValue;
}

/**
 * Overlays overlay object properties onto a base object.
 *
 * Acts as the public entry point for the object overlay strategy.
 *
 * This function orchestrates the overlay process using distinct strategies:
 *
 * 1. Merge Strategy (Left Join):
 *    Merges overlay values into the base object, establishing the base as the
 *    definitive structural template.
 *    This strategy merges data while strictly respecting the topology of the
 *    base object.
 *
 * 1.1 Structural Definition:
 *     The `base` serves as the structural base, defining which keys exist in
 *     the base object.
 *
 * 1.2 Passthrough Preservation:
 *     Keys present in the base but missing from the overlay are explicitly
 *     retained (never deleted), ensuring that "Passthrough Props" survive
 *     validation.
 *
 * 1.3 Value Replacement:
 *     For keys present in both, the value from `overlay` overwrites the
 *     base value. This enables safe type conversion (e.g., `'1'` → `1`)
 *     without modifying the key structure.
 *
 * 2. Traversal Strategy:
 *    The logic relies on recursive depth-first traversal.
 *    For every key passing the exclusion rules, the function delegates to the
 *    internal `overlayValue` dispatcher. This ensures that:
 *    - Nested objects are merged recursively (applying the Left Join deep).
 *    - Arrays and Primitives are handled as **direct replacements** (stopping recursion).
 *
 * 3. Comparison Policy:
 *    All equality checks throughout the pipeline use `Object.is`.
 *    This ensures:
 *    - Referential Equality: For objects and arrays.
 *    - Strict Equality: For standard primitives.
 *    - NaN Stability: Prevents unnecessary allocation on `NaN`
 *      (where `NaN !== NaN` would otherwise trigger a false positive).
 *
 * ---
 *
 * Examples:
 *
 * Scenario 1: Value Replacement & Passthrough
 * // Case: Validating a numeric prop while keeping a CSS class.
 * base    = { zIndex: "50", className: "sticky-header" }
 * overlay = { zIndex: 50 } // Schema converts string to number
 * result  = { zIndex: 50, className: "sticky-header" }
 * // -> 'zIndex' is updated (from "50" to 50).
 * // -> 'className' is preserved (missing from overlay).
 *
 * Scenario 2: Value Integrity (Preservation Rule)
 * // Case: Validating a variant prop while 'children' contains specialized data.
 * base          = { children: <ComplexValue>, variant: "flat" }
 * overlay       = { children: "Button Text", variant: "solid" }
 * preservedKeys = new Set(["children"])
 * result        = { children: <ComplexValue>, variant: "solid" }
 * // -> 'children' is skipped entirely (Base value wins).
 * // -> 'variant' is updated normally (from "flat" to "solid").
 *
 * Scenario 3: Structural Stability (Injection Rule)
 * // Case: Schema defines a default value for a missing prop.
 * base    = { label: "Submit" }
 * overlay = { label: "Submit", disabled: false } // Schema adds default
 * result  = { label: "Submit" }
 * // -> 'disabled' is skipped. Adding it would extend the defined structure,
 * //    which is prohibited.
 *
 * @param base The source object (structural foundation).
 * @param overlay The object containing new values to apply.
 * @param preservedKeys Set of keys to exclude from the overlay process.
 * @returns The final merged object representing the updated state.
 *
 * @see overlayObject for the detailed execution pipeline
 */
export function applyOverlay(
  base: PlainObjectRecord,
  overlay: PlainObjectRecord,
  preservedKeys: ReadonlySet<string>
): PlainObjectRecord {
  // Skip the overlay operation entirely if the root inputs are already
  // identical (Comparison Policy).
  if (Object.is(base, overlay)) return base;

  // Delegate to the internal object iterator.
  return overlayObject(base, overlay, preservedKeys);
}
