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
import WorkflowDetailView from './WorkflowDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/governance/workflowInstances')) {
        return jsonResponse({
          data: [
            {
              id: 'i1',
              status: 'SUCCESS',
              startedAt: 1700000000000,
              variables: { relatedEntity: '<#E::table::svc.db.schema.tbl>' },
            },
          ],
          paging: { total: 1 },
        });
      }
      return jsonResponse({
        id: 'w1',
        name: 'nightly-dq',
        fullyQualifiedName: 'nightly-dq',
        displayName: 'Nightly DQ',
        description: 'Runs nightly checks',
        version: 3,
        trigger: { type: 'schedule', schedule: '0 0 * * *' },
        nodes: [{ name: 'notify', type: 'action' }],
        edges: [{ from: 'start', to: 'notify' }],
        config: { retries: 2 },
      });
    }),
  );
}

async function mountDetail(path: string) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/govern/workflows', name: 'workflows', component: { template: '<div>list</div>' } },
      {
        path: '/govern/workflows/:fqn/:tab',
        name: 'workflow-detail',
        component: WorkflowDetailView,
      },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(WorkflowDetailView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('WorkflowDetailView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders the definition trigger, nodes, edges and configuration', { timeout: 15000 }, async () => {
    stubFetch();
    const { wrapper } = await mountDetail('/govern/workflows/nightly-dq/workflow');
    expect(wrapper.find('[data-testid="workflow-detail"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="workflow-detail-trigger"]').text()).toContain('schedule');
    expect(wrapper.find('[data-testid="workflow-detail-nodes"]').text()).toContain('notify');
    expect(wrapper.find('[data-testid="workflow-detail-edges"]').text()).toContain('1');
    expect(wrapper.find('[data-testid="workflow-detail-configuration"]').text()).toContain('retries');
  });

  it('loads execution history on the history tab', { timeout: 15000 }, async () => {
    stubFetch();
    const { wrapper } = await mountDetail('/govern/workflows/nightly-dq/execution-history');
    expect(wrapper.find('[data-testid="workflow-history-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('SUCCESS');
    expect(wrapper.text()).toContain('svc.db.schema.tbl');
  });

  it('falls back to the workflow tab for an unknown tab', { timeout: 15000 }, async () => {
    stubFetch();
    const { router } = await mountDetail('/govern/workflows/nightly-dq/bogus');
    expect(router.currentRoute.value.params.tab).toBe('workflow');
  });
});
