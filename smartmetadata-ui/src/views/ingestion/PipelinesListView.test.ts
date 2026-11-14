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
import Antd, { message, Select } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { VNode } from 'vue';
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

/**
 * The list always mounts the (closed) Logs and Kill modals, and antd
 * renders their hidden footers too — an unscoped
 * `.ant-modal-footer .ant-btn-primary` query hits Kill's confirm first.
 * Scope the click to the create modal by its title.
 */
function clickCreateModalOk(): void {
  const createModal = [...document.body.querySelectorAll('.ant-modal')].find((modal) =>
    modal.querySelector('.ant-modal-title')?.textContent?.includes('Create ingestion pipeline'),
  );
  expect(createModal).not.toBeUndefined();
  const ok = createModal!.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement | null;
  expect(ok).not.toBeNull();
  ok!.click();
}

describe('PipelinesListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // The orchestrator probe must answer before the list branch: the
        // list URL prefix also matches /status, and an unmapped probe
        // would read as "unavailable" and disable every action.
        if (url.includes('/api/v1/services/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
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
    // Wiping body.innerHTML orphans antd's global message holder (later
    // message.* calls render into the detached container); destroy it
    // first so the next test gets a fresh holder.
    message.destroy();
    document.body.innerHTML = '';
  });

  it('renders pipelines from GET /v1/services/ingestionPipelines', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('warehouse-metadata');
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
        if (url.includes('/api/v1/services/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
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

  it('shows pipelineType select with the flag-driven kinds of the chosen service (D-7)', async () => {
    // The list record carries the stored connection config, so the
    // create modal derives its kinds from the supports* flags — no
    // static per-service table, and never TestSuite.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/services/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/services/databaseServices')) {
          return jsonResponse({
            data: [
              {
                id: 's1',
                name: 'warehouse',
                serviceType: 'Postgres',
                connection: {
                  config: {
                    type: 'Postgres',
                    supportsMetadataExtraction: true,
                    supportsUsageExtraction: true,
                    supportsLineageExtraction: true,
                    supportsProfiler: true,
                    supportsDBTExtraction: true,
                  },
                },
              },
            ],
          });
        }
        if (
          url.includes('/api/v1/services/messagingServices') ||
          url.includes('/api/v1/services/dashboardServices') ||
          url.includes('/api/v1/services/storageServices')
        ) {
          return jsonResponse({ data: [] });
        }
        if (url.includes('/api/v1/permissions/ingestionPipeline')) {
          return jsonResponse({
            resource: 'ingestionPipeline',
            permissions: [{ operation: 'Create', access: 'allow' }],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="create-pipeline"]').trigger('click');
    await flushPromises();
    // Ant Modal teleports; query document.body after attachTo mount.
    const typeSelect = document.body.querySelector('[data-testid="create-pipeline-type"]');
    expect(typeSelect).not.toBeNull();
    const nameInput = document.body.querySelector('[data-testid="create-pipeline-name"]');
    expect(nameInput).not.toBeNull();

    // Choose the warehouse service: the type options follow its flags.
    const selects = wrapper.findAllComponents(Select);
    const serviceSelect = selects.find(
      (component) => component.attributes('data-testid') === 'create-pipeline-service',
    );
    expect(serviceSelect).not.toBeUndefined();
    await serviceSelect!.vm.$emit('update:value', 's1');
    await flushPromises();
    // The type options are slot content (the parent's tree), so read
    // them through the Select's default slot: the six flag-driven
    // kinds, in pin order, with no TestSuite.
    const typeSelectComponent = wrapper
      .findAllComponents(Select)
      .find((component) => component.attributes('data-testid') === 'create-pipeline-type');
    expect(typeSelectComponent).not.toBeUndefined();
    // The slot returns one fragment VNode wrapping the v-for options.
    const collectValues = (vnodes: VNode[]): unknown[] => {
      const values: unknown[] = [];
      for (const vnode of vnodes) {
        if (Array.isArray(vnode.children)) {
          values.push(...collectValues(vnode.children as VNode[]));
        } else if (vnode.props && 'value' in vnode.props) {
          values.push((vnode.props as Record<string, unknown>).value);
        }
      }
      return values;
    };
    const values = collectValues(typeSelectComponent!.vm.$slots.default?.() ?? []);
    expect(values).toEqual(['metadata', 'usage', 'lineage', 'profiler', 'autoClassification', 'dbt']);
  });

  it('creates a pipeline without pausePipeline (born unpaused)', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/services/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines/deploy/')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines') && init?.method === 'POST') {
          bodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
          return jsonResponse({ id: 'p9', name: 'warehouse-metadata', pipelineType: 'metadata' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/services/databaseServices')) {
          return jsonResponse({ data: [{ id: 's1', name: 'warehouse', serviceType: 'Postgres' }] });
        }
        if (
          url.includes('/api/v1/services/messagingServices') ||
          url.includes('/api/v1/services/dashboardServices') ||
          url.includes('/api/v1/services/storageServices')
        ) {
          return jsonResponse({ data: [] });
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
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="create-pipeline"]').trigger('click');
    await flushPromises();
    const nameInput = document.body.querySelector(
      '[data-testid="create-pipeline-name"]',
    ) as HTMLInputElement | null;
    expect(nameInput).not.toBeNull();
    nameInput!.value = 'warehouse-metadata';
    nameInput!.dispatchEvent(new Event('input', { bubbles: true }));
    // Ant Select opens its dropdown on mousedown (rc-select), not on
    // click, and the option is likewise selected on mousedown. The
    // handler lives on the inner selector, so the event must start
    // there (a mousedown on the outer .ant-select never reaches it).
    const serviceSelect = document.body.querySelector(
      '[data-testid="create-pipeline-service"] .ant-select-selector',
    ) as HTMLElement;
    expect(serviceSelect).not.toBeNull();
    serviceSelect.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushPromises();
    const serviceOption = [...document.body.querySelectorAll('.ant-select-item-option')].find((el) =>
      el.textContent?.includes('warehouse'),
    ) as HTMLElement | undefined;
    expect(serviceOption).not.toBeUndefined();
    // vc-select selects an option on click (not mousedown); the
    // dropdown itself opens on mousedown on the inner selector.
    serviceOption!.click();
    await flushPromises();
    const scheduleInput = document.body.querySelector(
      'input[placeholder="0 0 * * *"]',
    ) as HTMLInputElement | null;
    expect(scheduleInput).not.toBeNull();
    scheduleInput!.value = '0 0 * * *';
    scheduleInput!.dispatchEvent(new Event('input', { bubbles: true }));
    clickCreateModalOk();
    await flushPromises();
    expect(bodies).toHaveLength(1);
    const airflowConfig = bodies[0]!['airflowConfig'] as Record<string, unknown>;
    // Born unpaused (ADR:2026-11-11-ingestion-pipeline-born-unpaused):
    // the create payload omits pausePipeline; the spec default (false) applies.
    expect('pausePipeline' in airflowConfig).toBe(false);
    expect(airflowConfig['scheduleInterval']).toBe('0 0 * * *');
  });

  it('pauses a pipeline from the row actions, then offers Resume', async () => {
    let toggled = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/services/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines/toggleIngestion/')) {
          toggled = true;
          return jsonResponse({
            id: 'p1',
            name: 'warehouse-metadata',
            pipelineType: 'metadata',
            enabled: false,
            deployed: true,
          });
        }
        if (url.includes('/api/v1/services/ingestionPipelines')) {
          return jsonResponse({
            data: [
              {
                id: 'p1',
                name: 'warehouse-metadata',
                fullyQualifiedName: 'warehouse.warehouse-metadata',
                pipelineType: 'metadata',
                service: { id: 's1', type: 'databaseService', name: 'warehouse' },
                enabled: !toggled,
                deployed: true,
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/services/databaseServices')) {
          return jsonResponse({ data: [{ id: 's1', name: 'warehouse', serviceType: 'Postgres' }] });
        }
        if (
          url.includes('/api/v1/services/messagingServices') ||
          url.includes('/api/v1/services/dashboardServices') ||
          url.includes('/api/v1/services/storageServices')
        ) {
          return jsonResponse({ data: [] });
        }
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
            permissions: [{ operation: 'Create', access: 'allow' }],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="row-overflow-p1"]').trigger('click');
    await flushPromises();
    // The per-pipeline permission fetch is fire-and-forget in load(), so
    // wait for the grant to land instead of assuming one flush is enough.
    await vi.waitFor(() => {
      const item = document.querySelector('[data-testid="pause-button"]');
      expect(item).not.toBeNull();
      expect(item!.className).not.toContain('disabled');
    });
    const pauseItem = document.querySelector('[data-testid="pause-button"]') as HTMLElement | null;
    expect(pauseItem).not.toBeNull();
    pauseItem!.click();
    await flushPromises();
    expect(toggled).toBe(true);
    const urls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/toggleIngestion/p1'))).toBe(true);
    // The toggle re-fetches the list 500ms later (C-01); only after that
    // does the row read enabled: false and offer Resume.
    await new Promise((resolve) => setTimeout(resolve, 600));
    await flushPromises();
    await wrapper.get('[data-testid="row-overflow-p1"]').trigger('click');
    await flushPromises();
    expect(document.querySelector('[data-testid="resume-button"]')).not.toBeNull();
  });

  it('renders Count / Schedule / Recent Runs / Status / Description columns (P-23)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/services/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines')) {
          return jsonResponse({
            data: [
              {
                id: 'p1',
                name: 'warehouse-metadata',
                fullyQualifiedName: 'warehouse.warehouse-metadata',
                pipelineType: 'metadata',
                service: { id: 's1', type: 'databaseService', name: 'warehouse' },
                enabled: true,
                deployed: true,
                description: 'Nightly warehouse load',
                airflowConfig: { scheduleInterval: '0 0 * * *' },
                pipelineStatuses: [
                  {
                    runId: 'r1',
                    pipelineState: 'success',
                    timestamp: 1710000000000,
                    startDate: 1710000000000,
                    endDate: 1710000060000,
                    status: [
                      {
                        name: 'ingest',
                        records: 10,
                        updated_records: 2,
                        filtered: 1,
                        warnings: 3,
                        errors: 1,
                        failures: [],
                      },
                    ],
                  },
                ],
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/permissions/ingestionPipeline')) {
          return jsonResponse({
            resource: 'ingestionPipeline',
            permissions: [{ operation: 'Create', access: 'allow' }],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    // Count tiles: success = records + updated_records (12), failed = errors (1), warning = warnings (3).
    expect(wrapper.text()).toContain('Success 12');
    expect(wrapper.text()).toContain('Failed 1');
    expect(wrapper.text()).toContain('Warning 3');
    expect(wrapper.text()).toContain('Nightly warehouse load');
    expect(wrapper.text()).toContain('Active');
    expect(wrapper.find('[data-testid="pipeline-status-r1"]').exists()).toBe(true);
    // Schedule: cronstrue loads lazily, so wait for the human description.
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('At 12:00 AM');
    });
  });

  it('opens run details from a recent-run badge (P-03)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/services/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines')) {
          return jsonResponse({
            data: [
              {
                id: 'p1',
                name: 'warehouse-metadata',
                fullyQualifiedName: 'warehouse.warehouse-metadata',
                pipelineType: 'metadata',
                service: { id: 's1', type: 'databaseService', name: 'warehouse' },
                pipelineStatuses: [
                  {
                    runId: 'r1',
                    pipelineState: 'success',
                    timestamp: 1710000000000,
                    status: [{ name: 'ingest', records: 10 }],
                  },
                ],
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/permissions/ingestionPipeline')) {
          return jsonResponse({
            resource: 'ingestionPipeline',
            permissions: [{ operation: 'Create', access: 'allow' }],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="pipeline-status-r1"]').trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Run status: Success');
    expect(document.body.textContent).toContain('ingest');
  });

  it('writes ?sortOrder= when the name column is sorted (P-28)', async () => {
    const { wrapper, router } = await mountView();
    const nameHeader = wrapper.find('.ant-table-column-sorters');
    expect(nameHeader.exists()).toBe(true);
    await nameHeader.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.sortOrder).toBe('asc');
    const urls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('sortField=displayName') && url.includes('sortOrder=asc'))).toBe(true);
  });

  it('passes the type filter to the list request (P-28)', async () => {
    const { wrapper } = await mountView();
    const typeSelect = wrapper.find('[data-testid="pipeline-type-filter"] .ant-select-selector');
    expect(typeSelect.exists()).toBe(true);
    typeSelect.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushPromises();
    const option = [...document.body.querySelectorAll('.ant-select-item-option')].find((el) =>
      el.textContent?.includes('Metadata'),
    ) as HTMLElement | undefined;
    expect(option).not.toBeUndefined();
    option!.click();
    await flushPromises();
    const urls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('pipelineType=metadata'))).toBe(true);
  });

  it('changes the page size (P-28)', async () => {
    const { wrapper } = await mountView();
    const sizeSelect = wrapper.find('[data-testid="pipeline-page-size"] .ant-select-selector');
    expect(sizeSelect.exists()).toBe(true);
    sizeSelect.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushPromises();
    const option = [...document.body.querySelectorAll('.ant-select-item-option')].find((el) =>
      el.textContent?.trim() === '50',
    ) as HTMLElement | undefined;
    expect(option).not.toBeUndefined();
    option!.click();
    await flushPromises();
    const urls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('limit=50'))).toBe(true);
  });

  it('shows the orchestrator banner and disables create when the platform is disabled (P-24)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/services/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'disabled', reason: 'Pipeline Client Disabled' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/permissions/ingestionPipeline')) {
          return jsonResponse({
            resource: 'ingestionPipeline',
            permissions: [{ operation: 'Create', access: 'allow' }],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="pipeline-orchestrator-banner"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pipeline-orchestrator-banner"]').text()).toContain(
      'pipeline service is disabled',
    );
    expect(wrapper.find('[data-testid="create-pipeline"]').attributes('disabled')).toBeDefined();
  });

  it('filters by name with highlight (P-36)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/services/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines')) {
          return jsonResponse({
            data: [
              { id: 'p1', name: 'warehouse-metadata', pipelineType: 'metadata' },
              { id: 'p2', name: 'orders-usage', pipelineType: 'usage' },
            ],
            paging: { total: 2 },
          });
        }
        if (url.includes('/api/v1/permissions/ingestionPipeline')) {
          return jsonResponse({
            resource: 'ingestionPipeline',
            permissions: [{ operation: 'Create', access: 'allow' }],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    const search = wrapper.find('[data-testid="entity-list-search"]');
    expect(search.exists()).toBe(true);
    await search.setValue('warehouse');
    await flushPromises();
    expect(wrapper.text()).toContain('warehouse-metadata');
    expect(wrapper.text()).not.toContain('orders-usage');
    expect(wrapper.find('mark').exists()).toBe(true);
  });

  it('reports a disabled deploy after create as an error, never a bare created toast (P-30)', async () => {
    const called: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        called.push(url);
        if (url.includes('/api/v1/services/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines/deploy/')) {
          return jsonResponse({ code: 200, platform: 'airflow', reason: 'Pipeline Client Disabled' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines') && init?.method === 'POST') {
          return jsonResponse({ id: 'p9', name: 'warehouse-metadata', pipelineType: 'metadata' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/services/databaseServices')) {
          return jsonResponse({ data: [{ id: 's1', name: 'warehouse', serviceType: 'Postgres' }] });
        }
        if (
          url.includes('/api/v1/services/messagingServices') ||
          url.includes('/api/v1/services/dashboardServices') ||
          url.includes('/api/v1/services/storageServices')
        ) {
          return jsonResponse({ data: [] });
        }
        if (url.includes('/api/v1/permissions/ingestionPipeline')) {
          return jsonResponse({
            resource: 'ingestionPipeline',
            permissions: [
              { operation: 'Create', access: 'allow' },
              { operation: 'EditAll', access: 'allow' },
            ],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="create-pipeline"]').trigger('click');
    await flushPromises();
    const nameInput = document.body.querySelector(
      '[data-testid="create-pipeline-name"]',
    ) as HTMLInputElement | null;
    nameInput!.value = 'warehouse-metadata';
    nameInput!.dispatchEvent(new Event('input', { bubbles: true }));
    const serviceSelect = document.body.querySelector(
      '[data-testid="create-pipeline-service"] .ant-select-selector',
    ) as HTMLElement;
    serviceSelect.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushPromises();
    const serviceOption = [...document.body.querySelectorAll('.ant-select-item-option')].find((el) =>
      el.textContent?.includes('warehouse'),
    ) as HTMLElement | undefined;
    serviceOption!.click();
    await flushPromises();
    clickCreateModalOk();
    await flushPromises();
    expect(called.some((url) => url.includes('/deploy/p9'))).toBe(true);
    expect(document.body.textContent).toContain('Pipeline created, but the deploy did not succeed');
  });

  it('reports a deploy throw after create as a deploy failure, not a create failure (H-5)', async () => {
    const called: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        called.push(url);
        if (url.includes('/api/v1/services/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines/deploy/')) {
          throw new Error('deploy 500');
        }
        if (url.includes('/api/v1/services/ingestionPipelines') && init?.method === 'POST') {
          return jsonResponse({ id: 'p9', name: 'warehouse-metadata', pipelineType: 'metadata' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/services/databaseServices')) {
          return jsonResponse({ data: [{ id: 's1', name: 'warehouse', serviceType: 'Postgres' }] });
        }
        if (
          url.includes('/api/v1/services/messagingServices') ||
          url.includes('/api/v1/services/dashboardServices') ||
          url.includes('/api/v1/services/storageServices')
        ) {
          return jsonResponse({ data: [] });
        }
        if (url.includes('/api/v1/permissions/ingestionPipeline')) {
          return jsonResponse({
            resource: 'ingestionPipeline',
            permissions: [
              { operation: 'Create', access: 'allow' },
              { operation: 'EditAll', access: 'allow' },
            ],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="create-pipeline"]').trigger('click');
    await flushPromises();
    const nameInput = document.body.querySelector(
      '[data-testid="create-pipeline-name"]',
    ) as HTMLInputElement | null;
    nameInput!.value = 'warehouse-metadata';
    nameInput!.dispatchEvent(new Event('input', { bubbles: true }));
    const serviceSelect = document.body.querySelector(
      '[data-testid="create-pipeline-service"] .ant-select-selector',
    ) as HTMLElement;
    serviceSelect.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushPromises();
    const serviceOption = [...document.body.querySelectorAll('.ant-select-item-option')].find((el) =>
      el.textContent?.includes('warehouse'),
    ) as HTMLElement | undefined;
    serviceOption!.click();
    await flushPromises();
    clickCreateModalOk();
    await flushPromises();
    expect(called.some((url) => url.includes('/deploy/p9'))).toBe(true);
    expect(document.body.textContent).toContain('Pipeline created, but the deploy did not succeed');
    expect(document.body.textContent).not.toContain('Create failed');
    // The list reloads after the deploy outcome, so the created pipeline
    // stays visible instead of the modal hanging on a create failure.
    const isListUrl = (url: string): boolean =>
      url.includes('/api/v1/services/ingestionPipelines') &&
      !url.includes('/deploy/') &&
      !url.includes('/status');
    const listCallsBefore = called.filter(isListUrl).length;
    await new Promise((resolve) => setTimeout(resolve, 600));
    await flushPromises();
    expect(called.filter(isListUrl).length).toBeGreaterThan(listCallsBefore);
  });

  it('bulk deploy shows a summary line for rows not actually deployed (P-29)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/services/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines/bulk/deploy')) {
          expect(init?.method).toBe('POST');
          return jsonResponse([{ code: 500, platform: 'airflow', reason: 'deploy failed' }]);
        }
        if (url.includes('/api/v1/services/ingestionPipelines')) {
          return jsonResponse({
            data: [
              {
                id: 'p1',
                name: 'warehouse-metadata',
                fullyQualifiedName: 'warehouse.warehouse-metadata',
                pipelineType: 'metadata',
                service: { id: 's1', type: 'databaseService', name: 'warehouse' },
                enabled: true,
                deployed: false,
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/permissions/ingestionPipeline/name/')) {
          return jsonResponse({
            resource: 'ingestionPipeline',
            permissions: [
              { operation: 'EditAll', access: 'allow' },
              { operation: 'Deploy', access: 'allow' },
            ],
          });
        }
        if (url.includes('/api/v1/permissions/ingestionPipeline')) {
          return jsonResponse({
            resource: 'ingestionPipeline',
            permissions: [{ operation: 'Create', access: 'allow' }],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    // Select the row via the table checkbox, then bulk deploy.
    const checkbox = wrapper.find('.ant-table-row .ant-checkbox-input');
    expect(checkbox.exists()).toBe(true);
    await checkbox.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="bulk-deploy-pipelines"]').attributes('disabled')).toBeUndefined();
    await wrapper.find('[data-testid="bulk-deploy-pipelines"]').trigger('click');
    await flushPromises();
    // The results modal teleports to body: wrapper.find cannot see it.
    const summary = document.body.querySelector('[data-testid="bulk-deploy-summary"]');
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toContain('1');
  });
});
