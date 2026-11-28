/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  generateDateRange,
  mapStatusToHeatmapStatus,
  transformDimensionResultsToHeatmapData,
} from './dimensionalityHeatmap.utils';

describe('dimensionalityHeatmap.utils', () => {
  it('maps official test case statuses to heatmap cell colors', () => {
    expect(mapStatusToHeatmapStatus('Success')).toBe('success');
    expect(mapStatusToHeatmapStatus('Failed')).toBe('failed');
    expect(mapStatusToHeatmapStatus('Aborted')).toBe('aborted');
    expect(mapStatusToHeatmapStatus(undefined)).toBe('no-data');
  });

  it('fills no-data cells across the selected UTC date range', () => {
    const start = Date.UTC(2024, 0, 1);
    const end = Date.UTC(2024, 0, 2);
    expect(generateDateRange(start, end)).toEqual(['2024-01-01', '2024-01-02']);
    const rows = transformDimensionResultsToHeatmapData([], start, end);
    expect(rows).toEqual([]);
  });

  it('groups dimension results by value and date', () => {
    const start = Date.UTC(2024, 0, 10);
    const end = Date.UTC(2024, 0, 11);
    const rows = transformDimensionResultsToHeatmapData(
      [
        {
          dimensionValues: [{ value: 'US' }],
          testCaseStatus: 'Failed',
          timestamp: Date.UTC(2024, 0, 10, 12),
        },
      ],
      start,
      end,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.dimensionValue).toBe('US');
    const failedCell = rows[0]!.cells.find((cell) => cell.date === '2024-01-10');
    expect(failedCell?.status).toBe('failed');
  });
});