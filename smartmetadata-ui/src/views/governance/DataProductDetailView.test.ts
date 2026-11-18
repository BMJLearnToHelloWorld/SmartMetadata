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
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import DataProductDetailView from './DataProductDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(grantEditAll: boolean): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/v1/dataProducts/dp1/assets/remove') && init?.method === 'PUT') {
        return jsonResponse({ status: 'success', numberOfRowsPassed: 1, successRequest: [] });
      }
      if (url.includes('/api/v1/dataProducts/dp1/assets')) {
        return jsonResponse({
          data: [
            { id: 'a1', name: 'orders', type: 'table', fullyQualifiedName: 'svc.db.orders' },
          ],
          paging: { total: 1 },
        });
      }
      if (url.includes('/api/v1/dataProducts/dp1')) {
        return jsonResponse({
          id: 'dp1',
          name: 'churn',
          displayName: 'Churn',
          fullyQualifiedName: 'marketing.churn',
          description: 'Churn scores',
          domains: [],
          owners: [],
          experts: [],
          tags: [],
          extension: {},
        });
      }
      if (url.includes('/api/v1/permissions/dataProduct/name/')) {
        return jsonResponse({
          resource: 'dataProduct',
          permissions: grantEditAll ? [{ operation: 'EditAll', access: 'allow' }] : [],
        });
      }
      if (url.includes('/api/v1/activity/entity/dataProduct/')) {
        return jsonResponse({ data: [], paging: { total: 0 } });
      }
      if (url.includes('/api/v1/conversations')) {
        return jsonResponse({ data: [], paging: { total: 0 } });
      }
      if (url.includes('/api/v1/metadata/types/name/dataProduct/customProperties')) {
        return jsonResponse([{ name: 'sensitivity', propertyType: 'string' }]);
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

function mountView(): ReturnType<typeof mount> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/governance/data-products', name: 'governance-data-products', component: { template: '<div>list</div>' } },
      { path: '/governance/data-products/:id', name: 'governance-data-product', component: DataProductDetailView, props: true },
    ],
  });
  const wrapper = mount(DataProductDetailView, {
    props: { id: 'dp1' },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
    attachTo: document.body,
  });
  return wrapper;
}

describe('DataProductDetailView assets + tabs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('renders activity and custom-properties tabs and enables asset writes with an EditAll grant', async () => {
    stubFetch(true);
    const wrapper = mountView();
    await flushPromises();
    // Ant TabPane does not forward data-testid to the DOM; the shell's own
    // test asserts tab presence via rendered labels, and so does this one.
    expect(wrapper.text()).toContain('Activity');
    expect(wrapper.text()).toContain('Custom Properties');
    const addButton = wrapper.find('[data-testid="add-data-product-assets"]');
    expect(addButton.exists()).toBe(true);
    expect((addButton.element as HTMLButtonElement).disabled).toBe(false);
    wrapper.unmount();
  });

  it('denies asset writes when the permission fetch carries no EditAll grant (fail-closed)', async () => {
    stubFetch(false);
    const wrapper = mountView();
    await flushPromises();
    const addButton = wrapper.find('[data-testid="add-data-product-assets"]');
    expect((addButton.element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });

  it('removes an asset with PUT assets/remove after confirmation', async () => {
    stubFetch(true);
    const wrapper = mountView();
    await flushPromises();
    const removeButton = wrapper.find('[data-testid="remove-asset-a1"]');
    expect(removeButton.exists()).toBe(true);
    await removeButton.trigger('click');
    await flushPromises();
    const confirm = document.querySelector('.sm-confirm-delete');
    expect(confirm).not.toBeNull();
    const okButton = confirm?.querySelector('.ant-btn-primary') as HTMLElement | null;
    expect(okButton).not.toBeNull();
    okButton?.click();
    await flushPromises();
    const removeCall = vi
      .mocked(fetch)
      .mock.calls.find(([url, init]) => String(url).includes('/assets/remove') && init?.method === 'PUT');
    expect(removeCall).toBeDefined();
    wrapper.unmount();
  });
});

describe('DataProductDetailView persona tab customization (C-4)', () => {
  const persona = { id: 'p1', name: 'analyst', fullyQualifiedName: 'analyst', displayName: 'Analyst' };

  function stubWithDoc(doc: Record<string, unknown> | null) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/dataProducts/dp1')) {
          return jsonResponse({
            id: 'dp1',
            name: 'churn',
            displayName: 'Churn',
            fullyQualifiedName: 'marketing.churn',
            description: 'Churn scores',
            domains: [],
            owners: [],
            experts: [],
            tags: [],
            extension: {},
          });
        }
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: [persona], paging: { total: 1 } });
        }
        if (url.includes('/v1/docStore/name/')) {
          return doc ? jsonResponse(doc) : new Response('not found', { status: 404 });
        }
        if (
          url.includes('/api/v1/activity/entity/dataProduct/') ||
          url.includes('/api/v1/conversations')
        ) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  }

  function tabLabels(wrapper: ReturnType<typeof mountView>): string[] {
    return wrapper.find('.ant-tabs-nav').findAll('.ant-tabs-tab').map((tab) => tab.text().trim());
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('reorders and renames tabs from the persona DataProduct page, keeping unlisted tabs', async () => {
    stubWithDoc({
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: {
        pages: [
          {
            pageType: 'DataProduct',
            tabs: [
              { id: 'custom_properties', name: 'custom_properties', displayName: 'Props' },
              { id: 'activity_feed', name: 'activity_feed' },
            ],
          },
        ],
      },
    });
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = mountView();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(tabLabels(wrapper)).toEqual(['Props', 'Activity', 'Overview', 'Assets']);
    wrapper.unmount();
  });

  it('renders the default tab order without a persona document', async () => {
    stubWithDoc(null);
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = mountView();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(tabLabels(wrapper)).toEqual(['Overview', 'Assets', 'Activity', 'Custom Properties']);
    wrapper.unmount();
  });
});
