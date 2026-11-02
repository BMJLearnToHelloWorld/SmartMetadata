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
import TaskDetailView from './TaskDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastMatchingFetch(predicate: (url: string, init?: RequestInit) => boolean) {
  const mock = vi.mocked(fetch);
  const match = [...mock.mock.calls].reverse().find((call) => predicate(String(call[0]), call[1]));
  if (!match) {
    throw new Error('no matching fetch');
  }
  return { url: String(match[0]), init: match[1] };
}

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/tasks/:id', name: 'task', component: TaskDetailView, props: true }],
  });
  await router.push('/tasks/t1');
  await router.isReady();
  const wrapper = mount(TaskDetailView, {
    props: { id: 't1' },
    attachTo: document.body,
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper };
}

describe('TaskDetailView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'POST' && url.includes('/resolve')) {
          return jsonResponse({ id: 't1', name: 'review-orders', status: 'Completed', comments: [] });
        }
        if (init?.method === 'POST' && url.includes('/close')) {
          return jsonResponse({ id: 't1', name: 'review-orders', status: 'Closed', comments: [] });
        }
        if (init?.method === 'POST' && url.includes('/comments')) {
          return jsonResponse({
            id: 't1',
            name: 'review-orders',
            status: 'Open',
            comments: [{ id: 'cm1', message: 'noted' }],
          });
        }
        if (url.includes('/api/v1/tasks/t1')) {
          return jsonResponse({
            id: 't1',
            name: 'review-orders',
            status: 'Open',
            type: 'CustomTask',
            comments: [],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('loads a task and can resolve and comment', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('review-orders');
    expect(wrapper.text()).toContain('Open');
    expect(wrapper.find('[data-testid="resolve-task"]').exists()).toBe(true);

    await wrapper.find('[data-testid="resolve-task"]').trigger('click');
    await flushPromises();
    const resolve = lastMatchingFetch((url, init) => url.includes('/resolve') && init?.method === 'POST');
    expect(JSON.parse(String(resolve.init?.body))).toMatchObject({ resolutionType: 'Completed' });
    expect(wrapper.text()).toContain('Completed');

    await wrapper.find('[data-testid="task-comment"]').setValue('noted');
    await wrapper.find('[data-testid="add-task-comment"]').trigger('click');
    await flushPromises();
    const comment = lastMatchingFetch((url, init) => url.includes('/comments') && init?.method === 'POST');
    expect(JSON.parse(String(comment.init?.body))).toEqual({ message: 'noted' });
    expect(wrapper.text()).toContain('noted');
  });

  it('renders the task delete button (R7)', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="delete-task"]').exists()).toBe(true);
  });

  it('closes the task from the action menu and then marks it terminal', async () => {
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="task-actions-menu"]').trigger('click');
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const closeItem = document.querySelector('[data-testid="task-action-menu-item-close"]');
    expect(closeItem).not.toBeNull();
    (closeItem as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const close = lastMatchingFetch((url, init) => url.includes('/close') && init?.method === 'POST');
    expect(close).toBeDefined();
    expect(wrapper.text()).toContain('Closed');
    expect(wrapper.find('[data-testid="task-terminal-note"]').exists()).toBe(true);
  });
});
