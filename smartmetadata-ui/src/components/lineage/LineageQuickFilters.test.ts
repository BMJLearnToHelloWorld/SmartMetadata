/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import LineageQuickFilters from './LineageQuickFilters.vue';

describe('LineageQuickFilters', () => {
  it('renders one tag input per pin quick-filter field', () => {
    const wrapper = mount(LineageQuickFilters, {
      props: { value: [] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    for (const key of ['domains', 'owners', 'tag', 'column']) {
      expect(wrapper.find(`[data-testid="lineage-quick-filter-${key}"]`).exists()).toBe(true);
    }
    expect(wrapper.find('[data-testid="lineage-quick-filter-clear"]').exists()).toBe(false);
  });

  it('emits normalized selections when a field value is entered', async () => {
    const wrapper = mount(LineageQuickFilters, {
      props: { value: [] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    const selects = wrapper.findAllComponents({ name: 'ASelect' });
    expect(selects).toHaveLength(4);
    selects[2].vm.$emit('update:value', ['PII.Sensitive']);
    expect(wrapper.emitted('change')?.at(-1)).toEqual([
      [{ key: 'tag', values: ['PII.Sensitive'] }],
    ]);
  });

  it('shows and emits clear when selections exist', async () => {
    const wrapper = mount(LineageQuickFilters, {
      props: { value: [{ key: 'owners', values: ['alice'] }] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    const clear = wrapper.find('[data-testid="lineage-quick-filter-clear"]');
    expect(clear.exists()).toBe(true);
    await clear.trigger('click');
    expect(wrapper.emitted('change')?.at(-1)).toEqual([[]]);
  });
});
