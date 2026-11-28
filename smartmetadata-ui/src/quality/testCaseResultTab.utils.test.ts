/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import type { TestCase, TestDefinition } from '@/types/quality';
import {
  buildConfigurationParameterRows,
  formatParameterValue,
  shouldShowEditParameterButton,
  splitParameterValues,
} from './testCaseResultTab.utils';

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