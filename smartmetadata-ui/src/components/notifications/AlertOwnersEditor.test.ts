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
import type { EntityRef } from '@/types/api';
import AlertOwnersEditor from './AlertOwnersEditor.vue';

const listUsers = vi.fn();
const listTeams = vi.fn();
const searchUsers = vi.fn();

vi.mock('@/api/users', () => ({
  listUsers: (...args: unknown[]) => listUsers(...args),
  searchUsers: (...args: unknown[]) => searchUsers(...args),
}));
vi.mock('@/api/teams', () => ({ listTeams: (...args: unknown[]) => listTeams(...args) }));

function mountEditor(modelValue: EntityRef[] = []): VueWrapper {
  return mount(AlertOwnersEditor, {
    props: { modelValue },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('AlertOwnersEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listUsers.mockResolvedValue({
      data: [{ id: 'u1', name: 'alice', displayName: 'Alice' }],
    });
    listTeams.mockResolvedValue({
      data: [{ id: 't1', name: 'data-team', displayName: 'Data Team' }],
    });
    searchUsers.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('loads users as selectable and teams as disabled options', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    const options = wrapper.findComponent(Select).props('options') as Array<{
      value: string;
      disabled: boolean;
    }>;
    expect(options).toEqual([
      { value: 'user:alice', label: 'Alice', disabled: false, ref: expect.anything() },
      { value: 'team:data-team', label: 'Data Team', disabled: true, ref: expect.anything() },
    ]);
  });

  it('resolves pre-saved owners before the lists load', () => {
    const saved: EntityRef = {
      id: 'u9',
      type: 'user',
      name: 'zoe',
      displayName: 'Zoe',
    } as EntityRef;
    const wrapper = mountEditor([saved]);
    expect(wrapper.findComponent(Select).props('value')).toEqual(['user:zoe']);
  });

  it('emits the selected refs on change', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    await wrapper.findComponent(Select).vm.$emit('change', ['user:alice']);
    expect(wrapper.emitted('update:modelValue')).toEqual([
      [[{ id: 'u1', type: 'user', name: 'alice', displayName: 'Alice', fullyQualifiedName: 'alice' }]],
    ]);
  });

  it('searches users remotely, debounced', async () => {
    searchUsers.mockResolvedValue({
      data: [{ id: 'u2', name: 'bob', displayName: 'Bob' }],
    });
    const wrapper = mountEditor();
    await flushPromises();
    const select = wrapper.findComponent(Select);
    await select.vm.$emit('search', 'b');
    await select.vm.$emit('search', 'bo');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(searchUsers).toHaveBeenCalledTimes(1);
    expect(searchUsers).toHaveBeenCalledWith('bo', 0, 25, 'isBot:false');
    const options = wrapper.findComponent(Select).props('options') as Array<{ value: string }>;
    expect(options.map((option) => option.value)).toContain('user:bob');
  });

  it('keeps the mounted options when the remote search fails', async () => {
    searchUsers.mockRejectedValue(new Error('down'));
    const wrapper = mountEditor();
    await flushPromises();
    await wrapper.findComponent(Select).vm.$emit('search', 'x');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    const options = wrapper.findComponent(Select).props('options') as Array<{ value: string }>;
    expect(options.map((option) => option.value)).toEqual(['user:alice', 'team:data-team']);
  });

  it('shows the fetch error when the initial lists fail', async () => {
    listUsers.mockRejectedValue(new Error('down'));
    const wrapper = mountEditor();
    await flushPromises();
    expect(wrapper.text()).toContain('Error while fetching');
  });
});
