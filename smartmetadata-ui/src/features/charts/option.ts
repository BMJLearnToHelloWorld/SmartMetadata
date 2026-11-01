/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { SM_CHART_COLORS } from '@/theme/tokens';
import type { ChartKind, ChartSeries } from './types';

const COLORS = [...SM_CHART_COLORS];

/**
 * Optional palette override. DataInsight categorical charts pass
 * SM_DATA_INSIGHT_COLORS; every other chart keeps the global palette,
 * so a DataInsight-only change never recolours profiler/quality charts.
 */
export function buildChartOption(
  kind: ChartKind,
  series: ChartSeries[],
  colors: readonly string[] = COLORS,
): Record<string, unknown> {
  const palette = [...colors];
  if (kind === 'donut') {
    const points = series[0]?.points ?? [];
    return {
      color: palette,
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, type: 'scroll' },
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          avoidLabelOverlap: true,
          data: points.map((point) => ({ name: point.label, value: point.value })),
        },
      ],
    };
  }

  const labels = [...new Set(series.flatMap((item) => item.points.map((point) => point.label)))];
  return {
    color: palette,
    tooltip: { trigger: 'axis' },
    legend: series.length > 1 ? { bottom: 0 } : undefined,
    grid: { left: 48, right: 16, top: 24, bottom: series.length > 1 ? 52 : 28, containLabel: true },
    xAxis: { type: 'category', data: labels, axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', minInterval: 1 },
    series: series.map((item) => ({
      type: kind,
      name: item.name,
      smooth: kind === 'line',
      data: labels.map((label) => item.points.find((point) => point.label === label)?.value ?? 0),
    })),
  };
}
