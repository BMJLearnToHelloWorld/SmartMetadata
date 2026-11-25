/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { SM_CHART_COLORS, SM_FONT_FAMILY } from '@/theme/tokens';
import { formatMediumDate } from '@/utils/dates';
import { startCase } from '@/utils/text';
import type { ChartKind, ChartSeries } from './types';
import { formatChartAxisDate } from './series';

const COLORS = [...SM_CHART_COLORS];

/**
 * Pin `getEntryFormattedValue` (utils/DataInsightPureUtils.ts:22-40):
 * integers as-is, non-integers rounded to 2, a `%` suffix on percentage
 * graphs, `''` for an absent value.
 */
export function formatInsightTooltipValue(value: number | string | null | undefined, isPercentage: boolean): string {
  if (value === null || value === undefined) {
    return '';
  }
  const suffix = isPercentage ? '%' : '';
  if (typeof value === 'string') {
    return `${value}${suffix}`;
  }
  if (Number.isInteger(value)) {
    return `${value}${suffix}`;
  }
  return `${Math.round(value * 100) / 100}${suffix}`;
}

export interface InsightTooltipParam {
  /** Axis value: the ISO `YYYY-MM-DD` day label. */
  axisValue?: string | number;
  seriesName?: string;
  value?: number | string | null;
  /** ECharts' coloured marker HTML for the series. */
  marker?: string;
  color?: string;
}

/**
 * Pin `getDataInsightTooltip` (utils/DataInsightChartUtils.tsx:92-110)
 * + `DQTooltipContent` / `chartTooltipRows`
 * (utils/DataQuality/CustomDQTooltip.component.tsx:44-96): the header is
 * `formatDate` (DATE_MED, "Nov 22, 2026"), each row shows the series
 * name through `startCase` with its colour marker and the formatted
 * value, and rows with a null value are dropped.
 */
export function formatInsightTooltip(
  params: InsightTooltipParam | InsightTooltipParam[],
  options: { isPercentage?: boolean; locale?: string } = {},
): string {
  const items = Array.isArray(params) ? params : [params];
  const header = formatMediumDate(items[0]?.axisValue ?? '', options.locale);
  const rows = items
    .filter((item) => item.value !== null && item.value !== undefined)
    .map((item) => {
      const marker =
        item.marker ??
        `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${item.color ?? 'transparent'}"></span>`;
      return `<div style="display:flex;justify-content:space-between;gap:24px;line-height:20px;"><span>${marker} ${startCase(item.seriesName ?? '')}</span><span style="font-weight:500">${formatInsightTooltipValue(item.value, options.isPercentage ?? false)}</span></div>`;
    })
    .join('');
  return `<div><div style="font-weight:500;font-size:12px;line-height:18px;">${header}</div><div style="border-top:1px dashed;margin:8px 0;"></div>${rows}</div>`;
}

/**
 * Optional palette override. DataInsight categorical charts pass
 * SM_DATA_INSIGHT_COLORS; every other chart keeps the global palette,
 * so a DataInsight-only change never recolours profiler/quality charts.
 *
 * `hideLegend` is the official DataInsightChartCard behaviour
 * (DataInsightChartUtils.tsx HIDDEN_CHART_LEGEND = { show: false }):
 * the card title names the chart and the side panel is the legend, so
 * the built-in one stays off. `dimmedNames` is the same card's hover
 * behaviour: the hovered series stays at full opacity and every other
 * visible series drops to HOVER_CHART_OPACITY (0.3).
 */
export function buildChartOption(
  kind: ChartKind,
  series: ChartSeries[],
  colors: readonly string[] = COLORS,
  options: {
    hideLegend?: boolean;
    dimmedNames?: ReadonlySet<string>;
    /**
    /**
     * Pin `getDataInsightTooltip`: a custom axis tooltip (DATE_MED
     * header, startCase series names, formatted values). Only the
     * DataInsight card passes this; every other chart keeps the
     * default ECharts tooltip.
     */
    tooltip?: { isPercentage?: boolean; locale?: string };
    /**
     * Pin DataInsightChartCard.tsx:600-608 + ChartUtils.tsx:21-23:
     * percentage graphs render the y-axis ticks as `${value}%`
     * (axisTickFormatter(value, '%')). Only the four percentage cards
     * pass this; total/tier cards keep bare ticks.
     */
    percentageYAxis?: boolean;
  } = {},
): Record<string, unknown> {
  const palette = [...colors];
  if (kind === 'donut') {
    const points = series[0]?.points ?? [];
    return {
      color: palette,
      textStyle: { fontFamily: SM_FONT_FAMILY },
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, type: 'scroll' },
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          avoidLabelOverlap: true,
          // Pin pie.ts (ui-core-components charts/options/pie.ts):
          // slice labels are off unless showLabels is passed, and when
          // shown they render only the percentage — the slice names live
          // in the legend. ECharts' default outside name labels collide
          // once a donut has 8+ slices (DataAssets "Assets by type").
          label: { show: false },
          labelLine: { show: false },
          data: points.map((point) => ({ name: point.label, value: point.value })),
        },
      ],
    };
  }

  const labels = [...new Set(series.flatMap((item) => item.points.map((point) => point.label)))];
  // 'area' is the pin CustomAreaChart shape: a smooth line with the
  // area beneath it filled. It reuses the registered LineChart, so no
  // extra echarts registration is needed.
  const echartsKind = kind === 'area' ? 'line' : kind;
  return {
    color: palette,
    textStyle: { fontFamily: SM_FONT_FAMILY },
    tooltip: options.tooltip
      ? {
          trigger: 'axis',
          formatter: (params: InsightTooltipParam | InsightTooltipParam[]) =>
            formatInsightTooltip(params, options.tooltip),
        }
      : { trigger: 'axis' },
    legend: options.hideLegend
      ? { show: false }
      : series.length > 1
        ? { bottom: 0 }
        : undefined,
    grid: { left: 48, right: 16, top: 24, bottom: series.length > 1 && !options.hideLegend ? 52 : 28, containLabel: true },
    // Pin DataInsightChartCard.tsx:593-598: the x-axis formatter is
    // customFormatDateTime(value, 'MMM dd') — "Nov 19". The ISO date
    // stays the internal key; only the tick label is reformatted.
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { hideOverlap: true, formatter: (value: string | number) => formatChartAxisDate(String(value)) },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      ...(options.percentageYAxis
        ? { axisLabel: { formatter: (value: number) => `${value}%` } }
        : {}),
    },
    series: series.map((item) => ({
      type: echartsKind,
      // Pin getDataInsightLineSeries `key`: the fixed series identity,
      // so a merged setOption never leaves a stale series behind when
      // the visible set changes (hover + filter).
      id: item.name,
      name: item.name,
      smooth: kind === 'line' || kind === 'area',
      ...(kind === 'area' ? { areaStyle: {} } : {}),
      // Pin dataInsightColor: a series with a rank-fixed colour keeps
      // it however the visible array is reordered (hover preview after
      // a filter must stay its rank colour, not the colour of its
      // current index). Without one, the palette-by-index fallback
      // applies as before.
      ...(item.color ? { itemStyle: { color: item.color } } : {}),
      // Pin getDataInsightLineSeries always sends lineStyle.opacity:
      // ECharts deep-merges a series that keeps its id, so an omitted
      // opacity would leave the previous dimmed value in place.
      ...(options.dimmedNames || item.color
        ? {
            lineStyle: {
              ...(item.color ? { color: item.color } : {}),
              ...(options.dimmedNames
                ? { opacity: options.dimmedNames.has(item.name) ? 0.3 : 1 }
                : {}),
            },
          }
        : {}),
      // Pin DataInsightChartCard.tsx:396-413: a series missing a day
      // simply has no key for it — the gap stays a gap, never a 0.
      // ECharts' default connectNulls is false (echarts 6 line defaults),
      // so a null breaks the line instead of joining across it; no
      // connectNulls is set here on purpose (only pin's KPIChart opts
      // into connectNulls: true). The tooltip renders a null row as '-'
      // until #343 P1-3's formatter drops null rows outright.
      data: labels.map((label) => item.points.find((point) => point.label === label)?.value ?? null),
    })),
  };
}
