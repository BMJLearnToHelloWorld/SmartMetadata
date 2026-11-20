/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createTestI18n } from '@/test/i18n';
import type { AssetDetail, SchemaRow } from '@/types/api';
import AssetDetailPiece, {
  type AssetDetailPieceContext,
  type AssetDetailPieceId,
} from './AssetDetailPiece.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

async function tick(ms = 10) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await nextTick();
}

function row(partial: Partial<SchemaRow> & { name: string }): SchemaRow {
  return {
    key: partial.name,
    dataType: 'VARCHAR',
    fullyQualifiedName: `t.${partial.name}`,
    indexPath: [0],
    ...partial,
  };
}

function baseContext(overrides: Partial<AssetDetailPieceContext> = {}): AssetDetailPieceContext {
  const asset = {
    name: 'users',
    displayName: 'Users',
    fullyQualifiedName: 'svc.db.schema.users',
    description: 'User table',
    schemaLabel: 'Schema',
    schemaRows: [row({ name: 'email', description: 'Contact email' })],
    tags: [],
    owners: [],
    domains: [],
  } as unknown as AssetDetail;
  return {
    asset,
    entityType: 'table',
    schemaColumns: [
      { title: 'Name', dataIndex: 'name', key: 'name' },
      { title: 'Type', dataIndex: 'dataType', key: 'dataType' },
      { title: 'Description', dataIndex: 'description', key: 'description' },
      { title: 'Tags', dataIndex: 'tags', key: 'tags' },
      { title: 'Glossary Terms', dataIndex: 'tags', key: 'glossaryTerms' },
    ],
    schemaExpandable: { rowExpandable: (record: SchemaRow) => (record.children?.length ?? 0) > 0 },
    featureColumns: [
      { title: 'Name', dataIndex: 'name', key: 'name' },
      { title: 'Type', dataIndex: 'dataType', key: 'dataType' },
      { title: 'Description', dataIndex: 'description', key: 'description' },
      { title: 'Tags', dataIndex: 'tags', key: 'tags' },
      { title: 'Glossary Terms', dataIndex: 'tags', key: 'glossaryTerms' },
    ],
    hyperColumns: [],
    refColumns: [],
    apiEndpointColumns: [],
    taskGraph: { nodes: [], edges: [] },
    taskGraphEmpty: true,
    customProperties: [],
    customPropsError: '',
    apiEndpoints: [],
    apiEndpointsError: '',
    apiEndpointSchemaJson: (schema) => JSON.stringify(schema ?? {}),
    onApiEndpointClick: vi.fn(),
    descriptionAccess: false,
    descriptionExpanded: false,
    onDescriptionUpdate: vi.fn(),
    customPropsCanView: false,
    schemaTagOptions: [],
    schemaTagAccess: { canEditTags: true, canEditGlossaryTerms: true, readOnly: false },
    onSchemaTagChange: vi.fn(),
    schemaAccess: {
      canEditDescription: true,
      canEditTags: true,
      canEditGlossaryTerms: true,
      canEditDisplayName: true,
      canEditCustomFields: true,
      canEditAll: true,
      canViewUsage: false,
      readOnly: false,
      resolved: true,
    },
    schemaRows: [row({ name: 'email', description: 'Contact email' })],
    schemaSearchText: '',
    schemaSortBy: 'ordinalPosition',
    schemaSortOrder: 'asc',
    schemaPage: 1,
    schemaPageSize: 50,
    schemaTotal: 1,
    schemaLoading: false,
    schemaError: '',
    schemaTagFilterOptions: { classification: [], glossary: [] },
    schemaTagClassification: [],
    schemaTagGlossary: [],
    schemaExpandedKeys: [],
    columnCustomProperties: [],
    onSchemaSearchChange: vi.fn(),
    onSchemaSortChange: vi.fn(),
    onSchemaPageChange: vi.fn(),
    onSchemaTagFilterChange: vi.fn(),
    onSchemaDescriptionSave: vi.fn(async () => undefined),
    onSchemaDisplayNameSave: vi.fn(async () => undefined),
    onSchemaExtensionSave: vi.fn(async () => undefined),
    topicView: 'fields',
    onTopicViewChange: vi.fn(),
    apiSchemaView: 'requestSchema',
    apiSchemaRows: [],
    onApiSchemaViewChange: vi.fn(),
    databaseSchemas: [],
    databaseSchemasTotal: 0,
    databaseSchemaHasNext: false,
    databaseSchemaHasPrev: false,
    databaseSchemaLoading: false,
    databaseSchemaError: '',
    databaseSchemaSearch: '',
    databaseSchemaShowDeleted: false,
    databaseSchemaCanViewUsage: false,
    onDatabaseSchemaSearchChange: vi.fn(),
    onDatabaseSchemaNextPage: vi.fn(),
    onDatabaseSchemaPrevPage: vi.fn(),
    onDatabaseSchemaShowDeletedChange: vi.fn(),
    onDatabaseSchemaDisplayNameSave: vi.fn(async () => undefined),
    ...overrides,
  };
}

function mountPiece(piece: AssetDetailPieceId, context: AssetDetailPieceContext) {
  return mount(AssetDetailPiece, {
    props: { piece, context },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

describe('AssetDetailPiece schema table (D-2 batch 3)', () => {
  it('renders the effective server rows, not the context payload rows', async () => {
    const wrapper = mountPiece(
      'schemaTable',
      baseContext({
        schemaRows: [row({ name: 'server-email', description: 'from the column endpoint' })],
      }),
    );
    await tick();
    expect(wrapper.text()).toContain('server-email');
    expect(wrapper.text()).toContain('from the column endpoint');
    expect(wrapper.find('[data-testid="asset-schema-table"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('opens the description modal when an editable description is clicked', async () => {
    const wrapper = mountPiece('schemaTable', baseContext());
    await tick();
    const edit = wrapper.find('[data-testid="schema-description-edit"]');
    expect(edit.exists()).toBe(true);
    await edit.trigger('click');
    await tick();
    expect(document.body.textContent).toContain('Edit Column: "email"');
    wrapper.unmount();
  });

  it('hides the description editor for a read-only viewer', async () => {
    const wrapper = mountPiece(
      'schemaTable',
      baseContext({
        schemaAccess: {
          canEditDescription: false,
          canEditTags: false,
          canEditGlossaryTerms: false,
          canEditDisplayName: false,
          canEditCustomFields: false,
          canEditAll: false,
          canViewUsage: false,
          readOnly: true,
          resolved: true,
        },
      }),
    );
    await tick();
    expect(wrapper.find('[data-testid="schema-description-edit"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="schema-display-name-edit"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the display-name edit button on Table and DataModel rows only', async () => {
    const table = mountPiece('schemaTable', baseContext());
    await tick();
    expect(table.find('[data-testid="schema-display-name-edit"]').exists()).toBe(true);
    table.unmount();

    const topic = mountPiece(
      'schemaTable',
      baseContext({ entityType: 'topic', schemaRows: [row({ name: 'payload' })] }),
    );
    await tick();
    expect(topic.find('[data-testid="schema-display-name-edit"]').exists()).toBe(false);
    topic.unmount();
  });

  it('renders the Topic text view from schemaText instead of the table', async () => {
    const asset = baseContext().asset as unknown as Record<string, unknown>;
    asset.schemaText = '{"type": "record", "name": "Event"}';
    const wrapper = mountPiece(
      'schemaTable',
      baseContext({
        entityType: 'topic',
        topicView: 'text',
        asset: asset as unknown as AssetDetail,
      }),
    );
    await tick();
    expect(wrapper.find('[data-testid="asset-topic-schema-text"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-schema-table"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Event');
    wrapper.unmount();
  });

  it('shows the sort control and search box on the server faces', async () => {
    const wrapper = mountPiece('schemaTable', baseContext());
    await tick();
    expect(wrapper.find('[data-testid="schema-search-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="schema-sort-select"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders the API-schema toggle and the active schema fields', async () => {
    const wrapper = mountPiece(
      'apiSchema',
      baseContext({
        entityType: 'apiEndpoint',
        apiSchemaRows: [row({ name: 'body', description: 'Request body' })],
      }),
    );
    await tick();
    expect(wrapper.find('[data-testid="api-schema-view-request"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-api-schema-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Request body');
    wrapper.unmount();
  });

  it('renders the database-schema list with the display-name edit button', async () => {
    const wrapper = mountPiece(
      'databaseSchemas',
      baseContext({
        entityType: 'database',
        databaseSchemas: [
          {
            id: 's1',
            name: 'public',
            displayName: 'Public',
            fullyQualifiedName: 'svc.db.public',
            description: 'Default schema',
          },
        ],
        databaseSchemasTotal: 1,
      }),
    );
    await tick();
    expect(wrapper.find('[data-testid="asset-database-schemas-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Public');
    expect(wrapper.find('[data-testid="database-schema-display-name-edit"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
