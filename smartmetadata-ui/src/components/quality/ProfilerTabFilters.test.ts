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
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import ProfilerTabFilters from './ProfilerTabFilters.vue';

describe('ProfilerTabFilters official parent chrome', () => {
  it('shows the date filter on Table Profile and hides it on Data Quality when no column is open', async () => {
    const table = mount(ProfilerTabFilters, {
      props: { activeTab: 'table-profile', editDataProfile: true, createTestCasePermission: true },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(table.get('[data-testid="profiler-date-range"]').exists()).toBe(true);
    table.unmount();

    const quality = mount(ProfilerTabFilters, {
      props: { activeTab: 'data-quality', editDataProfile: true, createTestCasePermission: true },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(quality.find('[data-testid="profiler-date-range"]').exists()).toBe(false);
    quality.unmount();
  });

  it('shows official add items test-case and custom-metric only, plus the settings gear', async () => {
    const wrapper = mount(ProfilerTabFilters, {
      props: { activeTab: 'table-profile', editDataProfile: true, createTestCasePermission: true },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await flushPromises();
    expect(wrapper.get('[data-testid="profiler-add-table-test-btn"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="profiler-setting-btn"]').exists()).toBe(true);
    await wrapper.get('[data-testid="profiler-add-table-test-btn"]').trigger('click');
    await flushPromises();
    const testCase = document.querySelector('[data-testid="profiler-add-test-case"]');
    const customMetric = document.querySelector('[data-testid="profiler-add-custom-metric"]');
    expect(testCase?.textContent).toMatch(/Test case/i);
    expect(customMetric?.textContent).toMatch(/Custom Metric/i);
    expect(document.querySelector('[data-testid="profiler-add-bundle-suite"]')).toBeNull();
    wrapper.unmount();
  });

  it('hides add and gear when the table is deleted', async () => {
    const wrapper = mount(ProfilerTabFilters, {
      props: {
        activeTab: 'table-profile',
        deleted: true,
        editDataProfile: true,
        createTestCasePermission: true,
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="profiler-add-table-test-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="profiler-setting-btn"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('uses official DatePickerMenu trigger titles, not incident-page wording', async () => {
    const wrapper = mount(ProfilerTabFilters, {
      props: { activeTab: 'table-profile', editDataProfile: true, createTestCasePermission: true },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await flushPromises();
    const trigger = wrapper.get('[data-testid="date-picker-menu"]');
    expect(trigger.text()).toBe('Last 7 days');
    expect(trigger.text()).not.toMatch(/incident|date range/i);
    await trigger.trigger('click');
    await flushPromises();
    expect(document.querySelector('[data-testid="incident-date-preset-yesterday"]')?.textContent?.trim()).toBe('Yesterday');
    expect(document.querySelector('[data-testid="incident-date-preset-last7days"]')?.textContent?.trim()).toBe('Last 7 days');
    expect(document.querySelector('[data-testid="incident-date-preset-custom"]')?.textContent?.trim()).toBe('Custom Range');
    wrapper.unmount();
  });
});
