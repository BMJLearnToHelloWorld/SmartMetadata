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
import AssetDetailView from './AssetDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastMatchingFetch(predicate: (url: string, init?: RequestInit) => boolean) {
  const mock = vi.mocked(fetch);
  const match = [...mock.mock.calls].reverse().find((call) => predicate(String(call[0]), call[1]));
  if (!match) {
    throw new Error('no matching fetch');
  }
  return { url: String(match[0]), init: match[1] };
}

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/assets/:entityType/:fqn', name: 'asset', component: AssetDetailView, props: true },
      { path: '/lineage/:entityType/:fqn', name: 'lineage', component: { template: '<div>lineage</div>' } },
      { path: '/quality/test-cases/:id', name: 'quality-test-case', component: { template: '<div>tc</div>' } },
      {
        path: '/quality/test-definitions/:id',
        name: 'quality-test-definition',
        component: { template: '<div>td</div>' },
      },
    ],
  });
  await router.push('/assets/table/svc.db.schema.orders');
  await router.isReady();
  const wrapper = mount(AssetDetailView, {
    props: { entityType: 'table', fqn: 'svc.db.schema.orders' },
    attachTo: document.body,
    global: { plugins: [pinia, router, Antd] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('AssetDetailView governance', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/tables/name/')) {
          return jsonResponse({
            id: 'tbl-1',
            name: 'orders',
            fullyQualifiedName: 'svc.db.schema.orders',
            description: 'Orders fact',
            owners: [{ id: 'u1', name: 'alice', type: 'user' }],
            tags: [{ tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' }],
            domains: [{ id: 'd1', name: 'Marketing', type: 'domain' }],
            columns: [{ name: 'id', dataType: 'BIGINT' }],
          });
        }
        if (url.includes('/api/v1/users')) {
          return jsonResponse({ data: [{ id: 'u1', name: 'alice', displayName: 'Alice' }] });
        }
        if (url.includes('/api/v1/teams')) {
          return jsonResponse({ data: [] });
        }
        if (url.includes('/api/v1/classifications')) {
          return jsonResponse({ data: [{ id: 'c1', name: 'PII', fullyQualifiedName: 'PII' }] });
        }
        if (url.includes('/api/v1/tags')) {
          return jsonResponse({
            data: [{ id: 'tg1', name: 'Sensitive', fullyQualifiedName: 'PII.Sensitive' }],
          });
        }
        if (url.includes('/api/v1/glossaries')) {
          return jsonResponse({ data: [] });
        }
        if (url.includes('/api/v1/glossaryTerms')) {
          return jsonResponse({ data: [] });
        }
        if (url.includes('/api/v1/domains')) {
          return jsonResponse({ data: [{ id: 'd1', name: 'Marketing' }] });
        }
        if (url.includes('/api/v1/dataQuality/testCases')) {
          return jsonResponse({
            data: [
              {
                id: 'tc1',
                name: 'row_count',
                testDefinition: { id: 'td1', name: 'tableRowCountToBeBetween' },
                testCaseResult: { testCaseStatus: 'Failed' },
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/sampleData')) {
          return jsonResponse({ sampleData: { columns: ['id'], rows: [[1]] } });
        }
        if (url.includes('/tableProfile/latest')) {
          return jsonResponse({
            profile: { rowCount: 1, columnCount: 1 },
            columns: [{ name: 'id', profile: { nullCount: 0 } }],
          });
        }
        if (init?.method === 'PATCH' && url.includes('/api/v1/tables/tbl-1')) {
          return jsonResponse({});
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('shows description, owners, tags, and domains from the table GET', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('Orders fact');
    expect(wrapper.text()).toContain('alice');
    expect(wrapper.text()).toContain('Sensitive');
    expect(wrapper.text()).toContain('Marketing');
    expect(wrapper.find('[data-testid="edit-governance"]').exists()).toBe(true);
  });

  it('shows linked tests and latest status from GET /v1/dataQuality/testCases', async () => {
    const { wrapper, router } = await mountView();
    expect(wrapper.text()).toContain('row_count');
    expect(wrapper.text()).toContain('Failed');
    expect(wrapper.find('[data-testid="asset-tests-table"]').exists()).toBe(true);
    await wrapper.find('[data-testid="asset-test-tc1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('quality-test-case');
  });

  it('PATCHes the table by id when governance is saved', async () => {
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="edit-governance"]').trigger('click');
    await flushPromises();
    const textarea = wrapper.find('[data-testid="asset-description"]');
    expect(textarea.exists()).toBe(true);
    await textarea.setValue('Updated description');
    const ok = wrapper.findAll('button').find((button) => button.text() === 'OK');
    expect(ok).toBeTruthy();
    await ok!.trigger('click');
    await flushPromises();
    const patch = lastMatchingFetch((url, init) => url.includes('/api/v1/tables/tbl-1') && init?.method === 'PATCH');
    expect((patch.init?.headers as Record<string, string>)['Content-Type']).toBe('application/json-patch+json');
    const body = JSON.parse(String(patch.init?.body)) as Array<{ path: string; value?: unknown }>;
    expect(body.some((op) => op.path === '/description' && op.value === 'Updated description')).toBe(true);
    expect(body.some((op) => op.path === '/tags')).toBe(true);
    expect(body.some((op) => op.path === '/owners')).toBe(true);
    expect(body.some((op) => op.path === '/domains')).toBe(true);
  });
});
