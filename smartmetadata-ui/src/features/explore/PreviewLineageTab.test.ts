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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import PreviewLineageTab from './PreviewLineageTab.vue';

vi.mock('@/api/lineage', () => ({
  searchLineage: vi.fn(),
}));

import { searchLineage } from '@/api/lineage';

const searchMock = searchLineage as unknown as ReturnType<typeof vi.fn>;

const PAYLOAD = {
  nodes: {
    'svc.db.schema.orders': {
      entity: {
        id: 't1',
        name: 'orders',
        displayName: 'Orders',
        fullyQualifiedName: 'svc.db.schema.orders',
        type: 'table',
      },
      nodeDepth: 0,
    },
    'svc.etl.load_orders': {
      entity: {
        id: 'p1',
        name: 'load_orders',
        displayName: 'Load orders',
        fullyQualifiedName: 'svc.etl.load_orders',
        type: 'pipeline',
      },
      nodeDepth: 1,
    },
    'svc.dash.orders': {
      entity: {
        id: 'd1',
        name: 'orders',
        displayName: 'Orders dashboard',
        fullyQualifiedName: 'svc.dash.orders',
        type: 'dashboard',
      },
      nodeDepth: 1,
    },
  },
  upstreamEdges: {
    e1: {
      fromEntity: { id: 'p1', fullyQualifiedName: 'svc.etl.load_orders', type: 'pipeline' },
      toEntity: { id: 't1', fullyQualifiedName: 'svc.db.schema.orders', type: 'table' },
    },
  },
  downstreamEdges: {
    e2: {
      fromEntity: { id: 't1', fullyQualifiedName: 'svc.db.schema.orders', type: 'table' },
      toEntity: { id: 'd1', fullyQualifiedName: 'svc.dash.orders', type: 'dashboard' },
    },
  },
};

async function mountTab() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
    ],
  });
  const wrapper = mount(PreviewLineageTab, {
    props: { entityType: 'table', fqn: 'svc.db.schema.orders' },
    global: { plugins: [Antd, router, createTestI18n()] },
  });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

describe('PreviewLineageTab (pin LineageTabContent)', () => {
  beforeEach(() => {
    searchMock.mockReset();
    searchMock.mockResolvedValue(PAYLOAD);
  });

  it('fetches with pin summary config (depth 1, 50 nodes per layer)', async () => {
    const wrapper = await mountTab();
    expect(searchMock).toHaveBeenCalledWith({
      fqn: 'svc.db.schema.orders',
      entityType: 'table',
      upstreamDepth: 1,
      downstreamDepth: 1,
      size: 50,
    });
    wrapper.unmount();
  });

  it('defaults to the downstream filter with badge counts and links items to detail pages', async () => {
    const wrapper = await mountTab();
    expect(wrapper.find('[data-testid="preview-lineage-filter-upstream"]').text()).toContain('(1)');
    expect(wrapper.find('[data-testid="preview-lineage-filter-downstream"]').text()).toContain('(1)');
    // Pin defaults the filter to downstream.
    const item = wrapper.find('[data-testid="preview-lineage-item-d1"]');
    expect(item.exists()).toBe(true);
    expect(item.text()).toContain('Orders dashboard');
    expect(item.text()).toContain('Dashboard');
    // Pin `renderTruncatedPath`: the FQN minus its last segment.
    expect(item.text()).toContain('svc > dash');
    const link = item.find('a');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toContain('/assets/dashboard/svc.dash.orders');
    // The upstream node is behind its filter.
    expect(wrapper.find('[data-testid="preview-lineage-item-p1"]').exists()).toBe(false);
    await wrapper.find('[data-testid="preview-lineage-filter-upstream"]').trigger('click');
    expect(wrapper.find('[data-testid="preview-lineage-item-p1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="preview-lineage-item-d1"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('filters items by name through the search input', async () => {
    const wrapper = await mountTab();
    const search = wrapper.find('[data-testid="searchbar"]');
    await search.setValue('zzz-no-match');
    await flushPromises();
    expect(wrapper.find('[data-testid="preview-lineage-empty"]').exists()).toBe(true);
    await search.setValue('dashboard');
    await flushPromises();
    expect(wrapper.find('[data-testid="preview-lineage-item-d1"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows the empty state when the fetch fails', async () => {
    searchMock.mockRejectedValue(new Error('boom'));
    const wrapper = await mountTab();
    expect(wrapper.find('[data-testid="preview-lineage-empty"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
