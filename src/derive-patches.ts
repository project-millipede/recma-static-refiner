import type {
  BaseProps,
  ComponentSchema,
  DeriveFunction,
  InferOutput,
  SetPropertyPatch
} from './types';

/**
 * Generates `set` patches from user-defined derivation logic.
 *
 * Computed Derivation (Value Overlay)
 * -----------------------------------
 * This operation executes the `derive` hook defined in the component rule,
 * translating the user's emitted values into AST mutation instructions.
 *
 * Operational Constraints
 * -----------------------
 *
 * DERIVATION (Computed Assignment)
 *   - Context:   Manual Configuration (Component Rule).
 *   - Mechanism: Functional Callback (`deriveFn`).
 *   - Rationale: Data Synthesis.
 *                Allows the transformation of simple authoring props (e.g. `slug`)
 *                into complex runtime props (e.g. `initialState`) that would be
 *                tedious or impossible to author manually in JSX.
 *   - Policy:    ✅ PERMITTED.
 *                Authorized because it operates as a "Value Overlay". It writes
 *                strictly typed values into the AST, relying on the Patcher's
 *                safety checks to handle property insertion or overwriting.
 *
 * Execution Flow:
 * 1. Checks if a `derive` hook exists (returns empty if not).
 * 2. Invokes the hook with `derivationInput`.
 * 3. Captures emitted values via the `set` callback.
 * 4. Maps entries to `SetPropertyPatch` instructions.
 *
 * @template Props - The component's props interface.
 * @template S - The schema type used for validation (controls input inference).
 *
 * @param deriveFn - The derivation hook from the rule (optional).
 * @param derivationInput - The input data for the derivation hook.
 *                          Represents the output of the upstream validation/normalization
 *                          phase (either schema-coerced data or raw props).
 * @returns Array of patches to apply the derived values.
 */
export function collectDerivePatches<
  Props extends BaseProps,
  S extends ComponentSchema = undefined
>(
  deriveFn: DeriveFunction<Props, S> | undefined,
  derivationInput: InferOutput<S, Props>
): SetPropertyPatch[] {
  // Fallback Pattern:
  // If no derivation logic is defined, this phase is a no-op.
  if (!deriveFn) return [];

  const patches: SetPropertyPatch[] = [];

  // Execute the user-defined hook.
  // The `set` callback acts as the collector, buffering values into the patch list.
  deriveFn(derivationInput, values => {
    for (const [key, value] of Object.entries(values)) {
      patches.push({ operation: 'set', path: [key], value });
    }
  });

  return patches;
}
