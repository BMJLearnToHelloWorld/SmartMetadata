/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import TestCaseIncidentTab from './TestCaseIncidentTab.vue';

const getTaskCounts = vi.fn();
const listTasks = vi.fn();

vi.mock('@/api/tasks', () => ({
  getTaskCounts: (...args: unknown[]) => getTaskCounts(...args),
  listTasks: (...args: unknown[]) => listTasks(...args),
}));

vi.mock('@/views/collaboration/TaskDetailView.vue', () => ({
  default: {
    name: 'TaskDetailView',
    props: ['id', 'embedded'],
    emits: ['afterClose'],
    template:
      '<div data-testid="entity-task-panel">Task panel {{ id }}<button data-testid="close-btn" @click="$emit(\'afterClose\')">Close</button></div>',
  },
}));

describe('TestCaseIncidentTab', () => {
  beforeEach(() => {
    getTaskCounts.mockReset();
    listTasks.mockReset();
    getTaskCounts.mockResolvedValue({ open: 2, completed: 1 });
    listTasks.mockResolvedValue({
      data: [{ id: 'task-1', name: 'TASK-1', status: 'Open', createdAt: 2 }],
      paging: { total: 1 },
    });
  });

  it('renders official issue tab chrome and loads entity-scoped open tasks', async () => {
    const wrapper = mount(TestCaseIncidentTab, {
      props: { testCaseFqn: 'svc.db.schema.orders.row_count' },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="issue-tab-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="left-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="right-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="open-task"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="closed-task"]').exists()).toBe(true);
    expect(listTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        aboutEntity: 'svc.db.schema.orders.row_count',
        statusGroup: 'open',
      }),
    );
    expect(wrapper.find('[data-testid="task-feed-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="task-panel"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('refetches closed tasks after the embedded panel reports close', async () => {
    const wrapper = mount(TestCaseIncidentTab, {
      props: { testCaseFqn: 'svc.db.schema.orders.row_count' },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    listTasks.mockClear();
    await wrapper.find('[data-testid="close-btn"]').trigger('click');
    await flushPromises();
    expect(listTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        aboutEntity: 'svc.db.schema.orders.row_count',
        statusGroup: 'closed',
      }),
    );
    wrapper.unmount();
  });
});