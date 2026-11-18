/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import PipelineDetailView from './PipelineDetailView.vue';

vi.mock('@/features/crud/confirmDelete', () => ({
  confirmDelete: vi.fn(async (options: { onOk?: () => Promise<void> }) => {
    await options.onOk?.();
    return true;
  }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let serviceTypeOverride: string | null = null;
let pipelineTypeOverride: string | null = null;

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
      {
        path: '/settings/services/:tab',
        name: 'settings-services',
        component: { template: '<div>services</div>' },
      },
      {
        path: '/settings/:category',
        name: 'settings-category',
        component: { template: '<div>category</div>' },
      },
    ],
  });
  await router.push('/ingestion/pipelines/p1');
  await router.isReady();
  router.addRoute({
    path: '/ingestion/pipelines/:id/edit',
    name: 'ingestion-pipeline-edit',
    component: { template: '<div>edit</div>' },
    props: true,
  });
  const wrapper = mount(PipelineDetailView, {
    props: { id: 'p1' },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

async function waitForLoaded(wrapper: VueWrapper): Promise<void> {
  await vi.waitFor(
    () => {
      expect(wrapper.find('[data-testid="entity-detail-heading"]').text()).toContain(
        'warehouse-metadata',
      );
    },
    { timeout: 5000 },
  );
}

async function waitForDeleteEnabled(wrapper: VueWrapper): Promise<void> {
  await waitForLoaded(wrapper);
  await vi.waitFor(
    () => {
      expect(wrapper.find('[data-testid="delete-pipeline"]').attributes('disabled')).toBeUndefined();
    },
    { timeout: 5000 },
  );
}

describe('PipelineDetailView', () => {
  beforeEach(() => {
    localStorage.clear();
    serviceTypeOverride = null;
    pipelineTypeOverride = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'DELETE' && url.includes('/ingestionPipelines/p1')) {
          return jsonResponse({});
        }
        if (url.includes('/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
        if (url.includes('/api/v1/permissions/ingestionPipeline/name/')) {
          return jsonResponse({
            resource: 'ingestionPipeline',
            permissions: [
              { operation: 'EditAll', access: 'allow' },
              { operation: 'Delete', access: 'allow' },
              { operation: 'Trigger', access: 'allow' },
              { operation: 'Deploy', access: 'allow' },
              { operation: 'EditIngestionPipelineStatus', access: 'allow' },
            ],
          });
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
            pipelineType: pipelineTypeOverride ?? 'metadata',
            service: { id: 's1', type: serviceTypeOverride ?? 'databaseService', name: 'warehouse' },
            sourceConfig: { config: { type: 'DatabaseMetadata', includeViews: true } },
            airflowConfig: { pausePipeline: true },
            enabled: true,
            deployed: true,
            owners: [{ id: 'u1', type: 'user', name: 'alice', displayName: 'Alice' }],
          });
        }
        if (url.includes('/llmServices/s1')) {
          return jsonResponse({ id: 's1', name: 'warehouse', serviceType: 'OpenAI' });
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

  it('routes Edit to the standalone two-step edit page instead of a modal', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="edit-pipeline"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('ingestion-pipeline-edit');
  });

  it('shows deploy and trigger actions disabled without a permission grant (P1 fail-closed)', async () => {
    serviceTypeOverride = null;
    pipelineTypeOverride = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'DELETE' && url.includes('/ingestionPipelines/p1')) {
          return jsonResponse({});
        }
        if (url.includes('/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
        if (url.includes('/api/v1/permissions/ingestionPipeline/name/')) {
          return jsonResponse({
            resource: 'ingestionPipeline',
            permissions: [
              { operation: 'EditAll', access: 'deny' },
              { operation: 'Trigger', access: 'deny' },
              { operation: 'Deploy', access: 'deny' },
            ],
          });
        }
        if (url.includes('/pipelineStatus')) {
          return jsonResponse({ data: [] });
        }
        if (url.includes('/ingestionPipelines/p1')) {
          return jsonResponse({
            id: 'p1',
            name: 'warehouse-metadata',
            fullyQualifiedName: 'warehouse.warehouse-metadata',
            pipelineType: 'metadata',
            service: { id: 's1', type: 'databaseService', name: 'warehouse' },
            sourceConfig: { config: { type: 'DatabaseMetadata', includeViews: true } },
            airflowConfig: {},
            enabled: true,
            deployed: true,
          });
        }
        if (url.includes('/llmServices/s1')) {
          return jsonResponse({ id: 's1', name: 'warehouse', serviceType: 'OpenAI' });
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
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="deploy-pipeline"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="trigger-pipeline"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="deploy-pipeline"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="trigger-pipeline"]').attributes('disabled')).toBeDefined();
  });

  it('pauses an enabled deployed pipeline through the toggle button, then offers Resume', async () => {
    let toggled = false;
    serviceTypeOverride = null;
    pipelineTypeOverride = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'DELETE' && url.includes('/ingestionPipelines/p1')) {
          return jsonResponse({});
        }
        if (url.includes('/api/v1/permissions/ingestionPipeline/name/')) {
          return jsonResponse({
            resource: 'ingestionPipeline',
            permissions: [{ operation: 'EditIngestionPipelineStatus', access: 'allow' }],
          });
        }
        if (url.includes('/api/v1/services/ingestionPipelines/toggleIngestion/')) {
          toggled = true;
          return jsonResponse({
            id: 'p1',
            name: 'warehouse-metadata',
            fullyQualifiedName: 'warehouse.warehouse-metadata',
            pipelineType: 'metadata',
            enabled: false,
            deployed: true,
          });
        }
        if (url.includes('/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'disabled', reason: 'Pipeline Client Disabled' });
        }
        if (url.includes('/pipelineStatus')) {
          return jsonResponse({ data: [] });
        }
        if (url.includes('/ingestionPipelines/p1')) {
          return jsonResponse({
            id: 'p1',
            name: 'warehouse-metadata',
            fullyQualifiedName: 'warehouse.warehouse-metadata',
            pipelineType: 'metadata',
            service: { id: 's1', type: 'databaseService', name: 'warehouse' },
            sourceConfig: { config: { type: 'DatabaseMetadata', includeViews: true } },
            airflowConfig: {},
            enabled: !toggled,
            deployed: true,
          });
        }
        if (url.includes('/llmServices/s1')) {
          return jsonResponse({ id: 's1', name: 'warehouse', serviceType: 'OpenAI' });
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
    const { wrapper } = await mountView();
    const pauseButton = wrapper.find('[data-testid="pause-button"]');
    expect(pauseButton.exists()).toBe(true);
    expect(pauseButton.text()).toContain('Pause');
    expect(pauseButton.attributes('disabled')).toBeUndefined();
    await pauseButton.trigger('click');
    await flushPromises();
    expect(toggled).toBe(true);
    const urls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/toggleIngestion/p1'))).toBe(true);
    // After the reload the pipeline reads enabled: false, so the button flips to Resume.
    const resumeButton = wrapper.find('[data-testid="resume-button"]');
    expect(resumeButton.exists()).toBe(true);
    expect(resumeButton.text()).toContain('Resume');
  });

  it('keeps the loaded run statuses after Pause so Logs can still tail the active run', async () => {
    // H-3: the toggle endpoint returns fields=OWNERS only, so its
    // response has no pipelineStatuses. Spread-merging the whole response
    // would wipe the loaded statuses and the Logs modal's runId.
    serviceTypeOverride = null;
    pipelineTypeOverride = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'DELETE' && url.includes('/ingestionPipelines/p1')) {
          return jsonResponse({});
        }
        if (url.includes('/api/v1/permissions/ingestionPipeline/name/')) {
          return jsonResponse({
            resource: 'ingestionPipeline',
            permissions: [{ operation: 'EditIngestionPipelineStatus', access: 'allow' }],
          });
        }
        if (url.includes('/api/v1/services/ingestionPipelines/toggleIngestion/')) {
          return jsonResponse({
            id: 'p1',
            name: 'warehouse-metadata',
            fullyQualifiedName: 'warehouse.warehouse-metadata',
            pipelineType: 'metadata',
            enabled: false,
            deployed: true,
          });
        }
        if (url.includes('/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
        if (url.includes('/pipelineStatus')) {
          return jsonResponse({ data: [] });
        }
        if (url.includes('/ingestionPipelines/p1')) {
          return jsonResponse({
            id: 'p1',
            name: 'warehouse-metadata',
            fullyQualifiedName: 'warehouse.warehouse-metadata',
            pipelineType: 'metadata',
            service: { id: 's1', type: 'databaseService', name: 'warehouse' },
            sourceConfig: { config: { type: 'DatabaseMetadata', includeViews: true } },
            airflowConfig: {},
            enabled: true,
            deployed: true,
            pipelineStatuses: [
              { runId: 'r1', pipelineState: 'running', timestamp: 1710000000000 },
            ],
          });
        }
        if (url.includes('/llmServices/s1')) {
          return jsonResponse({ id: 's1', name: 'warehouse', serviceType: 'OpenAI' });
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
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="pause-button"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="resume-button"]').exists()).toBe(true);
    await wrapper.find('[data-testid="logs-pipeline"]').trigger('click');
    await flushPromises();
    const urls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    // The Logs modal still knows the active run's id: the SSE tail starts.
    expect(urls.some((url) => url.includes('/stream/r1'))).toBe(true);
  });

  it('shows catalog status, CLI YAML, and no trigger call', async () => {
    serviceTypeOverride = null;
    pipelineTypeOverride = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'DELETE' && url.includes('/ingestionPipelines/p1')) {
          return jsonResponse({});
        }
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
            pipelineType: pipelineTypeOverride ?? 'metadata',
            service: { id: 's1', type: serviceTypeOverride ?? 'databaseService', name: 'warehouse' },
            sourceConfig: { config: { type: 'DatabaseMetadata', includeViews: true } },
            airflowConfig: { pausePipeline: true },
          });
        }
        if (url.includes('/llmServices/s1')) {
          return jsonResponse({ id: 's1', name: 'warehouse', serviceType: 'OpenAI' });
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
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="entity-detail-shell"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('success');
    expect(wrapper.find('[data-testid="pipeline-cli-yaml"]').text()).toContain('type: postgres');
    expect(wrapper.text()).toContain('Pipeline Client Disabled');
    const urls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/trigger/'))).toBe(false);
    expect(urls.some((url) => url.includes('/deploy/'))).toBe(false);
  });

  it('shows enabled + deployed badges and a Re Deploy label when deployed (P-42/P-43)', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('Active');
    expect(wrapper.text()).toContain('Deployed');
    expect(wrapper.find('[data-testid="deploy-pipeline"]').text()).toContain('Re Deploy');
    expect(wrapper.find('[data-testid="logs-pipeline"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="kill-pipeline"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="refresh-status"]').exists()).toBe(true);
    // P-45: owners row renders the owner's display name.
    expect(wrapper.text()).toContain('Alice');
  });

  it('refreshes only statuses, not the whole pipeline (P-25)', async () => {
    const { wrapper } = await mountView();
    const pipelineGetsBefore = vi
      .mocked(fetch)
      .mock.calls.filter((call) => String(call[0]).includes('/ingestionPipelines/p1')).length;
    await wrapper.find('[data-testid="refresh-status"]').trigger('click');
    await flushPromises();
    const pipelineGetsAfter = vi
      .mocked(fetch)
      .mock.calls.filter((call) => String(call[0]).includes('/ingestionPipelines/p1')).length;
    expect(pipelineGetsAfter).toBe(pipelineGetsBefore);
    const statusGets = vi
      .mocked(fetch)
      .mock.calls.filter((call) => String(call[0]).includes('/pipelineStatus')).length;
    expect(statusGets).toBeGreaterThanOrEqual(2);
  });

  it('shows a status error Alert with retry when the status fetch fails (P-26)', async () => {
    let statusCalls = 0;
    serviceTypeOverride = null;
    pipelineTypeOverride = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'DELETE' && url.includes('/ingestionPipelines/p1')) {
          return jsonResponse({});
        }
        if (url.includes('/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
        if (url.includes('/pipelineStatus')) {
          statusCalls += 1;
          if (statusCalls === 1) {
            return new Response('boom', { status: 500 });
          }
          return jsonResponse({
            data: [{ runId: 'r1', pipelineState: 'success', timestamp: 1710000000000 }],
          });
        }
        if (url.includes('/api/v1/permissions/ingestionPipeline/name/')) {
          return jsonResponse({
            resource: 'ingestionPipeline',
            permissions: [{ operation: 'EditAll', access: 'allow' }],
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
            airflowConfig: {},
            enabled: true,
            deployed: true,
          });
        }
        if (url.includes('/llmServices/s1')) {
          return jsonResponse({ id: 's1', name: 'warehouse', serviceType: 'OpenAI' });
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
    const { wrapper } = await mountView();
    const statusTab = wrapper
      .findAll('.ant-tabs-tab')
      .find((tab) => tab.text().includes('Status'));
    expect(statusTab).toBeDefined();
    await statusTab!.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="pipeline-status-error"]').exists()).toBe(true);
    // Retry reloads statuses only and clears the error.
    const retry = wrapper.find('[data-testid="pipeline-status-error"] button');
    expect(retry.exists()).toBe(true);
    await retry.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="pipeline-status-error"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('success');
  });

  it('opens run details from a status row click (P-03)', async () => {
    const { wrapper } = await mountView();
    const statusTab = wrapper
      .findAll('.ant-tabs-tab')
      .find((tab) => tab.text().includes('Status'));
    expect(statusTab).toBeDefined();
    await statusTab!.trigger('click');
    await flushPromises();
    const row = wrapper.find('[data-testid="pipeline-status-table"] tbody tr');
    expect(row.exists()).toBe(true);
    await row.trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Run status: Success');
  });

  it('copies the CLI YAML to the clipboard (P-48)', async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async (text: string) => { written.push(text); }) },
      configurable: true,
    });
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="pipeline-copy-yaml"]').trigger('click');
    await flushPromises();
    expect(written).toHaveLength(1);
    expect(written[0]).toContain('type: postgres');
  });

  it('links the parent crumb to the kind Pipelines Tab (deleted ingestion-pipelines route)', async () => {
    const { wrapper, router } = await mountView();
    await waitForLoaded(wrapper);
    await vi.waitFor(
      () => {
        expect(wrapper.find('[data-testid="entity-detail-crumb-0"]').exists()).toBe(true);
      },
      { timeout: 5000 },
    );
    await wrapper.get('[data-testid="entity-detail-crumb-0"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('settings-services');
    expect(router.currentRoute.value.params).toEqual({ tab: 'databases' });
    expect(router.currentRoute.value.query).toEqual({ tab: 'pipelines' });
  });

  it('links the parent crumb to the dataObservability Pipelines Tab for a TestSuite pipeline', async () => {
    pipelineTypeOverride = 'TestSuite';
    const { wrapper, router } = await mountView();
    await waitForLoaded(wrapper);
    await vi.waitFor(
      () => {
        expect(wrapper.find('[data-testid="entity-detail-crumb-0"]').exists()).toBe(true);
      },
      { timeout: 5000 },
    );
    await wrapper.get('[data-testid="entity-detail-crumb-0"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('settings-services');
    expect(router.currentRoute.value.params).toEqual({ tab: 'dataObservability' });
    expect(router.currentRoute.value.query).toEqual({ tab: 'pipelines' });
  });

  it('leaves the parent crumb unlinked for an llm pipeline (no list tab, C-2)', async () => {
    serviceTypeOverride = 'llmService';
    const { wrapper } = await mountView();
    await waitForLoaded(wrapper);
    expect(wrapper.find('[data-testid="entity-detail-crumb-0"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="entity-detail-breadcrumb"]').text()).toContain(
      'Ingestion pipelines',
    );
  });

  it('navigates to the kind Pipelines Tab after delete', async () => {
    const { wrapper, router } = await mountView();
    await waitForDeleteEnabled(wrapper);
    await wrapper.get('[data-testid="delete-pipeline"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('settings-services');
    expect(router.currentRoute.value.params).toEqual({ tab: 'databases' });
    expect(router.currentRoute.value.query).toEqual({ tab: 'pipelines' });
  });

  it('navigates to the services overview after deleting an llm pipeline', async () => {
    serviceTypeOverride = 'llmService';
    const { wrapper, router } = await mountView();
    await waitForDeleteEnabled(wrapper);
    await wrapper.get('[data-testid="delete-pipeline"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('settings-category');
    expect(router.currentRoute.value.params).toEqual({ category: 'services' });
  });


});
describe('PipelineDetailView persona tab customization (C-4)', () => {
  const persona = { id: 'p1', name: 'analyst', fullyQualifiedName: 'analyst', displayName: 'Analyst' };

  function stubWithDoc(doc: Record<string, unknown> | null) {
    serviceTypeOverride = null;
    pipelineTypeOverride = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'DELETE' && url.includes('/ingestionPipelines/p1')) {
          return jsonResponse({});
        }
        if (url.includes('/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
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
            pipelineType: pipelineTypeOverride ?? 'metadata',
            service: { id: 's1', type: serviceTypeOverride ?? 'databaseService', name: 'warehouse' },
            sourceConfig: { config: { type: 'DatabaseMetadata', includeViews: true } },
            airflowConfig: { pausePipeline: true },
            enabled: true,
            deployed: true,
            owners: [{ id: 'u1', type: 'user', name: 'alice', displayName: 'Alice' }],
          });
        }
        if (url.includes('/llmServices/s1')) {
          return jsonResponse({ id: 's1', name: 'warehouse', serviceType: 'OpenAI' });
        }
        if (url.includes('/databaseServices/s1')) {
          return jsonResponse({
            id: 's1',
            name: 'warehouse',
            serviceType: 'Postgres',
            connection: { config: { type: 'Postgres', hostPort: 'localhost:5432', database: 'analytics' } },
          });
        }
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: [persona], paging: { total: 1 } });
        }
        if (url.includes('/v1/docStore/name/')) {
          return doc ? jsonResponse(doc) : new Response('not found', { status: 404 });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  }

  function tabLabels(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']): string[] {
    return wrapper.find('.ant-tabs-nav').findAll('.ant-tabs-tab').map((tab) => tab.text().trim());
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  // The ingestion-pipeline surface is overview + runs (status); a
  // customization may rename the overview tab through the
  // `documentation` alias, and preserve mode keeps the runs tab.
  it('renames the overview tab from the persona Pipeline page and keeps the runs tab', async () => {
    stubWithDoc({
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: {
        pages: [
          {
            pageType: 'Pipeline',
            tabs: [{ id: 'documentation', name: 'documentation', displayName: 'Summary' }],
          },
        ],
      },
    });
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(tabLabels(wrapper)).toEqual(['Summary', 'Status']);
    wrapper.unmount();
  });

  it('keeps both tabs when the customization mentions only catalog-Pipeline ids', async () => {
    stubWithDoc({
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: {
        pages: [
          {
            pageType: 'Pipeline',
            tabs: [
              { id: 'tasks', name: 'tasks' },
              { id: 'executions', name: 'executions' },
            ],
          },
        ],
      },
    });
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(tabLabels(wrapper)).toEqual(['Overview', 'Status']);
    wrapper.unmount();
  });
});
