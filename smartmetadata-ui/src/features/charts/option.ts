/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { ChartKind, ChartSeries } from './types';

const COLORS = ['#1677ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2', '#eb2f96', '#2f54eb'];

export function buildChartOption(kind: ChartKind, series: ChartSeries[]): Record<string, unknown> {
  if (kind === 'donut') {
    const points = series[0]?.points ?? [];
    return {
      color: COLORS,
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
    color: COLORS,
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
