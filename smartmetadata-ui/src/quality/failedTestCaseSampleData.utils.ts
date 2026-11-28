/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official FailedTestCaseSampleData gating + table shaping (pin OSS).
 */
import type { TestCaseResult, TableSampleData } from '@/types/quality';

export const FAILED_SAMPLE_DIFF_TYPE = 'diffType';
export const FAILED_SAMPLE_ROW_KEY = '__rowKey';

export const FAILED_SAMPLE_DIFF_VALUES = {
  ADD: '+',
  REMOVE: '-',
  NOT_EQUAL: '!=',
} as const;

export type FailedSampleCellValue = string | number | boolean | Record<string, unknown> | null | undefined;

export interface FailedSampleColumn {
  id: string;
  name: string;
  label: string;
}

export interface FailedSampleTableModel {
  columns: FailedSampleColumn[];
  rows: Record<string, FailedSampleCellValue>[];
}

/** ADR:2026-10-09-failed-rows-sample-follows-failed-rows-not-status. */
export function isFailedRowsSampleExpected(testCaseResult?: TestCaseResult): boolean {
  switch (testCaseResult?.testCaseStatus) {
    case 'Failed':
      return true;
    case 'Success':
      return (testCaseResult.failedRows ?? 0) > 0;
    default:
      return false;
  }
}

/** Pin getSampleDataWithType: unique column ids for duplicate projection names. */
export function getSampleDataWithType(tableData: TableSampleData): FailedSampleTableModel {
  const columns: FailedSampleColumn[] = (tableData?.columns ?? []).map((column, index) => ({
    id: `${index}-${column}`,
    name: column,
    label: column === FAILED_SAMPLE_DIFF_TYPE ? '' : column,
  }));

  const rows = (tableData?.rows ?? []).map((item, index) => {
    const dataObject: Record<string, FailedSampleCellValue> = {};
    columns.forEach((col, colIndex) => {
      dataObject[col.id] = item[colIndex];
    });
    dataObject[FAILED_SAMPLE_ROW_KEY] = index;
    return dataObject;
  });

  return { columns, rows };
}