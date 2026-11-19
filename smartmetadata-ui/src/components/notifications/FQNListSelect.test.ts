/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd, { Select } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import FQNListSelect from './FQNListSelect.vue';

const resolveWildcardFqns = vi.fn();
const reportErrorToast = vi.fn();

vi.mock('@/utils/notifications/alertSourceSearch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/notifications/alertSourceSearch')>();
  return {
    ...actual,
    resolveWildcardFqns: (...args: unknown[]) => resolveWildcardFqns(...args),
    reportErrorToast: (...args: unknown[]) => reportErrorToast(...args),
  };
});

const hooks = {
  t: ((key: string) => key) as never,
  notifyError: vi.fn(),
  notifyWarning: vi.fn(),
};

function mountSelect(props: Record<string, unknown>): VueWrapper {
  return mount(FQNListSelect, {
    props: {
      api: vi.fn().mockResolvedValue([]),
      value: [],
      searchIndex: 'table',
      hooks,
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('FQNListSelect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resolveWildcardFqns.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('searches once on mount, after the debounce', async () => {
    const api = vi.fn().mockResolvedValue([{ value: 'svc.db.tbl', label: 'tbl' }]);
    const wrapper = mountSelect({ api });
    expect(api).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith('');
    await flushPromises();
    expect(wrapper.findComponent(Select).props('options')).toEqual([
      { value: 'svc.db.tbl', label: 'tbl' },
    ]);
  });

  it('debounces typing to the last query', async () => {
    const api = vi.fn().mockResolvedValue([]);
    const wrapper = mountSelect({ api });
    const select = wrapper.findComponent(Select);
    await select.vm.$emit('search', 's');
    await select.vm.$emit('search', 'sv');
    await select.vm.$emit('search', 'svc');
    await vi.advanceTimersByTimeAsync(400);
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith('svc');
  });

  it('dedupes options by id', async () => {
    const api = vi.fn().mockResolvedValue([
      { value: 'a', label: 'A' },
      { value: 'a', label: 'A again' },
      { value: 'b', label: 'B' },
    ]);
    const wrapper = mountSelect({ api });
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
    expect(wrapper.findComponent(Select).props('options')).toEqual([
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ]);
  });

  it('emits deduped values on change', async () => {
    const wrapper = mountSelect({});
    await wrapper.findComponent(Select).vm.$emit('change', ['a', 'b', 'a']);
    expect(wrapper.emitted('update:value')).toEqual([[['a', 'b']]]);
  });

  it('toasts a search failure and stops loading', async () => {
    const error = new Error('search broke');
    const api = vi.fn().mockRejectedValue(error);
    const wrapper = mountSelect({ api });
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
    expect(reportErrorToast).toHaveBeenCalledWith(error, hooks);
    expect(wrapper.findComponent(Select).props('loading')).toBe(false);
  });

  it('ignores a stale answer that lands after a newer search', async () => {
    let resolveFirst!: (value: Array<{ value: string; label: string }>) => void;
    const first = new Promise<Array<{ value: string; label: string }>>((resolve) => {
      resolveFirst = resolve;
    });
    const api = vi.fn().mockReturnValueOnce(first).mockResolvedValue([{ value: 'new', label: 'New' }]);
    const wrapper = mountSelect({ api });
    const select = wrapper.findComponent(Select);
    await vi.advanceTimersByTimeAsync(400);
    expect(api).toHaveBeenCalledTimes(1);
    await select.vm.$emit('search', 'new');
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
    resolveFirst([{ value: 'stale', label: 'Stale' }]);
    await flushPromises();
    expect(wrapper.findComponent(Select).props('options')).toEqual([
      { value: 'new', label: 'New' },
    ]);
  });

  it('hints the subtree on container FQNs without persisting it', async () => {
    resolveWildcardFqns.mockResolvedValue(['svc.db']);
    const wrapper = mountSelect({ value: ['svc.db'] });
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('svc.db.*');
  });

  it('renders the hint with the error status', () => {
    const wrapper = mountSelect({ hint: 'Pick at least one' });
    expect(wrapper.find('.fqn-list-select__hint').text()).toBe('Pick at least one');
    expect(wrapper.findComponent(Select).props('status')).toBe('error');
  });
});
