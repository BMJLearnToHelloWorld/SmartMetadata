/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { listGlossaryTerms } from '@/api/glossaryTerms';
import {
  DQ_COVERED_ASSETS_AGGREGATION,
  DQ_DIMENSION_STATUS_AGGREGATION,
  DQ_STATUS_AGGREGATION,
  DQ_TABLE_INDEX,
  DQ_TEST_CASE_INDEX,
  DQ_TOTAL_TABLES_AGGREGATION,
  getDataQualityReportBatch,
  type DataQualityReportRow,
} from '@/api/dataQualityReports';
import { searchAssets } from '@/api/search';
import { formatChartTs } from '@/features/charts/series';
import type { ChartPoint } from '@/features/charts/types';
import {
  DQ_DIMENSION_FIELD,
  cardinalityFromReportRows,
  coverageFrom,
  dimensionCardsFromReportRows,
  dqChartMustForValues,
  dqMustForOwner,
  dqMustForTags,
  dqShouldTerm,
  dqTableMustForValues,
  facetOptions,
  statusCountsFromReportRows,
  type CoverageCounts,
  type DimensionCard,
  type DqEsClause,
  type DqMultiFilters,
  type DqTimeRange,
  type HealthCounts,
  type StatusCounts,
} from '@/quality/landing';

/**
 * Shared DataQualityDashboard data layer (pin
 * components/DataQuality/DataQualityDashboard/DataQualityDashboard.component.tsx
 * + DqDashboardSectionContent.component.tsx + rest/dataQualityDashboardAPI.ts).
 *
 * The dashboard is the single consumer of these builders/fetchers; the
 * landing view reuses the aggregation batch through
 * fetchDqDashboardAggregations (its list-derived health and its
 * filter-residual notes are unchanged). No second copy of the batch
 * exists: the landing view's loadAggregations calls this module.
 *
 * Filter model, per the pin interface
 * (DataQualityDashboard.interface.ts: DqDashboardChartFilters):
 * multi-valued facet filters plus a date range. The component's filter
 * bar is multi-select per facet (pin FilterSelectDropdown /
 * GlossaryTermPicker / UserTeamSelectableList parity) and the date
 * range is a RangePicker defaulting to the last 30 days (pin
 * DatePickerMenu / defaultRange parity). Owner is the one exception:
 * pin's handleOwnerChange takes only owners[0] into the singular
 * ownerFqn, so the product does the same — the owner dropdown is
 * multi-select, the query carries the first pick.
 *
 * Glossary terms merge into the tags clause, pin-hook parity
 * (useDataQualityDashboardFilters defaultFilters: tags =
 * [...chartFilter.tags, ...chartFilter.glossaryTerms]). The landing
 * view's DqGovernanceFilters.glossaryTerm stays out of ITS query
 * builders (documented there: no official builder counterpart) — the
 * merge lives here, at the hook layer, exactly where pin puts it, so a
 * term tab's initialFilters {glossaryTerms: [termFqn]} actually scopes
 * the charts instead of rendering unfiltered data.
 */
export type DqHiddenFilter =
  | 'owner'
  | 'tier'
  | 'certification'
  | 'tags'
  | 'glossaryTerms'
  | 'dataProducts';

export const DQ_HIDDEN_FILTERS: DqHiddenFilter[] = [
  'owner',
  'tier',
  'certification',
  'tags',
  'glossaryTerms',
  'dataProducts',
];

export interface DqDashboardChartFilters {
  ownerFqn?: string;
  glossaryTerms?: string[];
  tags?: string[];
  tier?: string[];
  certification?: string[];
  dataProductFqns?: string[];
  startTs?: number;
  endTs?: number;
  entityFQN?: string;
  domainFqn?: string;
}

/** Test case statuses of the three test-case-status area charts. */
export const DQ_TEST_CASE_STATUSES = ['Success', 'Aborted', 'Failed'] as const;
export type DqTestCaseStatus = (typeof DQ_TEST_CASE_STATUSES)[number];

/** Incident status types of the two incident-count area charts (pin TestCaseResolutionStatusTypes). */
export const DQ_INCIDENT_STATUSES = ['New', 'Resolved'] as const;
export type DqIncidentStatus = (typeof DQ_INCIDENT_STATUSES)[number];

/** Incident time metric types (pin IncidentTimeMetricsType). */
export const DQ_INCIDENT_TIME_METRICS = ['timeToResponse', 'timeToResolution'] as const;
export type DqIncidentTimeMetric = (typeof DQ_INCIDENT_TIME_METRICS)[number];

/** Pin-verbatim aggregation queries (rest/dataQualityDashboardAPI.ts). */
export const DQ_TEST_CASE_STATUS_BY_DAYS_AGGREGATION =
  'bucketName=byDay:aggType=date_histogram:field=timestamp&calendar_interval=day,bucketName=newIncidents:aggType=cardinality:field=testCase.fullyQualifiedName';
export const DQ_INCIDENT_COUNT_BY_DAYS_AGGREGATION =
  'bucketName=byDay:aggType=date_histogram:field=timestamp&calendar_interval=day,bucketName=newIncidents:aggType=cardinality:field=stateId';
export const DQ_INCIDENT_TIME_METRICS_AGGREGATION =
  'bucketName=byDay:aggType=date_histogram:field=timestamp&calendar_interval=day,bucketName=metrics:aggType=nested:path=metrics,bucketName=byName:aggType=terms:field=metrics.name.keyword,bucketName=avgValue:aggType=avg:field=metrics.value';

export const DQ_TEST_CASE_RESULT_INDEX = 'testCaseResult';
export const DQ_TEST_CASE_RESOLUTION_STATUS_INDEX = 'testCaseResolutionStatus';

/** Unhealthy split for the health pie (pin fetchEntityCoveredWithDQ(unhealthy=true)). */
export const DQ_UNHEALTHY_STATUSES = ['Failed', 'Aborted'] as const;

export function visibleDqFilters(hiddenFilters: DqHiddenFilter[]): DqHiddenFilter[] {
  return DQ_HIDDEN_FILTERS.filter((key) => !hiddenFilters.includes(key));
}

export function dqDashboardMultiFilters(filters: DqDashboardChartFilters): DqMultiFilters {
  const tags = [...(filters.tags ?? []), ...(filters.glossaryTerms ?? [])];
  return {
    owner: filters.ownerFqn,
    tags: tags.length ? tags : undefined,
    tier: filters.tier,
    certification: filters.certification,
    dataProducts: filters.dataProductFqns,
  };
}

export function buildDqDashboardChartQuery(
  filters: DqDashboardChartFilters,
  range?: DqTimeRange,
  options?: { unhealthy?: boolean },
): string {
  return JSON.stringify({
    query: {
      bool: {
        must: dqChartMustForValues(dqDashboardMultiFilters(filters), range, {
          unhealthy: options?.unhealthy,
          entityFQN: filters.entityFQN,
        }),
      },
    },
  });
}

export function buildDqDashboardTableQuery(filters: DqDashboardChartFilters): string {
  return JSON.stringify({
    query: {
      bool: {
        must: dqTableMustForValues(dqDashboardMultiFilters(filters), {
          entityFQN: filters.entityFQN,
        }),
      },
    },
  });
}

export function buildDqDashboardNoDimensionQuery(
  filters: DqDashboardChartFilters,
  range?: DqTimeRange,
): string {
  return JSON.stringify({
    query: {
      bool: {
        must: dqChartMustForValues(dqDashboardMultiFilters(filters), range, {
          entityFQN: filters.entityFQN,
        }),
        must_not: [{ exists: { field: DQ_DIMENSION_FIELD } }],
      },
    },
  });
}

/**
 * Drill-down target of a dashboard chart, pin getTestCaseListPath parity
 * (DataQualityPureUtils.ts:968-1002): the clicked slice (status or
 * dimension) plus the dashboard's current filter slice — tags (glossary
 * terms already merged in, pin hook defaultFilters), first tier / data
 * product, table FQN and the date range. Pin also wraps the range as a
 * lastRunRange {startTs, endTs, key, title} object for its Last Run
 * control; the product list reads plain startTs/endTs epoch millis, so
 * the range rides as two scalars. Owner is deliberately absent: pin's
 * path carries no owner either.
 */
export interface DqTestCaseListDrill {
  testCaseStatus?: DqTestCaseStatus;
  dataQualityDimension?: string;
}

export function buildDqTestCaseListQuery(
  filters: DqDashboardChartFilters,
  drill?: DqTestCaseListDrill,
): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  if (drill?.testCaseStatus) {
    query.testCaseStatus = drill.testCaseStatus;
  }
  if (drill?.dataQualityDimension) {
    query.dataQualityDimension = drill.dataQualityDimension;
  }
  const tags = dqDashboardMultiFilters(filters).tags;
  if (tags?.length) {
    query.tags = tags;
  }
  const tier = filters.tier?.[0];
  if (tier) {
    query.tier = tier;
  }
  const dataProductFqn = filters.dataProductFqns?.[0];
  if (dataProductFqn) {
    query.dataProductFqn = dataProductFqn;
  }
  if (filters.entityFQN?.trim()) {
    query.tableFqn = filters.entityFQN;
  }
  if (filters.startTs && filters.endTs) {
    query.startTs = String(filters.startTs);
    query.endTs = String(filters.endTs);
  }
  return query;
}

/**
 * Must filters for the testCaseResult / testCaseResolutionStatus
 * indexes (pin fetchTestCaseStatusMetricsByDays /
 * fetchCountOfIncidentStatusTypeByDays / fetchIncidentTimeMetrics):
 * owner/tags/tier/dataProducts under the `testCase.` prefix, and —
 * exactly as in pin — no certification clause and no `deleted` clause.
 * The entity FQN rides only on the test-case-status route
 * (`includeEntityFQN`, pin fetchTestCaseStatusMetricsByDays:
 * `testCase.entityFQN`, or `${entityType}.fullyQualifiedName.keyword`
 * when pin has an entityType — the lane carries no entityType, so it
 * uses the plain `testCase.entityFQN` form); the two incident fetchers
 * never carry it, so their callers leave the option off.
 */
export function dqTimeSeriesMustFilters(
  filters: DqDashboardChartFilters,
  options?: { includeEntityFQN?: boolean },
): DqEsClause[] {
  const must: DqEsClause[] = [];
  const values = dqDashboardMultiFilters(filters);
  if (values.owner?.trim()) {
    must.push(dqMustForOwner(values.owner, 'testCase'));
  }
  const tags = (values.tags ?? []).map((value) => value.trim()).filter(Boolean);
  if (tags.length) {
    must.push(dqMustForTags(tags, 'testCase'));
  }
  const tier = (values.tier ?? []).map((value) => value.trim()).filter(Boolean);
  if (tier.length) {
    must.push(dqShouldTerm('testCase.tier.tagFQN', tier));
  }
  const dataProducts = (values.dataProducts ?? []).map((value) => value.trim()).filter(Boolean);
  if (dataProducts.length) {
    must.push(dqShouldTerm('testCase.dataProducts.fullyQualifiedName', dataProducts));
  }
  if (options?.includeEntityFQN && filters.entityFQN?.trim()) {
    must.push({ term: { 'testCase.entityFQN': filters.entityFQN } });
  }
  return must;
}

function dqTimestampRangeClause(range?: DqTimeRange): DqEsClause | undefined {
  if (!range?.startTs || !range?.endTs) {
    return undefined;
  }
  return { range: { timestamp: { gte: range.startTs, lte: range.endTs } } };
}

export function buildDqTestCaseStatusByDaysQuery(
  filters: DqDashboardChartFilters,
  status: DqTestCaseStatus,
  range?: DqTimeRange,
): string {
  const rangeClause = dqTimestampRangeClause(range);
  return JSON.stringify({
    query: {
      bool: {
        must: [
          { term: { testCaseStatus: status } },
          ...(rangeClause ? [rangeClause] : []),
          ...dqTimeSeriesMustFilters(filters, { includeEntityFQN: true }),
        ],
      },
    },
  });
}

export function buildDqIncidentCountByDaysQuery(
  filters: DqDashboardChartFilters,
  statusType: DqIncidentStatus,
  range?: DqTimeRange,
): string {
  const rangeClause = dqTimestampRangeClause(range);
  return JSON.stringify({
    query: {
      bool: {
        must: [
          { term: { testCaseResolutionStatusType: statusType } },
          ...(rangeClause ? [rangeClause] : []),
          ...dqTimeSeriesMustFilters(filters),
        ],
      },
    },
  });
}

export function buildDqIncidentTimeQuery(
  filters: DqDashboardChartFilters,
  metricType: DqIncidentTimeMetric,
  range?: DqTimeRange,
): string {
  const rangeClause = dqTimestampRangeClause(range);
  return JSON.stringify({
    query: {
      bool: {
        must: [
          ...(rangeClause ? [rangeClause] : []),
          {
            nested: {
              path: 'metrics',
              query: {
                bool: {
                  must: [{ match: { 'metrics.name.keyword': metricType } }],
                },
              },
            },
          },
          ...dqTimeSeriesMustFilters(filters),
        ],
      },
    },
  });
}

export interface DqDashboardAggregations {
  results: StatusCounts | null;
  dimensions: DimensionCard[];
  coverage: CoverageCounts | null;
  health: HealthCounts | null;
}

/**
 * Health from the covered / unhealthy-covered cardinalities, pin
 * EntityHealthStatusPieChartWidget parity (healthy = total - unhealthy).
 * A missing unhealthy row means no unhealthy assets were bucketed, so
 * it counts as 0 rather than voiding the pie; a missing covered row
 * means the batch has no coverage data at all, so health is null.
 * Intentional deviation from pin, fixing a pin bug: pin returns
 * INITIAL_ENTITY_HEALTH_MATRIX ({healthy: 0, unhealthy: 0, total: 0})
 * when either side is empty (EntityHealthStatusPieChartWidget
 * .component.tsx:47-53; constants/profiler.constant.ts:276-280), so a
 * fully healthy scope — covered known, nothing unhealthy bucketed —
 * renders as a total-0 pie: pin mistakes "zero unhealthy assets" for
 * "no data". The lane instead reports {healthy: covered, unhealthy: 0,
 * total: covered} and shows a healthy=N pie. The two do NOT agree on
 * screen in that case; the lane reading is the correct one.
 */
export function healthFromCoveredCounts(
  covered: number | undefined,
  unhealthyCovered: number | undefined,
): HealthCounts | null {
  if (covered === undefined) {
    return null;
  }
  const unhealthy = Math.max(0, unhealthyCovered ?? 0);
  const total = Math.max(covered, unhealthy);
  return { healthy: Math.max(0, total - unhealthy), unhealthy, total };
}

function domainOf(filters: DqDashboardChartFilters): string | undefined {
  return filters.domainFqn;
}

/**
 * The six-item aggregation batch: status, dimensions (+ no-dimension),
 * coverage, unhealthy-covered (health pie), total tables. One POST,
 * shared by the dashboard and the landing view — the landing view
 * ignores `health` and keeps its list-derived health plus its
 * residual note. `totalTablesFallback` is the landing view's facet
 * table count, used only when the batch's totalTables cardinality
 * comes back without rows; the dashboard passes none.
 */
export async function fetchDqDashboardAggregations(
  filters: DqDashboardChartFilters,
  range?: DqTimeRange,
  options?: { totalTablesFallback?: number },
): Promise<DqDashboardAggregations> {
  const reports = await getDataQualityReportBatch([
    { key: 'status', index: DQ_TEST_CASE_INDEX, aggregationQuery: DQ_STATUS_AGGREGATION, q: buildDqDashboardChartQuery(filters, range), domain: domainOf(filters) },
    { key: 'dimensionStatus', index: DQ_TEST_CASE_INDEX, aggregationQuery: DQ_DIMENSION_STATUS_AGGREGATION, q: buildDqDashboardChartQuery(filters, range), domain: domainOf(filters) },
    { key: 'noDimensionStatus', index: DQ_TEST_CASE_INDEX, aggregationQuery: DQ_STATUS_AGGREGATION, q: buildDqDashboardNoDimensionQuery(filters, range), domain: domainOf(filters) },
    { key: 'covered', index: DQ_TEST_CASE_INDEX, aggregationQuery: DQ_COVERED_ASSETS_AGGREGATION, q: buildDqDashboardChartQuery(filters, range), domain: domainOf(filters) },
    { key: 'unhealthyCovered', index: DQ_TEST_CASE_INDEX, aggregationQuery: DQ_COVERED_ASSETS_AGGREGATION, q: buildDqDashboardChartQuery(filters, range, { unhealthy: true }), domain: domainOf(filters) },
    { key: 'totalTables', index: DQ_TABLE_INDEX, aggregationQuery: DQ_TOTAL_TABLES_AGGREGATION, q: buildDqDashboardTableQuery(filters), domain: domainOf(filters) },
  ]);
  const status = statusCountsFromReportRows(reports.get('status')?.data ?? []);
  const results = status.total ? status : null;
  const dimensions = dimensionCardsFromReportRows([
    ...(reports.get('dimensionStatus')?.data ?? []),
    ...(reports.get('noDimensionStatus')?.data ?? []),
  ]);
  const covered = cardinalityFromReportRows(reports.get('covered')?.data ?? [], 'originEntityFQN');
  const unhealthyCovered = cardinalityFromReportRows(
    reports.get('unhealthyCovered')?.data ?? [],
    'originEntityFQN',
  );
  const totalTables =
    cardinalityFromReportRows(reports.get('totalTables')?.data ?? [], 'fullyQualifiedName') ??
    options?.totalTablesFallback;
  return {
    results,
    dimensions,
    coverage: coverageFrom(covered, totalTables),
    health: healthFromCoveredCounts(covered, unhealthyCovered),
  };
}

/**
 * Date-histogram rows to daily chart points, pin widget parity
 * (TestCaseStatusAreaChartWidget / IncidentTypeAreaChartWidget /
 * IncidentTimeChartWidget all map `{timestamp, count}` and sort
 * ascending — buckets are not guaranteed to arrive ordered). Rows
 * without a finite timestamp or value are dropped; a null metric
 * value (pin skips `metrics.value === null`) drops the same way.
 * One point per day survives (last wins), matching the existing
 * profilesToRowCountPoints precedent.
 */
export function timeSeriesPointsFromReportRows(
  rows: DataQualityReportRow[],
  valueField: string,
): ChartPoint[] {
  const byDay = new Map<string, { ts: number; value: number }>();
  for (const row of rows) {
    const raw = row[valueField];
    if (raw === undefined || raw === '') {
      continue;
    }
    const ts = Number(row.timestamp);
    const value = Number(raw);
    if (!Number.isFinite(ts) || !Number.isFinite(value)) {
      continue;
    }
    const label = formatChartTs(ts);
    if (!label) {
      continue;
    }
    byDay.set(label, { ts, value });
  }
  return [...byDay.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([label, item]) => ({ label, value: item.value }));
}

export interface DqDashboardTimeSeries {
  statusByDay: Record<DqTestCaseStatus, ChartPoint[]>;
  incidentsByDay: Record<'open' | 'resolved', ChartPoint[]>;
  incidentTime: Record<'response' | 'resolution', ChartPoint[]>;
}

/** The seven-item time-series batch behind the status + incident sections. */
export async function fetchDqDashboardTimeSeries(
  filters: DqDashboardChartFilters,
  range?: DqTimeRange,
): Promise<DqDashboardTimeSeries> {
  const reports = await getDataQualityReportBatch([
    { key: 'statusSuccess', index: DQ_TEST_CASE_RESULT_INDEX, aggregationQuery: DQ_TEST_CASE_STATUS_BY_DAYS_AGGREGATION, q: buildDqTestCaseStatusByDaysQuery(filters, 'Success', range), domain: domainOf(filters) },
    { key: 'statusAborted', index: DQ_TEST_CASE_RESULT_INDEX, aggregationQuery: DQ_TEST_CASE_STATUS_BY_DAYS_AGGREGATION, q: buildDqTestCaseStatusByDaysQuery(filters, 'Aborted', range), domain: domainOf(filters) },
    { key: 'statusFailed', index: DQ_TEST_CASE_RESULT_INDEX, aggregationQuery: DQ_TEST_CASE_STATUS_BY_DAYS_AGGREGATION, q: buildDqTestCaseStatusByDaysQuery(filters, 'Failed', range), domain: domainOf(filters) },
    { key: 'incidentsOpen', index: DQ_TEST_CASE_RESOLUTION_STATUS_INDEX, aggregationQuery: DQ_INCIDENT_COUNT_BY_DAYS_AGGREGATION, q: buildDqIncidentCountByDaysQuery(filters, 'New', range), domain: domainOf(filters) },
    { key: 'incidentsResolved', index: DQ_TEST_CASE_RESOLUTION_STATUS_INDEX, aggregationQuery: DQ_INCIDENT_COUNT_BY_DAYS_AGGREGATION, q: buildDqIncidentCountByDaysQuery(filters, 'Resolved', range), domain: domainOf(filters) },
    { key: 'timeResponse', index: DQ_TEST_CASE_RESOLUTION_STATUS_INDEX, aggregationQuery: DQ_INCIDENT_TIME_METRICS_AGGREGATION, q: buildDqIncidentTimeQuery(filters, 'timeToResponse', range), domain: domainOf(filters) },
    { key: 'timeResolution', index: DQ_TEST_CASE_RESOLUTION_STATUS_INDEX, aggregationQuery: DQ_INCIDENT_TIME_METRICS_AGGREGATION, q: buildDqIncidentTimeQuery(filters, 'timeToResolution', range), domain: domainOf(filters) },
  ]);
  return {
    statusByDay: {
      Success: timeSeriesPointsFromReportRows(reports.get('statusSuccess')?.data ?? [], 'testCase.fullyQualifiedName'),
      Aborted: timeSeriesPointsFromReportRows(reports.get('statusAborted')?.data ?? [], 'testCase.fullyQualifiedName'),
      Failed: timeSeriesPointsFromReportRows(reports.get('statusFailed')?.data ?? [], 'testCase.fullyQualifiedName'),
    },
    incidentsByDay: {
      open: timeSeriesPointsFromReportRows(reports.get('incidentsOpen')?.data ?? [], 'stateId'),
      resolved: timeSeriesPointsFromReportRows(reports.get('incidentsResolved')?.data ?? [], 'stateId'),
    },
    incidentTime: {
      response: timeSeriesPointsFromReportRows(reports.get('timeResponse')?.data ?? [], 'metrics.value'),
      resolution: timeSeriesPointsFromReportRows(reports.get('timeResolution')?.data ?? [], 'metrics.value'),
    },
  };
}

/** Multi-select filter state for the component's filter bar. */
export interface DqDashboardFilterState {
  owner: string[];
  tier: string[];
  certification: string[];
  tag: string[];
  glossaryTerm: string[];
  dataProduct: string[];
}

/** initialFilters arrays seed the state in full (multi-select bar). */
export function initialDqFilterState(
  initialFilters?: DqDashboardChartFilters,
): DqDashboardFilterState {
  return {
    owner: initialFilters?.ownerFqn ? [initialFilters.ownerFqn] : [],
    tier: [...(initialFilters?.tier ?? [])],
    certification: [...(initialFilters?.certification ?? [])],
    tag: [...(initialFilters?.tags ?? [])],
    glossaryTerm: [...(initialFilters?.glossaryTerms ?? [])],
    dataProduct: [...(initialFilters?.dataProductFqns ?? [])],
  };
}

export function filterStateToChartFilters(
  state: DqDashboardFilterState,
  range: DqTimeRange,
  extra?: Pick<DqDashboardChartFilters, 'entityFQN' | 'domainFqn'>,
): DqDashboardChartFilters {
  return {
    // Pin handleOwnerChange parity: the owner picker is multi-select
    // but the singular ownerFqn carries only the first pick.
    ownerFqn: state.owner[0],
    tags: state.tag.length ? [...state.tag] : undefined,
    tier: state.tier.length ? [...state.tier] : undefined,
    certification: state.certification.length ? [...state.certification] : undefined,
    glossaryTerms: state.glossaryTerm.length ? [...state.glossaryTerm] : undefined,
    dataProductFqns: state.dataProduct.length ? [...state.dataProduct] : undefined,
    startTs: range.startTs,
    endTs: range.endTs,
    entityFQN: extra?.entityFQN,
    domainFqn: extra?.domainFqn,
  };
}

export interface DqDashboardFilterOptions {
  owner: Array<{ value: string; label: string }>;
  tier: Array<{ value: string; label: string }>;
  certification: Array<{ value: string; label: string }>;
  tag: Array<{ value: string; label: string }>;
  glossaryTerm: Array<{ value: string; label: string }>;
  dataProduct: Array<{ value: string; label: string }>;
}

/**
 * Filter-bar options, landing-view precedent: one search for the
 * facet buckets plus the glossary-term list (only when the glossary
 * filter is visible — hidden facets never trigger their loads).
 */
export async function fetchDqDashboardFilterOptions(
  includeGlossaryTerms: boolean,
): Promise<DqDashboardFilterOptions> {
  const [searchPage, glossaryPage] = await Promise.all([
    searchAssets('*', 0, 1),
    includeGlossaryTerms
      ? listGlossaryTerms({ limit: 50 })
      : Promise.resolve({ data: [] as Array<{ fullyQualifiedName?: string; name: string; displayName?: string }> }),
  ]);
  const facets = searchPage.facets ?? [];
  return {
    owner: facetOptions(facets, 'owner'),
    tier: facetOptions(facets, 'tier'),
    certification: facetOptions(facets, 'certification'),
    tag: facetOptions(facets, 'tagFqn'),
    glossaryTerm: (glossaryPage.data ?? []).map((term) => ({
      value: term.fullyQualifiedName || term.name,
      label: term.displayName || term.name,
    })),
    dataProduct: facetOptions(facets, 'dataProduct'),
  };
}
