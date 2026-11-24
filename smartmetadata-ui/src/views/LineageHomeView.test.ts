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
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import LineageMap from '@/components/lineage/LineageMap.vue';
import {
  LINEAGE_MAP_ONBOARDING_COOKIE,
  type LineageScene,
} from '@/lineage/scene';
import { LINEAGE_CONFIG_STORAGE_KEY } from '@/stores/lineage';
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

// Minimal layer scene: the map renders these service nodes via the
// vueFlowStub (`lineage-node-{id}`).
const LAYER_SCENE: LineageScene = {
  band: 'LAYER',
  lens: 'service',
  breadcrumb: [{ band: 'LAYER', id: 'root', label: 'All services', levelKind: 'service' }],
  edges: [],
  nodes: [
    {
      band: 'LAYER',
      id: 'svc1',
      label: 'svc1',
      displayName: 'Svc One',
      levelKind: 'service',
      entityType: 'databaseService',
      fullyQualifiedName: 'svc1',
      isExpandable: true,
      childrenCount: 3,
      counts: { table: 3 },
      serviceType: 'Postgres',
      sourceEntity: { id: 'svc1-id', type: 'databaseService', fullyQualifiedName: 'svc1' },
    },
    {
      band: 'LAYER',
      id: 'svc2',
      label: 'svc2',
      levelKind: 'service',
      entityType: 'databaseService',
      fullyQualifiedName: 'svc2',
      isExpandable: true,
      childrenCount: 1,
      counts: { table: 1 },
      sourceEntity: { id: 'svc2-id', type: 'databaseService', fullyQualifiedName: 'svc2' },
    },
  ],
};

// The map's onboarding dialog is covered by LineageMap.test.ts; hide it here.
const AssetStub = defineComponent({ render: () => h('div') });

function clearOnboardingCookie(): void {
  document.cookie = `${LINEAGE_MAP_ONBOARDING_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

function routeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  if (url.includes('/api/v1/lineage/scene')) {
    return Promise.resolve(jsonResponse(LAYER_SCENE));
  }
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
      { path: '/asset/:entityType/:fqn', name: 'asset', component: AssetStub },
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
    document.cookie = `${LINEAGE_MAP_ONBOARDING_COOKIE}=true; path=/`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.clear();
    clearOnboardingCookie();
  });

  it('renders the platform scene map from lineage/scene, not the platform canvas', async () => {
    const fetchMock = vi.fn(routeFetch);
    vi.stubGlobal('fetch', fetchMock);
    // A distinctive saved session config proves the page hydrates the
    // store and passes its depths to the map (the map's own default is
    // 1/1, so 2/2 can only come from the store).
    localStorage.setItem(
      LINEAGE_CONFIG_STORAGE_KEY,
      JSON.stringify({ upstreamDepth: 2, downstreamDepth: 2 }),
    );
    const { wrapper } = await mountPage();
    expect(wrapper.text()).toContain('Service Lineage');
    await vi.waitFor(() => expect(wrapper.find('[data-testid="lineage-node-svc1"]').exists()).toBe(true));
    expect(wrapper.find('[data-testid="lineage-map"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-graph"]').exists()).toBe(false);
    const sceneCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('/api/v1/lineage/scene'),
    );
    expect(sceneCall).toBeTruthy();
    expect(String(sceneCall?.[0])).toContain('lens=service');
    expect(String(sceneCall?.[0])).toContain('band=LAYER');
    expect(String(sceneCall?.[0])).toContain('upstreamDepth=2');
    expect(String(sceneCall?.[0])).toContain('downstreamDepth=2');
    expect(String(sceneCall?.[0])).toContain('size=200');
    expect(String(sceneCall?.[0])).toContain('includeDeleted=false');
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes('/api/v1/lineage/getPlatformLineage'),
      ),
    ).toBe(false);
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

  it('reads the lens from ?lineageLens= for the title and the scene fetch', async () => {
    const fetchMock = vi.fn(routeFetch);
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountPage({ query: { lineageLens: 'domain' } });
    expect(wrapper.text()).toContain('Domain Lineage');
    const sceneCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('/api/v1/lineage/scene'),
    );
    expect(String(sceneCall?.[0])).toContain('lens=domain');
  });

  it('falls back to the service lens for an unknown ?lineageLens= value', async () => {
    const fetchMock = vi.fn(routeFetch);
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountPage({ query: { lineageLens: 'all' } });
    expect(wrapper.text()).toContain('Service Lineage');
    const sceneCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('/api/v1/lineage/scene'),
    );
    expect(String(sceneCall?.[0])).toContain('lens=service');
  });

  it('shows export and config actions once and opens the config modal', async () => {
    vi.stubGlobal('fetch', vi.fn(routeFetch));
    const { wrapper } = await mountPage();
    expect(wrapper.find('[data-testid="export-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-config"]').exists()).toBe(true);
    // Pin PlatformLineage: export lives once in the page header — the map
    // has no export button of its own — and the platform page is a
    // viewport-height flex column so the canvas fills the screen.
    expect(wrapper.find('[data-testid="lineage-map-export"]').exists()).toBe(false);
    expect(wrapper.find('.lineage-page__platform').exists()).toBe(true);
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
    // The focused view keeps the scrolling page: no viewport-height wrapper.
    expect(wrapper.find('.lineage-page__platform').exists()).toBe(false);
    expect(
      wrapper.find('[data-testid="lineage-entity-search-input"]').attributes('placeholder'),
    ).toBe('svc.db.schema.orders');
    expect(wrapper.find('[data-testid="lineage-graph"]').exists()).toBe(true);
  });

  it('writes a scene request change into the URL and updates the title', async () => {
    vi.stubGlobal('fetch', vi.fn(routeFetch));
    const { wrapper, router } = await mountPage();
    await vi.waitFor(() => expect(wrapper.find('[data-testid="lineage-node-svc1"]').exists()).toBe(true));
    wrapper
      .findComponent(LineageMap)
      .vm.$emit('request-change', { lens: 'domain', band: 'LAYER' });
    await flushPromises();
    expect(router.currentRoute.value.query.lineageLens).toBe('domain');
    expect(router.currentRoute.value.query.lineageBand).toBe('LAYER');
    expect(wrapper.text()).toContain('Domain Lineage');
  });

  it('opens the asset detail page from a scene node', async () => {
    vi.stubGlobal('fetch', vi.fn(routeFetch));
    const { wrapper, router } = await mountPage();
    await vi.waitFor(() => expect(wrapper.find('[data-testid="lineage-node-svc1"]').exists()).toBe(true));
    wrapper.findComponent(LineageMap).vm.$emit('navigate', {
      band: 'LAYER',
      id: 'svc1',
      label: 'svc1',
      levelKind: 'service',
      entityType: 'table',
      fullyQualifiedName: 'svc.db.schema.orders',
    });
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('asset');
    expect(router.currentRoute.value.params).toEqual({
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
    });
  });

  it('surfaces a scene fetch failure as an error, never an empty canvas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ message: 'scene forbidden' }, 403)),
    );
    const { wrapper } = await mountPage();
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="lineage-map-state"]').exists()).toBe(true),
    );
    // The map shows its generic load-failed state, not the server's message.
    expect(wrapper.text()).toContain('Failed to load');
    expect(wrapper.find('[data-testid="lineage-graph"]').exists()).toBe(false);
  });
});
