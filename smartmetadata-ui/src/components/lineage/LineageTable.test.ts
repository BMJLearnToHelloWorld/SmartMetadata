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
import Antd, { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import LineageTable from './LineageTable.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const CENTER_FQN = 'svc.db.schema.orders';

const DOWNSTREAM_COUNT = {
  nodes: {
    [CENTER_FQN]: {
      entity: { id: 'center-id', type: 'table', name: 'orders', fullyQualifiedName: CENTER_FQN },
      nodeDepth: 0,
      paging: { entityUpstreamCount: 1, entityDownstreamCount: 1 },
    },
    'svc.db.schema.mart_orders': {
      entity: {
        id: 'down-id',
        type: 'table',
        name: 'mart_orders',
        displayName: 'Mart Orders',
        fullyQualifiedName: 'svc.db.schema.mart_orders',
        description: 'Downstream mart',
        domains: [{ id: 'd1', name: 'sales', displayName: 'Sales', type: 'domain' }],
        owners: [{ id: 'u1', name: 'alice', displayName: 'Alice', type: 'user' }],
        tier: 'Tier.Tier1',
        tags: [
          { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' },
          { tagFQN: 'Glossary.BusinessTerm', name: 'BusinessTerm', source: 'Glossary' },
        ],
      },
      nodeDepth: 1,
      paging: { entityUpstreamCount: 0, entityDownstreamCount: 0 },
    },
  },
  paginationInfo: {
    downstreamDepthInfo: [
      { depth: 0, entityCount: 1 },
      { depth: 1, entityCount: 1 },
    ],
    upstreamDepthInfo: [
      { depth: 0, entityCount: 1 },
      { depth: 1, entityCount: 1 },
    ],
    maxDownstreamDepth: 1,
    maxUpstreamDepth: 1,
    totalDownstreamEntities: 1,
    totalUpstreamEntities: 1,
  },
};

const UPSTREAM_COUNT = {
  nodes: {
    [CENTER_FQN]: {
      entity: { id: 'center-id', type: 'table', name: 'orders', fullyQualifiedName: CENTER_FQN },
      nodeDepth: 0,
      paging: { entityUpstreamCount: 1, entityDownstreamCount: 1 },
    },
    'svc.db.schema.raw_orders': {
      entity: {
        id: 'up-id',
        type: 'table',
        name: 'raw_orders',
        fullyQualifiedName: 'svc.db.schema.raw_orders',
        description: 'Upstream raw',
      },
      nodeDepth: -1,
      paging: { entityUpstreamCount: 0, entityDownstreamCount: 0 },
    },
  },
  paginationInfo: DOWNSTREAM_COUNT.paginationInfo,
};

const COLUMN_SEARCH = {
  nodes: {
    'svc.db.schema.raw_orders': {
      entity: {
        id: 'up-id',
        type: 'table',
        name: 'raw_orders',
        fullyQualifiedName: 'svc.db.schema.raw_orders',
        description: 'Raw source',
        owners: [{ id: 'u1', name: 'alice', type: 'user' }],
        columns: [
          {
            name: 'id',
            fullyQualifiedName: 'svc.db.schema.raw_orders.id',
            tags: [{ tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' }],
          },
        ],
      },
      nodeDepth: 1,
    },
    [CENTER_FQN]: {
      entity: { id: 'center-id', type: 'table', name: 'orders', fullyQualifiedName: CENTER_FQN },
      nodeDepth: 0,
    },
  },
  upstreamEdges: {
    e1: {
      fromEntity: { id: 'up-id', fullyQualifiedName: 'svc.db.schema.raw_orders', type: 'table' },
      toEntity: { id: 'center-id', fullyQualifiedName: CENTER_FQN, type: 'table' },
      columns: [{ fromColumns: ['svc.db.schema.raw_orders.id'], toColumn: 'svc.db.schema.orders.id' }],
    },
  },
  downstreamEdges: {},
};

function fetchStub() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('exportByEntityCountAsync')) {
      return jsonResponse({ jobId: 'job-1', message: 'Export initiated successfully.' });
    }
    if (url.includes('getPaginationInfo')) {
      return jsonResponse(DOWNSTREAM_COUNT.paginationInfo);
    }
    if (url.includes('getLineageByEntityCount')) {
      return jsonResponse(url.includes('direction=Upstream') ? UPSTREAM_COUNT : DOWNSTREAM_COUNT);
    }
    if (url.includes('/getLineage')) {
      return jsonResponse(COLUMN_SEARCH);
    }
    return jsonResponse({}, 404);
  });
}

function fetchUrls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

async function mountTable(query: Record<string, string> = {}, props: Record<string, unknown> = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/lineage/:entityType/:fqn', name: 'lineage', component: { template: '<div/>' } },
      { path: '/asset/:entityType/:fqn', name: 'asset', component: { template: '<div/>' } },
    ],
  });
  await router.push({ name: 'lineage', params: { entityType: 'table', fqn: CENTER_FQN }, query });
  await router.isReady();
  const wrapper = mount(LineageTable, {
    props: { entityType: 'table', fqn: CENTER_FQN, ...props },
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return { wrapper, router, pinia, fetchMock: vi.mocked(fetch) };
}

describe('LineageTable', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', fetchStub());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('fetches the count endpoint and renders the full table-level columns', async () => {
    const fetchMock = vi.mocked(fetch);
    const { wrapper } = await mountTable();
    const firstUrl = fetchUrls(fetchMock).find((url) => url.includes('getLineageByEntityCount')) ?? '';
    expect(firstUrl).toContain('direction=Downstream');
    // The table's default depth is the session depth — the official store default 3.
    expect(firstUrl).toContain('nodeDepth=3');
    expect(firstUrl).toContain('maxDepth=3');
    expect(firstUrl).toContain('from=0');
    expect(firstUrl).toContain('size=15');
    expect(firstUrl).toContain('include_pagination_info=true');
    const text = wrapper.text();
    expect(text).toContain('Mart Orders');
    expect(text).toContain('Downstream mart');
    expect(text).toContain('Sales');
    expect(text).toContain('Alice');
    expect(text).toContain('Tier.Tier1');
    expect(text).toContain('Sensitive');
    expect(text).toContain('BusinessTerm');
    // The downstream direction badge carries the paging-info count.
    expect(wrapper.find('[data-testid="lineage-impact-downstream"]').text()).toContain('1');
  });

  it('renders no depth, search or CSV controls in its header (they live in the canvas header)', async () => {
    const { wrapper } = await mountTable();
    expect(wrapper.find('[data-testid="lineage-impact-depth"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="lineage-impact-search"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="lineage-impact-export-csv"]').exists()).toBe(false);
    // Pin's extraTableFilters: direction toggle + impact-on dropdown only.
    expect(wrapper.find('[data-testid="lineage-impact-downstream"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="impact-on-dropdown"]').exists()).toBe(true);
  });

  it('requests pagination info only once while the fetch shape is unchanged', async () => {
    const fetchMock = vi.mocked(fetch);
    const { router } = await mountTable();
    const countUrls = () => fetchUrls(fetchMock).filter((url) => url.includes('getLineageByEntityCount'));
    expect(countUrls()).toHaveLength(1);
    expect(countUrls()[0]).toContain('include_pagination_info=true');
    // A second load with the same fetch shape (page size change only)
    // re-fetches the page but must not re-request pagination info.
    await router.push({ query: { pageSize: '25' } });
    await flushPromises();
    expect(countUrls()).toHaveLength(2);
    expect(countUrls()[1]).toContain('include_pagination_info=false');
    expect(countUrls()[1]).toContain('size=25');
  });

  it('switches direction through the URL and refetches upstream', async () => {
    const fetchMock = vi.mocked(fetch);
    const { wrapper, router } = await mountTable();
    await wrapper.find('[data-testid="lineage-impact-upstream"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.dir).toBe('Upstream');
    // The depth written back is the session default — the official store default 3.
    expect(router.currentRoute.value.query.depth).toBe('3');
    const lastUrl = fetchUrls(fetchMock).filter((url) => url.includes('getLineageByEntityCount')).at(-1) ?? '';
    expect(lastUrl).toContain('direction=Upstream');
    expect(wrapper.text()).toContain('raw_orders');
    expect(wrapper.text()).not.toContain('Mart Orders');
  });

  it('reads dir/depth/page from the URL on mount', async () => {
    const fetchMock = vi.mocked(fetch);
    await mountTable({ dir: 'Upstream', depth: '2', currentPage: '2', pageSize: '25' });
    const url = fetchUrls(fetchMock).find((u) => u.includes('getLineageByEntityCount')) ?? '';
    expect(url).toContain('direction=Upstream');
    expect(url).toContain('nodeDepth=2');
    expect(url).toContain('maxDepth=2');
    expect(url).toContain('from=25');
    expect(url).toContain('size=25');
  });

  it('switches to column level and expands search edges into per-column rows', async () => {
    const fetchMock = vi.mocked(fetch);
    const { wrapper } = await mountTable();
    // Column-level rows come from the directional edge map, so switch
    // upstream first (the fixture carries upstream edges).
    await wrapper.find('[data-testid="lineage-impact-upstream"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="impact-on-dropdown"]').trigger('click');
    await flushPromises();
    const item = document.body.querySelector('[data-testid="impact-on-column"]');
    expect(item).not.toBeNull();
    (item as HTMLElement).click();
    await flushPromises();
    const columnUrl = fetchUrls(fetchMock).find((url) => url.includes('/getLineage/Upstream')) ?? '';
    expect(columnUrl).toContain('/getLineage/Upstream');
    // Column-level fetch is one-sided: upstream depth = nodeDepth, downstream 0.
    // nodeDepth is the session default — the official store default 3.
    expect(columnUrl).toContain('upstreamDepth=3');
    expect(columnUrl).toContain('downstreamDepth=0');
    const text = wrapper.text();
    expect(text).toContain('raw_orders');
    expect(text).toContain('orders');
    expect(text).toContain('id');
    expect(text).toContain('Sensitive');
  });

  it('applies the search value prop into a query_filter wildcard', async () => {
    const fetchMock = vi.mocked(fetch);
    // The search input lives in the canvas header now (debounced there);
    // the table receives the debounced value as a prop.
    const { wrapper } = await mountTable({}, { searchValue: 'mart' });
    const lastUrl = fetchUrls(fetchMock).filter((url) => url.includes('getLineageByEntityCount')).at(-1) ?? '';
    expect(lastUrl).toContain('query_filter=');
    const params = new URL(lastUrl, 'http://test').searchParams;
    const filter = JSON.parse(params.get('query_filter') ?? '') as {
      query: { bool: { must: Array<Record<string, unknown>> } };
    };
    expect(JSON.stringify(filter)).toContain('*mart*');
    expect(wrapper.text()).toContain('Mart Orders');
  });

  it('emits the depth options for the canvas header dropdown', async () => {
    const { wrapper } = await mountTable();
    // The immediate watcher first emits the fallback (the current depth
    // alone, before paging info arrives), then the paging-info options.
    expect(wrapper.emitted('update:depth-options')).toEqual([[[3]], [[0, 1]]]);
  });

  it('recovers pagination info from getPaginationInfo when the count response omits it', async () => {
    const noInfo = { ...DOWNSTREAM_COUNT, paginationInfo: undefined };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('getPaginationInfo')) {
        return jsonResponse(DOWNSTREAM_COUNT.paginationInfo);
      }
      if (url.includes('getLineageByEntityCount')) {
        return jsonResponse({ nodes: noInfo.nodes });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountTable();
    expect(fetchUrls(fetchMock).some((url) => url.includes('getPaginationInfo'))).toBe(true);
    expect(wrapper.find('[data-testid="lineage-impact-downstream"]').text()).toContain('1');
  });

  it('shows the empty state when the count returns no nodes', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('getLineageByEntityCount')) {
        return jsonResponse({ nodes: {}, paginationInfo: DOWNSTREAM_COUNT.paginationInfo });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountTable();
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
    // The CSV button lives in the canvas header now; it disables off the
    // exposed hasRows, which is false here.
    expect((wrapper.vm as unknown as { hasRows: boolean }).hasRows).toBe(false);
  });

  it('exports CSV through the count export endpoint and claims the job', async () => {
    const fetchMock = vi.mocked(fetch);
    const { wrapper } = await mountTable();
    // The CSV item lives in the canvas header export dropdown and calls
    // the table's exposed exportCsv through the ref.
    await (wrapper.vm as unknown as { exportCsv: () => Promise<void> }).exportCsv();
    await flushPromises();
    const exportUrl = fetchUrls(fetchMock).find((url) => url.includes('exportByEntityCountAsync')) ?? '';
    expect(exportUrl).toContain('direction=Downstream');
    // The export uses the session default depth — the official store default 3.
    expect(exportUrl).toContain('nodeDepth=3');
    expect(exportUrl).toContain('maxDepth=3');
  });

  it('shows an error and clears rows when the count fetch fails', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const fetchMock = vi.fn(async () => {
      throw new Error('boom');
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountTable();
    expect(errorSpy).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
    errorSpy.mockRestore();
  });
});
