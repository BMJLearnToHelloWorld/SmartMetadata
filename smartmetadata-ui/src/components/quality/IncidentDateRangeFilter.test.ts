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
import { afterEach, describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import IncidentDateRangeFilter from './IncidentDateRangeFilter.vue';

describe('IncidentDateRangeFilter', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('emits the selected span as start-of-day / end-of-day epoch millis', async () => {
    const wrapper = mount(IncidentDateRangeFilter, {
      props: { startTs: 1700000000000, endTs: 1700086400000, testId: 'incident-date-range' },
      global: { plugins: [Antd, createTestI18n()] },
    });
    const picker = wrapper.findComponent({ name: 'ARangePicker' });
    expect(picker.exists()).toBe(true);
    await picker.vm.$emit('change', [dayjs('2026-02-10T10:30:00'), dayjs('2026-02-12T15:45:00')]);
    await flushPromises();
    const applied = wrapper.emitted('apply');
    expect(applied).toHaveLength(1);
    const payload = applied![0][0] as { startTs: number; endTs: number };
    expect(payload.startTs).toBe(dayjs('2026-02-10').startOf('day').valueOf());
    expect(payload.endTs).toBe(dayjs('2026-02-12').endOf('day').valueOf());
  });

  it('emits clear when the picker is emptied', async () => {
    const wrapper = mount(IncidentDateRangeFilter, {
      props: { startTs: 1700000000000, endTs: 1700086400000, testId: 'incident-date-range' },
      global: { plugins: [Antd, createTestI18n()] },
    });
    const picker = wrapper.findComponent({ name: 'ARangePicker' });
    await picker.vm.$emit('change', [null, null]);
    await flushPromises();
    expect(wrapper.emitted('clear')).toHaveLength(1);
    expect(wrapper.emitted('apply')).toBeUndefined();
  });
});
