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
import { searchAssets } from '@/api/search';
import { createTestI18n } from '@/test/i18n';
import type { SearchPage } from '@/types/api';
import MarketplaceDomainsWidget from './MarketplaceDomainsWidget.vue';

vi.mock('@/api/search', () => ({ searchAssets: vi.fn() }));

const mockedSearchAssets = vi.mocked(searchAssets);

function searchPage(hits: SearchPage['hits'], total = hits.length): SearchPage {
  return { total, hits, facets: [] };
}

function hit(id: string, name: string, domainType?: string) {
  return {
    id,
    name,
    displayName: name,
    fullyQualifiedName: name,
    entityType: 'domain',
    domainType,
    owners: [],
    tags: [],
    domains: [],
    dataProducts: [],
  };
}

function mountWidget(props: Record<string, unknown> = {}) {
  return mount(MarketplaceDomainsWidget, {
    attachTo: document.body,
    props: { canCreate: true, ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('MarketplaceDomainsWidget (pin MarketplaceDomainsWidget)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders domains with the domain-type subtitle', async () => {
    mockedSearchAssets.mockResolvedValueOnce(
      searchPage([hit('1', 'Sales', 'Aggregate'), hit('2', 'Marketing')], 4),
    );
    const wrapper = mountWidget();
    await flushPromises();
    expect(mockedSearchAssets).toHaveBeenCalledWith('', 0, 3, {
      index: 'domain',
      sortField: 'updatedAt',
      sortOrder: 'desc',
    });
    expect(wrapper.find('[data-testid="marketplace-domains-widget"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Sales');
    expect(wrapper.text()).toContain('Type: Aggregate');
    // A domain without a type shows no Type line.
    expect(wrapper.text()).not.toContain('Type: undefined');
    expect(wrapper.find('[data-testid="view-all-domains"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows the Add button only with create permission and emits add on click', async () => {
    mockedSearchAssets.mockResolvedValue(searchPage([hit('1', 'Sales', 'Aggregate')], 1));
    const withAccess = mountWidget({ canCreate: true });
    await flushPromises();
    expect(withAccess.find('[data-testid="add-domain-btn"]').exists()).toBe(true);
    await withAccess.find('[data-testid="add-domain-btn"]').trigger('click');
    expect(withAccess.emitted('add')).toHaveLength(1);
    withAccess.unmount();

    const withoutAccess = mountWidget({ canCreate: false });
    await flushPromises();
    expect(withoutAccess.find('[data-testid="add-domain-btn"]').exists()).toBe(false);
    withoutAccess.unmount();
  });

  it('emits open with the hit when a card is clicked', async () => {
    const hits = [hit('1', 'Sales', 'Aggregate')];
    mockedSearchAssets.mockResolvedValueOnce(searchPage(hits, 1));
    const wrapper = mountWidget();
    await flushPromises();
    await wrapper.find('[data-testid="marketplace-domain-card-1"]').trigger('click');
    expect(wrapper.emitted('open')).toEqual([[hits[0]]]);
    wrapper.unmount();
  });

  it('renders the empty state with the create action only when creation is allowed', async () => {
    mockedSearchAssets.mockResolvedValue(searchPage([], 0));
    const withAccess = mountWidget({ canCreate: true });
    await flushPromises();
    expect(withAccess.find('[data-testid="marketplace-domains-empty-state"]').exists()).toBe(true);
    const action = withAccess.find('[data-testid="marketplace-domains-empty-state"] .ant-btn');
    expect(action.exists()).toBe(true);
    await action.trigger('click');
    expect(withAccess.emitted('add')).toHaveLength(1);
    withAccess.unmount();

    const withoutAccess = mountWidget({ canCreate: false });
    await flushPromises();
    expect(withoutAccess.find('[data-testid="marketplace-domains-empty-state"]').exists()).toBe(true);
    expect(withoutAccess.find('[data-testid="marketplace-domains-empty-state"] .ant-btn').exists()).toBe(false);
    withoutAccess.unmount();
  });

  it('falls back to the empty state when the search fails', async () => {
    mockedSearchAssets.mockRejectedValueOnce(new Error('search down'));
    const wrapper = mountWidget();
    await flushPromises();
    expect(wrapper.find('[data-testid="marketplace-domains-empty-state"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('contains the empty state in a positioned host inside the widget', async () => {
    // Lane 0: the placeholder root is absolutely positioned, so without
    // the pin's relative host wrapper both widgets' empty states anchor
    // to the same ancestor up the page, stack, and cover the sidebar.
    mockedSearchAssets.mockResolvedValue(searchPage([], 0));
    const wrapper = mountWidget();
    await flushPromises();
    const empty = wrapper.find('[data-testid="marketplace-domains-empty-state"]');
    expect(empty.exists()).toBe(true);
    const host = empty.element.closest('.marketplace-widget__empty');
    expect(host).not.toBeNull();
    expect(wrapper.find('[data-testid="marketplace-domains-widget"]').element.contains(host as Element)).toBe(true);
    wrapper.unmount();
  });
});
