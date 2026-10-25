/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

export type ChartKind = 'line' | 'bar' | 'donut';

export interface ChartPoint {
  label: string;
  value: number;
}

export interface ChartSeries {
  name: string;
  points: ChartPoint[];
}

export const DEFAULT_SERIES_DAYS = 30;

export function seriesWindow(days = DEFAULT_SERIES_DAYS): { startTs: number; endTs: number } {
  const endTs = Date.now();
  return { startTs: endTs - days * 24 * 60 * 60 * 1000, endTs };
}

export function hasChartPoints(series: ChartSeries[]): boolean {
  return series.some((item) => item.points.some((point) => Number.isFinite(point.value)));
}
