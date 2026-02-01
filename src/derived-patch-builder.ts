import type { SetPropertyPatch } from './types';

export type DerivedPatchBuilder<Props extends Record<string, unknown>> = {
  /**
   * Enqueue root-level `"set"` patches from a props-shaped object.
   *
   * Type behavior:
   * - Keys and value types are checked against `Props`.
   *
   * Patch behavior:
   * - Emits `{ operation: "set", path: [key], value }` for each key/value pair in `values`.
   * - If called multiple times, later patches for the same key win during patch indexing.
   *
   * Implementation note:
   * Patch emission uses `Object.entries(values)`, which iterates only enumerable
   * properties defined directly on `values` (it does not walk the prototype chain).
   */
  setProps(values: Props): void;

  /**
   * Finalize and return the accumulated patches.
   *
   * Single-use:
   * - Calling `build()` more than once throws.
   * - Calling `setProps()` after `build()` throws.
   */
  build(): readonly SetPropertyPatch[];
};

/**
 * Builder used by `derive` to emit root-level "set" operations for props that
 * already exist in the MDX source (leaf-only patching).
 *
 * What it supports
 * ----------------
 * - Root-level "set" patches only: `path: [key]`
 *
 * What it does not support
 * ------------------------
 * - Deletes
 * - Deep/nested paths (no `["items", 0, "id"]`)
 * - Structural insertion (the patcher is leaf-only; missing props cannot be created)
 */
export function createDerivedPatchBuilder<
  Props extends Record<string, unknown>
>(): DerivedPatchBuilder<Props> {
  const patches: SetPropertyPatch[] = [];
  let built = false;

  function assertNotBuilt(): void {
    if (built) {
      throw new Error(
        '[recma] DerivedPatchBuilder is single-use. It has already been finalized via build().'
      );
    }
  }

  return {
    setProps(values) {
      assertNotBuilt();
      for (const [key, value] of Object.entries(values)) {
        patches.push({ operation: 'set', path: [key], value });
      }
    },

    build() {
      assertNotBuilt();
      built = true;
      return patches;
    }
  };
}
