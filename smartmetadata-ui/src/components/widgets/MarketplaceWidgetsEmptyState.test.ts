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
import { defineComponent, h } from 'vue';
import { searchAssets } from '@/api/search';
import { createTestI18n } from '@/test/i18n';
import type { SearchPage } from '@/types/api';
import MarketplaceDataProductsWidget from './MarketplaceDataProductsWidget.vue';
import MarketplaceDomainsWidget from './MarketplaceDomainsWidget.vue';

vi.mock('@/api/search', () => ({ searchAssets: vi.fn() }));

const mockedSearchAssets = vi.mocked(searchAssets);

function searchPage(hits: SearchPage['hits'], total = hits.length): SearchPage {
  return { total, hits, facets: [] };
}

// Both marketplace widgets side by side, as MarketplaceOverviewView
// renders them: the live bug was that their two empty states anchored
// to the same ancestor up the page, stacked on one spot, and the
// placeholder hit-area covered the sidebar so no sidebar click worked.
const BothWidgetsEmpty = defineComponent({
  setup() {
    return () =>
      h('div', { 'data-testid': 'marketplace-both-widgets' }, [
        h(MarketplaceDataProductsWidget, { canCreate: true }),
        h(MarketplaceDomainsWidget, { canCreate: true }),
      ]);
  },
});

describe('Marketplace widgets empty states (Lane 0 hotfix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gives each empty state its own positioned host inside its own widget', async () => {
    mockedSearchAssets.mockResolvedValue(searchPage([], 0));
    const wrapper = mount(BothWidgetsEmpty, {
      attachTo: document.body,
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();

    const dpEmpty = wrapper.find('[data-testid="marketplace-dp-empty-state"]');
    const domainsEmpty = wrapper.find('[data-testid="marketplace-domains-empty-state"]');
    expect(dpEmpty.exists()).toBe(true);
    expect(domainsEmpty.exists()).toBe(true);

    const dpHost = dpEmpty.element.closest('.marketplace-widget__empty');
    const domainsHost = domainsEmpty.element.closest('.marketplace-widget__empty');
    expect(dpHost).not.toBeNull();
    expect(domainsHost).not.toBeNull();
    // The two empty states must not share one anchor: before the fix
    // both placeholders escaped to the same ancestor and overlapped.
    expect(dpHost).not.toBe(domainsHost);
    expect(wrapper.find('[data-testid="marketplace-dp-widget"]').element.contains(dpHost as Element)).toBe(true);
    expect(
      wrapper.find('[data-testid="marketplace-domains-widget"]').element.contains(domainsHost as Element),
    ).toBe(true);
    wrapper.unmount();
  });
});
