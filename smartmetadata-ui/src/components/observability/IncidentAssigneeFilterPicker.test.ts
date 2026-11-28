/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import IncidentAssigneeFilterPicker from './IncidentAssigneeFilterPicker.vue';

const listUsers = vi.fn();
const listTeams = vi.fn();
const searchUsers = vi.fn();

vi.mock('@/api/users', () => ({
  listUsers: (...args: unknown[]) => listUsers(...args),
  searchUsers: (...args: unknown[]) => searchUsers(...args),
}));
vi.mock('@/api/teams', () => ({
  listTeams: (...args: unknown[]) => listTeams(...args),
}));

const alice = { id: 'alice', name: 'alice', type: 'user' as const, displayName: 'Alice' };
const bob = { id: 'bob', name: 'bob', type: 'user' as const, displayName: 'Bob' };

describe('IncidentAssigneeFilterPicker', () => {
  it('lists only aggregate options with client search (no global user API)', async () => {
    const wrapper = mount(IncidentAssigneeFilterPicker, {
      props: { modelValue: [], options: [alice, bob] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(listUsers).not.toHaveBeenCalled();
    expect(listTeams).not.toHaveBeenCalled();
    const select = wrapper.findComponent({ name: 'ASelect' });
    expect(select.props('options')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Alice', value: 'user:alice' }),
        expect.objectContaining({ label: 'Bob', value: 'user:bob' }),
      ]),
    );
    await select.vm.$emit('search', 'ali');
    expect(searchUsers).not.toHaveBeenCalled();
  });
});