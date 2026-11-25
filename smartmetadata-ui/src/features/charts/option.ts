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
import type { ChartKind, ChartSeries } from './types';
import { formatChartAxisDate, formatChartTooltipDate } from './series';

const COLORS = [...SM_CHART_COLORS];

interface AxisTooltipParam {
  axisValue?: unknown;
  marker?: string;
  seriesName?: string;
  value?: unknown;
}

function escapeTooltipHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * ECharts' default value rendering (makeValueReadable in echarts 6):
 * a finite number keeps full precision with a thousands separator
 * (52.4271844601942 stays, 1187 becomes "1,187"); anything else is
 * shown as-is when it is a non-blank string, "-" otherwise.
 */
function readableTooltipValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const [whole, fraction] = String(value).split('.');
    const grouped = (whole ?? '').replace(/(\d{1,3})(?=(?:\d{3})+(?!\d))/g, '$1,');
    return fraction === undefined ? grouped : `${grouped}.${fraction}`;
  }
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  return '-';
}

/**
 * Pin DataInsightChartUtils.tsx:104: the tooltip header is formatDate(...)
 * ("Nov 22, 2026"); the value rows are NOT reformatted here — that is
 * #343 P1-3's getEntryFormattedValue range (round 2, %, startCase).
 * This formatter only swaps the header and replays ECharts' default
 * rows (marker + series name + value), so the values render exactly
 * as the default tooltip would until P1-3 replaces it.
 */
function axisTooltipFormatter(params: AxisTooltipParam | AxisTooltipParam[]): string {
  const items = Array.isArray(params) ? params : [params];
  const header = formatChartTooltipDate(String(items[0]?.axisValue ?? ''));
  const rows = items
    .map(
      (item) =>
        `<div>${item.marker ?? ''}<span style="margin-left:2px">${escapeTooltipHtml(String(item.seriesName ?? ''))}</span><span style="float:right;margin-left:20px">${escapeTooltipHtml(readableTooltipValue(item.value))}</span><div style="clear:both"></div></div>`,
    )
    .join('');
  return `${header}${rows}`;
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
    tooltip: { trigger: 'axis', formatter: axisTooltipFormatter },
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
      name: item.name,
      smooth: kind === 'line' || kind === 'area',
      ...(kind === 'area' ? { areaStyle: {} } : {}),
      // Pin getDataInsightLineSeries always sends lineStyle.opacity:
      // ECharts deep-merges a series that keeps its id, so an omitted
      // opacity would leave the previous dimmed value in place.
      ...(options.dimmedNames
        ? { lineStyle: { opacity: options.dimmedNames.has(item.name) ? 0.3 : 1 } }
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
