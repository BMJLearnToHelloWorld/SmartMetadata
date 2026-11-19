/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import Antd, { Collapse, RadioGroup, Select, Tag } from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import DestinationConfigField from './DestinationConfigField.vue';
import TeamAndUserSelectItem from './TeamAndUserSelectItem.vue';

const teamUserStub = {
  props: ['entityType', 'destinationNumber', 'destination', 'isViewMode'],
  emits: ['update:destination'],
  template: '<div data-testid="team-user-stub" />',
};

const hooks = {
  t: ((key: string) => key) as never,
  notifyError: () => {},
  notifyWarning: () => {},
};

function mountField(props: Record<string, unknown>): VueWrapper {
  return mount(DestinationConfigField, {
    props: {
      type: 'Webhook',
      fieldName: 0,
      validationErrors: {},
      hooks,
      ...props,
    },
    global: {
      plugins: [Antd, createTestI18n()],
      stubs: { TeamAndUserSelectItem: teamUserStub },
    },
  });
}

describe('DestinationConfigField', () => {
  it('emits the endpoint edit', async () => {
    const wrapper = mountField({ config: {} });
    const endpoint = wrapper.find('[data-testid="endpoint-input-field-0"]');
    await endpoint.setValue('https://hook.example');
    await endpoint.trigger('change');
    expect(wrapper.emitted('update:config')).toContainEqual([
      { endpoint: 'https://hook.example' },
    ]);
  });

  it('shows the bearer secret key field, and emits its edits', async () => {
    const wrapper = mountField({
      config: { authType: { type: 'bearer' } },
      isConfigExpanded: true,
    });
    expect(wrapper.find('[data-testid="secret-key"]').exists()).toBe(true);
    const secret = wrapper.find('[data-testid="secret-key-input-0"]');
    await secret.setValue('hmac-secret');
    await secret.trigger('change');
    expect(wrapper.emitted('update:config')).toContainEqual([
      { authType: { type: 'bearer', secretKey: 'hmac-secret' } },
    ]);
  });

  it('switches the auth type, and shows the oauth2 fields', async () => {
    const wrapper = mountField({ config: {}, isConfigExpanded: true });
    const select = wrapper.findComponent(Select);
    await select.vm.$emit('change', 'oauth2');
    expect(wrapper.emitted('update:config')).toContainEqual([
      { authType: { type: 'oauth2' } },
    ]);

    const oauth = mountField({
      config: { authType: { type: 'oauth2' } },
      isConfigExpanded: true,
    });
    const tokenUrl = oauth.find('[data-testid="token-url-input-field-0"]');
    await tokenUrl.setValue('https://auth.example/token');
    await tokenUrl.trigger('change');
    expect(oauth.emitted('update:config')).toContainEqual([
      { authType: { type: 'oauth2', tokenUrl: 'https://auth.example/token' } },
    ]);
    expect(oauth.find('[data-testid="client-id-input-0"]').exists()).toBe(true);
    expect(oauth.find('[data-testid="client-secret-input-0"]').exists()).toBe(true);
    expect(oauth.find('[data-testid="scope-input-field-0"]').exists()).toBe(true);
  });

  it('adds, edits, and removes header entries', async () => {
    const wrapper = mountField({ config: {}, isConfigExpanded: true });
    await wrapper.find('[data-testid="add-header-button-0"]').trigger('click');
    expect(wrapper.emitted('update:config')).toContainEqual([
      { headers: [{ key: '', value: '' }] },
    ]);

    const withHeader = mountField({
      config: { headers: [{ key: 'X-A', value: '1' }] },
      isConfigExpanded: true,
    });
    const keyInput = withHeader.find('[data-testid="header-key-input-field-0-0"]');
    await keyInput.setValue('X-B');
    await keyInput.trigger('change');
    expect(withHeader.emitted('update:config')).toContainEqual([
      { headers: [{ key: 'X-B', value: '1' }] },
    ]);
    await withHeader.find('[data-testid="remove-header-button-0-0"]').trigger('click');
    expect(withHeader.emitted('update:config')).toContainEqual([{ headers: [] }]);
  });

  it('emits the http method, defaulting to POST', async () => {
    const wrapper = mountField({ config: {}, isConfigExpanded: true });
    const radios = wrapper.findComponent(RadioGroup);
    expect(radios.props('value')).toBe('POST');
    await radios.vm.$emit('change', { target: { value: 'PUT' } });
    expect(wrapper.emitted('update:config')).toContainEqual([{ httpMethod: 'PUT' }]);
  });

  it('reports the advanced section expansion', async () => {
    const wrapper = mountField({ config: {} });
    await wrapper.findComponent(Collapse).vm.$emit('change', ['advanced-config-0']);
    expect(wrapper.emitted('config-expanded-change')).toEqual([[true]]);
    await wrapper.findComponent(Collapse).vm.$emit('change', []);
    expect(wrapper.emitted('config-expanded-change')).toEqual([[true], [false]]);
  });

  it('adds valid emails on Enter, rejects invalid ones, and ignores duplicates', async () => {
    const wrapper = mountField({ type: 'Email', config: { receivers: [] } });
    const input = wrapper.find('[data-testid="email-input-field-0"]');
    await input.setValue('a@example.com');
    await input.trigger('keydown.enter');
    expect(wrapper.emitted('update:config')).toContainEqual([
      { receivers: ['a@example.com'] },
    ]);

    await input.setValue('not-an-email');
    await input.trigger('keydown.enter');
    expect(wrapper.text()).toContain('Invalid Email.');
    expect(wrapper.emitted('update:config')).toHaveLength(1);

    const withReceiver = mountField({
      type: 'Email',
      config: { receivers: ['a@example.com'] },
    });
    const duplicate = withReceiver.find('[data-testid="email-input-field-0"]');
    await duplicate.setValue('a@example.com');
    await duplicate.trigger('keydown.enter');
    expect(withReceiver.emitted('update:config')).toBeUndefined();
  });

  it('removes an email tag on close', async () => {
    const wrapper = mountField({
      type: 'Email',
      config: { receivers: ['a@example.com', 'b@example.com'] },
    });
    const tags = wrapper.findAllComponents(Tag);
    expect(tags).toHaveLength(2);
    await tags[0]?.vm.$emit('close');
    expect(wrapper.emitted('update:config')).toContainEqual([
      { receivers: ['b@example.com'] },
    ]);
  });

  it('renders the team/user selector for Teams and Users', () => {
    const teams = mountField({ type: 'Teams', config: {} });
    expect(teams.findComponent(TeamAndUserSelectItem).exists()).toBe(true);
    expect(teams.findComponent(TeamAndUserSelectItem).props('entityType')).toBe('team');
    const users = mountField({ type: 'Users', config: {} });
    expect(users.findComponent(TeamAndUserSelectItem).props('entityType')).toBe('user');
  });

  it('shows config validation errors at their paths', () => {
    const wrapper = mountField({
      config: {},
      isConfigExpanded: true,
      validationErrors: {
        'destinations.0.config.endpoint': 'Endpoint is required',
        'destinations.0.config.headers.0.key': 'Header key is required',
      },
    });
    expect(wrapper.text()).toContain('Endpoint is required');
  });
});
