/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, type Ref } from 'vue';
import { listSystemChartData, type InsightResultPoint, type SystemChartData } from '@/api/dataInsights';
import { mapAggregateBuckets, postAggregateFieldOptions } from '@/api/search';
import { useWidgetLoad } from '@/features/home/widgetLoad';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DATA_ESTATE_WINDOW_DAYS = 7;
/** Windows the DataEstate card's range filter offers. */
export const DATA_ESTATE_WINDOW_OPTIONS = [DATA_ESTATE_WINDOW_DAYS, 30, 90];
export const TOTAL_DATA_ASSETS_WINDOW_DAYS = 7;
/** Windows the TotalDataAssets card's range filter offers. */
export const TOTAL_DATA_ASSETS_WINDOW_OPTIONS = [TOTAL_DATA_ASSETS_WINDOW_DAYS, 14, 30];
export const DATA_ESTATE_TTL_MS = 5 * 60 * 1000;
export const AGGREGATE_PAGE_SIZE_LARGE = 1000;

/**
 * Connectors the bar names individually. The rest fold into one "Other"
 * segment: past this many the slivers are unreadable, but their assets
 * still belong in the bar, or it would no longer add up to the estate.
 */
export const MAX_NAMED_CONNECTORS = 6;
/** Key of the folded remainder — the breakdown labels it in the reader's locale. */
export const OTHER_CONNECTORS_KEY = '__other__';

export interface ConnectorCount {
  /** The raw `serviceType`, e.g. `BigQuery` — stable across locales. */
  key: string;
  /** What the legend shows, e.g. `Big Query`. */
  name: string;
  count: number;
}

export type ChartResults = InsightResultPoint[];

/**
 * The charts report one row per (day, group). Collapse to the newest day
 * and sum its groups: that day is the current estate, whatever slice it
 * arrived in.
 */
export function latestDay(results: ChartResults): number {
  return results.reduce((newest, row) => Math.max(newest, row.day ?? 0), 0);
}

export function sumForDay(results: ChartResults, day: number): number {
  return results
    .filter((row) => row.day === day)
    .reduce((total, row) => total + (row.count ?? 0), 0);
}

interface CoverageAccumulator {
  /** Σ (group percentage × group asset count). */
  weighted: number;
  /** Σ group asset count. */
  weight: number;
  /** Σ group percentage, for the unweighted fallback. */
  total: number;
  groups: number;
}

/**
 * Coverage for each day, oldest first.
 *
 * The chart reports one row per entity type, each already a percentage —
 * so `table: 100, database: 0, databaseSchema: 0` means "tables are fully
 * described", not "200%". Summing those rows is what put 240% on the card.
 *
 * Averaging them is the fix, weighted by how many assets each type holds:
 * `total_data_assets` groups by the same dimension with the same labels, so
 * a type with three assets cannot count for as much as one with eight
 * hundred. When no weight is available — an ungrouped series, or a group
 * the totals chart does not carry — it falls back to the plain mean, which
 * for a single ungrouped row per day is just that row's value.
 */
export function coverageSeries(coverage: ChartResults, totals: ChartResults): number[] {
  const assetsPerGroup = new Map<string, number>();
  totals.forEach((row) =>
    assetsPerGroup.set(
      `${row.day}:${row.group}`,
      (assetsPerGroup.get(`${row.day}:${row.group}`) ?? 0) + (row.count ?? 0),
    ),
  );
  const byDay = new Map<number, CoverageAccumulator>();
  coverage.forEach((row) => {
    const day = byDay.get(row.day ?? 0) ?? { groups: 0, total: 0, weight: 0, weighted: 0 };
    const assets = assetsPerGroup.get(`${row.day}:${row.group}`) ?? 0;
    byDay.set(row.day ?? 0, {
      groups: day.groups + 1,
      total: day.total + (row.count ?? 0),
      weight: day.weight + assets,
      weighted: day.weighted + (row.count ?? 0) * assets,
    });
  });
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a - b)
    .map(([, day]) => {
      if (day.weight > 0) {
        return day.weighted / day.weight;
      }
      return day.groups > 0 ? day.total / day.groups : 0;
    });
}

const SERVICE_TYPE_FIELD = 'serviceType';
const ENTITY_TYPE_FIELD = 'entityType';

/** Display name for a service type: the official label map is not ported — start-case the raw value. */
export function formatServiceTypeLabel(serviceType: string): string {
  return serviceType
    .replaceAll(/[_-]/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * The estate's split by connector — from a `serviceType` terms aggregation
 * over the data-asset index.
 *
 * Deliberately NOT the `total_data_assets` chart: that groups by *entity
 * type*, which is what the card was showing under a "by connector"
 * heading. Nothing in the data-insight charts carries the service
 * dimension, so this is a second request rather than a different read of
 * the first. The aggregate endpoint rather than the search query's
 * built-in aggregation: that one carries the engine's default of ten
 * buckets, so an estate with an eleventh connector under-reported both
 * the split and "across N connectors".
 */
export async function fetchConnectorBreakdown(): Promise<ConnectorCount[]> {
  const response = await postAggregateFieldOptions({
    deleted: false,
    fieldName: SERVICE_TYPE_FIELD,
    index: 'dataAsset',
    size: AGGREGATE_PAGE_SIZE_LARGE,
  });
  const buckets = mapAggregateBuckets(response, SERVICE_TYPE_FIELD);
  return buckets
    .map((bucket) => ({
      count: bucket.docCount,
      key: bucket.key,
      name: formatServiceTypeLabel(bucket.key),
    }))
    .sort((a, b) => b.count - a.count);
}

/** Names the largest connectors and folds the tail into one "Other" entry. */
export function foldConnectors(connectors: ConnectorCount[]): ConnectorCount[] {
  if (connectors.length <= MAX_NAMED_CONNECTORS) {
    return connectors;
  }
  const named = connectors.slice(0, MAX_NAMED_CONNECTORS - 1);
  const rest = connectors.slice(MAX_NAMED_CONNECTORS - 1);
  return [
    ...named,
    {
      count: rest.reduce((total, connector) => total + connector.count, 0),
      key: OTHER_CONNECTORS_KEY,
      name: '',
    },
  ];
}

const DATA_ESTATE_CHART_NAMES = [
  'total_data_assets',
  'percentage_of_data_asset_with_description',
] as const;

async function fetchDataEstateCharts(windowDays: number): Promise<SystemChartData> {
  const end = Date.now();
  // Strict: a 4xx must surface, never silently become "no data".
  return listSystemChartData([...DATA_ESTATE_CHART_NAMES], end - windowDays * DAY_MS, end, {
    strict: true,
  });
}

export interface DataEstateFigures {
  totalAssets: number;
  totalDelta: number | null;
  windowDays: number;
  connectors: ConnectorCount[];
  connectorCount: number;
  descriptionCoverage: number | null;
  descriptionCoverageDelta: number | null;
  descriptionCoverageSeries: number[];
}

/** The card's figures from the two answers in hand — pure. */
export function deriveEstate(
  charts: SystemChartData | undefined,
  allConnectors: ConnectorCount[],
  windowDays: number,
): DataEstateFigures {
  const totals = charts?.total_data_assets ?? [];
  const coverage = charts?.percentage_of_data_asset_with_description ?? [];
  const newestDay = latestDay(totals);
  const oldestDay = totals.reduce((oldest, row) => Math.min(oldest, row.day ?? newestDay), newestDay);
  const liveTotal = allConnectors.reduce((total, connector) => total + connector.count, 0);
  // Data Insights only has rows once its pipeline has run. Without them the
  // header would print 0 above a populated breakdown, so it falls back to
  // the live connector sum — which leaves out assets with no service
  // (glossary terms and the like), so it is a floor rather than the same
  // figure.
  const hasInsights = totals.length > 0;
  const totalAssets = hasInsights ? sumForDay(totals, newestDay) : liveTotal;
  const series = coverageSeries(coverage, totals);
  // A single-day window has no baseline to compare against, so report no
  // movement rather than the whole estate's worth of it.
  const hasBaseline = hasInsights && oldestDay !== newestDay;
  return {
    connectorCount: allConnectors.length,
    connectors: foldConnectors(allConnectors),
    descriptionCoverage: series.length > 0 ? series[series.length - 1] : null,
    descriptionCoverageDelta:
      series.length > 1 ? series[series.length - 1] - series[0] : null,
    descriptionCoverageSeries: series,
    totalAssets,
    totalDelta: hasBaseline ? totalAssets - sumForDay(totals, oldestDay) : null,
    windowDays,
  };
}

export interface DataEstate {
  figures: Ref<DataEstateFigures>;
  isLoading: Ref<boolean>;
  isError: Ref<boolean>;
  refetch: () => Promise<void>;
}

/**
 * Totals, per-connector split and description coverage for the "Your data
 * estate" card, from the two system charts that already carry them.
 * The coverage figures are computed (asset-weighted, never a plain sum)
 * but NOT rendered this batch: official renders the coverage block only
 * in AI mode and the product has no AI-mode runtime switch.
 * ADR:2026-11-08-my-data-data-estate-coverage
 */
export function useDataEstate(windowDays: Ref<number>): DataEstate {
  const charts = useWidgetLoad(
    computed(() => `data-estate-charts-${windowDays.value}`),
    () => fetchDataEstateCharts(windowDays.value),
    { ttlMs: DATA_ESTATE_TTL_MS },
  );
  // A live count, so no window in the key — the range filter moves the
  // totals delta and the coverage trend, both of which are time series.
  // "How much of the estate is Snowflake" is not.
  const connectors = useWidgetLoad('data-estate-connectors', fetchConnectorBreakdown, {
    ttlMs: DATA_ESTATE_TTL_MS,
  });
  const figures = computed(() =>
    deriveEstate(charts.data.value, connectors.data.value ?? [], windowDays.value),
  );
  return {
    figures,
    isError: computed(() => charts.isError.value || connectors.isError.value),
    isLoading: computed(() => charts.isLoading.value || connectors.isLoading.value),
    refetch: async () => {
      await Promise.all([charts.refetch(), connectors.refetch()]);
    },
  };
}

/**
 * The types the `total_data_assets` chart counts: the Data Insights asset
 * types, less the `tag` and `glossaryTerm` groups the chart excludes and
 * the data-quality types Data Insights reads from their live index rather
 * than indexing. The live fallback counts the same population, so the
 * total does not drop the day the chart starts returning rows.
 */
export const CHART_ASSET_TYPES: ReadonlySet<string> = new Set([
  'table',
  'storedProcedure',
  'databaseSchema',
  'database',
  'chart',
  'dashboard',
  'dashboardDataModel',
  'pipeline',
  'topic',
  'container',
  'searchIndex',
  'mlmodel',
  'dataProduct',
  'metric',
  'apiEndpoint',
]);

export interface AssetTypeCount {
  /** The chart's raw group, e.g. `databaseSchema`. Stable across locales. */
  key: string;
  count: number;
  /** Percentage of the total, 0–100. */
  share: number;
  /** Change across the window; null when the window has no baseline day. */
  delta: number | null;
}

export interface TotalDataAssetsFigures {
  totalAssets: number;
  totalDelta: number | null;
  assetTypes: AssetTypeCount[];
  fastestGrowing?: AssetTypeCount;
  windowDays: number;
}

function countsByGroup(results: ChartResults, day: number): Map<string, number> {
  return results
    .filter((row) => row.day === day)
    .reduce(
      (counts, row) => counts.set(row.group ?? '', (counts.get(row.group ?? '') ?? 0) + (row.count ?? 0)),
      new Map<string, number>(),
    );
}

/** The card's figures from the totals chart — pure. */
export function deriveTotalDataAssets(
  totals: ChartResults,
  windowDays: number,
): TotalDataAssetsFigures {
  const newestDay = latestDay(totals);
  const oldestDay = totals.reduce((oldest, row) => Math.min(oldest, row.day ?? newestDay), newestDay);
  // A single-day window has no baseline to compare against, so report no
  // movement rather than the whole estate's worth of it.
  const hasBaseline = totals.length > 0 && oldestDay !== newestDay;
  const totalAssets = sumForDay(totals, newestDay);
  const baseline = countsByGroup(totals, oldestDay);
  const assetTypes = Array.from(countsByGroup(totals, newestDay).entries())
    .filter(([, count]) => count > 0)
    .map(([group, count]) => ({
      count,
      delta: hasBaseline ? count - (baseline.get(group) ?? 0) : null,
      key: group,
      share: totalAssets > 0 ? (count / totalAssets) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
  const fastestGrowing = assetTypes.reduce<AssetTypeCount | undefined>(
    (fastest, type) => ((type.delta ?? 0) > (fastest?.delta ?? 0) ? type : fastest),
    undefined,
  );
  return {
    assetTypes,
    fastestGrowing,
    totalAssets,
    totalDelta: hasBaseline ? totalAssets - sumForDay(totals, oldestDay) : null,
    windowDays,
  };
}

/**
 * The live split by entity type, from a terms aggregation over the
 * data-asset index. Only the fallback: it has no history, so no type
 * carries a change. Shaped as one chart day so the same derivation reads
 * both sources.
 */
export async function fetchLiveAssetTypes(): Promise<ChartResults> {
  const response = await postAggregateFieldOptions({
    deleted: false,
    fieldName: ENTITY_TYPE_FIELD,
    index: 'dataAsset',
    size: AGGREGATE_PAGE_SIZE_LARGE,
  });
  const buckets = mapAggregateBuckets(response, ENTITY_TYPE_FIELD);
  return buckets
    .filter((bucket) => CHART_ASSET_TYPES.has(bucket.key))
    .map((bucket) => ({ count: bucket.docCount, day: 0, group: bucket.key, term: bucket.key }));
}

export interface TotalDataAssets {
  figures: Ref<TotalDataAssetsFigures>;
  isLoading: Ref<boolean>;
  isError: Ref<boolean>;
  refetch: () => Promise<void>;
}

/**
 * Total assets and their split by asset type for the "Total data assets"
 * card. The `total_data_assets` system chart already groups by entity
 * type, so this reads the same answer "Your data estate" does rather than
 * asking again.
 *
 * Data Insights only has rows once its pipeline has run. Until then the
 * card would read zero above an estate full of assets, so it falls back
 * to a live count by entity type — the same fallback "Your data estate"
 * makes for its total. That second request is only made when the chart
 * comes back empty.
 */
export function useTotalDataAssets(windowDays: Ref<number>): TotalDataAssets {
  const charts = useWidgetLoad(
    computed(() => `data-estate-charts-${windowDays.value}`),
    () => fetchDataEstateCharts(windowDays.value),
    { ttlMs: DATA_ESTATE_TTL_MS },
  );
  const totals = computed(() => charts.data.value?.total_data_assets ?? []);
  const needsLiveCount = computed(() => charts.data.value !== undefined && totals.value.length === 0);
  const liveTypes = useWidgetLoad(
    computed(() => (needsLiveCount.value ? 'live-asset-types' : '')),
    fetchLiveAssetTypes,
    { enabled: needsLiveCount, ttlMs: DATA_ESTATE_TTL_MS },
  );
  const figures = computed(() =>
    deriveTotalDataAssets(
      needsLiveCount.value ? (liveTypes.data.value ?? []) : totals.value,
      windowDays.value,
    ),
  );
  // The fallback's state only counts while the card is reading from it.
  const isLoading = computed(
    () => charts.isLoading.value || (needsLiveCount.value && liveTypes.isLoading.value),
  );
  const isError = computed(
    () => charts.isError.value || (needsLiveCount.value && liveTypes.isError.value),
  );
  return {
    figures,
    isError,
    isLoading,
    refetch: async () => {
      await Promise.all([charts.refetch(), liveTypes.refetch()]);
    },
  };
}
