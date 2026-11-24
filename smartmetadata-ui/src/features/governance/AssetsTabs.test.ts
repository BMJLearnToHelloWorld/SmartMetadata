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
import type { SearchHit } from '@/types/api';
import AssetsTabs from './AssetsTabs.vue';

const searchAssets = vi.fn();
const removeAssetsFromTags = vi.fn();
const removeAssetsFromGlossaryTerm = vi.fn();
const removeAssetsFromMetric = vi.fn();
const confirmDelete = vi.fn();

vi.mock('@/api/search', () => ({
  searchAssets: (...args: unknown[]) => searchAssets(...args),
}));

vi.mock('@/api/metrics', () => ({
  removeAssetsFromMetric: (...args: unknown[]) => removeAssetsFromMetric(...args),
}));

vi.mock('@/api/tags', () => ({
  removeAssetsFromTags: (...args: unknown[]) => removeAssetsFromTags(...args),
}));

vi.mock('@/api/glossaryTerms', () => ({
  removeAssetsFromGlossaryTerm: (...args: unknown[]) => removeAssetsFromGlossaryTerm(...args),
}));

vi.mock('@/features/crud/confirmDelete', () => ({
  confirmDelete: (...args: unknown[]) => confirmDelete(...args),
}));

const ORDERS: SearchHit = {
  id: 't1',
  name: 'orders',
  displayName: 'Orders',
  fullyQualifiedName: 'svc.db.schema.orders',
  entityType: 'table',
  owners: [],
  tags: [],
};

const DASHBOARD: SearchHit = {
  id: 'd1',
  name: 'sales',
  displayName: 'Sales',
  fullyQualifiedName: 'svc.sales',
  entityType: 'dashboard',
  owners: [],
  tags: [],
};

function searchPage(hits: SearchHit[], total: number) {
  return {
    total,
    hits,
    facets: [
      {
        id: 'tier',
        field: 'tier.tagFQN',
        buckets: [{ key: 'Tier.Tier1', count: 2 }],
      },
    ],
  };
}

async function mountTabs(props: Record<string, unknown> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/tables/:fqn', name: 'table-detail', component: { template: '<div />' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(AssetsTabs, {
    props: {
      entityFqn: 'PII.Sensitive',
      entityId: 'tg1',
      permissions: { Create: true, EditAll: true },
      assetCount: 2,
      isSummaryPanelOpen: false,
      ...props,
    },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

function searchInput(wrapper: Awaited<ReturnType<typeof mountTabs>>) {
  // Ant forwards the test id to the input itself, not a wrapper.
  const root = wrapper.find('[data-testid="asset-search"]');
  return root.element instanceof HTMLInputElement ? root : root.find('input');
}

describe('AssetsTabs (pin TagPage ASSETS tab)', () => {
  beforeEach(() => {
    searchAssets.mockReset();
    removeAssetsFromTags.mockReset();
    removeAssetsFromGlossaryTerm.mockReset();
    confirmDelete.mockReset();
    confirmDelete.mockResolvedValue(true);
    removeAssetsFromTags.mockResolvedValue({ jobId: 'job-1' });
    removeAssetsFromGlossaryTerm.mockResolvedValue({ numberOfRowsPassed: 1 });
    searchAssets.mockResolvedValue(searchPage([ORDERS, DASHBOARD], 2));
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('searches ES with the tag query filter and auto-selects the first hit', async () => {
    const wrapper = await mountTabs();
    expect(searchAssets).toHaveBeenCalledWith(
      '**',
      0,
      15,
      expect.objectContaining({ index: 'all' }),
    );
    const filterArg = JSON.parse(String(searchAssets.mock.calls[0][3].query_filter));
    expect(filterArg).toEqual({
      query: { bool: { must: [{ term: { 'tags.tagFQN': 'PII.Sensitive' } }] } },
    });
    expect(wrapper.text()).toContain('Orders');
    expect(wrapper.text()).toContain('Sales');
    expect(wrapper.emitted('asset-click')?.[0]).toEqual([ORDERS]);
    wrapper.unmount();
  });

  it('targets tier.tagFQN for a Tier tag', async () => {
    const wrapper = await mountTabs({ entityFqn: 'Tier.Tier1' });
    const filterArg = JSON.parse(String(searchAssets.mock.calls[0][3].query_filter));
    expect(filterArg).toEqual({
      query: { bool: { must: [{ term: { 'tier.tagFQN': 'Tier.Tier1' } }] } },
    });
    wrapper.unmount();
  });

  it('narrows the search text with wildcards and resets to page one', async () => {
    const wrapper = await mountTabs();
    searchAssets.mockClear();
    const input = searchInput(wrapper);
    await input.setValue('orders');
    await flushPromises();
    await flushPromises();
    expect(searchAssets).toHaveBeenCalledWith(
      '*orders*',
      0,
      15,
      expect.objectContaining({ index: 'all' }),
    );
    wrapper.unmount();
  });

  it('pages with NextPrevious', async () => {
    searchAssets.mockResolvedValue(searchPage([ORDERS, DASHBOARD], 40));
    const wrapper = await mountTabs();
    searchAssets.mockClear();
    await wrapper.find('[data-testid="next"]').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(searchAssets).toHaveBeenCalledWith('**', 15, 15, expect.objectContaining({ index: 'all' }));
    wrapper.unmount();
  });

  it('merges a quick-filter value into the query filter', async () => {
    const wrapper = await mountTabs();
    searchAssets.mockClear();
    const menu = wrapper.find('[data-testid="tag-asset-filter-menu"] .ant-select-selector');
    menu.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushPromises();
    const tierOption = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find(
      (el) => el.textContent?.includes('Tier'),
    );
    expect(tierOption).toBeDefined();
    tierOption!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    tierOption!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const tierSelect = wrapper.find('[data-testid="tag-asset-filter-tier"] .ant-select-selector');
    expect(tierSelect.exists()).toBe(true);
    tierSelect.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushPromises();
    const valueOption = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find(
      (el) => el.textContent?.includes('Tier.Tier1'),
    );
    expect(valueOption).toBeDefined();
    valueOption!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    valueOption!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    await flushPromises();
    const lastCall = searchAssets.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const filterArg = JSON.parse(String(lastCall![3].query_filter));
    expect(filterArg.query.bool.must).toContainEqual({
      bool: { should: [{ term: { 'tier.tagFQN': 'Tier.Tier1' } }] },
    });
    wrapper.unmount();
  });

  it('previews a row on click and clears the preview when the panel closes', async () => {
    const wrapper = await mountTabs({ isSummaryPanelOpen: true });
    const rows = wrapper.findAll('.ant-table-row');
    expect(rows.length).toBe(2);
    await rows[1].trigger('click');
    expect(wrapper.emitted('asset-click')?.at(-1)).toEqual([DASHBOARD]);
    await wrapper.setProps({ isSummaryPanelOpen: false });
    await flushPromises();
    expect(wrapper.emitted('asset-click')?.at(-1)).toEqual([undefined]);
    wrapper.unmount();
  });

  it('removes one asset after confirmation and reports it', async () => {
    vi.useFakeTimers();
    const wrapper = await mountTabs();
    await wrapper.find('[data-testid="remove-asset-svc.db.schema.orders"]').trigger('click');
    await flushPromises();
    expect(confirmDelete).toHaveBeenCalled();
    expect(removeAssetsFromTags).toHaveBeenCalledWith('tg1', [
      expect.objectContaining({ id: 't1', type: 'table', fullyQualifiedName: 'svc.db.schema.orders' }),
    ]);
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    expect(wrapper.emitted('remove-asset')).toHaveLength(1);
    wrapper.unmount();
  });

  it('bulk-removes the selected assets', async () => {
    vi.useFakeTimers();
    const wrapper = await mountTabs();
    // The test id lands on the native checkbox input itself
    // (vc-checkbox forwards data-* attrs to the input).
    await wrapper.find('[data-testid="select-all-assets"]').setValue(true);
    await flushPromises();
    expect(wrapper.text()).toContain('2 selected');
    await wrapper.find('[data-testid="delete-all-button"]').trigger('click');
    await flushPromises();
    expect(removeAssetsFromTags).toHaveBeenCalledWith(
      'tg1',
      expect.arrayContaining([
        expect.objectContaining({ id: 't1' }),
        expect.objectContaining({ id: 'd1' }),
      ]),
    );
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    expect(wrapper.emitted('remove-asset')).toHaveLength(1);
    wrapper.unmount();
  });

  it('does not remove when the confirmation is declined', async () => {
    confirmDelete.mockResolvedValue(false);
    const wrapper = await mountTabs();
    await wrapper.find('[data-testid="remove-asset-svc.db.schema.orders"]').trigger('click');
    await flushPromises();
    expect(removeAssetsFromTags).not.toHaveBeenCalled();
    expect(wrapper.emitted('remove-asset')).toBeUndefined();
    wrapper.unmount();
  });

  it('shows the add-asset empty state with Create and hides it without', async () => {
    searchAssets.mockResolvedValue(searchPage([], 0));
    const withCreate = await mountTabs({ assetCount: 0 });
    expect(withCreate.find('[data-testid="data-assets-add-button"]').exists()).toBe(true);
    await withCreate.find('[data-testid="data-assets-add-button"]').trigger('click');
    expect(withCreate.emitted('add-asset')).toHaveLength(1);
    withCreate.unmount();

    const withoutCreate = await mountTabs({
      assetCount: 0,
      permissions: { Create: false, EditAll: false },
    });
    expect(withoutCreate.find('[data-testid="data-assets-add-button"]').exists()).toBe(false);
    // No pick column and no remove actions without the grants.
    expect(withoutCreate.find('[data-testid^="remove-asset-"]').exists()).toBe(false);
    withoutCreate.unmount();
  });

  it('shows the no-matching empty state when the tab total is non-zero but no hits remain', async () => {
    // m-4: a quick-filter that matches none of a non-zero tab total still
    // shows NoDataPlaceholder ("no matching data asset"), not the
    // CreatePlaceholder ("no assets linked yet") pin would show here.
    // No search text is typed, so the branch rests on tabTotal alone:
    // the parent count prop stays 2 while the list returns zero hits.
    searchAssets.mockResolvedValue(searchPage([], 0));
    const wrapper = await mountTabs();
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="no-data-placeholder"]').text()).toContain(
      'No matching data assets found',
    );
    expect(wrapper.find('[data-testid="data-assets-add-button"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('No assets linked yet');
    wrapper.unmount();
  });

  it('contains both empty states in a positioned host inside the tab', async () => {
    // Lane 0: pin AssetsTabs.component.tsx:1024 renders the empty
    // placeholder inside `h-full tw:relative tw:min-h-90`; the
    // placeholder root is absolutely positioned and needs a positioned
    // host, or it anchors up the page instead of the tab.
    searchAssets.mockResolvedValue(searchPage([], 0));
    const withCreate = await mountTabs({ assetCount: 0 });
    const addButton = withCreate.find('[data-testid="data-assets-add-button"]');
    expect(addButton.exists()).toBe(true);
    const createHost = addButton.element.closest('.tag-assets-tab__empty');
    expect(createHost).not.toBeNull();
    expect(withCreate.find('[data-testid="table-container"]').element.contains(createHost as Element)).toBe(true);
    withCreate.unmount();

    const noMatch = await mountTabs();
    const noData = noMatch.find('[data-testid="no-data-placeholder"]');
    expect(noData.exists()).toBe(true);
    expect(noData.element.closest('.tag-assets-tab__empty')).not.toBeNull();
    noMatch.unmount();
  });

  it('keeps the previous rows when the search fails', async () => {
    const wrapper = await mountTabs();
    searchAssets.mockRejectedValueOnce(new Error('boom'));
    const input = searchInput(wrapper);
    await input.setValue('zzz');
    await flushPromises();
    await flushPromises();
    expect(wrapper.text()).toContain('Orders');
    wrapper.unmount();
  });

  it('exposes refreshAssets resetting to page one', async () => {
    const wrapper = await mountTabs();
    searchAssets.mockClear();
    (wrapper.vm as unknown as { refreshAssets: () => void }).refreshAssets();
    await flushPromises();
    expect(searchAssets).toHaveBeenCalledWith('**', 0, 15, expect.objectContaining({ index: 'all' }));
    wrapper.unmount();
  });
});

describe('AssetsTabs (pin GlossaryTermsV1 ASSETS tab, B-15 G-1)', () => {
  beforeEach(() => {
    searchAssets.mockReset();
    removeAssetsFromGlossaryTerm.mockReset();
    confirmDelete.mockReset();
    confirmDelete.mockResolvedValue(true);
    removeAssetsFromGlossaryTerm.mockResolvedValue({ numberOfRowsPassed: 1 });
    searchAssets.mockResolvedValue(searchPage([ORDERS, DASHBOARD], 2));
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  function mountTermTabs(props: Record<string, unknown> = {}) {
    return mountTabs({
      type: 'glossaryTerm',
      entityId: 'term1',
      entityFqn: 'gloss.term',
      ...props,
    });
  }

  it('searches ES with the term query filter on tags.tagFQN', async () => {
    const wrapper = await mountTermTabs();
    expect(searchAssets).toHaveBeenCalledWith(
      '**',
      0,
      15,
      expect.objectContaining({ index: 'all' }),
    );
    const filterArg = JSON.parse(String(searchAssets.mock.calls[0][3].query_filter));
    expect(filterArg).toEqual({
      query: { bool: { must: [{ term: { 'tags.tagFQN': 'gloss.term' } }] } },
    });
    expect(wrapper.text()).toContain('Orders');
    wrapper.unmount();
  });

  it('removes one asset through the glossary endpoint', async () => {
    vi.useFakeTimers();
    const wrapper = await mountTermTabs();
    await wrapper.find('[data-testid="remove-asset-svc.db.schema.orders"]').trigger('click');
    await flushPromises();
    expect(confirmDelete).toHaveBeenCalled();
    expect(removeAssetsFromGlossaryTerm).toHaveBeenCalledWith('term1', [
      expect.objectContaining({ id: 't1', type: 'table', fullyQualifiedName: 'svc.db.schema.orders' }),
    ]);
    expect(removeAssetsFromTags).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    expect(wrapper.emitted('remove-asset')).toHaveLength(1);
    wrapper.unmount();
  });

  it('hides the Add action and shows the message when add is disabled', async () => {
    searchAssets.mockResolvedValue(searchPage([], 0));
    const wrapper = await mountTermTabs({
      assetCount: 0,
      addDisabledMessage: 'This term is Draft. Assets can be added once it is approved.',
    });
    expect(wrapper.find('[data-testid="data-assets-add-button"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('This term is Draft. Assets can be added once it is approved.');
    wrapper.unmount();
  });
});

describe('AssetsTabs (pin MetricAssetsTab, B2-G1)', () => {
  beforeEach(() => {
    searchAssets.mockReset();
    removeAssetsFromMetric.mockReset();
    confirmDelete.mockReset();
    confirmDelete.mockResolvedValue(true);
    removeAssetsFromMetric.mockResolvedValue({ numberOfRowsPassed: 1 });
    searchAssets.mockResolvedValue(searchPage([ORDERS, DASHBOARD], 2));
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  function mountMetricTabs(props: Record<string, unknown> = {}) {
    return mountTabs({
      type: 'metric',
      entityId: 'm1',
      entityFqn: 'kpi.mau',
      assetIds: ['t1', 'd1'],
      ...props,
    });
  }

  it('searches ES with the ids filter for the linked assets', async () => {
    const wrapper = await mountMetricTabs();
    expect(searchAssets).toHaveBeenCalledWith(
      '**',
      0,
      15,
      expect.objectContaining({ index: 'all' }),
    );
    const filterArg = JSON.parse(String(searchAssets.mock.calls[0][3].query_filter));
    expect(filterArg).toEqual({
      query: { bool: { must: [{ ids: { values: ['t1', 'd1'] } }] } },
    });
    expect(wrapper.text()).toContain('Orders');
    expect(wrapper.text()).toContain('Sales');
    wrapper.unmount();
  });

  it('removes one asset through the metric endpoint by FQN', async () => {
    vi.useFakeTimers();
    const wrapper = await mountMetricTabs();
    await wrapper.find('[data-testid="remove-asset-svc.db.schema.orders"]').trigger('click');
    await flushPromises();
    expect(confirmDelete).toHaveBeenCalled();
    expect(removeAssetsFromMetric).toHaveBeenCalledWith('kpi.mau', [
      expect.objectContaining({ id: 't1', type: 'table', fullyQualifiedName: 'svc.db.schema.orders' }),
    ]);
    expect(removeAssetsFromTags).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    expect(wrapper.emitted('remove-asset')).toHaveLength(1);
    wrapper.unmount();
  });
});
