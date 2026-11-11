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

  let pipelineResponse: Record<string, unknown> = basePipelineResponse();

  beforeEach(() => {
    patches.length = 0;
    deploys.length = 0;
    deployReason = undefined;
    pipelineResponse = basePipelineResponse();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/services/ingestionPipelines/p1') && init?.method === 'GET') {
          return jsonResponse(pipelineResponse);
        }
        if (url.includes('/api/v1/services/databaseServices/s1') && init?.method === 'GET') {
          return jsonResponse({
            id: 's1',
            name: 'warehouse',
            serviceType: 'Postgres',
            owners: [{ id: 'sv1', type: 'user', name: 'service-owner' }],
          });
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
    vi.unstubAllGlobals();
  });

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
      ],
    });
    await router.push('/ingestion/pipelines/p1/edit');
    await router.isReady();
    const wrapper = mount(EditPipelineView, {
      props: { id: 'p1' },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    // The schema import is an extra async hop after the service fetch;
    // wait for the schema-driven fields to appear (and seed) before
    // the test clicks through.
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="schema-field-includeViews"]').exists()).toBe(true),
    );
    return { wrapper, router };
  }

  it('saves a JSON Patch with only the changed fields, then deploys', async () => {
    const { wrapper, router } = await mountView();
    expect(wrapper.find('[data-testid="edit-pipeline-step-configure"]').exists()).toBe(true);
    // The name is uneditable; the displayName is prefilled from the saved value.
    expect((wrapper.find('[data-testid="edit-pipeline-name"]').element as HTMLInputElement).value).toBe(
      'warehouse-metadata',
    );
    expect((wrapper.find('[data-testid="edit-pipeline-display-name"]').element as HTMLInputElement).value).toBe(
      'Warehouse Metadata',
    );
    await wrapper.find('[data-testid="edit-pipeline-display-name"]').setValue('Warehouse Metadata v2');
    await wrapper.find('[data-testid="edit-pipeline-next"]').trigger('click');
    expect(wrapper.find('[data-testid="edit-pipeline-step-schedule"]').exists()).toBe(true);
    await wrapper.find('[data-testid="edit-pipeline-submit"]').trigger('click');
    await flushPromises();
    await flushPromises();
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
    expect(router.currentRoute.value.name).toBe('ingestion-pipeline');
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
    await wrapper.find('[data-testid="edit-pipeline-display-name"]').setValue('Warehouse Metadata v2');
    await wrapper.find('[data-testid="edit-pipeline-next"]').trigger('click');
    await wrapper.find('[data-testid="edit-pipeline-submit"]').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(patches).toHaveLength(1);
    const ops = patches[0]!;
    expect(ops).toContainEqual({ op: 'replace', path: '/displayName', value: 'Warehouse Metadata v2' });
    const configPaths = ops.map((op) => op.path).filter((path) => path.startsWith('/sourceConfig/config/'));
    expect(configPaths).not.toContain('/sourceConfig/config/includeTables');
    expect(configPaths.filter((path) => path.startsWith('/sourceConfig/config/schemaFilterPattern'))).toEqual(
      [],
    );
  });

  it('still returns to the detail page when the deploy fails', async () => {
    deployReason = 'Pipeline Client Disabled';
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="edit-pipeline-next"]').trigger('click');
    await wrapper.find('[data-testid="edit-pipeline-submit"]').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(patches).toHaveLength(1);
    expect(deploys).toHaveLength(1);
    expect(router.currentRoute.value.name).toBe('ingestion-pipeline');
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
});
