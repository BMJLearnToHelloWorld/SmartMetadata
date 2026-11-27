/**
 * Official TableProfilerUtils + profiler.constant DEFAULT_RANGE_DATA
 * used by TableProfilerChart (showHeader=false path in
 * CustomMetricFormDrawer). Vue helpers — no CCL copy.
 */
import type { TableProfile } from '@/types/quality';
import type { SystemProfile } from '@/api/profiler';

/** Official profiler.constant DEFAULT_SELECTED_RANGE.days. */
export const DEFAULT_PROFILER_RANGE_DAYS = 7;

/** Official DATE_TIME_12_HOUR_FORMAT: 'MMM dd, yyyy, hh:mm a'. */
export const DATE_TIME_12_HOUR_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
};

export function customFormatDateTime(timestamp: number, locale = 'en-US'): string {
  const parts = new Intl.DateTimeFormat(locale, DATE_TIME_12_HOUR_FORMAT).formatToParts(new Date(timestamp));
  const pick = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('month')} ${pick('day')}, ${pick('year')}, ${pick('hour')}:${pick('minute')} ${pick('dayPeriod')}`;
}

/** Official getStartOfDayInMillis / getEndOfDayInMillis + DEFAULT_RANGE_DATA. */
export function defaultProfilerRange(now = Date.now()): { startTs: number; endTs: number } {
  const start = new Date(now - DEFAULT_PROFILER_RANGE_DAYS * 24 * 60 * 60 * 1000);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { startTs: start.getTime(), endTs: end.getTime() };
}

export interface ProfilerChartPoint {
  name: string;
  timestamp: number;
  [key: string]: string | number;
}

export function calculateRowCountMetrics(
  profiler: Array<Pick<TableProfile, 'timestamp' | 'rowCount'>>,
): ProfilerChartPoint[] {
  const data: ProfilerChartPoint[] = [];
  for (let i = profiler.length - 1; i >= 0; i--) {
    const row = profiler[i];
    if (row.timestamp === undefined) {
      continue;
    }
    data.push({
      name: customFormatDateTime(row.timestamp),
      timestamp: row.timestamp,
      rowCount: row.rowCount ?? 0,
    });
  }
  return data;
}

export function calculateSystemMetrics(profiler: SystemProfile[]): ProfilerChartPoint[] {
  const data: ProfilerChartPoint[] = [];
  for (let i = profiler.length - 1; i >= 0; i--) {
    const row = profiler[i];
    if (row.timestamp === undefined) {
      continue;
    }
    data.push({
      name: customFormatDateTime(row.timestamp),
      timestamp: row.timestamp,
      [row.operation ?? 'value']: row.rowsAffected ?? 0,
    });
  }
  return data;
}

export function calculateCustomMetrics(
  profiler: Array<Pick<TableProfile, 'timestamp' | 'customMetrics'>>,
  customMetrics: Array<{ name: string }>,
): Record<string, ProfilerChartPoint[]> {
  const byName: Record<string, ProfilerChartPoint[]> = {};
  for (const metric of customMetrics) {
    byName[metric.name] = [];
  }
  const ordered = [...profiler].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  for (const row of ordered) {
    if (row.timestamp === undefined) {
      continue;
    }
    const timestamp = row.timestamp;
    const name = customFormatDateTime(timestamp);
    for (const metric of row.customMetrics ?? []) {
      if (!metric.name) {
        continue;
      }
      const point: ProfilerChartPoint = {
        name,
        timestamp,
        [metric.name]: metric.value ?? 0,
      };
      if (!byName[metric.name]) {
        byName[metric.name] = [];
      }
      byName[metric.name].push(point);
    }
  }
  return byName;
}

export function pointsForKey(rows: ProfilerChartPoint[], key: string): { label: string; value: number }[] {
  return rows.map((row) => ({
    label: String(row.name),
    value: typeof row[key] === 'number' ? row[key] : Number(row[key] ?? 0),
  }));
}

export const SYSTEM_OPERATION_KEYS = ['Insert', 'Update', 'Delete'] as const;
