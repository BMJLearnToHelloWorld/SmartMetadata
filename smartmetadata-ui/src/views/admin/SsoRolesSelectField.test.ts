/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { Select } from 'ant-design-vue';
import { mount } from '@vue/test-utils';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { searchSsoRoles } from '@/api/ssoRoles';
import { createTestI18n } from '@/test/i18n';
import SsoRolesSelectField from './SsoRolesSelectField.vue';

vi.mock('@/api/ssoRoles', () => ({
  searchSsoRoles: vi.fn(),
}));

const mockedSearch = vi.mocked(searchSsoRoles);

function mountField(props: Record<string, unknown> = {}) {
  return mount(SsoRolesSelectField, {
    props: {
      fieldId: 'root/authenticationConfiguration/ldapConfiguration/authReassignRoles',
      name: 'authReassignRoles',
      label: 'Auth Reassign Roles',
      modelValue: [],
      placeholder: 'Select roles to reassign to users on every login',
      ...props,
    },
    global: { plugins: [createTestI18n('en-US')] },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockedSearch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SsoRolesSelectField', () => {
  it('loads roles on mount and maps displayName-or-name labels', async () => {
    mockedSearch.mockResolvedValue([
      { name: 'admin', displayName: 'Administrator' },
      { name: 'viewer' },
    ]);
    const wrapper = mountField();
    await vi.runAllTimersAsync();
    const select = wrapper.findComponent(Select);
    expect(mockedSearch).toHaveBeenCalledWith('');
    expect(select.props('options')).toEqual([
      { label: 'Administrator', value: 'admin' },
      { label: 'viewer', value: 'viewer' },
    ]);
    expect(wrapper.find('.sso-array-field-label').text()).toBe(
      'Auth Reassign Roles',
    );
  });

  it('emits change plus clear-error on selection change', async () => {
    mockedSearch.mockResolvedValue([]);
    const wrapper = mountField();
    await vi.runAllTimersAsync();
    await wrapper.findComponent(Select).vm.$emit('change', ['admin']);
    expect(wrapper.emitted('change')).toEqual([[['admin']]]);
    expect(wrapper.emitted('clear-error')).toEqual([
      [
        'root/authenticationConfiguration/ldapConfiguration/authReassignRoles',
      ],
    ]);
  });

  it('debounces search and keeps selected options first', async () => {
    mockedSearch.mockResolvedValueOnce([
      { name: 'admin', displayName: 'Administrator' },
      { name: 'viewer' },
    ]);
    const wrapper = mountField({ modelValue: ['viewer'] });
    await vi.runAllTimersAsync();
    mockedSearch.mockResolvedValueOnce([{ name: 'auditor' }]);

    const select = wrapper.findComponent(Select);
    await select.vm.$emit('search', 'aud');
    await select.vm.$emit('search', 'audi');
    expect(mockedSearch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(300);
    expect(mockedSearch).toHaveBeenCalledTimes(2);
    expect(mockedSearch).toHaveBeenLastCalledWith('audi');
    expect(select.props('options')).toEqual([
      { label: 'viewer', value: 'viewer' },
      { label: 'auditor', value: 'auditor' },
    ]);
  });

  it('keeps the field usable when the initial load fails', async () => {
    mockedSearch.mockRejectedValue(new Error('boom'));
    const wrapper = mountField();
    await vi.runAllTimersAsync();
    expect(wrapper.findComponent(Select).props('options')).toEqual([]);
    expect(wrapper.find('.field-error').exists()).toBe(true);
  });

  it('marks has-error from field errors alone', async () => {
    mockedSearch.mockResolvedValue([]);
    const wrapper = mountField({ hasFieldError: true });
    await vi.runAllTimersAsync();
    expect(wrapper.find('.field-error').classes()).toContain('has-error');
  });
});
