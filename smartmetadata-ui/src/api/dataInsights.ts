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
  'percentage_of_service_with_description',
  'percentage_of_service_with_owner',
] as const;

export type SystemChartName = (typeof SYSTEM_CHART_NAMES)[number];

/**
 * The four charts rendered in the pipeline section. The two service charts
 * are members of SYSTEM_CHART_NAMES but have their own cards (with a
 * headline, change value and per-service column) and are fetched with the
 * summary/absolute-value charts, not rendered again as pipeline lines.
 * (ADR:2026-11-07-data-insights-service-cards)
 */
export const PIPELINE_CHART_NAMES = [
  'total_data_assets',
  'percentage_of_data_asset_with_description',
  'percentage_of_data_asset_with_owner',
  'total_data_assets_by_tier',
] as const;

/** Official SystemChartType.PercentageOfServiceWithDescription/Owner. */
export const SERVICE_CHART_NAMES = [
  'percentage_of_service_with_description',
  'percentage_of_service_with_owner',
] as const;

/**
 * Official DataInsightSummary.tsx getMultiChartsPreviewByName: the four
 * summary cards the headline % values come from.
 */
export const SUMMARY_CARD_CHART_NAMES = [
  'total_data_assets_summary_card',
  'data_assets_with_description_summary_card',
  'data_assets_with_owner_summary_card',
  'total_data_assets_with_tier_summary_card',
] as const;

/**
 * Official DataInsightChartCard.tsx ABSOLUTE_VALUES_CHART: the absolute
 * counts the change-in-value formula divides by the daily total assets.
 */
export const ABSOLUTE_VALUE_CHART_NAMES = [
  'number_of_data_asset_with_description_kpi',
  'number_of_data_asset_with_owner_kpi',
] as const;

/** KPI chart names keyed by which service card they feed. */
export const SERVICE_ABSOLUTE_VALUE_CHART: Record<
  (typeof SERVICE_CHART_NAMES)[number],
  (typeof ABSOLUTE_VALUE_CHART_NAMES)[number]
> = {
  percentage_of_service_with_description: 'number_of_data_asset_with_description_kpi',
  percentage_of_service_with_owner: 'number_of_data_asset_with_owner_kpi',
};

/** Summary card keyed by which service card's headline it feeds. */
export const SERVICE_SUMMARY_CARD_CHART: Record<
  (typeof SERVICE_CHART_NAMES)[number],
  (typeof SUMMARY_CARD_CHART_NAMES)[number]
> = {
  percentage_of_service_with_description: 'data_assets_with_description_summary_card',
  percentage_of_service_with_owner: 'data_assets_with_owner_summary_card',
};

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

export interface ListSystemChartDataOptions {
  /**
   * Serialized DataInsight filter, built by
   * getQueryFilterForDataInsightChart. Sent with every chart request when
   * a team/tier filter is active, mirroring official DataInsightChartCard
   * fetchData params `{start, end, filter}`.
   */
  filter?: string;
  /**
   * When true a 4xx surfaces to the caller instead of the legacy silent
   * `{}`. New cards must fail loudly (review condition 3,
   * ADR:2026-11-07-data-insights-service-cards); the legacy pipeline keeps
   * the silent residual so a missing chart name cannot blank the page.
   */
  strict?: boolean;
}

export async function listSystemChartData(
  chartNames: readonly string[],
  start: number,
  end: number,
  options: ListSystemChartDataOptions = {},
): Promise<SystemChartData> {
  try {
    const raw = await apiRequest<unknown>('/v1/analytics/dataInsights/system/charts/listChartData', {
      query: {
        chartNames: chartNames.join(','),
        start,
        end,
        ...(options.filter !== undefined ? { filter: options.filter } : {}),
      },
    });
    return mapSystemChartData(raw);
  } catch (error) {
    if (!options.strict && error instanceof ApiError && error.status >= 400 && error.status < 500) {
      return {};
    }
    throw error;
  }
}

/**
 * Official `getQueryFilterForDataInsightChart` (openmetadata-ui
 * utils/DataInsightPureUtils.ts:226-269), ported field for field:
 * tier values become `term` queries on `tier.keyword`, team values become
 * `term` queries on `owners.name.keyword` inside a `nested` query on the
 * `owners` path, all under `query.bool.must`. Returns `undefined` when
 * neither filter has a value, so no `filter` parameter is sent at all.
 * (An empty array is treated like an absent filter; the official callers
 * pass `undefined` for an empty selection, which is the same state.)
 */
export function getQueryFilterForDataInsightChart(
  teamFilter?: string[],
  tierFilter?: string[],
): string | undefined {
  if (!teamFilter?.length && !tierFilter?.length) {
    return undefined;
  }

  return JSON.stringify({
    query: {
      bool: {
        must: [
          ...(tierFilter?.length
            ? [
                {
                  bool: {
                    should: tierFilter.map((tier) => ({
                      term: { 'tier.keyword': tier },
                    })),
                  },
                },
              ]
            : []),
          ...(teamFilter?.length
            ? [
                {
                  nested: {
                    path: 'owners',
                    query: {
                      bool: {
                        should: teamFilter.map((team) => ({
                          term: { 'owners.name.keyword': team },
                        })),
                      },
                    },
                  },
                },
              ]
            : []),
        ],
      },
    },
  });
}

/**
 * Latest summary-card value: the `count` of the row with the greatest
 * `day`, never the first row — the server returns rows in no guaranteed
 * order, while the official UI reads the first row only because its
 * summary aggregator returns a single row. `undefined` when there is no
 * row with a count, so callers show no value instead of a fabricated 0.
 */
export function latestSummaryCount(
  points: readonly InsightResultPoint[],
): number | undefined {
  let best: InsightResultPoint | undefined;
  for (const point of points) {
    if (point.count === undefined) {
      continue;
    }
    if (!best || (point.day ?? 0) > (best.day ?? 0)) {
      best = point;
    }
  }
  return best?.count;
}

/**
 * Official `computeDefaultChange` (openmetadata-ui
 * components/DataInsight/DataInsightChartCard.tsx:182-240): the change in
 * global percentage points between the first and last day of the window,
 * `(last-day absolute / last-day total − first-day absolute / first-day
 * total) × 100`. Totals are summed across groups per day; the first and
 * last days are taken from the totals series and the absolute values are
 * read on those same days, so the two fractions are never taken from
 * different days (review condition 2). A day with no absolute row counts
 * as 0; a day with a 0 total counts as 0%. Returns 0 when the totals
 * series has no day at all — callers hide the change line in that case
 * instead of showing a computed 0.
 */
export function computeChangeInPercentagePoints(
  totalAssets: readonly InsightResultPoint[],
  absoluteValues: readonly InsightResultPoint[],
): number {
  const totalByDay = new Map<number, number>();
  for (const point of totalAssets) {
    if (point.day === undefined || point.count === undefined) {
      continue;
    }
    totalByDay.set(point.day, (totalByDay.get(point.day) ?? 0) + point.count);
  }
  const days = [...totalByDay.keys()].sort((a, b) => a - b);
  if (!days.length) {
    return 0;
  }
  const firstDay = days[0] as number;
  const lastDay = days[days.length - 1] as number;
  const firstTotal = totalByDay.get(firstDay) ?? 0;
  const lastTotal = totalByDay.get(lastDay) ?? 0;

  const absoluteByDay = new Map<number, number>();
  for (const point of absoluteValues) {
    if (point.day === undefined || point.count === undefined) {
      continue;
    }
    absoluteByDay.set(point.day, (absoluteByDay.get(point.day) ?? 0) + point.count);
  }
  const firstAbsolute = absoluteByDay.get(firstDay) ?? 0;
  const lastAbsolute = absoluteByDay.get(lastDay) ?? 0;

  const firstPercent = firstTotal ? (firstAbsolute / firstTotal) * 100 : 0;
  const lastPercent = lastTotal ? (lastAbsolute / lastTotal) * 100 : 0;
  return lastPercent - firstPercent;
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
