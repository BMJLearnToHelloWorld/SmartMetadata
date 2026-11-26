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
import Antd, { Select, message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { useAuthStore } from '@/stores/auth';
import { useSearchStore } from '@/stores/search';
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

async function mountView(query: Record<string, string> = {}, params: Record<string, string> = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/search/:tab?', name: 'search', component: SearchView },
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
      { path: '/lineage/:entityType/:fqn', name: 'lineage', component: { template: '<div>lineage</div>' } },
      { path: '/governance/terms/:id', name: 'governance-term', component: { template: '<div>term</div>' } },
      { path: '/governance/tags/:id', name: 'governance-tag', component: { template: '<div>tag</div>' } },
      { path: '/governance/data-products/:id', name: 'governance-data-product', component: { template: '<div>dp</div>' } },
      { path: '/context-center', name: 'context-center-overview', component: { template: '<div>context</div>' } },
      { path: '/governance/domains', name: 'governance-domains', component: { template: '<div>domains</div>' } },
      {
        path: '/admin/settings/preferences/search',
        name: 'settings-preferences-search',
        component: { template: '<div>search settings</div>' },
      },
    ],
  });
  await router.push({ name: 'search', params, query });
  await router.isReady();
  const wrapper = mount(SearchView, {
    global: { plugins: [router, pinia, Antd, createTestI18n()] },
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
        if (url.pathname.includes('/v1/search/entityTypeCounts')) {
          // D4: the counts call carries no include_aggregations/index
          // assertions — it is a different endpoint with its own params.
          return jsonResponse({
            hits: { total: { value: 0 }, hits: [] },
            aggregations: {
              'sterms#entityType': {
                buckets: [
                  { key: 'table', doc_count: 1 },
                  { key: 'topic', doc_count: 1 },
                ],
              },
            },
          });
        }
        if (url.pathname.includes('/v1/search/query')) {
          expect(url.searchParams.get('include_aggregations')).toBe('true');
          // The index is asserted per test (mainSearchUrls / tabbed
          // lookups): it is dataAsset without a query, the URL tab with
          // one, or the auto-selected tab for a query without a tab.
          return jsonResponse(SEARCH_BODY);
        }
        // Owner avatars resolve their permission, then a missing profile
        // (initials avatar) — both are caught inside SmProfilePicture.
        if (url.pathname.includes('/v1/permissions/user')) {
          return jsonResponse({
            resource: 'user',
            permissions: [{ operation: 'ViewBasic', access: 'allow' }],
          });
        }
        // E-3a: the preview gates on the entity permission endpoint.
        if (url.pathname.includes('/v1/permissions/')) {
          return jsonResponse({
            resource: 'table',
            permissions: [{ operation: 'ViewBasic', access: 'allow' }],
          });
        }
        return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
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
    // D18: breadcrumbs replace the raw FQN row and the location text.
    const crumbs = wrapper.get('[data-testid="explore-card-breadcrumbs-svc.db.schema.orders"]');
    expect(crumbs.text()).toContain('BigQuery Prod');
    expect(crumbs.text()).toContain('analytics');
    expect(crumbs.text()).toContain('marts');
    expect(card.text()).not.toContain('svc.db.schema.orders');
    expect(card.text()).not.toContain('BigQuery Prod / analytics / marts');
    // D23: the owner renders as an avatar, not plain-text name.
    expect(card.find('[data-testid="profile-avatar"]').exists()).toBe(true);
    expect(card.text()).not.toContain('Data Eng');
    // D21: tags are hidden on list cards (pin `showTags={false}`).
    expect(card.text()).not.toContain('Sensitive');
    // E-3a retarget: pin's table explore overview is Type / Queries /
    // Columns / Incidents only — the Data Type row belongs to the column
    // builder, so the table preview no longer shows the hit's varchar(50).
    expect(wrapper.get('[data-testid="explore-preview"]').text()).not.toContain('varchar(50)');
    expect(wrapper.get('[data-testid="explore-preview"]').text()).toContain('Type');
    expect(wrapper.get('[data-testid="explore-preview"]').text()).toContain('Finance');
  });

  it('shows the literal usage percentile on cards whose hit carries usageSummary (C-14)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          ...SEARCH_BODY,
          hits: {
            total: { value: 2 },
            hits: [
              {
                _id: 't1',
                _index: 'table_search_index',
                _source: {
                  name: 'orders',
                  fullyQualifiedName: 'svc.db.schema.orders',
                  entityType: 'table',
                  usageSummary: { weeklyStats: { count: 20, percentileRank: 45 } },
                },
              },
              {
                _id: 't2',
                _index: 'table_search_index',
                _source: {
                  name: 'raw',
                  fullyQualifiedName: 'svc.db.schema.raw',
                  entityType: 'table',
                  usageSummary: {},
                },
              },
              {
                _id: 't3',
                _index: 'table_search_index',
                _source: { name: 'plain', fullyQualifiedName: 'svc.db.schema.plain', entityType: 'table' },
              },
            ],
          },
        }),
      ),
    );
    const { wrapper } = await mountView();
    const withRank = wrapper.get('[data-testid="search-card-svc.db.schema.orders"]');
    expect(withRank.find('[data-testid="explore-card-usage-percentile"]').text()).toContain('Usage 45th pctile');
    // Key present but no rank: the pin explore card falls back to 0.
    const withoutRank = wrapper.get('[data-testid="search-card-svc.db.schema.raw"]');
    expect(withoutRank.find('[data-testid="explore-card-usage-percentile"]').text()).toContain('Usage 0th pctile');
    const plain = wrapper.get('[data-testid="search-card-svc.db.schema.plain"]');
    expect(plain.find('[data-testid="explore-card-usage-percentile"]').exists()).toBe(false);
  });

  it('toggles ranking details: explain=true on, score/stages/reasons/boosts shown, off again (D12)', async () => {
    const rankingBody = {
      ...SEARCH_BODY,
      hits: {
        total: { value: 1 },
        hits: [
          {
            _id: 't1',
            _index: 'table_search_index',
            _score: 12.345678,
            _explanation: {
              value: 12.345678,
              description: 'sum of',
              details: [
                { value: 7, description: 'weight(displayName.keyword:orders in 0)' },
                {
                  value: 5.345678,
                  description: 'function score, score mode: multiply',
                  details: [
                    { value: 3, description: "field value function: doc['usageSummary.weeklyStats.count']" },
                    { value: 2.345678, description: "field value function: doc['totalVotes']" },
                  ],
                },
              ],
            },
            matched_queries: ['ranking:exactName'],
            _source: {
              name: 'orders',
              displayName: 'Orders',
              fullyQualifiedName: 'svc.db.schema.orders',
              entityType: 'table',
              description: 'Daily orders',
              owners: [],
              tags: [],
            },
          },
        ],
      },
    };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(rankingBody)));
    const { wrapper } = await mountView({ q: 'orders' });
    const fetchCalls = () => vi.mocked(fetch).mock.calls.map((call) => new URL(String(call[0]), 'http://localhost'));

    // Toggle off: pin sends explain=false (ExploreUtils passes
    // showRankingDetails through; axios serializes false), so no
    // explanation is computed and no ranking section renders, even
    // though the payload carries a score.
    expect(fetchCalls().some((url) => url.searchParams.get('explain') === 'true')).toBe(false);
    expect(fetchCalls().some((url) => url.searchParams.get('explain') === 'false')).toBe(true);
    expect(wrapper.find('[data-testid="ranking-details"]').exists()).toBe(false);

    const toggleRanking = async () => {
      await wrapper.find('[data-testid="explore-tools-trigger"]').trigger('click');
      await flushPromises();
      const item = document.body.querySelector('[data-testid="explore-ranking-details"]');
      expect(item).not.toBeNull();
      item?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
    };

    await toggleRanking();
    expect(fetchCalls().some((url) => url.searchParams.get('explain') === 'true')).toBe(true);
    const section = wrapper.get('[data-testid="ranking-details"]');
    expect(section.find('[data-testid="ranking-score"]').text()).toContain('Score: 12.35');
    expect(section.find('[data-testid="ranking-stage-exactName"]').text()).toContain('Exact name');
    expect(section.find('[data-testid="ranking-stage-exactName"]').text()).toContain(
      'The query exactly matched the display name',
    );
    expect(section.find('[data-testid="ranking-score-explanation"]').text()).toContain('displayName: orders');
    expect(section.find('[data-testid="ranking-score-explanation"]').text()).toContain('7.0000');
    expect(section.find('[data-testid="ranking-signal-total"]').text()).toContain('+5.3457');
    expect(section.find('[data-testid="ranking-score-breakdown"]').text()).toContain(
      'Lexical relevance 7.0000 + signal boosts 5.3457',
    );

    await toggleRanking();
    expect(wrapper.find('[data-testid="ranking-details"]').exists()).toBe(false);
  });

  it('filters from Browse Estate and composes Lucene q= for the category entity types', async () => {
    // B2-E5b (D14): the tree only renders without a query — with one, the
    // left aside is the vertical tab list. Mount query-less so the tree
    // is present, then select the Databases root.
    const { wrapper, router } = await mountView();
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
    // The last fetch overall may be an owner avatar's permission /
    // profile request (cards render SmProfilePicture now), so select
    // the last search-query call, not the last call of any kind.
    // No 'orders' assertion here: the mount is query-less (D14), so
    // the composed q= is the estate entity-type filter alone.
    const searchUrls = mock.mock.calls
      .map((call) => new URL(String(call[0]), 'http://localhost'))
      .filter((url) => url.pathname.includes('/v1/search/query'));
    const lastUrl = searchUrls.at(-1);
    expect(lastUrl?.searchParams.get('q')).toContain('entityType:table');
  });

  it('toggles a chip into Lucene q= the same way the old facet list did', async () => {
    // The all-tab chip set (with the entityType chip) only renders
    // when no tab auto-selects: empty counts leave the auto-select
    // at null, so the DATA_ASSET set shows (pin falls back to
    // DATA_ASSET when no tab has hits, ExploreUtils.ts:370-378).
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname.includes('/v1/search/entityTypeCounts')) {
          return jsonResponse(countsBody([]));
        }
        return jsonResponse(SEARCH_BODY);
      }),
    );
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
    // E-3c: the Overview sections now render through the detail-page widget
    // cells, whose empty state is the detail-page '—' marker, not the old
    // preview-only 'No owners assigned' text.
    expect(wrapper.get('[data-testid="explore-preview-owners"]').text()).toContain('—');
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

  it('searches the Context Center estate instead of showing a residual empty state', async () => {
    // B2-E5b (D16): the residual empty state and jump CTA are gone — the
    // Context Center estate is a searchable category like any other.
    const { wrapper } = await mountView({ estate: 'contextCenter' });
    expect(wrapper.find('[data-testid="explore-residual-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="explore-residual-cta"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="search-card-svc.db.schema.orders"]').exists()).toBe(true);
  });

  it('shows the vertical tab list instead of the tree while a query is typed (D14)', async () => {
    const { wrapper } = await mountView({ q: 'orders' });
    expect(wrapper.find('[data-testid="explore-left-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="explore-estate"]').exists()).toBe(false);
    // Pin has no all-tab: only the 24 tabs, icon + label + badge.
    const panel = wrapper.get('[data-testid="explore-left-panel"]');
    expect(panel.find('[data-testid="explore-left-tab-all"]').exists()).toBe(false);
    expect(panel.find('[data-testid="explore-left-tab-table"]').exists()).toBe(true);
    expect(panel.find('[data-testid="explore-left-tab-table"]').text()).toContain('Table');
    // Counts come from the entityType aggregation: table 1, topic 1.
    // The auto-selected tab (table, tie → first) shows the result
    // total 3; count-less tabs show no badge; zero-count tabs are
    // hidden while a query is present.
    expect(panel.findAll('[data-testid="filter-count"]').map((badge) => badge.text())).toEqual([
      '3',
      '1',
    ]);
  });

  it('switches tab from the left panel (D14)', async () => {
    const { wrapper, router } = await mountView({ q: 'orders' });
    await wrapper.get('[data-testid="explore-left-tab-table"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.params.tab).toBe('tables');
    expect(router.currentRoute.value.query.tab).toBeUndefined();
  });

  it('shows the estate tree when no query is typed (D14)', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="explore-left-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="explore-estate"]').exists()).toBe(true);
  });
});

describe('SearchView active-domain chip (D35)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        // The API client prefixes /api (base http://localhost:3000/api),
        // so the domains path is /api/v1/domains, not /v1/domains.
        if (url.pathname.endsWith('/v1/domains')) {
          return jsonResponse({
            data: [{ id: 'd1', name: 'finance', displayName: 'Finance', domainType: 'aggregate' }],
            paging: { total: 1 },
          });
        }
        return jsonResponse(SEARCH_BODY);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('renders the chip for a persisted domain pick', async () => {
    window.localStorage.setItem('sm.domain.v1', 'd1');
    const { wrapper } = await mountView();
    await flushPromises();
    const chip = wrapper.find('[data-testid="domain-filter-chip"]');
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toContain('Finance');
    expect(wrapper.find('[data-testid="domain-filter-chip-clear"]').exists()).toBe(true);
  });

  it('clears the active domain from the chip', async () => {
    window.localStorage.setItem('sm.domain.v1', 'd1');
    const { wrapper } = await mountView();
    await flushPromises();
    await wrapper.get('[data-testid="domain-filter-chip-clear"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="domain-filter-chip"]').exists()).toBe(false);
    expect(window.localStorage.getItem('sm.domain.v1')).toBeNull();
  });

  it('renders no chip and fetches no domains without a stored pick', async () => {
    const { wrapper } = await mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="domain-filter-chip"]').exists()).toBe(false);
    const domainsCalls = vi
      .mocked(fetch)
      .mock.calls.map(([input]) => new URL(String(input), 'http://localhost'))
      .filter((url) => url.pathname.endsWith('/v1/domains'));
    expect(domainsCalls).toHaveLength(0);
  });
});

describe('SearchView Explore result area (R3)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.searchParams.get('size') === '0') {
          return jsonResponse({
            hits: { total: { value: 3 }, hits: [] },
            aggregations: { 'sterms#entityType': { buckets: [{ key: 'table', doc_count: 1 }] } },
          });
        }
        return jsonResponse({
          ...SEARCH_BODY,
          hits: { ...SEARCH_BODY.hits, total: { value: 100 } },
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    document.body.innerHTML = '';
  });

  it('defaults to page size 15 and honours a pageSize URL value', async () => {
    await mountView();
    const sizes = vi
      .mocked(fetch)
      .mock.calls.map((call) => new URL(String(call[0]), 'http://localhost').searchParams.get('size'));
    expect(sizes).toContain('15');

    await mountView({ pageSize: '25' });
    const sized = vi
      .mocked(fetch)
      .mock.calls.map((call) => new URL(String(call[0]), 'http://localhost'))
      .find((url) => url.searchParams.get('size') === '25');
    expect(sized).toBeDefined();
  });

  it('toggles showDeleted into the URL and the deleted search param', async () => {
    const { wrapper, router } = await mountView();
    const toggle = wrapper.findComponent('[data-testid="explore-show-deleted"]');
    toggle.vm.$emit('change', true);
    await flushPromises();
    expect(router.currentRoute.value.query.showDeleted).toBe('true');
    const deleted = vi
      .mocked(fetch)
      .mock.calls.map((call) => new URL(String(call[0]), 'http://localhost'))
      .find((url) => url.searchParams.get('deleted') === 'true');
    expect(deleted).toBeDefined();
  });

  it('writes a pagination page-size change to the URL and the local preference', async () => {
    const { wrapper, router } = await mountView();
    useAuthStore().user = { id: 'u-1', name: 'alice', displayName: 'Alice' };
    const pagination = wrapper.findComponent('[data-testid="search-pagination"]');
    expect(pagination.exists()).toBe(true);
    pagination.vm.$emit('show-size-change', 1, 25);
    await flushPromises();
    expect(router.currentRoute.value.query.pageSize).toBe('25');
    expect(window.localStorage.getItem('sm.userPreferences.v1')).toBe(
      JSON.stringify({ version: 1, preferences: { alice: { globalPageSize: 25 } } }),
    );
    expect(window.localStorage.getItem('sm.explore.pageSize.v1')).toBeNull();
  });

  it('applies the QueryBuilder tree as query_filter JSON, keeping q as free text', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname.includes('/v1/metadata/types')) {
          return jsonResponse({ data: [] });
        }
        return jsonResponse(SEARCH_BODY);
      }),
    );
    const { wrapper, router } = await mountView({ q: 'orders' });
    await wrapper.get('[data-testid="explore-advanced-search"]').trigger('click');
    await flushPromises();
    const valueSelect = wrapper.findComponent('[data-testid="advanced-search-rule-0-value"]');
    expect(valueSelect.exists()).toBe(true);
    valueSelect.vm.$emit('change', 'Data Eng');
    await flushPromises();
    // Ant Modal teleports its footer to document.body; submit through the
    // Apply button there, as in the AlertDetail FormModal test.
    const okButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Apply'),
    );
    expect(okButton).toBeDefined();
    okButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(router.currentRoute.value.query.q).toBe('orders');
    expect(router.currentRoute.value.query.query_filter).toBe(
      JSON.stringify({ query: { bool: { must: [{ term: { ownerDisplayName: 'Data Eng' } }] } } }),
    );
    expect(wrapper.find('[data-testid="advance-search-filter-container"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="advance-search-filter-text"]').text()).toBe(
      "ownerDisplayName = 'Data Eng'",
    );
  });

  it('shows the index-not-found banner on the official marker message', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'Failed to to find index [table_search_index]' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('Search indexing error');
    expect(wrapper.text()).toContain('Open search settings');
  });
});

describe('SearchView applied advanced-search filter (D28)', () => {
  const TIER_FILTER = JSON.stringify({
    query: { bool: { must: [{ term: { 'tier.tagFQN': 'Tier.Tier1' } }] } },
  });

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname.includes('/v1/metadata/types')) {
          return jsonResponse({ data: [] });
        }
        return jsonResponse(SEARCH_BODY);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the applied filter as readable SQL text', async () => {
    const { wrapper } = await mountView({ query_filter: TIER_FILTER });
    expect(wrapper.find('[data-testid="advance-search-filter-container"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="advance-search-filter-text"]').text()).toBe(
      "tier.tagFQN = 'Tier.Tier1'",
    );
  });

  it('clears only the advanced filter, keeping q and the quick filters', async () => {
    const { wrapper, router } = await mountView({ q: 'orders', query_filter: TIER_FILTER });
    await wrapper.get('[data-testid="advance-search-clear-btn"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.query_filter).toBeUndefined();
    expect(router.currentRoute.value.query.q).toBe('orders');
    expect(wrapper.find('[data-testid="advance-search-filter-container"]').exists()).toBe(false);
  });

  it('reopens the applied filter in the builder for editing', async () => {
    const { wrapper } = await mountView({ query_filter: TIER_FILTER });
    await wrapper.get('[data-testid="advance-search-filter-btn"]').trigger('click');
    await flushPromises();
    // The modal is teleported to document.body, so `wrapper.find` (DOM
    // subtree only) cannot see it — `findComponent` walks the VNode tree.
    const field = wrapper.findComponent('[data-testid="advanced-search-rule-0-field"]');
    expect(field.exists()).toBe(true);
    expect(field.text()).toContain('Tier');
  });

  it('keeps an unparseable saved filter applied but shows no SQL text', async () => {
    const seen: string[] = [];
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        seen.push(url);
        if (url.includes('/v1/metadata/types')) {
          return jsonResponse({ data: [] });
        }
        return jsonResponse(SEARCH_BODY);
      }),
    );
    const unparseable = JSON.stringify({ query: { match_all: {} } });
    const { wrapper } = await mountView({ query_filter: unparseable });
    expect(wrapper.find('[data-testid="advance-search-filter-container"]').exists()).toBe(false);
    expect(
      seen.some(
        (url) => new URL(url, 'http://localhost').searchParams.get('query_filter') === unparseable,
      ),
    ).toBe(true);
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

  it('links a column card to its parent table and drops the unwired marker (Fix3)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({
        hits: {
          total: { value: 1 },
          hits: [
            {
              _id: 'c1',
              _index: 'tableColumn_search_index',
              _source: {
                name: 'customer_id',
                displayName: 'Customer Id',
                fullyQualifiedName: 'svc.db.schema.orders.customer_id',
                entityType: 'tableColumn',
                service: { displayName: 'BigQuery Prod' },
                database: { name: 'analytics' },
                databaseSchema: { name: 'marts' },
                table: { name: 'orders', displayName: 'Orders', fullyQualifiedName: 'svc.db.schema.orders' },
                owners: [],
                tags: [],
              },
            },
          ],
        },
        aggregations: SEARCH_BODY.aggregations,
      })),
    );
    const { wrapper, router } = await mountView();
    const card = wrapper.get('[data-testid="search-card-svc.db.schema.orders.customer_id"]');
    expect(card.find('a.explore__card-name').exists()).toBe(false);
    expect(card.text()).not.toContain('Detail page not wired');
    const parentLink = card.get('[data-testid="explore-card-parent-table"]');
    expect(parentLink.text()).toBe('Orders');
    await parentLink.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('asset');
    expect(router.currentRoute.value.params).toMatchObject({
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
    });
  });

  it('keeps the unwired marker for a column hit without a parent table (Fix3)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({
        hits: {
          total: { value: 1 },
          hits: [
            {
              _id: 'c2',
              _index: 'tableColumn_search_index',
              _source: {
                name: 'orphan_col',
                fullyQualifiedName: 'svc.db.schema.orders.orphan_col',
                entityType: 'tableColumn',
                owners: [],
                tags: [],
              },
            },
          ],
        },
        aggregations: SEARCH_BODY.aggregations,
      })),
    );
    const { wrapper, router } = await mountView();
    const card = wrapper.get('[data-testid="search-card-svc.db.schema.orders.orphan_col"]');
    expect(card.find('[data-testid="explore-card-parent-table"]').exists()).toBe(false);
    expect(card.text()).toContain('Detail page not wired');
    await card.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('search');
  });

  // D26: glossaryTerm / tag / dataProduct cards navigate to their
  // governance detail pages when the hit carries an id; without an id
  // the honest unwired marker stays.
  function governanceSearchBody(entityType: string, fqn: string, name: string, id?: string) {
    return {
      hits: {
        total: { value: 1 },
        hits: [
          {
            ...(id ? { _id: id } : {}),
            _index: `${entityType}_search_index`,
            _source: {
              name,
              fullyQualifiedName: fqn,
              entityType,
              owners: [],
              tags: [],
            },
          },
        ],
      },
      aggregations: SEARCH_BODY.aggregations,
    };
  }

  it('navigates a glossary-term card to its governance detail page (D26)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(governanceSearchBody('glossaryTerm', 'biz.term', 'Term', 'gt-1'))));
    const { wrapper, router } = await mountView();
    const card = wrapper.get('[data-testid="search-card-biz.term"]');
    expect(card.text()).not.toContain('Detail page not wired');
    await card.get('a.explore__card-name').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('governance-term');
    expect(router.currentRoute.value.params).toMatchObject({ id: 'gt-1' });
  });

  it('navigates a tag card to its governance detail page (D26)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(governanceSearchBody('tag', 'PII.Email', 'Email', 'tag-1'))));
    const { wrapper, router } = await mountView();
    const card = wrapper.get('[data-testid="search-card-PII.Email"]');
    expect(card.text()).not.toContain('Detail page not wired');
    await card.get('a.explore__card-name').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('governance-tag');
    expect(router.currentRoute.value.params).toMatchObject({ id: 'tag-1' });
  });

  it('navigates a data-product card to its governance detail page (D26)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(governanceSearchBody('dataProduct', 'dp.one', 'One', 'dp-1'))));
    const { wrapper, router } = await mountView();
    const card = wrapper.get('[data-testid="search-card-dp.one"]');
    expect(card.text()).not.toContain('Detail page not wired');
    await card.get('a.explore__card-name').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('governance-data-product');
    expect(router.currentRoute.value.params).toMatchObject({ id: 'dp-1' });
  });

  it('keeps the unwired marker for a governance hit without an id (D26)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(governanceSearchBody('tag', 'PII.Email', 'Email'))));
    const { wrapper, router } = await mountView();
    const card = wrapper.get('[data-testid="search-card-PII.Email"]');
    expect(card.text()).toContain('Detail page not wired');
    await card.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('search');
  });

  // E-3d retarget: the preview lineage entry navigates to the entity
  // detail page's Lineage tab (pin `EntitySummaryPanel.handleLineageClick`
  // → `getEntityDetailsPath(type, fqn, EntityTabs.LINEAGE)`); the
  // full-page lineage graph was the previous destination, and it stays
  // reachable from the detail page itself — not from the preview.
  it('navigates to the detail-page Lineage tab from the preview lineage entry (D25, E-3d)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        // E-3a: the preview gates on the entity permission endpoint.
        if (url.pathname.includes('/v1/permissions/')) {
          return jsonResponse({
            resource: 'table',
            permissions: [{ operation: 'ViewBasic', access: 'allow' }],
          });
        }
        return jsonResponse({
          hits: {
            total: { value: 1 },
            hits: [
              {
                _id: 't1',
                _index: 'table_search_index',
                _source: {
                  name: 'orders',
                  displayName: 'Orders',
                  fullyQualifiedName: 'svc.db.schema.orders',
                  entityType: 'table',
                  owners: [],
                  tags: [],
                },
              },
            ],
          },
          aggregations: SEARCH_BODY.aggregations,
        });
      }),
    );
    const { wrapper, router } = await mountView();
    await wrapper.get('[data-testid="search-card-svc.db.schema.orders"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="explore-preview-lineage"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('asset');
    expect(router.currentRoute.value.params).toMatchObject({
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
    });
    expect(router.currentRoute.value.query).toMatchObject({ tab: 'lineage' });
  });
});

describe('SearchView explore tabs (Stage 2)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(SEARCH_BODY)),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('queries the selected tab index and falls back to the tab default sort', async () => {
    await mountView({ tab: 'table' });
    const mock = vi.mocked(fetch);
    const tabbed = mock.mock.calls
      .map((call) => new URL(String(call[0]), 'http://localhost'))
      .find((url) => url.searchParams.get('index') === 'table');
    expect(tabbed).toBeDefined();
    expect(tabbed?.searchParams.get('sort_field')).toBe('totalVotes');

    await mountView({ tab: 'tableColumn', sort: 'popularity' });
    const columnCall = vi
      .mocked(fetch)
      .mock.calls.map((call) => new URL(String(call[0]), 'http://localhost'))
      .find((url) => url.searchParams.get('index') === 'tableColumn');
    // popularity is not a column sort: official fallback is the column default (name).
    expect(columnCall?.searchParams.get('sort_field')).toBe('displayName.keyword');
  });

  it('toggles sort order into the route query', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.get('[data-testid="explore-sort-order"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.sort).toBe('relevance');
    expect(router.currentRoute.value.query.order).toBe('asc');
  });
});

describe('SearchView per-tab filter sets (D5/D8/D9)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubSearch(statusBuckets: Array<{ key: string; doc_count: number }> = []) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname === '/api/v1/search/aggregate' && init?.method === 'POST') {
          return jsonResponse({
            aggregations: { 'sterms#entityStatus': { buckets: statusBuckets } },
          });
        }
        return jsonResponse(SEARCH_BODY);
      }),
    );
  }

  function chipTestIds(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']): string[] {
    return wrapper
      .findAllComponents(Select)
      .map((select) => String(select.attributes('data-testid') ?? ''))
      .filter((testId) => testId.startsWith('explore-chip-'));
  }

  it('shows the table-tab set without entityType or certification', async () => {
    stubSearch();
    const { wrapper } = await mountView({ tab: 'table' });
    const ids = chipTestIds(wrapper);
    expect(ids).toEqual([
      'explore-chip-domain',
      'explore-chip-dataProduct',
      'explore-chip-owner',
      'explore-chip-tagFqn',
      'explore-chip-tier',
      'explore-chip-service',
      'explore-chip-serviceType',
      'explore-chip-database',
      'explore-chip-schema',
      'explore-chip-column',
      'explore-chip-tableType',
      'explore-chip-columnDescriptionStatus',
    ]);
  });

  it('shows only the four column-tab chips on the column tab', async () => {
    stubSearch();
    const { wrapper } = await mountView({ tab: 'tableColumn' });
    expect(chipTestIds(wrapper)).toEqual([
      'explore-chip-dataType',
      'explore-chip-tableName',
      'explore-chip-database',
      'explore-chip-schema',
    ]);
  });

  it('shows domains/classification on the tag tab', async () => {
    stubSearch();
    const { wrapper } = await mountView({ tab: 'tag' });
    expect(chipTestIds(wrapper)).toEqual(['explore-chip-domain', 'explore-chip-classification']);
  });

  it('hides the glossary Status chip while every entity is Unprocessed', async () => {
    stubSearch([{ key: 'Unprocessed', doc_count: 9 }]);
    const { wrapper } = await mountView({ tab: 'glossaryTerm' });
    expect(chipTestIds(wrapper)).toEqual([
      'explore-chip-domain',
      'explore-chip-owner',
      'explore-chip-tagFqn',
      'explore-chip-glossary',
    ]);
  });

  it('shows the glossary Status chip once an entity left Unprocessed', async () => {
    stubSearch([
      { key: 'Unprocessed', doc_count: 9 },
      { key: 'Approved', doc_count: 1 },
    ]);
    const { wrapper } = await mountView({ tab: 'glossaryTerm' });
    expect(chipTestIds(wrapper)).toContain('explore-chip-entityStatus');
  });

  it('sends a "No owners" selection as must_not.exists in query_filter, never in q', async () => {
    stubSearch();
    const { wrapper } = await mountView({ q: 'orders' });
    emitSelect(wrapper, 'explore-chip-owner', ['OM_NULL_FIELD']);
    await flushPromises();
    expect(wrapper.find('[data-testid="search-active-owner-OM_NULL_FIELD"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="search-active-owner-OM_NULL_FIELD"]').text()).toBe('No Owners');
    const urls = vi
      .mocked(fetch)
      .mock.calls.map(([input]) => new URL(String(input), 'http://localhost'));
    const withNull = urls.find((url) =>
      (url.searchParams.get('query_filter') ?? '').includes('ownerDisplayName'),
    );
    expect(withNull).toBeDefined();
    expect(withNull?.searchParams.get('query_filter')).toContain('must_not');
    expect(withNull?.searchParams.get('q')).not.toContain('ownerDisplayName');
  });

  it('keeps an off-tab filter visible as a removable tag', async () => {
    stubSearch();
    const { wrapper } = await mountView({ tableType: 'Regular' });
    // The all-tab has no tableType chip, but the active filter must
    // stay visible and removable instead of silently applied.
    expect(chipTestIds(wrapper)).not.toContain('explore-chip-tableType');
    const tag = wrapper.find('[data-testid="search-active-tableType-Regular"]');
    expect(tag.exists()).toBe(true);
    expect(tag.text()).toBe('Table Type: Regular');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function facetOptionsFetch(input: RequestInfo | URL) {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.includes('/v1/search/entityTypeCounts')) {
      // Zero counts: no tab auto-selects, so the all-tab chip set
      // (with the entityType chip) renders and the facet fetch runs.
      return jsonResponse(countsBody([]));
    }
    if (url.searchParams.get('size') === '0' && url.searchParams.get('q')?.includes('service.displayName.keyword:mysql')) {
      // The per-facet options fetch for the entityType chip: Tag is
      // excluded from q, so the aggregation still carries Metric.
      return jsonResponse({
        hits: { total: { value: 0 }, hits: [] },
        aggregations: {
          'sterms#entityType': {
            buckets: [
              { key: 'tag', doc_count: 17 },
              { key: 'metric', doc_count: 2 },
            ],
          },
        },
      });
    }
    if (url.searchParams.get('size') === '0' && url.searchParams.get('q')?.includes('entityType:tag')) {
      // The per-facet options fetch for the service chip: the service
      // filter is excluded from q, so other services stay available.
      return jsonResponse({
        hits: { total: { value: 0 }, hits: [] },
        aggregations: {
          'sterms#service.displayName.keyword': {
            buckets: [
              { key: 'mysql', doc_count: 1 },
              { key: 'postgres', doc_count: 1 },
            ],
          },
        },
      });
    }
    return jsonResponse(SEARCH_BODY);
  }

  it('keeps Metric in the entityType chip after Tag is selected', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => facetOptionsFetch(input)));
    const { wrapper } = await mountView({ q: 'orders', entityType: 'tag', service: 'mysql' });
    const select = wrapper
      .findAllComponents(Select)
      .find((item) => item.attributes('data-testid') === 'explore-chip-entityType');
    // Only calls issued by opening the chip count: mounting also issues
    // size-0 calls (estate presence, estate drill) with overlapping q.
    const callsBefore = vi.mocked(fetch).mock.calls.length;
    select?.vm.$emit('dropdownVisibleChange', true);
    await flushPromises();
    const facetCalls = vi
      .mocked(fetch)
      .mock.calls.slice(callsBefore)
      .map(([input]) => new URL(String(input), 'http://localhost'))
      .filter(
        (url) =>
          url.searchParams.get('size') === '0' &&
          url.searchParams.get('q') === 'orders AND service.displayName.keyword:mysql',
      );
    expect(facetCalls).toHaveLength(1);
    expect(facetCalls[0].searchParams.get('q')).not.toContain('entityType:tag');
    const options = select?.props('options') as { value: string; label: string }[] | undefined;
    expect(options?.map((option) => option.value)).toEqual(['tag', 'metric']);
  });

  it('keeps other services in the service chip after one service is selected', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => facetOptionsFetch(input)));
    const { wrapper } = await mountView({ q: 'orders', entityType: 'tag', service: 'mysql' });
    const select = wrapper
      .findAllComponents(Select)
      .find((item) => item.attributes('data-testid') === 'explore-chip-service');
    const callsBefore = vi.mocked(fetch).mock.calls.length;
    select?.vm.$emit('dropdownVisibleChange', true);
    await flushPromises();
    const facetCalls = vi
      .mocked(fetch)
      .mock.calls.slice(callsBefore)
      .map(([input]) => new URL(String(input), 'http://localhost'))
      .filter(
        (url) =>
          url.searchParams.get('size') === '0' &&
          url.searchParams.get('q') === 'orders AND entityType:tag',
      );
    expect(facetCalls).toHaveLength(1);
    expect(facetCalls[0].searchParams.get('q')).not.toContain('service.displayName.keyword:mysql');
    const options = select?.props('options') as { value: string; label: string }[] | undefined;
    expect(options?.map((option) => option.value)).toEqual(['mysql', 'postgres']);
  });

  it('uses NLQ search and echoes applied filters when NLP is active (D11)', async () => {
    const nlqBody = {
      ...SEARCH_BODY,
      applied_quick_filters: { fieldList: ['owner'] },
    };
    // Settle the mount's keyword search before toggling NLP: the
    // mount's runSearch must complete first, or its late keyword
    // response overwrites the NLQ echo (runSearch has no generation
    // guard yet — a stale run can still overwrite a newer one).
    stubSearch();
    const { wrapper } = await mountView({ q: 'customer' });
    // The default stub asserts include_aggregations on every call, which
    // the NLQ call does not send; swap it before flipping the toggle.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        return jsonResponse(url.pathname.includes('/search/nlq/query') ? nlqBody : SEARCH_BODY);
      }),
    );
    expect(wrapper.find('[data-testid="explore-nlq-applied-filters"]').exists()).toBe(false);
    const store = useSearchStore();
    store.isNLPEnabled = true;
    store.isNLPActive = true;
    // The toggle refires the search through the NLQ path; wait for the
    // echo line instead of assuming a fixed number of promise ticks —
    // the chain is watch → runSearch → NLQ fetch → remap → render.
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="explore-nlq-applied-filters"]').exists()).toBe(true),
    );
    const calls = vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input), 'http://localhost'));
    const nlqCalls = calls.filter((url) => url.pathname.includes('/search/nlq/query'));
    expect(nlqCalls.length).toBeGreaterThan(0);
    expect(nlqCalls[0].searchParams.get('q')).toBe('customer');
    // The query auto-selects the table tab (counts tie → first tab),
    // so the NLQ search runs on the active tab's index, not dataAsset.
    expect(nlqCalls[0].searchParams.get('index')).toBe('table');
    expect(wrapper.find('[data-testid="explore-nlq-applied-filters"]').text()).toContain(
      'NLQ applied filters: owner',
    );
  });
});

describe('SearchView result cards (B2-E6, D18–D24)', () => {
  function cardSearchBody(): Record<string, unknown> {
    return {
      hits: {
        total: { value: 1 },
        hits: [
          {
            _id: 't1',
            _index: 'table_search_index',
            _source: {
              name: 'orders',
              displayName: 'Orders',
              fullyQualifiedName: 'svc.db.schema.orders',
              entityType: 'table',
              description: 'Daily orders report',
              serviceType: 'BigQuery',
              service: { displayName: 'BigQuery Prod', fullyQualifiedName: 'bigquery' },
              database: { name: 'analytics', fullyQualifiedName: 'bigquery.analytics' },
              databaseSchema: { name: 'marts', fullyQualifiedName: 'bigquery.analytics.marts' },
              owners: [{ name: 'data-eng', displayName: 'Data Eng' }],
              tags: [{ tagFQN: 'PII.Sensitive', name: 'Sensitive' }],
            },
            highlight: {
              displayName: ['<span class="text-highlighter">Orders</span>'],
              description: ['Daily <span class="text-highlighter">orders</span> report'],
              'columns.name': ['order_id', 'customer_id'],
              'columns.name.ngram': ['ord'],
              table_name: ['Orders'],
            },
          },
        ],
      },
      aggregations: SEARCH_BODY.aggregations,
    };
  }

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname.includes('/v1/search/query')) {
          return jsonResponse(cardSearchBody());
        }
        if (url.pathname.includes('/v1/permissions/user')) {
          return jsonResponse({
            resource: 'user',
            permissions: [{ operation: 'ViewBasic', access: 'allow' }],
          });
        }
        if (url.pathname.includes('/v1/tables/name/')) {
          return jsonResponse({
            id: 'tbl-1',
            name: 'orders',
            fullyQualifiedName: 'svc.db.schema.orders',
            columns: [{ name: 'id', dataType: 'BIGINT' }],
          });
        }
        return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('links breadcrumb crumbs to the parent database and schema (D18)', async () => {
    const { wrapper } = await mountView({ q: 'orders' });
    const crumbs = wrapper.get('[data-testid="explore-card-breadcrumbs-svc.db.schema.orders"]');
    const links = crumbs.findAll('a');
    expect(links.map((link) => link.text())).toEqual(['analytics', 'marts']);
    expect(links.map((link) => link.attributes('href'))).toEqual([
      '/assets/database/bigquery.analytics',
      '/assets/databaseSchema/bigquery.analytics.marts',
    ]);
    expect(crumbs.text()).toContain('BigQuery Prod');
  });

  it('highlights the ES-matched terms in the name and description (D19)', async () => {
    const { wrapper } = await mountView({ q: 'orders' });
    const card = wrapper.get('[data-testid="search-card-svc.db.schema.orders"]');
    const highlighted = card.findAll('.text-highlighter').map((node) => node.text());
    expect(highlighted).toContain('Orders');
    expect(highlighted).toContain('orders');
  });

  it('lists hit fields as Matches, excluding .ngram and name fields (D20)', async () => {
    const { wrapper } = await mountView({ q: 'orders' });
    const matches = wrapper.get('[data-testid="explore-card-matches-svc.db.schema.orders"]');
    expect(matches.text()).toContain('Matches:');
    expect(matches.text()).toContain('1 in Description');
    expect(matches.text()).toContain('2 in Columns Name');
    expect(matches.text()).not.toContain('ngram');
    expect(matches.text()).not.toContain('Table Name');
  });

  it('shows the entity icon instead of the type Tag chip (D22)', async () => {
    const { wrapper } = await mountView({ q: 'orders' });
    const card = wrapper.get('[data-testid="search-card-svc.db.schema.orders"]');
    expect(card.find('.explore__card-icon').exists()).toBe(true);
    expect(card.find('.explore__card-icon').classes()).toContain('anticon');
    expect(card.text()).not.toContain('Sensitive');
  });

  it('prefetches the table detail on name hover, once per FQN (D24)', async () => {
    const { wrapper } = await mountView({ q: 'orders' });
    const nameLink = wrapper.get('[data-testid="search-card-svc.db.schema.orders"] a.explore__card-name');
    const callsBefore = vi
      .mocked(fetch)
      .mock.calls.map(([input]) => String(input))
      .filter((url) => url.includes('/v1/tables/name/')).length;
    await nameLink.trigger('mouseenter');
    await flushPromises();
    await nameLink.trigger('mouseenter');
    await flushPromises();
    const detailCalls = vi
      .mocked(fetch)
      .mock.calls.map(([input]) => String(input))
      .filter((url) => url.includes('/v1/tables/name/'));
    expect(detailCalls.length - callsBefore).toBe(1);
    expect(detailCalls[0]).toContain(encodeURIComponent('svc.db.schema.orders'));
  });
});

function countsBody(buckets: Array<{ key: string; doc_count: number }>) {
  return {
    hits: { total: { value: 0 }, hits: [] },
    aggregations: { 'sterms#entityType': { buckets } },
  };
}

function searchUrls() {
  return vi
    .mocked(fetch)
    .mock.calls.map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((url) => url.pathname.includes('/v1/search/query'));
}

describe('SearchView tab-switch semantics (D30)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname.includes('/v1/search/entityTypeCounts')) {
          return jsonResponse(countsBody([
            { key: 'table', doc_count: 1 },
            { key: 'topic', doc_count: 1 },
          ]));
        }
        return jsonResponse(SEARCH_BODY);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function switchTab(
    wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'],
    key: string,
  ) {
    // The top strip is gone (EXP-P0-1); tabs live in the left panel
    // and only render while a query is active (pin ExploreV1).
    await wrapper.get(`[data-testid="explore-left-tab-${key}"]`).trigger('click');
    await flushPromises();
  }

  it('carries only owner + tag filters, resets sort to _score with a query, and returns to page 1', async () => {
    const { wrapper, router } = await mountView({
      q: 'orders',
      entityType: 'table',
      owner: 'alice',
      tagFqn: 'PII.Sensitive',
      service: 'mysql',
      sort: 'popularity',
      order: 'desc',
    });
    await switchTab(wrapper, 'topic');
    expect(router.currentRoute.value.query).toMatchObject({
      q: 'orders',
      owner: 'alice',
      tagFqn: 'PII.Sensitive',
      sort: 'relevance',
    });
    // The tab switch navigates to /explore/:tab — the tab is a path
    // param now, not a query param.
    expect(router.currentRoute.value.params.tab).toBe('topics');
    expect(router.currentRoute.value.query.tab).toBeUndefined();
    expect(router.currentRoute.value.query.entityType).toBeUndefined();
    expect(router.currentRoute.value.query.service).toBeUndefined();
    expect(router.currentRoute.value.query.page).toBeUndefined();
    expect(router.currentRoute.value.query.order).toBeUndefined();
    const tabbed = searchUrls().find((url) => url.searchParams.get('index') === 'topic');
    expect(tabbed?.searchParams.get('sort_field')).toBe('_score');
  });

  it('falls back to the new tab default sort without a query', async () => {
    // Without a query the left aside is the estate tree, not the tab
    // list (pin ExploreV1 shows tabs only while searching), so the
    // tab arrives via the URL; the sort is the new tab's default,
    // not _score, and no sort param is written.
    const { wrapper, router } = await mountView({}, { tab: 'topics' });
    expect(wrapper.find('[data-testid="explore-left-panel"]').exists()).toBe(false);
    expect(router.currentRoute.value.query.sort).toBeUndefined();
    const tabbed = searchUrls().find((url) => url.searchParams.get('index') === 'topic');
    expect(tabbed?.searchParams.get('sort_field')).toBe('totalVotes');
  });
});

describe('SearchView page clamp and pagination visibility (D29)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname.includes('/v1/search/entityTypeCounts')) {
          return jsonResponse(countsBody([{ key: 'table', doc_count: 100 }]));
        }
        if (url.searchParams.get('size') === '0') {
          return jsonResponse({
            hits: { total: { value: 100 }, hits: [] },
            aggregations: { 'sterms#entityType': { buckets: [{ key: 'table', doc_count: 100 }] } },
          });
        }
        return jsonResponse({ ...SEARCH_BODY, hits: { ...SEARCH_BODY.hits, total: { value: 100 } } });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    document.body.innerHTML = '';
  });

  it('clamps an out-of-range page to the last page and corrects the URL', async () => {
    const { wrapper, router } = await mountView({ page: '99' });
    await flushPromises();
    expect(router.currentRoute.value.query.page).toBe('6');
    const clamped = searchUrls().find(
      (url) => url.searchParams.get('from') === '90' && url.searchParams.get('size') === '15',
    );
    expect(clamped).toBeDefined();
    expect(wrapper.find('[data-testid="search-pagination"]').exists()).toBe(true);
  });

  it('shows pagination whenever there is at least one result, even below one page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname.includes('/v1/search/entityTypeCounts')) {
          return jsonResponse(countsBody([{ key: 'table', doc_count: 3 }]));
        }
        return jsonResponse(SEARCH_BODY);
      }),
    );
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="search-pagination"]').exists()).toBe(true);
  });
});

describe('SearchView results badge (D34)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubWithTotal(total: number) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname.includes('/v1/search/entityTypeCounts')) {
          return jsonResponse(countsBody([{ key: 'table', doc_count: total }]));
        }
        return jsonResponse({ ...SEARCH_BODY, hits: { ...SEARCH_BODY.hits, total: { value: total } } });
      }),
    );
  }

  it('shows no count badge on the bare unfiltered browse', async () => {
    stubWithTotal(3);
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="search-results-count"]').exists()).toBe(false);
  });

  it('shows "N results" when a query or a filter is applied', async () => {
    stubWithTotal(3);
    const queried = await mountView({ q: 'orders' });
    expect(queried.wrapper.get('[data-testid="search-results-count"]').text()).toBe('3 results');
    const filtered = await mountView({ entityType: 'table' });
    expect(filtered.wrapper.get('[data-testid="search-results-count"]').text()).toBe('3 results');
  });

  it('uses the singular for one result and marks the 10000 total cap', async () => {
    stubWithTotal(1);
    const single = await mountView({ q: 'orders' });
    expect(single.wrapper.get('[data-testid="search-results-count"]').text()).toBe('1 result');
    stubWithTotal(10000);
    const capped = await mountView({ q: 'orders' });
    expect(capped.wrapper.get('[data-testid="search-results-count"]').text()).toBe(
      '10000 results (total capped at 10,000)',
    );
  });
});

describe('SearchView Explore request parameters and cache (D32/D31)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname.includes('/v1/search/entityTypeCounts')) {
          return jsonResponse(countsBody([
            { key: 'table', doc_count: 1 },
            { key: 'topic', doc_count: 1 },
          ]));
        }
        return jsonResponse(SEARCH_BODY);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mainSearchUrls(index?: string) {
    return searchUrls().filter(
      (url) =>
        url.searchParams.get('size') === '15' &&
        (index === undefined || url.searchParams.get('index') === index),
    );
  }

  it('sends track_total_hits, explain and exclude_source_fields on the results search (D32)', async () => {
    await mountView({ q: 'orders' });
    // The query auto-selects the table tab (counts tie → first tab).
    const main = mainSearchUrls('table');
    expect(main).toHaveLength(1);
    expect(main[0].searchParams.get('track_total_hits')).toBe('true');
    expect(main[0].searchParams.get('explain')).toBe('false');
    expect(main[0].searchParams.getAll('exclude_source_fields')).toEqual([
      'columns',
      'queries',
      'columnNames',
      'dataModel',
    ]);
  });

  it('does not refetch the same search when switching back to it within the cache window (D31)', async () => {
    // Pin the sort to relevance: the auto-selected table search
    // otherwise uses the table default (totalVotes) while the
    // explicit switch uses _score — different cache keys that would
    // refetch. Pin behaves the same: auto-select is state and keeps
    // the URL sort, the switch navigates with _score.
    const { wrapper } = await mountView({ q: 'orders', sort: 'relevance' });
    // The query auto-selects the table tab (counts tie → first tab).
    expect(mainSearchUrls('table')).toHaveLength(1);
    await wrapper.get('[data-testid="explore-left-tab-topic"]').trigger('click');
    await flushPromises();
    expect(mainSearchUrls('topic')).toHaveLength(1);
    await wrapper.get('[data-testid="explore-left-tab-table"]').trigger('click');
    await flushPromises();
    expect(mainSearchUrls('table')).toHaveLength(1);
  });
});

describe('SearchView tab counts from the counts endpoint (D4/D3)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname.includes('/v1/search/entityTypeCounts')) {
          return jsonResponse(countsBody([
            { key: 'table', doc_count: 2 },
            { key: 'dashboard', doc_count: 1 },
          ]));
        }
        return jsonResponse(SEARCH_BODY);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('counts every tab from the endpoint and hides zero-result tabs when a query is present', async () => {
    const { wrapper, router } = await mountView({ q: 'orders' });
    // The query auto-selects the table tab (most hits); the URL stays
    // `/explore` — the auto-selected tab is state, not a route param.
    expect(router.currentRoute.value.params.tab).toBeUndefined();
    const panel = wrapper.get('[data-testid="explore-left-panel"]');
    expect(panel.find('[data-testid="explore-left-tab-table"]').text()).toContain('3');
    expect(panel.find('[data-testid="explore-left-tab-dashboard"]').text()).toContain('1');
    expect(panel.find('[data-testid="explore-left-tab-topic"]').exists()).toBe(false);
    const countsCall = vi
      .mocked(fetch)
      .mock.calls.map(([input]) => new URL(String(input), 'http://localhost'))
      .find((url) => url.pathname.includes('/v1/search/entityTypeCounts'));
    expect(countsCall).toBeDefined();
    expect(countsCall?.searchParams.get('q')).toBe('orders');
    expect(countsCall?.searchParams.get('index')).toContain('tableColumn');
    expect(countsCall?.searchParams.get('index')).toContain('apiCollection');
  });

  it('keeps the active tab even at zero hits', async () => {
    const { wrapper } = await mountView({ q: 'orders', tab: 'topic' });
    const panel = wrapper.get('[data-testid="explore-left-panel"]');
    expect(panel.find('[data-testid="explore-left-tab-topic"]').text()).toContain('3');
  });

  it('shows the estate tree instead of tabs without a query', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="explore-left-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="explore-estate"]').exists()).toBe(true);
  });

  it('reads the tab from the /explore/:tab path param', async () => {
    const { wrapper, router } = await mountView({ q: 'orders' }, { tab: 'topics' });
    expect(router.currentRoute.value.params.tab).toBe('topics');
    const panel = wrapper.get('[data-testid="explore-left-panel"]');
    expect(panel.find('[data-testid="explore-left-tab-topic"]').classes()).toContain(
      'explore__left-tab--active',
    );
    const tabbed = vi
      .mocked(fetch)
      .mock.calls.map(([input]) => new URL(String(input), 'http://localhost'))
      .find((url) => url.searchParams.get('index') === 'topic');
    expect(tabbed).toBeDefined();
  });
});

describe('SearchView matching sharded families (D17)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname.includes('/v1/search/entityTypeCounts')) {
          return jsonResponse(countsBody([]));
        }
        if (url.pathname.includes('/v1/tables/name/')) {
          return jsonResponse({
            id: 't-1',
            fullyQualifiedName: 'svc.db.schema.orders20240101',
            tableType: 'Sharded',
            tableSharding: { prefix: 'orders' },
            deleted: false,
          });
        }
        if (
          url.pathname.includes('/v1/search/query') &&
          (url.searchParams.get('query_filter') ?? '').includes('Sharded')
        ) {
          return jsonResponse({
            hits: {
              total: { value: 1 },
              hits: [
                {
                  _id: 's1',
                  _index: 'table_search_index',
                  _source: {
                    name: 'orders20240101',
                    fullyQualifiedName: 'svc.db.schema.orders20240101',
                    entityType: 'table',
                  },
                },
              ],
            },
            aggregations: {},
          });
        }
        return jsonResponse(SEARCH_BODY);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the sharded-family section for a dated shard query', async () => {
    const { wrapper } = await mountView({ q: 'svc.db.schema.orders20240101' });
    const section = wrapper.find('[data-testid="explore-sharded-families"]');
    expect(section.exists()).toBe(true);
    expect(section.text()).toContain('Matching sharded families');
    const link = wrapper.get('[data-testid="explore-sharded-family"]');
    expect(link.text()).toBe('svc.db.schema.orders20240101');
    const lookup = searchUrls().find(
      (url) => (url.searchParams.get('query_filter') ?? '').includes('Sharded'),
    );
    expect(lookup).toBeDefined();
    expect(lookup?.searchParams.get('index')).toBe('table');
    const filter = JSON.parse(lookup?.searchParams.get('query_filter') ?? '');
    expect(filter.query.bool.must).toContainEqual({ term: { serviceType: 'BigQuery' } });
    expect(filter.query.bool.must).toContainEqual({ term: { tableType: 'Sharded' } });
    expect(filter.query.bool.must).toContainEqual({ term: { 'name.keyword': 'ordersyyyymmdd' } });
  });

  it('shows no sharded-family section for an ordinary query', async () => {
    const { wrapper } = await mountView({ q: 'orders' });
    expect(wrapper.find('[data-testid="explore-sharded-families"]').exists()).toBe(false);
  });
});

/**
 * Explore export (D10): Tools → Export scope modal, async CSV job claim,
 * and the failure-keeps-modal-open rule (pin ExploreV1.test.tsx:648).
 * The antd Dropdown is stubbed the same way AccessManageButton.test.ts
 * stubs it (overlay rendered when open), so the Export item is clickable.
 */
const ExportDropdownStub = defineComponent({
  props: { open: Boolean },
  emits: ['update:open'],
  setup(props, { slots, emit }) {
    return () =>
      h('div', { 'data-testid': 'dropdown-stub' }, [
        h(
          'div',
          {
            'data-testid': 'dropdown-trigger',
            onClick: () => emit('update:open', true),
          },
          slots.default?.(),
        ),
        props.open ? slots.overlay?.() : null,
      ]);
  },
});

describe('SearchView export (D10)', () => {
  let fetchUrls: string[] = [];
  let exportShouldFail = false;
  let countTotal = 3;
  // Total the stubbed search reports; 3 by default (SEARCH_BODY). Tests
  // that need a second page raise it so #319's validPage clamp does not
  // bounce the URL page back to 0.
  let searchTotal = 3;

  beforeEach(() => {
    fetchUrls = [];
    exportShouldFail = false;
    countTotal = 3;
    searchTotal = 3;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        fetchUrls.push(url.toString());
        if (url.pathname === '/api/v1/search/export/async') {
          if (exportShouldFail) {
            return jsonResponse({ message: 'Export failed due to a server error.' }, 500);
          }
          return jsonResponse({ jobId: 'job-1', message: 'Export initiated' });
        }
        if (url.searchParams.get('size') === '0') {
          return jsonResponse({
            hits: { total: { value: countTotal }, hits: [] },
            aggregations: {
              'sterms#entityType': {
                buckets: [
                  { key: 'table', doc_count: 1 },
                  { key: 'topic', doc_count: 1 },
                ],
              },
            },
          });
        }
        return jsonResponse({
          ...SEARCH_BODY,
          hits: { total: { value: searchTotal }, hits: SEARCH_BODY.hits.hits },
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  async function mountExportView(query: Record<string, string> = {}) {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/search', name: 'search', component: SearchView },
        { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
        { path: '/context-center', name: 'context-center-overview', component: { template: '<div>context</div>' } },
        { path: '/governance/domains', name: 'governance-domains', component: { template: '<div>domains</div>' } },
        {
          path: '/admin/settings/preferences/search',
          name: 'settings-preferences-search',
          component: { template: '<div>search settings</div>' },
        },
      ],
    });
    await router.push({ name: 'search', query });
    await router.isReady();
    const wrapper = mount(SearchView, {
      global: {
        plugins: [router, pinia, Antd, createTestI18n()],
        stubs: { ADropdown: ExportDropdownStub },
      },
    });
    await flushPromises();
    return { wrapper, router };
  }

  async function openExportModal(wrapper: Awaited<ReturnType<typeof mountExportView>>['wrapper']) {
    // The merged Tools menu keeps HEAD's trigger button testid; clicking
    // the Dropdown root does not reach the stub's trigger handler, so
    // click the button (same as the D12 ranking-details tests).
    await wrapper.get('[data-testid="explore-tools-trigger"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="explore-export"]').trigger('click');
    await flushPromises();
  }

  function exportModal(wrapper: Awaited<ReturnType<typeof mountExportView>>['wrapper']) {
    return wrapper.findComponent({ name: 'ExploreExportScopeModal' });
  }

  function clickModalOk() {
    (document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement).click();
  }

  it('opens the scope modal from Tools → Export and counts with a size-0 trackTotalHits query', async () => {
    const { wrapper } = await mountExportView();
    await openExportModal(wrapper);
    expect(exportModal(wrapper).props('open')).toBe(true);
    expect(document.body.textContent).toContain('Export Scope');
    expect(document.body.textContent).toContain('(3 Results)');
    const countCall = fetchUrls
      .map((raw) => new URL(raw))
      .find(
        (url) =>
          url.pathname === '/api/v1/search/query' &&
          url.searchParams.get('size') === '0' &&
          url.searchParams.get('track_total_hits') === 'true',
      );
    expect(countCall).toBeDefined();
    expect(countCall?.searchParams.get('index')).toBe('dataAsset');
    wrapper.unmount();
  });

  it('exports the visible tab scope as an async job, claims it, and toasts', async () => {
    const successSpy = vi.spyOn(message, 'success');
    const refreshEvents: Event[] = [];
    const onRefresh = (event: Event) => refreshEvents.push(event);
    window.addEventListener('csv-jobs-refresh', onRefresh);
    try {
      const { wrapper } = await mountExportView({ q: 'orders', tab: 'table' });
      await openExportModal(wrapper);
      expect(document.body.textContent).toContain('(1 Results)');
      (document.body.querySelector('[data-testid="export-scope-visible-card"]') as HTMLElement).click();
      await flushPromises();
      clickModalOk();
      await flushPromises();
      const exportCall = fetchUrls
        .map((raw) => new URL(raw))
        .find((url) => url.pathname === '/api/v1/search/export/async');
      expect(exportCall).toBeDefined();
      expect(exportCall?.searchParams.get('q')).toBe('orders');
      expect(exportCall?.searchParams.get('index')).toBe('table');
      expect(exportCall?.searchParams.get('size')).toBe('1');
      expect(exportCall?.searchParams.get('sort_field')).toBe('totalVotes');
      expect(exportCall?.searchParams.get('sort_order')).toBe('desc');
      expect(exportCall?.searchParams.has('from')).toBe(false);
      expect(exportModal(wrapper).props('open')).toBe(false);
      expect(successSpy).toHaveBeenCalledWith(expect.stringContaining('Export started'));
      expect(refreshEvents).toHaveLength(1);
      wrapper.unmount();
    } finally {
      window.removeEventListener('csv-jobs-refresh', onRefresh);
    }
  });

  // URL `page` is 0-based in this codebase (Pagination shows `page + 1`,
  // onPageChange writes `next - 1`): page '1' is the second displayed page,
  // so the visible-page offset is 1 * 15 = 15. The stubbed total is raised
  // to 30 so page 1 is in range (totalPages 2) and the validPage clamp
  // leaves it alone.
  it('exports the visible page in browse mode with from set to the page offset', async () => {
    searchTotal = 30;
    const { wrapper } = await mountExportView({ page: '1' });
    await openExportModal(wrapper);
    (document.body.querySelector('[data-testid="export-scope-visible-card"]') as HTMLElement).click();
    await flushPromises();
    clickModalOk();
    await flushPromises();
    const exportCall = fetchUrls
      .map((raw) => new URL(raw))
      .find((url) => url.pathname === '/api/v1/search/export/async');
    expect(exportCall?.searchParams.get('index')).toBe('dataAsset');
    expect(exportCall?.searchParams.get('size')).toBe('3');
    expect(exportCall?.searchParams.get('from')).toBe('15');
    wrapper.unmount();
  });

  it('keeps the modal open with the inline error when the export fails', async () => {
    exportShouldFail = true;
    const { wrapper } = await mountExportView({ q: 'orders' });
    await openExportModal(wrapper);
    clickModalOk();
    await flushPromises();
    expect(exportModal(wrapper).props('open')).toBe(true);
    expect(document.body.textContent).toContain('Export failed due to a server error.');
    wrapper.unmount();
  });

  it('shows the limit alert and disables export when all assets exceed 200000', async () => {
    countTotal = 200001;
    const { wrapper } = await mountExportView({ q: 'orders' });
    await openExportModal(wrapper);
    expect(document.body.textContent).toContain('Export is limited to 200000 assets');
    const okButton = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLButtonElement;
    expect(okButton.disabled).toBe(true);
    wrapper.unmount();
  });
});

describe('SearchView preview open/close (E-3a)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname.includes('/v1/search/entityTypeCounts')) {
          return jsonResponse({
            hits: { total: { value: 0 }, hits: [] },
            aggregations: {
              'sterms#entityType': {
                buckets: [
                  { key: 'table', doc_count: 1 },
                  { key: 'topic', doc_count: 1 },
                ],
              },
            },
          });
        }
        if (url.pathname.includes('/v1/search/query')) {
          return jsonResponse(SEARCH_BODY);
        }
        // E-3a: the preview gates on the entity permission endpoint.
        if (url.pathname.includes('/v1/permissions/')) {
          return jsonResponse({
            resource: 'table',
            permissions: [{ operation: 'ViewBasic', access: 'allow' }],
          });
        }
        return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('auto-displays the first hit and closes on Escape (pin ExploreV1 effect + :1178)', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="explore-preview"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="explore-preview"]').text()).toContain('Orders');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('[data-testid="explore-preview"]').exists()).toBe(false);
    // The results stay listed; only the panel closes.
    expect(wrapper.find('[data-testid="search-card-svc.db.schema.orders"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('closes from the preview X button and reopens on a card click', async () => {
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="explore-preview-close"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="explore-preview"]').exists()).toBe(false);
    await wrapper.find('[data-testid="search-card-kafka.events"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="explore-preview"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="explore-preview"]').text()).toContain('events');
    wrapper.unmount();
  });

  it('switching cards switches the preview entity', async () => {
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="search-card-kafka.events"]').trigger('click');
    await flushPromises();
    const preview = wrapper.get('[data-testid="explore-preview"]');
    expect(preview.text()).toContain('events');
    expect(preview.text()).not.toContain('Orders');
    wrapper.unmount();
  });

  it('renders no panel when results are empty (pin: no panel when nothing is selected)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname.includes('/v1/permissions/')) {
          return jsonResponse({
            resource: 'table',
            permissions: [{ operation: 'ViewBasic', access: 'allow' }],
          });
        }
        return jsonResponse({
          hits: { total: { value: 0 }, hits: [] },
          aggregations: { 'sterms#entityType': { buckets: [] } },
        });
      }),
    );
    const { wrapper } = await mountView({ q: 'zzz' });
    expect(wrapper.find('[data-testid="explore-preview"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="explore-empty"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
