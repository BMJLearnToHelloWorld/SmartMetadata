/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  FAILED_SAMPLE_DIFF_TYPE,
  FAILED_SAMPLE_ROW_KEY,
  getSampleDataWithType,
  isFailedRowsSampleExpected,
} from '@/quality/failedTestCaseSampleData.utils';
import type { TestCaseResult } from '@/types/quality';

describe('failedTestCaseSampleData.utils', () => {
  it('expects sample when run failed or success with failed rows', () => {
    expect(isFailedRowsSampleExpected({ testCaseStatus: 'Failed' } as TestCaseResult)).toBe(true);
    expect(
      isFailedRowsSampleExpected({ testCaseStatus: 'Success', failedRows: 3 } as TestCaseResult),
    ).toBe(true);
    expect(
      isFailedRowsSampleExpected({ testCaseStatus: 'Success', failedRows: 0 } as TestCaseResult),
    ).toBe(false);
    expect(isFailedRowsSampleExpected({ testCaseStatus: 'Aborted' } as TestCaseResult)).toBe(false);
  });

  it('assigns unique column ids when names repeat', () => {
    const model = getSampleDataWithType({
      columns: ['my_id', 'my_status', 'diffType', 'my_status'],
      rows: [['1', 'ok', '+', 'ok']],
    });
    expect(model.columns.map((c) => c.id)).toEqual([
      '0-my_id',
      '1-my_status',
      '2-diffType',
      '3-my_status',
    ]);
    expect(model.columns.find((c) => c.name === FAILED_SAMPLE_DIFF_TYPE)?.label).toBe('');
    expect(model.rows[0][FAILED_SAMPLE_ROW_KEY]).toBe(0);
  });
});