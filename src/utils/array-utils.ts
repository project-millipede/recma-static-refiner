/**
 * Ensures a sparse array preserves an elision (`,,`) at a specific slot index.
 *
 * Context
 * -------
 * ESTree encodes array elisions as `null` slots in `ArrayExpression.elements`.
 * In JavaScript, an elision is a *missing* element/property at a slot index,
 * which is observably different from an explicitly present element whose value
 * happens to be `undefined`.
 *
 * This distinction can be tested with the `in` operator:
 * - `slotIndex in array` checks whether the array has an own property for that index
 *   (i.e. whether the element exists), not what its value is.
 *
 * Example:
 *   const sparse = ['start', , 'end'];
 *   const explicitUndefined = ['start', undefined, 'end'];
 *
 *   sparse[1] === undefined;             // true
 *   explicitUndefined[1] === undefined;  // true
 *
 *   1 in sparse;              // false (slot index 1 is missing)
 *   1 in explicitUndefined;   // true  (slot index 1 is present)
 *
 * Preservation rule
 * -----------------
 * This helper increases `result.length` without assigning `result[slotIndex]`.
 * Extending `length` creates holes for any unassigned indices up to `slotIndex`,
 * keeping `slotIndex in result` false.
 *
 * @param result
 *   Output array being constructed during extraction.
 * @param slotIndex
 *   Slot index of the elision to preserve.
 */
export function preserveArrayElision(
  result: unknown[],
  slotIndex: number
): void {
  // Extend the array to include `slotIndex` without writing an element.
  // This creates/keeps a hole at `slotIndex` (and any earlier unassigned slots).
  if (result.length < slotIndex + 1) result.length = slotIndex + 1;
}

/**
 * Returns `true` when a given array slot is an elision (a real sparse slot / “hole”).
 *
 * JavaScript distinction:
 * - An elision is a *missing* element/property at a slot index.
 * - This is different from an explicitly present element whose value is `undefined`.
 *
 * Detection:
 * - `slotIndex in array` checks whether the array has an own property for that index.
 * - For elisions, `slotIndex in array` is `false`.
 *
 * @param array
 *   Array being encoded.
 * @param slotIndex
 *   Slot index to test.
 */
export function isArrayElision(
  array: ReadonlyArray<unknown>,
  slotIndex: number
): boolean {
  return !(slotIndex in array);
}
