/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { resetWidgetLoadCache } from '@/features/home/widgetLoad';
import ActivityFeedWidget from './ActivityFeedWidget.vue';

const getMyActivityFeed = vi.fn();
vi.mock('@/api/activity', () => ({
  getMyActivityFeed: (...args: unknown[]) => getMyActivityFeed(...args),
}));

function event(id: string, eventType: string, timestamp: number) {
  return {
    id,
    eventType,
    timestamp,
    actor: { id: 'u1', displayName: 'Alice', name: 'alice', type: 'user' },
    entity: {
      id: 't1',
      displayName: 'orders',
      name: 'orders',
      type: 'table',
      fullyQualifiedName: 'svc.db.schema.orders',
    },
    assignees: [],
    comments: [],
  };
}

function mountWidget() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/my-data', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/activity', name: 'activity', component: { template: '<div>activity</div>' } },
      {
        path: '/:entityType/:fqn',
        name: 'asset',
        component: { template: '<div>asset</div>' },
      },
    ],
  });
  return mount(ActivityFeedWidget, {
    props: { widgetKey: 'activityFeed' },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
}

describe('ActivityFeedWidget', () => {
  beforeEach(() => {
    resetWidgetLoadCache();
    vi.clearAllMocks();
  });

  it('reads my-feed with 7 days and 21 rows, shows 6 rows with the latest sentence as summary', async () => {
    const events = [
      event('e1', 'DescriptionUpdated', Date.now() - 60_000),
      event('e2', 'EntityCreated', Date.now() - 120_000),
      event('e3', 'TagsUpdated', Date.now() - 180_000),
      event('e4', 'EntityUpdated', Date.now() - 240_000),
      event('e5', 'TierUpdated', Date.now() - 300_000),
      event('e6', 'DomainUpdated', Date.now() - 360_000),
      event('e7', 'OwnerUpdated', Date.now() - 420_000),
    ];
    getMyActivityFeed.mockResolvedValue({ data: events, paging: { total: 7 } });
    const wrapper = mountWidget();
    await flushPromises();
    await flushPromises();
    expect(getMyActivityFeed).toHaveBeenCalledWith({ days: 7, limit: 21 });
    expect(wrapper.findAll('[data-testid^="home-activity-row-"]')).toHaveLength(6);
    expect(wrapper.find('[data-testid="home-activity-row-e7"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="home-widget-activityFeed-summary"]').text()).toContain(
      'Alice updated the description of orders',
    );
    expect(wrapper.get('[data-testid="home-widget-activityFeed-status"]').text()).toContain(
      '7 updates',
    );
    // The product's own event-type filter dropdown is gone.
    expect(wrapper.find('[data-testid="home-activity-filter"]').exists()).toBe(false);
  });

  it('caps the count at 20+ when more than 20 events arrive', async () => {
    const events = Array.from({ length: 21 }, (_, i) =>
      event(`e${i}`, 'EntityUpdated', Date.now() - i * 60_000),
    );
    getMyActivityFeed.mockResolvedValue({ data: events, paging: { total: 21 } });
    const wrapper = mountWidget();
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-testid="home-widget-activityFeed-status"]').text()).toContain(
      '20+ updates',
    );
  });

  it('renders the quiet empty state with no call to action', async () => {
    getMyActivityFeed.mockResolvedValue({ data: [], paging: { total: 0 } });
    const wrapper = mountWidget();
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-testid="home-widget-activityFeed-empty"]').text()).toContain(
      'All quiet in your domains',
    );
    expect(wrapper.find('[data-testid="home-widget-activityFeed-empty-action"]').exists()).toBe(
      false,
    );
  });
});
