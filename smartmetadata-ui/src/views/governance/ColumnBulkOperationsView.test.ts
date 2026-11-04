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
import ColumnBulkOperationsView from './ColumnBulkOperationsView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const GRID_PAYLOAD = {
  columns: [
    {
      columnName: 'email',
      hasVariations: true,
      groups: [
        {
          groupId: 'g1',
          displayName: 'Email',
          description: 'Contact email',
          dataType: 'VARCHAR',
          occurrenceCount: 2,
          occurrences: [
            { columnFQN: 'svc.db.schema.users.email', entityFQN: 'svc.db.schema.users', entityType: 'table' },
            { columnFQN: 'svc.db.schema.customers.email', entityFQN: 'svc.db.schema.customers', entityType: 'table' },
          ],
          tags: [{ tagFQN: 'PII.Email', source: 'Tag' }],
        },
      ],
    },
  ],
  totalOccurrences: 2,
  totalUniqueColumns: 1,
};

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/govern/column-bulk-ops', name: 'column-bulk-ops', component: ColumnBulkOperationsView }],
  });
  return { pinia, router };
}

async function mountView() {
  const { pinia, router } = mountPage();
  await router.push('/govern/column-bulk-ops');
  await router.isReady();
  const wrapper = mount(ColumnBulkOperationsView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

function modalPrimaryButton(wrapper: ReturnType<typeof mount>, title: string) {
  const modal = wrapper
    .findAll('.ant-modal')
    .find((node) => node.text().includes(title));
  if (!modal) {
    throw new Error(`modal not found: ${title}`);
  }
  return modal.find('.ant-modal-footer .ant-btn-primary');
}

describe('ColumnBulkOperationsView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders grid rows with the deprecated marker and totals', { timeout: 15000 }, async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(GRID_PAYLOAD)));
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="column-grid-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('email');
    expect(wrapper.text()).toContain('Email');
    expect(wrapper.text()).toContain('Deprecated');
    expect(wrapper.text()).toContain('1 unique columns');
  });

  it('edits a group, previews, then applies to every occurrence', { timeout: 15000 }, async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        calls.push(url);
        if (url.includes('/bulk-update-preview')) {
          return jsonResponse({
            columnPreviews: [
              {
                columnFQN: 'svc.db.schema.users.email',
                entityFQN: 'svc.db.schema.users',
                hasChanges: true,
                currentValues: { displayName: 'Email' },
                newValues: { displayName: 'Email Address' },
              },
              {
                columnFQN: 'svc.db.schema.customers.email',
                entityFQN: 'svc.db.schema.customers',
                hasChanges: true,
                currentValues: { displayName: 'Email' },
                newValues: { displayName: 'Email Address' },
              },
            ],
            totalColumns: 2,
          });
        }
        if (url.includes('/bulk-update-async')) {
          return jsonResponse({});
        }
        return jsonResponse(GRID_PAYLOAD);
      }),
    );
    const wrapper = await mountView();
    const editButton = wrapper.findAll('button').find((button) => button.text() === 'Edit');
    expect(editButton).toBeDefined();
    await editButton!.trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="column-edit-display-name"]').setValue('Email Address');
    await modalPrimaryButton(wrapper, 'Edit column metadata').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('2 of 2 columns will change');
    await modalPrimaryButton(wrapper, 'Preview bulk update').trigger('click');
    await flushPromises();
    const applyCall = vi.mocked(fetch).mock.calls.find((call) => String(call[0]).includes('/bulk-update-async'));
    expect(applyCall).toBeDefined();
    const body = JSON.parse(String(applyCall![1]?.body));
    expect(body.columnUpdates).toHaveLength(2);
    expect(body.columnUpdates.map((item: { columnFQN: string }) => item.columnFQN)).toEqual([
      'svc.db.schema.users.email',
      'svc.db.schema.customers.email',
    ]);
    expect(calls.some((url) => url.includes('/bulk-update-preview'))).toBe(true);
  });

  it('shows the forbidden empty on 403', { timeout: 15000 }, async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 403)));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('Access not allowed');
  });

  it('exports the current grid filters as CSV', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes('/columns/export')) {
          return new Response('name,description\nemail,Contact email\n', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return jsonResponse(GRID_PAYLOAD);
      }),
    );
    const createObjectURL = vi.fn(() => 'blob:columns');
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    try {
      const wrapper = await mountView();
      await wrapper.find('[data-testid="column-export-button"]').trigger('click');
      await flushPromises();
      expect(
        vi.mocked(fetch).mock.calls.some((call) => String(call[0]).includes('/columns/export')),
      ).toBe(true);
      expect(createObjectURL).toHaveBeenCalled();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  it('imports columns with a dry-run preview before applying', { timeout: 15000 }, async () => {
    const resultPayload = (dryRun: boolean) => ({
      dryRun,
      status: 'partialSuccess',
      numberOfRowsProcessed: 2,
      numberOfRowsPassed: 1,
      numberOfRowsFailed: 1,
      importResultsCsv:
        'columnFQN,status,details\nsvc.db.schema.users.email,success,Entity updated\nsvc.db.schema.customers.email,failure,denied\n',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes('/columns/import')) {
          return jsonResponse(resultPayload(url.includes('dryRun=true')));
        }
        return jsonResponse(GRID_PAYLOAD);
      }),
    );
    const wrapper = await mountView();
    await wrapper.find('[data-testid="column-import-button"]').trigger('click');
    await flushPromises();
    const fileInput = wrapper.find('[data-testid="column-import-file-input"]');
    const file = new File(['columnFQN,description\nsvc.db.schema.users.email,Contact\n'], 'cols.csv', {
      type: 'text/csv',
    });
    Object.defineProperty(fileInput.element, 'files', { value: [file] });
    await fileInput.trigger('change');
    await flushPromises();
    await modalPrimaryButton(wrapper, 'Import columns CSV').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('denied');
    expect(
      vi.mocked(fetch).mock.calls.some((call) => String(call[0]).includes('dryRun=true')),
    ).toBe(true);
    await modalPrimaryButton(wrapper, 'Import columns CSV').trigger('click');
    await flushPromises();
    expect(
      vi.mocked(fetch).mock.calls.some((call) => String(call[0]).includes('dryRun=false')),
    ).toBe(true);
  });
});
