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
import Antd, { Alert, Select, Switch } from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { AlertSelectionState } from '@/composables/useAlertSelection';
import DestinationConfigField from './DestinationConfigField.vue';
import DestinationSelectItem from './DestinationSelectItem.vue';

const configFieldStub = {
  props: ['config', 'destinationType', 'isViewMode'],
  emits: ['update:config', 'config-expanded-change'],
  template: '<div data-testid="config-field-stub" />',
};

const hooks = {
  t: ((key: string) => key) as never,
  notifyError: () => {},
  notifyWarning: () => {},
};

function selection(recipientCategories?: string[]): AlertSelectionState {
  return {
    sources: ['table'],
    support: { recipientCategories: recipientCategories as never },
    capabilities: {
      knownSources: [],
      loading: false,
      settled: true,
      retry: () => {},
    },
    loading: false,
    ready: true,
    search: {} as never,
  } as unknown as AlertSelectionState;
}

function mountRow(props: Record<string, unknown>): VueWrapper {
  return mount(DestinationSelectItem, {
    props: {
      id: 0,
      destination: {},
      selection: selection(['Teams', 'Users']),
      validationErrors: {},
      hooks,
      ...props,
    },
    global: {
      plugins: [Antd, createTestI18n()],
      stubs: { DestinationConfigField: configFieldStub },
    },
  });
}

describe('DestinationSelectItem', () => {
  it('filters the internal options by the capabilities recipient categories', () => {
    const wrapper = mountRow({});
    const select = wrapper.findComponent(Select);
    const options = select.props('options') as Array<{ value: string; disabled: boolean }>;
    const values = options.map((option) => option.value);
    expect(values).toContain('Teams');
    expect(values).toContain('Users');
    expect(values).not.toContain('Admins');
    expect(values).toContain('Email');
    expect(values).toContain('Webhook');
  });

  it('keeps the current category offered before the capabilities answer lands', () => {
    const wrapper = mountRow({
      destination: { destinationType: 'Admins', category: 'Admins' },
      selection: selection(undefined),
    });
    const select = wrapper.findComponent(Select);
    const options = select.props('options') as Array<{ value: string }>;
    expect(options.map((option) => option.value)).toContain('Admins');
  });

  it('resets the row on a destination-type switch', async () => {
    const wrapper = mountRow({
      destination: {
        id: 'd1',
        destinationType: 'Email',
        type: 'Email',
        category: 'External',
        config: { receivers: ['a@example.com'] },
        notifyDownstream: true,
        downstreamDepth: 3,
      },
    });
    await wrapper.findComponent(Select).vm.$emit('change', 'Webhook');
    expect(wrapper.emitted('update:destination')).toEqual([
      [
        {
          category: 'External',
          destinationType: 'Webhook',
          config: undefined,
          downstreamDepth: undefined,
          notifyDownstream: undefined,
          type: 'Webhook',
        },
      ],
    ]);
  });

  it('ignores header picks in the category select', async () => {
    const wrapper = mountRow({});
    await wrapper.findComponent(Select).vm.$emit('change', 'header-internal');
    expect(wrapper.emitted('update:destination')).toBeUndefined();
  });

  it('sets the subscription type for internal destinations', async () => {
    const wrapper = mountRow({
      destination: { destinationType: 'Teams', category: 'Teams' },
    });
    const selects = wrapper.findAllComponents(Select);
    expect(selects).toHaveLength(2);
    await selects[1]?.vm.$emit('change', 'Email');
    expect(wrapper.emitted('update:destination')).toEqual([
      [[{ destinationType: 'Teams', category: 'Teams', type: 'Email' }][0]],
    ]);
  });

  it('toggles notifyDownstream with the depth default, and edits the depth', async () => {
    const wrapper = mountRow({
      destination: { destinationType: 'Email', type: 'Email', category: 'External' },
    });
    const toggle = wrapper.findComponent(Switch);
    await toggle.vm.$emit('change', true);
    expect(wrapper.emitted('update:destination')).toEqual([
      [
        {
          destinationType: 'Email',
          type: 'Email',
          category: 'External',
          downstreamDepth: 1,
          notifyDownstream: true,
        },
      ],
    ]);

    const withToggle = mountRow({
      destination: {
        destinationType: 'Email',
        type: 'Email',
        category: 'External',
        notifyDownstream: true,
        downstreamDepth: 2,
      },
    });
    const depth = withToggle.find('[data-testid="destination-downstream-depth-input-0"]');
    await depth.setValue('4');
    await depth.trigger('change');
    expect(withToggle.emitted('update:destination')).toContainEqual([
      expect.objectContaining({ downstreamDepth: 4 }),
    ]);
  });

  it('warns on Owners with a non-Email type, and the warning dismisses', async () => {
    const wrapper = mountRow({
      destination: { destinationType: 'Owners', category: 'Owners', type: 'Slack' },
    });
    const alert = wrapper.findComponent(Alert);
    expect(alert.exists()).toBe(true);
    // The warning renders through the Alert #message slot with the Trans
    // <0> element split into <strong>; the markers must never leak.
    expect(alert.text()).toContain(
      'Please make sure the "Owner" is a Team with "Slack" configured to receive alerts.',
    );
    expect(alert.text()).not.toContain('<0>');
    await alert.vm.$emit('close');
    expect(wrapper.findComponent(Alert).exists()).toBe(false);
  });

  it('shows the test status for its own row index, only when the row still matches', () => {
    const destination = {
      destinationType: 'Slack',
      type: 'Slack',
      category: 'External',
      config: { endpoint: 'https://hook.example' },
    };
    const wrapper = mountRow({
      id: 1,
      destination,
      destinationsWithStatus: [
        undefined,
        {
          type: 'Slack',
          category: 'External',
          config: { endpoint: 'https://hook.example' },
          statusDetails: { status: 'Success', statusCode: 200, reason: 'delivered' },
        },
      ],
    });
    expect(wrapper.text()).toContain('delivered');

    const stale = mountRow({
      id: 1,
      destination: { ...destination, config: { endpoint: 'https://other.example' } },
      destinationsWithStatus: [
        undefined,
        {
          type: 'Slack',
          category: 'External',
          config: { endpoint: 'https://hook.example' },
          statusDetails: { status: 'Success', statusCode: 200, reason: 'delivered' },
        },
      ],
    });
    expect(stale.text()).not.toContain('delivered');
  });

  it('emits remove, and locks the controls in view mode', async () => {
    const wrapper = mountRow({
      destination: { destinationType: 'Email', type: 'Email', category: 'External' },
    });
    await wrapper.find('[data-testid="remove-destination-0"]').trigger('click');
    expect(wrapper.emitted('remove')).toHaveLength(1);

    const viewMode = mountRow({
      isViewMode: true,
      destination: { destinationType: 'Email', type: 'Email', category: 'External' },
    });
    expect(viewMode.find('[data-testid="remove-destination-0"]').exists()).toBe(false);
    expect(viewMode.findComponent(Select).props('disabled')).toBe(true);
    expect(viewMode.findComponent(DestinationConfigField).props('isViewMode')).toBe(true);
  });

  it('forwards config edits to the row', async () => {
    const wrapper = mountRow({
      destination: { destinationType: 'Webhook', type: 'Webhook', category: 'External', config: {} },
    });
    await wrapper
      .findComponent(DestinationConfigField)
      .vm.$emit('update:config', { endpoint: 'https://hook.example' });
    expect(wrapper.emitted('update:destination')).toEqual([
      [
        {
          destinationType: 'Webhook',
          type: 'Webhook',
          category: 'External',
          config: { endpoint: 'https://hook.example' },
        },
      ],
    ]);
  });
});
