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
import Antd from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { AlertSelectionState } from '@/composables/useAlertSelection';
import DestinationFormItem from './DestinationFormItem.vue';
import DestinationSelectItem from './DestinationSelectItem.vue';

const testAlertDestination = vi.fn();
const reportErrorToast = vi.fn();

vi.mock('@/api/eventSubscriptions', () => ({
  testAlertDestination: (...args: unknown[]) => testAlertDestination(...args),
}));
vi.mock('@/utils/notifications/alertSourceSearch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/notifications/alertSourceSearch')>();
  return { ...actual, reportErrorToast: (...args: unknown[]) => reportErrorToast(...args) };
});

const selectItemStub = {
  props: ['id', 'destination', 'destinationsWithStatus', 'isViewMode', 'isDestinationStatusLoading'],
  emits: ['update:destination', 'remove', 'config-expanded-change'],
  template: '<div data-testid="destination-row-stub" />',
};

const hooks = {
  t: ((key: string) => key) as never,
  notifyError: vi.fn(),
  notifyWarning: vi.fn(),
};

function selection(): AlertSelectionState {
  return {
    sources: ['table'],
    support: { recipientCategories: ['Email'] },
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

function mountItem(props: Record<string, unknown>): VueWrapper {
  return mount(DestinationFormItem, {
    props: {
      destinations: [],
      sources: ['table'],
      selection: selection(),
      validationErrors: {},
      hooks,
      timeout: 10,
      readTimeout: 12,
      ...props,
    },
    global: {
      plugins: [Antd, createTestI18n()],
      stubs: { DestinationSelectItem: selectItemStub },
    },
  });
}

describe('DestinationFormItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testAlertDestination.mockResolvedValue([{ status: 'success' }]);
  });

  it('appends an empty destination row, disabled with no sources', async () => {
    const wrapper = mountItem({});
    await wrapper.find('[data-testid="add-destination-button"]').trigger('click');
    expect(wrapper.emitted('update:destinations')).toEqual([[[{}]]]);

    const noSources = mountItem({ sources: [] });
    expect(
      (noSources.find('[data-testid="add-destination-button"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('replaces a row through the child update, and removes one through the child remove', async () => {
    const destinations = [
      { destinationType: 'Email', type: 'Email', category: 'External', config: {} },
      { destinationType: 'Slack', type: 'Slack', category: 'External', config: {} },
    ];
    const wrapper = mountItem({ destinations });
    const rows = wrapper.findAllComponents(DestinationSelectItem);
    expect(rows).toHaveLength(2);
    const next = { ...destinations[0], config: { receivers: ['a@example.com'] } };
    await rows[0]?.vm.$emit('update:destination', next);
    expect(wrapper.emitted('update:destinations')).toEqual([[[next, destinations[1]]]]);
    await rows[1]?.vm.$emit('remove');
    expect(wrapper.emitted('update:destinations')).toEqual([
      [[next, destinations[1]]],
      [[destinations[0]]],
    ]);
  });

  it('disables Test with no sources or no external destination', () => {
    const noSources = mountItem({
      sources: [],
      destinations: [{ destinationType: 'Email', category: 'External' }],
    });
    expect(
      (noSources.find('[data-testid="test-destination-button"]').element as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    const internalOnly = mountItem({
      destinations: [{ destinationType: 'Email', category: 'Email' }],
    });
    expect(
      (internalOnly.find('[data-testid="test-destination-button"]').element as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('requests validation instead of testing when nothing is testable', async () => {
    const wrapper = mountItem({
      destinations: [
        { destinationType: 'Email', type: 'Email', category: 'External', config: {} },
      ],
    });
    await wrapper.find('[data-testid="test-destination-button"]').trigger('click');
    await flushPromises();
    // An external row with an empty config is not testable, so the
    // form asks for validation instead of calling the test endpoint.
    expect(testAlertDestination).not.toHaveBeenCalled();
    expect(wrapper.emitted('request-validation')).toHaveLength(1);
  });

  it('tests the testable external rows and aligns statuses back onto the rows', async () => {
    testAlertDestination.mockResolvedValue([
      { statusDetails: { status: 'success', message: 'ok' } },
    ]);
    const destinations = [
      {
        destinationType: 'Slack',
        type: 'Slack',
        category: 'External',
        config: { endpoint: 'https://hook.example' },
      },
    ];
    const wrapper = mountItem({ destinations });
    await wrapper.find('[data-testid="test-destination-button"]').trigger('click');
    await flushPromises();
    expect(testAlertDestination).toHaveBeenCalledTimes(1);
    expect(testAlertDestination).toHaveBeenCalledWith(
      expect.objectContaining({ destinations: expect.any(Array) }),
    );
    const row = wrapper.findComponent(DestinationSelectItem);
    const withStatus = row.props('destinationsWithStatus') as Array<
      { statusDetails?: { status?: string } } | undefined
    >;
    expect(withStatus[0]?.statusDetails?.status).toBe('success');
  });

  it('toasts a test failure with the POST method, and clears the loading state', async () => {
    const error = new Error('unreachable');
    testAlertDestination.mockRejectedValue(error);
    const wrapper = mountItem({
      destinations: [
        {
          destinationType: 'Slack',
          type: 'Slack',
          category: 'External',
          config: { endpoint: 'https://hook.example' },
        },
      ],
    });
    await wrapper.find('[data-testid="test-destination-button"]').trigger('click');
    await flushPromises();
    expect(reportErrorToast).toHaveBeenCalledWith(error, hooks, { method: 'POST' });
    expect(
      wrapper.findComponent(DestinationSelectItem).props('isDestinationStatusLoading'),
    ).toBe(false);
  });

  it('emits numeric timeouts, and undefined for a cleared field', async () => {
    const wrapper = mountItem({});
    const timeout = wrapper.find('[data-testid="connection-timeout-input"]');
    await timeout.setValue('30');
    await timeout.trigger('change');
    expect(wrapper.emitted('update:timeout')).toContainEqual([30]);
    await timeout.setValue('');
    await timeout.trigger('change');
    expect(wrapper.emitted('update:timeout')).toContainEqual([undefined]);
    const readTimeout = wrapper.find('[data-testid="read-timeout-input"]');
    await readTimeout.setValue('45');
    await readTimeout.trigger('change');
    expect(wrapper.emitted('update:readTimeout')).toContainEqual([45]);
  });

  it('hides Add and Test in view mode, and disables the timeout inputs', () => {
    const wrapper = mountItem({ isViewMode: true });
    expect(wrapper.find('[data-testid="add-destination-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="test-destination-button"]').exists()).toBe(false);
    expect(
      (wrapper.find('[data-testid="connection-timeout-input"]').element as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });

  it('shows the destinations and timeout errors from validation', () => {
    const wrapper = mountItem({
      validationErrors: {
        destinations: 'At least one destination',
        timeout: 'Timeout required',
        readTimeout: 'Read timeout required',
      },
    });
    expect(wrapper.text()).toContain('At least one destination');
    expect(wrapper.text()).toContain('Timeout required');
    expect(wrapper.text()).toContain('Read timeout required');
  });
});
