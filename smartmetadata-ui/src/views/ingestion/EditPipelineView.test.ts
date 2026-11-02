/**
 * Copyright 2026 SmartMetadata authors.
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
import EditPipelineView from './EditPipelineView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('EditPipelineView', () => {
  const calls: Array<{ url: string; method?: string }> = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method });
        if (url.includes('/ingestionPipelines/p1') && init?.method !== 'PUT') {
          return jsonResponse({
            id: 'p1',
            name: 'warehouse-metadata',
            fullyQualifiedName: 'warehouse.warehouse-metadata',
            pipelineType: 'metadata',
            service: { id: 's1', type: 'databaseService', name: 'warehouse' },
            sourceConfig: { config: { type: 'DatabaseMetadata', includeViews: true } },
            airflowConfig: { pausePipeline: true, scheduleInterval: '0 0 * * *' },
          });
        }
        if (url.includes('/ingestionPipelines') && init?.method === 'PUT') {
          return jsonResponse({ id: 'p1', name: 'warehouse-metadata' });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function mountView() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/ingestion/pipelines/:id/edit',
          name: 'ingestion-pipeline-edit',
          component: EditPipelineView,
          props: true,
        },
        {
          path: '/ingestion/pipelines/:id',
          name: 'ingestion-pipeline',
          component: { template: '<div>detail</div>' },
          props: true,
        },
      ],
    });
    await router.push('/ingestion/pipelines/p1/edit');
    await router.isReady();
    const wrapper = mount(EditPipelineView, {
      props: { id: 'p1' },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    return { wrapper, router };
  }

  it('walks configure then schedule steps and submits the update', async () => {
    const { wrapper, router } = await mountView();
    expect(wrapper.find('[data-testid="edit-pipeline-step-configure"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="filter-include-schemas"]').exists()).toBe(true);
    await wrapper.find('[data-testid="edit-pipeline-next"]').trigger('click');
    expect(wrapper.find('[data-testid="edit-pipeline-step-schedule"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-pipeline-schedule"]').exists()).toBe(true);
    await wrapper.find('[data-testid="edit-pipeline-submit"]').trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.url.includes('/ingestionPipelines') && call.method === 'PUT')).toBe(true);
    expect(router.currentRoute.value.name).toBe('ingestion-pipeline');
  });

  it('goes back from step 2 to step 1 instead of leaving the page', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="edit-pipeline-next"]').trigger('click');
    await wrapper.find('[data-testid="edit-pipeline-back"]').trigger('click');
    expect(wrapper.find('[data-testid="edit-pipeline-step-configure"]').exists()).toBe(true);
    expect(router.currentRoute.value.name).toBe('ingestion-pipeline-edit');
  });
});
