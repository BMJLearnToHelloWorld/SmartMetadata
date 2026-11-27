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
import dayjs from 'dayjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import { rangeForPreset } from '@/quality/incidentDatePresets';
import IncidentDateRangeFilter from './IncidentDateRangeFilter.vue';

describe('IncidentDateRangeFilter', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('emits official now-minus-days through now when a preset is chosen', async () => {
    const now = Date.UTC(2026, 10, 27, 15, 4, 0);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const wrapper = mount(IncidentDateRangeFilter, {
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="date-picker-menu"]').exists()).toBe(true);
    await wrapper.get('[data-testid="date-picker-menu"]').trigger('click');
    await flushPromises();
    const item = document.body.querySelector('[data-testid="incident-date-preset-last7days"]');
    expect(item).not.toBeNull();
    (item as HTMLElement).click();
    await flushPromises();
    const applied = wrapper.emitted('apply');
    expect(applied).toHaveLength(1);
    const payload = applied![0][0] as { startTs: number; endTs: number; key: string };
    expect(payload.key).toBe('last7days');
    expect(payload).toMatchObject(rangeForPreset(7, now));
  });

  it('emits the selected span as start-of-day / end-of-day epoch millis for a custom range', async () => {
    const wrapper = mount(IncidentDateRangeFilter, {
      props: { rangeKey: 'customRange', startTs: 1700000000000, endTs: 1700086400000, testId: 'incident-date-range' },
      global: { plugins: [Antd, createTestI18n()] },
    });
    const picker = wrapper.findComponent({ name: 'ARangePicker' });
    expect(picker.exists()).toBe(true);
    await picker.vm.$emit('change', [dayjs('2026-02-10T10:30:00'), dayjs('2026-02-12T15:45:00')]);
    await flushPromises();
    const applied = wrapper.emitted('apply');
    expect(applied).toHaveLength(1);
    const payload = applied![0][0] as { startTs: number; endTs: number; key: string };
    expect(payload.key).toBe('customRange');
    expect(payload.startTs).toBe(dayjs('2026-02-10').startOf('day').valueOf());
    expect(payload.endTs).toBe(dayjs('2026-02-12').endOf('day').valueOf());
  });

  it('emits clear when the custom picker is emptied', async () => {
    const wrapper = mount(IncidentDateRangeFilter, {
      props: { rangeKey: 'customRange', startTs: 1700000000000, endTs: 1700086400000, testId: 'incident-date-range' },
      global: { plugins: [Antd, createTestI18n()] },
    });
    const picker = wrapper.findComponent({ name: 'ARangePicker' });
    await picker.vm.$emit('change', [null, null]);
    await flushPromises();
    expect(wrapper.emitted('clear')).toHaveLength(1);
    expect(wrapper.emitted('apply')).toBeUndefined();
  });
});
