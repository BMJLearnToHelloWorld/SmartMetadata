/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official RunDetailsCard.utils.ts (OSS reference) — banner metric summary subset.
 */
import type { TestCase, TestCaseResult } from '@/types/quality';
import { NO_VALUE, RESULT_METRIC_BY_DEFINITION } from '@/quality/testSummary.constants';
import { getParameterBounds, toFiniteNumber } from '@/quality/testSummaryGraphUtils';

export interface RunExpectation {
  expected?: number;
  min?: number;
  max?: number;
}

export function formatNumber(value: number): string {
  return value.toLocaleString();
}

export interface ParameterExpectation {
  expected?: number;
  min?: number;
  max?: number;
  threshold?: number;
}

export function resolveParameterExpectation(testCase: TestCase): ParameterExpectation {
  const { expected, min, max, threshold } = getParameterBounds(testCase.parameterValues ?? []);
  const expectedValue =
    expected ??
    RESULT_METRIC_BY_DEFINITION[testCase.testDefinition?.name ?? '']?.impliedExpected;

  return expectedValue === undefined ? { min, max, threshold } : { expected: expectedValue, threshold };
}

export function getRunExpectation(testCase: TestCase, result: TestCaseResult): RunExpectation {
  if (result.minBound !== undefined || result.maxBound !== undefined) {
    return { min: result.minBound, max: result.maxBound };
  }
  if (testCase.useDynamicAssertion) {
    return {};
  }
  const { expected, min, max } = resolveParameterExpectation(testCase);
  return expected === undefined ? { min, max } : { expected };
}

export function formatExpectation({ expected, min, max }: RunExpectation): string {
  if (expected !== undefined) {
    return formatNumber(expected);
  }
  if (min !== undefined && max !== undefined) {
    return `${formatNumber(min)} – ${formatNumber(max)}`;
  }
  if (max !== undefined) {
    return `≤ ${formatNumber(max)}`;
  }
  return min === undefined ? NO_VALUE : `≥ ${formatNumber(min)}`;
}

export function getFoundValue(result: TestCaseResult): number | undefined {
  const values = result.testResultValue ?? [];
  return values.length === 1 ? toFiniteNumber(values[0].value) : undefined;
}

export function getMeasuredResult(
  testCase: Pick<TestCase, 'testDefinition'>,
  result: TestCaseResult,
): TestCaseResult {
  if (testCase.testDefinition?.name !== 'columnValuesToBeUnique') {
    return result;
  }
  const byName = Object.fromEntries((result.testResultValue ?? []).map((entry) => [entry.name, entry]));
  const count = toFiniteNumber((byName.valueCount ?? byName.valuesCount)?.value);
  const unique = toFiniteNumber(byName.uniqueCount?.value);
  if (count === undefined || unique === undefined) {
    return result;
  }
  return {
    ...result,
    testResultValue: [{ name: 'duplicateCount', value: String(count - unique) }],
  };
}