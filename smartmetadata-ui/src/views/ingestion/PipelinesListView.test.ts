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
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders pipelines from GET /v1/services/ingestionPipelines', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('warehouse-metadata');
    expect(wrapper.text()).toContain('Jobs run with smartmetadata-ingest');
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
});
