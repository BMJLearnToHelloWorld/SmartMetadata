/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import TasksListView from './TasksListView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/tasks', name: 'tasks', component: TasksListView },
      { path: '/tasks/:id', name: 'task', component: { template: '<div>task</div>' } },
    ],
  });
  await router.push('/tasks');
  await router.isReady();
  const wrapper = mount(TasksListView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('TasksListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/tasks')) {
          return jsonResponse({
            data: [{ id: 't1', name: 'review-orders', type: 'CustomTask', status: 'Open' }],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders tasks from GET /v1/tasks', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('review-orders');
    expect(wrapper.text()).toContain('Open');
    expect(wrapper.find('[data-testid="tasks-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="create-task"]').exists()).toBe(true);
  });

  it('defaults to the open status tab with statusGroup=open', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="tasks-status-tabs"]').exists()).toBe(true);
    const urls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes('statusGroup=open'))).toBe(true);
  });

  it('opens task detail on name click', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="task-row-t1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('task');
  });
});
