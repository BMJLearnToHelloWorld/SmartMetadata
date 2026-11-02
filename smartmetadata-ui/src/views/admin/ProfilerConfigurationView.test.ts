/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import ProfilerConfigurationView from './ProfilerConfigurationView.vue';

const getTypedSetting = vi.fn();
const updateSetting = vi.fn();

vi.mock('@/api/system', () => ({
  getTypedSetting: (...args: unknown[]) => getTypedSetting(...args),
  updateSetting: (...args: unknown[]) => updateSetting(...args),
  // Identity: the mocked getTypedSetting already returns shaped config.
  settingAsProfiler: (value: unknown) => value,
}));

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings/profiler', name: 'settings-profiler', component: ProfilerConfigurationView },
      // The settings shell links back to the settings hub by name.
      { path: '/settings', name: 'admin-settings', component: { template: '<div />' } },
      // The settings shell links to sibling preference pages; a catch-all keeps those links resolvable.
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  });
  await router.push({ name: 'settings-profiler' });
  await router.isReady();
  const wrapper = mount(ProfilerConfigurationView, {
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('ProfilerConfigurationView sample data config (Fix5)', () => {
  beforeEach(() => {
    getTypedSetting.mockReset();
    updateSetting.mockReset();
    getTypedSetting.mockResolvedValue({
      metricConfiguration: [],
      sampleDataConfig: { storeSampleData: false, readSampleData: false },
    });
    updateSetting.mockResolvedValue({});
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('preserves server sampleDataConfig on save instead of dropping it', async () => {
    const wrapper = await mountView();
    await wrapper.get('[data-testid="profiler-save"]').trigger('click');
    await flushPromises();
    expect(updateSetting).toHaveBeenCalledWith(
      'profilerConfiguration',
      expect.objectContaining({
        sampleDataConfig: { storeSampleData: false, readSampleData: false },
      }),
    );
  });

  it('turning on store also turns on read, and save carries both', async () => {
    const wrapper = await mountView();
    await wrapper.get('[data-testid="profiler-store-sample-data"]').trigger('click');
    await flushPromises();
    const readSwitch = wrapper.get('[data-testid="profiler-read-sample-data"]');
    expect(readSwitch.attributes('aria-checked')).toBe('true');
    await wrapper.get('[data-testid="profiler-save"]').trigger('click');
    await flushPromises();
    expect(updateSetting).toHaveBeenCalledWith(
      'profilerConfiguration',
      expect.objectContaining({
        sampleDataConfig: { storeSampleData: true, readSampleData: true },
      }),
    );
  });
});
