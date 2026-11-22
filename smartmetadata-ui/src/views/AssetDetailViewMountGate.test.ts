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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { nextTick } from 'vue';
import { createTestI18n } from '@/test/i18n';
import { DetailWidgetKeys } from '@/catalog/detailWidgetDispatch';
import GenericTab from '@/components/customize/GenericTab.vue';
import { resolveWidgetLayout } from '@/composables/customizeWidgetLayout';
import AssetDetailView from './AssetDetailView.vue';

// Batch 6 mount-gate convergence: this file locks the slot→mount-tab
// mapping (`mountTabIdFor` in AssetDetailView) by stubbing ONLY the
// gate predicate — true for (Chart, details) and false everywhere
// else — without touching the shipped registry. The stub isolates
// the mapping test from the shipped registry (which flips real tabs
// lane by lane), so a flipped shipped tab reads as unflipped here.
// If `mountTabIdFor('Chart', 'overview')` returned anything other
// than 'details', the stub would refuse the mount and this test
// would fail.
vi.mock('@/views/admin/persona/editors/customizePageData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/views/admin/persona/editors/customizePageData')>();
  return {
    ...actual,
    isUnconditionalMountTab: (pageType: string, tabId: string) =>
      pageType === 'Chart' && tabId === 'details',
  };
});

vi.mock('@vue-flow/core', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/core']());
vi.mock('@vue-flow/background', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/background']());
vi.mock('@vue-flow/controls', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/controls']());
vi.mock('@vue-flow/minimap', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/minimap']());

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function tick(ms = 10) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await nextTick();
}

async function mountView(entityType: string, fqn: string) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/search', name: 'search', component: { template: '<div>search</div>' } },
      { path: '/assets/:entityType/:fqn', name: 'asset', component: AssetDetailView, props: true },
      { path: '/lineage/:entityType/:fqn', name: 'lineage', component: { template: '<div>lineage</div>' } },
    ],
  });
  await router.push(`/assets/${entityType}/${fqn}`);
  await router.isReady();
  const wrapper = mount(AssetDetailView, {
    props: { entityType, fqn },
    attachTo: document.body,
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  await tick();
  return { wrapper, router };
}

const persona = { id: 'p1', name: 'analyst', fullyQualifiedName: 'analyst', displayName: 'Analyst' };

function stubNoDoc(entityResponder: (url: string) => Response | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/personas')) {
        return jsonResponse({ data: [persona], paging: { total: 1 } });
      }
      if (url.includes('/v1/docStore/name/')) {
        return new Response('not found', { status: 404 });
      }
      const entity = entityResponder(url);
      if (entity) {
        return entity;
      }
      if (
        url.includes('/api/v1/lineage/') ||
        url.includes('/api/v1/activity/') ||
        url.includes('/api/v1/conversations') ||
        url.includes('/customProperties') ||
        url.includes('/testCases')
      ) {
        return jsonResponse({ data: [], paging: { total: 0 } });
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

async function settle(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']): Promise<void> {
  await flushPromises();
  await flushPromises();
  await flushPromises();
  await wrapper.vm.$nextTick();
}

describe('AssetDetailView mount-gate flip mechanism (Batch 6)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('mounts the Chart grid on the overview tab through mountTabIdFor (Chart, overview) → details', async () => {
    // No persona document at all: the flipped tab mounts the grid with
    // the default layout (official getLayoutFromCustomizedPage default
    // branch), proving that branch is reachable through the view once
    // a tab flips. The stubbed gate only opens (Chart, details), so
    // this also locks the pageType-scoped override: the overview slot
    // must resolve to the `details` mount id.
    stubNoDoc((url) =>
      url.includes('/api/v1/charts/name/')
        ? jsonResponse({
            id: 'ch-1',
            name: 'revenue',
            fullyQualifiedName: 'bi.sales.revenue',
            description: 'Revenue chart',
            chartType: 'Bar',
            service: { name: 'superset' },
            dashboards: [{ name: 'sales', type: 'dashboard' }],
          })
        : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('chart', 'bi.sales.revenue');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('pageType')).toBe('Chart');
    expect(grids[0].props('layout')).toEqual(resolveWidgetLayout('Chart', 'details', null));
    const cell = wrapper.find(`[data-testid="${DetailWidgetKeys.DESCRIPTION}"]`);
    expect(cell.find('[data-testid="asset-widget-description"]').exists()).toBe(true);
    expect(cell.text()).toContain('Revenue chart');
    wrapper.unmount();
  }, 20000);

  it('mounts no grid for a page type the stubbed gate leaves closed (shipped-registry flips do not apply under this stub)', async () => {
    stubNoDoc((url) =>
      url.includes('/api/v1/apiEndpoints/name/')
        ? jsonResponse({
            id: 'ae-1',
            name: 'getPet',
            fullyQualifiedName: 'svc.petstore.getPet',
            endpointURL: '/pets/{id}',
            requestMethod: 'GET',
            requestSchema: { type: 'object', properties: { id: { type: 'integer' } } },
            responseSchema: { type: 'object' },
            owners: [],
            tags: [],
            domains: [],
          })
        : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('apiEndpoint', 'svc.petstore.getPet');
    await settle(wrapper);
    expect(wrapper.findAllComponents(GenericTab).length).toBe(0);
    wrapper.unmount();
  }, 20000);
});
