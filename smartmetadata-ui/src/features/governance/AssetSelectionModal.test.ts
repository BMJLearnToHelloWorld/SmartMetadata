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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { SearchHit } from '@/types/api';
import AssetSelectionModal from './AssetSelectionModal.vue';

const searchAssets = vi.fn();
const getTagByFqn = vi.fn();
const addAssetsToTags = vi.fn();

vi.mock('@/api/search', () => ({
  searchAssets: (...args: unknown[]) => searchAssets(...args),
}));

vi.mock('@/api/tags', () => ({
  getTagByFqn: (...args: unknown[]) => getTagByFqn(...args),
  addAssetsToTags: (...args: unknown[]) => addAssetsToTags(...args),
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

const EXCLUSION_FILTER = JSON.stringify({
  query: {
    bool: {
      must: [
        { bool: { must_not: [{ term: { 'tags.tagFQN': 'PII.Sensitive' } }] } },
        { bool: { must_not: [{ terms: { entityType: ['tag', 'dataProduct', 'table'] } }] } },
      ],
    },
  },
});

function footerButton(primary: boolean): HTMLElement | null {
  return document.querySelector(
    primary ? '.ant-modal-footer .ant-btn-primary' : '.ant-modal-footer .ant-btn-default',
  ) as HTMLElement | null;
}

async function mountModal() {
  const wrapper = mount(AssetSelectionModal, {
    props: { entityFqn: 'PII.Sensitive', open: true, queryFilter: EXCLUSION_FILTER },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

describe('AssetSelectionModal (pin TagPage add-assets modal)', () => {
  beforeEach(() => {
    searchAssets.mockReset();
    getTagByFqn.mockReset();
    addAssetsToTags.mockReset();
    searchAssets.mockResolvedValue({ total: 2, hits: [ORDERS, DASHBOARD], facets: [] });
    getTagByFqn.mockResolvedValue({ id: 'tg1', name: 'Sensitive', fullyQualifiedName: 'PII.Sensitive' });
    addAssetsToTags.mockResolvedValue({ jobId: 'job-1' });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('fetches candidates with the parent exclusion filter merged in', async () => {
    const wrapper = await mountModal();
    expect(getTagByFqn).toHaveBeenCalledWith('PII.Sensitive');
    expect(searchAssets).toHaveBeenCalledWith(
      '',
      0,
      25,
      expect.objectContaining({ index: 'all' }),
    );
    const filterArg = JSON.parse(String(searchAssets.mock.calls[0][3].query_filter));
    const must = filterArg.query.bool.must as unknown[];
    expect(must).toHaveLength(2);
    expect(JSON.stringify(must[0])).toContain('PII.Sensitive');
    expect(JSON.stringify(must[1])).toContain('dataProduct');
    expect(document.body.textContent).toContain('Orders');
    expect(document.body.textContent).toContain('Sales');
    wrapper.unmount();
  });

  it('searches by text as it is typed, without submitting', async () => {
    const wrapper = await mountModal();
    searchAssets.mockClear();
    const searchRoot = document.querySelector('[data-testid="asset-selection-search"]');
    // Ant forwards the test id to the input itself, not the search wrapper.
    const input =
      searchRoot instanceof HTMLInputElement
        ? searchRoot
        : (searchRoot?.querySelector('input') as HTMLInputElement | null);
    expect(input).not.toBeNull();
    input!.value = 'orders';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    await flushPromises();
    // Pin useAssetSelectionState: the fetch effect depends on `search`,
    // so typing alone refetches — no Enter / search-button click.
    expect(searchAssets).toHaveBeenCalledWith(
      'orders',
      0,
      25,
      expect.objectContaining({ index: 'all' }),
    );
    wrapper.unmount();
  });

  it('drops a stale search response when a newer search resolves first', async () => {
    const wrapper = await mountModal();
    searchAssets.mockClear();
    const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void } => {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    };
    type Page = { total: number; hits: SearchHit[]; facets: [] };
    const first = deferred<Page>();
    const second = deferred<Page>();
    searchAssets.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const searchRoot = document.querySelector('[data-testid="asset-selection-search"]');
    const input =
      searchRoot instanceof HTMLInputElement
        ? searchRoot
        : (searchRoot?.querySelector('input') as HTMLInputElement | null);
    expect(input).not.toBeNull();
    input!.value = 'o';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    input!.value = 'or';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    expect(searchAssets).toHaveBeenCalledTimes(2);
    second.resolve({ total: 1, hits: [DASHBOARD], facets: [] });
    await flushPromises();
    expect(document.body.textContent).toContain('Sales');
    first.resolve({ total: 1, hits: [ORDERS], facets: [] });
    await flushPromises();
    await flushPromises();
    // The stale first response must not overwrite the newer list.
    expect(document.body.textContent).toContain('Sales');
    expect(document.body.textContent).not.toContain('Orders');
    wrapper.unmount();
  });

  it('shows the fetch error when loading candidates fails', async () => {
    searchAssets.mockRejectedValue(new Error('search exploded'));
    const wrapper = await mountModal();
    const error = document.querySelector('[data-testid="asset-selection-error"]');
    expect(error).not.toBeNull();
    expect(error!.textContent).toContain('search exploded');
    wrapper.unmount();
  });

  it('keeps save disabled when the tag cannot be resolved', async () => {
    getTagByFqn.mockRejectedValue(new Error('tag not found'));
    const wrapper = await mountModal();
    // Select an asset so the only disabling cause is the missing tag id.
    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(checkbox).not.toBeNull();
    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();
    const okButton = footerButton(true);
    expect(okButton).not.toBeNull();
    expect(okButton!.hasAttribute('disabled')).toBe(true);
    wrapper.unmount();
  });

  it('saves the selected assets through addAssetsToTags and reports save', async () => {
    const wrapper = await mountModal();
    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(checkbox).not.toBeNull();
    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();
    const okButton = footerButton(true);
    expect(okButton).not.toBeNull();
    expect(okButton!.hasAttribute('disabled')).toBe(false);
    okButton!.click();
    await flushPromises();
    await flushPromises();
    // onSave waits 500ms for the ES index to catch up before emitting
    // 'save'; wait it out (real timers) before asserting the emit.
    await new Promise((resolve) => setTimeout(resolve, 600));
    await flushPromises();
    expect(addAssetsToTags).toHaveBeenCalledWith('tg1', [
      expect.objectContaining({ id: 't1', type: 'table', fullyQualifiedName: 'svc.db.schema.orders' }),
    ]);
    expect(wrapper.emitted('save')).toHaveLength(1);
    wrapper.unmount();
  });

  it('keeps save disabled with nothing selected', async () => {
    const wrapper = await mountModal();
    const okButton = footerButton(true);
    expect(okButton).not.toBeNull();
    expect(okButton!.hasAttribute('disabled')).toBe(true);
    wrapper.unmount();
  });

  it('emits cancel from the cancel button', async () => {
    const wrapper = await mountModal();
    const cancelButton = footerButton(false);
    expect(cancelButton).not.toBeNull();
    cancelButton!.click();
    await flushPromises();
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    wrapper.unmount();
  });
});
