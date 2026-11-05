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
import AddServiceIngestionView from './AddServiceIngestionView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AddServiceIngestionView', () => {
  const bodies: Array<{ url: string; body: unknown }> = [];
  beforeEach(() => {
    bodies.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/services/databaseServices/s1') && init?.method === 'GET') {
          return jsonResponse({ id: 's1', name: 'warehouse', serviceType: 'Postgres', kind: 'database' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines/deploy/')) {
          return jsonResponse({ code: 200, reason: 'Pipeline Client Disabled' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines') && init?.method === 'POST') {
          bodies.push({ url, body: JSON.parse(String(init?.body)) });
          return jsonResponse({
            id: 'p1',
            name: 'warehouse-metadata',
            pipelineType: 'metadata',
            service: { id: 's1', type: 'databaseService' },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a service-scoped pipeline and deploys it (A15)', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/ingestion/services/:kind/:id/add-ingestion/:ingestionType',
          name: 'ingestion-service-add-ingestion',
          component: AddServiceIngestionView,
          props: true,
        },
        {
          path: '/ingestion/pipelines/:id',
          name: 'ingestion-pipeline',
          component: { template: '<div>pipeline</div>' },
          props: true,
        },
      ],
    });
    await router.push('/ingestion/services/database/s1/add-ingestion/metadata');
    await router.isReady();
    const wrapper = mount(AddServiceIngestionView, {
      props: { kind: 'database', id: 's1', ingestionType: 'metadata' },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="add-ingestion-form"]').exists()).toBe(true);
    expect((wrapper.find('[data-testid="add-ingestion-name"]').element as HTMLInputElement).value).toBe(
      'warehouse-metadata',
    );
    await wrapper.find('[data-testid="add-ingestion-next"]').trigger('click');
    await wrapper.find('[data-testid="add-ingestion-schedule"]').setValue('0 0 * * *');
    await wrapper.find('[data-testid="add-ingestion-create"]').trigger('click');
    await flushPromises();
    expect(bodies).toHaveLength(1);
    const body = bodies[0]!.body as {
      name: string;
      pipelineType: string;
      service: { id: string; type: string };
      airflowConfig: { pausePipeline: boolean; scheduleInterval?: string };
    };
    expect(body.name).toBe('warehouse-metadata');
    expect(body.pipelineType).toBe('metadata');
    expect(body.service).toEqual({ id: 's1', type: 'databaseService' });
    expect(body.airflowConfig).toMatchObject({ pausePipeline: true, scheduleInterval: '0 0 * * *' });
    expect(router.currentRoute.value.name).toBe('ingestion-pipeline');
  });
});
