/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import MarketplaceItemCard from './MarketplaceItemCard.vue';

function mountCard() {
  const onClick = vi.fn();
  const wrapper = mount(MarketplaceItemCard, {
    props: {
      name: 'Sales Metrics',
      subtitle: 'Trusted sales data',
      testId: 'marketplace-item-card-test',
      onClick,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
  return { wrapper, onClick };
}

describe('MarketplaceItemCard (pin MarketplaceItemCard)', () => {
  it('renders the name and subtitle', () => {
    const { wrapper } = mountCard();
    expect(wrapper.text()).toContain('Sales Metrics');
    expect(wrapper.text()).toContain('Trusted sales data');
    expect(wrapper.find('[role="button"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('calls onClick on mouse click', async () => {
    const { wrapper, onClick } = mountCard();
    await wrapper.trigger('click');
    expect(onClick).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('calls onClick on Enter and Space, and on no other key', async () => {
    const { wrapper, onClick } = mountCard();
    await wrapper.trigger('keydown', { key: 'Enter' });
    await wrapper.trigger('keydown', { key: ' ' });
    await wrapper.trigger('keydown', { key: 'Escape' });
    expect(onClick).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
