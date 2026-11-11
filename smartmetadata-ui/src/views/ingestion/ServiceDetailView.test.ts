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

async function mountView(initialTab = 'pipelines') {
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
      {
        path: '/ingestion/services/:kind/:id/add/:ingestionType',
        name: 'ingestion-service-add-ingestion',
        component: { template: '<div>add</div>' },
        props: true,
      },
    ],
  });
  await router.push('/ingestion/services/database/s1');
  await router.isReady();
  const wrapper = mount(ServiceDetailView, {
    props: { kind: 'database', id: 's1', initialTab },
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
        if (url.includes('/api/v1/services/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
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
    // P-38: the enabled Yes/No column is now the Active/Paused status badge.
    expect(wrapper.text()).toContain('Active');
  });

  it('offers per-service ingestion kinds in the add-ingestion menu (P-38)', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="add-service-ingestion"]').trigger('click');
    await flushPromises();
    const menu = document.body.querySelector('.ant-dropdown-menu');
    expect(menu).not.toBeNull();
    expect(menu!.textContent).toContain('Metadata');
    expect(menu!.textContent).toContain('Data Quality');
    const usageItem = [...document.body.querySelectorAll('[data-testid^="add-ingestion-"]')].find(
      (el) => el.getAttribute('data-testid') === 'add-ingestion-usage',
    ) as HTMLElement | undefined;
    expect(usageItem).not.toBeUndefined();
    usageItem!.click();
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('ingestion-service-add-ingestion');
    expect(router.currentRoute.value.params.ingestionType).toBe('usage');
  });

  it('shows the shared row actions in the pipelines mini-table (P-38)', async () => {
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="service-pipeline-row-overflow"]').trigger('click');
    await flushPromises();
    expect(document.querySelector('[data-testid="logs-button"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="row-overflow-view"]')).not.toBeNull();
  });

  it('shows the empty state with a create action when there are no pipelines (P-38)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/services/databaseServices/s1')) {
          return jsonResponse({
            id: 's1',
            name: 'warehouse',
            fullyQualifiedName: 'pg.warehouse',
            serviceType: 'Postgres',
            connection: { config: { type: 'Postgres', hostPort: 'localhost:5432' } },
          });
        }
        if (url.includes('/api/v1/services/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('No pipelines set up yet');
    expect(wrapper.find('[data-testid="empty-add-service-ingestion"]').exists()).toBe(true);
  });

  it('routes Edit to the standalone connection page instead of a modal', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="edit-service"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('ingestion-service-connection');
    expect(router.currentRoute.value.params).toMatchObject({ kind: 'database', id: 's1' });
  });

  it('offers test connection on the connection tab', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="test-service-connection"]').exists()).toBe(true);
  });

  it('renders registry tabs including the wired versions tab', async () => {
    const { wrapper } = await mountView();
    // Ant Tabs does not forward TabPane testids (Stage 5 lesson), so assert
    // the rendered tab labels plus the force-rendered versions slot content.
    expect(wrapper.text()).toContain('Overview');
    expect(wrapper.text()).toContain('Connection');
    expect(wrapper.text()).toContain('Pipelines');
    expect(wrapper.text()).toContain('Versions');
    expect(wrapper.find('[data-testid="service-versions-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="service-versions-empty"]').exists()).toBe(true);
  });

  it('deletes the test-connection workflow exactly once (hard) when triggering fails', async () => {
    // ADR:2026-11-11-test-connection-workflow-hard-delete-cleanup — the
    // trigger catch deletes the workflow and clears the id, so the outer
    // catch must not delete it a second time; the delete is hard so the
    // fixed `<Type>.testConnection` name is freed for the next run.
    const calls: { method: string; url: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        calls.push({ method, url });
        if (url.includes('/api/v1/services/databaseServices/s1')) {
          return jsonResponse({
            id: 's1',
            name: 'mydb',
            displayName: 'My DB',
            fullyQualifiedName: 'mysql.mydb',
            serviceType: 'Mysql',
            connection: { config: { type: 'Mysql', hostPort: 'db.example:3306' } },
          });
        }
        if (url.includes('/api/v1/services/testConnectionDefinitions/name/Mysql.testConnectionDefinition')) {
          return jsonResponse({
            name: 'Mysql',
            steps: [{ name: 'CheckAccess', description: 'reach', mandatory: true }],
          });
        }
        if (url.includes('/api/v1/automations/workflows/trigger/')) {
          return new Response('bad request', { status: 400 });
        }
        if (url.includes('/api/v1/automations/workflows') && method === 'POST') {
          return jsonResponse({ id: 'w1', status: 'Pending' });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView('connection');
    await wrapper.find('[data-testid="test-service-connection"]').trigger('click');
    await flushPromises();
    const deletes = calls.filter((call) => call.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].url).toContain('/api/v1/automations/workflows/w1');
    expect(deletes[0].url).toContain('hardDelete=true');
    expect(wrapper.find('[data-testid="test-connection-error"]').exists()).toBe(true);
  });

  it('renders the test steps and deletes the workflow once (hard) on success', async () => {
    const calls: { method: string; url: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        calls.push({ method, url });
        if (url.includes('/api/v1/services/databaseServices/s1')) {
          return jsonResponse({
            id: 's1',
            name: 'mydb',
            displayName: 'My DB',
            fullyQualifiedName: 'mysql.mydb',
            serviceType: 'Mysql',
            connection: { config: { type: 'Mysql', hostPort: 'db.example:3306' } },
          });
        }
        if (url.includes('/api/v1/services/testConnectionDefinitions/name/Mysql.testConnectionDefinition')) {
          return jsonResponse({
            name: 'Mysql',
            steps: [{ name: 'CheckAccess', description: 'reach', mandatory: true }],
          });
        }
        if (url.includes('/api/v1/automations/workflows/trigger/')) {
          return jsonResponse({ code: 200, status: 'success', reason: '{}' });
        }
        if (url.includes('/api/v1/automations/workflows/w1')) {
          if (method === 'DELETE') {
            return jsonResponse({});
          }
          return jsonResponse({
            id: 'w1',
            status: 'Successful',
            response: {
              status: 'Successful',
              steps: [
                {
                  name: 'CheckAccess',
                  mandatory: true,
                  passed: true,
                  status: 'Passed',
                  resultSummary: 'connection established',
                },
              ],
            },
          });
        }
        if (url.includes('/api/v1/automations/workflows') && method === 'POST') {
          return jsonResponse({ id: 'w1', status: 'Pending' });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView('connection');
    await wrapper.find('[data-testid="test-service-connection"]').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 3500));
    await flushPromises();
    expect(wrapper.find('[data-testid="test-connection-steps-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('CheckAccess');
    expect(wrapper.text()).toContain('connection established');
    const deletes = calls.filter((call) => call.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].url).toContain('hardDelete=true');
  });
});
