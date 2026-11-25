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
import { buildChartOption, formatInsightTooltip, formatInsightTooltipValue } from './option';

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

  it('keeps a rank-fixed series colour however the visible array is ordered (pin dataInsightColor)', () => {
    // The visible set after hover + filter is [table, schema]: without a
    // fixed colour, schema would take the palette colour of index 1
    // (purple) instead of its rank colour (blue). The series carry the
    // rank colour, so the option must pin it per series.
    const series = [
      { name: 'table', points: [{ label: '2026-01-01', value: 5 }], color: '#FFD54F' },
      { name: 'databaseSchema', points: [{ label: '2026-01-01', value: 3 }], color: '#64B5F6' },
    ];
    const option = buildChartOption('line', series, SM_DATA_INSIGHT_COLORS, {
      hideLegend: true,
      dimmedNames: new Set(['table']),
    });
    const lineSeries = option.series as Array<Record<string, unknown>>;
    expect(lineSeries[0].id).toBe('table');
    expect(lineSeries[1].id).toBe('databaseSchema');
    expect(lineSeries[0].lineStyle).toEqual({ color: '#FFD54F', opacity: 0.3 });
    expect(lineSeries[1].lineStyle).toEqual({ color: '#64B5F6', opacity: 1 });
    expect(lineSeries[0].itemStyle).toEqual({ color: '#FFD54F' });
    expect(lineSeries[1].itemStyle).toEqual({ color: '#64B5F6' });
  });

  it('keeps the palette-by-index fallback for series without a fixed colour', () => {
    const series = [
      { name: 'A', points: [{ label: '2026-01-01', value: 1 }] },
      { name: 'B', points: [{ label: '2026-01-01', value: 2 }] },
    ];
    const option = buildChartOption('line', series, undefined, { dimmedNames: new Set(['B']) });
    const lineSeries = option.series as Array<Record<string, unknown>>;
    expect(lineSeries[0].lineStyle).toEqual({ opacity: 1 });
    expect(lineSeries[0].itemStyle).toBeUndefined();
  });

  it('formats insight tooltip values like pin getEntryFormattedValue', () => {
    expect(formatInsightTooltipValue(52, true)).toBe('52%');
    expect(formatInsightTooltipValue(52.4271844601942, true)).toBe('52.43%');
    expect(formatInsightTooltipValue(52.4271844601942, false)).toBe('52.43');
    expect(formatInsightTooltipValue(0, true)).toBe('0%');
    expect(formatInsightTooltipValue(undefined, true)).toBe('');
  });

  it('renders the insight tooltip with a DATE_MED header, startCase names and no null rows (pin getDataInsightTooltip)', () => {
    const html = formatInsightTooltip(
      [
        { axisValue: '2026-11-22', seriesName: 'table', value: 52.4271844601942, marker: '<i>t</i>' },
        { axisValue: '2026-11-22', seriesName: 'storedProcedure', value: 0, marker: '<i>s</i>' },
        { axisValue: '2026-11-22', seriesName: 'databaseSchema', value: null, marker: '<i>d</i>' },
      ],
      { isPercentage: true, locale: 'en-US' },
    );
    expect(html).toContain('Nov 22, 2026');
    expect(html).toContain('Table');
    expect(html).toContain('52.43%');
    expect(html).toContain('Stored Procedure');
    expect(html).toContain('0%');
    expect(html).not.toContain('52.4271844601942');
    expect(html).not.toContain('Database Schema');
  });

  it('wires the insight tooltip formatter only when the card asks for it', () => {
    const series = [{ name: 'table', points: [{ label: '2026-11-22', value: 52 }] }];
    const withTooltip = buildChartOption('line', series, undefined, {
      tooltip: { isPercentage: true, locale: 'en-US' },
    });
    expect(typeof (withTooltip.tooltip as Record<string, unknown>).formatter).toBe('function');
    const html = (
      (withTooltip.tooltip as Record<string, unknown>).formatter as (
        params: unknown,
      ) => string
    )([{ axisValue: '2026-11-22', seriesName: 'table', value: 52, marker: '' }]);
    expect(html).toContain('Nov 22, 2026');
    expect(html).toContain('52%');
    const plain = buildChartOption('line', series);
    expect(plain.tooltip).toEqual({ trigger: 'axis' });
  });
});
