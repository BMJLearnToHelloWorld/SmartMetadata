/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { ChartPoint, ChartSeries } from './types';

export function formatChartTs(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '';
  }
  const millis = value < 1e12 ? value * 1000 : value;
  return new Date(millis).toISOString().slice(0, 10);
}

const ISO_DATE_LABEL = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDateLabel(label: string): Date | undefined {
  if (!ISO_DATE_LABEL.test(label)) {
    return undefined;
  }
  // The ISO key is UTC (formatChartTs renders toISOString), so parse it
  // as UTC midnight: a local parse would shift the day in +UTC zones.
  const date = new Date(`${label}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Pin DataInsightChartCard.tsx:593-598: the x-axis formatter is
 * customFormatDateTime(value, 'MMM dd') — "Nov 19". Display-only: the
 * internal series key stays the ISO label, so non-date labels pass
 * through untouched and non-insight charts are unaffected.
 */
export function formatChartAxisDate(label: string): string {
  const date = parseIsoDateLabel(label);
  if (!date) {
    return label;
  }
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
}

export function collapseByLabel(points: ChartPoint[]): ChartPoint[] {
  const sums = new Map<string, number>();
  for (const point of points) {
    if (!point.label || !Number.isFinite(point.value)) {
      continue;
    }
    sums.set(point.label, (sums.get(point.label) ?? 0) + point.value);
  }
  return [...sums.entries()]
    .map(([label, value]) => ({ label, value }))
    .toSorted((a, b) => a.label.localeCompare(b.label));
}

export function bucketsToPoints(buckets: Array<{ key: string; count: number }>): ChartPoint[] {
  return buckets.flatMap((bucket) => {
    if (!bucket.key || !Number.isFinite(bucket.count) || bucket.count <= 0) {
      return [];
    }
    return [{ label: bucket.key, value: bucket.count }];
  });
}

export function countByLabel(items: Array<string | undefined | null>): ChartPoint[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const label = item?.trim();
    if (!label) {
      continue;
    }
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, value]) => ({ label, value }));
}

export function namedSeries(name: string, points: ChartPoint[]): ChartSeries[] {
  return points.length ? [{ name, points }] : [];
}

export function profilesToRowCountPoints(
  profiles: Array<{ timestamp?: number; rowCount?: number }>,
): ChartPoint[] {
  const byDay = new Map<string, { ts: number; value: number }>();
  for (const profile of profiles) {
    if (profile.timestamp === undefined || profile.rowCount === undefined) {
      continue;
    }
    const label = formatChartTs(profile.timestamp);
    if (!label) {
      continue;
    }
    const previous = byDay.get(label);
    if (!previous || profile.timestamp >= previous.ts) {
      byDay.set(label, { ts: profile.timestamp, value: profile.rowCount });
    }
  }
  return [...byDay.entries()]
    .toSorted((left, right) => left[0].localeCompare(right[0]))
    .map(([label, item]) => ({ label, value: item.value }));
}

export function usageToPoints(days: Array<{ date?: string; count?: number }>): ChartPoint[] {
  return days
    .flatMap((day) => {
      if (!day.date || day.count === undefined || !Number.isFinite(day.count)) {
        return [];
      }
      return [{ label: day.date, value: day.count }];
    })
    .toSorted((left, right) => left.label.localeCompare(right.label));
}

export function columnNullPoints(columns: Array<{ name: string; nullCount?: number }>): ChartPoint[] {
  return columns.flatMap((column) => {
    if (!column.name || column.nullCount === undefined || !Number.isFinite(column.nullCount)) {
      return [];
    }
    return [{ label: column.name, value: column.nullCount }];
  });
}

export function testResultsToStatusPoints(
  results: Array<{ testCaseStatus?: string }>,
): ChartPoint[] {
  return countByLabel(results.map((result) => result.testCaseStatus));
}

export function testResultsToTimeline(
  results: Array<{ testCaseStatus?: string; timestamp?: number }>,
): ChartSeries[] {
  const byStatus = new Map<string, ChartPoint[]>();
  for (const result of results) {
    const status = result.testCaseStatus?.trim();
    const label = formatChartTs(result.timestamp);
    if (!status || !label) {
      continue;
    }
    const points = byStatus.get(status) ?? [];
    points.push({ label, value: 1 });
    byStatus.set(status, points);
  }
  return [...byStatus.entries()].map(([name, points]) => ({
    name,
    points: collapseByLabel(points),
  }));
}

export function insightResultsToSeries(
  chartName: string,
  results: Array<{ count?: number; day?: number; group?: string; term?: string; metric?: string }>,
  options: { rankedKeys?: readonly string[]; colors?: readonly string[] } = {},
): ChartSeries[] {
  const byGroup = new Map<string, ChartPoint[]>();
  for (const result of results) {
    if (result.count === undefined || !Number.isFinite(result.count)) {
      continue;
    }
    const label = result.term || formatChartTs(result.day);
    if (!label) {
      continue;
    }
    const group = result.group || result.metric || chartName;
    const points = byGroup.get(group) ?? [];
    points.push({ label, value: result.count });
    byGroup.set(group, points);
  }
  const entries = [...byGroup.entries()];
  if (options.rankedKeys) {
    // Pin DataInsightChartCard.tsx:395-413: the rank is the latest value,
    // descending. Series follow the ranked keys, never the API's
    // first-appearance order — the row bars already use this order
    // (DataAssetsView progressColor), so the two stay in sync. A group
    // missing from the rank keeps its first-appearance order after the
    // ranked ones.
    const rank = new Map(options.rankedKeys.map((key, index) => [key, index]));
    entries.sort((a, b) => {
      const rankA = rank.get(a[0]);
      const rankB = rank.get(b[0]);
      if (rankA !== undefined && rankB !== undefined) {
        return rankA - rankB;
      }
      if (rankA !== undefined) {
        return -1;
      }
      if (rankB !== undefined) {
        return 1;
      }
      return 0;
    });
  }
  return entries.map(([name, points], index) => {
    const rank = options.rankedKeys ? options.rankedKeys.indexOf(name) : index;
    const color =
      options.colors && rank >= 0
        ? options.colors[rank % options.colors.length]
        : undefined;
    return {
      name,
      points: collapseByLabel(points),
      ...(color ? { color } : {}),
    };
  });
}
