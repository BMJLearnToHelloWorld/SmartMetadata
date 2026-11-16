/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import { useAuthStore } from '@/stores/auth';
import EditPipelineView from './EditPipelineView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type PatchOp = { op: string; path: string; value?: unknown };

describe('EditPipelineView', () => {
  const patches: PatchOp[][] = [];
  const deploys: string[] = [];
  let deployReason: string | undefined;
  let permissionsResponse: unknown = null;
  let serviceResponse: Record<string, unknown> | null = null;
  /** When set, the service fetch waits for this gate (ready-gating test). */
  let serviceFetchGate: Promise<void> | null = null;
  const mountedWrappers: { unmount: () => void }[] = [];

  function basePipelineResponse(): Record<string, unknown> {
    return {
      id: 'p1',
      name: 'warehouse-metadata',
      fullyQualifiedName: 'warehouse.warehouse-metadata',
      displayName: 'Warehouse Metadata',
      description: 'keep me',
      pipelineType: 'metadata',
      service: { id: 's1', type: 'databaseService', name: 'warehouse' },
      owners: [{ id: 'o1', type: 'user', name: 'owner1' }],
      loggerLevel: 'INFO',
      raiseOnError: true,
      sourceConfig: { config: { type: 'DatabaseMetadata', includeViews: true } },
      airflowConfig: {
        pausePipeline: true,
        scheduleInterval: '0 0 * * *',
        retries: 2,
        startDate: '2026-11-10T00:00:00.000Z',
      },
    };
  }

  function baseServiceResponse(): Record<string, unknown> {
    return {
      id: 's1',
      name: 'warehouse',
      serviceType: 'Postgres',
      owners: [{ id: 'sv1', type: 'user', name: 'service-owner' }],
    };
  }

  let pipelineResponse: Record<string, unknown> = basePipelineResponse();

  beforeEach(() => {
    patches.length = 0;
    deploys.length = 0;
    deployReason = undefined;
    permissionsResponse = null;
    serviceResponse = null;
    serviceFetchGate = null;
    pipelineResponse = basePipelineResponse();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/services/ingestionPipelines/p1') && init?.method === 'GET') {
          return jsonResponse(pipelineResponse);
        }
        if (url.includes('/api/v1/services/databaseServices/s1') && init?.method === 'GET') {
          if (serviceFetchGate) {
            await serviceFetchGate;
          }
          return jsonResponse(serviceResponse ?? baseServiceResponse());
        }
        if (url.includes('/api/v1/permissions/ingestionPipeline/name/')) {
          return permissionsResponse === null
            ? new Response('not found', { status: 404 })
            : jsonResponse(permissionsResponse);
        }
        if (url.includes('/api/v1/services/ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
        if (url.includes('/api/v1/services/ingestionPipelines/deploy/')) {
          deploys.push(url);
          return jsonResponse(deployReason ? { code: 200, reason: deployReason } : { code: 200 });
        }
        if (url.includes('/api/v1/services/ingestionPipelines/p1') && init?.method === 'PATCH') {
          patches.push(JSON.parse(String(init.body)) as PatchOp[]);
          return jsonResponse({ id: 'p1', name: 'warehouse-metadata' });
        }
        if (url.includes('/api/v1/users') || url.includes('/api/v1/teams')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    // Unmount before clearing the body: teleported modals belong to
    // the wrappers, and clearing innerHTML alone lets a later reactive
    // update resurrect their DOM in the next test.
    for (const mounted of mountedWrappers.splice(0)) {
      mounted.unmount();
    }
    message.destroy();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  async function mountView(options: { wait?: boolean; anonymous?: boolean } = {}) {
    const { wait = true, anonymous = false } = options;
    const pinia = createPinia();
    setActivePinia(pinia);
    if (!anonymous) {
      useAuthStore().user = {
        id: 'u1',
        name: 'admin',
        displayName: 'Admin',
        email: 'admin@example.com',
      };
    }
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
        {
          path: '/ingestion/services',
          name: 'ingestion-services',
          component: { template: '<div>services</div>' },
        },
        {
          path: '/ingestion/services/:kind/:id',
          name: 'ingestion-service',
          component: { template: '<div>service</div>' },
          props: true,
        },
      ],
    });
    await router.push('/ingestion/pipelines/p1/edit');
    await router.isReady();
    const wrapper = mount(EditPipelineView, {
      props: { id: 'p1' },
      attachTo: document.body,
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    mountedWrappers.push(wrapper);
    if (!wait) {
      return { wrapper, router };
    }
    await flushPromises();
    // The schema import is an extra async hop after the service fetch;
    // wait for the sectioned form to appear (and seed) before the test
    // clicks through. Any section matches: some pipeline types (e.g.
    // profiler) have no primary fields, so the essential section is
    // legitimately omitted and only later sections render.
    await vi.waitFor(
      () =>
        expect(wrapper.find('[data-testid^="ingestion-section-"]').exists()).toBe(true),
      { timeout: 5000 },
    );
    return { wrapper, router };
  }

  type Mounted = Awaited<ReturnType<typeof mountView>>;

  async function saveThrough(wrapper: Mounted['wrapper']) {
    await wrapper.find('[data-testid="edit-pipeline-next"]').trigger('click');
    await wrapper.find('[data-testid="edit-pipeline-submit"]').trigger('click');
    await flushPromises();
    await flushPromises();
  }

  it('saves a JSON Patch with only the changed fields, then shows the success screen', async () => {
    const { wrapper, router } = await mountView();
    expect(wrapper.find('[data-testid="edit-pipeline-step-configure"]').exists()).toBe(true);
    // The name card has ONE input bound to displayName; the machine
    // name is never shown (pin IngestionNameCard).
    expect(wrapper.find('[data-testid="edit-pipeline-name"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ingestion-name-card"]').exists()).toBe(true);
    expect(
      (wrapper.find('[data-testid="ingestion-display-name"]').element as HTMLInputElement).value,
    ).toBe('Warehouse Metadata');
    await wrapper.find('[data-testid="ingestion-display-name"]').setValue('Warehouse Metadata v2');
    await saveThrough(wrapper);
    expect(patches).toHaveLength(1);
    const ops = patches[0]!;
    const paths = ops.map((op) => `${op.op} ${op.path}`);
    // The displayName changed — and saving an untouched edit writes the
    // schema defaults into the config (official RJSF behaviour, P-08(d)):
    // every defaulted key missing from the saved config ({type,
    // includeViews}) is added. The four empty filter patterns are NOT
    // added (cleanWorkFlowData drops them). Everything else is preserved
    // server-side by the patch, not overwritten.
    const expectedAdds = [
      'markDeletedTables',
      'markDeletedStoredProcedures',
      'markDeletedSchemas',
      'markDeletedDatabases',
      'includeTables',
      'includeTags',
      'includeCustomProperties',
      'includeOwners',
      'ownerConfig',
      'includeStoredProcedures',
      'includeDDL',
      'overrideMetadata',
      'queryLogDuration',
      'queryParsingTimeoutLimit',
      'useFqnForFiltering',
      'threads',
      'incremental',
      'extractJsonSchema',
      'jsonSchemaSampleSize',
    ].map((key) => `add /sourceConfig/config/${key}`);
    expect([...paths].sort()).toEqual([...['replace /displayName'], ...expectedAdds].sort());
    expect(ops.find((op) => op.path === '/displayName')?.value).toBe('Warehouse Metadata v2');
    expect(paths).not.toContain('replace /description');
    expect(paths).not.toContain('replace /airflowConfig/pausePipeline');
    expect(paths).not.toContain('replace /airflowConfig/startDate');
    expect(paths).not.toContain('replace /airflowConfig/scheduleInterval');
    expect(paths).not.toContain('replace /airflowConfig/retries');
    expect(paths).not.toContain('replace /owners');
    expect(paths).not.toContain('replace /loggerLevel');
    expect(paths).not.toContain('replace /raiseOnError');
    expect(deploys).toHaveLength(1);
    // The save lands on the success screen (pin step 3); the footer is hidden.
    expect(wrapper.find('[data-testid="success-screen-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="success-line"]').text()).toContain(
      '"Warehouse Metadata v2" has been updated and deployed successfully',
    );
    expect(wrapper.find('[data-testid="edit-pipeline-back"]').exists()).toBe(false);
    expect(document.body.querySelector('[data-testid="deploy-modal"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="body-text"]')?.textContent).toContain(
      'Successfully deployed “Warehouse Metadata v2”',
    );
    await wrapper.find('[data-testid="view-service-button"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('ingestion-service');
    expect(router.currentRoute.value.params).toEqual({ kind: 'database', id: 's1' });
  });

  it('keeps saved excludes and includeTables: false on a displayName-only edit', async () => {
    // H-1 (as amended by P-08(d)): the schema form's data starts from
    // the SAVED config, so a displayName-only edit must not touch the
    // saved excludes or flip `includeTables` back to `true`. The PATCH
    // also carries the schema defaults the form seeds (official RJSF
    // behaviour — see the test above), so this test asserts the
    // preservation property, not exact ops: no op may remove or replace
    // the saved excludes or the saved includeTables value.
    pipelineResponse = {
      ...pipelineResponse,
      sourceConfig: {
        config: {
          type: 'DatabaseMetadata',
          includeViews: true,
          includeTables: false,
          schemaFilterPattern: { includes: ['a'], excludes: ['b'] },
        },
      },
    };
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="ingestion-display-name"]').setValue('Warehouse Metadata v2');
    await saveThrough(wrapper);
    expect(patches).toHaveLength(1);
    const ops = patches[0]!;
    expect(ops).toContainEqual({ op: 'replace', path: '/displayName', value: 'Warehouse Metadata v2' });
    const configPaths = ops.map((op) => op.path).filter((path) => path.startsWith('/sourceConfig/config/'));
    expect(configPaths).not.toContain('/sourceConfig/config/includeTables');
    expect(configPaths.filter((path) => path.startsWith('/sourceConfig/config/schemaFilterPattern'))).toEqual(
      [],
    );
  });

  it('shows the deploy-failed success screen with a retry when the deploy fails', async () => {
    deployReason = 'Pipeline Client Disabled';
    const { wrapper, router } = await mountView();
    await saveThrough(wrapper);
    expect(patches).toHaveLength(1);
    expect(deploys).toHaveLength(1);
    // The update stands; the success screen reports the failed deploy
    // and offers a retry (pin SuccessScreen + showDeployButton).
    expect(wrapper.find('[data-testid="success-screen-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="success-line"]').text()).toContain(
      'has been updated, but failed to deploy',
    );
    expect(wrapper.find('[data-testid="deploy-ingestion-button"]').exists()).toBe(true);
    expect(document.body.querySelector('[data-testid="body-text"]')?.textContent).toContain(
      'Error while deploying',
    );
    expect(router.currentRoute.value.name).toBe('ingestion-pipeline-edit');
    await wrapper.find('[data-testid="view-service-button"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('ingestion-service');
  });

  it('removes the schedule interval when switched to on-demand', async () => {
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="edit-pipeline-next"]').trigger('click');
    await wrapper.find('[data-testid="edit-pipeline-schedule-card-on-demand"]').trigger('click');
    await wrapper.find('[data-testid="edit-pipeline-submit"]').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(patches).toHaveLength(1);
    const ops = patches[0]!;
    expect(ops).toContainEqual({ op: 'remove', path: '/airflowConfig/scheduleInterval' });
  });

  it('goes back from step 2 to step 1 instead of leaving the page', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="edit-pipeline-next"]').trigger('click');
    await wrapper.find('[data-testid="edit-pipeline-back"]').trigger('click');
    expect(wrapper.find('[data-testid="edit-pipeline-step-configure"]').exists()).toBe(true);
    expect(router.currentRoute.value.name).toBe('ingestion-pipeline-edit');
  });

  it('goes back to the service page from step 1', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="edit-pipeline-back"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('ingestion-service');
  });

  it('renders the per-type heading and the category / service / heading breadcrumb', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="page-header"]').text()).toContain('Edit Metadata Agent');
    const breadcrumb = wrapper.find('[data-testid="sm-breadcrumb"]');
    expect(breadcrumb.text()).toContain('Databases');
    expect(breadcrumb.text()).toContain('warehouse');
    expect(breadcrumb.text()).toContain('Edit Metadata Agent');
    const links = breadcrumb.findAll('a');
    expect(links).toHaveLength(2);
    expect(links[0]!.attributes('href')).toBe('/ingestion/services');
    expect(links[1]!.attributes('href')).toBe('/ingestion/services/database/s1');
  });

  it('renders the settings-pipeline breadcrumb without links', async () => {
    pipelineResponse = { ...pipelineResponse, pipelineType: 'dataInsight' };
    const { wrapper } = await mountView({ wait: false });
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="page-header"]').text()).toContain(
        'Edit Data Insight Agent',
      ),
    );
    const breadcrumb = wrapper.find('[data-testid="sm-breadcrumb"]');
    expect(breadcrumb.text()).toContain('Data Insight');
    expect(breadcrumb.findAll('a')).toHaveLength(0);
  });

  it('carries the pin workflow labels for every pipeline type in both locales', () => {
    const expectedEn: Record<string, string> = {
      application: 'Application',
      autoClassification: 'Auto Classification',
      dataInsight: 'Data Insight',
      dbt: 'dbt',
      elasticSearchReindex: 'ElasticsearchReindex',
      lineage: 'Lineage',
      metadata: 'Metadata',
      policyAgent: 'Policy Agent',
      profiler: 'Profiler',
      reverseMetadata: 'Reverse Metadata',
      TestSuite: 'Test Suite',
      usage: 'Usage',
    };
    const expectedZh: Record<string, string> = {
      application: '应用',
      autoClassification: '自动分类',
      dataInsight: '数据洞察',
      dbt: 'dbt',
      elasticSearchReindex: 'Elasticsearch 重新索引',
      lineage: '血缘关系',
      metadata: '元数据',
      policyAgent: 'Policy Agent',
      profiler: '分析器',
      reverseMetadata: '反向元数据',
      TestSuite: '质控测试集',
      usage: '使用率',
    };
    expect(enUS.ingestion.pipelines.workflowLabels).toEqual(expectedEn);
    expect(zhCN.ingestion.pipelines.workflowLabels).toEqual(expectedZh);
  });

  it('uses the pin step names and footer wording', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="edit-pipeline-steps"]').text()).toContain('Configure Ingestion');
    expect(wrapper.find('[data-testid="edit-pipeline-steps"]').text()).toContain('Schedule Interval');
    expect(wrapper.find('[data-testid="edit-pipeline-back"]').text()).toBe('Back');
    expect(wrapper.find('[data-testid="edit-pipeline-next"]').text()).toBe('Next');
  });

  it('disables Next until the workflow form reports ready', async () => {
    // Gate the service fetch: the pipeline loads (footer renders) but
    // the schema form cannot mount until the gate resolves.
    let resolveGate!: () => void;
    serviceFetchGate = new Promise<void>((resolve) => {
      resolveGate = resolve;
    });
    const { wrapper } = await mountView({ wait: false });
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="edit-pipeline-step-configure"]').exists()).toBe(true);
    expect(
      (wrapper.find('[data-testid="edit-pipeline-next"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
    resolveGate();
    await flushPromises();
    await vi.waitFor(
      () =>
        expect(wrapper.find('[data-testid^="ingestion-section-"]').exists()).toBe(true),
      { timeout: 5000 },
    );
    expect(
      (wrapper.find('[data-testid="edit-pipeline-next"]').element as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('withholds the owners picker without EditOwners and omits owners from the patch', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="ingestion-owners-field"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-owner"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-owner"]').exists()).toBe(false);
    // Read-only mode shows the SAVED owners.
    expect(wrapper.find('[data-testid="ingestion-owners"]').text()).toContain('owner1');
    await wrapper.find('[data-testid="ingestion-display-name"]').setValue('Warehouse Metadata v2');
    await saveThrough(wrapper);
    expect(patches).toHaveLength(1);
    expect(patches[0]!.map((op) => op.path)).not.toContain('/owners');
  });

  it('opens the owners picker with EditOwners and requires owners', async () => {
    permissionsResponse = {
      resource: 'ingestionPipeline',
      permissions: [{ operation: 'EditOwners', access: 'allow' }],
    };
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="edit-owner"]').exists()).toBe(true);
    await wrapper.find('[data-testid="edit-owner"]').trigger('click');
    await flushPromises();
    expect(document.body.querySelector('[data-testid="owners-picker-modal"]')).not.toBeNull();
  });

  it('shows the plural owners-required error when owners are required and empty', async () => {
    permissionsResponse = {
      resource: 'ingestionPipeline',
      permissions: [{ operation: 'EditOwners', access: 'allow' }],
    };
    pipelineResponse = { ...pipelineResponse, owners: [] };
    serviceResponse = { ...baseServiceResponse(), owners: [] };
    const { wrapper } = await mountView({ anonymous: true });
    await wrapper.find('[data-testid="edit-pipeline-next"]').trigger('click');
    expect(wrapper.find('[data-testid="owners-error"]').text()).toBe('Owners are required');
    expect(wrapper.find('[data-testid="edit-pipeline-step-configure"]').exists()).toBe(true);
  });

  it('lifts the owners gate without EditOwners even when no owners are seeded', async () => {
    pipelineResponse = { ...pipelineResponse, owners: [] };
    serviceResponse = { ...baseServiceResponse(), owners: [] };
    const { wrapper } = await mountView({ anonymous: true });
    await wrapper.find('[data-testid="edit-pipeline-next"]').trigger('click');
    expect(wrapper.find('[data-testid="edit-pipeline-step-schedule"]').exists()).toBe(true);
  });

  it('renders the debug log inside the Scope & Behaviour section', async () => {
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="ingestion-section-scope-toggle"]').trigger('click');
    const scope = wrapper.find('[data-testid="ingestion-section-scope"]');
    expect(scope.find('[data-testid="schema-field-enableDebugLog-switch"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-pipeline-debug-log"]').exists()).toBe(false);
  });

  it('gates incremental on the service connection flag', async () => {
    const hidden = await mountView();
    expect(hidden.wrapper.find('[data-testid="schema-field-incremental"]').exists()).toBe(false);
    serviceResponse = {
      ...baseServiceResponse(),
      connection: { config: { supportsIncrementalMetadataExtraction: true } },
    };
    const shown = await mountView();
    expect(shown.wrapper.find('[data-testid="schema-field-incremental"]').exists()).toBe(true);
  });

  it('gates enableAutoPartitionDetection on the service connection flag', async () => {
    pipelineResponse = { ...pipelineResponse, pipelineType: 'profiler' };
    const hidden = await mountView();
    await hidden.wrapper.find('[data-testid="ingestion-section-advanced-toggle"]').trigger('click');
    expect(
      hidden.wrapper.find('[data-testid="schema-field-enableAutoPartitionDetection"]').exists(),
    ).toBe(false);
    serviceResponse = {
      ...baseServiceResponse(),
      connection: { config: { supportsAutoPartitionDetection: true } },
    };
    const shown = await mountView();
    await shown.wrapper.find('[data-testid="ingestion-section-advanced-toggle"]').trigger('click');
    expect(
      shown.wrapper.find('[data-testid="schema-field-enableAutoPartitionDetection-switch"]').exists(),
    ).toBe(true);
  });

  it('surfaces schema descriptions in the doc panel on focus, never inline', async () => {
    const { wrapper } = await mountView();
    const description = 'Number of Threads to use in order to parallelize Table ingestion.';
    expect(wrapper.find('[data-testid="edit-pipeline-step-configure"]').text()).not.toContain(
      description,
    );
    expect(wrapper.find('[data-testid="service-requirements"]').exists()).toBe(true);
    // L-1: pin's doc panel shows the connector type as the title and
    // the category word as the subtitle.
    const panel = wrapper.find('[data-testid="service-requirements"]');
    expect(panel.find('.service-doc-title').text()).toBe('Postgres');
    expect(panel.find('.service-doc-subtitle').text()).toBe('Database Service');
    // Antd InputNumber binds the test id to its inner <input>.
    const threads = wrapper.find('input[data-testid="schema-field-threads"]');
    await threads.trigger('focus');
    await vi.waitFor(
      () =>
        expect(wrapper.find('[data-testid="service-requirements"]').text()).toContain(description),
      { timeout: 3000 },
    );
  });

  it('renders the schedule step with cadence buttons, retries, and a raise-on-error toggle', async () => {
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="edit-pipeline-next"]').trigger('click');
    expect(wrapper.find('[data-testid="edit-pipeline-schedule-frequency-day"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-pipeline-retries"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Number of Retries');
    expect(wrapper.find('[data-testid="edit-pipeline-raise-on-error-switch"]').exists()).toBe(true);
    // No extra "Schedule interval" wrapper label duplicating the step name.
    expect(wrapper.find('[data-testid="edit-pipeline-step-schedule"]').text()).not.toContain(
      'Schedule interval',
    );
  });
});
