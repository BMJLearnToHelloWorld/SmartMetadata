/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official TestCaseResultTab.utils.ts / TestCaseConfigurationCard helpers (subset).
 */
import type { TestCase, TestDefinition, TestParameterValue } from '@/types/quality';
import { parseEntityLink } from '@/quality/entityLink';
import { formatNumber } from '@/quality/runDetailsCard.utils';
import { toFiniteNumber } from '@/quality/testSummaryGraphUtils';

const NUMERIC_PARAMETER_TYPES = new Set(['DECIMAL', 'DOUBLE', 'FLOAT', 'INT', 'NUMBER']);

export interface ConfigurationParameterRow {
  name?: string;
  label: string;
  value: string;
}

export function formatParameterValue(value: string | undefined, dataType?: string): string {
  const type = dataType?.toUpperCase();
  const number = NUMERIC_PARAMETER_TYPES.has(type ?? '') ? toFiniteNumber(value) : undefined;
  return number === undefined ? value ?? '' : formatNumber(number);
}

export function splitParameterValues(parameterValues: TestParameterValue[]): {
  withSqlParams: TestParameterValue[];
  withoutSqlParams: TestParameterValue[];
} {
  const withSqlParams: TestParameterValue[] = [];
  const withoutSqlParams: TestParameterValue[] = [];
  for (const param of parameterValues) {
    if (param.name === 'sqlExpression') {
      withSqlParams.push(param);
    } else {
      withoutSqlParams.push(param);
    }
  }
  return { withSqlParams, withoutSqlParams };
}

export function shouldShowComputeRowCount(
  testCase: TestCase | undefined,
  testDefinition: TestDefinition | undefined,
): boolean {
  return (
    testCase?.computePassedFailedRowCount !== undefined &&
    (testDefinition?.supportsRowLevelPassedFailed ?? false)
  );
}

export function withComputeRowCountRow(
  rows: ConfigurationParameterRow[],
  testCase: TestCase | undefined,
  testDefinition: TestDefinition | undefined,
  t: (key: string) => string,
): ConfigurationParameterRow[] {
  if (!shouldShowComputeRowCount(testCase, testDefinition)) {
    return rows;
  }
  return [
    ...rows,
    {
      label: t('label.compute-row-count'),
      value: String(testCase?.computePassedFailedRowCount),
    },
  ];
}

export function buildConfigurationParameterRows(
  testCase: TestCase | undefined,
  testDefinition: TestDefinition | undefined,
): ConfigurationParameterRow[] {
  if (!testCase || testCase.useDynamicAssertion) {
    return [];
  }
  const definitions = new Map(
    (testDefinition?.parameterDefinition ?? []).map((definition) => [definition.name, definition]),
  );
  const { withoutSqlParams } = splitParameterValues(testCase.parameterValues ?? []);
  return withoutSqlParams.map((param) => ({
    name: param.name,
    label: definitions.get(param.name)?.displayName ?? param.name,
    value: formatParameterValue(param.value, definitions.get(param.name)?.dataType),
  }));
}

export function shouldShowEditParameterButton(
  hasEditPermission: boolean,
  testCase: TestCase | undefined,
  hasDataQualityDimension = false,
  showComputeRowCount = false,
): boolean {
  const hasEditableContent = [
    testCase?.parameterValues?.length,
    testCase?.useDynamicAssertion,
    showComputeRowCount,
    hasDataQualityDimension,
  ].some(Boolean);
  return Boolean(hasEditPermission && hasEditableContent);
}

export function getCategoryLine(testCase: TestCase | undefined, t: (key: string, values?: Record<string, string>) => string): string {
  const parsed = testCase?.entityLink ? parseEntityLink(testCase.entityLink) : null;
  const column = parsed?.column;
  const category = column
    ? t('label.column-test-with-column', { column })
    : t('label.table-test');
  const dimension =
    testCase?.dataQualityDimension?.displayName ?? testCase?.dataQualityDimension?.name;
  return [category, dimension].filter(Boolean).join(' · ');
}

export function getDefinitionDisplayName(testDefinition?: TestDefinition | EntityRefLike): string {
  return testDefinition?.displayName ?? testDefinition?.name ?? '';
}

interface EntityRefLike {
  name?: string;
  displayName?: string;
}