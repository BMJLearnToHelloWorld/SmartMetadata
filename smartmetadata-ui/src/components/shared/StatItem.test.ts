/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official StatItem: icon + count, tooltip, isActive, testId.
 */
import { h } from 'vue';
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import StatItem from './StatItem.vue';

describe('official StatItem', () => {
  it('renders the official version-button shape and emits click', async () => {
    const wrapper = mount(StatItem, {
      props: {
        icon: { render: () => h('span', { 'data-testid': 'stat-icon' }) },
        count: '1.0',
        tooltip: 'Exit version history',
        testId: 'version-button',
        isActive: true,
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    const button = wrapper.get('[data-testid="version-button"]');
    expect(button.text()).toContain('1.0');
    expect(button.attributes('data-active')).toBe('true');
    expect(wrapper.find('[data-testid="stat-icon"]').exists()).toBe(true);
    await button.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
    wrapper.unmount();
  });
});
