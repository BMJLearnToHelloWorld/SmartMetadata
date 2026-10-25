/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asNumber, asRecord, asString } from '@/api/json';
import { ApiError, apiRequest } from './client';

/** Server-seeded system chart names (GET listChartData `chartNames=`). */
export const SYSTEM_CHART_NAMES = [
  'total_data_assets',
  'percentage_of_data_asset_with_description',
  'percentage_of_data_asset_with_owner',
  'total_data_assets_by_tier',
] as const;

export type SystemChartName = (typeof SYSTEM_CHART_NAMES)[number];

export interface InsightResultPoint {
  count?: number;
  day?: number;
  group?: string;
  term?: string;
  metric?: string;
}

export type SystemChartData = Partial<Record<string, InsightResultPoint[]>>;

function mapResult(raw: Record<string, unknown>): InsightResultPoint | null {
  const count = asNumber(raw.count);
  const day = asNumber(raw.day);
  const group = asString(raw.group) || undefined;
  const term = asString(raw.term) || undefined;
  const metric = asString(raw.metric) || undefined;
  if (count === undefined && day === undefined && !group && !term) {
    return null;
  }
  return { count, day, group, term, metric };
}

export function mapSystemChartData(payload: unknown): SystemChartData {
  const root = asRecord(payload);
  if (!root) {
    return {};
  }
  const mapped: SystemChartData = {};
  for (const [name, value] of Object.entries(root)) {
    const rec = asRecord(value);
    const rows = Array.isArray(rec?.results) ? rec.results : Array.isArray(value) ? value : [];
    const points = rows.flatMap((item) => {
      const row = asRecord(item);
      const mappedRow = row ? mapResult(row) : null;
      return mappedRow ? [mappedRow] : [];
    });
    if (points.length) {
      mapped[name] = points;
    }
  }
  return mapped;
}

export async function listSystemChartData(
  chartNames: readonly string[],
  start: number,
  end: number,
): Promise<SystemChartData> {
  try {
    const raw = await apiRequest<unknown>('/v1/analytics/dataInsights/system/charts/listChartData', {
      query: {
        chartNames: chartNames.join(','),
        start,
        end,
      },
    });
    return mapSystemChartData(raw);
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
      return {};
    }
    throw error;
  }
}
