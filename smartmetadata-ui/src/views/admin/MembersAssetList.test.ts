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
import MembersAssetList from './MembersAssetList.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const EMPTY_SEARCH = { hits: { total: { value: 0 }, hits: [] } };

const ONE_TABLE = {
  hits: {
    total: { value: 1 },
    hits: [
      {
        _index: 'table_search_index',
        _source: {
          fullyQualifiedName: 'svc.db.schema.orders',
          name: 'orders',
          displayName: 'orders',
          entityType: 'table',
          owners: [],
          tags: [],
        },
      },
    ],
  },
};

describe('MembersAssetList empty-state host (pin AssetsTabs)', () => {
  let searchFixture: unknown = EMPTY_SEARCH;

  beforeEach(() => {
    localStorage.clear();
    searchFixture = EMPTY_SEARCH;
    setActivePinia(createPinia());
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/search/query')) {
          return jsonResponse(searchFixture);
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function mountList(assetKind: 'team' | 'my-data' | 'following') {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', name: 'home', component: { template: '<div />' } }],
    });
    await router.push('/');
    await router.isReady();
    const wrapper = mount(MembersAssetList, {
      props: { queryFilter: '{}', assetKind, canCreate: true, summaryPanelOpen: false },
      global: { plugins: [Antd, router, createTestI18n()] },
    });
    await flushPromises();
    return wrapper;
  }

  it.each([['my-data'], ['following']] as const)(
    '%s empty renders the placeholder inside the relative host',
    async (assetKind) => {
      const wrapper = await mountList(assetKind);
      const placeholder = wrapper.find('[data-testid="no-data-placeholder"]');
      expect(placeholder.exists()).toBe(true);
      const host = placeholder.element.closest('.members-asset-list__empty');
      // Pin AssetsTabs: the empty state must anchor to a relative host
      // with a 360px floor — never to the antd tab content, which is
      // only the search box tall when empty and let the icon overflow
      // upward over the tab strip. (jsdom does not evaluate SFC scoped
      // styles, so the position/min-height values on the host class are
      // asserted by the class contract here and verified live; the
      // structural containment is the regression guard.)
      expect(host).not.toBeNull();
    },
  );

  it('team empty renders the create placeholder inside the same host', async () => {
    const wrapper = await mountList('team');
    const placeholder = wrapper.find('[data-testid="empty-placeholder"]');
    expect(placeholder.exists()).toBe(true);
    expect(placeholder.element.closest('.members-asset-list__empty')).not.toBeNull();
  });

  it('non-empty list renders cards and no empty host', async () => {
    searchFixture = ONE_TABLE;
    const wrapper = await mountList('my-data');
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(false);
    expect(wrapper.find('.members-asset-list__empty').exists()).toBe(false);
    expect(wrapper.find('[data-testid="search-card-svc.db.schema.orders"]').exists()).toBe(true);
  });
});
