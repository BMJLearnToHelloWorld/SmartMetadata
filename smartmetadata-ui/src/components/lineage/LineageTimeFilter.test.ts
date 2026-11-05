/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createTestI18n } from '@/test/i18n';
import LineageTimeFilter from './LineageTimeFilter.vue';

describe('LineageTimeFilter', () => {
  it('renders the preset selector without a residual notice', () => {
    const wrapper = mount(LineageTimeFilter, {
      props: { value: 'allTime' },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="lineage-time-preset"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-time-residual"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="lineage-time-custom-start"]').exists()).toBe(false);
  });

  it('offers start/end date inputs and applies only a valid custom range', async () => {
    const wrapper = mount(LineageTimeFilter, {
      props: { value: 'customRange' },
      global: { plugins: [Antd, createTestI18n()] },
    });
    const start = wrapper.find('[data-testid="lineage-time-custom-start"]');
    const end = wrapper.find('[data-testid="lineage-time-custom-end"]');
    const apply = wrapper.find('[data-testid="lineage-time-custom-apply"]');
    expect(start.exists()).toBe(true);
    expect(end.exists()).toBe(true);
    expect((apply.element as HTMLButtonElement).disabled).toBe(true);
    await start.setValue('2026-01-07');
    await end.setValue('2026-01-05');
    expect(wrapper.find('[data-testid="lineage-time-range-invalid"]').exists()).toBe(true);
    expect((apply.element as HTMLButtonElement).disabled).toBe(true);
    await end.setValue('2026-01-09');
    expect(wrapper.find('[data-testid="lineage-time-range-invalid"]').exists()).toBe(false);
    expect((apply.element as HTMLButtonElement).disabled).toBe(false);
    await apply.trigger('click');
    expect(wrapper.emitted('applyCustom')).toEqual([
      [{ startDate: '2026-01-07', endDate: '2026-01-09' }],
    ]);
  });

  it('offers a point-in-time date input and applies it end-only', async () => {
    const wrapper = mount(LineageTimeFilter, {
      props: { value: 'pointInTime' },
      global: { plugins: [Antd, createTestI18n()] },
    });
    const point = wrapper.find('[data-testid="lineage-time-point"]');
    const apply = wrapper.find('[data-testid="lineage-time-point-apply"]');
    expect(point.exists()).toBe(true);
    expect((apply.element as HTMLButtonElement).disabled).toBe(true);
    await point.setValue('2026-01-07');
    expect((apply.element as HTMLButtonElement).disabled).toBe(false);
    await apply.trigger('click');
    expect(wrapper.emitted('applyPoint')).toEqual([['2026-01-07']]);
  });
});
