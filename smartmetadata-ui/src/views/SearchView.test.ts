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

const SEARCH_BODY = {
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
          domains: [{ name: 'finance', displayName: 'Finance' }],
          dataType: 'varchar(50)',
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
    'sterms#service.displayName.keyword': { buckets: [{ key: 'mysql', doc_count: 2 }] },
  },
};

async function mountView(query: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/search', name: 'search', component: SearchView },
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
      { path: '/context-center', name: 'context-center-overview', component: { template: '<div>context</div>' } },
      { path: '/governance/domains', name: 'governance-domains', component: { template: '<div>domains</div>' } },
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

function emitSelect(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], testId: string, value: unknown) {
  const select = wrapper.findComponent(`[data-testid="${testId}"]`);
  select.vm.$emit('change', value);
  select.vm.$emit('update:value', value);
}

describe('SearchView', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        expect(url.searchParams.get('include_aggregations')).toBe('true');
        expect(url.searchParams.get('index')).toBe('dataAsset');
        return jsonResponse(SEARCH_BODY);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders Browse Estate, filter chips, result cards, and a preview pane', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="explore-estate"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Browse Estate');
    expect(wrapper.text()).toContain('Databases');
    expect(wrapper.find('[data-testid="explore-chips"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="explore-chip-entityType"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="explore-chip-dataProduct"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="explore-preview"]').exists()).toBe(true);
    expect(wrapper.text()).not.toMatch(/GET \/api/);
    const card = wrapper.get('[data-testid="search-card-svc.db.schema.orders"]');
    expect(card.classes()).toContain('explore__card--dense');
    expect(card.classes()).toContain('explore__card--om');
    expect(wrapper.text()).toContain('Orders');
    expect(wrapper.text()).toContain('Daily orders');
    expect(wrapper.text()).toContain('BigQuery Prod / analytics / marts');
    expect(wrapper.text()).toContain('Data Eng');
    expect(wrapper.text()).toContain('Sensitive');
    expect(wrapper.get('[data-testid="explore-preview"]').text()).toContain('varchar(50)');
    expect(wrapper.get('[data-testid="explore-preview"]').text()).toContain('Finance');
  });

  it('filters from Browse Estate and composes Lucene q= for the category entity types', async () => {
    const { wrapper, router } = await mountView({ q: 'orders' });
    const tree = wrapper.findComponent({ name: 'ExploreEstateTree' });
    tree.vm.$emit('select', {
      key: 'databases',
      categoryId: 'databases',
      titleKey: 'explore.estate.databases',
      count: 1,
    });
    await flushPromises();
    expect(router.currentRoute.value.query.estate).toBe('databases');
    expect(String(router.currentRoute.value.query.entityType)).toContain('table');
    const mock = vi.mocked(fetch);
    const lastUrl = new URL(String(mock.mock.calls.at(-1)?.[0]), 'http://localhost');
    expect(lastUrl.searchParams.get('q')).toContain('orders');
    expect(lastUrl.searchParams.get('q')).toContain('entityType:table');
  });

  it('toggles a chip into Lucene q= the same way the old facet list did', async () => {
    const { wrapper, router } = await mountView({ q: 'orders' });
    emitSelect(wrapper, 'explore-chip-entityType', ['table']);
    await flushPromises();
    expect(router.currentRoute.value.query).toMatchObject({ q: 'orders', entityType: 'table' });
    const mock = vi.mocked(fetch);
    const matched = mock.mock.calls
      .map((call) => new URL(String(call[0]), 'http://localhost'))
      .some((url) => url.searchParams.get('q') === 'orders AND entityType:table');
    expect(matched).toBe(true);
  });

  it('opens a wired hit from the card name and from the preview button', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="search-card-svc.db.schema.orders"] a').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('asset');
    expect(router.currentRoute.value.params).toMatchObject({
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
    });
  });

  it('selects a result for the overview pane without navigating', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="search-card-kafka.events"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('search');
    expect(wrapper.get('[data-testid="explore-preview"]').text()).toContain('events');
    expect(wrapper.get('[data-testid="explore-preview"]').text()).toContain('No description');
    expect(wrapper.get('[data-testid="explore-preview"]').text()).toContain('No owners assigned');
  });

  it('sends sort_field when Popularity is chosen', async () => {
    const { wrapper, router } = await mountView();
    emitSelect(wrapper, 'explore-sort', 'popularity');
    await flushPromises();
    expect(router.currentRoute.value.query.sort).toBe('popularity');
    const mock = vi.mocked(fetch);
    const sorted = mock.mock.calls
      .map((call) => new URL(String(call[0]), 'http://localhost'))
      .find((url) => url.searchParams.get('sort_field') === 'totalVotes');
    expect(sorted?.searchParams.get('sort_order')).toBe('desc');
  });

  it('shows an honest residual empty and CTA for Context Center', async () => {
    const { wrapper, router } = await mountView({ estate: 'contextCenter' });
    expect(wrapper.find('[data-testid="explore-residual-empty"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="explore-residual-empty"]').text()).toContain(
      'Context Center articles are not indexed',
    );
    expect(wrapper.get('[data-testid="explore-residual-cta"]').text()).toContain('Open Context Center');
    await wrapper.get('[data-testid="explore-residual-cta"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('context-center-overview');
  });
});

describe('SearchView empty results', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          hits: { total: { value: 0 }, hits: [] },
          aggregations: { 'sterms#entityType': { buckets: [] } },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers Explore-all and clear-filter CTAs when the catalog is empty', async () => {
    const { wrapper, router } = await mountView({ q: 'zzz', entityType: 'table' });
    expect(wrapper.find('[data-testid="explore-empty"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('No matching assets');
    await wrapper.get('[data-testid="explore-empty-cta"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.entityType).toBeUndefined();
    expect(router.currentRoute.value.query.q).toBe('zzz');
  });
});
