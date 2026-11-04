/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import BulkEntityImportView from './BulkEntityImportView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const DOC_PAYLOAD = {
  summary: 'Table CSV',
  headers: [
    { name: 'name', required: true, description: 'Entity name', examples: ['foo'] },
    { name: 'description', required: false, description: 'Description' },
  ],
};

const PERMISSION_ALLOW = {
  resource: 'table',
  permissions: [{ operation: 'EditAll', access: 'allow' }],
};

const PERMISSION_DENY = {
  resource: 'table',
  permissions: [{ operation: 'EditAll', access: 'deny' }],
};

function resultPayload(rows: string): Record<string, unknown> {
  return {
    dryRun: true,
    status: 'partialSuccess',
    numberOfRowsProcessed: 2,
    numberOfRowsPassed: 1,
    numberOfRowsFailed: 1,
    importResultsCsv: `name,status,details\n${rows}`,
  };
}

function makeFetch(resultCsv: string, permission: unknown = PERMISSION_ALLOW) {
  return vi.fn(async (url: unknown, init?: RequestInit) => {
    const target = String(url);
    if (target.includes('/v1/permissions/')) {
      return jsonResponse(permission);
    }
    if (target.includes('/v1/csv/documentation/')) {
      return jsonResponse(DOC_PAYLOAD);
    }
    if (target.includes('/importAsync')) {
      expect(init?.method).toBe('PUT');
      return jsonResponse({ jobId: '7', message: 'queued' });
    }
    if (target.includes('/csvAsyncJobs/7/import-result')) {
      return jsonResponse(resultPayload(resultCsv));
    }
    if (target.includes('/csvAsyncJobs/7')) {
      return jsonResponse({ jobId: '7', status: 'COMPLETED' });
    }
    throw new Error(`unexpected fetch: ${target}`);
  });
}

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/bulk/import/:entityType/:fqn',
        name: 'bulk-import',
        component: BulkEntityImportView,
        props: true,
      },
    ],
  });
  await router.push('/bulk/import/table/svc.db.schema.t');
  await router.isReady();
  const wrapper = mount(BulkEntityImportView, {
    props: { entityType: 'table', fqn: 'svc.db.schema.t' },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

async function uploadFile(wrapper: ReturnType<typeof mount>, content: string) {
  const input = wrapper.find('[data-testid="bulk-import-file-input"]');
  const file = new File([content], 't.csv', { type: 'text/csv' });
  Object.defineProperty(input.element, 'files', { value: [file] });
  await input.trigger('change');
  await flushPromises();
}

describe('BulkEntityImportView', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', makeFetch('foo,success,Entity created\nbar,failure,denied\n'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads documentation and keeps the preview action disabled until a file is chosen', async () => {
    const view = await mountView();
    expect(view.text()).toContain('Entity name');
    expect(view.find('[data-testid="bulk-import-preview-button"]').attributes('disabled')).toBeDefined();
  });

  it('uploads, validates, and echoes per-row results without failing the file', async () => {
    const wrapper = await mountView();
    await uploadFile(wrapper, 'name,description\nfoo,bar\nbar,baz\n');
    expect(wrapper.find('[data-testid="bulk-import-file-info"]').exists()).toBe(true);
    await wrapper.find('[data-testid="bulk-import-preview-button"]').trigger('click');
    await flushPromises();
    // Step 1 grid shows the uploaded rows, and the dry-run result panel
    // echoes each row's operation: one created, one skipped (denied row).
    expect(wrapper.text()).toContain('foo');
    expect(wrapper.text()).toContain('bar');
    expect(wrapper.text()).toContain('denied');
    expect(wrapper.find('.ant-alert-error').exists()).toBe(false);
    // The import action is enabled once validation produced a result.
    expect(
      wrapper.find('[data-testid="bulk-import-import-button"]').attributes('disabled'),
    ).toBeUndefined();
  });

  it('shows the forbidden state when the caller may not edit the target', async () => {
    vi.stubGlobal('fetch', makeFetch('', PERMISSION_DENY));
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="bulk-import-file-input"]').exists()).toBe(false);
  });
});
