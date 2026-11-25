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

const COLORS = [...SM_CHART_COLORS];

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
  options: { hideLegend?: boolean; dimmedNames?: ReadonlySet<string> } = {},
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
    tooltip: { trigger: 'axis' },
    legend: options.hideLegend
      ? { show: false }
      : series.length > 1
        ? { bottom: 0 }
        : undefined,
    grid: { left: 48, right: 16, top: 24, bottom: series.length > 1 && !options.hideLegend ? 52 : 28, containLabel: true },
    xAxis: { type: 'category', data: labels, axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', minInterval: 1 },
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
      data: labels.map((label) => item.points.find((point) => point.label === label)?.value ?? 0),
    })),
  };
}
