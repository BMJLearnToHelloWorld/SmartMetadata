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
import { message } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import SearchPreview from './SearchPreview.vue';

vi.mock('@/api/search', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/search')>()),
  searchPreview: vi.fn(),
}));

import { searchPreview } from '@/api/search';

const previewMock = searchPreview as unknown as ReturnType<typeof vi.fn>;

const CONFIG = { globalSettings: { maxResultHits: 1000 } };

function mountPreview(props: { disabledSave?: boolean; isSaving?: boolean; searchConfig?: unknown } = {}) {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        settings: {
          searchPrefs: {
            preview: 'Preview',
            rankingDetails: 'Ranking Details',
            restoreDefaults: 'Restore Defaults',
            save: 'Save',
            searchPlaceholder: 'Search for data assets',
            loadFailed: 'Load failed',
            score: 'SCORE',
          },
        },
        label: {
          'page-plural': 'Pages',
          previous: 'Previous',
          next: 'Next',
          page: 'Page',
          of: 'of',
        },
      },
    },
  });
  return mount(SearchPreview, {
    attachTo: document.body,
    props: {
      searchConfig: (props.searchConfig ?? CONFIG) as never,
      entityType: 'table',
      disabledSave: props.disabledSave ?? true,
      isSaving: props.isSaving ?? false,
    },
    global: { plugins: [i18n, createPinia()] },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  previewMock.mockResolvedValue({
    hits: [
      {
        id: 'h1',
        score: 1.23456,
        source: { entityType: 'table', name: 'orders', fullyQualifiedName: 'db.orders' },
        highlight: { name: ['<em>orders</em>'] },
        matchedQueries: ['name'],
        explanation: { value: 1.2, description: 'sum of:' },
      },
    ],
    total: 1,
  });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('SearchPreview', () => {
  it('fetches on mount with the resolved index and renders result cards', async () => {
    const wrapper = mountPreview({ disabledSave: false });
    await flushPromises();
    expect(previewMock).toHaveBeenCalledWith({
      from: 0,
      size: 15,
      index: 'table',
      query: '',
      queryFilter: '',
      explain: false,
      searchSettings: CONFIG,
    });
    expect(wrapper.text()).toContain('orders');
    expect(wrapper.text()).toContain('db.orders');
    expect(wrapper.text()).not.toContain('1.2346');
    expect(wrapper.find('[data-testid="save-btn"]').attributes('disabled')).toBeUndefined();
  });

  it('does not fetch for an empty configuration', async () => {
    mountPreview({ searchConfig: {} });
    await flushPromises();
    expect(previewMock).not.toHaveBeenCalled();
  });

  it('shows the empty placeholder when there are no hits', async () => {
    previewMock.mockResolvedValue({ hits: [], total: 0 });
    const wrapper = mountPreview();
    await flushPromises();
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
  });

  it('debounces search input and keeps the current page', async () => {
    vi.useFakeTimers();
    const wrapper = mountPreview();
    await flushPromises();
    expect(previewMock).toHaveBeenCalledTimes(1);
    const input = wrapper.find('[data-testid="searchbar"]');
    await input.setValue('ord');
    await vi.advanceTimersByTimeAsync(500);
    expect(previewMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();
    expect(previewMock).toHaveBeenCalledTimes(2);
    expect(previewMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: 'ord', from: 0 }),
    );
  });

  it('refetches with explain when ranking details are toggled on', async () => {
    const wrapper = mountPreview();
    await flushPromises();
    await wrapper.find('[data-testid="ranking-details-switch"]').trigger('click');
    await flushPromises();
    expect(previewMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ explain: true }),
    );
    expect(wrapper.text()).toContain('1.2346');
    expect(wrapper.text()).toContain('sum of:');
  });

  it('ignores stale responses, including their errors', async () => {
    const first = deferred<{ hits: unknown[]; total: number }>();
    const second = deferred<{ hits: unknown[]; total: number }>();
    previewMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const errorSpy = vi.spyOn(message, 'error');
    const wrapper = mountPreview();
    await flushPromises();
    await wrapper.setProps({ searchConfig: { globalSettings: { maxResultHits: 500 } } as never });
    await flushPromises();
    first.resolve({
      hits: [
        {
          id: 'stale',
          source: { entityType: 'table', name: 'stale-table', fullyQualifiedName: 'db.stale' },
        },
      ],
      total: 1,
    });
    second.resolve({ hits: [], total: 0 });
    await flushPromises();
    expect(wrapper.text()).not.toContain('stale-table');
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('toasts when the current request fails', async () => {
    previewMock.mockRejectedValue(new Error('preview down'));
    const errorSpy = vi.spyOn(message, 'error');
    mountPreview();
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('preview down');
    errorSpy.mockRestore();
  });

  it('emits restore and save, and disables save while there are no edits', async () => {
    const wrapper = mountPreview({ disabledSave: true });
    await flushPromises();
    expect(wrapper.find('[data-testid="save-btn"]').attributes('disabled')).toBeDefined();
    await wrapper.find('[data-testid="restore-defaults-btn"]').trigger('click');
    expect(wrapper.emitted('restore')).toHaveLength(1);
    await wrapper.setProps({ disabledSave: false });
    await wrapper.find('[data-testid="save-btn"]').trigger('click');
    expect(wrapper.emitted('save')).toHaveLength(1);
  });
});
