/**
 * Internal DX Helper:
 * Flattens the type output to improve tooltips in editors.
 *
 * This forces TypeScript to resolve intersections (A & B) into a single flat
 * object structure, making hover-previews for complex types readable.
 *
 * @see https://github.com/sindresorhus/type-fest/blob/main/source/simplify.d.ts
 *
 * @example
 * ```ts
 * type A = { x: 1 };
 * type B = { y: 2 };
 *
 * // Without Simplify: Shows "A & B" on hover.
 * type Complex = A & B;
 *
 * // With Simplify: Shows "{ x: 1; y: 2 }" on hover.
 * type Flat = Simplify<A & B>;
 * ```
 */
export type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {};

/**
 * Helper 1: The Anchor
 * Extracts a specific key `K` from type `T` and enforces it as strictly required.
 *
 * @example
 * ```ts
 * type T = { a?: string; b?: number };
 *
 * // Result: { a: string }
 * type Anchor = OneRequired<T, 'a'>;
 * ```
 */
type OneRequired<T, K extends keyof T> = Required<Pick<T, K>>;

/**
 * Helper 2: The Remainder
 * Constructs a type containing all properties of `T` *except* the anchor key `K`,
 * ensuring they are all marked as optional.
 *
 * @example
 * ```ts
 * type T = { a: string; b: number };
 *
 * // Result: { b?: number }
 * type Remainder = OthersOptional<T, 'a'>;
 * ```
 */
type OthersOptional<T, K extends keyof T> = Partial<Omit<T, K>>;

/**
 * Helper 3: The Variant Builder
 * Composes a specific variant of the original type where the anchor key `K`
 * is required and all other keys are optional.
 *
 * Utilizes {@link Simplify} to ensure the resulting type is displayed as a
 * clean object literal rather than an intersection of helpers.
 *
 * @example
 * ```ts
 * type T = { a: string; b: string };
 *
 * // Result: { a: string; b?: string }
 * type Variant = VariantWith<T, 'a'>;
 * ```
 */
type VariantWith<T, K extends keyof T> = Simplify<
  OneRequired<T, K> & OthersOptional<T, K>
>;

/**
 * Constructs a union type where at least one of the keys from the original
 * type `T` is required to exist.
 *
 * Logic:
 * Iterates over every key `K` in `T` and generates a corresponding {@link VariantWith}
 * where `K` acts as the required anchor. The result is a union of all possible variants.
 *
 * @example
 * ```ts
 * type T = { schema?: S; derive?: D };
 *
 * type Result = RequireAtLeastOne<T>;
 * // Resulting Union:
 * // | { schema: S; derive?: D }  (Variant A)
 * // | { derive: D; schema?: S }  (Variant B)
 * ```
 */
export type RequireAtLeastOne<T> = {
  [K in keyof T]: VariantWith<T, K>;
}[keyof T];

/**
 * Generic Logic Helper: Strict Conditional Check
 *
 * Branches types based on whether `Type` strictly extends `Constraint`,
 * disabling the default distributive behavior of conditional types.
 *
 * Mechanism:
 * 1. **Tuple Wrapping:** The syntax `[Type]` and `[Constraint]` wraps inputs
 *    into tuples.
 * 2. **Blocking Distribution:** TypeScript distributes conditional types over
 *    unions (e.g., checking `A` and `B` separately in `A | B`). Tuples cannot
 *    be distributed, forcing the compiler to treat `Type` as a single,
 *    indivisible unit.
 * 3. **Strict Comparison:** The check succeeds only if the entire `Type`
 *    (including all union members or `undefined`) fits within `Constraint`.
 *
 * @example
 * ```ts
 * // Scenario: Checking if a Union extends a single type.
 * type Input = string | number;
 *
 * // 1. Standard (Distributive) Behavior:
 * //   (string extends string) | (number extends string)
 * //   => 'Yes' | 'No'
 * type Standard = Input extends string ? 'Yes' : 'No';
 *
 * // 2. Strict (Non-Distributive) Behavior via helper:
 * //   [string | number] extends [string]
 * //   => 'No' (The complete union does not extend string)
 * type Result = IfStrictExtends<Input, string, 'Yes', 'No'>;
 * ```
 *
 * @template Type       The candidate type to check.
 * @template Constraint The target type to check against.
 * @template True       Result if the check passes.
 * @template False      Result if the check fails.
 */
export type IfStrictExtends<Type, Constraint, True, False> = [Type] extends [
  Constraint
]
  ? True
  : False;
