/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { INBOX_SEEN_KEY } from '@/api/inbox';
import InboxView from './InboxView.vue';

const listActivityEvents = vi.fn();
const listTasks = vi.fn();
const getInboxCounts = vi.fn();

vi.mock('@/api/activity', async () => {
  const actual = await vi.importActual<typeof import('@/api/activity')>('@/api/activity');
  return { ...actual, listActivityEvents: (...args: unknown[]) => listActivityEvents(...args) };
});

vi.mock('@/api/tasks', async () => {
  const actual = await vi.importActual<typeof import('@/api/tasks')>('@/api/tasks');
  return { ...actual, listTasks: (...args: unknown[]) => listTasks(...args) };
});

vi.mock('@/api/inbox', async () => {
  const actual = await vi.importActual<typeof import('@/api/inbox')>('@/api/inbox');
  return { ...actual, getInboxCounts: (...args: unknown[]) => getInboxCounts(...args) };
});

async function mountView(initialTab?: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/inbox', name: 'inbox', component: InboxView },
      { path: '/tasks/:id', name: 'task', component: { template: '<div>task</div>' } },
    ],
  });
  await router.push({ name: 'inbox', query: initialTab ? { tab: initialTab } : {} });
  await router.isReady();
  const wrapper = mount(InboxView, { global: { plugins: [router, Antd, createTestI18n()] } });
  await flushPromises();
  return { wrapper, router };
}

describe('InboxView', () => {
  beforeEach(() => {
    localStorage.clear();
    listActivityEvents.mockReset();
    listTasks.mockReset();
    getInboxCounts.mockReset();
    getInboxCounts.mockResolvedValue({ openTaskCount: 1, unreadActivityCount: 1, pendingCount: 2 });
    listActivityEvents.mockResolvedValue({
      data: [
        {
          id: 'e1',
          eventType: 'update',
          timestamp: Date.now(),
          summary: 'Table updated',
          actor: { name: 'alice', type: 'user' },
          entity: { name: 'orders', type: 'table' },
        },
      ],
      total: 1,
    });
    listTasks.mockResolvedValue({
      data: [{ id: 't1', name: 'Review orders', type: 'dataQuality', status: 'Open', assignees: [] }],
      total: 1,
    });
  });

  it('renders activity rows and marks the inbox seen on the activity tab', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="inbox-activity-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Table updated');
    expect(localStorage.getItem(INBOX_SEEN_KEY)).not.toBeNull();
  });

  it('renders open tasks on the tasks tab', async () => {
    const { wrapper } = await mountView('tasks');
    const tabs = wrapper.findAll('.ant-tabs-tab');
    expect(tabs.length).toBeGreaterThanOrEqual(2);
    await tabs[1].trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="inbox-tasks-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Review orders');
  });
});
