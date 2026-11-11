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
import { useAuthStore } from '@/stores/auth';
import AddServiceIngestionView from './AddServiceIngestionView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AddServiceIngestionView', () => {
  const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
  const deploys: string[] = [];
  let serviceOwners: Array<Record<string, unknown>> = [];
  let deployReason: string | undefined;
  let createStatus = 200;

  function stubFetch() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/services/databaseServices/s1') && init?.method === 'GET') {
          return jsonResponse({
            id: 's1',
            name: 'warehouse',
            serviceType: 'Postgres',
            kind: 'database',
            owners: serviceOwners,
            connection: { config: { type: 'Postgres', schemaFilterPattern: { includes: ['public'], excludes: ['^tmp_.*$'] } } },
          });
        }
        if (url.includes('/api/v1/services/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines/deploy/')) {
          deploys.push(url);
          return jsonResponse(
            deployReason ? { code: 200, reason: deployReason } : { code: 200 },
          );
        }
        if (url.includes('/api/v1/services/ingestionPipelines') && init?.method === 'POST') {
          posts.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
          if (createStatus !== 200) {
            return new Response('conflict', { status: createStatus });
          }
          return jsonResponse({
            id: 'p1',
            name: 'generated-uuid',
            pipelineType: 'metadata',
            service: { id: 's1', type: 'databaseService' },
          });
        }
        if (url.includes('/api/v1/users') || url.includes('/api/v1/teams')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  }

  async function mountView() {
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().user = {
      id: 'u1',
      name: 'admin',
      displayName: 'Admin',
      email: 'admin@example.com',
    };
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
          path: '/ingestion/services/:kind/:id',
          name: 'ingestion-service',
          component: { template: '<div>service</div>' },
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
    // The schema import is an extra async hop after the service fetch;
    // wait for the form (and its schema-driven fields) to appear.
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="schema-field-includeViews"]').exists()).toBe(true),
    );
    return { wrapper, router };
  }

  beforeEach(() => {
    posts.length = 0;
    deploys.length = 0;
    serviceOwners = [];
    deployReason = undefined;
    createStatus = 200;
    stubFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a service-scoped pipeline with a UUID name and enters the success step (A15)', async () => {
    const { wrapper, router } = await mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="add-ingestion-form"]').exists()).toBe(true);
    expect((wrapper.find('[data-testid="pipeline-name"]').element as HTMLInputElement).value).toMatch(
      /^warehouse_metadata_[A-Za-z0-9]{8}$/,
    );
    await wrapper.find('[data-testid="add-ingestion-next"]').trigger('click');
    await wrapper.find('[data-testid="add-ingestion-create"]').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(posts).toHaveLength(1);
    const body = posts[0]!.body as {
      name: string;
      displayName: string;
      pipelineType: string;
      service: { id: string; type: string };
      airflowConfig: { scheduleInterval?: string; startDate?: string; retries?: number };
      raiseOnError?: boolean;
      loggerLevel?: string;
      owners?: Array<{ id: string; type: string }>;
      description?: string;
    };
    expect(body.name).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(body.displayName).toMatch(/^warehouse_metadata_[A-Za-z0-9]{8}$/);
    expect(body.pipelineType).toBe('metadata');
    expect(body.service).toEqual({ id: 's1', type: 'databaseService' });
    // Born unpaused (ADR:2026-11-11-ingestion-pipeline-born-unpaused):
    // the create payload omits pausePipeline; the spec default (false) applies.
    expect('pausePipeline' in body.airflowConfig).toBe(false);
    // Create defaults to the daily cron; startDate is yesterday UTC 00:00.
    expect(body.airflowConfig.scheduleInterval).toBe('0 0 * * *');
    const yesterday = new Date(Date.now());
    yesterday.setUTCHours(0, 0, 0, 0);
    yesterday.setDate(yesterday.getDate() - 1);
    expect(body.airflowConfig.startDate).toBe(yesterday.toISOString());
    expect(body.airflowConfig.retries).toBe(0);
    expect(body.raiseOnError).toBe(true);
    expect(body.loggerLevel).toBe('INFO');
    // Owners fall back to the current user (the service has none).
    expect(body.owners).toEqual([
      { id: 'u1', type: 'user', name: 'admin', displayName: 'Admin', fullyQualifiedName: 'admin' },
    ]);
    // P-52: no description key on the create payload.
    expect('description' in body).toBe(false);
    // The filter prefill reads the service connection.config's
    // filter-pattern values (P-08(c) as narrowed by P-08(d): official's
    // prefill is filter-pattern-only, so the connection's includeViews
    // never prefills and the schema default (true) applies instead).
    const sourceConfig = body as unknown as {
      sourceConfig: {
        config: {
          includeViews?: boolean;
          schemaFilterPattern?: { includes?: string[]; excludes?: string[] };
        };
      };
    };
    expect(sourceConfig.sourceConfig.config.includeViews).toBe(true);
    expect(sourceConfig.sourceConfig.config.schemaFilterPattern).toEqual({
      includes: ['public'],
      excludes: ['^tmp_.*$'],
    });
    expect(deploys).toHaveLength(1);
    // P-35: success enters a success step instead of navigating away.
    expect(wrapper.find('[data-testid="add-ingestion-step-success"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-ingestion-deploy-retry"]').exists()).toBe(false);
    expect(router.currentRoute.value.name).toBe('ingestion-service-add-ingestion');
  });

  it('prefills owners from the service owners', async () => {
    serviceOwners = [{ id: 's9', type: 'user', name: 'owner9' }];
    const { wrapper } = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="add-ingestion-next"]').trigger('click');
    await wrapper.find('[data-testid="add-ingestion-create"]').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(posts).toHaveLength(1);
    const body = posts[0]!.body as { owners?: Array<{ id: string }> };
    expect(body.owners).toEqual([{ id: 's9', type: 'user', name: 'owner9' }]);
  });

  it('shows a deploy retry on the success step when the deploy fails', async () => {
    deployReason = 'Pipeline Client Disabled';
    const { wrapper } = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="add-ingestion-next"]').trigger('click');
    await wrapper.find('[data-testid="add-ingestion-create"]').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(posts).toHaveLength(1);
    expect(wrapper.find('[data-testid="add-ingestion-step-success"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-ingestion-deploy-retry"]').exists()).toBe(true);
    await wrapper.find('[data-testid="add-ingestion-deploy-retry"]').trigger('click');
    await flushPromises();
    expect(deploys).toHaveLength(2);
  });

  it('does not report a deploy failure when the deploy succeeds with a reason body', async () => {
    // H-2: on success the server fills `reason` with the plugin's raw
    // response body, so a bare truthiness check would report every
    // successful deploy as a failure. Only the specific
    // "Pipeline Client Disabled" reason means the deploy did nothing.
    deployReason = '{"message": "Workflow [warehouse_metadata_x] has been created"}';
    const { wrapper } = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="add-ingestion-next"]').trigger('click');
    await wrapper.find('[data-testid="add-ingestion-create"]').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(posts).toHaveLength(1);
    expect(wrapper.find('[data-testid="add-ingestion-step-success"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-ingestion-deploy-retry"]').exists()).toBe(false);
  });

  it('surfaces a 409 as already-exists and stays on the form', async () => {
    createStatus = 409;
    const { wrapper, router } = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="add-ingestion-next"]').trigger('click');
    await wrapper.find('[data-testid="add-ingestion-create"]').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(posts).toHaveLength(1);
    expect(wrapper.find('[data-testid="add-ingestion-step-success"]').exists()).toBe(false);
    expect(router.currentRoute.value.name).toBe('ingestion-service-add-ingestion');
  });
});
