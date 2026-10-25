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
});
