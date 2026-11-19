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
import { nextTick } from 'vue';
import Antd, { Popover, Tag } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import TeamAndUserSelectItem from './TeamAndUserSelectItem.vue';

const popoverStub = {
  props: ['open'],
  emits: ['open-change'],
  template: '<div><slot /><slot name="content" /></div>',
};

function mountPicker(props: Record<string, unknown>, onSearch: (text: string) => Promise<Array<{ value: string; label: string }>>): VueWrapper {
  return mount(TeamAndUserSelectItem, {
    props: {
      entityType: 'team',
      destinationNumber: 0,
      value: [],
      onSearch,
      ...props,
    },
    global: {
      plugins: [Antd, createTestI18n()],
      stubs: { APopover: popoverStub },
    },
  });
}

describe('TeamAndUserSelectItem', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('searches on mount after the debounce, and re-searches on typing', async () => {
    const onSearch = vi.fn(async () => [{ value: 'eng', label: 'Engineering' }]);
    const wrapper = mountPicker({}, onSearch);
    expect(onSearch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    await nextTick();
    expect(onSearch).toHaveBeenCalledWith('');
    expect(wrapper.find('[data-testid="eng"]').exists()).toBe(true);

    const input = wrapper.find('[data-testid="search-input-field"]');
    await input.setValue('eng');
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    await nextTick();
    expect(onSearch).toHaveBeenCalledWith('eng');
  });

  it('discards stale search results', async () => {
    let resolveFirst: (value: Array<{ value: string; label: string }>) => void = () => {};
    const first = new Promise<Array<{ value: string; label: string }>>((resolve) => {
      resolveFirst = resolve;
    });
    const onSearch = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValue([{ value: 'ops', label: 'Operations' }]);
    const wrapper = mountPicker({}, onSearch);
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    await nextTick();
    const input = wrapper.find('[data-testid="search-input-field"]');
    await input.setValue('ops');
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    await nextTick();
    resolveFirst([{ value: 'stale', label: 'Stale' }]);
    await flushPromises();
    await nextTick();
    expect(wrapper.find('[data-testid="ops"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stale"]').exists()).toBe(false);
  });

  it('toggles options and removes tags', async () => {
    const onSearch = vi.fn(async () => [{ value: 'eng', label: 'Engineering' }]);
    const wrapper = mountPicker({ value: ['eng'] }, onSearch);
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    await nextTick();
    await wrapper.find('[data-testid="eng"]').trigger('click');
    expect(wrapper.emitted('update:value')).toEqual([[[]]]);

    const tag = wrapper.findComponent(Tag);
    await tag.vm.$emit('close');
    expect(wrapper.emitted('update:value')).toEqual([[[]], [[]]]);
  });

  it('shows the placeholder with no selection, and selected tags otherwise', () => {
    const empty = mountPicker({}, vi.fn(async () => []));
    expect(empty.find('[data-testid="placeholder-text"]').exists()).toBe(true);
    const filled = mountPicker({ value: ['eng', 'ops'] }, vi.fn(async () => []));
    expect(filled.find('[data-testid="selected-tag-eng"]').exists()).toBe(true);
    expect(filled.find('[data-testid="selected-tag-ops"]').exists()).toBe(true);
  });

  it('does not search or open while disabled', async () => {
    const onSearch = vi.fn(async () => []);
    const wrapper = mountPicker({ disabled: true }, onSearch);
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    await nextTick();
    expect(onSearch).not.toHaveBeenCalled();
    await wrapper.find('[data-testid="team-user-select-trigger-0"]').trigger('keydown.enter');
    expect(wrapper.findComponent(Popover).props('open')).toBe(false);
  });

  it('clears the search text when the dropdown closes', async () => {
    const onSearch = vi.fn(async () => []);
    const wrapper = mountPicker({}, onSearch);
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    await nextTick();
    const input = wrapper.find('[data-testid="search-input-field"]');
    await input.setValue('eng');
    await wrapper.findComponent(Popover).vm.$emit('open-change', false);
    await nextTick();
    expect((input.element as HTMLInputElement).value).toBe('');
  });
});
