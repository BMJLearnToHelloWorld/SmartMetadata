/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 *
 * Official ContractSchemaFormTab columns: name, type, tags, glossary
 * terms, and table-only constraints. No description column.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import ContractSchemaFormTab from './ContractSchemaFormTab.vue';

const getTableColumnsByFQN = vi.fn();
const getDataModelColumnsByFQN = vi.fn();

vi.mock('@/api/columns', () => ({
  getTableColumnsByFQN: (...args: unknown[]) => getTableColumnsByFQN(...args),
  getDataModelColumnsByFQN: (...args: unknown[]) => getDataModelColumnsByFQN(...args),
}));

const mockColumns = [
  {
    name: 'id',
    dataType: 'BIGINT',
    dataTypeDisplay: 'bigint',
    description: 'Primary key',
    tags: [
      { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' },
      { tagFQN: 'PII.Email', name: 'Email', source: 'Classification' },
      { tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification' },
      { tagFQN: 'Glossary.PII.Email', name: 'EmailTerm', source: 'Glossary' },
    ],
    constraint: 'PRIMARY_KEY',
    fullyQualifiedName: 'service.database.schema.table.id',
  },
  {
    name: 'name',
    dataType: 'VARCHAR',
    description: 'User name',
    tags: [{ tagFQN: 'PersonalData.Personal', name: 'Personal', source: 'Classification' }],
    fullyQualifiedName: 'service.database.schema.table.name',
  },
];

function mountTab(props: Record<string, unknown> = {}) {
  return mount(ContractSchemaFormTab, {
    props: {
      entityType: 'table',
      entityFqn: 'service.database.schema.table',
      selectedSchema: [],
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

describe('ContractSchemaFormTab official columns', () => {
  beforeEach(() => {
    getTableColumnsByFQN.mockReset().mockResolvedValue({ data: mockColumns, paging: { total: mockColumns.length } });
    getDataModelColumnsByFQN.mockReset().mockResolvedValue({ data: [], paging: { total: 0 } });
  });

  it('fetches table columns with official tags field on mount', async () => {
    const wrapper = mountTab();
    await flushPromises();
    expect(getTableColumnsByFQN).toHaveBeenCalledWith(
      'service.database.schema.table',
      expect.objectContaining({ fields: 'tags' }),
    );
    wrapper.unmount();
  });

  it('renders official name, type, tags, glossary, and constraint columns and not description', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const headers = wrapper.findAll('th').map((cell) => cell.text());
    expect(headers).toContain('Name');
    expect(headers).toContain('Type');
    expect(headers).toContain('Tags');
    expect(headers).toContain('Glossary Terms');
    expect(headers).toContain('Constraints');
    expect(headers).not.toContain('Description');
    expect(wrapper.text()).toContain('bigint');
    expect(wrapper.text()).toContain('PRIMARY_KEY');
    expect(wrapper.text()).not.toContain('Primary key');
    wrapper.unmount();
  });

  it('caps classification tags at one chip plus official +N more', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const firstRow = wrapper.findAll('tr').find((row) => row.text().includes('id'));
    expect(firstRow).toBeTruthy();
    const more = wrapper.get('[data-testid="plus-more-count"]');
    expect(more.text()).toBe('+2 more');
    wrapper.unmount();
  });

  it('omits the constraint column when the entity is not a table', async () => {
    getDataModelColumnsByFQN.mockResolvedValue({ data: mockColumns, paging: { total: mockColumns.length } });
    const wrapper = mountTab({ entityType: 'dashboardDataModel', entityFqn: 'service.dashboard.model' });
    await flushPromises();
    const headers = wrapper.findAll('th').map((cell) => cell.text());
    expect(headers).toContain('Tags');
    expect(headers).toContain('Glossary Terms');
    expect(headers).not.toContain('Constraints');
    wrapper.unmount();
  });

  it('falls back to dataType when dataTypeDisplay is empty, and -- when both are missing', async () => {
    getTableColumnsByFQN.mockResolvedValue({
      data: [
        { name: 'plain', dataType: 'STRING', fullyQualifiedName: 'svc.db.sch.t.plain' },
        { name: 'empty', fullyQualifiedName: 'svc.db.sch.t.empty' },
      ],
      paging: { total: 2 },
    });
    const wrapper = mountTab();
    await flushPromises();
    expect(wrapper.text()).toContain('STRING');
    expect(wrapper.text()).toContain('--');
    wrapper.unmount();
  });
});