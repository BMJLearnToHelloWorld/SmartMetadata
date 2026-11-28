/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import type { TestCase, TestDefinition } from '@/types/quality';
import {
  buildConfigurationParameterRows,
  formatParameterValue,
  getConfiguredThresholdSentence,
  shouldShowComputeRowCount,
  shouldShowEditParameterButton,
  splitParameterValues,
  withComputeRowCountRow,
} from './testCaseResultTab.utils';
import { createTestI18n } from '@/test/i18n';
import { toEntityLink } from '@/quality/entityLink';

const { t } = createTestI18n().global;

describe('testCaseResultTab.utils (official TestCaseResultTab)', () => {
  it('formatParameterValue groups thousands for numeric parameter types', () => {
    expect(formatParameterValue('1000000', 'INT')).toBe('1,000,000');
    expect(formatParameterValue('hello', 'STRING')).toBe('hello');
  });

  it('splitParameterValues moves sqlExpression out of the generic rows', () => {
    const split = splitParameterValues([
      { name: 'threshold', value: '5' },
      { name: 'sqlExpression', value: 'SELECT 1' },
    ]);
    expect(split.withSqlParams).toHaveLength(1);
    expect(split.withoutSqlParams).toHaveLength(1);
    expect(split.withSqlParams[0].name).toBe('sqlExpression');
  });

  it('buildConfigurationParameterRows uses definition display names', () => {
    const definition: TestDefinition = {
      id: 'def1',
      name: 'columnValuesToBeBetween',
      testPlatforms: ['OpenMetadata'],
      parameterDefinition: [
        { name: 'minValue', displayName: 'Minimum', dataType: 'INT' },
        { name: 'maxValue', displayName: 'Maximum', dataType: 'INT' },
      ],
    };
    const testCase: TestCase = {
      id: 'tc1',
      name: 'tc',
      testSuites: [],
      parameterValues: [
        { name: 'minValue', value: '1' },
        { name: 'maxValue', value: '10' },
      ],
    };
    const rows = buildConfigurationParameterRows(testCase, definition);
    expect(rows.map((row) => row.label)).toEqual(['Minimum', 'Maximum']);
    expect(rows[0].value).toBe('1');
  });

  it('withComputeRowCountRow appends the official configuration row when supported', () => {
    const rows = withComputeRowCountRow(
      [],
      { id: 'x', name: 'x', testSuites: [], parameterValues: [], computePassedFailedRowCount: true },
      {
        id: 'def',
        name: 'tableRowCountToBeBetween',
        testPlatforms: ['OpenMetadata'],
        parameterDefinition: [],
        supportsRowLevelPassedFailed: true,
      },
      t,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe(t('label.compute-row-count'));
    expect(rows[0].value).toBe('true');
    expect(
      shouldShowComputeRowCount(
        { id: 'x', name: 'x', testSuites: [], parameterValues: [], computePassedFailedRowCount: true },
        { id: 'd', name: 'd', testPlatforms: [], parameterDefinition: [], supportsRowLevelPassedFailed: false },
      ),
    ).toBe(false);
  });

  it('shouldShowEditParameterButton matches official editable content gates', () => {
    expect(shouldShowEditParameterButton(true, { id: 'x', name: 'x', testSuites: [], parameterValues: [] }, false, false)).toBe(
      false,
    );
    expect(
      shouldShowEditParameterButton(
        true,
        { id: 'x', name: 'x', testSuites: [], parameterValues: [{ name: 'a', value: '1' }] },
        false,
        false,
      ),
    ).toBe(true);
    expect(
      shouldShowEditParameterButton(true, { id: 'x', name: 'x', testSuites: [], parameterValues: [], useDynamicAssertion: true }, false, false),
    ).toBe(true);
    expect(
      shouldShowEditParameterButton(
        true,
        { id: 'x', name: 'x', testSuites: [], parameterValues: [] },
        true,
        false,
      ),
    ).toBe(true);
    expect(
      shouldShowEditParameterButton(true, { id: 'x', name: 'x', testSuites: [], parameterValues: [] }, false, true),
    ).toBe(true);
  });
});

describe('getConfiguredThresholdSentence', () => {
  const definition: TestDefinition = {
    name: 'columnValuesToBeNotNull',
    parameterDefinition: [
      { name: 'threshold' },
      { name: 'thresholdUnit', optionValues: ['ABSOLUTE', 'PERCENTAGE'] },
    ],
  };
  const testCase: TestCase = {
    id: 'tc1',
    name: 'not_null',
    entityLink: toEntityLink('table', 'svc.db.schema.tbl', 'status'),
    parameterValues: [
      { name: 'threshold', value: '1' },
      { name: 'thresholdUnit', value: 'PERCENTAGE' },
    ],
    testDefinition: definition,
  };

  it('renders configuration threshold copy for row-countable tests', () => {
    const sentence = getConfiguredThresholdSentence(testCase, definition, t);
    expect(sentence).toBeTruthy();
    expect(sentence).toContain('status');
  });

  it('returns undefined for dynamic assertion tests', () => {
    expect(
      getConfiguredThresholdSentence({ ...testCase, useDynamicAssertion: true }, definition, t),
    ).toBeUndefined();
  });
});