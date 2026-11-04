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

/**
 * Official landing aggregation (openmetadata-ui rest/DataInsightAPI.ts
 * getAggregateChartData + DataInsightSummary.tsx): GET
 * /v1/analytics/dataInsights/charts/aggregate. Server params verified
 * against DataInsightChartResource.java:511-580: dataInsightChartName
 * (DataInsightChartType enum) and dataReportIndex (DataReportIndex enum)
 * are required; startTs/endTs/size/from/queryFilter/tier/team optional.
 * The summary uses MostActiveUsers + PageViewsByEntities + DailyActiveUsers
 * (WEB_CHARTS in official DataInsight.constants.ts).
 */
export const DATA_INSIGHT_CHART_TYPES = [
  'MostActiveUsers',
  'PageViewsByEntities',
  'DailyActiveUsers',
] as const;

export type DataInsightChartType = (typeof DATA_INSIGHT_CHART_TYPES)[number];

export const DATA_REPORT_INDEXES = {
  webAnalyticUserActivity: 'web_analytic_user_activity_report_data_index',
  webAnalyticEntityView: 'web_analytic_entity_view_report_data_index',
} as const;

export interface DataInsightAggregateRow {
  timestamp?: number;
  activeUsers?: number;
  pageViews?: number;
  entityType?: string;
  entityFqn?: string;
  entityHref?: string;
  userName?: string;
  sessions?: number;
  sessionDuration?: number;
  avgSessionDuration?: number;
  lastSession?: number;
  team?: string;
  owner?: string;
}

export interface DataInsightAggregateResult {
  chartType?: string;
  total?: number;
  data: DataInsightAggregateRow[];
}

export interface AggregateChartDataOptions {
  dataInsightChartName: DataInsightChartType;
  dataReportIndex: string;
  startTs?: number;
  endTs?: number;
  size?: number;
  from?: number;
  queryFilter?: string;
  tier?: string;
  team?: string;
}

function mapAggregateRow(raw: unknown): DataInsightAggregateRow | null {
  const rec = asRecord(raw);
  if (!rec) {
    return null;
  }
  const row: DataInsightAggregateRow = {
    timestamp: asNumber(rec.timestamp),
    activeUsers: asNumber(rec.activeUsers),
    pageViews: asNumber(rec.pageViews),
    entityType: asString(rec.entityType) || undefined,
    entityFqn: asString(rec.entityFqn) || undefined,
    entityHref: asString(rec.entityHref) || undefined,
    userName: asString(rec.userName) || undefined,
    sessions: asNumber(rec.sessions),
    sessionDuration: asNumber(rec.sessionDuration),
    avgSessionDuration: asNumber(rec.avgSessionDuration),
    lastSession: asNumber(rec.lastSession),
    team: asString(rec.team) || undefined,
    owner: asString(rec.owner) || undefined,
  };
  const hasValue = Object.values(row).some((value) => value !== undefined);
  return hasValue ? row : null;
}

export async function getAggregateChartData(
  options: AggregateChartDataOptions,
): Promise<DataInsightAggregateResult[]> {
  const raw = await apiRequest<unknown>('/v1/analytics/dataInsights/charts/aggregate', {
    query: {
      dataInsightChartName: options.dataInsightChartName,
      dataReportIndex: options.dataReportIndex,
      ...(options.startTs !== undefined ? { startTs: options.startTs } : {}),
      ...(options.endTs !== undefined ? { endTs: options.endTs } : {}),
      ...(options.size !== undefined ? { size: options.size } : {}),
      ...(options.from !== undefined ? { from: options.from } : {}),
      ...(options.queryFilter !== undefined ? { queryFilter: options.queryFilter } : {}),
      ...(options.tier !== undefined ? { tier: options.tier } : {}),
      ...(options.team !== undefined ? { team: options.team } : {}),
    },
  });
  const root = asRecord(raw);
  const items = Array.isArray(root?.data) ? root.data : [];
  return items.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const rows = Array.isArray(rec.data) ? rec.data : [];
    return [
      {
        chartType: asString(rec.chartType) || undefined,
        total: asNumber(rec.total),
        data: rows.flatMap((row) => {
          const mapped = mapAggregateRow(row);
          return mapped ? [mapped] : [];
        }),
      },
    ];
  });
}
