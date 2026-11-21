<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Descriptions, Empty, Input, Pagination, Select, Space, Switch, Tag, Typography, type TableProps } from 'ant-design-vue';
import { EditOutlined, SearchOutlined } from '@ant-design/icons-vue';
import ApiEndpointsWidget from '@/components/lists/ApiEndpointsWidget.vue';
import ContainerChildrenWidget from '@/components/lists/ContainerChildrenWidget.vue';
import DashboardChartsWidget from '@/components/lists/DashboardChartsWidget.vue';
import SchemaTablesWidget from '@/components/lists/SchemaTablesWidget.vue';
import SmTable from '@/components/shared/SmTable.vue';
import ColumnCustomPropertyCell from '@/components/shared/ColumnCustomPropertyCell.vue';
import ColumnDescriptionModal from '@/components/shared/ColumnDescriptionModal.vue';
import ColumnDisplayNameModal, { type ColumnDisplayNameData } from '@/components/shared/ColumnDisplayNameModal.vue';
import ColumnFilter from '@/components/ingestion/ColumnFilter.vue';
import EntityDescriptionCell from '@/components/shared/EntityDescriptionCell.vue';
import WidgetCustomPropertiesCell from '@/components/shared/widgets/WidgetCustomPropertiesCell.vue';
import WidgetDataProductsCell from '@/components/shared/widgets/WidgetDataProductsCell.vue';
import WidgetDomainCell from '@/components/shared/widgets/WidgetDomainCell.vue';
import WidgetKnowledgePagesCell from '@/components/shared/widgets/WidgetKnowledgePagesCell.vue';
import WidgetOwnersCell from '@/components/shared/widgets/WidgetOwnersCell.vue';
import WidgetPartitionedKeysCell from '@/components/shared/widgets/WidgetPartitionedKeysCell.vue';
import WidgetTableAliasesCell from '@/components/shared/widgets/WidgetTableAliasesCell.vue';
import WidgetTableConstraintsCell from '@/components/shared/widgets/WidgetTableConstraintsCell.vue';
import WidgetTagsCell from '@/components/shared/widgets/WidgetTagsCell.vue';
import PipelineTaskGraph from '@/components/pipeline/PipelineTaskGraph.vue';
import AssetRelatedPanel from '@/features/crud/AssetRelatedPanel.vue';
import FrequentlyJoinedColumns from '@/features/queries/FrequentlyJoinedColumns.vue';
import FrequentlyJoinedTables from '@/features/queries/FrequentlyJoinedTables.vue';
import SchemaTagCell from '@/views/SchemaTagCell.vue';
import type { SchemaTagFilterOptions } from '@/utils/schemaTagFilter';
import type { TagLabelInput } from '@/governance/assetPatch';
import type { DatabaseSchemaRow } from '@/api/databaseSchemas';
import { assetLocation } from '@/catalog/entityRoutes';
import type { PipelineTaskGraphModel } from '@/pipeline/taskGraph';
import type { AssetDetail, EntityRef, SchemaRow, TableConstraint } from '@/types/api';
import type { CustomPropertyDef } from '@/types/collaboration';
import type { AssetTagOption, Domain, TagSource } from '@/types/governance';
import type { OwnerOption } from '@/governance/catalogOptions';
import { isLargeWidget } from '@/composables/customizeWidgetLayout';
import { getCustomPropertiesWidgetSettings } from '@/views/admin/persona/editors/customPropertiesWidgetSettings';
import type { WidgetConfig } from '@/views/admin/persona/editors/customizeTypes';
import { flattenColumnNames } from '@/governance/tableWidgets';

/**
 * One shared piece of asset-detail content, rendered by both the
 * default tab panes (AssetDetailView) and the widget-grid cells (the
 * B-8 widget layer). A piece is the finest content unit the product
 * already renders: moving a pane block here keeps the default pane
 * and the widget cell rendering the same markup from the same data,
 * instead of duplicating the block in both places. Pieces that are a
 * single shared-component call (related panel, custom-properties
 * panel, frequently-joined tables) stay one-liners; the inline blocks
 * (schema table, features, tasks, code, charts, API blocks, metric
 * expression) moved here verbatim from AssetDetailView, testids
 * included. The governance fragments (description, tags, glossary
 * terms, owners, domains, data products, knowledge pages) are the
 * D-2 batch 2 shared widget cells — the same datum the overview pane
 * shows in its Descriptions rows, now editable in place. The
 * glossary-terms cell filters the tag list by `source === 'Glossary'`
 * (the tags cell shows the Classification source only; tier and
 * certification labels are split off to their own cells).
 *
 * A `null` piece renders nothing: the widget cell stays empty but
 * keeps its grid space, matching official behavior when dispatch
 * returns no content for a widget id.
 */
export type AssetDetailPieceId =
  | 'schemaTable'
  | 'related'
  | 'features'
  | 'tasks'
  | 'code'
  | 'chartsTables'
  | 'apiEndpoints'
  | 'apiSchema'
  | 'metricExpression'
  | 'customProperties'
  | 'description'
  | 'tags'
  | 'glossaryTerms'
  | 'owners'
  | 'domains'
  | 'frequentlyJoined'
  | 'partitionedKeys'
  | 'tableConstraints'
  | 'tableAliases'
  | 'dataProducts'
  | 'knowledgePages'
  | 'databaseSchemas';

export interface AssetDetailPieceContext {
  asset: AssetDetail;
  entityType: string;
  schemaColumns: TableProps['columns'];
  /** The view's expandable object verbatim: antd's TableProps carries no
      `expandable` member in this version (SmTable has the same gap), so
      the field mirrors the literal shape the view builds. */
  schemaExpandable: { rowExpandable: (record: SchemaRow) => boolean };
  featureColumns: TableProps['columns'];
  hyperColumns: TableProps['columns'];
  refColumns: TableProps['columns'];
  taskGraph: PipelineTaskGraphModel;
  taskGraphEmpty: boolean;
  customProperties: CustomPropertyDef[];
  customPropsError: string;
  apiEndpointSchemaJson: (schema: Record<string, unknown> | undefined) => string;
  /** The asset's own canViewBasic; null while the view's permission fetch
      is unresolved — the Tables widget fetches nothing until it is true
      (fail-closed view gate, pin SchemaTablesTab). */
  canViewBasic: boolean | null;
  /**
   * D-1 table-constraint foreign keys: the referred column FQN resolves
   * to its table (official `getPartialNameFromTableFQN`, first four
   * parts) and navigates there. Absent, referred columns render as
   * plain text — the link affordance degrades, the data does not.
   */
  onTableFqnClick?: (fqn: string) => void;
  /**
   * D-F2 column-tag editing. `schemaTagOptions` is the governance catalog's
   * tag list (both sources; the cell filters to its own source).
   * `schemaTagAccess` carries the per-surface derived flags — Table /
   * Container pass `deleted` into the derivation, Topic / SearchIndex /
   * DataModel do not (official permission convention per surface) — plus
   * the cell-level `readOnly` from the entity's deleted flag, so a
   * soft-deleted entity's cells stay read-only even when the ungated
   * flags still grant. `onSchemaTagChange` writes one source's selection
   * for one row (PUT group or PATCH group, decided by the view).
   */
  schemaTagOptions: AssetTagOption[];
  schemaTagAccess: { canEditTags: boolean; canEditGlossaryTerms: boolean; readOnly: boolean };
  onSchemaTagChange: (row: SchemaRow, source: TagSource, tagFqns: string[]) => void;
  /**
   * D-F2-2 column-tag filtering. `schemaTagFilterOptions` are the Tags /
   * Glossary Terms dropdown options collected from the detail rows (the
   * full, unfiltered set — the server-filtered page is a subset of it).
   * The piece never decides which rows to show: it renders
   * `context.schemaRows` (the view's effective rows) and reports filter
   * changes through `context.onSchemaTagFilterChange`.
   */
  schemaTagFilterOptions: SchemaTagFilterOptions;
  /**
   * D-3 description cell: `descriptionAccess` is the derived
   * canEditDescription for the asset (deleted-gated); `onDescriptionUpdate`
   * is the view's description PATCH save. `descriptionExpanded` is the
   * official isDescriptionExpandedFor value for this entity type (the
   * description starts unfolded when the type's primary collection is
   * empty). `customPropsCanView` is the custom-properties read gate
   * (null while the permission fetch resolves).
   */
  descriptionAccess: boolean;
  descriptionExpanded: boolean;
  onDescriptionUpdate: (description: string) => Promise<unknown> | unknown;
  customPropsCanView: boolean | null;
  /**
   * D-2 batch 2 widget cells: the governance catalog's picker options
   * plus the per-cell derived edit access (the caller ORs
   * `isAdminUser` into each flag) and the cell save handlers (each
   * PATCHes the asset and reloads; each throws on failure so the cell
   * keeps its editor open).
   */
  catalogOwners: OwnerOption[];
  catalogTags: AssetTagOption[];
  catalogDomains: Domain[];
  tagsAccess: boolean;
  glossaryTermsAccess: boolean;
  ownersAccess: boolean;
  domainsAccess: boolean;
  dataProductsAccess: boolean;
  customPropsCanEdit: boolean;
  onTagsChange: (tags: TagLabelInput[]) => Promise<unknown> | unknown;
  onOwnersChange: (owners: Array<{ id: string; type: 'user' | 'team' }>) => Promise<unknown> | unknown;
  onDomainsChange: (domainIds: string[]) => Promise<unknown> | unknown;
  onDataProductsChange: (products: EntityRef[]) => Promise<unknown> | unknown;
  onCustomPropertySave: (name: string, value: unknown) => Promise<unknown> | unknown;
  /*
   * D-2 batch 3 schema-cell editing (official SchemaTable / TopicSchema /
   * DatabaseSchema / ContainerDataModel / SearchIndexFieldsTable /
   * ModelTab / APIEndpointSchema / MlModelFeaturesList). `schemaAccess`
   * is the full derived flag set (A8 + P1 dual line, fail-closed while
   * unresolved); `schemaRows` is the effective row list — the server
   * page for Table / DataModel, client-searched/filtered context rows
   * for Topic / SearchIndex, context rows otherwise. The search / sort /
   * page / tag-filter callbacks drive the view's state machine; the
   * description / display-name / extension saves throw on failure so
   * the modals keep open.
   */
  schemaAccess: {
    canEditDescription: boolean;
    canEditTags: boolean;
    canEditGlossaryTerms: boolean;
    canEditDisplayName: boolean;
    canEditCustomFields: boolean;
    canEditAll: boolean;
    canViewUsage: boolean;
    readOnly: boolean;
    resolved: boolean;
  };
  schemaRows: SchemaRow[];
  schemaSearchText: string;
  schemaSortBy: 'name' | 'ordinalPosition';
  schemaSortOrder: 'asc' | 'desc';
  schemaPage: number;
  schemaPageSize: number;
  schemaTotal: number;
  schemaLoading: boolean;
  schemaError: string;
  schemaTagClassification: string[];
  schemaTagGlossary: string[];
  schemaExpandedKeys: string[];
  columnCustomProperties: CustomPropertyDef[];
  onSchemaSearchChange: (value: string) => void;
  onSchemaSortChange: (sortBy: 'name' | 'ordinalPosition', sortOrder: 'asc' | 'desc') => void;
  onSchemaPageChange: (page: number) => void;
  onSchemaTagFilterChange: (classification: string[], glossary: string[]) => void;
  onSchemaDescriptionSave: (row: SchemaRow, description: string) => Promise<unknown>;
  onSchemaDisplayNameSave: (
    row: SchemaRow,
    data: { displayName?: string; constraint?: string; removeConstraint?: boolean },
  ) => Promise<unknown>;
  onSchemaExtensionSave: (row: SchemaRow, extension: Record<string, unknown>) => Promise<unknown>;
  /** Topic Fields / Text view (pin TopicSchema schemaText code view). */
  topicView: 'fields' | 'text';
  onTopicViewChange: (view: 'fields' | 'text') => void;
  /** APISchema Request / Response view (pin APIEndpointSchema). */
  apiSchemaView: 'requestSchema' | 'responseSchema';
  apiSchemaRows: SchemaRow[];
  onApiSchemaViewChange: (view: 'requestSchema' | 'responseSchema') => void;
  /** Database child schemas (pin DatabaseSchema.component). */
  databaseSchemas: DatabaseSchemaRow[];
  databaseSchemasTotal: number;
  databaseSchemaHasNext: boolean;
  databaseSchemaHasPrev: boolean;
  databaseSchemaLoading: boolean;
  databaseSchemaError: string;
  databaseSchemaSearch: string;
  databaseSchemaShowDeleted: boolean;
  databaseSchemaCanViewUsage: boolean;
  onDatabaseSchemaSearchChange: (value: string) => void;
  onDatabaseSchemaNextPage: () => void;
  onDatabaseSchemaPrevPage: () => void;
  onDatabaseSchemaShowDeletedChange: (show: boolean) => void;
  onDatabaseSchemaDisplayNameSave: (row: DatabaseSchemaRow, displayName: string) => Promise<unknown>;
  /**
   * D-2 batch 5a table-constraints cell: `tableConstraintsAccess` is
   * the P1 `isAdminUser || canEditAll` gate (deleted-gated); the modal
   * saves through `onTableConstraintsUpdate`, which throws on failure
   * so the modal stays open; `onReferredTableClick` navigates a
   * foreign-key referred column to its parent table.
   */
  tableConstraintsAccess: boolean;
  onTableConstraintsUpdate: (values: TableConstraint[]) => Promise<unknown>;
  onReferredTableClick?: (fqn: string) => void;
}

const props = withDefaults(
  defineProps<{
    piece: AssetDetailPieceId | null;
    context: AssetDetailPieceContext;
    /** Schema-table joins affordances: only the `schema` pane carries them. */
    withJoins?: boolean;
    /**
     * The widget being rendered, for `config` reads (D-8): the
     * description fragment's `removeBlur` and the custom-properties
     * fragment's settings come from this widget's config, as official
     * `DescriptionWidget` / `CustomPropertiesWidget` read
     * `widgetConfig.config`. Null outside a widget cell.
     */
    widget?: WidgetConfig | null;
  }>(),
  { withJoins: false, widget: null },
);

const { t } = useI18n();

const showMetricExpression = computed(
  () =>
    props.context.entityType === 'metric' &&
    Boolean(
      props.context.asset.storedProcedureCode?.code ||
        props.context.asset.storedProcedureCode?.language,
    ),
);

/* D-2 batch 3: the parent holds the data; this piece holds the modal
   state (pin TableDescription/TableTags pattern — the edited row lives
   in the caller, the modal only edits). */
const editDescriptionRow = ref<SchemaRow | null>(null);
const editDisplayNameRow = ref<SchemaRow | null>(null);
const editDatabaseSchemaRow = ref<DatabaseSchemaRow | null>(null);

const isServerSchemaFace = computed(
  () => props.context.entityType === 'table' || props.context.entityType === 'dashboardDataModel',
);
const hasSchemaSearch = computed(
  () =>
    props.context.entityType === 'table' ||
    props.context.entityType === 'dashboardDataModel' ||
    props.context.entityType === 'topic' ||
    props.context.entityType === 'searchIndex',
);
const canEditSchemaDescription = computed(
  () => props.context.schemaAccess.canEditDescription && !props.context.schemaAccess.readOnly,
);
const canEditSchemaDisplayName = computed(
  () => props.context.schemaAccess.canEditDisplayName && !props.context.schemaAccess.readOnly,
);
const canEditSchemaCustomFields = computed(
  () => props.context.schemaAccess.canEditCustomFields && !props.context.schemaAccess.readOnly,
);

/** Search box draft: every keystroke reports to the view (debounced
    server reload for Table / DataModel, immediate client filter for
    Topic / SearchIndex). */
const schemaSearchDraft = computed({
  get: () => props.context.schemaSearchText,
  set: (value: string) => props.context.onSchemaSearchChange(value),
});

/** Pin sort control: name / ordinalPosition × asc / desc, one select. */
const schemaSortValue = computed({
  get: () => `${props.context.schemaSortBy}:${props.context.schemaSortOrder}`,
  set: (value: string) => {
    const [sortBy, sortOrder] = value.split(':') as ['name' | 'ordinalPosition', 'asc' | 'desc'];
    props.context.onSchemaSortChange(sortBy, sortOrder);
  },
});

function customPropertyDef(propertyName: string): CustomPropertyDef | undefined {
  return props.context.columnCustomProperties.find((def) => def.name === propertyName);
}

function columnDisplayLabel(row: SchemaRow): string {
  return row.displayName || row.name;
}

async function saveDescriptionRow(description: string): Promise<void> {
  if (!editDescriptionRow.value) {
    return;
  }
  await props.context.onSchemaDescriptionSave(editDescriptionRow.value, description);
  editDescriptionRow.value = null;
}

async function saveDisplayNameRow(data: ColumnDisplayNameData): Promise<void> {
  if (!editDisplayNameRow.value) {
    return;
  }
  await props.context.onSchemaDisplayNameSave(editDisplayNameRow.value, data);
  editDisplayNameRow.value = null;
}

async function saveDatabaseSchemaDisplayName(displayName: string): Promise<void> {
  if (!editDatabaseSchemaRow.value) {
    return;
  }
  await props.context.onDatabaseSchemaDisplayNameSave(editDatabaseSchemaRow.value, displayName);
  editDatabaseSchemaRow.value = null;
}

/** Pin DatabaseSchema columns: Name / Description / Tags / Usage
    (Usage only when the viewer holds VIEW_USAGE on the resource). */
const databaseSchemaColumns = computed(() => {
  const columns: { title: string; dataIndex: string; key: string; width?: number }[] = [
    { title: t('asset.columns.name'), dataIndex: 'name', key: 'name' },
    { title: t('asset.columns.description'), dataIndex: 'description', key: 'description' },
    { title: t('asset.fields.tags'), dataIndex: 'tags', key: 'tags' },
  ];
  if (props.context.databaseSchemaCanViewUsage) {
    columns.push({ title: t('usage.usage'), dataIndex: 'usagePercentile', key: 'usage', width: 120 });
  }
  return columns;
});

const router = useRouter();

function openDatabaseSchema(row: DatabaseSchemaRow): void {
  if (!row.fullyQualifiedName) {
    return;
  }
  void router.push(assetLocation('databaseSchema', row.fullyQualifiedName));
}
/** Table column names (top-level + nested) for the constraints modal. */
const tableColumnNames = computed(() => flattenColumnNames(props.context.asset.schemaRows));
</script>

<template>
  <template v-if="piece === 'schemaTable'">
    <Typography.Title :level="5">{{ context.asset.schemaLabel }}</Typography.Title>
    <!-- D-2 batch 3: pin TopicSchema Fields/Text toggle (the TEXT view
         renders the read-only schemaText code block). -->
    <div v-if="context.entityType === 'topic'" style="margin-bottom: 12px">
      <Button
        data-testid="topic-view-fields"
        :type="context.topicView === 'fields' ? 'primary' : 'default'"
        @click="context.onTopicViewChange('fields')"
      >
        {{ t('asset.tabs.fields') }}
      </Button>
      <Button
        data-testid="topic-view-text"
        :type="context.topicView === 'text' ? 'primary' : 'default'"
        @click="context.onTopicViewChange('text')"
      >
        {{ t('asset.columns.text') }}
      </Button>
    </div>
    <pre
      v-if="context.entityType === 'topic' && context.topicView === 'text'"
      data-testid="asset-topic-schema-text"
      class="detail__code"
    >{{ context.asset.schemaText || '—' }}</pre>
    <template v-else>
      <!-- D-2 batch 3 toolbar: pin TableSchema / ModelTab search box +
           sort control (server faces); Topic / SearchIndex get the
           search box only (client filter). -->
      <div v-if="hasSchemaSearch" style="display: flex; gap: 8px; margin-bottom: 12px">
        <Input
          v-model:value="schemaSearchDraft"
          data-testid="schema-search-input"
          :placeholder="t('asset.columns.findInTable')"
          allow-clear
        >
          <template #prefix><SearchOutlined /></template>
        </Input>
        <Select
          v-if="isServerSchemaFace"
          v-model:value="schemaSortValue"
          data-testid="schema-sort-select"
          style="min-width: 180px"
        >
          <Select.Option value="ordinalPosition:asc">{{ t('asset.columns.originalOrder') }}</Select.Option>
          <Select.Option value="name:asc">{{ t('asset.columns.alphabeticalAsc') }}</Select.Option>
          <Select.Option value="name:desc">{{ t('asset.columns.alphabeticalDesc') }}</Select.Option>
          <Select.Option value="ordinalPosition:desc">{{ t('asset.columns.originalOrderDesc') }}</Select.Option>
        </Select>
      </div>
      <Alert
        v-if="context.schemaError"
        type="error"
        :message="context.schemaError"
        show-icon
        style="margin-bottom: 12px"
      />
      <Empty
        v-if="!context.schemaRows.length && !context.schemaLoading"
        data-testid="asset-schema-empty"
        :description="t('asset.schemaEmpty')"
      />
      <SmTable
        v-else
        row-key="key"
        test-id="asset-schema-table"
        :columns="context.schemaColumns"
        :data-source="context.schemaRows"
        :expandable="context.schemaExpandable"
        :expanded-row-keys="context.schemaExpandedKeys"
        :loading="context.schemaLoading"
        :pagination="false"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            {{ columnDisplayLabel(record as SchemaRow) }}
            <Button
              v-if="
                canEditSchemaDisplayName &&
                (context.entityType === 'table' || context.entityType === 'dashboardDataModel')
              "
              type="text"
              size="small"
              data-testid="schema-display-name-edit"
              :title="t('label.edit-entity', { entity: t('label.column') })"
              @click="editDisplayNameRow = record as SchemaRow"
            >
              <template #icon><EditOutlined /></template>
            </Button>
            <FrequentlyJoinedColumns
              v-if="withJoins"
              :joins="context.asset.joins"
              :column-name="(record as SchemaRow).name"
            />
          </template>
          <template v-else-if="column.key === 'dataType'">
            {{ (record as SchemaRow).dataType }}
          </template>
          <template v-else-if="column.key === 'description'">
            <!-- Pin TableDescription: the description text itself opens
                 the editor when the viewer may edit it. -->
            <span
              v-if="canEditSchemaDescription"
              data-testid="schema-description-edit"
              style="cursor: pointer"
              @click="editDescriptionRow = record as SchemaRow"
            >
              {{ (record as SchemaRow).description || '—' }}
            </span>
            <span v-else>{{ (record as SchemaRow).description || '—' }}</span>
          </template>
          <template v-else-if="column.key === 'tags'">
            <SchemaTagCell
              :row="(record as SchemaRow)"
              source="Classification"
              :options="context.schemaTagOptions"
              :editable="context.schemaTagAccess.canEditTags && !context.schemaTagAccess.readOnly"
              :on-change="(fqns) => context.onSchemaTagChange(record as SchemaRow, 'Classification', fqns)"
            />
          </template>
          <template v-else-if="column.key === 'glossaryTerms'">
            <SchemaTagCell
              :row="(record as SchemaRow)"
              source="Glossary"
              :options="context.schemaTagOptions"
              :editable="context.schemaTagAccess.canEditGlossaryTerms && !context.schemaTagAccess.readOnly"
              :on-change="(fqns) => context.onSchemaTagChange(record as SchemaRow, 'Glossary', fqns)"
            />
          </template>
          <template v-else-if="typeof column.key === 'string' && column.key.startsWith('customProperty:')">
            <ColumnCustomPropertyCell
              v-if="customPropertyDef(column.key.slice('customProperty:'.length))"
              :property="customPropertyDef(column.key.slice('customProperty:'.length)) as CustomPropertyDef"
              :record="(record as SchemaRow)"
              :has-edit-permissions="canEditSchemaCustomFields"
              :on-extension-update="(row, extension) => context.onSchemaExtensionSave(row, extension)"
            />
          </template>
          <template v-else>
            {{ (record as SchemaRow).description }}
          </template>
        </template>
        <template #customFilterDropdown="{ confirm, column }">
          <ColumnFilter
            v-if="column.key === 'tags'"
            :options="context.schemaTagFilterOptions.classification"
            :selected-values="context.schemaTagClassification"
            :confirm="confirm"
            @change="(values) => context.onSchemaTagFilterChange(values, context.schemaTagGlossary)"
          />
          <ColumnFilter
            v-else-if="column.key === 'glossaryTerms'"
            :options="context.schemaTagFilterOptions.glossary"
            :selected-values="context.schemaTagGlossary"
            :confirm="confirm"
            @change="(values) => context.onSchemaTagFilterChange(context.schemaTagClassification, values)"
          />
        </template>
      </SmTable>
      <!-- D-2 batch 3: server pagination (pin TableSchema / ModelTab
           number-based paging on the column endpoints). -->
      <Pagination
        v-if="isServerSchemaFace && context.schemaTotal > context.schemaPageSize"
        :current="context.schemaPage"
        :page-size="context.schemaPageSize"
        :total="context.schemaTotal"
        :show-size-changer="false"
        style="margin-top: 12px; text-align: right"
        @change="(page: number) => context.onSchemaPageChange(page)"
      />
      <FrequentlyJoinedTables v-if="withJoins && context.entityType === 'table'" :joins="context.asset.joins" />
    </template>
  </template>
  <template v-else-if="piece === 'related'">
    <!-- D-2 batch 4: the TABLES / CONTAINER_CHILDREN / DATABASE_SCHEMA
         keys share this piece; the widget is chosen by entity type. The
         database branch keeps the read-only related panel (batch 3). -->
    <SchemaTablesWidget
      v-if="context.entityType === 'databaseSchema'"
      :schema-fqn="context.asset.fullyQualifiedName"
      :deleted="context.asset.deleted === true"
      :can-view="context.canViewBasic"
    />
    <ContainerChildrenWidget
      v-else-if="context.entityType === 'container'"
      :container-fqn="context.asset.fullyQualifiedName"
    />
    <AssetRelatedPanel v-else :asset="context.asset" />
  </template>
  <template v-else-if="piece === 'features'">
    <Typography.Paragraph type="secondary">{{ t('asset.featuresLead') }}</Typography.Paragraph>
    <Empty
      v-if="!context.asset.mlFeatures?.length && !context.asset.mlHyperParameters?.length"
      data-testid="asset-features-empty"
      :description="t('asset.featuresEmpty')"
    />
    <template v-else>
      <Typography.Title :level="5">{{ t('asset.featuresTitle') }}</Typography.Title>
      <SmTable
        row-key="name"
        test-id="asset-features-table"
        :columns="context.featureColumns"
        :data-source="context.asset.mlFeatures ?? []"
        :pagination="false"
        size="small"
      >
        <!-- D-2 batch 3: pin MlModelFeaturesList edits description /
             tags / glossary per feature card; the product keeps the
             SmTable form (named deviation, BENCHMARK §12) with the same
             edit cells as the schema table. -->
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            {{ (record as SchemaRow).name }}
          </template>
          <template v-else-if="column.key === 'dataType'">
            {{ (record as SchemaRow).dataType }}
          </template>
          <template v-else-if="column.key === 'description'">
            <span
              v-if="canEditSchemaDescription"
              data-testid="schema-description-edit"
              style="cursor: pointer"
              @click="editDescriptionRow = record as SchemaRow"
            >
              {{ (record as SchemaRow).description || '—' }}
            </span>
            <span v-else>{{ (record as SchemaRow).description || '—' }}</span>
          </template>
          <template v-else-if="column.key === 'tags'">
            <SchemaTagCell
              :row="(record as SchemaRow)"
              source="Classification"
              :options="context.schemaTagOptions"
              :editable="context.schemaTagAccess.canEditTags && !context.schemaTagAccess.readOnly"
              :on-change="(fqns) => context.onSchemaTagChange(record as SchemaRow, 'Classification', fqns)"
            />
          </template>
          <template v-else-if="column.key === 'glossaryTerms'">
            <SchemaTagCell
              :row="(record as SchemaRow)"
              source="Glossary"
              :options="context.schemaTagOptions"
              :editable="context.schemaTagAccess.canEditGlossaryTerms && !context.schemaTagAccess.readOnly"
              :on-change="(fqns) => context.onSchemaTagChange(record as SchemaRow, 'Glossary', fqns)"
            />
          </template>
          <template v-else>
            {{ (record as SchemaRow).description }}
          </template>
        </template>
      </SmTable>
      <Typography.Title :level="5" class="detail__schema-title">{{ t('asset.hyperTitle') }}</Typography.Title>
      <SmTable
        row-key="name"
        test-id="asset-hyper-table"
        :columns="context.hyperColumns"
        :data-source="context.asset.mlHyperParameters ?? []"
        :pagination="false"
        size="small"
      />
    </template>
  </template>
  <template v-else-if="piece === 'tasks'">
    <Typography.Paragraph type="secondary">{{ t('asset.tasksLead') }}</Typography.Paragraph>
    <Empty
      v-if="context.taskGraphEmpty"
      data-testid="pipeline-task-empty"
      :description="t('asset.tasksEmpty')"
    />
    <PipelineTaskGraph v-else :model="context.taskGraph" />
  </template>
  <template v-else-if="piece === 'code'">
    <Typography.Paragraph type="secondary">{{ t('asset.codeLead') }}</Typography.Paragraph>
    <Empty
      v-if="!context.asset.storedProcedureCode?.code && !context.asset.storedProcedureCode?.language"
      data-testid="asset-code-empty"
      :description="t('asset.codeEmpty')"
    />
    <pre v-else data-testid="asset-code-block" class="detail__code">{{
      [context.asset.storedProcedureCode?.language, context.asset.storedProcedureCode?.code].filter(Boolean).join('\n\n')
    }}</pre>
  </template>
  <template v-else-if="piece === 'chartsTables'">
    <Typography.Paragraph type="secondary">{{ t('asset.chartsLead') }}</Typography.Paragraph>
    <Empty
      v-if="!context.asset.charts?.length && !context.asset.dataModels?.length"
      data-testid="asset-charts-empty"
      :description="t('asset.chartsEmpty')"
    />
    <template v-else>
      <Typography.Title :level="5">{{ t('asset.chartsTitle') }}</Typography.Title>
      <!-- D-2 batch 4: the charts table is the editable DashboardChartsWidget
           (per-chart fetch + per-chart permissions); the data-models table
           stays the read-only SmTable below. -->
      <DashboardChartsWidget
        :chart-refs="context.asset.charts ?? []"
        :dashboard-fqn="context.asset.fullyQualifiedName"
        :deleted="context.asset.deleted === true"
        :tag-options="context.schemaTagOptions"
      />
      <Typography.Title :level="5" class="detail__schema-title">{{ t('asset.dataModelsTitle') }}</Typography.Title>
      <SmTable
        row-key="name"
        test-id="asset-data-models-table"
        :columns="context.refColumns"
        :data-source="context.asset.dataModels ?? []"
        :pagination="false"
        size="small"
      />
    </template>
  </template>
  <template v-else-if="piece === 'apiEndpoints'">
    <!-- D-2 batch 4: the endpoints table self-fetches (REST list / search)
         with show-deleted and paging; no view-level fetch remains. -->
    <ApiEndpointsWidget
      :api-collection-fqn="context.asset.fullyQualifiedName"
      :service-fqn="context.asset.service?.fullyQualifiedName ?? ''"
    />
  </template>
  <template v-else-if="piece === 'apiSchema'">
    <Descriptions bordered size="small" :column="1">
      <Descriptions.Item :label="t('asset.apiEndpointUrl')">{{ context.asset.apiEndpointUrl || '—' }}</Descriptions.Item>
      <Descriptions.Item :label="t('asset.apiRequestMethod')">{{ context.asset.apiRequestMethod || '—' }}</Descriptions.Item>
    </Descriptions>
    <!-- D-2 batch 3: pin APIEndpointSchema Request/Response toggle; the
         active schema's fields render in the shared schema table (same
         description/tag edit cells), keeping the JSON blocks below as a
         supplementary read surface. -->
    <div style="margin: 12px 0">
      <Button
        data-testid="api-schema-view-request"
        :type="context.apiSchemaView === 'requestSchema' ? 'primary' : 'default'"
        @click="context.onApiSchemaViewChange('requestSchema')"
      >
        {{ t('asset.apiRequestSchema') }}
      </Button>
      <Button
        data-testid="api-schema-view-response"
        :type="context.apiSchemaView === 'responseSchema' ? 'primary' : 'default'"
        @click="context.onApiSchemaViewChange('responseSchema')"
      >
        {{ t('asset.apiResponseSchema') }}
      </Button>
    </div>
    <Empty
      v-if="!context.apiSchemaRows.length"
      data-testid="asset-api-schema-empty"
      :description="t('asset.schemaEmpty')"
    />
    <SmTable
      v-else
      row-key="key"
      test-id="asset-api-schema-table"
      :columns="context.schemaColumns"
      :data-source="context.apiSchemaRows"
      :expandable="context.schemaExpandable"
      :pagination="false"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          {{ columnDisplayLabel(record as SchemaRow) }}
        </template>
        <template v-else-if="column.key === 'dataType'">
          {{ (record as SchemaRow).dataType }}
        </template>
        <template v-else-if="column.key === 'description'">
          <span
            v-if="canEditSchemaDescription"
            data-testid="schema-description-edit"
            style="cursor: pointer"
            @click="editDescriptionRow = record as SchemaRow"
          >
            {{ (record as SchemaRow).description || '—' }}
          </span>
          <span v-else>{{ (record as SchemaRow).description || '—' }}</span>
        </template>
        <template v-else-if="column.key === 'tags'">
          <SchemaTagCell
            :row="(record as SchemaRow)"
            source="Classification"
            :options="context.schemaTagOptions"
            :editable="context.schemaTagAccess.canEditTags && !context.schemaTagAccess.readOnly"
            :on-change="(fqns) => context.onSchemaTagChange(record as SchemaRow, 'Classification', fqns)"
          />
        </template>
        <template v-else-if="column.key === 'glossaryTerms'">
          <SchemaTagCell
            :row="(record as SchemaRow)"
            source="Glossary"
            :options="context.schemaTagOptions"
            :editable="context.schemaTagAccess.canEditGlossaryTerms && !context.schemaTagAccess.readOnly"
            :on-change="(fqns) => context.onSchemaTagChange(record as SchemaRow, 'Glossary', fqns)"
          />
        </template>
        <template v-else>
          {{ (record as SchemaRow).description }}
        </template>
      </template>
    </SmTable>
    <template v-if="context.asset.apiRequestSchema">
      <Typography.Title :level="5">{{ t('asset.apiRequestSchema') }}</Typography.Title>
      <pre data-testid="asset-api-request-schema" class="detail__code">{{ context.apiEndpointSchemaJson(context.asset.apiRequestSchema) }}</pre>
    </template>
    <template v-if="context.asset.apiResponseSchema">
      <Typography.Title :level="5">{{ t('asset.apiResponseSchema') }}</Typography.Title>
      <pre data-testid="asset-api-response-schema" class="detail__code">{{ context.apiEndpointSchemaJson(context.asset.apiResponseSchema) }}</pre>
    </template>
  </template>
  <template v-else-if="piece === 'databaseSchemas'">
    <Typography.Title :level="5">{{ t('asset.schemasTitle') }}</Typography.Title>
    <div style="display: flex; gap: 8px; margin-bottom: 12px">
      <Input
        :value="context.databaseSchemaSearch"
        data-testid="database-schema-search-input"
        :placeholder="t('asset.columns.findInTable')"
        allow-clear
        @change="(event: Event) => context.onDatabaseSchemaSearchChange((event.target as HTMLInputElement).value)"
      >
        <template #prefix><SearchOutlined /></template>
      </Input>
      <span style="display: flex; align-items: center; gap: 6px; white-space: nowrap">
        <Switch
          :checked="context.databaseSchemaShowDeleted"
          data-testid="database-schema-show-deleted"
          @change="(checked: boolean | string | number) => context.onDatabaseSchemaShowDeletedChange(checked === true)"
        />
        {{ t('label.show-deleted') }}
      </span>
    </div>
    <Alert
      v-if="context.databaseSchemaError"
      type="error"
      :message="context.databaseSchemaError"
      show-icon
      style="margin-bottom: 12px"
    />
    <Empty
      v-else-if="!context.databaseSchemas.length && !context.databaseSchemaLoading"
      data-testid="asset-database-schemas-empty"
      :description="t('asset.schemaEmpty')"
    />
    <SmTable
      v-else
      row-key="id"
      test-id="asset-database-schemas-table"
      :columns="databaseSchemaColumns"
      :data-source="context.databaseSchemas"
      :loading="context.databaseSchemaLoading"
      :pagination="false"
      size="small"
      :custom-row="(row: DatabaseSchemaRow) => ({ onClick: () => openDatabaseSchema(row) })"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          {{ (record as DatabaseSchemaRow).displayName || (record as DatabaseSchemaRow).name }}
          <Button
            v-if="canEditSchemaDisplayName"
            type="text"
            size="small"
            data-testid="database-schema-display-name-edit"
            :title="t('label.edit-entity', { entity: t('label.database-schema') })"
            @click.stop="editDatabaseSchemaRow = record as DatabaseSchemaRow"
          >
            <template #icon><EditOutlined /></template>
          </Button>
        </template>
        <template v-else-if="column.key === 'description'">
          {{ (record as DatabaseSchemaRow).description || '—' }}
        </template>
        <template v-else-if="column.key === 'tags'">
          <Space wrap>
            <Tag v-for="tag in (record as DatabaseSchemaRow).tags ?? []" :key="tag.tagFQN">
              {{ tag.name }}
            </Tag>
            <Typography.Text v-if="!(record as DatabaseSchemaRow).tags?.length" type="secondary">—</Typography.Text>
          </Space>
        </template>
        <template v-else-if="column.key === 'usage'">
          {{ (record as DatabaseSchemaRow).usagePercentile === undefined ? '—' : `${(record as DatabaseSchemaRow).usagePercentile}%` }}
        </template>
      </template>
    </SmTable>
    <div v-if="context.databaseSchemaHasNext || context.databaseSchemaHasPrev" style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px">
      <Button
        data-testid="database-schema-prev-page"
        :disabled="!context.databaseSchemaHasPrev"
        @click="context.onDatabaseSchemaPrevPage()"
      >
        {{ t('label.previous') }}
      </Button>
      <Button
        data-testid="database-schema-next-page"
        :disabled="!context.databaseSchemaHasNext"
        @click="context.onDatabaseSchemaNextPage()"
      >
        {{ t('label.next') }}
      </Button>
    </div>
    <ColumnDisplayNameModal
      :open="editDatabaseSchemaRow !== null"
      :name="editDatabaseSchemaRow?.name ?? ''"
      :display-name="editDatabaseSchemaRow?.displayName"
      :show-constraint="false"
      :on-save="(data) => saveDatabaseSchemaDisplayName(data.displayName ?? '')"
      :on-cancel="() => { editDatabaseSchemaRow = null; }"
    />
  </template>
  <template v-else-if="piece === 'metricExpression'">
    <template v-if="showMetricExpression">
      <Typography.Title :level="5">{{ t('asset.metricExpressionTitle') }}</Typography.Title>
      <pre data-testid="asset-metric-expression" class="detail__code">{{
        [context.asset.storedProcedureCode?.language, context.asset.storedProcedureCode?.code].filter(Boolean).join('\n\n')
      }}</pre>
    </template>
  </template>
  <template v-else-if="piece === 'customProperties'">
    <WidgetCustomPropertiesCell
      :defs="context.customProperties"
      :values="context.asset.extension ?? {}"
      :error="context.customPropsError"
      :entity-type="context.entityType"
      :can-view="context.customPropsCanView"
      :widget-settings="getCustomPropertiesWidgetSettings(widget?.config)"
      :can-edit="context.customPropsCanEdit"
      :on-property-save="context.onCustomPropertySave"
    />
  </template>
  <template v-else-if="piece === 'description'">
    <div data-testid="asset-widget-description">
      <Typography.Text type="secondary">{{ t('asset.fields.description') }}</Typography.Text>
      <EntityDescriptionCell
        :description="context.asset.description"
        :entity-name="context.asset.displayName || context.asset.name"
        :has-edit-access="context.descriptionAccess"
        :expanded="context.descriptionExpanded"
        :remove-blur="isLargeWidget(widget)"
        :on-description-update="context.onDescriptionUpdate"
      />
    </div>
  </template>
  <template v-else-if="piece === 'tags'">
    <div data-testid="asset-widget-tags">
      <Typography.Text type="secondary">{{ t('asset.fields.tags') }}</Typography.Text>
      <WidgetTagsCell
        tag-type="Classification"
        :tags="context.asset.tags"
        :options="context.catalogTags"
        :has-edit-access="context.tagsAccess"
        :on-tags-change="context.onTagsChange"
      />
    </div>
  </template>
  <template v-else-if="piece === 'glossaryTerms'">
    <div data-testid="asset-widget-glossary-terms">
      <Typography.Text type="secondary">{{ t('asset.tabs.glossaryTerms') }}</Typography.Text>
      <WidgetTagsCell
        tag-type="Glossary"
        :tags="context.asset.tags"
        :options="context.catalogTags"
        :has-edit-access="context.glossaryTermsAccess"
        :on-tags-change="context.onTagsChange"
      />
    </div>
  </template>
  <template v-else-if="piece === 'owners'">
    <div data-testid="asset-widget-owners">
      <Typography.Text type="secondary">{{ t('asset.fields.owners') }}</Typography.Text>
      <WidgetOwnersCell
        :owners="context.asset.owners"
        :options="context.catalogOwners"
        :has-edit-access="context.ownersAccess"
        :on-change="context.onOwnersChange"
      />
    </div>
  </template>
  <template v-else-if="piece === 'domains'">
    <div data-testid="asset-widget-domains">
      <Typography.Text type="secondary">{{ t('asset.fields.domains') }}</Typography.Text>
      <WidgetDomainCell
        :domains="context.asset.domains"
        :options="context.catalogDomains"
        :has-edit-access="context.domainsAccess"
        :on-change="context.onDomainsChange"
      />
    </div>
  </template>
  <template v-else-if="piece === 'dataProducts'">
    <div data-testid="asset-widget-data-products">
      <Typography.Text type="secondary">{{ t('label.data-product-plural') }}</Typography.Text>
      <WidgetDataProductsCell
        :data-products="context.asset.dataProducts ?? []"
        :domains="context.asset.domains"
        :has-edit-access="context.dataProductsAccess"
        :on-save="context.onDataProductsChange"
      />
    </div>
  </template>
  <template v-else-if="piece === 'knowledgePages' && context.asset.id">
    <div data-testid="asset-widget-knowledge-pages">
      <WidgetKnowledgePagesCell :entity-id="context.asset.id" :entity-type="context.entityType" />
    </div>
  </template>
  <template v-else-if="piece === 'frequentlyJoined'">
    <FrequentlyJoinedTables :joins="context.asset.joins" />
  </template>
  <template v-else-if="piece === 'partitionedKeys'">
    <div data-testid="asset-widget-partitioned-keys">
      <Typography.Text type="secondary">{{ t('asset.partitionedKeys') }}</Typography.Text>
      <WidgetPartitionedKeysCell :columns="context.asset.tablePartition?.columns" />
    </div>
  </template>
  <template v-else-if="piece === 'tableConstraints'">
    <div data-testid="asset-widget-table-constraints">
      <Typography.Text type="secondary">{{ t('asset.tableConstraints') }}</Typography.Text>
      <WidgetTableConstraintsCell
        :constraints="context.asset.tableConstraints"
        :column-names="tableColumnNames"
        :has-edit-access="context.tableConstraintsAccess"
        :on-save="context.onTableConstraintsUpdate"
        :on-referred-table-click="context.onReferredTableClick ?? context.onTableFqnClick"
      />
    </div>
  </template>
  <template v-else-if="piece === 'tableAliases'">
    <div data-testid="asset-widget-table-aliases">
      <Typography.Text type="secondary">{{ t('asset.tableAliases') }}</Typography.Text>
      <WidgetTableAliasesCell :aliases="context.asset.aliases" />
    </div>
  </template>
  <!-- D-2 batch 3: shared column modals at piece root so the schema,
       features and API-schema tables all edit through the same state. -->
  <ColumnDescriptionModal
    :open="editDescriptionRow !== null"
    :column-name="editDescriptionRow?.name ?? ''"
    :entity-label="context.entityType === 'table' || context.entityType === 'dashboardDataModel' ? 'column' : 'field'"
    :initial-value="editDescriptionRow?.description"
    :on-save="saveDescriptionRow"
    :on-cancel="() => { editDescriptionRow = null; }"
  />
  <ColumnDisplayNameModal
    :open="editDisplayNameRow !== null"
    :name="editDisplayNameRow?.name ?? ''"
    :display-name="editDisplayNameRow?.displayName"
    :show-constraint="context.entityType === 'table'"
    :constraint="editDisplayNameRow?.constraint"
    :on-save="saveDisplayNameRow"
    :on-cancel="() => { editDisplayNameRow = null; }"
  />
</template>

<style scoped>
.detail__schema-title {
  margin-top: 24px;
}
.detail__code {
  margin: 0;
  padding: 12px;
  font-size: 12px;
  white-space: pre-wrap;
  background: var(--sm-bg-elevated);
  border-radius: 6px;
}
</style>
