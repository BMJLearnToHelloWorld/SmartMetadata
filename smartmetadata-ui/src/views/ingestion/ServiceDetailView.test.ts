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
import ServiceDetailView from './ServiceDetailView.vue';

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
      { path: '/ingestion/services', name: 'ingestion-services', component: { template: '<div>list</div>' } },
      {
        path: '/ingestion/services/:kind/:id',
        name: 'ingestion-service',
        component: ServiceDetailView,
        props: true,
      },
      {
        path: '/ingestion/services/:kind/:id/connection',
        name: 'ingestion-service-connection',
        component: { template: '<div>conn</div>' },
        props: true,
      },
      {
        path: '/ingestion/pipelines/:id',
        name: 'ingestion-pipeline',
        component: { template: '<div>pipe</div>' },
        props: true,
      },
    ],
  });
  await router.push('/ingestion/services/database/s1');
  await router.isReady();
  const wrapper = mount(ServiceDetailView, {
    props: { kind: 'database', id: 's1', initialTab: 'pipelines' },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('ServiceDetailView', () => {
  const calls: string[] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes('/api/v1/services/databaseServices/s1')) {
          return jsonResponse({
            id: 's1',
            name: 'warehouse',
            displayName: 'Warehouse',
            fullyQualifiedName: 'pg.warehouse',
            serviceType: 'Postgres',
            connection: { config: { type: 'Postgres', hostPort: 'localhost:5432' } },
          });
        }
        if (url.includes('/api/v1/services/ingestionPipelines')) {
          return jsonResponse({
            data: [
              {
                id: 'p1',
                name: 'daily',
                pipelineType: 'metadata',
                enabled: true,
                service: { id: 's1', type: 'databaseService', name: 'warehouse' },
              },
            ],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the service pipelines filtered by service FQN', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="service-pipelines-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('daily');
    expect(calls.some((url) => url.includes('/api/v1/services/ingestionPipelines'))).toBe(true);
    expect(calls.some((url) => url.includes('service=pg.warehouse'))).toBe(true);
  });

  it('renders registry tabs including honest residual tabs', async () => {
    const { wrapper } = await mountView();
    // Ant Tabs does not forward TabPane testids (Stage 5 lesson), so assert
    // the rendered tab labels plus the force-rendered residual slot content.
    expect(wrapper.text()).toContain('Overview');
    expect(wrapper.text()).toContain('Connection');
    expect(wrapper.text()).toContain('Pipelines');
    expect(wrapper.text()).toContain('Versions');
    expect(wrapper.find('[data-testid="service-versions-residual-empty"]').exists()).toBe(true);
  });
});
