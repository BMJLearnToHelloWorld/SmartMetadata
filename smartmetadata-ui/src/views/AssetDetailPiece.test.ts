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
    taskGraph: { nodes: [], edges: [] },
    customProperties: [],
    customPropsError: '',
    apiEndpointSchemaJson: (schema) => JSON.stringify(schema ?? {}),
    descriptionAccess: false,
    descriptionExpanded: false,
    onDescriptionUpdate: vi.fn(),
    customPropsCanView: false,
    schemaTagOptions: [],
    schemaTagAccess: { canEditTags: true, canEditGlossaryTerms: true, readOnly: false },
    onSchemaTagChange: vi.fn(),
    onTableFqnClick: vi.fn(),
    catalogOwners: [],
    catalogTags: [],
    catalogDomains: [],
    tagsAccess: false,
    glossaryTermsAccess: false,
    ownersAccess: false,
    domainsAccess: false,
    dataProductsAccess: false,
    customPropsCanEdit: false,
    onTagsChange: vi.fn(),
    onOwnersChange: vi.fn(),
    onDomainsChange: vi.fn(),
    onDataProductsChange: vi.fn(),
    onCustomPropertySave: vi.fn(),
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
    // D-2 batch 4: canViewBasic is a required (non-optional) context field
    // (boolean | null); the Partial overrides spread above would leave it
    // `boolean | null | undefined`, so pin it to a defined value here.
    // Fail-closed default false; an explicit override (incl. null) is kept.
    canViewBasic: overrides.canViewBasic ?? false,
    // D-2 batch 5a: tableConstraintsAccess / onTableConstraintsUpdate are
    // required context fields; pin them the same way (fail-closed false,
    // save mock resolving so a modal save succeeds silently by default).
    tableConstraintsAccess: overrides.tableConstraintsAccess ?? false,
    onTableConstraintsUpdate: overrides.onTableConstraintsUpdate ?? vi.fn(async () => undefined),
    // D-2 batch 5b: metricDefinitionCanEdit / onMetricDefinitionSave /
    // pipelineTaskAccess / onTaskDescriptionUpdate / onTaskTagChange are
    // required context fields; the Partial overrides spread above would leave
    // them `... | undefined`, so pin them to defined values here.
    // Fail-closed defaults; an explicit override is kept.
    metricDefinitionCanEdit: overrides.metricDefinitionCanEdit ?? false,
    onMetricDefinitionSave: overrides.onMetricDefinitionSave ?? (async () => {}),
    pipelineTaskAccess: overrides.pipelineTaskAccess ?? {
      canEditDescription: false,
      canEditTags: false,
      canEditGlossaryTerms: false,
      readOnly: true,
    },
    onTaskDescriptionUpdate: overrides.onTaskDescriptionUpdate ?? (async () => {}),
    onTaskTagChange: overrides.onTaskTagChange ?? (async () => {}),
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

function baseAsset(overrides: Partial<AssetDetail> = {}): AssetDetail {
  return {
    entityType: 'table',
    name: 'orders',
    fullyQualifiedName: 'svc.db.schema.orders',
    owners: [],
    tags: [],
    domains: [],
    schemaRows: [],
    schemaLabel: 'Columns',
    ...overrides,
  };
}

function mountWidgetPiece(
  piece: AssetDetailPieceId,
  asset: AssetDetail,
  extraContext: Partial<AssetDetailPieceContext> = {},
) {
  const context = {
    asset,
    entityType: 'table',
    onTableFqnClick: vi.fn(),
    ...extraContext,
  } as unknown as AssetDetailPieceContext;
  const wrapper = mount(AssetDetailPiece, {
    props: { piece, context },
    global: { plugins: [Antd, createTestI18n()] },
  });
  return { wrapper, onTableFqnClick: context.onTableFqnClick as unknown as ReturnType<typeof vi.fn> };
}

describe('AssetDetailPiece D-1 table widgets', () => {
  it('renders partition columns with -- for a missing interval type', () => {
    const { wrapper } = mountWidgetPiece(
      'partitionedKeys',
      baseAsset({
        tablePartition: {
          columns: [
            { columnName: 'ds', intervalType: 'TIME-UNIT' },
            { columnName: 'region' },
          ],
        },
      }),
    );
    expect(wrapper.find('[data-testid="asset-partitioned-keys-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('ds');
    expect(wrapper.text()).toContain('TIME-UNIT');
    expect(wrapper.text()).toContain('region');
    expect(wrapper.text()).toContain('--');
    wrapper.unmount();
  });

  it('renders aliases by trailing name with the full FQN as the hover title', () => {
    const { wrapper } = mountWidgetPiece(
      'tableAliases',
      baseAsset({ aliases: ['svc.db.schema.orders_alias', 'svc.db.schema."my.tbl"'] }),
    );
    expect(wrapper.find('[data-testid="table-aliases-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('orders_alias');
    // A quoted dotted name stays one segment (official Fqn.split rule).
    expect(wrapper.text()).toContain('my.tbl');
    const titled = wrapper.find('span[title="svc.db.schema.orders_alias"]');
    expect(titled.exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders constraint groups and navigates a foreign-key reference to its table', async () => {
    const { wrapper, onTableFqnClick } = mountWidgetPiece(
      'tableConstraints',
      baseAsset({
        tableConstraints: [
          { constraintType: 'PRIMARY_KEY', columns: ['id'] },
          {
            constraintType: 'FOREIGN_KEY',
            columns: ['customer_id'],
            referredColumns: ['svc.db.schema.customers.id'],
          },
        ],
      }),
    );
    expect(wrapper.find('[data-testid="PRIMARY_KEY-container"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Primary key');
    expect(wrapper.text()).toContain('id');
    expect(wrapper.find('[data-testid="FOREIGN_KEY-container"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Foreign key');
    const link = wrapper.find('[data-testid="FOREIGN_KEY-container"] a');
    expect(link.exists()).toBe(true);
    expect(link.attributes('title')).toBe('svc.db.schema.customers.id');
    await link.trigger('click');
    expect(onTableFqnClick).toHaveBeenCalledWith('svc.db.schema.customers');
    wrapper.unmount();
  });

  it('renders referred columns as plain text when no table navigation is wired', () => {
    const { wrapper } = mountWidgetPiece(
      'tableConstraints',
      baseAsset({
        tableConstraints: [
          {
            constraintType: 'FOREIGN_KEY',
            columns: ['customer_id'],
            referredColumns: ['svc.db.schema.customers.id'],
          },
        ],
      }),
      { onTableFqnClick: undefined },
    );
    expect(wrapper.find('[data-testid="FOREIGN_KEY-container"] a').exists()).toBe(false);
    expect(wrapper.text()).toContain('svc.db.schema.customers.id');
    wrapper.unmount();
  });

  it('renders an empty state when the table has no constraints', () => {
    const { wrapper } = mountWidgetPiece('tableConstraints', baseAsset({ tableConstraints: [] }));
    expect(wrapper.find('[data-testid="asset-table-constraints-empty"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
