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
            { columnFQN: 'svc.db.schema.users.email', entityFQN: 'svc.db.schema.users', entityType: 'table', entityDisplayName: 'users', serviceName: 'svc', databaseName: 'db', schemaName: 'schema' },
            { columnFQN: 'svc.db.schema.customers.email', entityFQN: 'svc.db.schema.customers', entityType: 'table', serviceName: 'svc', databaseName: 'db', schemaName: 'schema' },
          ],
          tags: [{ tagFQN: 'PII.Email', source: 'Tag' }],
        },
      ],
    },
    {
      columnName: 'id',
      hasVariations: false,
      groups: [
        {
          groupId: 'g2',
          displayName: 'Id',
          description: 'Row id',
          dataType: 'INT',
          occurrenceCount: 1,
          occurrences: [
            { columnFQN: 'svc.db.schema.users.id', entityFQN: 'svc.db.schema.users', entityType: 'table', serviceName: 'svc', databaseName: 'db', schemaName: 'schema' },
          ],
          tags: [],
        },
      ],
    },
  ],
  totalOccurrences: 3,
  totalUniqueColumns: 2,
};

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/govern/column-bulk-ops', name: 'column-bulk-ops', component: ColumnBulkOperationsView },
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div />' } },
    ],
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

async function expandEmailGroup(wrapper: ReturnType<typeof mount>): Promise<void> {
  const toggle = wrapper.findAll('button').find((button) => button.text() === '›');
  expect(toggle).toBeDefined();
  await toggle!.trigger('click');
  await flushPromises();
}

describe('ColumnBulkOperationsView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders group rows with the deprecated marker and totals', { timeout: 15000 }, async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(GRID_PAYLOAD)));
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="column-grid-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('email (2)');
    expect(wrapper.text()).toContain('Deprecated');
    expect(wrapper.text()).toContain('2 unique columns');
    expect(wrapper.text()).toContain('Pending changes: 0');
    // Occurrence rows stay hidden until the group expands.
    expect(wrapper.text()).not.toContain('svc.db.schema.users');
    // The single-occurrence column is one flat row.
    expect(wrapper.text()).toContain('id');
  });

  it('expands a group into per-occurrence rows with entity links', { timeout: 15000 }, async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(GRID_PAYLOAD)));
    const wrapper = await mountView();
    await expandEmailGroup(wrapper);
    const links = wrapper.findAll('[data-testid="column-entity-link"]');
    expect(links).toHaveLength(3);
    expect(links[0].attributes('href')).toBe('/assets/table/svc.db.schema.users');
    expect(links[0].text()).toBe('users');
    expect(links[1].text()).toBe('customers');
    expect(links[2].attributes('href')).toBe('/assets/table/svc.db.schema.users');
    // Pin's asset column shows the entity link, not the
    // `service / database / schema` path string (that string lives on
    // the row model only, as in pin's ColumnGridRowData).
  });

  it('selects occurrence rows and applies the edit straight to bulk-update-async', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes('/bulk-update-async')) {
          return jsonResponse({});
        }
        return jsonResponse(GRID_PAYLOAD);
      }),
    );
    const wrapper = await mountView();
    await expandEmailGroup(wrapper);
    const boxes = wrapper.findAll('tbody .ant-checkbox-input');
    expect(boxes.length).toBeGreaterThanOrEqual(3);
    // Group checkbox selects both occurrences; the flat row is last.
    await boxes[0].setValue(true);
    await flushPromises();
    expect(wrapper.text()).toContain('View selected (2)');
    await wrapper.find('[data-testid="column-edit-selected-button"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="column-edit-display-name"]').setValue('Email Address');
    await modalPrimaryButton(wrapper, 'Edit column metadata').trigger('click');
    await flushPromises();
    // Pin's page has no preview step: no preview call, straight to async.
    expect(
      vi.mocked(fetch).mock.calls.some((call) => String(call[0]).includes('/bulk-update-preview')),
    ).toBe(false);
    const applyCall = vi.mocked(fetch).mock.calls.find((call) => String(call[0]).includes('/bulk-update-async'));
    expect(applyCall).toBeDefined();
    const body = JSON.parse(String(applyCall![1]?.body));
    expect(body.columnUpdates).toHaveLength(2);
    expect(body.columnUpdates.map((item: { columnFQN: string }) => item.columnFQN)).toEqual([
      'svc.db.schema.users.email',
      'svc.db.schema.customers.email',
    ]);
    expect(body.columnUpdates[0].displayName).toBe('Email Address');
    expect(wrapper.text()).toContain('Pending changes: 0');
  });

  it('opens the edit form from a column name with a view-asset link', { timeout: 15000 }, async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(GRID_PAYLOAD)));
    const wrapper = await mountView();
    await expandEmailGroup(wrapper);
    const nameButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'email');
    expect(nameButton).toBeDefined();
    await nameButton!.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('View selected (1)');
    const assetLink = wrapper.find('[data-testid="column-view-asset-link"]');
    expect(assetLink.exists()).toBe(true);
    expect(assetLink.attributes('href')).toBe('/assets/table/svc.db.schema.users?tab=schema#email');
    expect(wrapper.find('[data-testid="column-edit-display-name"]').exists()).toBe(true);
  });

  it('stages edits on the selected rows and discards them on cancel', { timeout: 15000 }, async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(GRID_PAYLOAD)));
    const wrapper = await mountView();
    await expandEmailGroup(wrapper);
    const boxes = wrapper.findAll('tbody .ant-checkbox-input');
    await boxes[1].setValue(true);
    await flushPromises();
    await wrapper.find('[data-testid="column-edit-selected-button"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="column-edit-description"]').setValue('Updated description');
    await flushPromises();
    expect(wrapper.text()).toContain('Pending changes: 1/1');
    // The staged description renders as a warning tag in the grid (the
    // deprecated badge is the only other warning tag on the page).
    expect(wrapper.findAll('.ant-tag-warning')).toHaveLength(2);
    const modal = wrapper
      .findAll('.ant-modal')
      .find((node) => node.text().includes('Edit column metadata'));
    expect(modal).toBeDefined();
    await modal!.find('.ant-modal-footer .ant-btn-default').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Pending changes: 0');
    expect(wrapper.findAll('.ant-tag-warning')).toHaveLength(1);
    expect(wrapper.text()).not.toContain('Updated description');
  });

  it('shows the bulk progress indicator while the async apply is in flight', { timeout: 15000 }, async () => {
    let resolveApply!: (value: Response) => void;
    const applyPromise = new Promise<Response>((resolve) => {
      resolveApply = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes('/bulk-update-async')) {
          return applyPromise;
        }
        return jsonResponse(GRID_PAYLOAD);
      }),
    );
    const wrapper = await mountView();
    await expandEmailGroup(wrapper);
    const boxes = wrapper.findAll('tbody .ant-checkbox-input');
    await boxes[0].setValue(true);
    await flushPromises();
    await wrapper.find('[data-testid="column-edit-selected-button"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="column-edit-display-name"]').setValue('Email Address');
    await modalPrimaryButton(wrapper, 'Edit column metadata').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="bulk-update-progress-spinner"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Pending changes: 0/2');
    resolveApply(jsonResponse({}));
    await flushPromises();
    expect(wrapper.find('[data-testid="bulk-update-progress-spinner"]').exists()).toBe(false);
  });

  it('filters to selected rows with the view-selected toggle', { timeout: 15000 }, async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(GRID_PAYLOAD)));
    const wrapper = await mountView();
    await expandEmailGroup(wrapper);
    const boxes = wrapper.findAll('tbody .ant-checkbox-input');
    await boxes[1].setValue(true);
    await flushPromises();
    await wrapper.find('[data-testid="column-view-selected-toggle"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('tbody tr')).toHaveLength(1);
    expect(wrapper.text()).toContain('users');
    expect(wrapper.text()).not.toContain('customers');
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
