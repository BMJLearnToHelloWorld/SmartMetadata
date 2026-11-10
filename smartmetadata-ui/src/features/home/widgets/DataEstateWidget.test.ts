/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref, type Component } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { resetWidgetLoadCache } from '@/features/home/widgetLoad';
import DataEstateWidget from './DataEstateWidget.vue';
import TotalDataAssetsWidget from './TotalDataAssetsWidget.vue';

const listSystemChartData = vi.fn();
const postAggregateFieldOptions = vi.fn();
const getResourcePermission = vi.fn();
vi.mock('@/api/dataInsights', () => ({
  listSystemChartData: (...args: unknown[]) => listSystemChartData(...args),
}));
vi.mock('@/api/search', () => ({
  mapAggregateBuckets: (payload: unknown) => {
    const aggregations = (payload as { aggregations?: Record<string, { buckets: unknown[] }> })
      .aggregations;
    const buckets = Object.values(aggregations ?? {})[0]?.buckets ?? [];
    return (buckets as { key: string; doc_count: number }[]).map((bucket) => ({
      key: bucket.key,
      docCount: bucket.doc_count,
    }));
  },
  postAggregateFieldOptions: (...args: unknown[]) => postAggregateFieldOptions(...args),
}));
vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({ getResourcePermission }),
}));
vi.mock('@/features/home/useAddServiceAction', () => ({
  useAddServiceAction: () => ({ addService: vi.fn(), canAddService: ref(true) }),
}));

const NEWEST = 1760000000000;
const OLDEST = 1759000000000;

function chartsResponse() {
  return {
    total_data_assets: [
      { day: OLDEST, group: 'table', count: 90 },
      { day: OLDEST, group: 'database', count: 20 },
      { day: NEWEST, group: 'table', count: 100 },
      { day: NEWEST, group: 'database', count: 20 },
    ],
    percentage_of_data_asset_with_description: [
      { day: OLDEST, group: 'table', count: 70 },
      { day: OLDEST, group: 'database', count: 100 },
      { day: NEWEST, group: 'table', count: 80 },
      { day: NEWEST, group: 'database', count: 100 },
    ],
  };
}

function connectorsResponse() {
  return {
    aggregations: {
      'sterms#serviceType': {
        buckets: [
          { key: 'Snowflake', doc_count: 60 },
          { key: 'Postgres', doc_count: 40 },
          { key: 'BigQuery', doc_count: 20 },
        ],
      },
    },
  };
}

function mountWidget(Component: Component) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/my-data', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/search', name: 'search', component: { template: '<div>search</div>' } },
    ],
  });
  return mount(Component, {
    props: { widgetKey: 'dataEstate' },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
}

describe('DataEstateWidget', () => {
  beforeEach(() => {
    resetWidgetLoadCache();
    vi.clearAllMocks();
    getResourcePermission.mockResolvedValue({ Create: true });
    listSystemChartData.mockResolvedValue(chartsResponse());
    postAggregateFieldOptions.mockResolvedValue(connectorsResponse());
  });

  it('renders the total, the delta and the connector split', async () => {
    const wrapper = mountWidget(DataEstateWidget);
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-testid="data-estate-total"]').text()).toBe('120');
    expect(wrapper.get('[data-testid="home-widget-dataEstate-status"]').text()).toContain('+10');
    expect(wrapper.get('[data-testid="data-estate-connector-Snowflake"]').text()).toContain('60');
    expect(wrapper.get('[data-testid="data-estate-connector-BigQuery"]').text()).toContain('Big Query');
    // D-1: no coverage block is rendered.
    expect(wrapper.text()).not.toContain('Description coverage');
  });

  it('falls back to the live connector sum when DI has no rows', async () => {
    listSystemChartData.mockResolvedValue({});
    const wrapper = mountWidget(DataEstateWidget);
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-testid="data-estate-total"]').text()).toBe('120');
  });

  it('renders the empty state with the add-connector action when there are no assets', async () => {
    listSystemChartData.mockResolvedValue({});
    postAggregateFieldOptions.mockResolvedValue({ aggregations: {} });
    const wrapper = mountWidget(DataEstateWidget);
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-testid="home-widget-dataEstate-empty"]').text()).toContain('No assets yet');
  });
});

describe('TotalDataAssetsWidget', () => {
  beforeEach(() => {
    resetWidgetLoadCache();
    vi.clearAllMocks();
    getResourcePermission.mockResolvedValue({ Create: true });
    listSystemChartData.mockResolvedValue(chartsResponse());
    postAggregateFieldOptions.mockResolvedValue(connectorsResponse());
  });

  it('renders the share bar, rows with shares and deltas, and the fastest grower', async () => {
    const wrapper = mountWidget(TotalDataAssetsWidget);
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-testid="total-data-assets-total"]').text()).toBe('120');
    expect(wrapper.find('[data-testid="total-data-assets-share-bar"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="asset-type-row-table"]').text()).toContain('Table');
    expect(wrapper.get('[data-testid="asset-type-row-table"]').text()).toContain('83.3%');
    expect(wrapper.get('[data-testid="asset-type-row-table"]').text()).toContain('+10');
    expect(wrapper.text()).toContain('Table grew fastest');
    // The product-owned donut is gone.
    expect(wrapper.find('[data-testid="home-total-chart"]').exists()).toBe(false);
  });

  it('falls back to the live entity-type aggregation when DI has no rows', async () => {
    listSystemChartData.mockResolvedValue({});
    postAggregateFieldOptions.mockResolvedValue({
      aggregations: {
        'sterms#entityType': {
          buckets: [
            { key: 'table', doc_count: 100 },
            { key: 'database', doc_count: 20 },
            { key: 'tag', doc_count: 500 },
          ],
        },
      },
    });
    const wrapper = mountWidget(TotalDataAssetsWidget);
    await flushPromises();
    await flushPromises();
    await flushPromises();
    // Tags are excluded from the chart population; the total is the live sum.
    expect(wrapper.get('[data-testid="total-data-assets-total"]').text()).toBe('120');
    expect(wrapper.find('[data-testid="asset-type-row-tag"]').exists()).toBe(false);
    // No history in the fallback, so no delta badges.
    expect(wrapper.find('[data-testid="asset-type-delta"]').exists()).toBe(false);
  });
});
