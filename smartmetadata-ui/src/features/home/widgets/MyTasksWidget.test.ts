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
import Antd, { message } from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { resetWidgetLoadCache } from '@/features/home/widgetLoad';
import MyTasksWidget from './MyTasksWidget.vue';

const listMyAssignedTasks = vi.fn();
const resolveTask = vi.fn();
vi.mock('@/api/tasks', () => ({
  listMyAssignedTasks: (...args: unknown[]) => listMyAssignedTasks(...args),
  resolveTask: (...args: unknown[]) => resolveTask(...args),
}));

const TASKS_PAGE = {
  data: [
    {
      id: 't-incident',
      name: 't-incident',
      category: 'Incident',
      type: 'TestCaseResolution',
      status: 'Open',
      displayName: 'Test case incident',
      description: 'Failing test case',
      assignees: [],
      comments: [],
      createdBy: { id: 'u1', displayName: 'Alice', name: 'alice', type: 'user' },
      about: { id: 'tc1', displayName: 'orders_rows', name: 'orders_rows', type: 'testCase' },
    },
    {
      id: 't-access',
      name: 't-access',
      category: 'DataAccess',
      type: 'DataAccessRequest',
      status: 'Open',
      displayName: 'Access to orders',
      assignees: [],
      comments: [],
      createdBy: { id: 'u2', displayName: 'Bob', name: 'bob', type: 'user' },
    },
  ],
  paging: { total: 2 },
};

function mountWidget() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/my-data', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/tasks', name: 'tasks', component: { template: '<div>tasks</div>' } },
      { path: '/tasks/:id', name: 'task', component: { template: '<div>task</div>' } },
    ],
  });
  return { router, wrapper: mount(MyTasksWidget, {
    props: { widgetKey: 'myTasks' },
    global: { plugins: [router, Antd, createTestI18n()] },
  }) };
}

describe('MyTasksWidget', () => {
  beforeEach(() => {
    resetWidgetLoadCache();
    vi.clearAllMocks();
    listMyAssignedTasks.mockResolvedValue(TASKS_PAGE);
    resolveTask.mockResolvedValue({});
  });

  it('renders chips with counts, rows and the incident status', async () => {
    const { wrapper } = mountWidget();
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-testid="my-tasks-chip-all"]').text()).toContain('(2)');
    expect(wrapper.get('[data-testid="my-tasks-chip-incidents"]').text()).toContain('(1)');
    expect(wrapper.get('[data-testid="home-widget-myTasks-status"]').text()).toContain('1 incidents');
    expect(wrapper.get('[data-testid="my-tasks-row-title-t-incident"]').text()).toContain(
      'Test case incident',
    );
    expect(wrapper.get('[data-testid="my-tasks-row-about-t-incident"]').text()).toContain('orders_rows');
  });

  it('filters rows by bucket chip', async () => {
    const { wrapper } = mountWidget();
    await flushPromises();
    await flushPromises();
    await wrapper.get('[data-testid="my-tasks-chip-access"]').trigger('click');
    expect(wrapper.find('[data-testid="my-tasks-row-t-incident"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="my-tasks-row-t-access"]').exists()).toBe(true);
  });

  it('bulk-approves the selected access task and keeps failures selected', async () => {
    const { wrapper } = mountWidget();
    await flushPromises();
    await flushPromises();
    await wrapper
      .get('[data-testid="my-tasks-row-t-access"] [data-testid="my-tasks-row-select"]')
      .setChecked();
    await flushPromises();
    expect(wrapper.find('[data-testid="my-tasks-bulk-approve"]').exists()).toBe(true);
    await wrapper.get('[data-testid="my-tasks-bulk-approve"]').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(resolveTask).toHaveBeenCalledTimes(1);
  });

  it('clears the selection when switching buckets', async () => {
    const { wrapper } = mountWidget();
    await flushPromises();
    await flushPromises();
    await wrapper
      .get('[data-testid="my-tasks-row-t-access"] [data-testid="my-tasks-row-select"]')
      .setChecked();
    await flushPromises();
    expect(wrapper.find('[data-testid="my-tasks-selection-bar"]').exists()).toBe(true);
    await wrapper.get('[data-testid="my-tasks-chip-access"]').trigger('click');
    expect(wrapper.find('[data-testid="my-tasks-selection-bar"]').exists()).toBe(false);
  });

  it('reports unresolved tasks with an error toast and keeps them selected', async () => {
    resolveTask.mockRejectedValue(new Error('boom'));
    const errorSpy = vi.spyOn(message, 'error');
    const { wrapper } = mountWidget();
    await flushPromises();
    await flushPromises();
    await wrapper
      .get('[data-testid="my-tasks-row-t-access"] [data-testid="my-tasks-row-select"]')
      .setChecked();
    await flushPromises();
    await wrapper.get('[data-testid="my-tasks-bulk-approve"]').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith(
      '1 task(s) could not be resolved here. Open it/them in Tasks to finish.',
    );
    expect(wrapper.find('[data-testid="my-tasks-selection-bar"]').exists()).toBe(true);
    errorSpy.mockRestore();
  });

  it('renders the all-caught-up empty state when there are no open tasks', async () => {
    listMyAssignedTasks.mockResolvedValue({ data: [], paging: { total: 0 } });
    const { wrapper } = mountWidget();
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-testid="home-widget-myTasks-empty"]').text()).toContain(
      'You are all caught up',
    );
  });

  it('shows the loaded-of-total meta on a partial page', async () => {
    listMyAssignedTasks.mockResolvedValue({ data: TASKS_PAGE.data, paging: { total: 250 } });
    const { wrapper } = mountWidget();
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-testid="home-widget-myTasks-meta"]').text()).toContain(
      'Loaded 2 of 250 tasks',
    );
  });
});
