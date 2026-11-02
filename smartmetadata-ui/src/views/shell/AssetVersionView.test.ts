/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import AssetVersionView from './AssetVersionView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function mountView(versionsBody: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/tables/name/')) {
        return jsonResponse({ id: 'tbl-1', name: 'orders', fullyQualifiedName: 'svc.db.schema.orders', owners: [], tags: [], domains: [], columns: [] });
      }
      if (url.includes('/api/v1/tables/tbl-1/versions')) {
        return jsonResponse(versionsBody);
      }
      return new Response('not found', { status: 404 });
    }),
  );
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/assets/:entityType/:fqn/versions', name: 'asset-version', component: AssetVersionView, props: true },
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
    ],
  });
  await router.push('/assets/table/svc.db.schema.orders/versions');
  await router.isReady();
  const wrapper = mount(AssetVersionView, {
    props: { entityType: 'table', fqn: 'svc.db.schema.orders' },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('AssetVersionView', () => {
  it('lists versions returned by the backend', async () => {
    const wrapper = await mountView({ versions: [{ version: '0.2', updatedAt: 1700000000000 }, { version: '0.1' }] });
    expect(wrapper.find('[data-testid="asset-versions-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('0.2');
    expect(wrapper.text()).toContain('0.1');
    vi.unstubAllGlobals();
  });

  it('shows the changeDescription diff for the selected version', async () => {
    const wrapper = await mountView({
      versions: [
        {
          version: '0.2',
          updatedAt: 1700000000000,
          changeDescription: {
            fieldsUpdated: [{ name: 'description', oldValue: 'Old', newValue: 'New' }],
            fieldsAdded: [{ name: 'tags', newValue: 'PII.Sensitive' }],
          },
        },
        { version: '0.1' },
      ],
    });
    const rows = wrapper.findAll('[data-testid="asset-versions-table"] tbody tr');
    expect(rows.length).toBe(2);
    await rows[0].trigger('click');
    expect(wrapper.find('[data-testid="asset-version-diff-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('description');
    expect(wrapper.text()).toContain('Old');
    expect(wrapper.text()).toContain('New');
    expect(wrapper.text()).toContain('PII.Sensitive');
    vi.unstubAllGlobals();
  });

  it('shows an honest empty diff when the backend returns no changeDescription', async () => {
    const wrapper = await mountView({ versions: [{ version: '0.1' }] });
    const rows = wrapper.findAll('[data-testid="asset-versions-table"] tbody tr');
    await rows[0].trigger('click');
    expect(wrapper.find('[data-testid="asset-version-diff-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-version-diff-table"]').exists()).toBe(false);
    vi.unstubAllGlobals();
  });

  it('shows an honest empty when the backend returns no versions', async () => {
    const wrapper = await mountView({ versions: [] });
    expect(wrapper.find('[data-testid="asset-versions-state-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-versions-table"]').exists()).toBe(false);
    vi.unstubAllGlobals();
  });
});
