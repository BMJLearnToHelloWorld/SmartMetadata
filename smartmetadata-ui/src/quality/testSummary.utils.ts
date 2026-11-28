/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official TestSummary.utils.ts (caption + measured result + never-run).
 */
import type { ComposerTranslation } from 'vue-i18n';
import type { TestCase, TestCaseResult } from '@/types/quality';
import { parseEntityLink } from '@/quality/entityLink';
import {
  DEFAULT_RESULT_METRIC,
  RESULT_METRIC_BY_DEFINITION,
} from '@/quality/testSummary.constants';
import { getParameterBounds, toFiniteNumber } from '@/quality/testSummaryGraphUtils';

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
    expected ?? RESULT_METRIC_BY_DEFINITION[testCase.testDefinition?.name ?? '']?.impliedExpected;

  return expectedValue === undefined ? { min, max, threshold } : { expected: expectedValue, threshold };
}

export function getColumnNameFromEntityLink(entityLink?: string): string {
  const parsed = entityLink ? parseEntityLink(entityLink) : null;
  return parsed?.column ?? '';
}

function getComparison(testCase: TestCase): { key: string; values?: Record<string, string> } | undefined {
  if (testCase.useDynamicAssertion) {
    return { key: 'label.caption-learned-range' };
  }

  const { expected: expectedValue, min, max, threshold } = resolveParameterExpectation(testCase);

  if (expectedValue !== undefined) {
    return { key: 'label.caption-expected-value', values: { value: formatNumber(expectedValue) } };
  }
  if (min !== undefined && max !== undefined) {
    return { key: 'label.caption-allowed-range', values: { min: formatNumber(min), max: formatNumber(max) } };
  }
  if (max !== undefined) {
    return { key: 'label.caption-allowed-max', values: { value: formatNumber(max) } };
  }
  if (min !== undefined) {
    return { key: 'label.caption-allowed-min', values: { value: formatNumber(min) } };
  }
  return threshold === undefined
    ? undefined
    : { key: 'label.caption-threshold', values: { value: formatNumber(threshold) } };
}

export function getResultHistoryCaptionText(testCase: TestCase, t: ComposerTranslation): string {
  const metricDef =
    RESULT_METRIC_BY_DEFINITION[testCase.testDefinition?.name ?? ''] ?? DEFAULT_RESULT_METRIC;
  const metricValues = metricDef.namesColumn
    ? { column: getColumnNameFromEntityLink(testCase.entityLink) }
    : undefined;
  const metricText = t(metricDef.labelKey, metricValues);
  const comparison = getComparison(testCase);

  return comparison
    ? t('message.metric-vs-comparison', {
        metric: metricText,
        comparison: t(comparison.key, comparison.values),
      })
    : metricText;
}

export function getMeasuredResult<T extends Pick<TestCaseResult, 'testResultValue'>>(
  testCase: Pick<TestCase, 'testDefinition'>,
  result: T,
): T {
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

export function hasTestCaseNeverRun(
  testCase: Pick<TestCase, 'testCaseResult'>,
  results: unknown[],
  isVersionPage = false,
): boolean {
  return !isVersionPage && results.length === 0 && testCase.testCaseResult === undefined;
}