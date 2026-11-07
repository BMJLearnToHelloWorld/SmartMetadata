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
import WorkflowsView from './WorkflowsView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/govern/workflows', name: 'workflows', component: WorkflowsView },
      {
        path: '/govern/workflows/:fqn/:tab',
        name: 'workflow-detail',
        component: { template: '<div>detail stub</div>' },
      },
    ],
  });
  return { pinia, router };
}

describe('WorkflowsView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders workflow cards with the total', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            { id: 'w1', name: 'nightly-dq', displayName: 'Nightly DQ', description: 'Runs nightly checks' },
          ],
          paging: { total: 1 },
        }),
      ),
    );
    const { pinia, router } = mountPage();
    await router.push('/govern/workflows');
    await router.isReady();
    const wrapper = mount(WorkflowsView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="workflows"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="workflow-card-w1"]').text()).toContain('Nightly DQ');
    expect(wrapper.find('[data-testid="workflows-pagination"]').text()).toContain('1');
    expect(wrapper.find('[data-testid="workflows-next"]').attributes('disabled')).toBeDefined();
  });

  it('shows the three-feature empty state when there are no workflows', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ data: [], paging: { total: 0 } })),
    );
    const { pinia, router } = mountPage();
    await router.push('/govern/workflows');
    await router.isReady();
    const wrapper = mount(WorkflowsView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    const empty = wrapper.find('[data-testid="workflows-empty"]');
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toContain('Pick a trigger');
    expect(empty.text()).toContain('Define the action');
    expect(empty.text()).toContain('Sit back');
  });

  it('navigates to the detail route when a card is clicked', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            {
              id: 'w1',
              name: 'nightly-dq',
              fullyQualifiedName: 'nightly-dq',
              displayName: 'Nightly DQ',
              description: 'Runs nightly checks',
            },
          ],
          paging: { total: 1 },
        }),
      ),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/govern/workflows', name: 'workflows', component: WorkflowsView },
        {
          path: '/govern/workflows/:fqn/:tab',
          name: 'workflow-detail',
          component: { template: '<div>detail stub</div>' },
        },
      ],
    });
    await router.push('/govern/workflows');
    await router.isReady();
    const wrapper = mount(WorkflowsView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await wrapper.find('[data-testid="workflow-card-w1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('workflow-detail');
    expect(router.currentRoute.value.params.fqn).toBe('nightly-dq');
    expect(router.currentRoute.value.params.tab).toBe('workflow');
  });

  it('shows the forbidden placeholder on 403', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('forbidden', { status: 403 })),
    );
    const { pinia, router } = mountPage();
    await router.push('/govern/workflows');
    await router.isReady();
    const wrapper = mount(WorkflowsView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="workflows-forbidden"]').exists()).toBe(true);
  });

  it('rejects an invalid workflow name and creates a valid one', { timeout: 15000 }, async () => {
    const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          posts.push({ url, body });
          return jsonResponse({ id: 'w2', name: body.name, description: body.description });
        }
        return jsonResponse({ data: [], paging: { total: 0 } });
      }),
    );
    const { pinia, router } = mountPage();
    await router.push('/govern/workflows');
    await router.isReady();
    const wrapper = mount(WorkflowsView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await wrapper.find('[data-testid="workflows-create"]').trigger('click');
    await wrapper.find('[data-testid="workflows-create-name"]').setValue('bad name!');
    await wrapper.find('[data-testid="workflows-create-description"]').setValue('Desc');
    await wrapper.find('.ant-modal-footer .ant-btn-primary').trigger('click');
    await flushPromises();
    expect(posts.length).toBe(0);
    expect(wrapper.find('[data-testid="workflows-form-error"]').exists()).toBe(true);
    await wrapper.find('[data-testid="workflows-create-name"]').setValue('weekly-sync');
    await wrapper.find('.ant-modal-footer .ant-btn-primary').trigger('click');
    await flushPromises();
    expect(posts.length).toBe(1);
    expect(posts[0].url).toContain('/api/v1/governance/workflowDefinitions');
    expect(posts[0].body).toMatchObject({ name: 'weekly-sync', description: 'Desc' });
  });

  it('creates a workflow with the official minimal definition and opens the builder in edit mode', { timeout: 15000 }, async () => {
    const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          posts.push({ url, body });
          return jsonResponse({
            id: 'w2',
            name: body.name,
            fullyQualifiedName: body.name,
            description: body.description,
          });
        }
        return jsonResponse({ data: [], paging: { total: 0 } });
      }),
    );
    const { pinia, router } = mountPage();
    await router.push('/govern/workflows');
    await router.isReady();
    const wrapper = mount(WorkflowsView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await wrapper.find('[data-testid="workflows-create"]').trigger('click');
    await wrapper.find('[data-testid="workflows-create-name"]').setValue('weekly-sync');
    await wrapper.find('[data-testid="workflows-create-description"]').setValue('Desc');
    await wrapper.find('.ant-modal-footer .ant-btn-primary').trigger('click');
    await flushPromises();
    expect(posts.length).toBe(1);
    expect(posts[0].url).toContain('/api/v1/governance/workflowDefinitions');
    // Official handleModalSubmit (WorkflowsPage): the complete minimal
    // definition — empty nodes/edges plus a default event-based trigger.
    expect(posts[0].body).toEqual({
      description: 'Desc',
      displayName: 'weekly-sync',
      edges: [],
      name: 'weekly-sync',
      nodes: [],
      trigger: { config: {}, output: [], type: 'eventBasedEntity' },
    });
    expect(router.currentRoute.value.name).toBe('workflow-detail');
    expect(router.currentRoute.value.params.fqn).toBe('weekly-sync');
    expect(router.currentRoute.value.params.tab).toBe('workflow');
    expect(router.currentRoute.value.query.mode).toBe('edit');
  });
});
