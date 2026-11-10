/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, type ComputedRef, type Ref } from 'vue';
import { fetchAllKpis, listKpiResults } from '@/api/kpi';
import { useWidgetLoad } from '@/features/home/widgetLoad';
import type { Kpi } from '@/types/kpi';
import type { InsightResultPoint } from '@/api/dataInsights';

/**
 * KPIs with their progress, pace and projection against their own targets
 * — ported from the official framework (`hooks/useKpiProgress.ts`).
 *
 * ADR:2026-11-08-my-data-kpi-progress
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Default window, and the option the card opens on. */
export const KPI_WINDOW_DAYS = 30;
/** Every result the KPI has recorded, i.e. from its own start date. */
export const KPI_ALL_TIME = 'all';
export type KpiWindow = number | typeof KPI_ALL_TIME;
/** Windows the card's range filter offers. */
export const KPI_WINDOW_OPTIONS: KpiWindow[] = [KPI_WINDOW_DAYS, 90, KPI_ALL_TIME];

const TTL_MS = 5 * 60 * 1000;

export type KpiStatus = 'onTrack' | 'atRisk' | 'missed';

export interface KpiProgress {
  id: string;
  name: string;
  fullyQualifiedName: string;
  /** Latest observed value, in the KPI's own units. */
  current: number;
  target: number;
  /** Whether `current` and `target` are percentages or plain counts. */
  metricType: string;
  endDate: number;
  /** Change across the window; null when there is no earlier point. */
  delta: number | null;
  daysLeft: number;
  /**
   * Where the current rate lands by `endDate`. Null when there is nothing to
   * extrapolate from — one data point is a value, not a trend.
   */
  projected: number | null;
  status: KpiStatus;
  /** Value per day, oldest first — the sparkline's footprint. */
  series: number[];
  /** The window the series covers, for the sparkline's axis labels. */
  windowStart: number;
  windowEnd: number;
  /**
   * Days the selected range spans, for the "in the last N days" wording; null
   * on all time, where each KPI is read from its own start date instead.
   */
  windowDays: number | null;
}

export interface KpiOverview {
  kpis: ComputedRef<KpiProgress[]>;
  atRiskCount: ComputedRef<number>;
  /** First load only — a range switch keeps the previous KPIs on screen. */
  isLoading: ComputedRef<boolean>;
  isFetching: ComputedRef<boolean>;
  isError: ComputedRef<boolean>;
  refetch: () => Promise<void>;
}

/**
 * Linear extrapolation of the observed rate to the KPI's end date.
 *
 * This is deliberately client-side arithmetic over data the KPI endpoints
 * already return — no projection field exists on the API, and none is needed.
 *
 * `spanDays` is the distance between the first and last result, not the
 * selected window: a KPI that only started reporting a week into a 30-day
 * window moved its whole delta in that week, and spreading it over thirty
 * days understated the rate and called the KPI at risk.
 */
export function projectValue(series: number[], spanDays: number, daysLeft: number): number | null {
  if (series.length < 2 || spanDays <= 0) {
    return null;
  }
  const first = series[0];
  const last = series[series.length - 1];
  const perDay = (last - first) / spanDays;
  return last + perDay * daysLeft;
}

export function resolveStatus(
  projected: number | null,
  target: number,
  daysLeft: number,
  current: number,
): KpiStatus {
  // The window has closed, so judge the KPI on what it actually reached. The
  // projection is null whenever the series holds a single point, and reading
  // that as a miss reported a finished KPI that had already beaten its target
  // as missed — and counted it in `atRiskCount`.
  if (daysLeft <= 0) {
    return current >= target ? 'onTrack' : 'missed';
  }

  // No trend yet, so there is nothing to call at risk.
  if (projected === null) {
    return 'onTrack';
  }

  return projected >= target ? 'onTrack' : 'atRisk';
}

interface KpiSeries {
  /** Value per day, oldest first. */
  series: number[];
  /** Days between the first and last result — what the rate is measured over. */
  spanDays: number;
}

function seriesFor(results: InsightResultPoint[]): KpiSeries {
  const byDay = new Map<number, number>();
  results.forEach((row) => {
    if (row.day !== undefined && row.count !== undefined) {
      byDay.set(row.day, row.count);
    }
  });
  const days = Array.from(byDay.entries()).sort(([a], [b]) => a - b);
  const spanDays = days.length > 1 ? (days[days.length - 1][0] - days[0][0]) / DAY_MS : 0;
  return { series: days.map(([, value]) => value), spanDays };
}

interface KpiResultWindow {
  /** End of the window actually fetched, not of the current clock. */
  end: number;
  /** The range this answer was fetched for — null on all time. */
  windowDays: number | null;
  /**
   * `start` is per entry, not shared: on "All time" each KPI is read from its
   * own start date, so one global bound could not describe the set.
   */
  entries: Array<{ kpi: Kpi; start: number } & KpiSeries>;
}

/**
 * The KPIs and their results over one window.
 *
 * The window is anchored here, inside the fetch, rather than read from the
 * clock on every render: that keeps every value the hook derives — `daysLeft`,
 * the axis labels, the series — a pure function of the query result.
 *
 * `kpiResult` is a per-KPI endpoint with no bulk form, so one request per KPI
 * is the only shape available; `Promise.all` at least keeps them concurrent.
 */
async function fetchKpiProgress(range: KpiWindow): Promise<KpiResultWindow> {
  const end = Date.now();
  const kpis = await fetchAllKpis();
  const startOf = (kpi: Kpi) =>
    range === KPI_ALL_TIME ? (kpi.startDate ?? end) : end - range * DAY_MS;

  const results = await Promise.all(
    kpis.map((kpi) =>
      listKpiResults(kpi.fullyQualifiedName ?? '', {
        endTs: end,
        startTs: startOf(kpi),
        orderBy: 'ASC',
      }),
    ),
  );

  return {
    end,
    entries: kpis.map((kpi, index) => ({
      kpi,
      ...seriesFor(results[index] ?? []),
      start: startOf(kpi),
    })),
    windowDays: range === KPI_ALL_TIME ? null : range,
  };
}

/** KPIs with their progress, pace and projection against their own targets. */
export function useKpiProgress(
  range: ComputedRef<KpiWindow> | Ref<KpiWindow>,
): KpiOverview {
  const loaded = useWidgetLoad(
    computed(() => `kpi-progress:${String(range.value)}`),
    () => fetchKpiProgress(range.value),
    { ttlMs: TTL_MS },
  );

  const kpis = computed<KpiProgress[]>(() => {
    const data = loaded.data.value;
    const end = data?.end ?? 0;
    return (data?.entries ?? []).map(({ kpi, series, spanDays, start }) => {
      // Measured off the results actually fetched rather than the argument:
      // while a window switch is in flight the series in hand is still the
      // previous window's, and projecting it over the newly selected span
      // would report a rate nobody measured.
      const current = series.length > 0 ? series[series.length - 1] : 0;
      const daysLeft = Math.max(0, Math.ceil(((kpi.endDate ?? 0) - end) / DAY_MS));
      const projected = projectValue(series, spanDays, daysLeft);

      return {
        current,
        daysLeft,
        delta: series.length > 1 ? current - series[0] : null,
        endDate: kpi.endDate ?? 0,
        fullyQualifiedName: kpi.fullyQualifiedName ?? '',
        // `Kpi.id` is optional on the type; the FQN identifies a KPI
        // just as well and is what its results are fetched by.
        id: kpi.id ?? kpi.fullyQualifiedName ?? kpi.name,
        metricType: kpi.metricType ?? 'NUMBER',
        name: kpi.displayName ?? kpi.name,
        projected,
        series,
        status: resolveStatus(projected, kpi.targetValue ?? 0, daysLeft, current),
        target: kpi.targetValue ?? 0,
        windowDays: data?.windowDays ?? null,
        windowEnd: end,
        windowStart: start,
      };
    });
  });

  return {
    atRiskCount: computed(() => kpis.value.filter((kpi) => kpi.status !== 'onTrack').length),
    isError: loaded.isError,
    isFetching: loaded.isFetching,
    isLoading: loaded.isLoading,
    kpis,
    refetch: loaded.refetch,
  };
}
