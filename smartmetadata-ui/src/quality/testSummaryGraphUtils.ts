/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official TestSummaryGraphUtils parameter bounds + toFiniteNumber (subset).
 */
import type { TestCaseParameterValue, TestCaseResult } from '@/types/quality';
import { NO_VALUE } from '@/quality/testSummary.constants';

const MIN_ROWS_PER_DIMENSION_PARAM = 'minRowsPerDimension';
const EXPECTED_VALUE_PARAMETERS = new Set(['value', 'columnCount', 'missingCountValue']);
const MIN_BOUND_PARAMETER = /^min($|[A-Z])/;
const MAX_BOUND_PARAMETER = /^max($|[A-Z])/;
const NOT_BOUND_PARAMETERS = new Set([MIN_ROWS_PER_DIMENSION_PARAM]);

const isBound = (pattern: RegExp, name: string) =>
  pattern.test(name) && !NOT_BOUND_PARAMETERS.has(name);

export function toFiniteNumber(value?: string): number | undefined {
  if ((value ?? '').trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export interface ParameterBounds {
  expected?: number;
  min?: number;
  max?: number;
  threshold?: number;
}

const EXCLUDED_CHART_FIELDS = new Set(['schemaTable1', 'schemaTable2', 'columnDiffCounts']);
const FALLBACK_SERIES_NAME = 'value';
export const PLACED_KEYS_FIELD = 'placedKeys';
const PLACED_SERIES_SUFFIX = '__placed';

export interface TestSummaryChartPoint {
  name: number;
  status?: string;
  boundArea?: [number, number];
  [key: string]: unknown;
}

export interface PrepareChartDataResult {
  information: { label: string; color: string }[];
  data: TestSummaryChartPoint[];
  showAILearningBanner: boolean;
}

export function placedSeriesKey(seriesKey: string): string {
  return `${seriesKey}${PLACED_SERIES_SUFFIX}`;
}

export interface ThresholdReference {
  y: number;
  labelKey: string;
  labelValue?: string;
}

export function getParameterBounds(testCaseParameterValue: TestCaseParameterValue[]): ParameterBounds {
  const valuesOf = (matches: (name: string) => boolean) =>
    testCaseParameterValue.reduce<number[]>((values, parameter) => {
      const value = toFiniteNumber(parameter.value);
      if (matches(parameter.name ?? '') && value !== undefined) {
        values.push(value);
      }
      return values;
    }, []);

  const maxBounds = valuesOf((name) => isBound(MAX_BOUND_PARAMETER, name));
  const minBounds = valuesOf((name) => isBound(MIN_BOUND_PARAMETER, name));
  const [threshold] = valuesOf((name) => name === 'threshold');

  return {
    expected: valuesOf((name) => EXPECTED_VALUE_PARAMETERS.has(name))[0],
    max: maxBounds.length === 0 ? undefined : Math.max(...maxBounds),
    min: minBounds.length === 0 ? undefined : Math.min(...minBounds),
    threshold,
  };
}

export function getThresholdReference(
  testCaseParameterValue: TestCaseParameterValue[],
  latestResult?: Pick<TestCaseResult, 'maxBound'>,
): ThresholdReference | undefined {
  const { expected, max, min, threshold } = getParameterBounds(testCaseParameterValue);

  if (expected !== undefined) {
    return {
      y: expected,
      labelKey: 'label.expected-value',
      labelValue: expected.toLocaleString(),
    };
  }
  if (max !== undefined) {
    return { y: max, labelKey: 'label.allowed-max' };
  }
  if (min !== undefined) {
    return { y: min, labelKey: 'label.allowed-min' };
  }
  if (threshold !== undefined) {
    return {
      y: threshold,
      labelKey: 'label.threshold-value',
      labelValue: threshold.toLocaleString(),
    };
  }
  return latestResult?.maxBound === undefined
    ? undefined
    : { y: latestResult.maxBound, labelKey: 'label.learned-baseline' };
}

const CHART_PALETTE = ['#1570ef', '#6938ef', '#dd2590', '#e31b54', '#039855'];

export interface TestSummaryIncidentTask {
  id?: string;
  taskId?: { id?: string };
  displayName?: string;
}

export function prepareChartData({
  testCaseParameterValue,
  testCaseResults,
  tasks = [],
}: {
  testCaseParameterValue: TestCaseParameterValue[];
  testCaseResults: TestCaseResult[];
  tasks?: TestSummaryIncidentTask[];
}): PrepareChartDataResult {
  const { min: minParameter, max: maxParameter } = getParameterBounds(testCaseParameterValue);
  const dataPoints: TestSummaryChartPoint[] = [];
  let showAILearningBanner = false;

  for (const result of testCaseResults) {
    const values = (result.testResultValue ?? []).reduce<Record<string, number>>((acc, curr) => {
      if (EXCLUDED_CHART_FIELDS.has(curr.name ?? '')) {
        return acc;
      }
      const parsed = Number.parseFloat(curr.value ?? '');
      const value = Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
      return { ...acc, [curr.name ?? FALLBACK_SERIES_NAME]: value };
    }, {});

    const y1 = result.minBound ?? minParameter;
    const y2 = result.maxBound ?? maxParameter;
    const boundArea = y1 === undefined || y2 === undefined ? undefined : ([y1, y2] as [number, number]);

    if (boundArea === undefined) {
      showAILearningBanner = true;
    }

    const metric = {
      passedRows: result.passedRows,
      failedRows: result.failedRows,
      passedRowsPercentage:
        result.passedRowsPercentage === undefined ? undefined : `${Math.round(result.passedRowsPercentage * 100) / 100}%`,
      failedRowsPercentage:
        result.failedRowsPercentage === undefined ? undefined : `${Math.round(result.failedRowsPercentage * 100) / 100}%`,
    };

    dataPoints.push({
      name: result.timestamp ?? 0,
      status: result.testCaseStatus,
      ...values,
      ...(metric.passedRows === undefined ? {} : { passedRows: metric.passedRows }),
      ...(metric.failedRows === undefined ? {} : { failedRows: metric.failedRows }),
      boundArea,
      incidentId: result.incidentId,
      task: tasks.find((task) => task.id === result.incidentId),
    });
  }

  dataPoints.reverse();

  const testCaseResultParams = testCaseResults.find((result) => (result.testResultValue?.length ?? 0) > 0);
  const filteredResultValues =
    testCaseResultParams?.testResultValue?.filter((info) => !EXCLUDED_CHART_FIELDS.has(info.name ?? '')) ?? [];

  const measuredSeries = filteredResultValues.map((info) => info.name ?? '');
  const seriesNames =
    measuredSeries.length === 0 && dataPoints.length > 0 ? [FALLBACK_SERIES_NAME] : measuredSeries;

  return {
    information: seriesNames.map((label, i) => ({
      label,
      color: CHART_PALETTE[i] ?? CHART_PALETTE[0],
    })),
    data: dataPoints,
    showAILearningBanner,
  };
}

export function applyStatusPlacements(
  data: TestSummaryChartPoint[],
  seriesLabels: string[],
  thresholdY?: number,
): TestSummaryChartPoint[] {
  const plotted = data.flatMap((point) =>
    seriesLabels.map((label) => point[label]).filter((value): value is number => typeof value === 'number'),
  );

  const baseline =
    plotted.length === 0 ? (thresholdY ?? 0) : Math.min(...plotted);

  const placementByStatus: Record<string, number | undefined> = {
    Aborted: baseline,
    Queued: thresholdY ?? baseline,
  };

  return data.map((point) => {
    const placement = point.status ? placementByStatus[point.status] : undefined;
    const placedKeys = seriesLabels.reduce<string[]>((keys, label) => {
      if (typeof point[label] !== 'number') {
        keys.push(placedSeriesKey(label));
      }
      return keys;
    }, []);

    if (placement === undefined || placedKeys.length === 0) {
      return point;
    }

    return {
      ...point,
      ...Object.fromEntries(placedKeys.map((key) => [key, placement])),
      [PLACED_KEYS_FIELD]: placedKeys,
    };
  });
}

export function formatTestSummaryYAxis(value: number, useFreshnessFormat: boolean): string {
  if (useFreshnessFormat) {
    const seconds = Math.abs(value);
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    }
    if (seconds < 3600) {
      return `${Math.round(seconds / 60)}m`;
    }
    return `${(seconds / 3600).toFixed(1)}h`;
  }
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString();
}

export type StatusChartStatus = 'success' | 'failed' | 'warning' | 'info';

export function getStatusChartStatus(status?: string): StatusChartStatus {
  if (status === 'Success') {
    return 'success';
  }
  if (status === 'Failed') {
    return 'failed';
  }
  if (status === 'Queued') {
    return 'info';
  }
  return 'warning';
}

export const STATUS_CHART_COLORS: Record<StatusChartStatus, string> = {
  success: '#17b26a',
  failed: '#f04438',
  warning: '#f79009',
  info: '#2e90fa',
};