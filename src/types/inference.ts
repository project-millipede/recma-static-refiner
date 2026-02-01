import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { IfStrictExtends } from './types-helper';
import type { BaseProps, ComponentSchema } from './primitives';

/**
 * Strategy A: Schema Exists
 * Extracts the validated output type (O) from a Standard Schema.
 *
 * Logic:
 * Infers the strict output type defined by the `StandardSchemaV1` interface.
 */
type SchemaValidatedProps<S> =
  S extends StandardSchemaV1<unknown, infer Output> ? Output : never;

/**
 * Strategy B: No Schema
 * Returns the raw props as optional (Passthrough).
 *
 * Rationale for Partial:
 * When no schema is provided to enforce strictness or apply default values,
 * the type assumes that authored MDX props may be incomplete subset of the
 * full interface.
 */
type PassthroughProps<P> = Partial<P>;

/**
 * Main Utility: Output Inference
 *
 * Resolves the final prop type by selecting the appropriate strategy.
 *
 * Logic:
 * Uses {@link IfStrictExtends} to determine if a valid schema is provided.
 * 1. Schema provided -> Applies {@link SchemaValidatedProps} (Strict/Coerced).
 * 2. No Schema       -> Applies {@link PassthroughProps} (Loose/Partial).
 */
export type InferOutput<
  S extends ComponentSchema,
  Props extends BaseProps
> = IfStrictExtends<
  S,
  StandardSchemaV1,
  SchemaValidatedProps<S>,
  PassthroughProps<Props>
>;
