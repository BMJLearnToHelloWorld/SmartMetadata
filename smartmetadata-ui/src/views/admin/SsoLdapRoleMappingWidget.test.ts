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
import SsoLdapRoleMappingWidget from './SsoLdapRoleMappingWidget.vue';

vi.mock('@/api/ssoRoles', () => ({
  searchSsoRoles: vi.fn(),
}));

const mockedSearch = vi.mocked(searchSsoRoles);
const FIELD_ID =
  'root/authenticationConfiguration/ldapConfiguration/roleMapping';

function mountWidget(props: Record<string, unknown> = {}) {
  return mount(SsoLdapRoleMappingWidget, {
    props: { fieldId: FIELD_ID, ...props },
    global: { plugins: [createTestI18n('en-US')] },
  });
}

// Real keystroke simulation: VTU `setValue` double-fires through antd
// Input, while one native `input` event emits exactly once.
async function typeInto(
  input: { element: Element; trigger: (e: string) => Promise<unknown> },
  text: string,
): Promise<void> {
  (input.element as HTMLInputElement).value = text;
  await input.trigger('input');
}

beforeEach(() => {
  vi.useFakeTimers();
  mockedSearch.mockReset();
  mockedSearch.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SsoLdapRoleMappingWidget', () => {
  it('parses the initial value once with stable mapping ids', async () => {
    const wrapper = mountWidget({
      modelValue: JSON.stringify({
        'cn=admins,dc=example,dc=com': ['admin'],
        'cn=users,dc=example,dc=com': ['viewer'],
      }),
    });
    await vi.runAllTimersAsync();
    expect(wrapper.findAll('[data-testid^="mapping-card-"]').length).toBe(2);
    expect(
      wrapper.find('[data-testid="mapping-card-mapping-1"]').exists(),
    ).toBe(true);
    expect(
      wrapper.find('[data-testid="mapping-card-mapping-2"]').exists(),
    ).toBe(true);
    expect(wrapper.find('.sso-mapping-header').exists()).toBe(true);

    await wrapper.setProps({
      modelValue: JSON.stringify({ 'cn=other,dc=example,dc=com': [] }),
    });
    expect(wrapper.findAll('[data-testid^="mapping-card-"]').length).toBe(2);
  });

  it('renders empty for invalid JSON and shows only the Add button', async () => {
    const wrapper = mountWidget({ modelValue: '{not json' });
    await vi.runAllTimersAsync();
    expect(wrapper.findAll('[data-testid^="mapping-card-"]').length).toBe(0);
    expect(wrapper.find('[data-testid="add-mapping-btn"]').exists()).toBe(
      true,
    );
  });

  it('adds a row without emitting and serializes on group input', async () => {
    const wrapper = mountWidget();
    await vi.runAllTimersAsync();
    await wrapper.find('[data-testid="add-mapping-btn"]').trigger('click');
    expect(wrapper.emitted('change')).toBeUndefined();
    const card = wrapper.find('[data-testid^="mapping-card-new-"]');
    expect(card.exists()).toBe(true);
    const input = card.find('input');
    await typeInto(input, 'cn=admins,dc=example,dc=com');
    expect(wrapper.emitted('change')).toEqual([
      [JSON.stringify({ 'cn=admins,dc=example,dc=com': [] })],
    ]);
  });

  it('withholds onChange while duplicate groups exist and recovers', async () => {
    const wrapper = mountWidget({
      modelValue: JSON.stringify({ 'CN=Admins': ['admin'] }),
    });
    await vi.runAllTimersAsync();
    await wrapper.find('[data-testid="add-mapping-btn"]').trigger('click');
    const cards = wrapper.findAll('[data-testid^="mapping-card-"]');
    await typeInto(cards[1].find('input'), '  cn=admins ');
    expect(wrapper.emitted('change')).toBeUndefined();
    expect(wrapper.find('[data-testid="ldap-group-error-mapping-1"]').text()).toBe(
      'This LDAP group DN is already mapped. Each LDAP group can only be mapped once.',
    );
    expect(wrapper.findAll('[data-testid^="ldap-group-error-"]').length).toBe(
      2,
    );

    await typeInto(cards[1].find('input'), 'cn=users');
    expect(wrapper.emitted('change')).toEqual([
      [
        JSON.stringify({
          'CN=Admins': ['admin'],
          'cn=users': [],
        }),
      ],
    ]);
    expect(wrapper.findAll('[data-testid^="ldap-group-error-"]').length).toBe(
      0,
    );
  });

  it('serializes a whitespace-only group', async () => {
    const wrapper = mountWidget();
    await vi.runAllTimersAsync();
    await wrapper.find('[data-testid="add-mapping-btn"]').trigger('click');
    await typeInto(wrapper.find('[data-testid^="mapping-card-"]').find('input'), '   ');
    expect(wrapper.emitted('change')).toEqual([
      [JSON.stringify({ '   ': [] })],
    ]);
  });

  it('removes a row and emits the remaining mappings', async () => {
    const wrapper = mountWidget({
      modelValue: JSON.stringify({ a: ['admin'], b: [] }),
    });
    await vi.runAllTimersAsync();
    await wrapper
      .find('[data-testid="remove-mapping-btn-mapping-1"]')
      .trigger('click');
    expect(wrapper.emitted('change')).toEqual([
      [JSON.stringify({ b: [] })],
    ]);
  });

  it('emits role changes as JSON', async () => {
    const wrapper = mountWidget({
      modelValue: JSON.stringify({ a: [] }),
    });
    await vi.runAllTimersAsync();
    const select = wrapper.findComponent(Select);
    await select.vm.$emit('change', ['admin', 'viewer']);
    expect(wrapper.emitted('change')).toEqual([
      [JSON.stringify({ a: ['admin', 'viewer'] })],
    ]);
  });

  it('debounces role search and keeps selected roles first', async () => {
    mockedSearch.mockResolvedValueOnce([
      { name: 'admin', displayName: 'Administrator' },
    ]);
    const wrapper = mountWidget({
      modelValue: JSON.stringify({ a: ['admin'] }),
    });
    await vi.runAllTimersAsync();
    mockedSearch.mockResolvedValueOnce([{ name: 'auditor' }]);
    const select = wrapper.findComponent(Select);
    await select.vm.$emit('search', 'aud');
    expect(mockedSearch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(300);
    expect(mockedSearch).toHaveBeenCalledTimes(2);
    expect(select.props('options')).toEqual([
      { label: 'Administrator', value: 'admin' },
      { label: 'auditor', value: 'auditor' },
    ]);
  });

  it('hides Add and shows the empty message when readonly', async () => {
    const wrapper = mountWidget({ readonly: true });
    await vi.runAllTimersAsync();
    expect(wrapper.find('[data-testid="add-mapping-btn"]').exists()).toBe(
      false,
    );
    expect(wrapper.text()).toContain('No LDAP role mappings configured.');
  });

  it('disables inputs when readonly with mappings', async () => {
    const wrapper = mountWidget({
      readonly: true,
      modelValue: JSON.stringify({ a: [] }),
    });
    await vi.runAllTimersAsync();
    const input = wrapper.find('[data-testid="ldap-group-input-mapping-1"]');
    expect(input.attributes('disabled')).toBeDefined();
    expect(
      wrapper
        .find('[data-testid="remove-mapping-btn-mapping-1"]')
        .attributes('disabled'),
    ).toBeDefined();
  });
});
