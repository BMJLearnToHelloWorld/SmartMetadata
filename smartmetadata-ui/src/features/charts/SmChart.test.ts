/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import SmChart from './SmChart.vue';

describe('SmChart', () => {
  it('shows the empty state when there are no real points', () => {
    const wrapper = mount(SmChart, {
      props: { kind: 'donut', series: [], empty: 'No profiler series' },
      global: { plugins: [Antd] },
    });
    expect(wrapper.text()).toContain('No profiler series');
    expect(wrapper.find('[data-testid="v-chart"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="sm-chart"]').attributes('data-points')).toBe('0');
  });

  it('renders a canvas stub only when series have values', () => {
    const wrapper = mount(SmChart, {
      props: {
        kind: 'bar',
        empty: 'empty',
        testId: 'entity-chart',
        series: [{ name: 'types', points: [{ label: 'table', value: 3 }] }],
      },
      global: { plugins: [Antd] },
    });
    expect(wrapper.find('[data-testid="entity-chart"]').attributes('data-kind')).toBe('bar');
    expect(wrapper.find('[data-testid="v-chart"]').exists()).toBe(true);
  });

  it('surfaces an error instead of a decorative chart', () => {
    const wrapper = mount(SmChart, {
      props: {
        kind: 'line',
        empty: 'empty',
        error: 'GET failed',
        series: [{ name: 'rows', points: [{ label: '2026-01-01', value: 1 }] }],
      },
      global: { plugins: [Antd] },
    });
    expect(wrapper.text()).toContain('GET failed');
    expect(wrapper.find('[data-testid="v-chart"]').exists()).toBe(false);
  });

  it('emits the slice index on a donut series click (pin CustomPieChart onSegmentClick)', async () => {
    const wrapper = mount(SmChart, {
      props: {
        kind: 'donut',
        empty: 'empty',
        segmentClickable: true,
        series: [
          {
            name: 'coverage',
            points: [
              { label: 'Covered', value: 2 },
              { label: 'Not covered', value: 18 },
            ],
          },
        ],
      },
      global: { plugins: [Antd] },
    });
    const chart = wrapper.findComponent({ name: 'VChart' });
    expect(chart.exists()).toBe(true);
    await chart.vm.$emit('click', { componentType: 'series', dataIndex: 1 });
    expect(wrapper.emitted('segment-click')).toEqual([[1]]);
  });

  it('ignores legend and non-series clicks on a donut', async () => {
    const wrapper = mount(SmChart, {
      props: {
        kind: 'donut',
        empty: 'empty',
        segmentClickable: true,
        series: [{ name: 'coverage', points: [{ label: 'Covered', value: 2 }] }],
      },
      global: { plugins: [Antd] },
    });
    const chart = wrapper.findComponent({ name: 'VChart' });
    await chart.vm.$emit('click', { componentType: 'legend', dataIndex: 0 });
    await chart.vm.$emit('click', { componentType: 'series' });
    expect(wrapper.emitted('segment-click')).toBeUndefined();
  });

  it('does not emit segment clicks for non-donut kinds', async () => {
    const wrapper = mount(SmChart, {
      props: {
        kind: 'area',
        empty: 'empty',
        segmentClickable: true,
        series: [{ name: 'success', points: [{ label: '2026-01-01', value: 3 }] }],
      },
      global: { plugins: [Antd] },
    });
    const chart = wrapper.findComponent({ name: 'VChart' });
    await chart.vm.$emit('click', { componentType: 'series', dataIndex: 0 });
    expect(wrapper.emitted('segment-click')).toBeUndefined();
  });

  it('does not emit segment clicks when the donut is not clickable', async () => {
    const wrapper = mount(SmChart, {
      props: {
        kind: 'donut',
        empty: 'empty',
        series: [{ name: 'coverage', points: [{ label: 'Covered', value: 2 }] }],
      },
      global: { plugins: [Antd] },
    });
    const chart = wrapper.findComponent({ name: 'VChart' });
    await chart.vm.$emit('click', { componentType: 'series', dataIndex: 0 });
    expect(wrapper.emitted('segment-click')).toBeUndefined();
  });

  it('hides the legend and dims the named series when the card asks for it', () => {
    const wrapper = mount(SmChart, {
      props: {
        kind: 'line',
        empty: 'empty',
        hideLegend: true,
        dimmedNames: ['B'],
        series: [
          { name: 'A', points: [{ label: '2026-01-01', value: 1 }] },
          { name: 'B', points: [{ label: '2026-01-01', value: 2 }] },
        ],
      },
      global: { plugins: [Antd] },
    });
    const chart = wrapper.findComponent({ name: 'VChart' });
    const option = chart.props('option') as Record<string, unknown>;
    expect(option.legend).toEqual({ show: false });
    const lineSeries = option.series as Array<Record<string, unknown>>;
    expect(lineSeries[0].lineStyle).toEqual({ opacity: 1 });
    expect(lineSeries[1].lineStyle).toEqual({ opacity: 0.3 });
  });

  it('wires the insight tooltip formatter when the card passes a percentage flag', () => {
    const wrapper = mount(SmChart, {
      props: {
        kind: 'line',
        empty: 'empty',
        tooltipPercentage: true,
        tooltipLocale: 'en-US',
        series: [{ name: 'table', points: [{ label: '2026-11-22', value: 52.43 }] }],
      },
      global: { plugins: [Antd] },
    });
    const chart = wrapper.findComponent({ name: 'VChart' });
    const option = chart.props('option') as Record<string, unknown>;
    const formatter = (option.tooltip as Record<string, unknown>).formatter as (
      params: Array<{ axisValue: string; seriesName: string; value: number; marker: string }>,
    ) => string;
    expect(typeof formatter).toBe('function');
    const html = formatter([{ axisValue: '2026-11-22', seriesName: 'table', value: 52.43, marker: '' }]);
    expect(html).toContain('Nov 22, 2026');
    expect(html).toContain('52.43%');
  });

  it('keeps the default tooltip when no percentage flag is passed', () => {
    const wrapper = mount(SmChart, {
      props: {
        kind: 'line',
        empty: 'empty',
        series: [{ name: 'rows', points: [{ label: '2026-01-01', value: 1 }] }],
      },
      global: { plugins: [Antd] },
    });
    const chart = wrapper.findComponent({ name: 'VChart' });
    const option = chart.props('option') as Record<string, unknown>;
    expect(option.tooltip).toEqual({ trigger: 'axis' });
  });

  it('keeps the legend and full opacity when the card does not ask to hide/dim', () => {
    const wrapper = mount(SmChart, {
      props: {
        kind: 'line',
        empty: 'empty',
        series: [
          { name: 'A', points: [{ label: '2026-01-01', value: 1 }] },
          { name: 'B', points: [{ label: '2026-01-01', value: 2 }] },
        ],
      },
      global: { plugins: [Antd] },
    });
    const chart = wrapper.findComponent({ name: 'VChart' });
    const option = chart.props('option') as Record<string, unknown>;
    expect(option.legend).toEqual({ bottom: 0 });
  });
});
