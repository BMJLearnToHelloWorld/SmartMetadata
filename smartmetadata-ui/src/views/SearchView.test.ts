/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import SearchView from './SearchView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountView(query: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/search', name: 'search', component: SearchView },
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
    ],
  });
  await router.push({ name: 'search', query });
  await router.isReady();
  const wrapper = mount(SearchView, {
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('SearchView', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        expect(url.searchParams.get('include_aggregations')).toBe('true');
        expect(url.searchParams.get('index')).toBe('dataAsset');
        return jsonResponse({
          hits: {
            total: { value: 3 },
            hits: [
              {
                _id: 't1',
                _index: 'table_search_index',
                _source: {
                  name: 'orders',
                  displayName: 'Orders',
                  fullyQualifiedName: 'svc.db.schema.orders',
                  entityType: 'table',
                  description: 'Daily orders',
                  serviceType: 'BigQuery',
                  service: { displayName: 'BigQuery Prod' },
                  database: { name: 'analytics' },
                  databaseSchema: { name: 'marts' },
                  owners: [{ name: 'data-eng', displayName: 'Data Eng' }],
                  tags: [{ tagFQN: 'PII.Sensitive', name: 'Sensitive' }],
                },
              },
              {
                _id: 'k1',
                _index: 'topic_search_index',
                _source: {
                  name: 'events',
                  fullyQualifiedName: 'kafka.events',
                  entityType: 'topic',
                },
              },
              {
                _id: 'd1',
                _index: 'dashboard_search_index',
                _source: {
                  name: 'sales',
                  fullyQualifiedName: 'superset.sales',
                  entityType: 'query',
                },
              },
            ],
          },
          aggregations: {
            'sterms#entityType': {
              buckets: [
                { key: 'table', doc_count: 1 },
                { key: 'topic', doc_count: 1 },
              ],
            },
            'sterms#serviceType': { buckets: [{ key: 'BigQuery', doc_count: 1 }] },
          },
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders denser cards and Apache aggregation facets', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('Explore');
    expect(wrapper.text()).toContain('Discover data assets');
    expect(wrapper.text()).toContain('Filter by type, service, owner, tags, and more.');
    expect(wrapper.text()).not.toMatch(/GET \/api/);
    expect(wrapper.find('[data-testid="search-facets"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="search-facet-entityType"]').exists()).toBe(true);
    const card = wrapper.get('[data-testid="search-card-svc.db.schema.orders"]');
    expect(card.classes()).toContain('explore__card--dense');
    expect(card.classes()).toContain('explore__card--om');
    expect(wrapper.find('[data-testid="search-card-svc.db.schema.orders"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Orders');
    expect(wrapper.text()).toContain('Daily orders');
    expect(wrapper.text()).toContain('BigQuery Prod / analytics / marts');
    expect(wrapper.text()).toContain('Data Eng');
    expect(wrapper.text()).toContain('Sensitive');
    expect(wrapper.text()).toContain('Table');
    expect(wrapper.text()).toContain('Topic');
    expect(wrapper.text()).toContain('Detail page not wired for this type');
  });

  it('composes Lucene q= when a facet is toggled', async () => {
    const { wrapper, router } = await mountView({ q: 'orders' });
    await wrapper.find('[data-testid="search-facet-entityType-table"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query).toMatchObject({ q: 'orders', entityType: 'table' });
    const mock = vi.mocked(fetch);
    const lastUrl = new URL(String(mock.mock.calls.at(-1)?.[0]), 'http://localhost');
    expect(lastUrl.searchParams.get('q')).toBe('orders AND entityType:table');
  });

  it('opens a wired hit on the asset route', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="search-card-svc.db.schema.orders"] a').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('asset');
    expect(router.currentRoute.value.params).toMatchObject({
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
    });
  });
});
