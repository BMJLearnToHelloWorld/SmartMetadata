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
import { Select, Switch, TreeSelect, message } from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { PROFILER_METRICS } from '@/quality/profilerConfig';
import ProfilerConfigurationView from './ProfilerConfigurationView.vue';

vi.mock('@/api/system', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/system')>();
  return { ...actual, getSetting: vi.fn(), updateSetting: vi.fn() };
});

import { getSetting, updateSetting } from '@/api/system';

const getMock = getSetting as unknown as ReturnType<typeof vi.fn>;
const updateMock = updateSetting as unknown as ReturnType<typeof vi.fn>;

async function mountView(): Promise<{ wrapper: ReturnType<typeof mount>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings/profiler', name: 'settings-profiler', component: ProfilerConfigurationView },
      { path: '/settings', name: 'admin-settings', component: { template: '<div />' } },
    ],
  });
  await router.push({ name: 'settings-profiler' });
  await router.isReady();
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        settings: {
          profiler: {
            title: 'Profiler configuration',
            lead: 'Lead',
            saved: 'Saved',
            saveFailed: 'Save failed',
            dataType: 'Data type',
            metricType: 'Metric type',
            disable: 'Disable',
            metricConfig: 'Metric Configuration',
            metricConfigDesc: 'Metric description',
            sampleDataConfig: 'Sample Data Ingestion Configuration',
            sampleDataConfigDesc: 'Sample description',
            all: 'All',
            addNewField: 'Add New Field',
            selectDataType: 'Select data type',
            selectMetricType: 'Select metric type',
            fieldRequired: 'Field {field} is required',
            storeSampleData: 'Enable storing of sample data',
            storeSampleDataDesc: 'Store description',
            readSampleData: 'Enable reading of sample data',
            readSampleDataDesc: 'Read description',
            cancel: 'Cancel',
            save: 'Save',
            removeField: 'Remove field',
          },
        },
      },
    },
  });
  const wrapper = mount(ProfilerConfigurationView, {
    global: {
      plugins: [router, i18n],
      stubs: {
        PreferencePageShell: {
          template: '<div data-testid="profiler-configuration"><slot /></div>',
          props: ['title', 'lead', 'testId', 'errorMessage', 'loading'],
        },
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockResolvedValue({
    configType: 'profilerConfiguration',
    configValue: {
      metricConfiguration: [],
      sampleDataConfig: { storeSampleData: false, readSampleData: false },
    },
  });
  updateMock.mockResolvedValue(undefined);
});

describe('ProfilerConfigurationView sample data config', () => {
  it('preserves server sampleDataConfig on save instead of dropping it', async () => {
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="profiler-config-form"]').trigger('submit');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledWith(
      'profilerConfiguration',
      expect.objectContaining({
        sampleDataConfig: { storeSampleData: false, readSampleData: false },
      }),
    );
  });

  it('turning on store also turns on read, and save carries both', async () => {
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="store-sample-data-switch"]').trigger('click');
    await flushPromises();
    const readSwitch = wrapper.get('[data-testid="read-sample-data-switch"]');
    expect(readSwitch.attributes('aria-checked')).toBe('true');
    await wrapper.get('[data-testid="profiler-config-form"]').trigger('submit');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledWith(
      'profilerConfiguration',
      expect.objectContaining({
        sampleDataConfig: { storeSampleData: true, readSampleData: true },
      }),
    );
  });

  it('defaults both switches on when sampleDataConfig is absent', async () => {
    getMock.mockResolvedValue({
      configType: 'profilerConfiguration',
      configValue: { metricConfiguration: [] },
    });
    const { wrapper } = await mountView();
    expect(
      wrapper.get('[data-testid="store-sample-data-switch"]').attributes('aria-checked'),
    ).toBe('true');
    expect(
      wrapper.get('[data-testid="read-sample-data-switch"]').attributes('aria-checked'),
    ).toBe('true');
  });

  it('keeps an explicit false and renders a missing field off', async () => {
    getMock.mockResolvedValue({
      configType: 'profilerConfiguration',
      configValue: {
        metricConfiguration: [],
        sampleDataConfig: { storeSampleData: false },
      },
    });
    const { wrapper } = await mountView();
    expect(
      wrapper.get('[data-testid="store-sample-data-switch"]').attributes('aria-checked'),
    ).toBe('false');
    expect(
      wrapper.get('[data-testid="read-sample-data-switch"]').attributes('aria-checked'),
    ).toBe('false');
  });

  it('stays silent and keeps defaults when the load fails', async () => {
    getMock.mockRejectedValue(new Error('down'));
    const errorSpy = vi.spyOn(message, 'error');
    const { wrapper } = await mountView();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="profiler-data-type-0"]').exists()).toBe(false);
    expect(
      wrapper.get('[data-testid="store-sample-data-switch"]').attributes('aria-checked'),
    ).toBe('true');
    errorSpy.mockRestore();
  });
});

describe('ProfilerConfigurationView metric rows', () => {
  it('requires a data type on every row before saving', async () => {
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="add-fields"]').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-testid="profiler-config-form"]').trigger('submit');
    await flushPromises();
    expect(updateMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Field Data type is required');
  });

  it('disables data types chosen by other rows', async () => {
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="add-fields"]').trigger('click');
    await wrapper.get('[data-testid="add-fields"]').trigger('click');
    await wrapper.vm.$nextTick();
    const selects = wrapper.findAllComponents(Select);
    await selects[0].vm.$emit('update:value', 'INT');
    await wrapper.vm.$nextTick();
    const options = wrapper.findAllComponents(Select)[1].props('options') as {
      value: string;
      disabled: boolean;
    }[];
    expect(options.find((option) => option.value === 'INT')?.disabled).toBe(true);
    expect(options.find((option) => option.value === 'STRING')?.disabled).toBe(false);
  });

  it('expands a stored all selection to the full 36-metric enum on save', async () => {
    getMock.mockResolvedValue({
      configType: 'profilerConfiguration',
      configValue: {
        metricConfiguration: [{ dataType: 'INT', metrics: ['all'] }],
        sampleDataConfig: { storeSampleData: true, readSampleData: true },
      },
    });
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="profiler-config-form"]').trigger('submit');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledWith(
      'profilerConfiguration',
      expect.objectContaining({
        metricConfiguration: [{ dataType: 'INT', metrics: [...PROFILER_METRICS], disabled: undefined }],
      }),
    );
  });

  it('collapses a full child selection to all', async () => {
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="add-fields"]').trigger('click');
    await wrapper.vm.$nextTick();
    const selects = wrapper.findAllComponents(Select);
    await selects[0].vm.$emit('update:value', 'INT');
    const tree = wrapper.findComponent(TreeSelect);
    await tree.vm.$emit('update:value', [...PROFILER_METRICS]);
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(TreeSelect).props('value')).toEqual(['all']);
  });

  it('passes unknown metrics through verbatim and renders them as leaves', async () => {
    getMock.mockResolvedValue({
      configType: 'profilerConfiguration',
      configValue: {
        metricConfiguration: [{ dataType: 'INT', metrics: ['variance', 'mean'] }],
        sampleDataConfig: { storeSampleData: true, readSampleData: true },
      },
    });
    const { wrapper } = await mountView();
    const treeData = wrapper.findComponent(TreeSelect).props('treeData') as {
      children: { value: string; title: string }[];
    }[];
    expect(treeData[0].children.map((child) => child.value)).toContain('variance');
    expect(
      treeData[0].children.find((child) => child.value === 'variance')?.title,
    ).toBe('Variance');
    await wrapper.get('[data-testid="profiler-config-form"]').trigger('submit');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledWith(
      'profilerConfiguration',
      expect.objectContaining({
        metricConfiguration: [
          { dataType: 'INT', metrics: ['variance', 'mean'], disabled: undefined },
        ],
      }),
    );
  });

  it('disables the metric selector when the row is disabled', async () => {
    getMock.mockResolvedValue({
      configType: 'profilerConfiguration',
      configValue: {
        metricConfiguration: [{ dataType: 'INT', metrics: ['mean'], disabled: true }],
        sampleDataConfig: { storeSampleData: true, readSampleData: true },
      },
    });
    const { wrapper } = await mountView();
    expect(wrapper.findComponent(TreeSelect).props('disabled')).toBe(true);
    const switches = wrapper.findAllComponents(Switch);
    expect(switches[0].props('checked')).toBe(true);
  });

  it('adds an empty row and removes it again', async () => {
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="add-fields"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="profiler-data-type-0"]').exists()).toBe(true);
    await wrapper.get('[data-testid="remove-filter-0"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="profiler-data-type-0"]').exists()).toBe(false);
  });

  it('navigates back on cancel without saving', async () => {
    const { wrapper, router } = await mountView();
    const backSpy = vi.spyOn(router, 'back');
    await wrapper.get('[data-testid="cancel-button"]').trigger('click');
    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(updateMock).not.toHaveBeenCalled();
    backSpy.mockRestore();
  });
});
