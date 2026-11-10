/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import HomeWidgetCard from './HomeWidgetCard.vue';

function mountCard(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(HomeWidgetCard, {
    props: { title: 'Activity Feed', testId: 'home-widget-activity', ...props },
    slots: {
      extra: '<button>All Activity</button>',
      default: '<p>No Recent Activity</p>',
      ...slots,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('HomeWidgetCard', () => {
  it('renders OM-like card chrome with title, extra, and body slots', () => {
    const wrapper = mountCard();
    expect(wrapper.get('[data-testid="home-widget-activity"]').text()).toContain('Activity Feed');
    expect(wrapper.text()).toContain('All Activity');
    expect(wrapper.text()).toContain('No Recent Activity');
    expect(wrapper.text()).not.toContain('Topics to catch up');
  });

  it('renders the loading skeleton instead of the body while loading', () => {
    const wrapper = mountCard({ isLoading: true });
    expect(wrapper.find('[data-testid="home-widget-activity-loading"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('No Recent Activity');
  });

  it('renders the error block with a retry action', async () => {
    const wrapper = mountCard({ isError: true });
    expect(wrapper.find('[data-testid="home-widget-activity-error"]').exists()).toBe(true);
    await wrapper.get('[data-testid="home-widget-activity-retry"]').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
  });

  it('renders status chip, summary row and meta', () => {
    const wrapper = mountCard({
      status: { label: 'Needs Attention', tone: 'error' },
      summary: '1/3 services failing',
      meta: 'Updated just now',
    });
    expect(wrapper.get('[data-testid="home-widget-activity-status"]').text()).toContain('Needs Attention');
    expect(wrapper.get('[data-testid="home-widget-activity-summary"]').text()).toContain(
      '1/3 services failing',
    );
    expect(wrapper.get('[data-testid="home-widget-activity-meta"]').text()).toContain('Updated just now');
  });

  it('renders the empty state with its action', async () => {
    const wrapper = mountCard({
      emptyState: { title: 'No services connected yet', actionLabel: 'Add Service' },
    });
    expect(wrapper.get('[data-testid="home-widget-activity-empty"]').text()).toContain(
      'No services connected yet',
    );
    await wrapper.get('[data-testid="home-widget-activity-empty-action"]').trigger('click');
    expect(wrapper.emitted('empty-action')).toHaveLength(1);
    expect(wrapper.text()).not.toContain('No Recent Activity');
  });
});
