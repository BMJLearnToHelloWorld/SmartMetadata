/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { SM_CHART_COLORS, SM_COLOR_PRIMARY, SM_DATA_INSIGHT_COLORS } from '@/theme/tokens';
import { buildChartOption } from './option';

describe('buildChartOption', () => {
  it('uses OM categorical tokens instead of default antd chart hues', () => {
    const option = buildChartOption('donut', [
      { name: 'types', points: [{ label: 'table', value: 3 }] },
    ]);
    expect(option.color).toEqual([...SM_CHART_COLORS]);
    expect((option.color as string[])[0]).toBe(SM_COLOR_PRIMARY);
    expect(option.color).not.toContain('#1677ff');
    expect(option.color).not.toContain('#52c41a');
  });

  it('uses the official DataInsight palette only when a caller passes it', () => {
    const series = [{ name: 'types', points: [{ label: 'table', value: 3 }] }];
    const option = buildChartOption('donut', series, SM_DATA_INSIGHT_COLORS);
    expect(option.color).toEqual([...SM_DATA_INSIGHT_COLORS]);
    expect((option.color as string[])[0]).toBe('#E57373');
    const defaultOption = buildChartOption('donut', series);
    expect(defaultOption.color).toEqual([...SM_CHART_COLORS]);
  });

  it('hides donut slice name labels: pin pie.ts shows labels only when showLabels is passed, and then only the percentage — slice names live in the legend', () => {
    const series = [
      {
        name: 'types',
        points: [
          { label: 'table', value: 3 },
          { label: 'dashboard', value: 2 },
          { label: 'chart', value: 1 },
        ],
      },
    ];
    const option = buildChartOption('donut', series);
    const pie = (option.series as Array<Record<string, unknown>>)[0];
    // ECharts' default outside name labels collide once a donut has 8+
    // slices; the legend below carries the names instead.
    expect(pie.label).toEqual({ show: false });
    expect(pie.labelLine).toEqual({ show: false });
    expect(option.legend).toEqual({ bottom: 0, type: 'scroll' });
  });

  it('renders area as a smooth line with a filled area (pin CustomAreaChart)', () => {
    const option = buildChartOption('area', [
      { name: 'success', points: [{ label: '2023-11-14', value: 2 }] },
    ]);
    const series = option.series as Array<Record<string, unknown>>;
    expect(series).toHaveLength(1);
    expect(series[0].type).toBe('line');
    expect(series[0].smooth).toBe(true);
    expect(series[0].areaStyle).toEqual({});
  });

  it('hides the built-in legend when hideLegend is set (pin HIDDEN_CHART_LEGEND)', () => {
    const series = [
      { name: 'A', points: [{ label: '2026-01-01', value: 1 }] },
      { name: 'B', points: [{ label: '2026-01-01', value: 2 }] },
    ];
    const option = buildChartOption('line', series, undefined, { hideLegend: true });
    expect(option.legend).toEqual({ show: false });
    // No legend row to leave room for: the grid bottom shrinks back to 28.
    expect(option.grid).toMatchObject({ bottom: 28 });
    const shown = buildChartOption('line', series);
    expect(shown.legend).toEqual({ bottom: 0 });
    expect(shown.grid).toMatchObject({ bottom: 52 });
  });

  it('dims the named series to 0.3 and keeps the rest at 1 (pin HOVER_CHART_OPACITY)', () => {
    const series = [
      { name: 'A', points: [{ label: '2026-01-01', value: 1 }] },
      { name: 'B', points: [{ label: '2026-01-01', value: 2 }] },
    ];
    const option = buildChartOption('line', series, undefined, { dimmedNames: new Set(['B']) });
    const lineSeries = option.series as Array<Record<string, unknown>>;
    expect(lineSeries[0].lineStyle).toEqual({ opacity: 1 });
    expect(lineSeries[1].lineStyle).toEqual({ opacity: 0.3 });
    const undimmed = buildChartOption('line', series);
    expect(undimmed.series as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([expect.not.objectContaining({ lineStyle: expect.anything() })]),
    );
  });
});
