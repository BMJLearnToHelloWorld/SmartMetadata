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

  // Rebase note (P2 R-P2-5): the old default-rendering tooltip test is
  // superseded by #343 P1-3 — a null row used to render '-', the P1-3
  // formatter drops null rows instead, locked by the 'no null rows'
  // test above. Only the x-axis and y-axis formatters are P2's here
  // (they do not exist in #343).
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
    // The tooltip must not show the missing value as 0 either: #343
    // P1-3's formatter drops null rows outright (pin chartTooltipRows).
    // (Rebase note: the old default-rendering expectation — a null row
    // rendered as '-' — is superseded by the P1-3 formatter; the "row
    // dropped" assertion below is its equal-strength retarget. The P2
    // tooltip test above this one was dropped for the same reason in
    // the dates-lane rebase.)
    const html = formatInsightTooltip(
      [
        { axisValue: '2026-11-20', marker: '<span>M</span>', seriesName: 'table', value: 110 },
        { axisValue: '2026-11-20', marker: '<span>M</span>', seriesName: 'storedProcedure', value: null },
      ],
      { isPercentage: false, locale: 'en-US' },
    );
    expect(html).toContain('Nov 20, 2026');
    expect(html).toContain('Table');
    expect(html).toContain('110');
    expect(html).not.toContain('Stored Procedure');
    expect(html).not.toContain('storedProcedure');
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
    expect(total.yAxis as Record<string, unknown>).not.toHaveProperty('axisLabel');  });
});
