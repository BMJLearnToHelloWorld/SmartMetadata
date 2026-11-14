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
import Antd, { Tooltip } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { createTestI18n } from '@/test/i18n';
import ServiceDetailView from './ServiceDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface FetchCall {
  method: string;
  url: string;
  body?: string;
}

interface MockOptions {
  /** Pipelines the list endpoint returns. */
  pipelines?: Array<Record<string, unknown>>;
  pipelinesTotal?: number;
  /** Resource permission bits; both default to allow. */
  ingestionPipelineCreate?: boolean;
  applicationTrigger?: boolean;
  /** Workflow instances for the AutoPilot running check, or 'error' to fail the fetch. */
  workflowInstances?: Array<Record<string, unknown>> | 'error';
  /** Status for the apps trigger POST. */
  triggerStatus?: number;
  /** Service kind under test; the service URL follows it. */
  kind?: string;
  /** Connection config overrides (supports* flags default to the Postgres set). */
  serviceConfig?: Record<string, unknown>;
}

const DEFAULT_CONFIG = {
  type: 'Postgres',
  hostPort: 'localhost:5432',
  supportsMetadataExtraction: true,
  supportsUsageExtraction: true,
  supportsLineageExtraction: true,
  supportsProfiler: true,
  supportsDBTExtraction: true,
};

const DEFAULT_PIPELINE = {
  id: 'p1',
  name: 'daily',
  fullyQualifiedName: 'pg.warehouse.daily',
  pipelineType: 'metadata',
  enabled: true,
  deployed: true,
  service: { id: 's1', type: 'databaseService', name: 'warehouse' },
};

function permissionBody(resource: string, operations: string[]): Record<string, unknown> {
  return {
    resource,
    permissions: operations.map((operation) => ({ operation, access: 'allow' })),
  };
}

function stubFetch(calls: FetchCall[], options: MockOptions = {}): void {
  const kind = options.kind ?? 'database';
  const servicePath = kind === 'database' ? 'databaseServices' : `${kind}Services`;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ method: init?.method ?? 'GET', url, body: String(init?.body ?? '') });
      if (url.includes(`/api/v1/services/${servicePath}/s1`)) {
        return jsonResponse({
          id: 's1',
          name: 'warehouse',
          displayName: 'Warehouse',
          fullyQualifiedName: 'pg.warehouse',
          serviceType: 'Postgres',
          connection: { config: { ...DEFAULT_CONFIG, ...(options.serviceConfig ?? {}) } },
        });
      }
      // The progress stream URL also contains the ingestionPipelines
      // prefix: answer 503 (fatal, no reconnect loop) before the list branch.
      if (url.includes('/progress/service/')) {
        return new Response('no tracking', { status: 503 });
      }
      if (url.includes('/api/v1/services/ingestionPipelines/status')) {
        return jsonResponse({ code: 200, platform: 'airflow' });
      }
      if (url.includes('/api/v1/services/ingestionPipelines')) {
        const data = options.pipelines ?? [DEFAULT_PIPELINE];
        return jsonResponse({ data, paging: { total: options.pipelinesTotal ?? data.length } });
      }
      if (url.includes('/api/v1/permissions/ingestionPipeline/')) {
        return jsonResponse(
          permissionBody('ingestionPipeline', [
            'Trigger',
            'EditAll',
            'Delete',
            'ViewAll',
            'Deploy',
            'EditIngestionPipelineStatus',
          ]),
        );
      }
      if (url.includes('/api/v1/permissions/ingestionPipeline')) {
        return jsonResponse(
          permissionBody(
            'ingestionPipeline',
            options.ingestionPipelineCreate === false ? [] : ['Create'],
          ),
        );
      }
      if (url.includes('/api/v1/permissions/application')) {
        return jsonResponse(
          permissionBody('application', options.applicationTrigger === false ? [] : ['Trigger']),
        );
      }
      if (url.includes('/api/v1/governance/workflowInstances')) {
        if (options.workflowInstances === 'error') {
          return new Response('boom', { status: 500 });
        }
        const data = options.workflowInstances ?? [];
        return jsonResponse({ data, paging: { total: data.length } });
      }
      if (url.includes('/api/v1/apps/trigger/')) {
        return new Response('', { status: options.triggerStatus ?? 200 });
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

const mounted: Array<{ unmount(): void }> = [];

async function mountView(
  options: { initialTab?: string; kind?: string; id?: string } = {},
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { id: 'u1', name: 'alice', isAdmin: true };
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
  const kind = options.kind ?? 'database';
  await router.push(`/ingestion/services/${kind}/${options.id ?? 's1'}`);
  await router.isReady();
  const wrapper = mount(ServiceDetailView, {
    props: { kind, id: options.id ?? 's1', initialTab: options.initialTab ?? 'agents' },
    attachTo: document.body,
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  mounted.push(wrapper);
  await flushPromises();
  return { wrapper, router };
}

describe('ServiceDetailView', () => {
  const calls: FetchCall[] = [];
  beforeEach(() => {
    calls.length = 0;
    stubFetch(calls);
  });

  afterEach(() => {
    for (const wrapper of mounted.splice(0)) {
      wrapper.unmount();
    }
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('lists the service agents filtered by service FQN with the metadata agentType', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="agent-card-pg.warehouse.daily"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('daily');
    expect(calls.some((call) => call.url.includes('/api/v1/services/ingestionPipelines'))).toBe(true);
    expect(calls.some((call) => call.url.includes('service=pg.warehouse'))).toBe(true);
    expect(calls.some((call) => call.url.includes('agentType=metadata'))).toBe(true);
    // The tab count badge carries the pipelines total on every tab.
    expect(wrapper.find('[data-testid="service-tab-agents-count"]').text()).toBe('1');
    // No statuses recorded: the card pill reports No status, not a stale state.
    expect(wrapper.find('[data-testid="pipeline-status"]').text()).toBe('No status');
    // The pipeline is enabled: no paused badge replaces the pill.
    expect(wrapper.find('[data-testid="paused-pipeline-badge"]').exists()).toBe(false);
  });

  it('offers flag-driven agent kinds in the add-agent menu (P-38, retargeted to D-7)', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="add-new-ingestion-button"]').trigger('click');
    await flushPromises();
    const menu = document.body.querySelector('.ant-dropdown-menu');
    expect(menu).not.toBeNull();
    expect(menu!.textContent).toContain('Add Metadata Agent');
    expect(menu!.textContent).toContain('Add Usage Agent');
    expect(menu!.textContent).toContain('Add Lineage Agent');
    expect(menu!.textContent).toContain('Add Profiler Agent');
    expect(menu!.textContent).toContain('Add Auto Classification Agent');
    expect(menu!.textContent).toContain('Add dbt Agent');
    expect(menu!.textContent).not.toContain('TestSuite');
    const usageItem = document.body.querySelector<HTMLElement>('[data-testid="agent-item-usage"]');
    expect(usageItem).not.toBeNull();
    usageItem!.click();
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('ingestion-service-add-ingestion');
    expect(router.currentRoute.value.params.ingestionType).toBe('usage');
  });

  it('shows the shared card actions in the agent overflow menu (P-38, retargeted to D-4)', async () => {
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="more-actions"]').trigger('click');
    await flushPromises();
    expect(document.querySelector('[data-testid="actions-dropdown"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="pause-button"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="re-deploy-button"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="edit-button"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="delete-button"]')).not.toBeNull();
    // The card variant carries no View item: the card itself is the entry point.
    expect(document.querySelector('[data-testid="row-overflow-view"]')).toBeNull();
    expect(document.querySelector('[data-testid="row-overflow-edit"]')).toBeNull();
  });

  it('shows the empty state when there are no agents (P-38, retargeted to D-4)', async () => {
    stubFetch(calls, { pipelines: [], pipelinesTotal: 0 });
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('No agents set up yet');
    expect(wrapper.find('[data-testid="agent-group-empty-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-new-ingestion-button"]').exists()).toBe(true);
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

  it('renders registry tabs including Agents and the wired versions tab', async () => {
    const { wrapper } = await mountView();
    // Ant Tabs does not forward TabPane testids (Stage 5 lesson), so assert
    // the rendered tab labels plus the force-rendered versions slot content.
    expect(wrapper.text()).toContain('Overview');
    expect(wrapper.text()).toContain('Connection');
    expect(wrapper.text()).toContain('Agents');
    expect(wrapper.text()).not.toContain('Pipelines');
    expect(wrapper.text()).toContain('Versions');
    expect(wrapper.find('[data-testid="service-versions-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="service-versions-empty"]').exists()).toBe(true);
  });

  it('hides the Agents tab from a non-owner non-admin user', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().user = { id: 'u9', name: 'mallory', isAdmin: false };
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/ingestion/services/:kind/:id',
          name: 'ingestion-service',
          component: ServiceDetailView,
          props: true,
        },
      ],
    });
    await router.push('/ingestion/services/database/s1');
    await router.isReady();
    const wrapper = mount(ServiceDetailView, {
      props: { kind: 'database', id: 's1', initialTab: 'overview' },
      attachTo: document.body,
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    mounted.push(wrapper);
    await flushPromises();
    expect(wrapper.text()).not.toContain('Agents');
    expect(wrapper.find('[data-testid="metadata-agents-view"]').exists()).toBe(false);
  });

  it('shows the Trigger AutoPilot button and triggers with the service entity link', async () => {
    const { wrapper } = await mountView();
    const button = wrapper.find('[data-testid="trigger-auto-pilot-application-button"]');
    expect(button.exists()).toBe(true);
    expect(button.text()).toContain('Trigger AutoPilot');
    expect((button.element as HTMLButtonElement).disabled).toBe(false);
    const instancesBefore = calls.filter((call) =>
      call.url.includes('/api/v1/governance/workflowInstances'),
    ).length;
    expect(instancesBefore).toBe(1);
    await button.trigger('click');
    await flushPromises();
    const triggerCalls = calls.filter((call) => call.url.includes('/api/v1/apps/trigger/'));
    expect(triggerCalls).toHaveLength(1);
    expect(triggerCalls[0].method).toBe('POST');
    expect(triggerCalls[0].url).toContain('/api/v1/apps/trigger/AutoPilotApplication');
    expect(JSON.parse(triggerCalls[0].body ?? '{}')).toEqual({
      entityLink: '<#E::databaseService::pg.warehouse>',
    });
    // A successful trigger refetches the instance states.
    expect(
      calls.filter((call) => call.url.includes('/api/v1/governance/workflowInstances')).length,
    ).toBe(2);
  });

  it('disables the trigger button while an AutoPilot run is in flight', async () => {
    stubFetch(calls, {
      workflowInstances: [{ id: 'i1', status: 'RUNNING', startedAt: 1700000000000 }],
    });
    const { wrapper } = await mountView();
    const button = wrapper.find('[data-testid="trigger-auto-pilot-application-button"]');
    expect(button.exists()).toBe(true);
    expect((button.element as HTMLButtonElement).disabled).toBe(true);
    const tooltips = wrapper.findAllComponents(Tooltip);
    expect(
      tooltips.some((tooltip) =>
        String(tooltip.props('title') ?? '').includes('already running'),
      ),
    ).toBe(true);
  });

  it('hides the trigger button when the APPLICATION Trigger bit is denied', async () => {
    stubFetch(calls, { applicationTrigger: false });
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="trigger-auto-pilot-application-button"]').exists()).toBe(false);
  });

  it('hides the trigger button for security services', async () => {
    stubFetch(calls, { kind: 'security' });
    const { wrapper } = await mountView({ kind: 'security' });
    expect(wrapper.find('[data-testid="trigger-auto-pilot-application-button"]').exists()).toBe(false);
  });

  it('keeps the trigger button enabled when the instance fetch fails (fail-open)', async () => {
    stubFetch(calls, { workflowInstances: 'error' });
    const { wrapper } = await mountView();
    const button = wrapper.find('[data-testid="trigger-auto-pilot-application-button"]');
    expect(button.exists()).toBe(true);
    expect((button.element as HTMLButtonElement).disabled).toBe(false);
  });

  it('survives a failed trigger without trapping the button in a loading state', async () => {
    stubFetch(calls, { triggerStatus: 500 });
    const { wrapper } = await mountView();
    const button = wrapper.find('[data-testid="trigger-auto-pilot-application-button"]');
    await button.trigger('click');
    await flushPromises();
    expect((button.element as HTMLButtonElement).disabled).toBe(false);
    expect(calls.some((call) => call.url.includes('/api/v1/apps/trigger/'))).toBe(true);
  });

  it('deletes the test-connection workflow exactly once (hard) when triggering fails', async () => {
    // ADR:2026-11-11-test-connection-workflow-hard-delete-cleanup — the
    // trigger catch deletes the workflow and clears the id, so the outer
    // catch must not delete it a second time; the delete is hard so the
    // fixed `<Type>.testConnection` name is freed for the next run.
    const localCalls: { method: string; url: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        localCalls.push({ method, url });
        if (url.includes('/progress/service/')) {
          return new Response('no tracking', { status: 503 });
        }
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
    const { wrapper } = await mountView({ initialTab: 'connection' });
    await wrapper.find('[data-testid="test-service-connection"]').trigger('click');
    await flushPromises();
    const deletes = localCalls.filter((call) => call.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].url).toContain('/api/v1/automations/workflows/w1');
    expect(deletes[0].url).toContain('hardDelete=true');
    expect(wrapper.find('[data-testid="test-connection-error"]').exists()).toBe(true);
  });

  it('renders the test steps and deletes the workflow once (hard) on success', async () => {
    const localCalls: { method: string; url: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        localCalls.push({ method, url });
        if (url.includes('/progress/service/')) {
          return new Response('no tracking', { status: 503 });
        }
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
    const { wrapper } = await mountView({ initialTab: 'connection' });
    await wrapper.find('[data-testid="test-service-connection"]').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 3500));
    await flushPromises();
    expect(wrapper.find('[data-testid="test-connection-steps-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('CheckAccess');
    expect(wrapper.text()).toContain('connection established');
    const deletes = localCalls.filter((call) => call.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].url).toContain('hardDelete=true');
  });
});
