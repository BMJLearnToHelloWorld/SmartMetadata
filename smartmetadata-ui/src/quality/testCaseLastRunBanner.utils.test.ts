/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  getIncidentLink,
  getMetricSummary,
  getNextRunLabel,
  getNotRunMessageKey,
  getTaskDisplayId,
} from './testCaseLastRunBanner.utils';
import type { TestCase } from '@/types/quality';

describe('testCaseLastRunBanner.utils', () => {
  it('maps TASK display ids like official', () => {
    expect(getTaskDisplayId('TASK-00012')).toBe('12');
    expect(getTaskDisplayId('custom')).toBe('custom');
  });

  it('picks not-run message from next schedule state', () => {
    expect(getNotRunMessageKey(undefined)).toBe('message.test-case-has-not-run');
    expect(getNotRunMessageKey(Date.now() + 60_000)).toBe('message.test-case-first-run-scheduled');
    expect(getNotRunMessageKey(null)).toBe('message.test-case-not-run-yet');
  });

  it('formats next run label with humanized duration', () => {
    const future = Date.now() + 120_000;
    expect(getNextRunLabel(future, 'in', 'Not scheduled')).toMatch(/^in /);
    expect(getNextRunLabel(null, 'in', 'Not scheduled')).toBe('Not scheduled');
  });

  it('shows metric summary for failed runs with a single measured value', () => {
    const testCase: TestCase = {
      id: '1',
      name: 'row_count',
      parameterValues: [{ name: 'minValue', value: '10' }, { name: 'maxValue', value: '100' }],
      testDefinition: { name: 'tableRowCountToBeBetween' },
    };
    const summary = getMetricSummary(
      testCase,
      {
        testCaseStatus: 'Failed',
        testResultValue: [{ name: 'value', value: '5' }],
      },
      'Failed',
    );
    expect(summary.show).toBe(true);
    expect(summary.resultValue).toBe('5');
  });

  it('exposes incident link only for failed or aborted runs', () => {
    const link = { path: '/test-case/x/issues', label: '#9' };
    expect(getIncidentLink(link, 'Failed')).toEqual(link);
    expect(getIncidentLink(link, 'Success')).toBeNull();
  });
});