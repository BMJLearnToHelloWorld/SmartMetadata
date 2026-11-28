/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official DimensionalityHeatmap.utils.ts (OSS reference).
 */
import type { TestCaseDimensionResult } from '@/types/quality';

export type HeatmapStatus = 'success' | 'failed' | 'aborted' | 'no-data';

export interface HeatmapCellData {
  date: string;
  status: HeatmapStatus;
  dimensionValue: string;
  result?: TestCaseDimensionResult;
}

export interface HeatmapRowData {
  dimensionValue: string;
  cells: HeatmapCellData[];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateUTC(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateLabelUTC(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

export function generateDateRange(startTs: number, endTs: number): string[] {
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || startTs > endTs) {
    return [];
  }
  const dates: string[] = [];
  const current = new Date(startTs);
  const end = new Date(endTs);
  while (current <= end) {
    dates.push(formatDateUTC(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

export function mapStatusToHeatmapStatus(status?: string): HeatmapStatus {
  switch (status) {
    case 'Success':
      return 'success';
    case 'Failed':
      return 'failed';
    case 'Aborted':
      return 'aborted';
    default:
      return 'no-data';
  }
}

export function transformDimensionResultsToHeatmapData(
  results: TestCaseDimensionResult[],
  startTs: number,
  endTs: number,
): HeatmapRowData[] {
  const dateRange = generateDateRange(startTs, endTs);
  const resultMap = new Map<string, TestCaseDimensionResult>();
  const dimensionValues = new Set<string>();

  for (const result of results) {
    const dimensionValue = result.dimensionValues.map((dv) => dv.value).join(', ');
    dimensionValues.add(dimensionValue);
    if (result.timestamp) {
      const resultDate = formatDateUTC(new Date(result.timestamp));
      resultMap.set(`${dimensionValue}|${resultDate}`, result);
    }
  }

  return Array.from(dimensionValues).map((dimensionValue) => ({
    dimensionValue,
    cells: dateRange.map((date) => {
      const resultForDate = resultMap.get(`${dimensionValue}|${date}`);
      return {
        date,
        status: resultForDate
          ? mapStatusToHeatmapStatus(resultForDate.testCaseStatus)
          : ('no-data' as HeatmapStatus),
        dimensionValue,
        result: resultForDate,
      };
    }),
  }));
}

export function getStatusLabel(
  status: HeatmapStatus,
  t: (key: string) => string,
): string {
  const statusMap: Record<HeatmapStatus, string> = {
    success: t('label.success'),
    failed: t('label.failed'),
    aborted: t('label.aborted'),
    'no-data': t('label.no-data'),
  };
  return statusMap[status];
}