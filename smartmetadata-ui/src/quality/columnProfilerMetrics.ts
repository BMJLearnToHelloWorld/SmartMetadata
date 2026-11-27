/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { ColumnProfile, CustomMetricValue } from '@/types/quality';
import type { ProfilerChartPoint } from '@/quality/tableProfilerChart';

export interface MetricInfo {
  title: string;
  dataKey: string;
}

export interface MetricChartCollection {
  information: MetricInfo[];
  data: Array<Record<string, unknown>>;
}

export interface ColumnMetricsCollections {
  countMetrics: MetricChartCollection;
  proportionMetrics: MetricChartCollection;
  mathMetrics: MetricChartCollection;
  sumMetrics: MetricChartCollection;
  quartileMetrics: MetricChartCollection;
}

function hasAnyKey(record: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => record[key] !== undefined && record[key] !== null);
}

function formatChartTime(timestamp: number | undefined): string {
  if (timestamp === undefined) {
    return '';
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return String(timestamp);
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/**
 * Official TableProfilerUtils.calculateColumnProfilerMetrics: sort by
 * timestamp and split count / proportion / math / sum / quartile series.
 * Proportion values are multiplied by 100 and rounded, matching official.
 */
export function calculateColumnProfilerMetrics(
  columnProfilerData: ColumnProfile[],
  titles: ColumnMetricsCollections,
): ColumnMetricsCollections {
  const updateProfilerData = [...columnProfilerData].sort(
    (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
  );
  const countMetricData: Array<Record<string, unknown>> = [];
  const proportionMetricData: Array<Record<string, unknown>> = [];
  const mathMetricData: Array<Record<string, unknown>> = [];
  const sumMetricData: Array<Record<string, unknown>> = [];
  const quartileMetricData: Array<Record<string, unknown>> = [];

  for (const col of updateProfilerData) {
    const rec = col as unknown as Record<string, unknown>;
    const name = formatChartTime(col.timestamp);
    const defaultData = { name, timestamp: col.timestamp };
    if (hasAnyKey(rec, ['distinctCount', 'nullCount', 'uniqueCount', 'valuesCount'])) {
      countMetricData.push({
        ...defaultData,
        distinctCount: col.distinctCount,
        nullCount: col.nullCount,
        uniqueCount: col.uniqueCount,
        valuesCount: col.valuesCount,
      });
    }
    if (hasAnyKey(rec, ['sum'])) {
      sumMetricData.push({ ...defaultData, sum: col.sum });
    }
    if (hasAnyKey(rec, ['max', 'min', 'mean'])) {
      mathMetricData.push({ ...defaultData, max: col.max, min: col.min, mean: col.mean });
    }
    if (hasAnyKey(rec, ['distinctProportion', 'nullProportion', 'uniqueProportion'])) {
      proportionMetricData.push({
        ...defaultData,
        distinctProportion:
          col.distinctProportion === undefined ? undefined : Math.round(col.distinctProportion * 100),
        nullProportion: col.nullProportion === undefined ? undefined : Math.round(col.nullProportion * 100),
        uniqueProportion:
          col.uniqueProportion === undefined ? undefined : Math.round(col.uniqueProportion * 100),
      });
    }
    if (hasAnyKey(rec, ['firstQuartile', 'thirdQuartile', 'interQuartileRange', 'median'])) {
      quartileMetricData.push({
        ...defaultData,
        firstQuartile: col.firstQuartile,
        thirdQuartile: col.thirdQuartile,
        interQuartileRange: col.interQuartileRange,
        median: col.median,
      });
    }
  }

  const attach = (
    information: MetricInfo[],
    data: Array<Record<string, unknown>>,
  ): MetricChartCollection => ({ information, data });

  return {
    countMetrics: attach(titles.countMetrics.information, countMetricData),
    proportionMetrics: attach(titles.proportionMetrics.information, proportionMetricData),
    mathMetrics: attach(titles.mathMetrics.information, mathMetricData),
    sumMetrics: attach(titles.sumMetrics.information, sumMetricData),
    quartileMetrics: attach(titles.quartileMetrics.information, quartileMetricData),
  };
}

export function pointsForMetric(
  data: Array<Record<string, unknown>>,
  dataKey: string,
): { label: string; value: number }[] {
  return data.flatMap((row) => {
    const raw = row[dataKey];
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
    if (!Number.isFinite(value)) {
      return [];
    }
    return [{ label: String(row.name ?? row.timestamp ?? ''), value }];
  });
}

/**
 * Official getColumnCustomMetric: definitions live on the matching
 * column of the table details (or current page of columns).
 */
export function getColumnCustomMetric(
  columns: Array<{ fullyQualifiedName?: string; customMetrics?: ColumnCustomMetricDef[] }>,
  columnFqn: string,
): ColumnCustomMetricDef[] {
  return columns.find((column) => column.fullyQualifiedName === columnFqn)?.customMetrics ?? [];
}

interface ColumnCustomMetricDef {
  name: string;
}

/**
 * Official calculateCustomMetrics applied to column profile history.
 * Reuses the same {name, formattedTimestamp, timestamp, [metricName]: value}
 * shape as table-level custom metric graphs.
 */
export function calculateColumnCustomMetrics(
  profiler: Array<Pick<ColumnProfile, 'timestamp' | 'customMetrics'>>,
  customMetrics: Array<{ name: string }>,
): Record<string, ProfilerChartPoint[]> {
  const updateProfilerData = [...profiler].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  const customMetricsData: Record<string, ProfilerChartPoint[]> = {};
  for (const metric of customMetrics) {
    customMetricsData[metric.name] = [];
  }
  for (const data of updateProfilerData) {
    const timestamp = data.timestamp;
    const formattedTimestamp = formatChartTime(timestamp);
    for (const metric of data.customMetrics ?? []) {
      if (!metric.name) {
        continue;
      }
      const point: ProfilerChartPoint = {
        name: formattedTimestamp,
        timestamp: timestamp ?? 0,
      };
      if (metric.value !== undefined) {
        point[metric.name] = metric.value;
      }
      if (!customMetricsData[metric.name]) {
        customMetricsData[metric.name] = [point];
      } else {
        customMetricsData[metric.name].push(point);
      }
    }
  }
  return customMetricsData;
}

export type { CustomMetricValue };
