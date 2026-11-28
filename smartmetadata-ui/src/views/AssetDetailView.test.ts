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
import { nextTick } from 'vue';
import { createTestI18n } from '@/test/i18n';
import { DetailWidgetKeys } from '@/catalog/detailWidgetDispatch';
import GenericTab from '@/components/customize/GenericTab.vue';
import LineageCanvas from '@/components/lineage/LineageCanvas.vue';
import { compactWidgetLayoutVertical, resolveWidgetLayout } from '@/composables/customizeWidgetLayout';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { useAuthStore } from '@/stores/auth';
import AssetDetailView from './AssetDetailView.vue';

// The description cell's read-only editor applies its content on a 0ms
// timer (SmRichTextEditor content effect), so mounts wait a real tick
// before asserting rendered description text.
async function tick(ms = 10) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await nextTick();
}

vi.mock('@vue-flow/core', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/core']());
vi.mock('@vue-flow/background', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/background']());
vi.mock('@vue-flow/controls', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/controls']());
vi.mock('@vue-flow/minimap', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/minimap']());

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastMatchingFetch(predicate: (url: string, init?: RequestInit) => boolean) {
  const mock = vi.mocked(fetch);
  const match = [...mock.mock.calls].reverse().find((call) => predicate(String(call[0]), call[1]));
  if (!match) {
    throw new Error('no matching fetch');
  }
  return { url: String(match[0]), init: match[1] };
}

async function mountView(entityType = 'table', fqn = 'svc.db.schema.orders', query: Record<string, string> = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/search', name: 'search', component: { template: '<div>search</div>' } },
      { path: '/:entityType/:fqn/:tab/:subTab', name: 'asset-subtab', component: AssetDetailView, props: true },
      { path: '/:entityType/:fqn/:tab', name: 'asset-tab', component: AssetDetailView, props: true },
      { path: '/:entityType/:fqn', name: 'asset', component: AssetDetailView, props: true },
      { path: '/lineage/:entityType/:fqn', name: 'lineage', component: { template: '<div>lineage</div>' } },
      { path: '/quality/test-cases/:id', name: 'quality-test-case', component: { template: '<div>tc</div>' } },
      {
        path: '/quality/test-definitions/:id',
        name: 'quality-test-definition',
        component: { template: '<div>td</div>' },
      },
    ],
  });
  const tab = query.tab;
  const subTab = query.subTab;
  const restQuery = { ...query };
  delete restQuery.tab;
  delete restQuery.subTab;
  const detailPath = subTab && tab
    ? `/${entityType}/${fqn}/${tab}/${subTab}`
    : tab
      ? `/${entityType}/${fqn}/${tab}`
      : `/${entityType}/${fqn}`;
  await router.push({ path: detailPath, query: restQuery });
  await router.isReady();
  const wrapper = mount(AssetDetailView, {
    props: { entityType, fqn },
    attachTo: document.body,
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  await tick();
  return { wrapper, router };
}

describe('AssetDetailView governance', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        // D-4: the view derives description + custom-properties flags
        // from this fetch; the stub models an authorized viewer so the
        // panels render (a denied viewer sees the placeholder instead).
        if (url.includes('/api/v1/permissions/table/name/')) {
          return jsonResponse({
            resource: 'table',
            permissions: [
              { operation: 'ViewBasic', access: 'allow' },
              { operation: 'ViewCustomFields', access: 'allow' },
              { operation: 'EditDescription', access: 'allow' },
              { operation: 'EditCustomFields', access: 'allow' },
            ],
          });
        }
        if (url.includes('/api/v1/tables/name/') && url.includes('/columns')) {
          // D-2 batch 3: the schema table self-fetches its columns
          // (pin TableSchema), so the stub serves the column-list
          // endpoints from the same payload columns as the detail GET.
          return jsonResponse({
            data: [{ name: 'id', dataType: 'BIGINT' }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/tables/name/')) {
          return jsonResponse({
            id: 'tbl-1',
            name: 'orders',
            fullyQualifiedName: 'svc.db.schema.orders',
            description: 'Orders fact',
            owners: [{ id: 'u1', name: 'alice', type: 'user' }],
            tags: [{ tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType: 'Generated' }],
            domains: [{ id: 'd1', name: 'Marketing', type: 'domain' }],
            columns: [{ name: 'id', dataType: 'BIGINT' }],
            extension: { retentionDays: 7 },
            tableType: 'Regular',
            // D-1: the table widgets read these three fields.
            tablePartition: {
              columns: [
                { columnName: 'ds', intervalType: 'TIME-UNIT' },
                { columnName: 'region' },
              ],
            },
            tableConstraints: [
              { constraintType: 'PRIMARY_KEY', columns: ['id'] },
              {
                constraintType: 'FOREIGN_KEY',
                columns: ['customer_id'],
                referredColumns: ['svc.db.schema.customers.id'],
              },
            ],
            aliases: ['svc.db.schema.orders_alias'],
            serviceType: 'BigQuery',
            service: { name: 'bq', displayName: 'BigQuery Prod' },
            database: { name: 'analytics' },
            databaseSchema: { name: 'marts' },
          });
        }
        if (url.includes('/api/v1/lineage/getLineage')) {
          return jsonResponse({
            nodes: {
              'svc.db.schema.orders': {
                entity: {
                  id: 'tbl-1',
                  type: 'table',
                  name: 'orders',
                  fullyQualifiedName: 'svc.db.schema.orders',
                },
                nodeDepth: 0,
              },
              'svc.db.schema.raw_orders': {
                entity: {
                  id: 'up-1',
                  type: 'table',
                  name: 'raw_orders',
                  fullyQualifiedName: 'svc.db.schema.raw_orders',
                },
                nodeDepth: 1,
              },
            },
            upstreamEdges: {
              e1: {
                fromEntity: { id: 'up-1', fullyQualifiedName: 'svc.db.schema.raw_orders', type: 'table' },
                toEntity: { id: 'tbl-1', fullyQualifiedName: 'svc.db.schema.orders', type: 'table' },
                columns: [],
              },
            },
            downstreamEdges: {},
          });
        }
        if (url.includes('/api/v1/lineage/')) {
          return jsonResponse({
            entity: {
              id: 'tbl-1',
              type: 'table',
              name: 'orders',
              fullyQualifiedName: 'svc.db.schema.orders',
            },
            nodes: [
              {
                id: 'up-1',
                type: 'table',
                name: 'raw_orders',
                fullyQualifiedName: 'svc.db.schema.raw_orders',
              },
            ],
            upstreamEdges: [{ fromEntity: 'up-1', toEntity: 'tbl-1' }],
            downstreamEdges: [],
          });
        }
        if (url.includes('/api/v1/activity/entity/table/name/')) {
          return jsonResponse({
            data: [{ id: 'act-1', eventType: 'DescriptionUpdated', summary: 'Updated description' }],
          });
        }
        if (url.includes('/api/v1/conversations')) {
          return jsonResponse({ data: [{ id: 'c1', message: 'please review', about: '<#E::table::svc.db.schema.orders>' }] });
        }
        if (url.includes('/api/v1/metadata/types/name/table/customProperties')) {
          return jsonResponse([
            { name: 'retentionDays', displayName: 'Retention days', propertyType: { name: 'integer' } },
          ]);
        }
        if (url.includes('/api/v1/users')) {
          return jsonResponse({ data: [{ id: 'u1', name: 'alice', displayName: 'Alice' }] });
        }
        if (url.includes('/api/v1/teams')) {
          return jsonResponse({ data: [] });
        }
        if (url.includes('/api/v1/classifications')) {
          return jsonResponse({ data: [{ id: 'c1', name: 'PII', fullyQualifiedName: 'PII' }] });
        }
        if (url.includes('/api/v1/tags')) {
          return jsonResponse({
            data: [{ id: 'tg1', name: 'Sensitive', fullyQualifiedName: 'PII.Sensitive' }],
          });
        }
        if (url.includes('/api/v1/glossaries')) {
          return jsonResponse({ data: [] });
        }
        if (url.includes('/api/v1/glossaryTerms')) {
          return jsonResponse({ data: [] });
        }
        if (url.includes('/api/v1/domains')) {
          return jsonResponse({ data: [{ id: 'd1', name: 'Marketing' }] });
        }
        if (url.includes('/api/v1/dataQuality/testCases')) {
          return jsonResponse({
            data: [
              {
                id: 'tc1',
                name: 'row_count',
                testDefinition: { id: 'td1', name: 'tableRowCountToBeBetween' },
                testCaseResult: { testCaseStatus: 'Failed' },
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/sampleData')) {
          return jsonResponse({ sampleData: { columns: ['id'], rows: [[1]] } });
        }
        if (url.includes('/tableProfile/latest')) {
          return jsonResponse({
            profile: { rowCount: 1, columnCount: 1 },
            columns: [{ name: 'id', profile: { nullCount: 0 } }],
          });
        }
        if (url.includes('/tableProfile')) {
          return jsonResponse({
            data: [
              { timestamp: Date.UTC(2026, 0, 1), rowCount: 8 },
              { timestamp: Date.UTC(2026, 0, 2), rowCount: 11 },
            ],
          });
        }
        if (url.includes('/api/v1/usage/')) {
          return jsonResponse({
            usage: [{ date: '2026-01-02', dailyStats: { count: 4 } }],
          });
        }
        if (init?.method === 'PATCH' && url.includes('/api/v1/tables/tbl-1')) {
          return jsonResponse({});
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  // R8: 20s timeout — this heavy view mount exceeds the 5s default under
  // full-suite parallel load (jsdom creation dominates); it passes
  // isolated and the timeout covers scheduling, not product behaviour.
  it('shows description, owners, tags, and domains from the table GET', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('Orders fact');
    expect(wrapper.text()).toContain('alice');
    expect(wrapper.text()).toContain('Sensitive');
    expect(wrapper.text()).toContain('Marketing');
    expect(wrapper.find('[data-testid="edit-governance"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-tabs"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Regular');
    expect(wrapper.text()).toContain('BigQuery Prod');
    expect(wrapper.text()).toContain('analytics');
    expect(wrapper.text()).toContain('marts');
  }, 20000);

  it('renders partitioned keys, constraints, and aliases in the schema pane (D-1)', async () => {
    const { wrapper, router } = await mountView();
    expect(wrapper.find('[data-testid="asset-partitioned-keys-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('ds');
    expect(wrapper.text()).toContain('TIME-UNIT');
    // A partition column without an interval type renders the pin `--`.
    expect(wrapper.text()).toContain('region');
    expect(wrapper.find('[data-testid="PRIMARY_KEY-container"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Primary key');
    expect(wrapper.find('[data-testid="FOREIGN_KEY-container"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Foreign key');
    expect(wrapper.text()).toContain('customer_id');
    expect(wrapper.find('[data-testid="table-aliases-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('orders_alias');
    await wrapper.find('[data-testid="FOREIGN_KEY-container"] a').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.params.fqn).toBe('svc.db.schema.customers');
  }, 20000);

  it('embeds the shared lineage graph on the lineage tab', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="lineage-graph"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-minimap"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-open-full-page"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('raw_orders');
    expect(wrapper.text()).toContain('Activity feed');
    expect(wrapper.text()).toContain('Schema');
    expect(wrapper.text()).toContain('Lineage');
    expect(wrapper.text()).toContain('Data Observability');
  });

  it('passes the fetched EditLineage flag into the lineage tab canvas (L6)', async () => {
    const { wrapper } = await mountView();
    const canvas = wrapper.findComponent(LineageCanvas);
    expect(canvas.exists()).toBe(true);
    // The governance stub grants ViewBasic/EditDescription/EditCustomFields
    // but not EditLineage, so the tab canvas is read-only (D-TAB-3).
    expect(canvas.props('hasEditAccess')).toBe(false);
  });

  it('plots profiler history, usage, and latest test status from real GET payloads', async () => {
    const { wrapper } = await mountView('table', 'svc.db.schema.orders', { tab: 'profiler' });
    expect(wrapper.find('[data-testid="table-profiler-container"]').exists()).toBe(true);
    // Official TableProfilerChart does not host the test-status chart;
    // tests live on QualityTab (AssetDataQualityTab).
    expect(wrapper.find('[data-testid="asset-test-status-chart"]').exists()).toBe(false);
    expect(lastMatchingFetch((url) => url.includes('/tableProfile') && !url.includes('/latest')).url).toContain(
      'startTs=',
    );
  });

  it('shows linked tests and latest status from GET /v1/dataQuality/testCases', async () => {
    const { wrapper, router } = await mountView();
    expect(wrapper.text()).toContain('row_count');
    expect(wrapper.text()).toContain('Failed');
    expect(wrapper.find('[data-testid="asset-data-quality-tab"]').exists()).toBe(true);
    await wrapper.find('[data-testid="test-case-row-tc1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('quality-test-case');
  });

  it('shows entity activity, conversations, and custom property values', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('Updated description');
    expect(wrapper.text()).toContain('please review');
    expect(wrapper.text()).toContain('Retention days');
    expect(wrapper.text()).toContain('7');
    expect(wrapper.find('[data-testid="asset-activity-table"]').exists()).toBe(true);
    // Expected change (A7): the read-only conversations table is now an
    // interactive thread — same-strength presence check on the thread
    // container plus its reaction controls, instead of the old table.
    expect(wrapper.find('[data-testid="asset-conversation-c1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="conversation-reaction-c1-thumbsUp"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-custom-properties"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="create-asset-conversation"]').exists()).toBe(true);
  });

  it('PATCHes the table by id when governance is saved', async () => {
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="edit-governance"]').trigger('click');
    await flushPromises();
    // D-3: the modal description is a rich-text editor now, not a
    // TextArea. The testid anchor is kept on its wrapper; the content
    // is set through the editor's exposed API after its content timer
    // has landed the initial value, and the stored format is HTML.
    const editorBox = wrapper.find('[data-testid="asset-description"]');
    expect(editorBox.exists()).toBe(true);
    await tick();
    const editor = editorBox.findComponent(SmRichTextEditor);
    expect(editor.exists()).toBe(true);
    (editor.vm as unknown as { setEditorContent: (content: string) => void }).setEditorContent(
      'Updated description',
    );
    const ok = wrapper.findAll('button').find((button) => button.text() === 'Save');
    expect(ok).toBeTruthy();
    await ok!.trigger('click');
    await flushPromises();
    const patch = lastMatchingFetch((url, init) => url.includes('/api/v1/tables/tbl-1') && init?.method === 'PATCH');
    expect((patch.init?.headers as Record<string, string>)['Content-Type']).toBe('application/json-patch+json');
    const body = JSON.parse(String(patch.init?.body)) as Array<{ path: string; value?: unknown }>;
    expect(body.some((op) => op.path === '/description' && op.value === '<p>Updated description</p>')).toBe(true);
    expect(body.some((op) => op.path === '/tags')).toBe(true);
    expect(body.some((op) => op.path === '/owners')).toBe(true);
    expect(body.some((op) => op.path === '/domains')).toBe(true);
  });

  it('preserves a Generated labelType when governance is saved', async () => {
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="edit-governance"]').trigger('click');
    await flushPromises();
    const ok = wrapper.findAll('button').find((button) => button.text() === 'Save');
    expect(ok).toBeTruthy();
    await ok!.trigger('click');
    await flushPromises();
    const patch = lastMatchingFetch((url, init) => url.includes('/api/v1/tables/tbl-1') && init?.method === 'PATCH');
    const body = JSON.parse(String(patch.init?.body)) as Array<{ path: string; value?: unknown }>;
    expect(body.find((op) => op.path === '/tags')?.value).toEqual([
      {
        tagFQN: 'PII.Sensitive',
        source: 'Classification',
        labelType: 'Generated',
        state: 'Confirmed',
      },
    ]);
  });

  it('preserves a Generated labelType when the tag is absent from the catalog (existing-tag fallback)', async () => {
    // The stub catalog serves PII.Sensitive, so the test above exercises the
    // catalog-branch overlay. Empty the /api/v1/tags page here so the
    // existing-tag fallback overlay in selectedTagOptions is the branch
    // that carries the labelType onto the PATCH; all other requests fall
    // through to the shared stub, including the table GET that carries
    // the Generated tag and the PATCH itself.
    const baseFetch = vi.mocked(fetch);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes('/api/v1/tags')) {
          return jsonResponse({ data: [] });
        }
        return baseFetch(input, init);
      }),
    );
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="edit-governance"]').trigger('click');
    await flushPromises();
    const ok = wrapper.findAll('button').find((button) => button.text() === 'Save');
    expect(ok).toBeTruthy();
    await ok!.trigger('click');
    await flushPromises();
    const patch = lastMatchingFetch((url, init) => url.includes('/api/v1/tables/tbl-1') && init?.method === 'PATCH');
    const body = JSON.parse(String(patch.init?.body)) as Array<{ path: string; value?: unknown }>;
    expect(body.find((op) => op.path === '/tags')?.value).toEqual([
      {
        tagFQN: 'PII.Sensitive',
        source: 'Classification',
        labelType: 'Generated',
        state: 'Confirmed',
      },
    ]);
  }, 20000);
});

async function mountTypedView(entityType: string, fqn: string) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/search', name: 'search', component: { template: '<div>search</div>' } },
      { path: '/:entityType/:fqn/:tab/:subTab', name: 'asset-subtab', component: AssetDetailView, props: true },
      { path: '/:entityType/:fqn/:tab', name: 'asset-tab', component: AssetDetailView, props: true },
      { path: '/:entityType/:fqn', name: 'asset', component: AssetDetailView, props: true },
      { path: '/lineage/:entityType/:fqn', name: 'lineage', component: { template: '<div>lineage</div>' } },
    ],
  });
  await router.push(`/${entityType}/${fqn}`);
  await router.isReady();
  const wrapper = mount(AssetDetailView, {
    props: { entityType, fqn },
    attachTo: document.body,
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('AssetDetailView non-table shells', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders dashboard chart refs from the dashboard GET and skips a schema tab', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/dashboards/name/')) {
          return jsonResponse({
            id: 'dash-1',
            name: 'sales',
            fullyQualifiedName: 'bi.sales',
            project: 'Finance',
            charts: [{ id: 'chart-1', name: 'revenue', type: 'chart' }],
            dataModels: [{ name: 'sales_model', type: 'dashboardDataModel' }],
            service: { name: 'superset' },
          });
        }
        if (url.includes('/api/v1/charts/chart-1')) {
          return jsonResponse({
            id: 'chart-1',
            name: 'revenue',
            fullyQualifiedName: 'bi.sales.revenue',
            chartType: 'Bar',
            tags: [],
          });
        }
        if (url.includes('/api/v1/lineage/')) {
          return jsonResponse({ entity: { id: 'dash-1', type: 'dashboard', name: 'sales' }, nodes: [] });
        }
        if (url.includes('/api/v1/dataQuality/testCases')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/activity/')) {
          return jsonResponse({ data: [] });
        }
        if (url.includes('/api/v1/conversations')) {
          return jsonResponse({ data: [] });
        }
        if (url.includes('/customProperties')) {
          return jsonResponse([]);
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountTypedView('dashboard', 'bi.sales');
    expect(wrapper.find('[data-testid="entity-detail-shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-tabs"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Charts');
    expect(wrapper.text()).not.toContain('Schema');
    expect(wrapper.find('[data-testid="dashboard-chart-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('revenue');
    expect(wrapper.text()).toContain('sales_model');
    // Batch 6 asset-overview: the `project` identity row retired with
    // the details default pane — pin's Dashboard DETAILS layout has no
    // project widget, so 'Finance' no longer renders on the tab.
    expect(wrapper.text()).not.toContain('Finance');
  });

  it('draws a pipeline DAG only from returned tasks and shows Empty when tasks are missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/pipelines/name/')) {
          return jsonResponse({
            id: 'pipe-1',
            name: 'daily_etl',
            fullyQualifiedName: 'airflow.daily_etl',
            tasks: [
              { name: 'extract', displayName: 'Extract', downstreamTasks: ['load'] },
              { name: 'load', downstreamTasks: [] },
            ],
            pipelineStatus: {
              timestamp: 1700000000000,
              executionStatus: 'Successful',
              taskStatus: [{ name: 'extract', executionStatus: 'Successful' }],
            },
            service: { name: 'airflow' },
          });
        }
        if (url.includes('/api/v1/pipelines/') && url.includes('/status')) {
          return jsonResponse({
            data: [{ timestamp: 1700000000000, executionStatus: 'Successful', executionId: 'run-1' }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/lineage/')) {
          return jsonResponse({ entity: { id: 'pipe-1', type: 'pipeline', name: 'daily_etl' }, nodes: [] });
        }
        if (url.includes('/api/v1/dataQuality/testCases')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/activity/')) {
          return jsonResponse({ data: [] });
        }
        if (url.includes('/api/v1/conversations')) {
          return jsonResponse({ data: [] });
        }
        if (url.includes('/customProperties')) {
          return jsonResponse([]);
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountTypedView('pipeline', 'airflow.daily_etl');
    // The tasks tab defaults to the List view (pin PipelineTaskTab); the Dag
    // graph renders after switching views.
    expect(wrapper.find('[data-testid="task-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pipeline-task-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pipeline-task-graph"]').exists()).toBe(false);
    const dagOption = [...wrapper.findAll('.ant-segmented-item')].find((item) =>
      item.text().includes('Dag'),
    );
    expect(dagOption).toBeDefined();
    await dagOption!.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="pipeline-task-graph"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pipeline-task-extract"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pipeline-task-load"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pipeline-task-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pipeline-executions-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('run-1');
    expect(wrapper.text()).toContain('Tasks');
    expect(wrapper.text()).toContain('Executions');
  });

  it('does not invent a pipeline graph when tasks are empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/pipelines/name/')) {
          return jsonResponse({
            id: 'pipe-empty',
            name: 'empty_etl',
            fullyQualifiedName: 'airflow.empty_etl',
            tasks: [],
            service: { name: 'airflow' },
          });
        }
        if (url.includes('/api/v1/pipelines/') && url.includes('/status')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/lineage/')) {
          return jsonResponse({ entity: { id: 'pipe-empty', type: 'pipeline', name: 'empty_etl' }, nodes: [] });
        }
        if (url.includes('/api/v1/dataQuality/testCases')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/activity/') || url.includes('/api/v1/conversations') || url.includes('/customProperties')) {
          return jsonResponse({ data: [] });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountTypedView('pipeline', 'airflow.empty_etl');
    expect(wrapper.find('[data-testid="pipeline-task-graph"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pipeline-task-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pipeline-executions-empty"]').exists()).toBe(true);
  });

  // R8: same parallel-load timeout allowance as the table GET test above.
  it('loads chart / metric / dashboardDataModel / database / schema GETs and wires query detail (C-14)', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url.includes('/api/v1/charts/name/')) {
          return jsonResponse({
            id: 'ch-1',
            name: 'revenue',
            fullyQualifiedName: 'bi.sales.revenue',
            chartType: 'Bar',
            service: { name: 'superset' },
            dashboards: [{ name: 'sales', type: 'dashboard' }],
          });
        }
        if (url.includes('/api/v1/metrics/name/')) {
          return jsonResponse({
            id: 'm-1',
            name: 'mau',
            fullyQualifiedName: 'kpi.mau',
            metricType: 'COUNT',
            metricExpression: { language: 'SQL', code: 'SELECT 1' },
          });
        }
        if (url.includes('/api/v1/dashboard/datamodels/name/') && url.includes('/columns')) {
          // D-2 batch 3: DataModel columns are self-fetched (pin
          // ModelTab), served here from the detail payload's columns.
          return jsonResponse({
            data: [{ name: 'amount', dataType: 'DECIMAL' }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/dashboard/datamodels/name/')) {
          return jsonResponse({
            id: 'dm-1',
            name: 'sales_model',
            fullyQualifiedName: 'bi.sales.model',
            dataModelType: 'SupersetDataModel',
            columns: [{ name: 'amount', dataType: 'DECIMAL' }],
          });
        }
        if (url.includes('/api/v1/permissions/databaseSchema/name/')) {
          return jsonResponse({
            resource: 'databaseSchema',
            permissions: [
              { operation: 'ViewBasic', access: 'allow' },
              { operation: 'ViewCustomFields', access: 'allow' },
            ],
          });
        }
        if (url.includes('/api/v1/tables?')) {
          // D-2 batch 6: the schema TABLES widget self-fetches the
          // tables list (pin Tables widget), served here from the
          // detail payload's tables.
          return jsonResponse({
            data: [{ name: 'orders', fullyQualifiedName: 'svc.analytics.marts.orders', type: 'table' }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/databaseSchemas?')) {
          // D-2 batch 3: the database page lists its child schemas
          // (pin DatabaseSchema.component) instead of the payload copy.
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/databases/name/')) {
          return jsonResponse({
            id: 'db-1',
            name: 'analytics',
            fullyQualifiedName: 'svc.analytics',
            service: { name: 'svc' },
            databaseSchemas: [],
          });
        }
        if (url.includes('/api/v1/databaseSchemas/name/')) {
          return jsonResponse({
            id: 'sch-1',
            name: 'marts',
            fullyQualifiedName: 'svc.analytics.marts',
            database: { name: 'analytics' },
            tables: [{ name: 'orders', type: 'table' }],
          });
        }
        if (url.includes('/api/v1/lineage/') || url.includes('/api/v1/activity/') || url.includes('/api/v1/conversations') || url.includes('/customProperties') || url.includes('/testCases')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/queries/name/')) {
          return jsonResponse({
            id: 'q-1',
            name: 'q1',
            fullyQualifiedName: 'analytics.q1',
            query: 'SELECT 1',
            description: 'quarterly query',
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );

    const chart = await mountTypedView('chart', 'bi.sales.revenue');
    // Batch 6 asset-overview: the chart-type / service / dashboards
    // identity rows retired with the overview default pane — pin's
    // Chart DETAILS layout has no widget for them. ('sales' also
    // appears in the header FQN, so it cannot pin the retirement.)
    expect(chart.wrapper.text()).not.toContain('Bar');
    expect(chart.wrapper.text()).not.toContain('superset');
    expect(chart.wrapper.find('[data-testid="asset-tabs"]').exists()).toBe(true);
    expect(chart.wrapper.find('[data-testid="asset-schema-table"]').exists()).toBe(false);
    expect(chart.wrapper.text()).not.toContain('No detail page is wired');
    chart.wrapper.unmount();

    const metric = await mountTypedView('metric', 'kpi.mau');
    // The definition widget renders the pin enum label (mono uppercase).
    expect(metric.wrapper.text()).toContain('Count');
    // R2: official metric tabs have no code tab, so the expression moved
    // into the overview tab instead of a code tab slot.
    expect(metric.wrapper.find('[data-testid="metric-definition-card"]').exists()).toBe(true);
    expect(metric.wrapper.find('[data-testid="metric-expression-code"]').exists()).toBe(true);
    expect(metric.wrapper.text()).toContain('SELECT 1');
    metric.wrapper.unmount();

    const model = await mountTypedView('dashboardDataModel', 'bi.sales.model');
    // D-2 batch 6: the model tab mounts the grid with the default
    // layout when there is no persona document; the legacy default
    // pane is retired, including its dataModelType overview row,
    // which no pin MODEL layout widget carries. The schema table and
    // its rows now render inside the grid's DataModel cell.
    expect(model.wrapper.findAllComponents(GenericTab).length).toBe(1);
    expect(model.wrapper.findAllComponents(GenericTab)[0].props('layout')).toEqual(
      resolveWidgetLayout('DashboardDataModel', 'model', null),
    );
    expect(model.wrapper.find('[data-testid="asset-schema-table"]').exists()).toBe(true);
    expect(model.wrapper.text()).toContain('amount');
    expect(model.wrapper.text()).not.toContain('SupersetDataModel');
    model.wrapper.unmount();

    const database = await mountTypedView('database', 'svc.analytics');
    expect(database.wrapper.find('[data-testid="entity-detail-shell"]').exists()).toBe(true);
    expect(database.wrapper.find('[data-testid="asset-database-schemas-empty"]').exists()).toBe(true);
    expect(database.wrapper.text()).not.toContain('No detail page is wired');
    database.wrapper.unmount();

    const schema = await mountTypedView('databaseSchema', 'svc.analytics.marts');
    // D-2 batch 6: the table tab mounts the grid with the default
    // layout when there is no persona document; the legacy related
    // panel is retired and the TABLES widget (SchemaTablesWidget,
    // self-fetched) renders the tables instead. The extra flushes let
    // the permission read resolve (canView) and the list fetch land.
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await schema.wrapper.vm.$nextTick();
    expect(schema.wrapper.findAllComponents(GenericTab).length).toBe(1);
    expect(schema.wrapper.findAllComponents(GenericTab)[0].props('layout')).toEqual(
      resolveWidgetLayout('DatabaseSchema', 'table', null),
    );
    expect(schema.wrapper.find('[data-testid="schema-tables-widget"]').exists()).toBe(true);
    expect(schema.wrapper.find('[data-testid="asset-related-table"]').exists()).toBe(false);
    expect(schema.wrapper.text()).toContain('orders');
    expect(schema.wrapper.text()).toContain('analytics');
    schema.wrapper.unmount();

    const query = await mountTypedView('query', 'analytics.q1');
    expect(query.wrapper.text()).toContain('q1');
    expect(query.wrapper.text()).not.toContain('No detail page is wired');
    expect(query.wrapper.find('[data-testid="entity-detail-shell"]').exists()).toBe(true);
    const queryDetailUrl = urls.find((url) => url.includes('/api/v1/queries/name/'));
    expect(queryDetailUrl).toContain('fields=owners');
    expect(queryDetailUrl).toContain('queryUsedIn');
    query.wrapper.unmount();
  }, 20000);
});

describe('AssetDetailView R2 header and split tabs', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function stubDatabase(
    followers: Array<Record<string, unknown>>,
    votes: Record<string, unknown> = { upVotes: 2, downVotes: 0, upVoters: [], downVoters: [] },
  ) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/databases/name/')) {
          return jsonResponse({
            id: 'db-1',
            name: 'analytics',
            fullyQualifiedName: 'svc.analytics',
            owners: [{ id: 'u2', name: 'bob', type: 'user' }],
            followers,
            votes,
            tags: [{ tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification' }],
            service: { name: 'svc' },
            databaseSchemas: [{ name: 'marts', type: 'databaseSchema' }],
          });
        }
        if (url.includes('/api/v1/databaseSchemas?')) {
          // D-2 batch 3: the database page lists its child schemas
          // (pin DatabaseSchema.component) instead of the payload copy.
          return jsonResponse({
            data: [
              {
                id: 'sch-1',
                name: 'marts',
                fullyQualifiedName: 'svc.analytics.marts',
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/databases/db-1/vote') && init?.method === 'PUT') {
          return jsonResponse({ eventType: 'ENTITY_UPDATED' });
        }
        if (url.includes('/api/v1/databases/db-1/followers')) {
          return jsonResponse({ id: 'db-1' });
        }
        if (url.includes('/api/v1/lineage/') || url.includes('/api/v1/activity/') || url.includes('/api/v1/conversations') || url.includes('/customProperties') || url.includes('/testCases')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  }

  it('shows the tier tag, owners and official database tabs, and no lineage tab', async () => {
    stubDatabase([]);
    const { wrapper } = await mountTypedView('database', 'svc.analytics');
    expect(wrapper.find('[data-testid="asset-tier"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-tier"]').text()).toContain('Tier.Tier1');
    expect(wrapper.find('[data-testid="asset-header-owners"]').text()).toContain('bob');
    expect(wrapper.text()).toContain('Schemas');
    expect(wrapper.text()).not.toContain('Lineage');
    expect(wrapper.find('[data-testid="asset-database-schemas-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('marts');
  });

  it('sends the official unfollow DELETE when the current user already follows', async () => {
    stubDatabase([{ id: 'u1', name: 'alice', type: 'user' }]);
    const { wrapper } = await mountTypedView('database', 'svc.analytics');
    useAuthStore().user = { id: 'u1', name: 'alice' };
    await wrapper.vm.$nextTick();
    await flushPromises();
    const follow = wrapper.find('[data-testid="asset-follow"]');
    expect(follow.text()).toContain('Unfollow');
    await follow.trigger('click');
    await flushPromises();
    const call = lastMatchingFetch(
      (url, init) => url.includes('/api/v1/databases/db-1/followers/u1') && init?.method === 'DELETE',
    );
    expect(call.url).toContain('/api/v1/databases/db-1/followers/u1');
  });

  it('disables follow when no user id is available instead of faking a state', async () => {
    stubDatabase([]);
    const { wrapper } = await mountTypedView('database', 'svc.analytics');
    const follow = wrapper.find('[data-testid="asset-follow"]');
    expect((follow.element as HTMLButtonElement).disabled).toBe(true);
  });

  it('sends votedUp to PUT /v1/{collection}/{id}/vote and reloads the asset', async () => {
    stubDatabase([]);
    const { wrapper } = await mountTypedView('database', 'svc.analytics');
    useAuthStore().user = { id: 'u1', name: 'alice' };
    await wrapper.vm.$nextTick();
    await flushPromises();
    const up = wrapper.find('[data-testid="asset-vote-up"]');
    expect(up.text()).toContain('Upvote (2)');
    await up.trigger('click');
    await flushPromises();
    const call = lastMatchingFetch(
      (url, init) => url.includes('/api/v1/databases/db-1/vote') && init?.method === 'PUT',
    );
    expect(JSON.parse(String(call.init?.body ?? '{}'))).toEqual({ updatedVoteType: 'votedUp' });
  });

  it('sends unVoted when the current user already voted up', async () => {
    stubDatabase([], { upVotes: 3, downVotes: 0, upVoters: [{ id: 'u1', name: 'alice', type: 'user' }], downVoters: [] });
    const { wrapper } = await mountTypedView('database', 'svc.analytics');
    useAuthStore().user = { id: 'u1', name: 'alice' };
    await wrapper.vm.$nextTick();
    await flushPromises();
    await wrapper.find('[data-testid="asset-vote-up"]').trigger('click');
    await flushPromises();
    const call = lastMatchingFetch(
      (url, init) => url.includes('/api/v1/databases/db-1/vote') && init?.method === 'PUT',
    );
    expect(JSON.parse(String(call.init?.body ?? '{}'))).toEqual({ updatedVoteType: 'unVoted' });
  });
});

describe('AssetDetailView API collection and endpoint (P2 B5)', () => {
  // Scoped stub: secondary loads (quality, activity, custom properties)
  // 404 and are caught by the view; only the API payloads are faked.
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/apiCollections/name/')) {
          return jsonResponse({
            id: 'ac-1',
            name: 'petstore',
            fullyQualifiedName: 'svc.petstore',
            description: 'Petstore API',
            owners: [],
            tags: [],
            domains: [],
            service: { name: 'rest', displayName: 'REST' },
          });
        }
        if (url.includes('/api/v1/apiEndpoints/name/')) {
          return jsonResponse({
            id: 'ae-1',
            name: 'getPet',
            fullyQualifiedName: 'svc.petstore.getPet',
            endpointURL: '/pets/{id}',
            requestMethod: 'GET',
            requestSchema: { type: 'object', properties: { id: { type: 'integer' } } },
            responseSchema: { type: 'object' },
            owners: [],
            tags: [],
            domains: [],
          });
        }
        if (url.includes('/api/v1/apiEndpoints')) {
          return jsonResponse({
            data: [
              { name: 'getPet', endpointURL: '/pets/{id}', requestMethod: 'GET', fullyQualifiedName: 'svc.petstore.getPet' },
            ],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists collection endpoints on the apiEndpoints tab', async () => {
    const { wrapper } = await mountView('apiCollection', 'svc.petstore');
    expect(wrapper.text()).toContain('Petstore API');
    expect(wrapper.text()).toContain('API endpoints');
    expect(wrapper.find('[data-testid="asset-api-endpoints-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('getPet');
    // Pin APIEndpointsTab columns are name / request method /
    // description — the endpoint URL lives on the endpoint detail tab,
    // not in this table.
    expect(wrapper.text()).toContain('GET');
  }, 20000);

  it('shows endpoint URL, method, and schemas on the endpoint tab', async () => {
    const { wrapper } = await mountView('apiEndpoint', 'svc.petstore.getPet');
    expect(wrapper.text()).toContain('Endpoint');
    expect(wrapper.find('[data-testid="asset-api-request-schema"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('/pets/{id}');
    expect(wrapper.text()).toContain('GET');
  }, 20000);
});

describe('AssetDetailView usage percentile header (C-F02/C-F03)', () => {
  const USAGE_SUMMARY = {
    dailyStats: { count: 12 },
    weeklyStats: { count: 40, percentileRank: 45 },
  };

  function stubFetch(viewUsage: 'allow' | 'deny' | 'fail'): string[] {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url.includes('/api/v1/permissions/')) {
          if (viewUsage === 'fail') {
            return new Response('not found', { status: 404 });
          }
          return jsonResponse({
            resource: 'entity',
            permissions: [
              { operation: 'ViewBasic', access: 'allow' },
              { operation: 'ViewUsage', access: viewUsage === 'allow' ? 'allow' : 'deny' },
            ],
          });
        }
        if (/\/api\/v1\/(tables|dashboards|pipelines|mlmodels|topics)\/name\//.test(url)) {
          // Mirror the server's field gating: usageSummary is returned
          // only when the request asked for it.
          const wantsUsage = decodeURIComponent(url).includes('usageSummary');
          return jsonResponse({
            id: 'e1',
            name: 'thing',
            fullyQualifiedName: 'svc.thing',
            owners: [],
            tags: [],
            domains: [],
            ...(wantsUsage ? { usageSummary: USAGE_SUMMARY } : {}),
          });
        }
        if (url.includes('/api/v1/dataQuality/testCases')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/activity/')) {
          return jsonResponse({ data: [] });
        }
        if (url.includes('/api/v1/conversations')) {
          return jsonResponse({ data: [] });
        }
        if (url.includes('/customProperties')) {
          return jsonResponse([]);
        }
        if (url.includes('/api/v1/lineage/')) {
          return jsonResponse({ entity: { id: 'e1', type: 'table', name: 'thing' }, nodes: [] });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    return urls;
  }

  function detailUrl(urls: string[], collection: string): string {
    const found = urls.find((url) => url.includes(`/api/v1/${collection}/name/`));
    if (!found) {
      throw new Error(`no ${collection} detail fetch`);
    }
    return decodeURIComponent(found);
  }

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it.each([
    ['table', 'tables', 'svc.db.schema.orders'],
    ['dashboard', 'dashboards', 'bi.sales'],
    ['pipeline', 'pipelines', 'airflow.daily_etl'],
    ['mlmodel', 'mlmodels', 'ml.churn'],
  ])(
    'requests usageSummary with ViewUsage and labels the header percentile for %s',
    async (entityType, collection, fqn) => {
      const urls = stubFetch('allow');
      const { wrapper } = await mountTypedView(entityType, fqn);
      expect(detailUrl(urls, collection)).toContain('usageSummary');
      const percentile = wrapper.find('[data-testid="asset-usage-percentile"]');
      expect(percentile.exists()).toBe(true);
      expect(percentile.text()).toContain('Usage');
      expect(percentile.text()).toContain('45th pctile');
      wrapper.unmount();
    },
    20000,
  );

  it('omits usageSummary when ViewUsage is denied, and shows no percentile', async () => {
    const urls = stubFetch('deny');
    const { wrapper } = await mountTypedView('dashboard', 'bi.sales');
    expect(detailUrl(urls, 'dashboards')).not.toContain('usageSummary');
    expect(wrapper.find('[data-testid="asset-usage-percentile"]').exists()).toBe(false);
    wrapper.unmount();
  }, 20000);

  it('fails closed when the permission read fails', async () => {
    const urls = stubFetch('fail');
    const { wrapper } = await mountTypedView('pipeline', 'airflow.daily_etl');
    expect(detailUrl(urls, 'pipelines')).not.toContain('usageSummary');
    expect(wrapper.find('[data-testid="asset-usage-percentile"]').exists()).toBe(false);
    wrapper.unmount();
  }, 20000);

  it('never requests usageSummary for entity types without a pin header site', async () => {
    const urls = stubFetch('allow');
    const { wrapper } = await mountTypedView('topic', 'kafka.events');
    expect(detailUrl(urls, 'topics')).not.toContain('usageSummary');
    // D-F2 still reads the topic's entity permission for the schema-cell
    // edit flags, but that read must not smuggle usageSummary into the
    // detail request: the only permissions call is the topic's own.
    expect(urls.filter((url) => url.includes('/api/v1/permissions/'))).toEqual([
      expect.stringContaining('/api/v1/permissions/topic/name/kafka.events'),
    ]);
    wrapper.unmount();
  }, 20000);
});

describe('AssetDetailView persona tab customization (C-4)', () => {
  const persona = { id: 'p1', name: 'analyst', fullyQualifiedName: 'analyst', displayName: 'Analyst' };

  function tableDoc(tabs: Array<Record<string, unknown>>): Record<string, unknown> {
    return {
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: { pages: [{ pageType: 'Table', tabs }] },
    };
  }

  function stubWithDoc(doc: Record<string, unknown> | null) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/tables/name/') && url.includes('/columns')) {
          // D-2 batch 3: the schema table self-fetches its columns.
          return jsonResponse({
            data: [{ name: 'id', dataType: 'BIGINT' }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/tables/name/')) {
          return jsonResponse({
            id: 'tbl-1',
            name: 'orders',
            fullyQualifiedName: 'svc.db.schema.orders',
            columns: [{ name: 'id', dataType: 'BIGINT' }],
          });
        }
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: [persona], paging: { total: 1 } });
        }
        if (url.includes('/v1/docStore/name/')) {
          return doc ? jsonResponse(doc) : new Response('not found', { status: 404 });
        }
        if (
          url.includes('/api/v1/lineage/') ||
          url.includes('/api/v1/activity/') ||
          url.includes('/api/v1/conversations') ||
          url.includes('/customProperties') ||
          url.includes('/testCases')
        ) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  }

  // Scoped to the shell's own tab nav: the lineage pane renders a
  // nested Tabs (Diagram/Table/Impact analysis) that a global
  // `.ant-tabs-tab` selector would also catch.
  function tabLabels(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']): string[] {
    return wrapper.find('.ant-tabs-nav').findAll('.ant-tabs-tab').map((tab) => tab.text().trim());
  }

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('reorders and renames tabs from the persona Table page, dropping unlisted tabs', async () => {
    stubWithDoc(
      tableDoc([
        { id: 'lineage', name: 'lineage', displayName: 'Flow' },
        { id: 'schema', name: 'schema' },
        { id: 'activity_feed', name: 'activity_feed', displayName: 'Feed' },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('table', 'svc.db.schema.orders');
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    // F-2: replacement semantics — only the customized tabs render;
    // the unlisted Table tabs stay removed instead of resurrecting.
    expect(tabLabels(wrapper)).toEqual(['Flow', 'Schema', 'Feed']);
    wrapper.unmount();
  }, 20000);

  it('renders the default tab order without a persona document', async () => {
    stubWithDoc(null);
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('table', 'svc.db.schema.orders');
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(tabLabels(wrapper)).toEqual([
      'Schema',
      'Activity feed',
      'Sample data',
      'Queries',
      'Data Observability',
      'Lineage',
      'dbt',
      'View definition',
      'Contract',
      'Custom Properties',
    ]);
    wrapper.unmount();
  }, 20000);

  it('ignores customized pages of other types', async () => {
    stubWithDoc({
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: {
        pages: [
          {
            pageType: 'Dashboard',
            tabs: [{ id: 'lineage', name: 'lineage', displayName: 'Flow' }],
          },
        ],
      },
    });
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('table', 'svc.db.schema.orders');
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(tabLabels(wrapper)[0]).toBe('Schema');
    expect(wrapper.text()).not.toContain('Flow');
    wrapper.unmount();
  }, 20000);
});

describe('AssetDetailView widget layer (B-8)', () => {
  const persona = { id: 'p1', name: 'analyst', fullyQualifiedName: 'analyst', displayName: 'Analyst' };

  function docWithPage(pageType: string, tabs: Array<Record<string, unknown>>): Record<string, unknown> {
    return {
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: { pages: [{ pageType, tabs }] },
    };
  }

  type EntityResponder = (url: string) => Response | null;

  function stubWithDoc(doc: Record<string, unknown> | null, entityResponder: EntityResponder, docGate?: Promise<void>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: [persona], paging: { total: 1 } });
        }
        if (url.includes('/v1/docStore/name/')) {
          // A gate lets one test hold the persona document back until
          // after the entity load derives `activeTab`, pinning the
          // late-document race deterministically.
          if (docGate) {
            await docGate;
          }
          return doc ? jsonResponse(doc) : new Response('not found', { status: 404 });
        }
        const entity = entityResponder(url);
        if (entity) {
          return entity;
        }
        if (
          url.includes('/api/v1/lineage/') ||
          url.includes('/api/v1/activity/') ||
          url.includes('/api/v1/conversations') ||
          url.includes('/customProperties') ||
          url.includes('/testCases')
        ) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  }

  function tableResponder(table: Record<string, unknown>): EntityResponder {
    return (url) => {
      // D-2 batch 3: Table / DataModel columns are self-fetched (pin
      // TableSchema / ModelTab), so the stub serves the column-list
      // endpoints from the same payload columns as the detail GET.
      if (url.includes('/columns')) {
        const columns = Array.isArray(table.columns) ? table.columns : [];
        return jsonResponse({ data: columns, paging: { total: columns.length } });
      }
      return url.includes('/api/v1/tables/name/') ? jsonResponse(table) : null;
    };
  }

  const BASE_TABLE = {
    id: 'tbl-1',
    name: 'orders',
    fullyQualifiedName: 'svc.db.schema.orders',
    description: 'Orders fact',
    owners: [{ id: 'u1', name: 'alice', type: 'user', displayName: 'Alice' }],
    tags: [
      { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType: 'Generated' },
      { tagFQN: 'Glossary.Business', name: 'Business', source: 'Glossary', labelType: 'Manual' },
    ],
    domains: [{ id: 'd1', name: 'Marketing', type: 'domain' }],
    columns: [{ name: 'id', dataType: 'BIGINT' }],
    extension: { retentionDays: 7 },
    tableType: 'Regular',
    serviceType: 'BigQuery',
    service: { name: 'bq', displayName: 'BigQuery Prod' },
    database: { name: 'analytics' },
    databaseSchema: { name: 'marts' },
    joins: {
      directTableJoins: [
        { fullyQualifiedName: 'svc.db.schema.customers', name: 'customers', joinCount: 7 },
      ],
    },
  };

  async function settle(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']): Promise<void> {
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
  }

  // Scoped to the shell's own tab nav, as in the C-4 describe: the
  // lineage pane renders a nested Tabs that a global selector would
  // also catch.
  function tabLabels(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']): string[] {
    return wrapper.find('.ant-tabs-nav').findAll('.ant-tabs-tab').map((tab) => tab.text().trim());
  }

  function cellFor(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], widgetId: string) {
    return wrapper.find(`[data-testid="${widgetId}"]`);
  }

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders the customized schema tab as a grid with the compacted stored geometry and content', async () => {
    const layout = [
      { i: DetailWidgetKeys.TABLE_SCHEMA, x: 1, y: 2, w: 3, h: 2 },
      { i: DetailWidgetKeys.FREQUENTLY_JOINED_TABLES, x: 4, y: 0, w: 4, h: 1 },
    ];
    stubWithDoc(
      docWithPage('Table', [{ id: 'schema', name: 'schema', layout }]),
      tableResponder(BASE_TABLE),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('table', 'svc.db.schema.orders');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    // D-8: the read side compacts vertically like official
    // react-grid-layout, so the stored y:2 schema cell (empty rows
    // above it, no collision) renders at y:0.
    expect(grids[0].props('layout')).toEqual(compactWidgetLayoutVertical(layout));
    expect(grids[0].props('pageType')).toBe('Table');
    const schemaCell = cellFor(wrapper, DetailWidgetKeys.TABLE_SCHEMA);
    expect(schemaCell.exists()).toBe(true);
    expect(schemaCell.attributes('style')).toContain('grid-column: 2 / span 3');
    expect(schemaCell.attributes('style')).toContain('grid-row: 1 / span 2');
    expect(schemaCell.find('[data-testid="asset-schema-table"]').exists()).toBe(true);
    const joinsCell = cellFor(wrapper, DetailWidgetKeys.FREQUENTLY_JOINED_TABLES);
    expect(joinsCell.exists()).toBe(true);
    expect(joinsCell.attributes('style')).toContain('grid-column: 5 / span 4');
    expect(joinsCell.attributes('style')).toContain('grid-row: 1 / span 1');
    expect(joinsCell.find('[data-testid="related-tables-data"]').exists()).toBe(true);
    expect(joinsCell.text()).toContain('customers');
    // The default pane is replaced, not duplicated: one schema table total.
    expect(wrapper.findAll('[data-testid="asset-schema-table"]').length).toBe(1);
    wrapper.unmount();
  }, 20000);

  it('maps a lone FrequentlyJoinedTables widget without leaking the schema table', async () => {
    stubWithDoc(
      docWithPage('Table', [
        {
          id: 'schema',
          name: 'schema',
          layout: [{ i: DetailWidgetKeys.FREQUENTLY_JOINED_TABLES, x: 0, y: 0, w: 8, h: 2 }],
        },
      ]),
      tableResponder(BASE_TABLE),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('table', 'svc.db.schema.orders');
    await settle(wrapper);
    expect(wrapper.findAllComponents(GenericTab).length).toBe(1);
    expect(cellFor(wrapper, DetailWidgetKeys.FREQUENTLY_JOINED_TABLES).find('[data-testid="related-tables-data"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-schema-table"]').exists()).toBe(false);
    wrapper.unmount();
  }, 20000);

  it('maps governance widgets to their fragments with the same data as the overview rows', async () => {
    stubWithDoc(
      docWithPage('Table', [
        {
          id: 'schema',
          name: 'schema',
          layout: [
            { i: DetailWidgetKeys.DESCRIPTION, x: 0, y: 0, w: 4, h: 1 },
            { i: DetailWidgetKeys.TAGS, x: 4, y: 0, w: 4, h: 1 },
            { i: DetailWidgetKeys.GLOSSARY_TERMS, x: 0, y: 1, w: 4, h: 1 },
            { i: DetailWidgetKeys.OWNERS, x: 4, y: 1, w: 2, h: 1 },
            { i: DetailWidgetKeys.DOMAIN, x: 6, y: 1, w: 2, h: 1 },
          ],
        },
      ]),
      tableResponder(BASE_TABLE),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('table', 'svc.db.schema.orders');
    await settle(wrapper);
    expect(wrapper.findAllComponents(GenericTab).length).toBe(1);
    const description = cellFor(wrapper, DetailWidgetKeys.DESCRIPTION).find(
      '[data-testid="asset-widget-description"]',
    );
    expect(description.exists()).toBe(true);
    expect(description.text()).toContain('Orders fact');
    const tags = cellFor(wrapper, DetailWidgetKeys.TAGS).find('[data-testid="asset-widget-tags"]');
    expect(tags.exists()).toBe(true);
    expect(tags.text()).toContain('Sensitive');
    expect(tags.text()).not.toContain('Business');
    const glossary = cellFor(wrapper, DetailWidgetKeys.GLOSSARY_TERMS).find(
      '[data-testid="asset-widget-glossary-terms"]',
    );
    expect(glossary.exists()).toBe(true);
    expect(glossary.text()).toContain('Business');
    expect(glossary.text()).not.toContain('Sensitive');
    const owners = cellFor(wrapper, DetailWidgetKeys.OWNERS).find('[data-testid="asset-widget-owners"]');
    expect(owners.exists()).toBe(true);
    expect(owners.text()).toContain('Alice');
    const domains = cellFor(wrapper, DetailWidgetKeys.DOMAIN).find('[data-testid="asset-widget-domains"]');
    expect(domains.exists()).toBe(true);
    expect(domains.text()).toContain('Marketing');
    wrapper.unmount();
  }, 20000);

  it('maps the custom-properties widget to the custom-properties panel', async () => {
    stubWithDoc(
      docWithPage('Table', [
        {
          id: 'schema',
          name: 'schema',
          layout: [{ i: DetailWidgetKeys.CUSTOM_PROPERTIES, x: 0, y: 0, w: 8, h: 2 }],
        },
      ]),
      (url) => {
        if (url.includes('/api/v1/tables/name/') && url.includes('/columns')) {
          // D-2 batch 3: the schema table self-fetches its columns.
          return jsonResponse({ data: BASE_TABLE.columns, paging: { total: 1 } });
        }
        if (url.includes('/api/v1/tables/name/')) {
          return jsonResponse(BASE_TABLE);
        }
        if (url.includes('/api/v1/permissions/table/name/')) {
          // D-4: the widget panel needs the ViewCustomFields grant to
          // render instead of the no-permission placeholder.
          return jsonResponse({
            resource: 'table',
            permissions: [{ operation: 'ViewCustomFields', access: 'allow' }],
          });
        }
        if (url.includes('/customProperties')) {
          return jsonResponse([
            { name: 'retentionDays', displayName: 'Retention days', propertyType: { name: 'integer' } },
          ]);
        }
        return null;
      },
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('table', 'svc.db.schema.orders');
    await settle(wrapper);
    expect(wrapper.findAllComponents(GenericTab).length).toBe(1);
    expect(
      cellFor(wrapper, DetailWidgetKeys.CUSTOM_PROPERTIES)
        .find('[data-testid="asset-custom-properties-table"]')
        .exists(),
    ).toBe(true);
    wrapper.unmount();
  }, 20000);

  it('renders left-panel children through the slot with their own content keys', async () => {
    stubWithDoc(
      docWithPage('Table', [
        {
          id: 'schema',
          name: 'schema',
          layout: [
            {
              i: DetailWidgetKeys.LEFT_PANEL,
              x: 0,
              y: 0,
              w: 2,
              h: 4,
              children: [
                { i: DetailWidgetKeys.DESCRIPTION, x: 0, y: 0, w: 2, h: 1 },
                { i: DetailWidgetKeys.TABLE_SCHEMA, x: 0, y: 1, w: 2, h: 3 },
              ],
            },
          ],
        },
      ]),
      tableResponder(BASE_TABLE),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('table', 'svc.db.schema.orders');
    await settle(wrapper);
    expect(wrapper.findAllComponents(GenericTab).length).toBe(1);
    expect(cellFor(wrapper, DetailWidgetKeys.LEFT_PANEL).exists()).toBe(true);
    expect(
      cellFor(wrapper, DetailWidgetKeys.DESCRIPTION)
        .find('[data-testid="asset-widget-description"]')
        .exists(),
    ).toBe(true);
    expect(
      cellFor(wrapper, DetailWidgetKeys.TABLE_SCHEMA)
        .find('[data-testid="asset-schema-table"]')
        .exists(),
    ).toBe(true);
    wrapper.unmount();
  }, 20000);

  it('renders unknown and unmapped widget ids as empty cells that keep their grid space', async () => {
    // D-1 (A7): TABLE_CONSTRAINTS is now a mapped widget, so it no
    // longer proves the unmapped branch. ASSET_HEALTH takes its place:
    // it has no data source and is deliberately unbuilt by this lane
    // (D-2 batch 5 owns its server read path).
    stubWithDoc(
      docWithPage('Table', [
        {
          id: 'schema',
          name: 'schema',
          layout: [
            { i: 'KnowledgePanel.NotARealWidget', x: 0, y: 0, w: 4, h: 1 },
            { i: DetailWidgetKeys.ASSET_HEALTH, x: 4, y: 0, w: 4, h: 1 },
          ],
        },
      ]),
      tableResponder(BASE_TABLE),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('table', 'svc.db.schema.orders');
    await settle(wrapper);
    expect(wrapper.findAllComponents(GenericTab).length).toBe(1);
    const unknown = cellFor(wrapper, 'KnowledgePanel.NotARealWidget');
    expect(unknown.exists()).toBe(true);
    expect(unknown.text()).toBe('');
    const unmapped = cellFor(wrapper, DetailWidgetKeys.ASSET_HEALTH);
    expect(unmapped.exists()).toBe(true);
    expect(unmapped.text()).toBe('');
    expect(wrapper.find('[data-testid="asset-schema-table"]').exists()).toBe(false);
    wrapper.unmount();
  }, 20000);

  it.each([
    ['an empty layout array', { id: 'schema', name: 'schema', layout: [] }],
    ['a missing layout', { id: 'schema', name: 'schema' }],
    ['a non-array layout', { id: 'schema', name: 'schema', layout: {} }],
  ])('renders an empty grid with no default-pane leak for %s', async (_label, entry) => {
    stubWithDoc(docWithPage('Table', [entry]), tableResponder(BASE_TABLE));
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('table', 'svc.db.schema.orders');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('layout')).toEqual([]);
    expect(wrapper.find('[data-testid="asset-schema-table"]').exists()).toBe(false);
    wrapper.unmount();
  }, 20000);

  it('renders default panes for a non-mount tab even when it carries a layout', async () => {
    // Corrected activation: officially only the Table `schema` tab
    // mounts the widget grid; `lineage` renders fixed children, so a
    // stored lineage layout never activates a grid — the entry is
    // read for tab order/labels only. The schema tab is unlisted, so
    // replacement semantics remove it (F-2) and its default pane is
    // gone as well; only the lineage pane renders.
    stubWithDoc(
      docWithPage('Table', [
        {
          id: 'lineage',
          name: 'lineage',
          layout: [{ i: DetailWidgetKeys.DESCRIPTION, x: 0, y: 0, w: 8, h: 1 }],
        },
      ]),
      tableResponder(BASE_TABLE),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('table', 'svc.db.schema.orders');
    await settle(wrapper);
    expect(wrapper.findAllComponents(GenericTab).length).toBe(0);
    expect(wrapper.find('[data-testid="asset-schema-table"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="lineage-open-full-page"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-widget-description"]').exists()).toBe(false);
    wrapper.unmount();
  }, 20000);

  it('renders default panes for a non-mount tab carrying an empty layout', async () => {
    // The editor-saved shape for every non-editable tab: an entry
    // with `layout: []`. On a non-mount tab that entry must not
    // produce an empty grid — the fixed children render instead.
    // With a lineage-only list, only the lineage pane renders; the
    // unlisted schema tab and its pane are removed (F-2).
    stubWithDoc(
      docWithPage('Table', [{ id: 'lineage', name: 'lineage', layout: [] }]),
      tableResponder(BASE_TABLE),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('table', 'svc.db.schema.orders');
    await settle(wrapper);
    expect(wrapper.findAllComponents(GenericTab).length).toBe(0);
    expect(wrapper.find('[data-testid="asset-schema-table"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="lineage-open-full-page"]').exists()).toBe(true);
    wrapper.unmount();
  }, 20000);

  it('renders the grid only on the mount tab for a realistic editor-saved Table page', async () => {
    // Decisive regression test for the activation narrowing: the
    // editor saves an entry per default tab, with a layout only on
    // the editable `schema` tab and `layout: []` on the rest. Only
    // `schema` may render the grid; every other tab keeps its
    // existing pane.
    const schemaLayout = [
      { i: DetailWidgetKeys.TABLE_SCHEMA, x: 0, y: 0, w: 6, h: 4 },
      { i: DetailWidgetKeys.DESCRIPTION, x: 6, y: 0, w: 2, h: 1 },
    ];
    const editorSavedTabs = [
      { id: 'schema', name: 'schema', editable: true, layout: schemaLayout },
      { id: 'activity_feed', name: 'activity_feed', editable: false, layout: [] },
      { id: 'sample_data', name: 'sample_data', editable: false, layout: [] },
      { id: 'table_queries', name: 'table_queries', editable: false, layout: [] },
      { id: 'profiler', name: 'profiler', editable: false, layout: [] },
      { id: 'lineage', name: 'lineage', editable: false, layout: [] },
      { id: 'dbt', name: 'dbt', editable: false, layout: [] },
      { id: 'view_definition', name: 'view_definition', editable: false, layout: [] },
      { id: 'contract', name: 'contract', editable: false, layout: [] },
      { id: 'custom_properties', name: 'custom_properties', editable: false, layout: [] },
    ];
    stubWithDoc(docWithPage('Table', editorSavedTabs), (url) => {
      if (url.includes('/api/v1/tables/name/') && url.includes('/columns')) {
        // D-2 batch 3: the schema table self-fetches its columns.
        return jsonResponse({ data: BASE_TABLE.columns, paging: { total: 1 } });
      }
      if (url.includes('/api/v1/tables/name/')) {
        return jsonResponse(BASE_TABLE);
      }
      if (url.includes('/sampleData')) {
        return jsonResponse({ sampleData: { columns: ['id'], rows: [[42]] } });
      }
      return null;
    });
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('table', 'svc.db.schema.orders');
    await settle(wrapper);
    // Exactly one grid, on the mount tab, with the stored layout.
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('layout')).toEqual(schemaLayout);
    expect(grids[0].props('pageType')).toBe('Table');
    // The schema table renders once, inside its grid cell.
    expect(wrapper.findAll('[data-testid="asset-schema-table"]').length).toBe(1);
    expect(
      cellFor(wrapper, DetailWidgetKeys.TABLE_SCHEMA)
        .find('[data-testid="asset-schema-table"]')
        .exists(),
    ).toBe(true);
    // Non-mount tabs keep their existing panes.
    expect(wrapper.find('[data-testid="asset-activity-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-sample-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-data-quality-tab"]').exists()).toBe(true);
    const shell = wrapper.findComponent(EntityDetailShell);
    expect(shell.exists()).toBe(true);
    await shell.vm.$emit('update:activeTab', 'profiler');
    await settle(wrapper);
    expect(wrapper.find('[data-testid="table-profiler-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-open-full-page"]').exists()).toBe(true);
    // The queries pane mounts only while its tab is selected: switch
    // tabs through the shell and confirm the default pane renders
    // instead of a grid.
    await shell.vm.$emit('update:activeTab', 'table_queries');
    await settle(wrapper);
    expect(wrapper.findAllComponents(GenericTab).length).toBe(1);
    expect(wrapper.find('[data-testid="queries-container"]').exists()).toBe(true);
    wrapper.unmount();
  }, 20000);

  it('renders existing panes with no grid when there is no persona document', async () => {
    stubWithDoc(null, tableResponder(BASE_TABLE));
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('table', 'svc.db.schema.orders');
    await settle(wrapper);
    expect(wrapper.findAllComponents(GenericTab).length).toBe(0);
    expect(wrapper.find('[data-testid="asset-schema-table"]').exists()).toBe(true);
    wrapper.unmount();
  }, 20000);

  it('renders existing panes with no grid when the customized page carries no tab list (Batch 6)', async () => {
    // Batch 6 mount-gate convergence: with the registry empty, a
    // customized page without a `tabs` list leaves the default tabs
    // in place but no entry resolves for the mount slot, so the grid
    // stays unmounted and the default pane renders — the same
    // no-entry behavior as with no persona document at all.
    stubWithDoc(
      {
        name: 'analyst-persona',
        fullyQualifiedName: 'persona.analyst',
        entityType: 'Page',
        data: { pages: [{ pageType: 'Table' }] },
      },
      tableResponder(BASE_TABLE),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('table', 'svc.db.schema.orders');
    await settle(wrapper);
    expect(wrapper.findAllComponents(GenericTab).length).toBe(0);
    expect(wrapper.find('[data-testid="asset-schema-table"]').exists()).toBe(true);
    wrapper.unmount();
  }, 20000);

  it('renders the D-F2 Tags and Glossary Terms columns with per-source chips (read-only without permission)', async () => {
    const table = {
      ...BASE_TABLE,
      columns: [
        {
          name: 'email',
          dataType: 'VARCHAR',
          fullyQualifiedName: 'svc.db.schema.orders.email',
          tags: [
            { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Generated' },
            { tagFQN: 'Glossary.Contact', name: 'Contact', source: 'Glossary', labelType: 'Manual' },
          ],
        },
      ],
    };
    stubWithDoc(null, tableResponder(table));
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('table', 'svc.db.schema.orders');
    await settle(wrapper);
    const schemaTable = wrapper.find('[data-testid="asset-schema-table"]');
    expect(schemaTable.exists()).toBe(true);
    expect(schemaTable.text()).toContain('Tags');
    expect(schemaTable.text()).toContain('Glossary Terms');
    expect(schemaTable.text()).toContain('Email');
    expect(schemaTable.text()).toContain('Contact');
    // The permission read 404s in this stub, so the cells fail closed to
    // read-only: no inline editor is offered.
    expect(schemaTable.find('[data-testid="schema-tag-select-Classification-email"]').exists()).toBe(false);
    expect(schemaTable.find('[data-testid="schema-tag-select-Glossary-email"]').exists()).toBe(false);
    wrapper.unmount();
  }, 20000);

  it('filters Table columns server-side when a tag is picked in the Tags column (D-F2-2)', async () => {
    const table = {
      ...BASE_TABLE,
      columns: [
        {
          name: 'email',
          dataType: 'VARCHAR',
          fullyQualifiedName: 'svc.db.schema.orders.email',
          tags: [
            { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Generated' },
            { tagFQN: 'Glossary.Contact', name: 'Contact', source: 'Glossary', labelType: 'Manual' },
          ],
        },
        { name: 'id', dataType: 'BIGINT', fullyQualifiedName: 'svc.db.schema.orders.id' },
      ],
    };
    stubWithDoc(null, (url) => {
      if (url.includes('/columns/search')) {
        return jsonResponse({ data: [table.columns[0]], paging: { total: 1 } });
      }
      return tableResponder(table)(url);
    });
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('table', 'svc.db.schema.orders');
    await settle(wrapper);
    const schemaTable = wrapper.find('[data-testid="asset-schema-table"]');
    expect(schemaTable.findAll('.ant-table-row')).toHaveLength(2);
    const triggers = schemaTable.findAll('.ant-table-filter-trigger');
    expect(triggers).toHaveLength(2);
    await triggers[0].trigger('click');
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const options = [...document.querySelectorAll('.column-filter__row input')];
    expect(options).toHaveLength(1);
    (options[0] as HTMLElement).click();
    await settle(wrapper);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await settle(wrapper);
    const searchUrls = vi
      .mocked(fetch)
      .mock.calls.map((call) => String(call[0]))
      .filter((url) => url.includes('/columns/search'));
    expect(searchUrls).toHaveLength(1);
    expect(decodeURIComponent(searchUrls[0])).toContain('tags=PII.Email');
    expect(schemaTable.findAll('.ant-table-row')).toHaveLength(1);
    expect(schemaTable.text()).toContain('email');
    wrapper.unmount();
  }, 20000);

  it('returns to the detail rows when the Table tag filter is cleared (D-F2-2)', async () => {
    const table = {
      ...BASE_TABLE,
      columns: [
        {
          name: 'email',
          dataType: 'VARCHAR',
          fullyQualifiedName: 'svc.db.schema.orders.email',
          tags: [{ tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Generated' }],
        },
        { name: 'id', dataType: 'BIGINT', fullyQualifiedName: 'svc.db.schema.orders.id' },
      ],
    };
    stubWithDoc(null, (url) => {
      if (url.includes('/columns/search')) {
        return jsonResponse({ data: [table.columns[0]], paging: { total: 1 } });
      }
      return tableResponder(table)(url);
    });
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('table', 'svc.db.schema.orders');
    await settle(wrapper);
    const schemaTable = wrapper.find('[data-testid="asset-schema-table"]');
    const pick = async () => {
      await schemaTable.findAll('.ant-table-filter-trigger')[0].trigger('click');
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const options = [...document.querySelectorAll('.column-filter__row input')];
      expect(options).toHaveLength(1);
      (options[0] as HTMLElement).click();
      await settle(wrapper);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await settle(wrapper);
    };
    await pick();
    expect(schemaTable.findAll('.ant-table-row')).toHaveLength(1);
    await pick();
    expect(schemaTable.findAll('.ant-table-row')).toHaveLength(2);
    const searchUrls = vi
      .mocked(fetch)
      .mock.calls.map((call) => String(call[0]))
      .filter((url) => url.includes('/columns/search'));
    expect(searchUrls).toHaveLength(1);
    wrapper.unmount();
  }, 20000);

  it('filters Topic fields locally with no server search request (D-F2-2)', async () => {
    const topic = {
      id: 't-1',
      name: 'events',
      fullyQualifiedName: 'kafka.events',
      owners: [],
      tags: [],
      domains: [],
      messageSchema: {
        schemaFields: [
          {
            name: 'email',
            dataType: 'STRING',
            fullyQualifiedName: 'kafka.events.email',
            tags: [{ tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Manual' }],
          },
          { name: 'id', dataType: 'STRING', fullyQualifiedName: 'kafka.events.id' },
        ],
      },
      service: { name: 'kafka' },
    };
    stubWithDoc(null, (url) => (url.includes('/api/v1/topics/name/') ? jsonResponse(topic) : null));
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('topic', 'kafka.events', { tab: 'schema' });
    await settle(wrapper);
    const schemaTable = wrapper.find('[data-testid="asset-schema-table"]');
    expect(schemaTable.exists()).toBe(true);
    expect(schemaTable.findAll('.ant-table-row')).toHaveLength(2);
    await schemaTable.findAll('.ant-table-filter-trigger')[0].trigger('click');
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const options = [...document.querySelectorAll('.column-filter__row input')];
    expect(options).toHaveLength(1);
    (options[0] as HTMLElement).click();
    await settle(wrapper);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await settle(wrapper);
    const searchUrls = vi
      .mocked(fetch)
      .mock.calls.map((call) => String(call[0]))
      .filter((url) => url.includes('/columns/search'));
    expect(searchUrls).toHaveLength(0);
    expect(schemaTable.findAll('.ant-table-row')).toHaveLength(1);
    expect(schemaTable.text()).toContain('email');
    wrapper.unmount();
  }, 20000);

  it('maps the metric-definition widget to the metric expression on the metric overview tab', async () => {
    stubWithDoc(
      docWithPage('Metric', [
        {
          id: 'overview',
          name: 'overview',
          layout: [{ i: DetailWidgetKeys.METRIC_DEFINITION, x: 0, y: 0, w: 8, h: 2 }],
        },
      ]),
      (url) =>
        url.includes('/api/v1/metrics/name/')
          ? jsonResponse({
              id: 'm-1',
              name: 'mau',
              fullyQualifiedName: 'kpi.mau',
              metricType: 'COUNT',
              metricExpression: { language: 'SQL', code: 'SELECT 1' },
            })
          : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTypedView('metric', 'kpi.mau');
    await settle(wrapper);
    expect(wrapper.findAllComponents(GenericTab).length).toBe(1);
    const cell = cellFor(wrapper, DetailWidgetKeys.METRIC_DEFINITION);
    expect(cell.find('[data-testid="metric-definition-card"]').exists()).toBe(true);
    expect(cell.find('[data-testid="metric-expression-code"]').exists()).toBe(true);
    expect(cell.text()).toContain('SELECT 1');
    expect(wrapper.findAll('[data-testid="metric-definition-card"]').length).toBe(1);
    wrapper.unmount();
  }, 20000);

  it('maps the pipeline-tasks widget to the task graph on the catalog pipeline tasks tab', async () => {
    stubWithDoc(
      docWithPage('Pipeline', [
        {
          id: 'tasks',
          name: 'tasks',
          layout: [{ i: DetailWidgetKeys.PIPELINE_TASKS, x: 0, y: 0, w: 8, h: 4 }],
        },
      ]),
      (url) => {
        if (url.includes('/api/v1/pipelines/name/')) {
          return jsonResponse({
            id: 'pipe-1',
            name: 'daily_etl',
            fullyQualifiedName: 'airflow.daily_etl',
            tasks: [
              { name: 'extract', displayName: 'Extract', downstreamTasks: ['load'] },
              { name: 'load', downstreamTasks: [] },
            ],
            service: { name: 'airflow' },
          });
        }
        if (url.includes('/api/v1/pipelines/') && url.includes('/status')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return null;
      },
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTypedView('pipeline', 'airflow.daily_etl');
    await settle(wrapper);
    expect(wrapper.findAllComponents(GenericTab).length).toBe(1);
    const cell = cellFor(wrapper, DetailWidgetKeys.PIPELINE_TASKS);
    // The tasks widget defaults to the List view (pin PipelineTaskTab).
    expect(cell.find('[data-testid="task-table"]').exists()).toBe(true);
    expect(cell.text()).toContain('Extract');
    const dagOption = [...cell.findAll('.ant-segmented-item')].find((item) =>
      item.text().includes('Dag'),
    );
    expect(dagOption).toBeDefined();
    await dagOption!.trigger('click');
    await flushPromises();
    expect(cell.find('[data-testid="pipeline-task-graph"]').exists()).toBe(true);
    expect(cell.find('[data-testid="pipeline-task-extract"]').exists()).toBe(true);
    wrapper.unmount();
  }, 20000);

  it('resolves the API-endpoints widget through the apiEndpoint alias to the collection tab', async () => {
    stubWithDoc(
      docWithPage('APICollection', [
        {
          id: 'apiEndpoint',
          name: 'apiEndpoint',
          layout: [{ i: DetailWidgetKeys.API_ENDPOINTS, x: 0, y: 0, w: 8, h: 2 }],
        },
      ]),
      (url) => {
        if (url.includes('/api/v1/apiCollections/name/')) {
          return jsonResponse({
            id: 'ac-1',
            name: 'petstore',
            fullyQualifiedName: 'svc.petstore',
            description: 'Petstore API',
            owners: [],
            tags: [],
            domains: [],
            service: { name: 'rest', displayName: 'REST' },
          });
        }
        if (url.includes('/api/v1/apiEndpoints')) {
          return jsonResponse({
            data: [
              { name: 'getPet', endpointURL: '/pets/{id}', requestMethod: 'GET', fullyQualifiedName: 'svc.petstore.getPet' },
            ],
            paging: { total: 1 },
          });
        }
        return null;
      },
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('apiCollection', 'svc.petstore');
    await settle(wrapper);
    // The entry id is the official `apiEndpoint`; the rendered tab is
    // `apiEndpoints` — the layout resolves by entry id, not by the
    // rendered key, so the grid is non-empty.
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('layout')).toHaveLength(1);
    const cell = cellFor(wrapper, DetailWidgetKeys.API_ENDPOINTS);
    expect(cell.find('[data-testid="asset-api-endpoints-table"]').exists()).toBe(true);
    expect(cell.text()).toContain('getPet');
    wrapper.unmount();
  }, 20000);

  it('maps the charts-table widget to the charts tables on the dashboard details tab', async () => {
    stubWithDoc(
      docWithPage('Dashboard', [
        {
          id: 'details',
          name: 'details',
          layout: [{ i: DetailWidgetKeys.CHARTS_TABLE, x: 0, y: 0, w: 8, h: 2 }],
        },
      ]),
      (url) =>
        url.includes('/api/v1/dashboards/name/')
          ? jsonResponse({
              id: 'dash-1',
              name: 'sales',
              fullyQualifiedName: 'bi.sales',
              project: 'Finance',
              charts: [{ id: 'chart-1', name: 'revenue', type: 'chart' }],
              dataModels: [{ name: 'sales_model', type: 'dashboardDataModel' }],
              service: { name: 'superset' },
            })
          : url.includes('/api/v1/charts/chart-1')
            ? jsonResponse({
                id: 'chart-1',
                name: 'revenue',
                fullyQualifiedName: 'bi.sales.revenue',
                chartType: 'Bar',
                tags: [],
              })
            : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTypedView('dashboard', 'bi.sales');
    await settle(wrapper);
    expect(wrapper.findAllComponents(GenericTab).length).toBe(1);
    const cell = cellFor(wrapper, DetailWidgetKeys.CHARTS_TABLE);
    expect(cell.find('[data-testid="dashboard-chart-table"]').exists()).toBe(true);
    expect(cell.text()).toContain('revenue');
    expect(cell.find('[data-testid="asset-data-models-table"]').exists()).toBe(true);
    wrapper.unmount();
  }, 20000);

  it('mounts the endpoint grid through the schema alias on the APIEndpoint mount tab', async () => {
    // Officially the mount tab is `schema` (APIEndpointUtils mounts
    // GenericTab on SCHEMA); the product endpoint tab set has no
    // `schema` key, and the tab-layer alias maps `schema` to the
    // rendered `endpoint` tab carrying the request/response schema
    // pane. A realistic editor-saved page — `schema` carrying the
    // APISchema layout, the rest `[]` — mounts exactly one grid on
    // the endpoint tab; the non-mount entries add no grids.
    stubWithDoc(
      docWithPage('APIEndpoint', [
        {
          id: 'schema',
          name: 'schema',
          editable: true,
          layout: [{ i: DetailWidgetKeys.API_SCHEMA, x: 0, y: 0, w: 8, h: 2 }],
        },
        { id: 'activity_feed', name: 'activity_feed', editable: false, layout: [] },
        { id: 'lineage', name: 'lineage', editable: false, layout: [] },
        { id: 'contract', name: 'contract', editable: false, layout: [] },
        { id: 'custom_properties', name: 'custom_properties', editable: false, layout: [] },
      ]),
      (url) =>
        url.includes('/api/v1/apiEndpoints/name/')
          ? jsonResponse({
              id: 'ae-1',
              name: 'getPet',
              fullyQualifiedName: 'svc.petstore.getPet',
              endpointURL: '/pets/{id}',
              requestMethod: 'GET',
              requestSchema: { type: 'object', properties: { id: { type: 'integer' } } },
              responseSchema: { type: 'object' },
              owners: [],
              tags: [],
              domains: [],
            })
          : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('apiEndpoint', 'svc.petstore.getPet');
    await settle(wrapper);
    expect(wrapper.findAllComponents(GenericTab).length).toBe(1);
    const cell = cellFor(wrapper, DetailWidgetKeys.API_SCHEMA);
    expect(cell.find('[data-testid="asset-api-request-schema"]').exists()).toBe(true);
    expect(cell.text()).toContain('/pets/{id}');
    wrapper.unmount();
  }, 20000);

  it('mounts the Chart grid on the overview tab through the details alias', async () => {
    // Chart is not a split view: its fallback tab set has no
    // `details` key, and the tab-layer alias maps the official mount
    // id `details` to the rendered `overview` tab. The mount check
    // runs on the entry id, so the grid activates; the non-mount
    // entries add no further grids.
    stubWithDoc(
      docWithPage('Chart', [
        {
          id: 'details',
          name: 'details',
          editable: true,
          layout: [{ i: DetailWidgetKeys.DESCRIPTION, x: 0, y: 0, w: 8, h: 1 }],
        },
        { id: 'activity_feed', name: 'activity_feed', editable: false, layout: [] },
        { id: 'lineage', name: 'lineage', editable: false, layout: [] },
        { id: 'contract', name: 'contract', editable: false, layout: [] },
        { id: 'custom_properties', name: 'custom_properties', editable: false, layout: [] },
      ]),
      (url) =>
        url.includes('/api/v1/charts/name/')
          ? jsonResponse({
              id: 'ch-1',
              name: 'revenue',
              fullyQualifiedName: 'bi.sales.revenue',
              description: 'Revenue chart',
              chartType: 'Bar',
              service: { name: 'superset' },
              dashboards: [{ name: 'sales', type: 'dashboard' }],
            })
          : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTypedView('chart', 'bi.sales.revenue');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('pageType')).toBe('Chart');
    expect(grids[0].props('layout')).toHaveLength(1);
    const cell = cellFor(wrapper, DetailWidgetKeys.DESCRIPTION);
    expect(cell.find('[data-testid="asset-widget-description"]').exists()).toBe(true);
    expect(cell.text()).toContain('Revenue chart');
    wrapper.unmount();
  }, 20000);

  it('renders an empty Chart grid with no default-pane leak for an empty details layout', async () => {
    // Mount-tab empty semantics through the alias: an empty `details`
    // layout renders an empty grid on `overview`, not the default
    // overview fields (the chart type row must not leak in).
    stubWithDoc(
      docWithPage('Chart', [{ id: 'details', name: 'details', layout: [] }]),
      (url) =>
        url.includes('/api/v1/charts/name/')
          ? jsonResponse({
              id: 'ch-1',
              name: 'revenue',
              fullyQualifiedName: 'bi.sales.revenue',
              description: 'Revenue chart',
              chartType: 'Bar',
              service: { name: 'superset' },
              dashboards: [{ name: 'sales', type: 'dashboard' }],
            })
          : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTypedView('chart', 'bi.sales.revenue');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('layout')).toEqual([]);
    expect(wrapper.text()).not.toContain('Bar');
    wrapper.unmount();
  }, 20000);

  it('mounts only the schema grid for a Container with a non-empty data model', async () => {
    // Container mount mutual exclusion (official
    // ContainerDetailUtils.tsx:103-152): a non-empty data model mounts
    // GenericTab ONLY on SCHEMA; CHILDREN renders its fixed children
    // (the related panel). The previous form of this test asserted
    // both grids for a non-empty data model, contradicting the
    // official exclusion; it is redirected here at equal strength
    // (one grid, its layout, and both panes pinned). Non-mount
    // entries with `[]` add no grids.
    const schemaLayout = [{ i: DetailWidgetKeys.CONTAINER_SCHEMA, x: 0, y: 0, w: 8, h: 2 }];
    const childrenLayout = [{ i: DetailWidgetKeys.CONTAINER_CHILDREN, x: 0, y: 0, w: 8, h: 2 }];
    stubWithDoc(
      docWithPage('Container', [
        { id: 'schema', name: 'schema', editable: true, layout: schemaLayout },
        { id: 'children', name: 'children', editable: true, layout: childrenLayout },
        { id: 'sample_data', name: 'sample_data', editable: false, layout: [] },
        { id: 'activity_feed', name: 'activity_feed', editable: false, layout: [] },
        { id: 'lineage', name: 'lineage', editable: false, layout: [] },
        { id: 'contract', name: 'contract', editable: false, layout: [] },
        { id: 'custom_properties', name: 'custom_properties', editable: false, layout: [] },
      ]),
      (url) =>
        url.includes('/api/v1/containers/name/')
          ? jsonResponse({
              id: 'ct-1',
              name: 'landing',
              fullyQualifiedName: 's3.landing',
              description: 'Landing bucket',
              dataModel: { columns: [{ name: 'key', dataType: 'STRING' }] },
              children: [{ name: 'child1', type: 'container' }],
              service: { name: 's3' },
            })
          : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTypedView('container', 's3.landing');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('layout')).toEqual(schemaLayout);
    expect(grids[0].props('pageType')).toBe('Container');
    expect(
      cellFor(wrapper, DetailWidgetKeys.CONTAINER_SCHEMA)
        .find('[data-testid="asset-schema-table"]')
        .exists(),
    ).toBe(true);
    expect(cellFor(wrapper, DetailWidgetKeys.CONTAINER_CHILDREN).exists()).toBe(false);
    // The excluded children tab renders its default pane, not a grid:
    // exactly one related table, outside any widget cell.
    expect(wrapper.findAll('[data-testid="asset-related-table"]').length).toBe(1);
    wrapper.unmount();
  }, 20000);

  it('mounts only the children grid for a Container with an empty data model', async () => {
    // The other half of the exclusion: no data model mounts GenericTab
    // ONLY on CHILDREN; SCHEMA renders its default pane (the schema
    // piece, empty here because there are no columns). The children
    // cell renders the ContainerChildrenWidget, which self-fetches from
    // the children endpoint (pin ContainerChildren) — never the
    // embedded `children` refs.
    const schemaLayout = [{ i: DetailWidgetKeys.CONTAINER_SCHEMA, x: 0, y: 0, w: 8, h: 2 }];
    const childrenLayout = [{ i: DetailWidgetKeys.CONTAINER_CHILDREN, x: 0, y: 0, w: 8, h: 2 }];
    stubWithDoc(
      docWithPage('Container', [
        { id: 'schema', name: 'schema', editable: true, layout: schemaLayout },
        { id: 'children', name: 'children', editable: true, layout: childrenLayout },
        { id: 'sample_data', name: 'sample_data', editable: false, layout: [] },
        { id: 'activity_feed', name: 'activity_feed', editable: false, layout: [] },
        { id: 'lineage', name: 'lineage', editable: false, layout: [] },
        { id: 'contract', name: 'contract', editable: false, layout: [] },
        { id: 'custom_properties', name: 'custom_properties', editable: false, layout: [] },
      ]),
      (url) =>
        url.includes('/api/v1/containers/name/s3.landing/children')
          ? jsonResponse({
              data: [{ id: 'ct-2', name: 'child1', fullyQualifiedName: 's3.landing.child1', description: 'Child bucket' }],
              paging: { total: 1 },
            })
          : url.includes('/api/v1/containers/name/')
            ? jsonResponse({
                id: 'ct-1',
                name: 'landing',
                fullyQualifiedName: 's3.landing',
                description: 'Landing bucket',
                children: [{ name: 'child1', type: 'container' }],
                service: { name: 's3' },
              })
            : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTypedView('container', 's3.landing');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('layout')).toEqual(childrenLayout);
    expect(grids[0].props('pageType')).toBe('Container');
    const childrenCell = cellFor(wrapper, DetailWidgetKeys.CONTAINER_CHILDREN);
    expect(childrenCell.find('[data-testid="container-list-table"]').exists()).toBe(true);
    expect(childrenCell.text()).toContain('child1');
    expect(cellFor(wrapper, DetailWidgetKeys.CONTAINER_SCHEMA).exists()).toBe(false);
    // The excluded schema tab renders its default pane: the schema
    // piece with no rows shows the empty state, not a table.
    expect(wrapper.findAll('[data-testid="asset-schema-empty"]').length).toBe(1);
    expect(wrapper.findAll('[data-testid="asset-schema-table"]').length).toBe(0);
    wrapper.unmount();
  }, 20000);

  it('keeps only the listed lineage tab on a Chart page listing lineage alone (F-2)', async () => {
    // Official Chart TabsIds have no Quality tab, so it is not
    // preserved. `overview` resolves through the `details` alias,
    // so it is removed when `details` is unlisted.
    stubWithDoc(
      docWithPage('Chart', [{ id: 'lineage', name: 'lineage' }]),
      (url) =>
        url.includes('/api/v1/charts/name/')
          ? jsonResponse({
              id: 'ch-1',
              name: 'revenue',
              fullyQualifiedName: 'bi.sales.revenue',
              description: 'Revenue chart',
              chartType: 'Bar',
              service: { name: 'superset' },
              dashboards: [{ name: 'sales', type: 'dashboard' }],
            })
          : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTypedView('chart', 'bi.sales.revenue');
    await settle(wrapper);
    expect(tabLabels(wrapper)).toEqual(['Lineage']);
    expect(wrapper.find('[data-testid="asset-tab-quality"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="asset-data-quality-tab"]').exists()).toBe(false);
    wrapper.unmount();
  }, 20000);

  it('keeps only the preserved overview tab on an APICollection page listing activity alone (F-2)', async () => {
    // The APICollection tab builders and TabsIds carry no OVERVIEW,
    // so the product `overview` tab is preserved; the endpoints and
    // custom-properties tabs are removed when unlisted.
    stubWithDoc(
      docWithPage('APICollection', [{ id: 'activity_feed', name: 'activity_feed' }]),
      (url) => {
        if (url.includes('/api/v1/apiCollections/name/')) {
          return jsonResponse({
            id: 'ac-1',
            name: 'petstore',
            fullyQualifiedName: 'svc.petstore',
            description: 'Petstore API',
            owners: [],
            tags: [],
            domains: [],
            service: { name: 'rest', displayName: 'REST' },
          });
        }
        if (url.includes('/api/v1/apiEndpoints')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return null;
      },
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('apiCollection', 'svc.petstore');
    await settle(wrapper);
    expect(tabLabels(wrapper)).toEqual(['Activity feed', 'Overview']);
    wrapper.unmount();
  }, 20000);

  it('does not keep a product-invented overview tab on a catalog Pipeline page listing tasks alone (F-2)', async () => {
    // Official Pipeline TabsIds have no Quality tab and no OVERVIEW.
    // A tasks-only customization therefore renders Tasks alone; the
    // product must not preserve a fallback overview official does not have.
    stubWithDoc(
      docWithPage('Pipeline', [{ id: 'tasks', name: 'tasks' }]),
      (url) => {
        if (url.includes('/api/v1/pipelines/name/')) {
          return jsonResponse({
            id: 'pipe-1',
            name: 'daily_etl',
            fullyQualifiedName: 'airflow.daily_etl',
            tasks: [
              { name: 'extract', displayName: 'Extract', downstreamTasks: ['load'] },
              { name: 'load', downstreamTasks: [] },
            ],
            service: { name: 'airflow' },
          });
        }
        if (url.includes('/api/v1/pipelines/') && url.includes('/status')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return null;
      },
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTypedView('pipeline', 'airflow.daily_etl');
    await settle(wrapper);
    expect(tabLabels(wrapper)).toEqual(['Tasks']);
    expect(wrapper.find('[data-testid="asset-tab-quality"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="asset-data-quality-tab"]').exists()).toBe(false);
    wrapper.unmount();
  }, 20000);

  it('renders no tab bar for an explicitly empty Table tab list without throwing (F-1/F-2)', async () => {
    stubWithDoc(docWithPage('Table', []), tableResponder(BASE_TABLE));
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('table', 'svc.db.schema.orders');
    await settle(wrapper);
    expect(wrapper.find('.ant-tabs-nav').exists()).toBe(false);
    expect(wrapper.findAllComponents(GenericTab).length).toBe(0);
    expect(wrapper.text()).toContain('orders');
    wrapper.unmount();
  }, 20000);

  it('falls back to the first rendered tab when a late persona document removes the deep-linked tab (B-1)', async () => {
    // Race path: `load()` derives `activeTab` once from `?tab=` while
    // the persona document is still in flight, so the deep-linked
    // tab is in the default list at derivation time; when the
    // document arrives and removes it, the shell clamp must move
    // the visible selection to the first rendered tab (official
    // `getRenderedActiveTab`), not leave a blank content area. The
    // gate holds the document back until after the entity load, so
    // the interleaving is deterministic rather than timing luck.
    let releaseDoc!: () => void;
    const docGate = new Promise<void>((resolve) => {
      releaseDoc = resolve;
    });
    stubWithDoc(
      docWithPage('Table', [
        { id: 'schema', name: 'schema' },
        { id: 'activity_feed', name: 'activity_feed' },
      ]),
      tableResponder(BASE_TABLE),
      docGate,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('table', 'svc.db.schema.orders', { tab: 'lineage' });
    await settle(wrapper);
    // Precondition: with the document still gated, the deep-linked
    // lineage tab is selected from the default list.
    expect(tabLabels(wrapper)[0]).toBe('Schema');
    expect(wrapper.find('.ant-tabs-nav').findAll('.ant-tabs-tab-active')[0].text()).toContain('Lineage');
    releaseDoc();
    await settle(wrapper);
    expect(tabLabels(wrapper)).toEqual(['Schema', 'Activity feed']);
    const activeNav = wrapper.find('.ant-tabs-nav').findAll('.ant-tabs-tab-active');
    expect(activeNav).toHaveLength(1);
    expect(activeNav[0].text()).toContain('Schema');
    expect(wrapper.findAll('.ant-tabs-tabpane-active')).toHaveLength(1);
    wrapper.unmount();
  }, 20000);

  it('keeps the preserved overview tab and resolves schema to the endpoint tab on an APIEndpoint page (M-1)', async () => {
    // Split API branch: the APIEndpoint TabsIds carry no OVERVIEW, so
    // `overview` is preserved, and the official `schema` id resolves
    // to the product `endpoint` tab through the alias.
    stubWithDoc(
      docWithPage('APIEndpoint', [
        { id: 'schema', name: 'schema' },
        { id: 'activity_feed', name: 'activity_feed' },
      ]),
      (url) =>
        url.includes('/api/v1/apiEndpoints/name/')
          ? jsonResponse({
              id: 'ae-1',
              name: 'getPet',
              fullyQualifiedName: 'svc.petstore.getPet',
              endpointURL: '/pets/{id}',
              requestMethod: 'GET',
              requestSchema: { type: 'object', properties: { id: { type: 'integer' } } },
              responseSchema: { type: 'object' },
              owners: [],
              tags: [],
              domains: [],
            })
          : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('apiEndpoint', 'svc.petstore.getPet');
    await settle(wrapper);
    expect(tabLabels(wrapper)).toEqual(['Endpoint', 'Activity feed', 'Overview']);
    wrapper.unmount();
  }, 20000);

  it('keeps only the preserved overview tab on an APIEndpoint page listing activity alone (M-1)', async () => {
    stubWithDoc(
      docWithPage('APIEndpoint', [{ id: 'activity_feed', name: 'activity_feed' }]),
      (url) =>
        url.includes('/api/v1/apiEndpoints/name/')
          ? jsonResponse({
              id: 'ae-1',
              name: 'getPet',
              fullyQualifiedName: 'svc.petstore.getPet',
              endpointURL: '/pets/{id}',
              requestMethod: 'GET',
              owners: [],
              tags: [],
              domains: [],
            })
          : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('apiEndpoint', 'svc.petstore.getPet');
    await settle(wrapper);
    expect(tabLabels(wrapper)).toEqual(['Activity feed', 'Overview']);
    wrapper.unmount();
  }, 20000);

  it('renders the SearchIndex settings tab when the customization lists its hyphenated id (M-1)', async () => {
    // The official id is `search-index-settings` while the product
    // split key is `search_index_settings`; only the alias resolves
    // it, so without the alias the settings tab would vanish under
    // any customization.
    stubWithDoc(
      docWithPage('SearchIndex', [
        { id: 'fields', name: 'fields' },
        { id: 'search-index-settings', name: 'search-index-settings' },
      ]),
      (url) =>
        url.includes('/api/v1/searchIndexes/name/')
          ? jsonResponse({
              id: 'si-1',
              name: 'table_search_index',
              fullyQualifiedName: 'elasticsearch_sample.table_search_index',
              description: 'Table Search Index',
              fields: [{ name: 'id', dataType: 'KEYWORD' }],
              owners: [],
              tags: [],
              domains: [],
            })
          : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('searchIndex', 'elasticsearch_sample.table_search_index');
    await settle(wrapper);
    expect(tabLabels(wrapper)).toEqual(['Fields', 'Search index settings']);
    wrapper.unmount();
  }, 20000);

  it('removes the SearchIndex settings tab when the customization does not list it (M-1)', async () => {
    // The settings tab is not preserved: an unlisted settings id
    // means the tab is removed, as officially.
    stubWithDoc(
      docWithPage('SearchIndex', [{ id: 'fields', name: 'fields' }]),
      (url) =>
        url.includes('/api/v1/searchIndexes/name/')
          ? jsonResponse({
              id: 'si-1',
              name: 'table_search_index',
              fullyQualifiedName: 'elasticsearch_sample.table_search_index',
              description: 'Table Search Index',
              fields: [{ name: 'id', dataType: 'KEYWORD' }],
              owners: [],
              tags: [],
              domains: [],
            })
          : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('searchIndex', 'elasticsearch_sample.table_search_index');
    await settle(wrapper);
    expect(tabLabels(wrapper)).toEqual(['Fields']);
    wrapper.unmount();
  }, 20000);

  it('mounts the Topic schema grid with the default layout and no default pane when there is no persona document (Batch 6 asset-schema)', async () => {
    stubWithDoc(null, (url) =>
      url.includes('/api/v1/topics/name/')
        ? jsonResponse({
            id: 'tp-1',
            name: 'orders',
            fullyQualifiedName: 'kafka.orders',
            description: 'Orders topic',
            messageSchema: { schemaFields: [{ name: 'id', dataType: 'STRING' }] },
            owners: [],
            tags: [],
            domains: [],
          })
        : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('topic', 'kafka.orders');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('pageType')).toBe('Topic');
    expect(grids[0].props('layout')).toEqual(resolveWidgetLayout('Topic', 'schema', null));
    expect(cellFor(wrapper, DetailWidgetKeys.DESCRIPTION).find('[data-testid="asset-widget-description"]').exists()).toBe(true);
    expect(cellFor(wrapper, DetailWidgetKeys.DESCRIPTION).text()).toContain('Orders topic');
    // One schema table, inside the grid's TopicSchema cell: the
    // retired default pane rendered a second one.
    expect(wrapper.findAll('[data-testid="asset-schema-table"]').length).toBe(1);
    wrapper.unmount();
  }, 20000);

  it('mounts the Container schema grid with the default layout and no default pane when there is no persona document (Batch 6 asset-schema)', async () => {
    stubWithDoc(null, (url) =>
      url.includes('/api/v1/containers/name/')
        ? jsonResponse({
            id: 'ct-1',
            name: 'landing',
            fullyQualifiedName: 's3.landing',
            description: 'Landing bucket',
            dataModel: { columns: [{ name: 'key', dataType: 'STRING' }] },
            children: [{ name: 'child1', type: 'container' }],
            service: { name: 's3' },
          })
        : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('container', 's3.landing');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('pageType')).toBe('Container');
    expect(grids[0].props('layout')).toEqual(resolveWidgetLayout('Container', 'schema', null));
    expect(cellFor(wrapper, DetailWidgetKeys.CONTAINER_SCHEMA).find('[data-testid="asset-schema-table"]').exists()).toBe(true);
    // The children tab is NOT flipped by this lane: no children grid.
    expect(cellFor(wrapper, DetailWidgetKeys.CONTAINER_CHILDREN).exists()).toBe(false);
    wrapper.unmount();
  }, 20000);

  it('keeps the Container schema default pane when there is no persona document and the data model is empty (Batch 6 asset-schema)', async () => {
    // The mutual-exclusion gate returns null for an empty data model,
    // so the guarded #schema default pane renders even though the
    // tab is flipped — the same pane the customized-page test pins.
    // Retargeted at r3: with BOTH Container tabs flipped, the empty
    // model mounts the CHILDREN grid (one GenericTab), while the schema
    // tab keeps its default pane (the schema-empty state).
    stubWithDoc(null, (url) =>
      url.includes('/api/v1/containers/name/')
        ? jsonResponse({
            id: 'ct-1',
            name: 'landing',
            fullyQualifiedName: 's3.landing',
            description: 'Landing bucket',
            children: [{ name: 'child1', type: 'container' }],
            service: { name: 's3' },
          })
        : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('container', 's3.landing');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('pageType')).toBe('Container');
    expect(grids[0].props('layout')).toEqual(resolveWidgetLayout('Container', 'children', null));
    expect(wrapper.findAll('[data-testid="asset-schema-empty"]').length).toBe(1);
    wrapper.unmount();
  }, 20000);

  it('mounts the APIEndpoint endpoint grid with the default layout and no default pane when there is no persona document (Batch 6 asset-schema)', async () => {
    stubWithDoc(null, (url) =>
      url.includes('/api/v1/apiEndpoints/name/')
        ? jsonResponse({
            id: 'ae-1',
            name: 'getPet',
            fullyQualifiedName: 'svc.petstore.getPet',
            endpointURL: '/pets/{id}',
            requestMethod: 'GET',
            requestSchema: { type: 'object', properties: { id: { type: 'integer' } } },
            responseSchema: { type: 'object' },
            owners: [],
            tags: [],
            domains: [],
          })
        : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('apiEndpoint', 'svc.petstore.getPet');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('pageType')).toBe('APIEndpoint');
    expect(grids[0].props('layout')).toEqual(resolveWidgetLayout('APIEndpoint', 'schema', null));
    // One api-schema piece, inside the grid's APISchema cell: the
    // retired endpoint default pane rendered the same piece.
    expect(wrapper.findAll('[data-testid="asset-api-request-schema"]').length).toBe(1);
    expect(wrapper.text()).toContain('/pets/{id}');
    wrapper.unmount();
  }, 20000);

  it('mounts the SearchIndex fields grid with the default layout and no default pane when there is no persona document (Batch 6 asset-schema)', async () => {
    stubWithDoc(null, (url) =>
      url.includes('/api/v1/searchIndexes/name/')
        ? jsonResponse({
            id: 'si-1',
            name: 'table_search_index',
            fullyQualifiedName: 'elasticsearch_sample.table_search_index',
            description: 'Table Search Index',
            fields: [{ name: 'id', dataType: 'KEYWORD' }],
            owners: [],
            tags: [],
            domains: [],
          })
        : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('searchIndex', 'elasticsearch_sample.table_search_index');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('pageType')).toBe('SearchIndex');
    expect(grids[0].props('layout')).toEqual(resolveWidgetLayout('SearchIndex', 'fields', null));
    expect(cellFor(wrapper, DetailWidgetKeys.SEARCH_INDEX_FIELDS).find('[data-testid="asset-schema-table"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="asset-schema-table"]').length).toBe(1);
    wrapper.unmount();
  }, 20000);

  it('mounts the DashboardDataModel model grid with the default layout and no default pane when there is no persona document (Batch 6 asset-schema)', async () => {
    stubWithDoc(null, (url) => {
      if (url.includes('/api/v1/dashboard/datamodels/name/') && url.includes('/columns')) {
        return jsonResponse({ data: [{ name: 'amount', dataType: 'DECIMAL' }], paging: { total: 1 } });
      }
      return url.includes('/api/v1/dashboard/datamodels/name/')
        ? jsonResponse({
            id: 'dm-1',
            name: 'sales_model',
            fullyQualifiedName: 'bi.sales.model',
            dataModelType: 'SupersetDataModel',
            columns: [{ name: 'amount', dataType: 'DECIMAL' }],
          })
        : null;
    });
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('dashboardDataModel', 'bi.sales.model');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('pageType')).toBe('DashboardDataModel');
    expect(grids[0].props('layout')).toEqual(resolveWidgetLayout('DashboardDataModel', 'model', null));
    expect(cellFor(wrapper, DetailWidgetKeys.DATA_MODEL).find('[data-testid="asset-schema-table"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="asset-schema-table"]').length).toBe(1);
    expect(wrapper.text()).toContain('amount');
    // The retired default pane's dataModelType overview row has no
    // pin MODEL widget; it does not survive the flip.
    expect(wrapper.text()).not.toContain('SupersetDataModel');
    wrapper.unmount();
  }, 20000);

  it('mounts the MlModel features grid with the default layout and no default pane when there is no persona document (Batch 6 asset-schema)', async () => {
    stubWithDoc(null, (url) =>
      url.includes('/api/v1/mlmodels/name/')
        ? jsonResponse({
            id: 'ml-1',
            name: 'churn',
            fullyQualifiedName: 'ml.churn',
            description: 'Churn model',
            mlFeatures: [{ name: 'age', dataType: 'INT' }],
            mlHyperParameters: [],
            owners: [],
            tags: [],
            domains: [],
          })
        : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('mlmodel', 'ml.churn');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('pageType')).toBe('MlModel');
    expect(grids[0].props('layout')).toEqual(resolveWidgetLayout('MlModel', 'features', null));
    expect(cellFor(wrapper, DetailWidgetKeys.ML_MODEL_FEATURES).find('[data-testid="asset-features-table"]').exists()).toBe(true);
    expect(cellFor(wrapper, DetailWidgetKeys.ML_MODEL_FEATURES).text()).toContain('age');
    wrapper.unmount();
  }, 20000);

  it('mounts the DatabaseSchema table grid with the default layout and no default pane when there is no persona document (Batch 6 asset-schema)', async () => {
    stubWithDoc(null, (url) =>
      url.includes('/api/v1/databaseSchemas/name/')
        ? jsonResponse({
            id: 'sch-1',
            name: 'marts',
            fullyQualifiedName: 'svc.analytics.marts',
            database: { name: 'analytics' },
            tables: [{ name: 'orders', type: 'table' }],
          })
        : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('databaseSchema', 'svc.analytics.marts');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('pageType')).toBe('DatabaseSchema');
    expect(grids[0].props('layout')).toEqual(resolveWidgetLayout('DatabaseSchema', 'table', null));
    // The TABLES widget shell mounts (its rows need canView + the
    // list fetch, locked by the C-14 retarget instead); the retired
    // related panel is gone.
    expect(cellFor(wrapper, DetailWidgetKeys.TABLES).find('[data-testid="schema-tables-widget"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-related-table"]').exists()).toBe(false);
    wrapper.unmount();
  }, 20000);

  it('mounts the Database schemas grid with the default layout and no default pane when there is no persona document (Batch 6 asset-schema)', async () => {
    stubWithDoc(null, (url) => {
      if (url.includes('/api/v1/databaseSchemas?')) {
        return jsonResponse({ data: [], paging: { total: 0 } });
      }
      return url.includes('/api/v1/databases/name/')
        ? jsonResponse({
            id: 'db-1',
            name: 'analytics',
            fullyQualifiedName: 'svc.analytics',
            service: { name: 'svc' },
            databaseSchemas: [],
          })
        : null;
    });
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('database', 'svc.analytics');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('pageType')).toBe('Database');
    expect(grids[0].props('layout')).toEqual(resolveWidgetLayout('Database', 'schemas', null));
    expect(wrapper.findAll('[data-testid="asset-database-schemas-empty"]').length).toBe(1);
    wrapper.unmount();
  }, 20000);

  it('uses the customized Topic schema layout instead of the default when the persona page carries the tab entry (Batch 6 asset-schema)', async () => {
    // Behavior preserved: a flipped tab with a customized entry
    // renders the entry's layout, exactly as before the flip.
    const layout = [{ i: DetailWidgetKeys.DESCRIPTION, x: 0, y: 0, w: 8, h: 2 }];
    stubWithDoc(
      docWithPage('Topic', [{ id: 'schema', name: 'schema', layout }]),
      (url) =>
        url.includes('/api/v1/topics/name/')
          ? jsonResponse({
              id: 'tp-1',
              name: 'orders',
              fullyQualifiedName: 'kafka.orders',
              description: 'Orders topic',
              messageSchema: { schemaFields: [{ name: 'id', dataType: 'STRING' }] },
              owners: [],
              tags: [],
              domains: [],
            })
          : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('topic', 'kafka.orders');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('layout')).toEqual(layout);
    expect(cellFor(wrapper, DetailWidgetKeys.DESCRIPTION).exists()).toBe(true);
    expect(cellFor(wrapper, DetailWidgetKeys.TOPIC_SCHEMA).exists()).toBe(false);
    wrapper.unmount();
  }, 20000);

  it('mounts the Chart details grid now that the overview tab is flipped (Batch 6 asset-schema, Chart flipped by asset-overview)', async () => {
    // Rewritten at r3: the schema lane originally asserted no grid for the
    // unflipped Chart overview tab; the asset-overview lane flipped
    // Chart/details, so this test now asserts the grid mounts (equal
    // strength — same mount path, flipped expectation). The overview lane's
    // own Chart flip test covers the same behavior via mountTypedView.
    stubWithDoc(null, (url) =>
      url.includes('/api/v1/charts/name/')
        ? jsonResponse({
            id: 'ch-1',
            name: 'revenue',
            fullyQualifiedName: 'bi.sales.revenue',
            description: 'Revenue chart',
            chartType: 'Bar',
            service: { name: 'superset' },
            dashboards: [{ name: 'sales', type: 'dashboard' }],
          })
        : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView('chart', 'bi.sales.revenue');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('pageType')).toBe('Chart');
    expect(grids[0].props('layout')).toEqual(resolveWidgetLayout('Chart', 'details', null));
    expect(cellFor(wrapper, DetailWidgetKeys.DESCRIPTION).find('[data-testid="asset-widget-description"]').exists()).toBe(true);
    expect(cellFor(wrapper, DetailWidgetKeys.DESCRIPTION).text()).toContain('Revenue chart');
    // The retired overview pane's chart-type identity row is gone
    // (pin's DETAILS layout has no chart-type widget).
    expect(wrapper.text()).not.toContain('Bar');
    wrapper.unmount();
  }, 20000);

  it('mounts the Dashboard details grid with the default layout and no default pane when there is no persona document (Batch 6 asset-overview)', async () => {
    stubWithDoc(null, (url) =>
      url.includes('/api/v1/charts/chart-1')
        ? jsonResponse({
            id: 'chart-1',
            name: 'revenue',
            fullyQualifiedName: 'bi.sales.revenue',
            chartType: 'Bar',
            tags: [],
          })
        : url.includes('/api/v1/dashboards/name/')
          ? jsonResponse({
              id: 'dash-1',
              name: 'sales',
              fullyQualifiedName: 'bi.sales',
              description: 'Sales dashboard',
              project: 'Finance',
              charts: [{ id: 'chart-1', name: 'revenue', type: 'chart' }],
              dataModels: [{ name: 'sales_model', type: 'dashboardDataModel' }],
              service: { name: 'superset' },
            })
          : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTypedView('dashboard', 'bi.sales');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('pageType')).toBe('Dashboard');
    expect(grids[0].props('layout')).toEqual(resolveWidgetLayout('Dashboard', 'details', null));
    expect(cellFor(wrapper, DetailWidgetKeys.DESCRIPTION).find('[data-testid="asset-widget-description"]').exists()).toBe(true);
    expect(cellFor(wrapper, DetailWidgetKeys.DESCRIPTION).text()).toContain('Sales dashboard');
    // One charts table, inside the grid's ChartsTable cell: the
    // retired default pane rendered the same piece.
    expect(wrapper.findAll('[data-testid="dashboard-chart-table"]').length).toBe(1);
    // The retired pane's project identity row is gone (pin's DETAILS
    // layout has no project widget).
    expect(wrapper.text()).not.toContain('Finance');
    wrapper.unmount();
  }, 20000);

  it('mounts the Chart details grid with the default layout and no default pane when there is no persona document (Batch 6 asset-overview)', async () => {
    stubWithDoc(null, (url) =>
      url.includes('/api/v1/charts/name/')
        ? jsonResponse({
            id: 'ch-1',
            name: 'revenue',
            fullyQualifiedName: 'bi.sales.revenue',
            description: 'Revenue chart',
            chartType: 'Bar',
            service: { name: 'superset' },
            dashboards: [{ name: 'sales', type: 'dashboard' }],
          })
        : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTypedView('chart', 'bi.sales.revenue');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('pageType')).toBe('Chart');
    expect(grids[0].props('layout')).toEqual(resolveWidgetLayout('Chart', 'details', null));
    expect(cellFor(wrapper, DetailWidgetKeys.DESCRIPTION).find('[data-testid="asset-widget-description"]').exists()).toBe(true);
    expect(cellFor(wrapper, DetailWidgetKeys.DESCRIPTION).text()).toContain('Revenue chart');
    // The retired overview pane's chart-type identity row is gone
    // (pin's DETAILS layout has no chart-type widget).
    expect(wrapper.text()).not.toContain('Bar');
    wrapper.unmount();
  }, 20000);

  it('mounts the Pipeline tasks grid with the default layout and no default pane when there is no persona document (Batch 6 asset-overview)', async () => {
    stubWithDoc(null, (url) =>
      url.includes('/api/v1/pipelines/name/')
        ? jsonResponse({
            id: 'pipe-1',
            name: 'daily_etl',
            fullyQualifiedName: 'airflow.daily_etl',
            description: 'Daily ETL',
            tasks: [
              { name: 'extract', displayName: 'Extract', downstreamTasks: ['load'] },
              { name: 'load', downstreamTasks: [] },
            ],
            pipelineStatus: {
              timestamp: 1700000000000,
              executionStatus: 'Successful',
              taskStatus: [{ name: 'extract', executionStatus: 'Successful' }],
            },
            service: { name: 'airflow' },
          })
        : url.includes('/api/v1/pipelines/') && url.includes('/status')
          ? jsonResponse({
              data: [{ timestamp: 1700000000000, executionStatus: 'Successful', executionId: 'run-1' }],
              paging: { total: 1 },
            })
          : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTypedView('pipeline', 'airflow.daily_etl');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('pageType')).toBe('Pipeline');
    expect(grids[0].props('layout')).toEqual(resolveWidgetLayout('Pipeline', 'tasks', null));
    expect(cellFor(wrapper, DetailWidgetKeys.DESCRIPTION).find('[data-testid="asset-widget-description"]').exists()).toBe(true);
    expect(cellFor(wrapper, DetailWidgetKeys.DESCRIPTION).text()).toContain('Daily ETL');
    // The full grid replaces the tasks-only pane: the tasks piece
    // renders inside its PipelineTasks cell, and the description
    // cell (absent from the retired pane) is present.
    expect(cellFor(wrapper, DetailWidgetKeys.PIPELINE_TASKS).find('[data-testid="task-table"]').exists()).toBe(true);
    wrapper.unmount();
  }, 20000);

  it('mounts the StoredProcedure code grid with the default layout and no default pane when there is no persona document (Batch 6 asset-overview)', async () => {
    stubWithDoc(null, (url) =>
      url.includes('/api/v1/storedProcedures/name/')
        ? jsonResponse({
            id: 'sp-1',
            name: 'nightly_cleanup',
            fullyQualifiedName: 'svc.nightly_cleanup',
            description: 'Nightly cleanup',
            storedProcedureCode: { language: 'SQL', code: 'SELECT 1' },
            service: { name: 'svc' },
          })
        : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTypedView('storedProcedure', 'svc.nightly_cleanup');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('pageType')).toBe('StoredProcedure');
    expect(grids[0].props('layout')).toEqual(resolveWidgetLayout('StoredProcedure', 'code', null));
    expect(cellFor(wrapper, DetailWidgetKeys.DESCRIPTION).find('[data-testid="asset-widget-description"]').exists()).toBe(true);
    expect(cellFor(wrapper, DetailWidgetKeys.DESCRIPTION).text()).toContain('Nightly cleanup');
    // One code block, inside the grid's StoredProcedureCode cell:
    // the retired default pane rendered the same piece.
    expect(wrapper.findAll('[data-testid="asset-code-block"]').length).toBe(1);
    expect(wrapper.text()).toContain('SELECT 1');
    wrapper.unmount();
  }, 20000);

  it('mounts the APICollection apiEndpoint grid with the default layout and no default pane when there is no persona document (Batch 6 asset-overview)', async () => {
    stubWithDoc(null, (url) =>
      url.includes('/api/v1/apiEndpoints')
        ? jsonResponse({
            data: [
              { name: 'getPet', endpointURL: '/pets/{id}', requestMethod: 'GET', fullyQualifiedName: 'svc.petstore.getPet' },
            ],
            paging: { total: 1 },
          })
        : url.includes('/api/v1/apiCollections/name/')
          ? jsonResponse({
              id: 'ac-1',
              name: 'petstore',
              fullyQualifiedName: 'svc.petstore',
              description: 'Petstore API',
              service: { name: 'svc' },
            })
          : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTypedView('apiCollection', 'svc.petstore');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('pageType')).toBe('APICollection');
    expect(grids[0].props('layout')).toEqual(resolveWidgetLayout('APICollection', 'apiEndpoint', null));
    expect(cellFor(wrapper, DetailWidgetKeys.DESCRIPTION).find('[data-testid="asset-widget-description"]').exists()).toBe(true);
    expect(cellFor(wrapper, DetailWidgetKeys.DESCRIPTION).text()).toContain('Petstore API');
    // One endpoints table, inside the grid's APIEndpoints cell: the
    // retired default pane rendered the same piece.
    expect(wrapper.findAll('[data-testid="asset-api-endpoints-table"]').length).toBe(1);
    expect(wrapper.text()).toContain('getPet');
    wrapper.unmount();
  }, 20000);

  it('mounts the Container children grid with the default layout and no default pane when there is no persona document and the data model is empty (Batch 6 asset-overview)', async () => {
    stubWithDoc(null, (url) =>
      url.includes('/api/v1/containers/name/s3.landing/children')
        ? jsonResponse({
            data: [{ id: 'ct-2', name: 'child1', fullyQualifiedName: 's3.landing.child1', description: 'Child bucket' }],
            paging: { total: 1 },
          })
        : url.includes('/api/v1/containers/name/')
          ? jsonResponse({
              id: 'ct-1',
              name: 'landing',
              fullyQualifiedName: 's3.landing',
              description: 'Landing bucket',
              children: [{ name: 'child1', type: 'container' }],
              service: { name: 's3' },
            })
          : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTypedView('container', 's3.landing');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('pageType')).toBe('Container');
    expect(grids[0].props('layout')).toEqual(resolveWidgetLayout('Container', 'children', null));
    const childrenCell = cellFor(wrapper, DetailWidgetKeys.CONTAINER_CHILDREN);
    expect(childrenCell.find('[data-testid="container-list-table"]').exists()).toBe(true);
    expect(childrenCell.text()).toContain('child1');
    // The children grid replaces the related-panel pane: no related
    // table outside the widget cell.
    expect(wrapper.findAll('[data-testid="asset-related-table"]').length).toBe(0);
    wrapper.unmount();
  }, 20000);

  it('keeps the Container children default pane when there is no persona document and the data model is non-empty (Batch 6 asset-overview)', async () => {
    // The mutual-exclusion gate returns null for a non-empty data
    // model, so the guarded #children default pane renders even
    // though the tab is flipped (pin ContainerPage mounts the grid
    // on SCHEMA then).
    // Retargeted at r3: with BOTH Container tabs flipped, the non-empty
    // model mounts the SCHEMA grid (one GenericTab), while the children
    // tab keeps its default pane (the related table).
    stubWithDoc(null, (url) =>
      url.includes('/api/v1/containers/name/')
        ? jsonResponse({
            id: 'ct-1',
            name: 'landing',
            fullyQualifiedName: 's3.landing',
            description: 'Landing bucket',
            dataModel: { columns: [{ name: 'key', dataType: 'STRING' }] },
            children: [{ name: 'child1', type: 'container' }],
            service: { name: 's3' },
          })
        : null,
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTypedView('container', 's3.landing');
    await settle(wrapper);
    const grids = wrapper.findAllComponents(GenericTab);
    expect(grids.length).toBe(1);
    expect(grids[0].props('pageType')).toBe('Container');
    expect(grids[0].props('layout')).toEqual(resolveWidgetLayout('Container', 'schema', null));
    expect(wrapper.findAll('[data-testid="asset-related-table"]').length).toBe(1);
    wrapper.unmount();
  }, 20000);
});

describe('AssetDetailView description gate (D-3/D-4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  async function mountWithOps(operations: Array<{ operation: string; access: string }>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/tables/name/') && url.includes('/columns')) {
          // D-2 batch 3: the schema table self-fetches its columns.
          return jsonResponse({
            data: [{ name: 'id', dataType: 'BIGINT' }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/tables/name/')) {
          return jsonResponse({
            id: 'tbl-1',
            name: 'orders',
            fullyQualifiedName: 'svc.db.schema.orders',
            description: 'Orders fact',
            owners: [],
            tags: [],
            domains: [],
            columns: [{ name: 'id', dataType: 'BIGINT' }],
            extension: { retentionDays: 7 },
            tableType: 'Regular',
            serviceType: 'BigQuery',
            service: { name: 'bq', displayName: 'BigQuery Prod' },
            database: { name: 'analytics' },
            databaseSchema: { name: 'marts' },
          });
        }
        if (url.includes('/api/v1/permissions/table/name/')) {
          return jsonResponse({ resource: 'table', permissions: operations });
        }
        if (url.includes('/api/v1/metadata/types/name/table/customProperties')) {
          return jsonResponse([
            { name: 'retentionDays', displayName: 'Retention days', propertyType: { name: 'integer' } },
          ]);
        }
        return new Response('not found', { status: 404 });
      }),
    );
    return mountView('table', 'svc.db.schema.orders');
  }

  it('shows the description edit button with EditDescription', async () => {
    const { wrapper } = await mountWithOps([{ operation: 'EditDescription', access: 'allow' }]);
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('hides the description edit button without EditDescription', async () => {
    const { wrapper } = await mountWithOps([{ operation: 'ViewBasic', access: 'allow' }]);
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the custom-properties placeholder without ViewCustomFields', async () => {
    const { wrapper } = await mountWithOps([{ operation: 'ViewBasic', access: 'allow' }]);
    // The overview custom-properties tab renders the placeholder
    // instead of the values table when the read gate denies.
    expect(wrapper.find('[data-testid="asset-custom-properties-table"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the custom-properties values with ViewCustomFields', async () => {
    const { wrapper } = await mountWithOps([{ operation: 'ViewCustomFields', access: 'allow' }]);
    expect(wrapper.find('[data-testid="asset-custom-properties-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Retention days');
    wrapper.unmount();
  });
});

describe('AssetDetailView DriveService detail pages (D-TAB-2)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  // Scoped stub: only the drive detail payloads are faked; secondary
  // loads (activity, conversations, custom properties, test cases) answer
  // empty, and anything else 404s and is caught by the view.
  function stubDrive(payloads: Record<string, Record<string, unknown>>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        for (const [segment, payload] of Object.entries(payloads)) {
          if (url.includes(`/api/v1/drives/${segment}/name/`)) {
            return jsonResponse(payload);
          }
        }
        if (url.includes('/api/v1/permissions/')) {
          return jsonResponse({
            resource: 'directory',
            permissions: [
              { operation: 'ViewBasic', access: 'allow' },
              { operation: 'ViewCustomFields', access: 'allow' },
              { operation: 'EditDescription', access: 'allow' },
              { operation: 'EditCustomFields', access: 'allow' },
              { operation: 'EditLineage', access: 'allow' },
            ],
          });
        }
        if (url.includes('/api/v1/drives/') && url.includes('/vote') && init?.method === 'PUT') {
          return jsonResponse({ eventType: 'ENTITY_UPDATED' });
        }
        if (
          url.includes('/api/v1/activity/') ||
          url.includes('/api/v1/conversations') ||
          url.includes('/customProperties') ||
          url.includes('/testCases')
        ) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  }

  const directoryPayload = {
    id: 'dir-1',
    name: 'docs',
    fullyQualifiedName: 'drive.shared.docs',
    description: 'Shared docs',
    owners: [{ id: 'u1', name: 'alice', type: 'user' }],
    followers: [],
    votes: { upVotes: 0, downVotes: 0, upVoters: [], downVoters: [] },
    tags: [],
    service: { name: 'drive' },
    children: [
      { name: 'report.csv', type: 'file', fullyQualifiedName: 'drive.shared.docs.report.csv' },
      { name: 'sub', type: 'directory', fullyQualifiedName: 'drive.shared.docs.sub' },
    ],
  };

  it('renders a directory with pin tab order, children rows, and a lineage tab', async () => {
    stubDrive({ directories: directoryPayload });
    const { wrapper } = await mountTypedView('directory', 'drive.shared.docs');
    expect(wrapper.text()).toContain('Children');
    expect(wrapper.text()).toContain('Activity feed');
    expect(wrapper.text()).toContain('Lineage');
    expect(wrapper.text()).toContain('Contract');
    expect(wrapper.text()).toContain('Custom Properties');
    // L3d: the lineage tab mounts the shared canvas (the `#lineage`
    // slot's fallback pane — drive types are unflipped, PIN-MEMO §1.2).
    expect(wrapper.findComponent(LineageCanvas).exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-related-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('report.csv');
    expect(wrapper.text()).toContain('sub');
    // The detail fetch still requests the pin `children` field: the
    // mounted lineage canvas issues its own later detail fetch with
    // the smaller layer field set (`fields=domains,dataProducts,
    // service`, LineageCanvas.vue), so the assertion looks for ANY
    // matching call, not the last one.
    const detailCall = vi
      .mocked(fetch)
      .mock.calls.find(
        ([url]) =>
          String(url).includes('/api/v1/drives/directories/name/') &&
          String(url).includes(encodeURIComponent('drive.shared.docs')) &&
          String(url).includes('children'),
      );
    expect(detailCall).toBeDefined();
  });

  it('sends a directory vote to PUT /v1/drives/directories/{id}/vote', async () => {
    stubDrive({ directories: directoryPayload });
    const { wrapper } = await mountTypedView('directory', 'drive.shared.docs');
    useAuthStore().user = { id: 'u1', name: 'alice' };
    await wrapper.vm.$nextTick();
    await flushPromises();
    await wrapper.find('[data-testid="asset-vote-up"]').trigger('click');
    await flushPromises();
    const call = lastMatchingFetch(
      (url, init) => url.includes('/api/v1/drives/directories/dir-1/vote') && init?.method === 'PUT',
    );
    expect(JSON.parse(String(call.init?.body ?? '{}'))).toEqual({ updatedVoteType: 'votedUp' });
  });

  it('renders a spreadsheet worksheets tab with its worksheet rows', async () => {
    stubDrive({
      spreadsheets: {
        id: 's-1',
        name: 'budget',
        fullyQualifiedName: 'drive.shared.budget',
        owners: [],
        followers: [],
        votes: { upVotes: 0, downVotes: 0, upVoters: [], downVoters: [] },
        tags: [],
        service: { name: 'drive' },
        worksheets: [
          { name: 'Sheet1', type: 'worksheet', fullyQualifiedName: 'drive.shared.budget.Sheet1' },
          { name: 'Sheet2', type: 'worksheet', fullyQualifiedName: 'drive.shared.budget.Sheet2' },
        ],
      },
    });
    const { wrapper } = await mountTypedView('spreadsheet', 'drive.shared.budget');
    expect(wrapper.text()).toContain('Worksheets');
    // L3d: the lineage tab is mounted after activity_feed (pin order).
    expect(wrapper.text()).toContain('Lineage');
    expect(wrapper.find('[data-testid="asset-related-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Sheet1');
    expect(wrapper.text()).toContain('Sheet2');
  });

  it('renders a worksheet schema tab with its columns', async () => {
    stubDrive({
      worksheets: {
        id: 'w-1',
        name: 'Sheet1',
        fullyQualifiedName: 'drive.shared.budget.Sheet1',
        owners: [],
        followers: [],
        votes: { upVotes: 0, downVotes: 0, upVoters: [], downVoters: [] },
        tags: [],
        service: { name: 'drive' },
        columns: [{ name: 'amount', dataType: 'DECIMAL' }],
      },
    });
    const { wrapper } = await mountTypedView('worksheet', 'drive.shared.budget.Sheet1');
    expect(wrapper.text()).toContain('Schema');
    // L3d: the lineage tab is mounted after activity_feed (pin order).
    expect(wrapper.text()).toContain('Lineage');
    expect(wrapper.find('[data-testid="asset-schema-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('amount');
  });

  it('renders a file overview and schema, and an empty schema for a column-less file', async () => {
    stubDrive({
      files: {
        id: 'f-1',
        name: 'notes.txt',
        fullyQualifiedName: 'drive.shared.docs.notes.txt',
        description: 'Plain notes',
        owners: [],
        followers: [],
        votes: { upVotes: 0, downVotes: 0, upVoters: [], downVoters: [] },
        tags: [],
        service: { name: 'drive' },
        columns: [],
      },
    });
    const { wrapper } = await mountTypedView('file', 'drive.shared.docs.notes.txt');
    expect(wrapper.text()).toContain('Overview');
    expect(wrapper.text()).toContain('Schema');
    // L3d: the lineage tab is mounted after activity_feed (pin order).
    expect(wrapper.text()).toContain('Lineage');
    expect(wrapper.find('[data-testid="asset-schema-empty"]').exists()).toBe(true);
  });
});
