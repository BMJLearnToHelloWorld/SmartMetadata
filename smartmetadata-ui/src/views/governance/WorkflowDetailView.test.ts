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
import { approvalFixture } from '@/components/governance/workflowBuilder/testHarness';
import WorkflowDetailView from './WorkflowDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(definitionStatus = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/governance/workflowDefinitions/name/')) {
        if (definitionStatus !== 200) {
          return jsonResponse({ message: 'error' }, definitionStatus);
        }
        return jsonResponse(approvalFixture());
      }
      if (url.includes('/v1/governance/workflowInstances')) {
        return jsonResponse({
          data: [
            {
              id: 'run-1',
              status: 'FINISHED',
              startedAt: 1_700_000_000_000,
              endedAt: 1_700_000_090_000,
              variables: {
                global_relatedEntity: '<#E::table::svc.db.schema.orders>',
              },
            },
          ],
          paging: { total: 1 },
        });
      }
      if (url.includes('/v1/metadata/types/fields/workflowTriggerFields')) {
        return jsonResponse({ common: [], entitySpecific: {} });
      }
      return jsonResponse({ data: [], paging: { total: 0 } });
    }),
  );
}

async function mountDetail(path: string, definitionStatus = 200) {
  stubFetch(definitionStatus);
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
      {
        path: '/assets/:entityType/:fqn',
        name: 'asset',
        component: { template: '<div />' },
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
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('renders the builder header, tabs and canvas nodes', { timeout: 15000 }, async () => {
    const { wrapper } = await mountDetail('/govern/workflows/approve-glossary-term/workflow');
    expect(wrapper.find('[data-testid="workflow-detail"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="workflow-title"]').text()).toBe(
      'Approve Glossary Term',
    );
    expect(wrapper.find('[data-testid="workflow-builder-tab"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="workflow-builder-tab"]').text()).toContain(
      'Workflow Builder',
    );
    expect(wrapper.text()).toContain('Execution History');
    expect(wrapper.findAll('.vue-flow__node')).toHaveLength(4);
    // View mode: the Edit button is offered, the edit controls are not.
    expect(wrapper.find('[data-testid="edit-workflow-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="save-workflow-button"]').exists()).toBe(false);
  });

  it('shows the edit controls in edit mode', { timeout: 15000 }, async () => {
    const { wrapper } = await mountDetail(
      '/govern/workflows/approve-glossary-term/workflow?mode=edit',
    );
    expect(wrapper.find('[data-testid="edit-workflow-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="cancel-workflow-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-workflow-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="save-workflow-button"]').exists()).toBe(true);
  });

  it('loads execution history on the history tab', { timeout: 15000 }, async () => {
    const { wrapper } = await mountDetail(
      '/govern/workflows/approve-glossary-term/execution-history',
    );
    expect(wrapper.find('[data-testid="workflow-status-badge-run-1"]').text()).toBe(
      'Success',
    );
    expect(wrapper.find('[data-testid="related-entity-link"]').text()).toBe('orders');
  });

  it('opens the start-node configuration when a canvas node is clicked', { timeout: 15000 }, async () => {
    const { wrapper } = await mountDetail('/govern/workflows/approve-glossary-term/workflow?mode=edit');
    const nodes = wrapper.findAll('.vue-flow__node');
    expect(nodes.length).toBe(4);
    await nodes[0].trigger('click');
    await flushPromises();
    // The sidebar is an antd Drawer teleported to document.body.
    expect(document.body.querySelector('[data-testid="node-config-title"]')).not.toBeNull();
    expect(
      document.body.querySelector('[data-testid="node-config-title"]')?.textContent,
    ).toBe('Start Node Configuration');
  });

  it('falls back to the workflow tab for an unknown tab', { timeout: 15000 }, async () => {
    const { router } = await mountDetail('/govern/workflows/approve-glossary-term/bogus');
    expect(router.currentRoute.value.params.tab).toBe('workflow');
  });

  it('renders the forbidden card when the definition load is forbidden', { timeout: 15000 }, async () => {
    const { wrapper } = await mountDetail(
      '/govern/workflows/approve-glossary-term/workflow',
      403,
    );
    expect(wrapper.find('[data-testid="workflow-detail-forbidden"]').exists()).toBe(true);
  });

  it('renders an error card with a retry when the definition load fails', { timeout: 15000 }, async () => {
    const { wrapper } = await mountDetail(
      '/govern/workflows/approve-glossary-term/workflow',
      500,
    );
    expect(wrapper.find('[data-testid="workflow-detail-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="workflow-detail-reload"]').exists()).toBe(true);
  });
});
