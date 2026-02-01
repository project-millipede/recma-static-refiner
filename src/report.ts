import type { ZeroTolerancePatchPolicy } from './architecture';
import type { PatchPhase } from './types';

import { isPropertyPath } from './guards';

/**
 * Phase safety & user actionability
 * ---------------------------------
 * Not all unapplied patches indicate user-recoverable errors. While the patch
 * planning pipeline includes safeguards to prevent generating invalid patches,
 * application failure modes differ by phase.
 *
 * Planning safeguards
 * -------------------
 * These prevent bad patches from being generated in the first place,
 * satisfying the {@link LeafOnlyPatchingConstraint}:
 * - `diff` (Schema Coercion): Only produces CHANGE operations for existing paths,
 *   omitting CREATE/REMOVE.
 * - `prune` (Key Removal): Only iterates keys present in the extracted static props.
 *
 * Application failure modes
 * -------------------------
 * Despite planning safeguards, patches can fail during AST application when the
 * runtime AST structure prevents leaf-only editing:
 * - Non-literal property keys (computed/dynamic) prevent `PropertyPath` reconstruction
 * - Preserved keys block traversal into subtrees where patches were planned
 * - Non-patchable props roots (e.g. spread elements) prevent any application
 *
 * Note:
 * Even when structural constraints prevent application, the phase metadata
 * assigned during planning is preserved and reported via the canonical key
 * lookup.
 *
 * Phase-specific recovery
 * -----------------------
 *
 * - `derive`: User-defined logic may target paths missing from the AST (violating
 *   the leaf-only constraint).
 *   **User-recoverable:** Ensure placeholder props exist in MDX (e.g. `test={null}`)
 *   before derivation attempts to set `test`.
 *
 * - `diff` / `prune`: Failures indicate structural AST constraints (dynamic keys,
 *   preserved subtrees) that violate leaf-only editing.
 *   **Not user-recoverable** via MDX edits; requires component architecture changes
 *   (removing computed keys, restructuring props).
 *
 * Hint policy
 * -----------
 * Consequently, actionable hints are only provided for `derive` phase failures.
 * `diff` and `prune` failures are reported under the zero-tolerance policy but
 * offer no remediation steps—the constraint violation is architectural, not
 * configurational.
 */

export type PatchReportOptions = {
  /**
   * The display name of the component being validated (e.g. "CustomComponent").
   * Used to identify the target in the error header.
   */
  componentName: string;

  /**
   * Retrieves the pipeline phase (e.g. 'diff', 'derive') for a given path key.
   * Used to annotate the error with the origin of the failure.
   */
  getPatchPhaseByPathKey: (pathKey: string) => PatchPhase | undefined;

  /**
   * Context used to append a statistical summary to the error message.
   *
   * The error includes a footer line detailing the total count
   * of unapplied patches and a preview of specific paths.
   */
  summaryContext: PatchSummaryContext;
};

export type PatchSummaryContext = {
  /**
   * Canonical keys for all 'set' patches that failed.
   */
  remainingSetPathKeys: readonly string[];

  /**
   * Canonical keys for all 'delete' patches that failed.
   */
  remainingDeletePathKeys: readonly string[];

  /**
   * Maximum number of specific paths to list in the summary string.
   * @default 5
   */
  maxPreviewPaths?: number;
};

/**
 * Formats a canonical `pathKey` into a human-readable dotted path.
 *
 * Parses the JSON-encoded `PropertyPath` and joins with dots.
 * If parsing fails or results in an empty path, falls back to returning
 * the raw `pathKey` string for debugging purposes.
 *
 * @param pathKey - Canonical string key (e.g., `'["items",1,"id"]'`)
 * @returns Human-readable dotted path (e.g., `"items.1.id"`),
 *          or the raw `pathKey` if parsing fails
 */
function formatPathKeyForDisplay(pathKey: string): string {
  try {
    const parsed = JSON.parse(pathKey);
    if (isPropertyPath(parsed) && parsed.length > 0) {
      return parsed.join('.');
    }
  } catch {
    // Fall through to return raw pathKey
  }
  return pathKey;
}

/**
 * Formats a human-readable summary of unapplied patch operations (set/delete)
 * grouped by phase with an optional preview of affected paths.
 *
 * @param context - Context containing remaining path keys and display configuration
 * @param getPhase - Function to resolve the phase for a given path key
 * @returns Formatted summary string (e.g.
 *          `Summary: unapplied set=3 (diff=2, derive=1), delete=1 (prune=1);
 *                    preview: "props.title" (diff), … (2 more)`);
 *          undefined if no unapplied operations remain
 */
function formatPatchFailureSummary(
  context: PatchSummaryContext,
  getPhase: (pathKey: string) => PatchPhase | undefined
): string | undefined {
  const setKeys = context.remainingSetPathKeys;
  const deleteKeys = context.remainingDeletePathKeys;

  // Nothing to report
  if (setKeys.length === 0 && deleteKeys.length === 0) return undefined;

  const parts: string[] = [];
  const operationParts: string[] = [];

  if (setKeys.length > 0) {
    const setPhaseStats = formatPhaseDistribution(setKeys, getPhase);
    operationParts.push(
      `set=${setKeys.length}${setPhaseStats ? ` (${setPhaseStats})` : ''}`
    );
  }

  if (deleteKeys.length > 0) {
    const deletePhaseStats = formatPhaseDistribution(deleteKeys, getPhase);
    operationParts.push(
      `delete=${deleteKeys.length}${deletePhaseStats ? ` (${deletePhaseStats})` : ''}`
    );
  }

  parts.push(`Summary: unapplied ${operationParts.join(', ')}`);

  const allKeys = [...setKeys, ...deleteKeys];
  const previewLimit =
    context.maxPreviewPaths != null ? context.maxPreviewPaths : 5;

  // Respect disabled preview
  if (previewLimit > 0) {
    const previewStats = formatPathPreview(allKeys, previewLimit, getPhase);
    if (previewStats) {
      parts.push(previewStats);
    }
  }

  return parts.join('; ');
}

/**
 * Aggregates path keys by their resolved phase and formats as a comma-separated
 * key-value list (e.g. "phase1=3, phase2=5").
 *
 * @param pathKeys - Array of path keys to analyze
 * @param getPhase - Function to resolve the phase for each key
 * @returns Formatted distribution string; undefined if input array is empty
 */
function formatPhaseDistribution(
  pathKeys: readonly string[],
  getPhase: (key: string) => PatchPhase | undefined
): string | undefined {
  // Empty input guard
  if (pathKeys.length === 0) return undefined;

  const countByPhase = new Map<string, number>();

  for (const key of pathKeys) {
    const phase = getPhase(key) ?? 'unknown';
    const current = countByPhase.get(phase) ?? 0;
    countByPhase.set(phase, current + 1);
  }

  return Array.from(countByPhase.entries())
    .map(([phase, count]) => `${phase}=${count}`)
    .join(', ');
}

/**
 * Formats a limited preview list of path keys with their associated phases.
 *
 * @param pathKeys - Array of path keys to preview
 * @param limit - Maximum number of items to display
 * @param getPhase - Function to resolve the phase for each key
 * @returns Formatted preview string; undefined if input is empty or limit is <= 0
 */
function formatPathPreview(
  pathKeys: readonly string[],
  limit: number,
  getPhase: (key: string) => PatchPhase | undefined
): string | undefined {
  // Invalid state guard
  if (pathKeys.length === 0 || limit <= 0) return undefined;

  const items = pathKeys.slice(0, limit).map(key => {
    const phase = getPhase(key) ?? 'unknown';
    return `"${formatPathKeyForDisplay(key)}" (${phase})`;
  });

  // Truncation indicator
  if (pathKeys.length > limit) {
    items.push(`… (${pathKeys.length - limit} more)`);
  }

  return `preview: ${items.join(', ')}`;
}

/**
 * Formats an actionable hint for patch failures based on phase.
 *
 * Only the `derive` phase provides user-recoverable guidance.
 * Other phases return undefined;
 * see "Phase safety & user actionability" section for the safeguard rationale.
 *
 * @param phase - The pipeline phase, or undefined if unknown
 * @returns Actionable hint for `derive`; undefined otherwise
 */
function formatPatchFailureHint(
  phase: PatchPhase | undefined
): string | undefined {
  switch (phase) {
    case 'derive':
      return (
        'Hint: derive patches are leaf-only. Ensure the prop exists in MDX ' +
        '(e.g. <CustomComponent test={...} />) before setting it.'
      );

    // covers diff, prune, and undefined
    default:
      return undefined;
  }
}

/**
 * Report (and throw) when patch application could not fully apply all patches.
 *
 * Canonical key contract
 * ----------------------
 * This API uses the canonical path key (`pathKey`) as the single source of truth
 * for both patch indexing and error reporting. By accepting the already-serialized
 * key, this function ensures:
 *
 * - Phase provenance lookups reference exactly the same key used during application
 * - Remaining patch identification uses the same indexing scheme without re-serialization
 * - Zero risk of key mismatch between the patch that failed and its diagnostic metadata
 *
 * Throw behavior (zero-tolerance)
 * -------------------------------
 * Always throws Error for any unapplied patch, per {@link ZeroTolerancePatchPolicy}.
 *
 * @param firstUnappliedPathKey - Canonical string key of the first failed patch
 * @param options - Reporting configuration including component name, phase resolver, and summary context
 * @throws Always throws with formatted message describing the first unapplied patch
 * @returns never
 */
export function reportPatchFailure(
  firstUnappliedPathKey: string,
  options: PatchReportOptions
): never {
  // 1. Look up provenance
  const phase = options.getPatchPhaseByPathKey(firstUnappliedPathKey);

  // 2. Format for human path display (e.g. '["items",1,"id"]' → "items.1.id")
  const propPath = formatPathKeyForDisplay(firstUnappliedPathKey);

  // 3. Attach actionable hint based on phase
  const hint = formatPatchFailureHint(phase);

  // 4. Build optional phase annotation
  const phaseAnnotation = phase ? ` (phase: ${phase})` : '';

  // 5. Format summary statistics for all unapplied patches
  const summaryLine = formatPatchFailureSummary(
    options.summaryContext,
    options.getPatchPhaseByPathKey
  );

  // 6. Assemble final error string with optional components
  const messageParts = [
    `[recma] Cannot fully apply patches for ${options.componentName}.`,
    `First un-applied path: "${propPath}"${phaseAnnotation} (non-literal AST shape or missing path)`
  ];

  if (hint) messageParts.push(hint);
  if (summaryLine) messageParts.push(summaryLine);

  const message = messageParts.join('\n');

  // 7. Throw - stop execution (fatal build error)
  throw new Error(message);
}
