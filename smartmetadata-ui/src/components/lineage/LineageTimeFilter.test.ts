/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createTestI18n } from '@/test/i18n';
import LineageTimeFilter from './LineageTimeFilter.vue';

describe('LineageTimeFilter', () => {
  it('renders the preset selector with the time-range residual notice', () => {
    const wrapper = mount(LineageTimeFilter, {
      props: { value: 'allTime' },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="lineage-time-preset"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-time-residual"]').text()).toContain(
      'does not reload or filter the graph',
    );
  });
});
