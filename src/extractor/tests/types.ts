import { SKIP_VALUE } from '../constants';

/**
 * Shared test types for extractor suites.
 */

/**
 * TYPE DEFINITION: Extraction Result
 * Represents the specific output signature of the Extraction Engine.
 */
export type ExtractionResult = unknown | typeof SKIP_VALUE;

/**
 * TYPE DEFINITION: Extract Props Result
 * Mirrors the public adapter return type.
 */
export type ExtractPropsResult = Record<string, unknown> | null;

/**
 * TYPE DEFINITION: Test Scenario
 * Represents a single row of data in a table-driven test.
 *
 * @template T - The type of the expected result (defaults to unknown).
 */
export type TestScenario<T = unknown> = {
  /**
   * A short, unique identifier for the scenario (e.g., "A -> O -> A").
   * Used for quick identification in test logs.
   */
  id: string;

  /**
   * A human-readable explanation of the test logic and expected behavior.
   * Describes the "Story" (e.g., "Atomic Propagation: Spread invalidates chain").
   */
  description: string;

  /**
   * The source code input to be parsed and analyzed.
   * (e.g., "[[[...spread]]]")
   */
  code: string;

  /**
   * The expected output from the function under test.
   * This matches the generic type `T`.
   */
  expected: T;
};
