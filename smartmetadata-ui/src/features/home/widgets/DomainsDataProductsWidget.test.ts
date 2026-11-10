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
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { resetWidgetLoadCache } from '@/features/home/widgetLoad';
import DomainsOverviewWidget from './DomainsOverviewWidget.vue';
import DataProductsOverviewWidget from './DataProductsOverviewWidget.vue';

const searchAssets = vi.fn();
const getAllDomainsWithAssetsCount = vi.fn();
const getAllDataProductsWithAssetsCount = vi.fn();
const postAggregateFieldOptions = vi.fn();
const getResourcePermission = vi.fn();
vi.mock('@/api/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/search')>();
  return {
    ...actual,
    searchAssets: (...args: unknown[]) => searchAssets(...args),
    postAggregateFieldOptions: (...args: unknown[]) => postAggregateFieldOptions(...args),
  };
});
vi.mock('@/api/domains', () => ({
  getAllDomainsWithAssetsCount: (...args: unknown[]) => getAllDomainsWithAssetsCount(...args),
}));
vi.mock('@/api/dataProducts', () => ({
  getAllDataProductsWithAssetsCount: (...args: unknown[]) =>
    getAllDataProductsWithAssetsCount(...args),
}));
vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({ getResourcePermission }),
}));

function router() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/my-data', name: 'home', component: { template: '<div>home</div>' } },
      {
        path: '/governance/domains',
        name: 'governance-domains',
        component: { template: '<div>domains</div>' },
      },
      {
        path: '/governance/domains/:id',
        name: 'governance-domain',
        component: { template: '<div>domain</div>' },
      },
      {
        path: '/governance/data-products',
        name: 'governance-data-products',
        component: { template: '<div>products</div>' },
      },
      {
        path: '/governance/data-products/:id',
        name: 'governance-data-product',
        component: { template: '<div>product</div>' },
      },
    ],
  });
}

function hit(id: string, fqn: string, owners: { name: string }[] = []) {
  return {
    id,
    name: fqn,
    fullyQualifiedName: fqn,
    entityType: 'domain',
    owners,
  };
}

describe('DomainsOverviewWidget', () => {
  beforeEach(() => {
    resetWidgetLoadCache();
    vi.clearAllMocks();
    getResourcePermission.mockResolvedValue({ Create: true });
  });

  it('lists root domains only, with the unowned count as status', async () => {
    getAllDomainsWithAssetsCount.mockResolvedValue({
      Finance: 5,
      'Finance.Payroll': 3,
      Marketing: 0,
    });
    searchAssets.mockImplementation(async (_q: string, _from: number, size: number) => {
      if (size === 0) {
        return { hits: [], total: 1, facets: [] };
      }
      return { hits: [hit('d1', 'Finance'), hit('d2', 'Marketing')], total: 2, facets: [] };
    });
    const wrapper = mount(DomainsOverviewWidget, {
      props: { widgetKey: 'domains' },
      global: { plugins: [router(), Antd, createTestI18n()] },
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-testid="home-widget-domains-summary"]').text()).toContain(
      '2 domains · 1 unowned',
    );
    expect(wrapper.get('[data-testid="home-widget-domains-status"]').text()).toContain('1 unowned');
    expect(wrapper.findAll('[data-testid^="domain-card-"]')).toHaveLength(2);
    // The sub-domain is in the count map but never a row.
    expect(wrapper.text()).not.toContain('Payroll');
    expect(wrapper.get('[data-testid="domains-chip-empty"]').text()).toContain('1');
  });
});

describe('DataProductsOverviewWidget', () => {
  beforeEach(() => {
    resetWidgetLoadCache();
    vi.clearAllMocks();
    getResourcePermission.mockResolvedValue({ Create: true });
    postAggregateFieldOptions.mockResolvedValue({
      aggregations: {
        'sterms#domains.fullyQualifiedName': {
          buckets: [
            { key: 'Finance', doc_count: 2 },
            { key: 'Marketing', doc_count: 1 },
          ],
        },
      },
    });
  });

  it('sorts the page by most assets and shows the domain count', async () => {
    getAllDataProductsWithAssetsCount.mockResolvedValue({ 'prod.a': 2, 'prod.b': 0 });
    searchAssets.mockImplementation(async (_q: string, _from: number, size: number) => {
      if (size === 0) {
        return { hits: [], total: 1, facets: [] };
      }
      return {
        hits: [
          {
            id: 'p2',
            name: 'prod.b',
            fullyQualifiedName: 'prod.b',
            entityType: 'dataProduct',
            domains: [{ name: 'Marketing', displayName: 'Marketing' }],
            owners: [],
            updatedAt: 200,
          },
          {
            id: 'p1',
            name: 'prod.a',
            fullyQualifiedName: 'prod.a',
            entityType: 'dataProduct',
            domains: [{ name: 'Finance', displayName: 'Finance' }],
            owners: [{ name: 'alice' }],
            updatedAt: 100,
          },
        ],
        total: 2,
        facets: [],
      };
    });
    const wrapper = mount(DataProductsOverviewWidget, {
      props: { widgetKey: 'dataProducts' },
      global: { plugins: [router(), Antd, createTestI18n()] },
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-testid="home-widget-dataProducts-summary"]').text()).toContain(
      '2 data products · 2 domains',
    );
    const rows = wrapper.findAll('[data-testid^="data-product-card-"]');
    expect(rows.map((row) => row.attributes('data-testid'))).toEqual([
      'data-product-card-p1',
      'data-product-card-p2',
    ]);
    expect(wrapper.get('[data-testid="data-product-card-p1"]').text()).toContain('Finance');
  });
});
