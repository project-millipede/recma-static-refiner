import type { RequireAtLeastOne } from './types-helper';
import type { BaseProps, ComponentSchema } from './primitives';
import type { InferOutput } from './inference';

/**
 * Function signature for the `derive` pipeline phase.
 *
 * Computes derived prop values based on the upstream input (either validated
 * data or raw props) and emits them via the provided `set` callback.
 *
 * @template Props - Component props interface constraining what can be set.
 * @template S - Schema type providing the input inference strategy.
 *
 * @param derivationInput - The input data for the derivation logic.
 *                          - If `S` is a Schema: Coerced/Validated output.
 *                          - If `S` is undefined: Raw `Partial<Props>`.
 * @param set - Callback to emit derived key/value pairs. TypeScript enforces
 *              that only keys from `Props` can be passed (excess property check).
 *
 * @example
 * ```ts
 * derive: (input, set) => {
 *   set({
 *     initialState: buildInitialState(input),
 *     invalidProp: 'value' // Type Error: does not exist in type 'Partial<Props>'
 *   });
 * }
 * ```
 */
export type DeriveFunction<
  Props extends BaseProps,
  S extends ComponentSchema = undefined
> = (
  derivationInput: InferOutput<S, Props>,
  set: (values: Partial<Props>) => void
) => void;

/**
 * Base Configuration Shape: The available properties for a component rule.
 *
 * This type defines the raw structure (schema, derive, pruneKeys) where all
 * fields are optional. It serves as the intermediate building block for the
 * strict {@link ComponentRule} type, which enforces that at least one feature
 * must be active.
 */
export type ComponentRuleFeatures<
  Props extends BaseProps = BaseProps,
  S extends ComponentSchema = undefined
> = {
  /**
   * The validation schema for this component.
   *
   * The generic parameter `S` captures the *specific* schema type provided
   * (e.g. a specific Zod or Valibot instance), preserving exact output types
   * downstream instead of widening them to the generic `StandardSchemaV1`.
   *
   * Type Behavior:
   * - Constraint: `S` must satisfy the Standard Schema V1 interface.
   * - Default: Defaults to `undefined`. If no schema is provided/inferred,
   *   the rule operates in "Passthrough Mode" (derivation receives raw props).
   *
   * @example
   *   `defineRule( { schema: MyZodSchema } )` → `S` is `MyZodSchema`
   */
  schema?: S;

  /**
   * Hook to compute new values based on the upstream input.
   *
   * This corresponds to the **`derive`** pipeline phase.
   *
   * Logic:
   * Receives the input data (either schema-validated output or raw props) and
   * a `set` callback to emit new prop values into the AST.
   *
   * @see {@link DeriveFunction} for the strict signature and usage examples.
   */
  derive?: DeriveFunction<Props, S>;

  /**
   * Explicitly removes specific root-level keys from the compiled output.
   *
   * Use this to strip "Source-Only" props—data that acts as an input for the
   * build pipeline (e.g. used by `derive` to calculate other values) but
   * is unnecessary in the final runtime execution.
   *
   * @example ['sourceData', 'legacyId']
   */
  pruneKeys?: readonly string[];
};

/**
 * Public Definition: The strict contract for a component rule.
 *
 * Defines the configuration for validation (`schema`), data transformation
 * (`derive`), and output cleanup (`pruneKeys`).
 *
 * Type Mechanics:
 * 1. Enforcement:
 *    Uses {@link RequireAtLeastOne} to ensure the rule is not empty
 *    (it must define at least one active feature).
 * 2. Safety:
 *    Uses `NonNullable` to explicitly strip the `undefined` type that results
 *    from mapping over entirely optional keys.
 *    This guarantees that a `ComponentRule` is always a concrete object,
 *    preventing "possibly undefined" errors in downstream processing.
 */
export type ComponentRule<
  Props extends BaseProps = BaseProps,
  S extends ComponentSchema = undefined
> = NonNullable<RequireAtLeastOne<ComponentRuleFeatures<Props, S>>>;

/**
 * A type-erased handle for a specific component rule.
 *
 * Purpose:
 * Serves as the universal value type for storage. By abstracting specific `Props`
 * into `BaseProps` (object), it allows heterogeneous rules (rules with different
 * prop interfaces) to coexist within the same registry record.
 *
 * Guarantees:
 * - Is a strict object (not undefined/null).
 * - Has at least one active feature (schema, derive, or pruneKeys).
 */
export type ComponentRuleBase = ComponentRule<BaseProps, ComponentSchema>;
