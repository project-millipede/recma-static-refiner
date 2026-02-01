import type { BaseProps, ComponentSchema, InferOutput } from './types';

/**
 * Validates and transforms props using a Standard Schema V1 compliant validator.
 *
 * This function abstracts the validation logic by leveraging the `~standard`
 * property defined by the Standard Schema V1 specification.
 *
 * About `~standard`:
 * - Purpose:
 *   It acts as a universal adapter, allowing the plugin to work generically
 *   with Zod, Valibot, ArkType, and others without library-specific adapters.
 *
 * Schema Object Layout:
 * ```ts
 * const schema = {
 *   // 1. Universal Adapter (Result Pattern):
 *   //    - Returns an object ({ value } or { issues }).
 *   //    - Does NOT throw errors.
 *   //    - Ensures safe, consistent handling across libraries.
 *   "~standard": {
 *     validate: (input) => Result
 *   },
 *
 *   // 2. Library-Specific Internals (Ignored):
 *   //    - Native methods (like .parse) typically throw exceptions.
 *   //    - Ignored to maintain generic compatibility via the spec.
 *   parse,
 *   ...otherLibrarySpecificProps
 * };
 * ```
 *
 * @template S - The specific schema type extending `ComponentSchema`.
 * @template Props - The fallback props interface extending `BaseProps`.
 *
 * @param schema - The schema instance (must contain `~standard`) or undefined.
 * @param inputProps - The raw props extracted from the AST.
 * @param componentName - The name of the component (used for error reporting).
 * @returns The validated (and potentially transformed) props.
 *
 * @throws
 * - If the schema object is invalid (missing `~standard`).
 * - If the validator returns a Promise (async validation is not supported).
 * - If validation fails (issues reported by the schema).
 */

/**
 * Public Overload:
 * Establishes the strict type contract using generics.
 *
 * Implementation Note - Overloads:
 * The return type `InferOutput<S, Props>` is a conditional type.
 * TypeScript cannot automatically verify inside the function body that the
 * runtime return values (which are `unknown`) satisfy this complex condition.
 *
 * Separating the signature from the implementation avoids the need for manual
 * type assertions (`as`) on every return statement, keeping the body clean.
 */
export function validateWithSchema<
  S extends ComponentSchema,
  Props extends BaseProps = BaseProps
>(schema: S, inputProps: unknown, componentName: string): InferOutput<S, Props>;

export function validateWithSchema(
  schema: ComponentSchema,
  inputProps: unknown,
  componentName: string
) {
  if (!schema) {
    return inputProps;
  }

  // Fail-safe:
  // Verify compliance (see 'Schema Object Layout' in JSDoc).
  // Guards against plain objects or malformed configurations being treated as schemas.
  if (!('~standard' in schema)) {
    throw new Error(
      `The schema for "${componentName}" is invalid. Expected an object with the "~standard" property (e.g. Zod, Valibot), but received a plain object.`
    );
  }

  const result = schema['~standard'].validate(inputProps);

  // AST traversal is strictly synchronous.
  // Promise-returning validators cannot be awaited during the visitor cycle.
  if (result instanceof Promise) {
    throw new Error(
      `Async schema validation is not supported for "${componentName}".`
    );
  }

  // Handle 'Result Pattern' (see JSDoc).
  // Unlike native methods (e.g. parse), issues must be checked manually to halt compilation.
  const [firstIssue] = result.issues ?? [];
  if (firstIssue) {
    const issuePath = firstIssue.path?.join('.') ?? 'unknown';
    throw new Error(
      `Invalid props for "${componentName}" at "${issuePath}": ${firstIssue.message}`
    );
  }

  // Some validators only report issues and do not return a decoded `value`.
  if ('value' in result) {
    return result.value;
  }

  return inputProps;
}
