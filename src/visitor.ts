import type { Visitors, NodePath, types } from 'estree-toolkit';
import type { PluginOptions } from './types';
import type {
  ResolveComponentMatch,
  ComponentMatch
} from './jsx-callsite-resolver';

import { validateWithSchema } from './validator';
import { calculatePatches } from './patch-planner';
import { applyPatchesToEstree } from './patcher-object';
import { consolidatePatches } from './consolidatePatches';
import { reportPatchFailure } from './report';
import { planPrunePatches } from './prune-patches';
import { extractStaticProps } from './extractor/index';
import { assertPatchesRespectPreservation } from './patch-guards';
import { stringifyPropertyPath } from './utils/property-path-key';
import { collectDerivePatches } from './derive-patches';

/**
 * Processes a single matched component callsite.
 *
 * Pipeline overview
 * -----------------
 * 1. Extract
 *    - Decode the props argument expression into a plain JS value.
 *    - Preserves configured keys (e.g. `children`) by inserting ExpressionRef placeholders
 *      and capturing the original ESTree expressions for later re-inlining.
 *
 * 2. Validate & Transform
 *    - Invokes the validation strategy defined by `rule.schema`.
 *    - Schema Mode: Validates and transforms extracted props into strict values.
 *    - Passthrough Mode: Uses raw extracted props (when schema is undefined).
 *    - Result: Canonical `derivationInput` used for diffing and derivation.
 *
 * 3. Plan Patches
 *    Conditionally collects patches from three potential sources for
 *    consolidation and guarding. All sources are optional; active only when
 *    the corresponding rule property is provided (see {@link ComponentRule}):
 *
 *    3.1 Diff patches
 *        - Transformation patches representing validation changes (extracted → derivationInput).
 *        - Emitted only when Step 2 produces values differing from extraction.
 *        - Uses superset view (overlay strategy) to avoid stripping passthrough props.
 *
 *    3.2 Derive patches
 *        - Computed assignments from user-defined derivation logic.
 *
 *    3.3 Prune patches
 *        - Explicit deletions for configured keys present in source.
 *
 *    3.4 Consolidate patches
 *        - Merge/deduplicate: later phases overwrite earlier ones.
 *        - Records originating phase per path for diagnostics.
 *
 *    3.5 Assert Preservation Constraints
 *        - Defensive assertion ensuring no patch targets preserved keys
 *          (keeps runtime subtrees untouched).
 *
 * 4. Apply
 *    - Apply consolidated patches to the props ObjectExpression in-place (leaf-only).
 *    - Returns unapplied patch keys when the AST shape is non-literal or paths are missing.
 *
 * 5. Report
 *    - If anything remains unapplied, report the first unapplied path and include a summary
 *      (counts + examples) with provenance via `getPatchPhaseByPathKey`.
 *
 * Control knobs
 * -------------
 * - `options.applyTransforms` toggles write-back (validation-only when false).
 */
function processComponent(
  match: ComponentMatch,
  options: PluginOptions,
  preservedKeys: Set<string>
) {
  const { componentName, componentRule, propsExpressionPath } = match;

  const applyTransforms = options.applyTransforms ?? true;

  const propsNode = propsExpressionPath.node;
  if (!propsNode) return;

  // Captured original ESTree expressions for preserved runtime subtrees (e.g. `children`).
  const preservedExpressionsByPath = new Map<string, types.Expression>();

  // 1. Extract
  const extractedProps = extractStaticProps(
    propsNode,
    {
      preservedKeys,
      onPreservedExpression: info => {
        preservedExpressionsByPath.set(
          stringifyPropertyPath(info.path),
          info.expression
        );
      }
    },
    `${componentName}.props`
  );

  // 2. Validate & Transform
  const derivationInput = validateWithSchema(
    componentRule.schema,
    extractedProps,
    componentName
  );

  if (!applyTransforms) return;

  // 3.1 Diff
  const diffPatches = calculatePatches(
    extractedProps,
    derivationInput,
    preservedKeys
  );

  // 3.2 Derive
  const derivedPatches = collectDerivePatches(
    componentRule.derive,
    derivationInput
  );

  // 3.3 Prune
  const prunePatches = planPrunePatches(
    extractedProps,
    componentRule.pruneKeys,
    preservedKeys
  );

  // 3.4 Consolidate
  const { patches, phaseByPathKey } = consolidatePatches([
    { phase: 'diff', patches: diffPatches },
    { phase: 'derive', patches: derivedPatches },
    { phase: 'prune', patches: prunePatches }
  ]);

  // 3.5 Validate preservation constraints
  assertPatchesRespectPreservation(patches, preservedKeys, componentName, {
    scope: 'root-only',
    keyTypeLabel: 'preserved'
  });

  if (patches.length === 0) return;

  // 4. Apply
  const applyResult = applyPatchesToEstree(
    propsExpressionPath,
    patches,
    preservedKeys,
    {
      expressionRefResolver: ref =>
        preservedExpressionsByPath.get(stringifyPropertyPath(ref.path)) ?? null
    }
  );

  // 5. Report
  if (applyResult.firstUnappliedPathKey) {
    reportPatchFailure(applyResult.firstUnappliedPathKey, {
      componentName,
      getPatchPhaseByPathKey: pathKey => phaseByPathKey.get(pathKey),
      summaryContext: {
        remainingSetPathKeys: applyResult.remainingSetPathKeys,
        remainingDeletePathKeys: applyResult.remainingDeletePathKeys
      }
    });
  }
}

/**
 * Visitor Factory
 * ----------------
 * Composes a callsite resolver and a processor.
 *
 * In this plugin, the resolver is a match-and-extract function:
 * - It checks whether a visited CallExpression is a supported JSX runtime factory call.
 * - On match, it returns a `ComponentMatch` containing the execution context:
 *   1. Identity:
 *      The resolved component name (e.g., "CustomComponent").
 *   2. Behavior:
 *      The active rule configuration (validated registry entry).
 *   3. Target:
 *      The `NodePath` pointing to the props argument expression.
 *      It serves as both the **extraction source** (reading initial values) and
 *      the **mutation target** (applying patches).
 *
 *      Example:
 *      In `_jsx(Component, { id: "1" })`, it targets the `{ id: "1" }` object.
 *
 * - On non-match, it returns `null` and the callsite is skipped.
 */
export function createScopedVisitor(
  resolveComponentMatch: ResolveComponentMatch,
  options: PluginOptions
): Visitors<unknown> {
  const preservedKeys = new Set(options.preservedKeys ?? ['children']);

  return {
    CallExpression(path: NodePath<types.CallExpression>) {
      // 1. Resolve:
      //    Does this callsite match a registered JSX runtime component?
      const match = resolveComponentMatch(path);

      // 2. Skip non-matches.
      if (!match) return;

      // 3. Process the matched callsite.
      processComponent(match, options, preservedKeys);
    }
  };
}
