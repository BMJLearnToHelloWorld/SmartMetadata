/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { TimePicker } from 'ant-design-vue';
import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import ScheduleIntervalField from './ScheduleIntervalField.vue';

function mountField(modelValue: string | undefined) {
  return mount(ScheduleIntervalField, {
    props: { modelValue, testIdPrefix: 'test-schedule' },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

/** The lazy cronstrue import resolves on real timers, not microtasks. */
async function waitForText(
  wrapper: ReturnType<typeof mountField>,
  substring: string,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (wrapper.text().includes(substring)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
    await flushPromises();
  }
}

describe('ScheduleIntervalField', () => {
  it('derives the day period from a daily cron and switches to on-demand and back', async () => {
    const wrapper = mountField('0 0 * * *');
    await flushPromises();
    // Cadence is a toggle button group (pin ScheduleInterval), not a Select.
    const buttons = ['hour', 'day', 'week', 'month', 'custom'].map(
      (period) => wrapper.find(`[data-testid="test-schedule-frequency-${period}"]`),
    );
    expect(buttons.map((button) => button.text())).toEqual([
      'Hourly',
      'Daily',
      'Weekly',
      'Monthly',
      'Custom',
    ]);
    expect(buttons[1]!.attributes('aria-pressed')).toBe('true');
    expect(buttons[0]!.attributes('aria-pressed')).toBe('false');
    expect(wrapper.text()).toContain('Cadence');

    await wrapper.find('[data-testid="test-schedule-card-on-demand"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([undefined]);

    await wrapper.find('[data-testid="test-schedule-card-schedule"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['0 0 * * *']);
  });

  it('starts on-demand when the value is empty', async () => {
    const wrapper = mountField(undefined);
    await flushPromises();
    expect(wrapper.find('[data-testid="test-schedule-card-schedule"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-schedule-frequency-day"]').exists()).toBe(false);
  });

  it('emits the hourly cron when the period changes to hour', async () => {
    const wrapper = mountField('0 0 * * *');
    await flushPromises();
    await wrapper.find('[data-testid="test-schedule-frequency-hour"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['0 * * * *']);
  });

  it('shows an inline error for an invalid custom cron and does not emit', async () => {
    const wrapper = mountField('0 0 * * *');
    await flushPromises();
    await wrapper.find('[data-testid="test-schedule-frequency-custom"]').trigger('click');
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
    await wrapper.find('[data-testid="test-schedule-frequency-custom"]').trigger('click');
    const input = wrapper.find('[data-testid="custom-cron-input"]');
    await input.setValue('0 12 * * 1');
    await flushPromises();
    expect(wrapper.find('[data-testid="custom-cron-error"]').exists()).toBe(false);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['0 12 * * 1']);
  });

  it('treats an empty custom cron as a field-required error, not on-demand', async () => {
    const wrapper = mountField('0 0 * * *');
    await flushPromises();
    await wrapper.find('[data-testid="test-schedule-frequency-custom"]').trigger('click');
    const input = wrapper.find('[data-testid="custom-cron-input"]');
    await input.setValue('');
    await flushPromises();
    expect(wrapper.find('[data-testid="custom-cron-error"]').text()).toContain('Cron is required');
    expect(wrapper.emitted('validity-change')?.at(-1)).toEqual([false]);
  });

  it('edits the time through a single TimePicker and ignores a null change', async () => {
    const wrapper = mountField('0 0 * * *');
    await flushPromises();
    const picker = wrapper.findComponent(TimePicker);
    expect(picker.exists()).toBe(true);
    expect(wrapper.find('[data-testid="time-picker"]').exists()).toBe(true);
    const value = picker.props('value') as ReturnType<typeof dayjs>;
    expect(value.hour()).toBe(0);
    expect(value.minute()).toBe(0);
    const emitsBefore = wrapper.emitted('update:modelValue')?.length ?? 0;
    await picker.vm.$emit('change', null);
    expect(wrapper.emitted('update:modelValue')?.length ?? 0).toBe(emitsBefore);
    await picker.vm.$emit('change', dayjs().hour(3).minute(30).second(0));
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['30 3 * * *']);
  });

  it('always shows the cron summary card, with scheduled text once cronstrue resolves', async () => {
    const wrapper = mountField('0 0 * * *');
    await waitForText(wrapper, '12:00 AM');
    expect(wrapper.find('[data-testid="cron-summary-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cron-summary-card"]').text()).toContain(
      'Ingestion scheduled to run',
    );
  });

  it('shows the manual-trigger text in the summary card when on-demand', async () => {
    const wrapper = mountField(undefined);
    await flushPromises();
    expect(wrapper.find('[data-testid="cron-summary-card"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Pipeline will only be triggered manually.');
    // The on-demand description is not re-shown below the pickers.
    expect(wrapper.text().match(/will executed once/g)?.length).toBe(1);
  });

  it('uses the pin card wording', async () => {
    const wrapper = mountField('0 0 * * *');
    await flushPromises();
    expect(wrapper.text()).toContain('This Ingestion will run repeatedly based on your schedule.');
    expect(wrapper.text()).toContain('This Ingestion will executed once based on your preference.');
    expect(wrapper.text()).toContain('On Demand');
  });
});
