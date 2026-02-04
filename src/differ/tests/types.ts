/**
 * Scenario input for table-driven tests.
 *
 * Use a builder function only when the input needs fresh references
 * (e.g., cyclic graphs or aliasing). Prefer named builders rather than
 * inline lambdas in the scenario table.
 */
export type ScenarioInput<T> = T | (() => T);

/**
 * Represents a single row of data in a table-driven diff test.
 *
 * @template TInput - The type of the input payload (e.g. DiffInput).
 * @template TExpected - The type of the expected result.
 */
export type TestScenario<TInput = unknown, TExpected = unknown> = {
  /**
   * A short, unique identifier for the scenario.
   */
  id: string;

  /**
   * A human-readable explanation of the test logic and expected behavior.
   */
  description: string;

  /**
   * The input payload for the test case.
   */
  input: ScenarioInput<TInput>;

  /**
   * The expected output from the function under test.
   */
  expected: TExpected;
};
