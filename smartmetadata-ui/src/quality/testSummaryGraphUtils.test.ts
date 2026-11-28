/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { applyStatusPlacements, getThresholdReference, prepareChartData } from './testSummaryGraphUtils';
import type { TestCaseResult } from '@/types/quality';

describe('testSummaryGraphUtils', () => {
  it('prepareChartData maps row-count runs with bounds', () => {
    const result: TestCaseResult = {
      timestamp: 1_700_000_000_000,
      testCaseStatus: 'Success',
      testResultValue: [{ name: 'value', value: '42' }],
    };
    const chart = prepareChartData({
      testCaseParameterValue: [
        { name: 'minValue', value: '10' },
        { name: 'maxValue', value: '50' },
      ],
      testCaseResults: [result],
    });
    expect(chart.data).toHaveLength(1);
    expect(chart.data[0].value).toBe(42);
    expect(chart.data[0].boundArea).toEqual([10, 50]);
  });

  it('getThresholdReference prefers expected value', () => {
    const ref = getThresholdReference([{ name: 'value', value: '100' }]);
    expect(ref).toEqual({
      y: 100,
      labelKey: 'label.expected-value',
      labelValue: '100',
    });
  });

  it('applyStatusPlacements places aborted runs on baseline', () => {
    const data = prepareChartData({
      testCaseParameterValue: [],
      testCaseResults: [{ timestamp: 1, testCaseStatus: 'Aborted', testResultValue: [] }],
    }).data;
    const placed = applyStatusPlacements(data, ['value'], 5);
    expect(placed[0].value__placed).toBe(5);
  });
});