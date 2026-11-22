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
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { SearchHit } from '@/types/api';
import LineageHomeView from './LineageHomeView.vue';

vi.mock('@vue-flow/core', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/core']());
vi.mock('@vue-flow/background', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/background']());
vi.mock('@vue-flow/controls', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/controls']());
vi.mock('@vue-flow/minimap', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/minimap']());

const searchAssets = vi.fn();

vi.mock('@/api/search', () => ({
  searchAssets: (...args: unknown[]) => searchAssets(...args),
}));

const HIT: SearchHit = {
  name: 'orders',
  displayName: 'Orders',
  fullyQualifiedName: 'svc.db.schema.orders',
  entityType: 'table',
  owners: [],
  tags: [],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// SearchLineageResult shape: nodes keyed by FQN, edges as maps.
const GRAPH = {
  nodes: {
    'svc.db.schema.orders': {
      entity: {
        id: 'center-id',
        type: 'table',
        name: 'orders',
        fullyQualifiedName: 'svc.db.schema.orders',
      },
      nodeDepth: 0,
    },
    'svc.db.schema.raw_orders': {
      entity: {
        id: 'up-id',
        type: 'table',
        name: 'raw_orders',
        fullyQualifiedName: 'svc.db.schema.raw_orders',
      },
      nodeDepth: 1,
    },
  },
  upstreamEdges: {
    e1: {
      fromEntity: { id: 'up-id', fullyQualifiedName: 'svc.db.schema.raw_orders', type: 'table' },
      toEntity: { id: 'center-id', fullyQualifiedName: 'svc.db.schema.orders', type: 'table' },
      columns: [{ fromColumns: ['svc.db.schema.raw_orders.id'], toColumn: 'svc.db.schema.orders.id' }],
    },
  },
  downstreamEdges: {},
};

const PERMISSION_GRANT = {
  resource: 'table',
  permissions: [{ operation: 'EditLineage', access: 'allow' }],
};

function routeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  if (url.includes('/api/v1/lineage/getPlatformLineage')) {
    return Promise.resolve(jsonResponse(GRAPH));
  }
  if (url.includes('/api/v1/lineage/getLineage')) {
    return Promise.resolve(jsonResponse(GRAPH));
  }
  if (url.includes('/api/v1/permissions/')) {
    return Promise.resolve(jsonResponse(PERMISSION_GRANT));
  }
  return Promise.resolve(jsonResponse({}));
}

async function mountPage(options: {
  props?: { entityType: string; fqn: string };
  query?: Record<string, string>;
} = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/lineage', name: 'lineage-home', component: LineageHomeView },
      {
        path: '/lineage/:entityType/:fqn',
        name: 'lineage',
        component: LineageHomeView,
        props: true,
      },
    ],
  });
  if (options.props) {
    await router.push({
      name: 'lineage',
      params: { entityType: options.props.entityType, fqn: options.props.fqn },
      query: options.query ?? {},
    });
  } else {
    await router.push({ name: 'lineage-home', query: options.query ?? {} });
  }
  await router.isReady();
  const wrapper = mount(LineageHomeView, {
    props: options.props ?? { entityType: '', fqn: '' },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('LineageHomeView (platform lineage page)', () => {
  beforeEach(() => {
    localStorage.clear();
    searchAssets.mockReset();
    searchAssets.mockResolvedValue({ total: 1, hits: [HIT], facets: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('renders the platform-wide graph from getPlatformLineage, not an empty canvas', async () => {
    const fetchMock = vi.fn(routeFetch);
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountPage();
    expect(wrapper.text()).toContain('Service Lineage');
    expect(wrapper.text()).toContain('raw_orders');
    expect(wrapper.text()).toContain('orders');
    expect(wrapper.find('[data-testid="lineage-graph"]').exists()).toBe(true);
    const platformCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('/api/v1/lineage/getPlatformLineage'),
    );
    expect(platformCall).toBeTruthy();
    expect(String(platformCall?.[0])).toContain('view=service');
    expect(String(platformCall?.[0])).toContain('includeDeleted=false');
    expect(wrapper.find('[data-testid="lineage-home-fqn-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="lineage-home-canvas"]').exists()).toBe(false);
  });

  it('does not fetch entity permissions for the platform view', async () => {
    const fetchMock = vi.fn(routeFetch);
    vi.stubGlobal('fetch', fetchMock);
    await mountPage();
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/v1/permissions/')),
    ).toBe(false);
  });

  it('reads the lens from ?lineageLens= for the title and the platform view', async () => {
    const fetchMock = vi.fn(routeFetch);
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountPage({ query: { lineageLens: 'domain' } });
    expect(wrapper.text()).toContain('Domain Lineage');
    const platformCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('/api/v1/lineage/getPlatformLineage'),
    );
    expect(String(platformCall?.[0])).toContain('view=domain');
  });

  it('falls back to the service lens for an unknown ?lineageLens= value', async () => {
    const fetchMock = vi.fn(routeFetch);
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountPage({ query: { lineageLens: 'all' } });
    expect(wrapper.text()).toContain('Service Lineage');
    const platformCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('/api/v1/lineage/getPlatformLineage'),
    );
    expect(String(platformCall?.[0])).toContain('view=service');
  });

  it('shows export and config actions and opens the config modal', async () => {
    vi.stubGlobal('fetch', vi.fn(routeFetch));
    const { wrapper } = await mountPage();
    expect(wrapper.find('[data-testid="export-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-config"]').exists()).toBe(true);
    await wrapper.get('[data-testid="lineage-config"]').trigger('click');
    await flushPromises();
    // The antd modal portals to document.body, like LineageConfigModal.test.ts asserts.
    expect(document.body.innerHTML).toContain('lineage-config-upstream');
    wrapper.unmount();
  });

  it('opens the focused lineage route from a search hit', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(routeFetch));
    const { wrapper, router } = await mountPage();
    const input = wrapper.get('[data-testid="lineage-entity-search-input"]');
    await input.setValue('orders');
    const native = input.find('input');
    if (native.exists()) {
      await native.setValue('orders');
      await native.trigger('input');
    }
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    await wrapper.get('[data-testid="lineage-entity-option-svc.db.schema.orders"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('lineage');
    expect(router.currentRoute.value.params).toEqual({
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
    });
  });

  it('fetches per-entity EditLineage permission for the focused view', async () => {
    const fetchMock = vi.fn(routeFetch);
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountPage({
      props: { entityType: 'table', fqn: 'svc.db.schema.orders' },
    });
    const permissionCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('/api/v1/permissions/table/name/svc.db.schema.orders'),
    );
    expect(permissionCall).toBeTruthy();
    // Pin pageTitle names the focus entity; the visible header stays lens-based.
    expect(document.title).toContain('svc.db.schema.orders Lineage');
    expect(wrapper.text()).toContain('Service Lineage');
    expect(
      wrapper.find('[data-testid="lineage-entity-search-input"]').attributes('placeholder'),
    ).toBe('svc.db.schema.orders');
    expect(wrapper.find('[data-testid="lineage-graph"]').exists()).toBe(true);
  });

  it('surfaces a platform fetch failure as an error, never an empty canvas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ message: 'platform lineage forbidden' }, 403)),
    );
    const { wrapper } = await mountPage();
    expect(wrapper.text()).toContain('platform lineage forbidden');
    expect(wrapper.find('[data-testid="lineage-graph"]').exists()).toBe(false);
  });
});
