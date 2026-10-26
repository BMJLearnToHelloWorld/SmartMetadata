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
import PipelineDetailView from './PipelineDetailView.vue';

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
      {
        path: '/ingestion/pipelines/:id',
        name: 'ingestion-pipeline',
        component: PipelineDetailView,
        props: true,
      },
    ],
  });
  await router.push('/ingestion/pipelines/p1');
  await router.isReady();
  const wrapper = mount(PipelineDetailView, {
    props: { id: 'p1' },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper };
}

describe('PipelineDetailView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'disabled', reason: 'Pipeline Client Disabled' });
        }
        if (url.includes('/pipelineStatus')) {
          return jsonResponse({
            data: [{ runId: 'r1', pipelineState: 'success', timestamp: 1710000000000 }],
          });
        }
        if (url.includes('/ingestionPipelines/p1')) {
          return jsonResponse({
            id: 'p1',
            name: 'warehouse-metadata',
            fullyQualifiedName: 'warehouse.warehouse-metadata',
            pipelineType: 'metadata',
            service: { id: 's1', type: 'databaseService', name: 'warehouse' },
            sourceConfig: { config: { type: 'DatabaseMetadata', includeViews: true } },
            airflowConfig: { pausePipeline: true },
          });
        }
        if (url.includes('/databaseServices/s1')) {
          return jsonResponse({
            id: 's1',
            name: 'warehouse',
            serviceType: 'Postgres',
            connection: { config: { type: 'Postgres', hostPort: 'localhost:5432', database: 'analytics' } },
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

  it('shows catalog status, CLI YAML, and no trigger call', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="entity-detail-shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pipeline-run-note"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('success');
    expect(wrapper.find('[data-testid="pipeline-cli-yaml"]').text()).toContain('type: postgres');
    expect(wrapper.text()).toContain('Pipeline Client Disabled');
    const urls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/trigger/'))).toBe(false);
    expect(urls.some((url) => url.includes('/deploy/'))).toBe(false);
  });
});
