/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import DqDashboardFilterSelect from './DqDashboardFilterSelect.vue';

const OPTIONS = [
  { value: 'Tier.Gold', label: 'Gold' },
  { value: 'Tier.Silver', label: 'Silver' },
];

describe('DqDashboardFilterSelect', () => {
  it('uses a button trigger and immediate checkbox commits (FilterSelect button variant)', async () => {
    const wrapper = mount(DqDashboardFilterSelect, {
      props: {
        modelValue: [],
        label: 'Tier',
        options: OPTIONS,
        searchKey: 'tier',
        testId: 'dq-dashboard-filter-tier',
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="dq-dashboard-filter-tier"]').exists()).toBe(true);
    const trigger = wrapper.get('[data-testid="search-dropdown-tier"]');
    expect(trigger.element.tagName).toBe('BUTTON');
    await trigger.trigger('click');
    await flushPromises();
    const checkboxes = document.body.querySelectorAll('.ant-checkbox-input');
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);
    (checkboxes[0] as HTMLInputElement).click();
    await flushPromises();
    const emissions = wrapper.emitted('update:modelValue') as string[][] | undefined;
    expect(emissions?.length).toBeGreaterThan(0);
    expect(emissions?.flat(2)).toContain('Tier.Gold');
    wrapper.unmount();
  });

  it('select-all emits every loaded option value', async () => {
    const wrapper = mount(DqDashboardFilterSelect, {
      props: {
        modelValue: [],
        label: 'Tier',
        options: OPTIONS,
        searchKey: 'tier',
        testId: 'dq-dashboard-filter-tier',
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await wrapper.get('[data-testid="search-dropdown-tier"]').trigger('click');
    await flushPromises();
    expect(document.body.querySelector('[data-testid="search-dropdown-search-tier"]')).toBeTruthy();
    const selectAll = document.body.querySelector(
      '.dq-dashboard-filter-select__select-all',
    ) as HTMLElement | null;
    expect(selectAll).toBeTruthy();
    selectAll?.click();
    await flushPromises();
    const emissions = wrapper.emitted('update:modelValue') as string[][] | undefined;
    expect(emissions?.at(-1)?.[0]).toEqual(['Tier.Gold', 'Tier.Silver']);
    wrapper.unmount();
  });
});