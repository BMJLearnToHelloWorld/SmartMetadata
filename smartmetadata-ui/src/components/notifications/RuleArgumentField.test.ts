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
import Antd, { Input, Select } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import RuleArgumentField from './RuleArgumentField.vue';

const searchAlertAiArgumentOptions = vi.fn();
const resolveAlertAiArgumentLabels = vi.fn();

vi.mock('@/utils/notifications/alertArgumentSearch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/notifications/alertArgumentSearch')>();
  return {
    ...actual,
    searchAlertAiArgumentOptions: (...args: unknown[]) => searchAlertAiArgumentOptions(...args),
    resolveAlertAiArgumentLabels: (...args: unknown[]) => resolveAlertAiArgumentLabels(...args),
  };
});

const hooks = {
  t: ((key: string) => key) as never,
  notifyError: vi.fn(),
  notifyWarning: vi.fn(),
};

function mountField(props: Record<string, unknown>): VueWrapper {
  return mount(RuleArgumentField, {
    props: { argument: 'eventTypeList', sourceSearch: {} as never, hooks, ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('RuleArgumentField', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchAlertAiArgumentOptions.mockResolvedValue([]);
    resolveAlertAiArgumentLabels.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders a fixed enum select for eventTypeList, narrowed by the supported types', async () => {
    const wrapper = mountField({ supportedEventTypes: ['entityCreated', 'entityUpdated'] });
    const select = wrapper.findComponent(Select);
    expect(select.exists()).toBe(true);
    expect(select.props('options')).toEqual([
      { value: 'entityCreated', label: 'Entity Created' },
      { value: 'entityUpdated', label: 'Entity Updated' },
    ]);
    await select.vm.$emit('change', ['entityCreated']);
    expect(wrapper.emitted('update:input')).toEqual([[['entityCreated']]]);
  });

  it('loads the first page of searchable options on mount', async () => {
    searchAlertAiArgumentOptions.mockResolvedValue([{ id: 'dom1', label: 'Domain One' }]);
    const wrapper = mountField({ argument: 'domainList' });
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(searchAlertAiArgumentOptions).toHaveBeenCalledWith(
      expect.objectContaining({ argument: 'domainList', searchText: '' }),
      hooks,
    );
    expect(wrapper.findComponent(Select).props('options')).toContainEqual({
      value: 'dom1',
      label: 'Domain One',
      disabled: undefined,
    });
  });

  it('debounces autocomplete searches and shows the no-results row on empty answers', async () => {
    searchAlertAiArgumentOptions.mockResolvedValue([]);
    const wrapper = mountField({ argument: 'domainList' });
    await flushPromises();
    const select = wrapper.findComponent(Select);
    await select.vm.$emit('search', 'zzz');
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    expect(searchAlertAiArgumentOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ searchText: 'zzz' }),
      hooks,
    );
    expect(wrapper.findComponent(Select).props('options')).toEqual([
      { value: '__no_results__', label: 'No data found', disabled: true },
    ]);
  });

  it('resolves labels for saved values the first page did not carry', async () => {
    searchAlertAiArgumentOptions.mockResolvedValue([]);
    resolveAlertAiArgumentLabels.mockResolvedValue([{ id: 'dom9', label: 'Domain Nine' }]);
    const wrapper = mountField({ argument: 'domainList', inputValue: ['dom9'] });
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(resolveAlertAiArgumentLabels).toHaveBeenCalledWith('domainList', ['dom9']);
    expect(wrapper.text()).toContain('Domain Nine');
  });

  it('renders a comma-separated text input for any other argument', async () => {
    const wrapper = mountField({ argument: 'customArg', inputValue: ['a', 'b'] });
    const input = wrapper.findComponent(Input);
    expect(input.exists()).toBe(true);
    expect((input.find('input').element as HTMLInputElement).value).toBe('a, b');
    await input.find('input').setValue('x, y,,z');
    // The input fires on every keystroke event, so the split value is
    // emitted once per event; every emission carries the same split.
    const emissions = wrapper.emitted('update:input') ?? [];
    expect(emissions.length).toBeGreaterThan(0);
    expect(emissions.every((emission) => JSON.stringify(emission) === JSON.stringify([['x', 'y', 'z']]))).toBe(true);
  });

  it('shows the error line and locks the control in view-only mode', () => {
    const wrapper = mountField({ argument: 'customArg', error: 'Required', isViewOnly: true });
    expect(wrapper.find('.rule-argument-field__hint').text()).toBe('Required');
    expect(wrapper.findComponent(Input).props('disabled')).toBe(true);
  });
});
