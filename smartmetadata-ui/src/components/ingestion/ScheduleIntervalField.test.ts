/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { Select } from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import ScheduleIntervalField from './ScheduleIntervalField.vue';

function mountField(modelValue: string | undefined) {
  return mount(ScheduleIntervalField, {
    props: { modelValue, testIdPrefix: 'test-schedule' },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('ScheduleIntervalField', () => {
  it('derives the day period from a daily cron and switches to on-demand and back', async () => {
    const wrapper = mountField('0 0 * * *');
    await flushPromises();
    const period = wrapper.findAllComponents(Select)[0];
    expect(period?.props('value')).toBe('day');
    expect(period?.props('options')).toEqual([
      { value: 'hour', label: 'Hourly' },
      { value: 'day', label: 'Daily' },
      { value: 'week', label: 'Weekly' },
      { value: 'month', label: 'Monthly' },
      { value: 'custom', label: 'Custom' },
    ]);

    await wrapper.find('[data-testid="test-schedule-card-on-demand"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([undefined]);

    await wrapper.find('[data-testid="test-schedule-card-schedule"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['0 0 * * *']);
  });

  it('starts on-demand when the value is empty', async () => {
    const wrapper = mountField(undefined);
    await flushPromises();
    expect(wrapper.find('[data-testid="test-schedule-card-schedule"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-schedule-period"]').exists()).toBe(false);
  });

  it('emits the hourly cron when the period changes to hour', async () => {
    const wrapper = mountField('0 0 * * *');
    await flushPromises();
    const period = wrapper.findAllComponents(Select)[0];
    await period?.vm.$emit('change', 'hour');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['0 * * * *']);
  });

  it('shows an inline error for an invalid custom cron and does not emit', async () => {
    const wrapper = mountField('0 0 * * *');
    await flushPromises();
    const period = wrapper.findAllComponents(Select)[0];
    await period?.vm.$emit('change', 'custom');
    const emitsBeforeInvalid = wrapper.emitted('update:modelValue')?.length ?? 0;
    const input = wrapper.find('[data-testid="custom-cron-input"]');
    await input.setValue('not a cron');
    await flushPromises();
    expect(wrapper.find('[data-testid="custom-cron-error"]').exists()).toBe(true);
    expect(wrapper.emitted('update:modelValue')?.length).toBe(emitsBeforeInvalid);
    expect(wrapper.emitted('validity-change')?.at(-1)).toEqual([false]);
  });

  it('emits a valid custom cron and clears the error', async () => {
    const wrapper = mountField('0 0 * * *');
    await flushPromises();
    const period = wrapper.findAllComponents(Select)[0];
    await period?.vm.$emit('change', 'custom');
    const input = wrapper.find('[data-testid="custom-cron-input"]');
    await input.setValue('0 12 * * 1');
    await flushPromises();
    expect(wrapper.find('[data-testid="custom-cron-error"]').exists()).toBe(false);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['0 12 * * 1']);
  });

  it('treats an empty custom cron as a field-required error, not on-demand', async () => {
    const wrapper = mountField('0 0 * * *');
    await flushPromises();
    const period = wrapper.findAllComponents(Select)[0];
    await period?.vm.$emit('change', 'custom');
    const input = wrapper.find('[data-testid="custom-cron-input"]');
    await input.setValue('');
    await flushPromises();
    expect(wrapper.find('[data-testid="custom-cron-error"]').text()).toContain('Cron is required');
    expect(wrapper.emitted('validity-change')?.at(-1)).toEqual([false]);
  });
});
