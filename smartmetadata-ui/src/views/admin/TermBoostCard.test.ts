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
import { Slider, message } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import TermBoostCard from './TermBoostCard.vue';

vi.mock('@/api/search', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/search')>()),
  searchAssets: vi.fn(),
}));

import { searchAssets } from '@/api/search';

const searchMock = searchAssets as unknown as ReturnType<typeof vi.fn>;

function mountCard(termBoost?: { field?: string; value?: string; boost?: number }) {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        settings: {
          searchPrefs: {
            selectTag: 'Select a tag',
            boost: 'Boost',
            delete: 'Delete',
            loadFailed: 'Load failed',
          },
        },
      },
    },
  });
  return mount(TermBoostCard, {
    attachTo: document.body,
    props: termBoost ? { termBoost } : {},
    global: { plugins: [i18n] },
  });
}

async function openSelect(wrapper: ReturnType<typeof mountCard>) {
  const selector = wrapper.find('[data-testid="term-boost-select"] .ant-select-selector');
  await selector.trigger('mousedown');
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  searchMock.mockResolvedValue({
    total: 2,
    hits: [
      { fullyQualifiedName: 'PII.Sensitive' },
      { fullyQualifiedName: 'Tier.Tier1' },
    ],
    facets: [],
  });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('TermBoostCard', () => {
  it('fetches tags on mount for a new card and reports the selection', async () => {
    const wrapper = mountCard();
    await flushPromises();
    expect(searchMock).toHaveBeenCalledWith('**', 0, 10, {
      index: 'tag',
      query_filter: JSON.stringify({
        query: { bool: { must: [{ term: { disabled: 'false' } }] } },
      }),
    });
    await openSelect(wrapper);
    const options = [...document.body.querySelectorAll('.ant-select-item-option')];
    expect(options.map((option) => option.textContent)).toEqual([
      'PII.Sensitive',
      'Tier.Tier1',
    ]);
    options[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const changes = wrapper.emitted('change') as unknown[][];
    expect(changes[changes.length - 1][0]).toEqual({
      field: 'tier.tagFQN',
      value: 'Tier.Tier1',
      boost: 0,
    });
  });

  it('debounces tag searches while typing', async () => {
    const wrapper = mountCard();
    await flushPromises();
    expect(searchMock).toHaveBeenCalledTimes(1);
    await openSelect(wrapper);
    const searchInput = wrapper.find(
      '[data-testid="term-boost-select"] .ant-select-selection-search input',
    ).element as HTMLInputElement;
    searchInput.value = 'PII';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(searchMock).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await flushPromises();
    expect(searchMock).toHaveBeenCalledTimes(2);
    expect(searchMock).toHaveBeenLastCalledWith('*PII*', 0, 10, expect.anything());
  });

  it('reports slider changes and deletes with the stored value', async () => {
    const wrapper = mountCard({ field: 'tags.tagFQN', value: 'PII.Sensitive', boost: 2 });
    await flushPromises();
    expect(searchMock).not.toHaveBeenCalled();
    const slider = wrapper.findComponent(Slider);
    await slider.vm.$emit('update:value', 5);
    expect(wrapper.emitted('change')).toContainEqual([
      { field: 'tags.tagFQN', value: 'PII.Sensitive', boost: 5 },
    ]);
    await wrapper.find('[data-testid="delete-term-boost"]').trigger('click');
    expect(wrapper.emitted('delete')).toEqual([['PII.Sensitive']]);
  });

  it('disables the tag select for an existing boost', async () => {
    const wrapper = mountCard({ field: 'tags.tagFQN', value: 'PII.Sensitive', boost: 2 });
    await flushPromises();
    const select = wrapper.find('[data-testid="term-boost-select"]');
    expect(select.classes()).toContain('ant-select-disabled');
    expect(wrapper.find('[data-testid="term-boost-value"]').text()).toBe('2');
    expect(wrapper.find('[data-testid="term-boost-PII.Sensitive"]').exists()).toBe(true);
  });

  it('toasts when the tag fetch fails', async () => {
    searchMock.mockRejectedValue(new Error('tags down'));
    const errorSpy = vi.spyOn(message, 'error');
    mountCard();
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('tags down');
    errorSpy.mockRestore();
  });

  it('reports a cleared selection as an empty boost', async () => {
    const wrapper = mountCard();
    await flushPromises();
    await openSelect(wrapper);
    const options = [...document.body.querySelectorAll('.ant-select-item-option')];
    options[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const clear = wrapper.find('.ant-select-clear');
    expect(clear.exists()).toBe(true);
    await clear.trigger('mousedown');
    await flushPromises();
    const changes = wrapper.emitted('change') as unknown[][];
    expect(changes[changes.length - 1][0]).toEqual({ field: '', value: '', boost: 0 });
  });
});
