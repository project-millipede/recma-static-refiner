import type { StandardSchemaV1 } from '@standard-schema/spec';

/**
 * The foundational structural constraint for component props.
 *
 * Role: Input Constraint.
 * Aliased to `object` to serve as the generic lower bound, ensuring strict
 * compatibility with both TypeScript Interfaces and Type Aliases across
 * the plugin architecture.
 */
export type BaseProps = object;

/**
 * The validation strategy definition for a component rule.
 *
 * Role: Behavioral Driver.
 * Defines the allowed validation sources. This type acts as the control flow
 * switch in inference utilities (e.g., `InferOutput`):
 * - `StandardSchemaV1`: Triggers strict validation and output coercion.
 * - `undefined`: Triggers "Passthrough Mode" (raw partial props).
 */
export type ComponentSchema = StandardSchemaV1 | undefined;
