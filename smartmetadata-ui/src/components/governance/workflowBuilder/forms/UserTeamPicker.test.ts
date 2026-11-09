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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { EntityRef } from '@/types/api';
import UserTeamPicker from './UserTeamPicker.vue';

const listUsers = vi.fn();
const searchUsers = vi.fn();
const listTeams = vi.fn();

vi.mock('@/api/users', () => ({
  listUsers: (...args: unknown[]) => listUsers(...args),
  searchUsers: (...args: unknown[]) => searchUsers(...args),
}));
vi.mock('@/api/teams', () => ({
  listTeams: (...args: unknown[]) => listTeams(...args),
}));

const alice: EntityRef = {
  id: 'u1',
  type: 'user',
  name: 'alice',
  displayName: 'Alice',
  fullyQualifiedName: 'alice',
};

async function mountPicker(props: Record<string, unknown> = {}) {
  const wrapper = mount(UserTeamPicker, {
    props: { modelValue: [], ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('UserTeamPicker single mode (W2-2)', () => {
  beforeEach(() => {
    listUsers.mockReset();
    searchUsers.mockReset();
    listTeams.mockReset();
    listUsers.mockResolvedValue({ data: [], total: 0 });
    searchUsers.mockResolvedValue({ data: [], total: 0 });
    listTeams.mockResolvedValue({ data: [], total: 0 });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a single Select seeded with the candidate refs', async () => {
    const wrapper = await mountPicker({ single: true, candidates: [alice] });
    const select = wrapper.findComponent(Select);
    expect(select.props('mode')).toBeUndefined();
    expect(select.props('value')).toBeUndefined();
    expect(select.props('options')).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: 'user:alice', label: 'Alice' })]),
    );
  });

  it('emits exactly one ref when a candidate is picked in single mode', async () => {
    const wrapper = await mountPicker({ single: true, candidates: [alice], testId: 'picker' });
    const selector = wrapper.find('[data-testid="picker"] .ant-select-selector');
    selector.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    selector.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const option = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find((el) =>
      el.textContent?.includes('Alice'),
    );
    expect(option).toBeDefined();
    option!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    option!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toEqual([[[alice]]]);
    expect(wrapper.findComponent(Select).props('value')).toBe('user:alice');
  });

  it('keeps multiple mode and the array value by default', async () => {
    const wrapper = await mountPicker({ candidates: [alice] });
    const select = wrapper.findComponent(Select);
    expect(select.props('mode')).toBe('multiple');
    expect(select.props('value')).toEqual([]);
  });

  it('re-syncs the selection when the parent clears the value', async () => {
    const wrapper = await mountPicker({ single: true, candidates: [alice], modelValue: [alice] });
    expect(wrapper.findComponent(Select).props('value')).toBe('user:alice');
    await wrapper.setProps({ modelValue: [] });
    await flushPromises();
    expect(wrapper.findComponent(Select).props('value')).toBeUndefined();
  });
});
