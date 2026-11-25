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

  it('formats ISO date x-axis ticks as pin MMM dd and leaves other labels alone', () => {
    // Pin DataInsightChartCard.tsx:593-598: customFormatDateTime(value, 'MMM dd').
    const series = [
      {
        name: 'table',
        points: [
          { label: '2026-11-19', value: 3 },
          { label: '2026-11-20', value: 4 },
        ],
      },
    ];
    const option = buildChartOption('line', series);
    const xAxis = option.xAxis as { axisLabel: { formatter: (value: string) => string } };
    expect(xAxis.axisLabel.formatter('2026-11-19')).toBe('Nov 19');
    expect(xAxis.axisLabel.formatter('2026-11-20')).toBe('Nov 20');
    expect(xAxis.axisLabel.formatter('Tier.Gold')).toBe('Tier.Gold');
  });

  it('renders the tooltip header as pin DATE_MED and keeps the value rows at ECharts default', () => {
    // Pin DataInsightChartUtils.tsx:104 + DateTimeUtils.ts:132-141:
    // header formatDate -> "Nov 22, 2026". Value rows are NOT reformatted
    // here (no %, no rounding) — that is #343 P1-3's range.
    const series = [
      { name: 'table', points: [{ label: '2026-11-22', value: 52.4271844601942 }] },
      { name: 'storedProcedure', points: [{ label: '2026-11-22', value: 1187 }] },
    ];
    const option = buildChartOption('line', series);
    const tooltip = option.tooltip as {
      formatter: (params: Array<Record<string, unknown>>) => string;
    };
    const html = tooltip.formatter([
      { axisValue: '2026-11-22', marker: '<span>M</span>', seriesName: 'table', value: 52.4271844601942 },
      { axisValue: '2026-11-22', marker: '<span>M</span>', seriesName: 'storedProcedure', value: 1187 },
    ]);
    expect(html).toContain('Nov 22, 2026');
    expect(html).not.toContain('2026-11-22');
    expect(html).toContain('table');
    expect(html).toContain('storedProcedure');
    // Default rendering: full precision kept, thousands grouped, no % added.
    expect(html).toContain('52.4271844601942');
    expect(html).toContain('1,187');
    expect(html).not.toContain('%');
    // A non-date axis value passes through as the header.
    const plain = tooltip.formatter([
      { axisValue: 'Tier.Gold', marker: '', seriesName: 'tier', value: 7 },
    ]);
    expect(plain).toContain('Tier.Gold');
    expect(plain).toContain('tier');
  });

  it('leaves a gap (null) for a series missing a day instead of plotting 0 (pin R-P2-12)', () => {
    // Pin DataInsightChartCard.tsx:396-413: graphData only carries keys
    // the day actually has; a missing day is a gap, not a 0. ECharts'
    // default connectNulls is false, so no connectNulls is set here.
    const series = [
      {
        name: 'table',
        points: [
          { label: '2026-11-19', value: 100 },
          { label: '2026-11-20', value: 110 },
          { label: '2026-11-21', value: 120 },
        ],
      },
      {
        name: 'storedProcedure',
        points: [
          { label: '2026-11-19', value: 50 },
          // No 2026-11-20 point: the line must break, not dive to 0.
          { label: '2026-11-21', value: 60 },
        ],
      },
    ];
    const option = buildChartOption('line', series);
    const lineSeries = option.series as Array<Record<string, unknown>>;
    expect(lineSeries[0].data).toEqual([100, 110, 120]);
    expect(lineSeries[1].data).toEqual([50, null, 60]);
    for (const item of lineSeries) {
      expect(item).not.toHaveProperty('connectNulls');
    }
    // The tooltip must not show the missing value as 0 either: the
    // current formatter renders a null row as '-' (pin's chartTooltipRows
    // drops null rows outright; #343 P1-3's formatter takes that over).
    const tooltip = option.tooltip as {
      formatter: (params: Array<Record<string, unknown>>) => string;
    };
    const html = tooltip.formatter([
      { axisValue: '2026-11-20', marker: '<span>M</span>', seriesName: 'table', value: 110 },
      { axisValue: '2026-11-20', marker: '<span>M</span>', seriesName: 'storedProcedure', value: null },
    ]);
    expect(html).toContain('storedProcedure');
    expect(html).toContain('>-<');
    expect(html).not.toContain('>0<');
  });

  it('suffixes percentage y-axis ticks with % and leaves total ticks bare (pin axisTickFormatter)', () => {
    // Pin DataInsightChartCard.tsx:600-608 + ChartUtils.tsx:21-23:
    // axisTickFormatter(value, '%') -> `${value}%`, verbatim.
    const series = [{ name: 'A', points: [{ label: '2026-01-01', value: 80 }] }];
    const percentage = buildChartOption('line', series, undefined, { percentageYAxis: true });
    const percentageAxis = percentage.yAxis as {
      axisLabel: { formatter: (value: number) => string };
    };
    expect(percentageAxis.axisLabel.formatter(100)).toBe('100%');
    expect(percentageAxis.axisLabel.formatter(80)).toBe('80%');
    expect(percentageAxis.axisLabel.formatter(1)).toBe('1%');
    const total = buildChartOption('line', series);
    expect(total.yAxis as Record<string, unknown>).not.toHaveProperty('axisLabel');
  });
});
