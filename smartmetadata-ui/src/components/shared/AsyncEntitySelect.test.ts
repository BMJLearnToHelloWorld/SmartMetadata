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
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import AsyncEntitySelect, { type AsyncSelectOption } from './AsyncEntitySelect.vue';

function mountSelect(props: Record<string, unknown>) {
  return mount(AsyncEntitySelect, {
    props: { modelValue: null, fetchOptions: async () => [], ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('AsyncEntitySelect', () => {
  it('loads options on mount with seed options first', async () => {
    const fetchOptions = vi.fn(async () => [{ value: 'u1', label: 'Alice' }]);
    const wrapper = mountSelect({
      modelValue: 'u-seed',
      fetchOptions,
      seedOptions: [{ value: 'u-seed', label: 'Seed' }],
      testId: 'async-select',
    });
    await flushPromises();
    expect(fetchOptions).toHaveBeenCalledWith('');
    expect(wrapper.findComponent(Select).props('options')).toEqual([
      { value: 'u-seed', label: 'Seed' },
      { value: 'u1', label: 'Alice' },
    ]);
  });

  it('ignores a stale fetch when a newer search overtakes it', { timeout: 15000 }, async () => {
    let resolveStale!: (options: AsyncSelectOption[]) => void;
    const stale = new Promise<AsyncSelectOption[]>((resolve) => {
      resolveStale = resolve;
    });
    const fetchOptions = vi.fn(async (_term: string) => {
      if (fetchOptions.mock.calls.length === 1) {
        return stale;
      }
      return [{ value: 'u2', label: 'Bob' }];
    });
    const wrapper = mountSelect({ fetchOptions, testId: 'async-select' });
    await flushPromises();
    await wrapper.find('.ant-select-selection-search-input').setValue('bob');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    expect(wrapper.findComponent(Select).props('options')).toEqual([
      { value: 'u2', label: 'Bob' },
    ]);
    resolveStale([{ value: 'u1', label: 'Alice' }]);
    await flushPromises();
    expect(wrapper.findComponent(Select).props('options')).toEqual([
      { value: 'u2', label: 'Bob' },
    ]);
  });

  it('keeps rendering when the fetch fails', async () => {
    const fetchOptions = vi.fn(async () => {
      throw new Error('down');
    });
    const wrapper = mountSelect({ fetchOptions, testId: 'async-select' });
    await flushPromises();
    expect(wrapper.find('[data-testid="async-select"]').exists()).toBe(true);
    expect(wrapper.findComponent(Select).props('options')).toEqual([]);
  });

  it('emits update:modelValue on change', async () => {
    const wrapper = mountSelect({ testId: 'async-select' });
    await flushPromises();
    await wrapper.findComponent(Select).vm.$emit('change', 'u1');
    expect(wrapper.emitted('update:modelValue')).toEqual([['u1']]);
  });
});
