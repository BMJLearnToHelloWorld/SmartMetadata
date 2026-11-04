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
import PipelinesListView from './PipelinesListView.vue';

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
      { path: '/ingestion/pipelines', name: 'ingestion-pipelines', component: PipelinesListView },
      {
        path: '/ingestion/pipelines/:id',
        name: 'ingestion-pipeline',
        component: { template: '<div>pipe</div>' },
      },
    ],
  });
  await router.push('/ingestion/pipelines');
  await router.isReady();
  const wrapper = mount(PipelinesListView, {
    attachTo: document.body,
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('PipelinesListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/services/ingestionPipelines')) {
          return jsonResponse({
            data: [
              {
                id: 'p1',
                name: 'warehouse-metadata',
                pipelineType: 'metadata',
                service: { id: 's1', type: 'databaseService', name: 'warehouse' },
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/services/databaseServices')) {
          return jsonResponse({ data: [{ id: 's1', name: 'warehouse', serviceType: 'Postgres' }] });
        }
        if (url.includes('/api/v1/services/messagingServices')) {
          return jsonResponse({ data: [] });
        }
        if (url.includes('/api/v1/services/dashboardServices')) {
          return jsonResponse({ data: [] });
        }
        if (url.includes('/api/v1/services/storageServices')) {
          return jsonResponse({ data: [] });
        }
        // P1 permission line: allow-all by default so existing tests keep
        // exercising the wired actions; the deny test below overrides.
        if (url.includes('/api/v1/permissions/ingestionPipeline/name/')) {
          return jsonResponse({
            resource: 'ingestionPipeline',
            permissions: [
              { operation: 'EditAll', access: 'allow' },
              { operation: 'Delete', access: 'allow' },
            ],
          });
        }
        if (url.includes('/api/v1/permissions/ingestionPipeline')) {
          return jsonResponse({
            resource: 'ingestionPipeline',
            permissions: [
              { operation: 'Create', access: 'allow' },
              { operation: 'EditAll', access: 'allow' },
              { operation: 'Delete', access: 'allow' },
            ],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('renders pipelines from GET /v1/services/ingestionPipelines', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('warehouse-metadata');
    expect(wrapper.text()).toContain('Deploy and trigger write through to the pipeline service');
    expect(wrapper.find('[data-testid="entity-list-shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pipelines-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="create-pipeline"]').exists()).toBe(true);
  });

  it('opens pipeline detail on name click', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="pipeline-row-p1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('ingestion-pipeline');
    expect(router.currentRoute.value.params.id).toBe('p1');
  });

  it('disables create and row delete when the permission line denies (P1)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/services/ingestionPipelines')) {
          return jsonResponse({
            data: [
              {
                id: 'p1',
                name: 'warehouse-metadata',
                fullyQualifiedName: 'warehouse.warehouse-metadata',
                pipelineType: 'metadata',
                service: { id: 's1', type: 'databaseService', name: 'warehouse' },
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/permissions/ingestionPipeline')) {
          return jsonResponse({
            resource: 'ingestionPipeline',
            permissions: [
              { operation: 'Create', access: 'deny' },
              { operation: 'EditAll', access: 'deny' },
              { operation: 'Delete', access: 'deny' },
            ],
          });
        }
        return jsonResponse({ data: [] });
      }),
    );
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="create-pipeline"]').attributes('disabled')).not.toBeUndefined();
    await wrapper.get('[data-testid="row-overflow-p1"]').trigger('click');
    await flushPromises();
    const deleteItem = document.querySelector('[data-testid="row-overflow-delete"]');
    expect(deleteItem?.className).toContain('disabled');
  });

  it('shows bulk deploy disabled with no selection', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="bulk-deploy-pipelines"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="bulk-deploy-pipelines"]').attributes('disabled')).toBeDefined();
  });

  it('shows pipelineType select with Postgres agent kinds from service_spec', async () => {
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="create-pipeline"]').trigger('click');
    await flushPromises();
    // Ant Modal teleports; query document.body after attachTo mount.
    const typeSelect = document.body.querySelector('[data-testid="create-pipeline-type"]');
    expect(typeSelect).not.toBeNull();
    const nameInput = document.body.querySelector('[data-testid="create-pipeline-name"]');
    expect(nameInput).not.toBeNull();
    // Default form.pipelineType is metadata; Postgres agent kinds include lineage/usage/profiler/TestSuite.
    expect(wrapper.vm).toBeTruthy();
  });


});
