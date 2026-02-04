/**
 * Differ test coverage map.
 *
 * This file is the single source of truth for which suites cover which
 * behavioral areas. Keep entries aligned with the suite filenames and update
 * them whenever coverage scope changes.
 */
export const TEST_STRATEGY = [
  '1. Basic object operations: CREATE/CHANGE/REMOVE, leaf replacement, deterministic ordering.',
  '   Covered in diff.basic-operations.test.ts.',
  '2. Arrays: diff vs atomic vs ignore (index semantics + atomic equality).',
  '   Covered in diff.arrays.test.ts.',
  '3. Rich types and equality: Date, RegExp, boxed primitives.',
  '   Covered in diff.rich-types.test.ts.',
  '4. Leaf equality: NaN, +0/-0, BigInt primitives, functions, type switches.',
  '   Covered in diff.primitive-and-reference.test.ts.',
  '5. Enumeration/prototype behavior: symbols, non-enumerables, inherited keys, null-proto.',
  '   Covered in diff.enumeration-prototype.test.ts.',
  '6. Cycles: self-cycle, ancestor references, alias-path duplicates.',
  '   Covered in diff.cycles.test.ts.',
  '7. Options coverage: arrays policy matrix, arrayEquality, keysToSkip, trackCircularReferences.',
  '   Covered in diff.options.test.ts (keysToSkip, trackCircularReferences).',
  '   Arrays policy matrix + arrayEquality are covered in diff.arrays.test.ts.',
] as const;
