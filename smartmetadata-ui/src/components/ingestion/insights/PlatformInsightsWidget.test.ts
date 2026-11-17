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
import { createTestI18n } from '@/test/i18n';
import PlatformInsightsWidget, { type ChartSeriesData } from './PlatformInsightsWidget.vue';

function chart(overrides: Partial<ChartSeriesData> = {}): ChartSeriesData {
  return {
    chartType: 'assets_with_description',
    percentageChange: 10,
    currentPercentage: 87.5,
    isIncreased: true,
    numberOfDays: 6,
    ...overrides,
  };
}

function mountWidget(props: Record<string, unknown> = {}) {
  return mount(PlatformInsightsWidget, {
    props: { chartsData: [], isLoading: false, serviceKind: 'database', ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('PlatformInsightsWidget (official PlatformInsightsWidget)', () => {
  it('starts expanded with the title and description', () => {
    const wrapper = mountWidget({ chartsData: [chart()] });
    expect(wrapper.text()).toContain('Platform Insights');
    expect(wrapper.text()).toContain(
      'Understand the metadata available in your service and keep track of the main KPIs coverage.',
    );
    expect(wrapper.text()).toContain('Description Coverage');
    expect(wrapper.text()).toContain('View more');
  });

  it('renders the current percentage in compact form with an increase badge and days line', () => {
    const wrapper = mountWidget({ chartsData: [chart({ currentPercentage: 1234.5 })] });
    expect(wrapper.text()).toContain('1.23K%');
    const badge = wrapper.find('.platform-insights-widget__badge');
    expect(badge.classes()).toContain('platform-insights-widget__badge--up');
    expect(badge.text()).toContain('10%');
    expect(wrapper.text()).toContain('In last 6 days');
  });

  it('renders a decreased badge with a flipped arrow', () => {
    const wrapper = mountWidget({ chartsData: [chart({ isIncreased: false, percentageChange: 4 })] });
    const badge = wrapper.find('.platform-insights-widget__badge');
    expect(badge.classes()).toContain('platform-insights-widget__badge--down');
    expect(badge.find('.platform-insights-widget__arrow--down').exists()).toBe(true);
  });

  it('renders no arrow when the change is zero', () => {
    const wrapper = mountWidget({ chartsData: [chart({ percentageChange: 0, isIncreased: true })] });
    expect(wrapper.find('.platform-insights-widget__badge .anticon').exists()).toBe(false);
  });

  it('renders no badge or days line when the change is undefined', () => {
    const wrapper = mountWidget({ chartsData: [chart({ percentageChange: undefined })] });
    expect(wrapper.find('.platform-insights-widget__badge').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('In last');
  });

  it('uses the singular days line for one day', () => {
    const wrapper = mountWidget({ chartsData: [chart({ numberOfDays: 1 })] });
    expect(wrapper.text()).toContain('In the last day');
  });

  it('renders no card for entries without a chart type', () => {
    const wrapper = mountWidget({
      chartsData: [chart({ chartType: undefined }), chart()],
    });
    expect(wrapper.findAll('.platform-insights-widget__card')).toHaveLength(1);
  });

  it('renders Healthy Data Assets only for database services', () => {
    const healthy = chart({ chartType: 'healthy_data_assets' });
    expect(
      mountWidget({ chartsData: [healthy], serviceKind: 'database' }).text(),
    ).toContain('Healthy Data Assets');
    expect(
      mountWidget({ chartsData: [healthy], serviceKind: 'messaging' }).findAll(
        '.platform-insights-widget__card',
      ),
    ).toHaveLength(0);
  });

  it('maps live chart names onto their coverage titles', () => {
    const wrapper = mountWidget({ chartsData: [chart({ chartType: 'assets_with_pii_live' })] });
    expect(wrapper.text()).toContain('PII Coverage');
  });

  it('renders one skeleton card per filtered chart while loading', () => {
    expect(
      mountWidget({ isLoading: true, serviceKind: 'database' }).findAll(
        '.platform-insights-widget__card',
      ),
    ).toHaveLength(5);
    expect(
      mountWidget({ isLoading: true, serviceKind: 'messaging' }).findAll(
        '.platform-insights-widget__card',
      ),
    ).toHaveLength(4);
  });
});
