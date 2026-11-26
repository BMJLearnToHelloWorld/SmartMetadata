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
import Antd, { Select } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { EXPLORE_TABS } from '@/catalog/exploreTabs';
import { useAuthStore } from '@/stores/auth';
import { recordRecentSearch } from '@/stores/recentSearches';
import { useSearchStore } from '@/stores/search';
import { createTestI18n } from '@/test/i18n';
import GlobalSearchBar from './GlobalSearchBar.vue';

const mockSearchAssets = vi.fn();
const mockGetNLPEnabledStatus = vi.fn();

vi.mock('@/api/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/search')>();
  return {
    ...actual,
    searchAssets: (...args: unknown[]) => mockSearchAssets(...args),
    getNLPEnabledStatus: (...args: unknown[]) => mockGetNLPEnabledStatus(...args),
  };
});

const SEARCH_PAGE = {
  hits: [
    {
      id: 't1',
      name: 'orders',
      displayName: 'Orders',
      fullyQualifiedName: 'svc.db.schema.orders',
      entityType: 'table',
      owners: [],
      tags: [],
    },
    {
      id: 'k1',
      name: 'events',
      fullyQualifiedName: 'kafka.events',
      entityType: 'topic',
      owners: [],
      tags: [],
    },
  ],
  total: 2,
  facets: [],
};

const mountedWrappers: { unmount: () => void }[] = [];

async function mountBar(initialPath = '/') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/search/:tab?', name: 'search', component: { template: '<div>search</div>' } },
      {
        path: '/assets/:entityType/:fqn',
        name: 'asset',
        component: { template: '<div>asset</div>' },
      },
    ],
  });
  await router.push(initialPath);
  await router.isReady();
  useAuthStore().user = { id: 'u1', name: 'alice', isAdmin: false };
  const wrapper = mount(GlobalSearchBar, {
    global: { plugins: [router, pinia, Antd, createTestI18n()] },
  });
  mountedWrappers.push(wrapper);
  await flushPromises();
  return { wrapper, router };
}

describe('GlobalSearchBar', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    mockSearchAssets.mockReset();
    mockSearchAssets.mockResolvedValue(SEARCH_PAGE);
    mockGetNLPEnabledStatus.mockReset();
    mockGetNLPEnabledStatus.mockResolvedValue(false);
  });

  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
      wrapper.unmount();
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('debounces suggestions 400ms and fetches 15 hits without aggregations', async () => {
    const { wrapper } = await mountBar();
    const input = wrapper.find('[data-testid="global-search"]');
    await input.setValue('ord');
    expect(mockSearchAssets).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(399);
    expect(mockSearchAssets).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mockSearchAssets).toHaveBeenCalledTimes(1);
    expect(mockSearchAssets).toHaveBeenCalledWith('ord', 0, 15, {
      index: 'dataAsset',
      includeAggregations: false,
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="global-search-group-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="global-search-group-topic"]').exists()).toBe(true);
  });

  it('fetches suggestions in the picked scope and only the latest request wins', async () => {
    const { wrapper } = await mountBar();
    const input = wrapper.find('[data-testid="global-search"]');
    await input.setValue('orders');
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
    wrapper.findComponent(Select).vm.$emit('change', 'table');
    await flushPromises();
    expect(mockSearchAssets).toHaveBeenLastCalledWith('orders', 0, 15, {
      index: 'table',
      includeAggregations: false,
    });
  });

  it('opens a wired suggestion on its detail page', async () => {
    const { wrapper, router } = await mountBar();
    const input = wrapper.find('[data-testid="global-search"]');
    await input.setValue('orders');
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
    const suggestions = wrapper.findAll('[data-testid="global-search-suggestion"]');
    expect(suggestions).toHaveLength(2);
    await suggestions[0]?.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('asset');
    expect(router.currentRoute.value.params).toEqual({
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
    });
  });

  it('submits the search with the scope as tab and records the recent search', async () => {
    const { wrapper, router } = await mountBar();
    wrapper.findComponent(Select).vm.$emit('change', 'table');
    await flushPromises();
    const input = wrapper.find('[data-testid="global-search"]');
    await input.setValue('orders');
    // Let the controlled-value update chain settle (ant syncs its
    // internal state from the prop on the next tick) before pressing
    // Enter, then re-find the input: the value update re-renders the
    // bar (the clear-button suffix appears), and a wrapper found before
    // that render no longer reaches the live input's keydown handler.
    await flushPromises();
    await wrapper.find('[data-testid="global-search"]').trigger('keydown.enter');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('search');
    expect(router.currentRoute.value.query).toEqual({ q: 'orders' });
    expect(router.currentRoute.value.params.tab).toBe('tables');
    expect(useSearchStore().isNLPEnabled).toBe(false);
  });

  it('shows recent searches on an empty input and runs one on click', async () => {
    recordRecentSearch('alice', 'orders');
    recordRecentSearch('alice', 'events');
    const { wrapper, router } = await mountBar();
    await wrapper.find('[data-testid="global-search"]').trigger('focus');
    await flushPromises();
    const recents = wrapper.findAll('[data-testid="global-search-recent"]');
    expect(recents.map((recent) => recent.text())).toEqual(['events', 'orders']);
    await recents[0]?.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ q: 'events' });
  });

  it('shows the enter hint when a query has no suggestions', async () => {
    mockSearchAssets.mockResolvedValue({ hits: [], total: 0, facets: [] });
    const { wrapper } = await mountBar();
    await wrapper.find('[data-testid="global-search"]').setValue('zzz-no-such-asset');
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
    expect(wrapper.find('[data-testid="global-search-popover"]').text()).toContain(
      'Press Enter to find data assets containing "zzz-no-such-asset"',
    );
  });

  it('hides the NLP toggle while NLP is disabled', async () => {
    const { wrapper } = await mountBar();
    expect(wrapper.find('[data-testid="nlp-suggestions-button"]').exists()).toBe(false);
  });

  // Not the first test in the file: the first mount in a worker takes
  // ~4-7s on this VM (cold V8 + full Antd plugin), which can exceed the
  // 5s test timeout before this test's own work even starts; once warm
  // the mount is ~1s. The assertion itself is unchanged.
  it('offers All plus the 24 Explore indexes as the search scope', async () => {
    const { wrapper } = await mountBar();
    // The bar passes the scope list as the Select's `options` prop, so
    // the complete ordered set is assertable directly: the dropdown
    // virtualizes its list, so the DOM only ever holds the visible
    // window (~12 of 25) and cannot be counted. The labels are i18n
    // lookups over exploreTabs, covered by exploreTabs.test.ts +
    // referencedKeys.test.ts; the values prove the set and the order.
    const select = wrapper.findComponent(Select);
    const options = select.props('options') as { value: string; label: string }[];
    expect(options).toHaveLength(EXPLORE_TABS.length + 1);
    expect(options.map((option) => option.value)).toEqual([
      '',
      ...EXPLORE_TABS.map((tab) => tab.index),
    ]);
    expect(options.map((option) => option.label)).toContain('All');
    expect(options.map((option) => option.label)).toContain('Table');
    expect(options.map((option) => option.label)).toContain('Knowledge page');
    // And the dropdown itself opens with the options rendered.
    const selector = wrapper.find('[data-testid="global-search-scope"] .ant-select-selector');
    selector.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    selector.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const rendered = document.body.querySelectorAll('.ant-select-item-option');
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered[0]?.textContent).toBe('All');
    expect([...rendered].some((option) => option.textContent === 'Table')).toBe(true);
  });

  it('shows the NLP toggle when enabled and offers AI queries on an empty input', async () => {
    mockGetNLPEnabledStatus.mockResolvedValue(true);
    const { wrapper } = await mountBar();
    expect(wrapper.find('[data-testid="nlp-suggestions-button"]').exists()).toBe(true);
    await wrapper.find('[data-testid="nlp-suggestions-button"]').trigger('click');
    await flushPromises();
    expect(useSearchStore().isNLPActive).toBe(true);
    await wrapper.find('[data-testid="global-search"]').trigger('focus');
    await flushPromises();
    const aiQueries = wrapper.findAll('[data-testid="global-search-ai-query"]');
    expect(aiQueries).toHaveLength(5);
    await aiQueries[0]?.trigger('click');
    await flushPromises();
    expect(
      (wrapper.find('[data-testid="global-search"]').element as HTMLInputElement).value,
    ).toBe('Tables owned by marketing');
    // While NLP is active the bar never fetches keyword suggestions.
    expect(mockSearchAssets).not.toHaveBeenCalled();
  });

  it('clears the Explore search when cleared on the search page', async () => {
    const { wrapper, router } = await mountBar('/search?q=orders');
    await flushPromises();
    expect(
      (wrapper.find('[data-testid="global-search"]').element as HTMLInputElement).value,
    ).toBe('orders');
    await wrapper.find('[data-testid="global-search-clear"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.q).toBeUndefined();
  });
});
