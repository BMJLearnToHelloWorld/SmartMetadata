/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd, { InputNumber, Select } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createTestI18n } from '@/test/i18n';
import { PROFILER_SETTINGS_METRICS, type TableProfilerConfig } from '@/quality/profilerSettings';
import ProfilerSettingsModal from './ProfilerSettingsModal.vue';

vi.mock('@/api/profiler', () => ({
  getTableProfilerConfig: vi.fn(),
  putTableProfilerConfig: vi.fn(),
}));

import { getTableProfilerConfig, putTableProfilerConfig } from '@/api/profiler';

const getConfig = vi.mocked(getTableProfilerConfig);
const putConfig = vi.mocked(putTableProfilerConfig);

const columns = [
  { name: 'id', dataType: 'INT' },
  { name: 'name', dataType: 'VARCHAR' },
  { name: 'created_at', dataType: 'TIMESTAMP' },
];

const partitionedConfig: TableProfilerConfig = {
  profileSampleConfig: {
    sampleConfigType: 'STATIC',
    config: { profileSample: 100, profileSampleType: 'PERCENTAGE' },
  },
  sampleDataCount: 50,
  partitioning: {
    enablePartitioning: true,
    partitionColumnName: 'id',
    partitionIntervalType: 'INTEGER-RANGE',
    partitionIntegerRangeStart: 1,
    partitionIntegerRangeEnd: 100,
  },
};

function mountModal() {
  return mount(ProfilerSettingsModal, {
    props: { open: true, tableId: 't1', columns },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

function findSelect(wrapper: VueWrapper, testId: string) {
  const matches = wrapper
    .findAllComponents(Select)
    .filter((select) => select.vm.$attrs['data-testid'] === testId);
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

function findNumber(wrapper: VueWrapper, testId: string) {
  const matches = wrapper
    .findAllComponents(InputNumber)
    .filter((input) => input.vm.$attrs['data-testid'] === testId);
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

function okButton(): HTMLElement | null {
  return document.querySelector('.ant-modal-footer .ant-btn-primary');
}

describe('ProfilerSettingsModal', () => {
  beforeEach(() => {
    // Reset only the API mocks: a blanket reset would also wipe the
    // shared matchMedia mock the test setup installs, which antd's
    // responsive observer needs.
    getConfig.mockReset();
    putConfig.mockReset();
    putConfig.mockResolvedValue(undefined);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('disables save when the config load fails, and retries', async () => {
    getConfig.mockRejectedValueOnce(new Error('catalog down'));
    getConfig.mockResolvedValueOnce(null);
    const wrapper = mountModal();
    await flushPromises();
    expect(document.body.textContent).toContain('Error while fetching table profiler config!');
    expect(document.querySelector('[data-testid="profiler-sample-type"]')).toBeNull();
    expect(okButton()?.hasAttribute('disabled')).toBe(true);
    expect(putConfig).not.toHaveBeenCalled();
    const retry = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Retry',
    );
    expect(retry).toBeDefined();
    retry?.click();
    await flushPromises();
    expect(document.querySelector('[data-testid="profiler-sample-type"]')).not.toBeNull();
    expect(okButton()?.hasAttribute('disabled')).toBe(false);
    wrapper.unmount();
  });

  it('resets partition fields when the interval type changes', async () => {
    getConfig.mockResolvedValue(partitionedConfig);
    const wrapper = mountModal();
    await flushPromises();
    expect(findNumber(wrapper, 'profiler-partition-range-start').props('value')).toBe(1);
    await findSelect(wrapper, 'profiler-interval-type').vm.$emit('change', 'TIME-UNIT');
    await nextTick();
    await findSelect(wrapper, 'profiler-interval-type').vm.$emit('change', 'INTEGER-RANGE');
    await nextTick();
    // Switching away and back clears the range and the column: stale
    // values from the previous interval type do not survive.
    expect(findSelect(wrapper, 'profiler-interval-type').props('value')).toBe('INTEGER-RANGE');
    expect(findNumber(wrapper, 'profiler-partition-range-start').props('value')).toBeUndefined();
    expect(findNumber(wrapper, 'profiler-partition-range-end').props('value')).toBeUndefined();
    expect(findSelect(wrapper, 'profiler-partition-column').props('value')).toBeUndefined();
    await findSelect(wrapper, 'profiler-interval-type').vm.$emit('change', 'COLUMN-VALUE');
    await nextTick();
    const valueInput = document.querySelector(
      '[data-testid="profiler-partition-value-0"]',
    ) as HTMLInputElement | null;
    expect(valueInput).not.toBeNull();
    expect(valueInput?.value).toBe('');
    wrapper.unmount();
  });

  it('resets partition fields when partitioning is disabled', async () => {
    getConfig.mockResolvedValue(partitionedConfig);
    const wrapper = mountModal();
    await flushPromises();
    const toggle = document.querySelector(
      '[data-testid="profiler-enable-partition"]',
    ) as HTMLElement | null;
    expect(toggle).not.toBeNull();
    toggle?.click();
    await flushPromises();
    expect(document.querySelector('[data-testid="profiler-interval-type"]')).toBeNull();
    toggle?.click();
    await flushPromises();
    // Re-enabling restores no stale values: the interval type and the
    // column were cleared when partitioning was disabled.
    expect(findSelect(wrapper, 'profiler-interval-type').props('value')).toBeUndefined();
    expect(findSelect(wrapper, 'profiler-partition-column').props('value')).toBeUndefined();
    wrapper.unmount();
  });

  it('seeds the percentage value when switching to a percentage sample', async () => {
    getConfig.mockResolvedValue({
      profileSampleConfig: {
        sampleConfigType: 'STATIC',
        config: { profileSample: 100, profileSampleType: 'ROWS' },
      },
    });
    const wrapper = mountModal();
    await flushPromises();
    expect(findNumber(wrapper, 'profiler-sample-rows').props('value')).toBe(100);
    const sampleType = findSelect(wrapper, 'profiler-sample-type');
    await sampleType.vm.$emit('update:value', 'PERCENTAGE');
    await sampleType.vm.$emit('change', 'PERCENTAGE');
    await nextTick();
    expect(findNumber(wrapper, 'profiler-sample-percentage').props('value')).toBe(100);
    wrapper.unmount();
  });

  it('collapses a full manual metric selection to all on save', async () => {
    getConfig.mockResolvedValue({
      profileSampleConfig: {
        sampleConfigType: 'STATIC',
        config: { profileSample: 100, profileSampleType: 'PERCENTAGE' },
      },
      includeColumns: [{ columnName: 'id', metrics: ['mean'] }],
    });
    const wrapper = mountModal();
    await flushPromises();
    await findSelect(wrapper, 'profiler-include-metrics-0').vm.$emit('change', [
      ...PROFILER_SETTINGS_METRICS,
    ]);
    await nextTick();
    okButton()?.click();
    await flushPromises();
    expect(putConfig).toHaveBeenCalledTimes(1);
    const saved = putConfig.mock.calls[0]?.[1];
    // A full manual selection saves as the 'all' sentinel, which the
    // config conversion strips to a bare column entry.
    expect(saved?.includeColumns).toEqual([{ columnName: 'id' }]);
    expect(wrapper.emitted('saved')).toHaveLength(1);
    wrapper.unmount();
  });

  it('keeps one include row: the last row offers no remove button', async () => {
    getConfig.mockResolvedValue(null);
    const wrapper = mountModal();
    await flushPromises();
    expect(document.querySelector('[data-testid="profiler-include-remove-0"]')).toBeNull();
    wrapper.unmount();
  });
});
