/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { useBulkEditScopeStore } from '@/stores/bulkEditScope';
import MetricBulkEditView from './MetricBulkEditView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const DOC_PAYLOAD = {
  headers: [
    { name: 'name', required: true },
    { name: 'owners', required: false },
    { name: 'glossaryTerms', required: false },
    { name: 'description', required: false },
  ],
};

const METRIC_A = {
  id: 'm1',
  name: 'mau',
  fullyQualifiedName: 'kpi.mau',
  description: 'MAU',
  owners: [{ id: 'u1', name: 'alice', type: 'user' }],
  tags: [],
};

const METRIC_B = {
  id: 'm2',
  name: 'dau',
  fullyQualifiedName: 'kpi.dau',
  description: 'DAU',
  owners: [],
  tags: [],
};

function resultPayload(): Record<string, unknown> {
  return {
    dryRun: true,
    status: 'partialSuccess',
    numberOfRowsProcessed: 1,
    numberOfRowsPassed: 1,
    numberOfRowsFailed: 0,
    importResultsCsv: 'name,status,details\nmau,success,Entity updated\n',
  };
}

function makeFetch() {
  const importBodies: string[] = [];
  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    const target = String(url);
    if (target.includes('/v1/permissions/')) {
      return jsonResponse({
        resource: 'metric',
        permissions: [{ operation: 'EditAll', access: 'allow' }],
      });
    }
    if (target.includes('/v1/csv/documentation/')) {
      return jsonResponse(DOC_PAYLOAD);
    }
    if (target.includes('/importAsync')) {
      expect(init?.method).toBe('PUT');
      importBodies.push(String(init?.body ?? ''));
      return jsonResponse({ jobId: '9', message: 'queued' });
    }
    if (target.includes('/csvAsyncJobs/9/import-result')) {
      return jsonResponse(resultPayload());
    }
    if (target.includes('/csvAsyncJobs/9')) {
      return jsonResponse({ jobId: '9', status: 'COMPLETED' });
    }
    if (target.includes('/v1/metrics')) {
      return jsonResponse({ data: [METRIC_A, METRIC_B], paging: {} });
    }
    if (
      target.includes('/v1/users') ||
      target.includes('/v1/teams') ||
      target.includes('/v1/glossaryTerms')
    ) {
      return jsonResponse({ data: [], paging: {} });
    }
    throw new Error(`unexpected fetch: ${target}`);
  });
  return { fetchMock, importBodies };
}

async function mountView(
  entityType = 'metric',
  fqn = '*',
  scope?: Parameters<ReturnType<typeof useBulkEditScopeStore>['setScope']>[0],
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  if (scope) {
    useBulkEditScopeStore().setScope(scope);
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/bulk/edit/:entityType/:fqn', name: 'bulk-edit', component: MetricBulkEditView, props: true },
      { path: '/governance/metrics', name: 'governance-metrics', component: { template: '<div>metrics</div>' } },
    ],
  });
  await router.push({ name: 'bulk-edit', params: { entityType, fqn } });
  await router.isReady();
  const wrapper = mount(MetricBulkEditView, {
    props: { entityType, fqn },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('MetricBulkEditView', () => {
  it('loads the selected scope from the listing and renders rich editor cells', async () => {
    const { fetchMock } = makeFetch();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const wrapper = await mountView('metric', '*', {
        mode: 'selected',
        metricIds: ['m1'],
        metricNames: ['mau'],
        filters: {},
      });
      expect(wrapper.text()).toContain('Loaded 1 of 2 metrics');
      const nameInput = wrapper.find('[data-testid="metric-bulk-edit-cell-0-name"]');
      expect((nameInput.element as HTMLInputElement).value).toBe('mau');
      expect(wrapper.find('[data-testid="metric-bulk-edit-cell-0-owners"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="metric-bulk-edit-cell-0-glossaryTerms"]').exists()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('submits only changed rows, dryRun validate first then the real import', async () => {
    const { fetchMock, importBodies } = makeFetch();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const wrapper = await mountView('metric', '*', { mode: 'filtered', filters: {} });
      expect(wrapper.text()).toContain('Loaded 2 of 2 metrics');
      expect(
        (wrapper.find('[data-testid="metric-bulk-edit-cell-0-description"]').element as HTMLInputElement).value,
      ).toBe('MAU');
      expect(
        (wrapper.find('[data-testid="metric-bulk-edit-cell-1-description"]').element as HTMLInputElement).value,
      ).toBe('DAU');
      const input = wrapper.find('[data-testid="metric-bulk-edit-cell-0-description"]');
      await input.setValue('MAU updated');
      await flushPromises();
      await wrapper.find('[data-testid="metric-bulk-edit-validate-button"]').trigger('click');
      await flushPromises();
      expect(importBodies).toHaveLength(1);
      const lines = importBodies[0]?.split('\n').filter(Boolean) ?? [];
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('MAU updated');
      expect(lines[1]).not.toContain('dau');
      const validateCall = fetchMock.mock.calls.find((call) =>
        String(call[0]).includes('/importAsync'),
      );
      expect(String(validateCall?.[0])).toContain('dryRun=true');
      expect(String(validateCall?.[0])).toContain('recursive=false');
      await wrapper.find('[data-testid="metric-bulk-edit-import-button"]').trigger('click');
      await flushPromises();
      expect(importBodies).toHaveLength(2);
      const importCall = fetchMock.mock.calls
        .filter((call) => String(call[0]).includes('/importAsync'))
        .at(-1);
      expect(String(importCall?.[0])).toContain('dryRun=false');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows the metric-only note for other entity types', async () => {
    vi.stubGlobal('fetch', makeFetch().fetchMock);
    try {
      const wrapper = await mountView('table', '*');
      expect(wrapper.text()).toContain('Bulk edit is available for metrics');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
