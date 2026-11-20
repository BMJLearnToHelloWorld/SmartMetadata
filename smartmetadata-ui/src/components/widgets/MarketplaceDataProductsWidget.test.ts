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
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { searchAssets } from '@/api/search';
import { createTestI18n } from '@/test/i18n';
import type { SearchPage } from '@/types/api';
import MarketplaceDataProductsWidget from './MarketplaceDataProductsWidget.vue';

vi.mock('@/api/search', () => ({ searchAssets: vi.fn() }));

const mockedSearchAssets = vi.mocked(searchAssets);

function searchPage(hits: SearchPage['hits'], total = hits.length): SearchPage {
  return { total, hits, facets: [] };
}

function hit(id: string, name: string, description?: string) {
  return {
    id,
    name,
    displayName: name,
    fullyQualifiedName: name,
    entityType: 'dataProduct',
    description,
    owners: [],
    tags: [],
    domains: [],
    dataProducts: [],
  };
}

function mountWidget(props: Record<string, unknown> = {}) {
  return mount(MarketplaceDataProductsWidget, {
    attachTo: document.body,
    props: { canCreate: true, ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('MarketplaceDataProductsWidget (pin MarketplaceDataProductsWidget)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the loading state while the search is in flight', async () => {
    let resolveSearch!: (page: SearchPage) => void;
    mockedSearchAssets.mockReturnValueOnce(
      new Promise<SearchPage>((resolve) => {
        resolveSearch = resolve;
      }),
    );
    const wrapper = mountWidget();
    expect(wrapper.find('[data-testid="marketplace-dp-widget-loading"]').exists()).toBe(true);
    resolveSearch(searchPage([]));
    await flushPromises();
    expect(wrapper.find('[data-testid="marketplace-dp-widget-loading"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the three most recent products with plain-text subtitles', async () => {
    mockedSearchAssets.mockResolvedValueOnce(
      searchPage([hit('1', 'Sales Metrics', '<p>Trusted sales data</p>'), hit('2', 'Orders Mart')], 5),
    );
    const wrapper = mountWidget();
    await flushPromises();
    expect(mockedSearchAssets).toHaveBeenCalledWith('', 0, 3, {
      index: 'dataProduct',
      sortField: 'updatedAt',
      sortOrder: 'desc',
    });
    expect(wrapper.find('[data-testid="marketplace-dp-widget"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="marketplace-dp-card-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="marketplace-dp-card-2"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Sales Metrics');
    expect(wrapper.text()).toContain('Trusted sales data');
    expect(wrapper.text()).not.toContain('<p>');
    // The view-all link only appears when more than DISPLAY_COUNT (3) exist.
    expect(wrapper.find('[data-testid="view-all-data-products"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('hides the view-all link when the total fits on one page', async () => {
    mockedSearchAssets.mockResolvedValueOnce(searchPage([hit('1', 'Sales Metrics')], 1));
    const wrapper = mountWidget();
    await flushPromises();
    expect(wrapper.find('[data-testid="view-all-data-products"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the Add button only with create permission and emits add on click', async () => {
    mockedSearchAssets.mockResolvedValue(searchPage([hit('1', 'Sales Metrics')], 1));
    const withAccess = mountWidget({ canCreate: true });
    await flushPromises();
    expect(withAccess.find('[data-testid="add-data-product-btn"]').exists()).toBe(true);
    await withAccess.find('[data-testid="add-data-product-btn"]').trigger('click');
    expect(withAccess.emitted('add')).toHaveLength(1);
    withAccess.unmount();

    const withoutAccess = mountWidget({ canCreate: false });
    await flushPromises();
    expect(withoutAccess.find('[data-testid="add-data-product-btn"]').exists()).toBe(false);
    withoutAccess.unmount();
  });

  it('emits open with the hit when a card is clicked', async () => {
    const hits = [hit('1', 'Sales Metrics')];
    mockedSearchAssets.mockResolvedValueOnce(searchPage(hits, 1));
    const wrapper = mountWidget();
    await flushPromises();
    await wrapper.find('[data-testid="marketplace-dp-card-1"]').trigger('click');
    expect(wrapper.emitted('open')).toEqual([[hits[0]]]);
    wrapper.unmount();
  });

  it('renders the empty state with the create action only when creation is allowed', async () => {
    mockedSearchAssets.mockResolvedValue(searchPage([], 0));
    const withAccess = mountWidget({ canCreate: true });
    await flushPromises();
    expect(withAccess.find('[data-testid="marketplace-dp-empty-state"]').exists()).toBe(true);
    const action = withAccess.find('[data-testid="marketplace-dp-empty-state"] .ant-btn');
    expect(action.exists()).toBe(true);
    await action.trigger('click');
    expect(withAccess.emitted('add')).toHaveLength(1);
    withAccess.unmount();

    const withoutAccess = mountWidget({ canCreate: false });
    await flushPromises();
    expect(withoutAccess.find('[data-testid="marketplace-dp-empty-state"]').exists()).toBe(true);
    expect(withoutAccess.find('[data-testid="marketplace-dp-empty-state"] .ant-btn').exists()).toBe(false);
    withoutAccess.unmount();
  });

  it('falls back to the empty state when the search fails', async () => {
    mockedSearchAssets.mockRejectedValueOnce(new Error('search down'));
    const wrapper = mountWidget();
    await flushPromises();
    expect(wrapper.find('[data-testid="marketplace-dp-empty-state"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('refreshes the list on demand', async () => {
    mockedSearchAssets.mockResolvedValue(searchPage([hit('1', 'Sales Metrics')], 1));
    const wrapper = mountWidget();
    await flushPromises();
    expect(mockedSearchAssets).toHaveBeenCalledTimes(1);
    await (wrapper.vm as unknown as { refresh: () => Promise<void> }).refresh();
    expect(mockedSearchAssets).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
