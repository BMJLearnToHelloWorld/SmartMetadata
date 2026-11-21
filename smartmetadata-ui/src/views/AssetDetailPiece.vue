<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Descriptions, Empty, Space, Tag, Typography, type TableProps } from 'ant-design-vue';
import { StarOutlined } from '@ant-design/icons-vue';
import { splitFqn, unquoteFqnPart } from '@/catalog/fqn';
import { getTableFQNFromColumnFQN } from '@/catalog/tableJoins';
import SmTable from '@/components/shared/SmTable.vue';
import EntityDescriptionCell from '@/components/shared/EntityDescriptionCell.vue';
import PipelineTaskGraph from '@/components/pipeline/PipelineTaskGraph.vue';
import AssetCustomPropertiesPanel from '@/features/crud/AssetCustomPropertiesPanel.vue';
import AssetRelatedPanel from '@/features/crud/AssetRelatedPanel.vue';
import FrequentlyJoinedColumns from '@/features/queries/FrequentlyJoinedColumns.vue';
import FrequentlyJoinedTables from '@/features/queries/FrequentlyJoinedTables.vue';
import SchemaTagCell from '@/views/SchemaTagCell.vue';
import ColumnFilter from '@/components/ingestion/ColumnFilter.vue';
import type { SchemaTagFilterOptions } from '@/utils/schemaTagFilter';
import type { ApiEndpointRef } from '@/api/apiCollections';
import type { PipelineTaskGraphModel } from '@/pipeline/taskGraph';
import type { AssetDetail, PartitionColumnDetails, SchemaRow, TableConstraint, TableConstraintType, TagRef } from '@/types/api';
import type { CustomPropertyDef } from '@/types/collaboration';
import type { AssetTagOption, TagSource } from '@/types/governance';
import { isLargeWidget } from '@/composables/customizeWidgetLayout';
import { getCustomPropertiesWidgetSettings } from '@/views/admin/persona/editors/customPropertiesWidgetSettings';
import type { WidgetConfig } from '@/views/admin/persona/editors/customizeTypes';

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
 * included. The five governance fragments (description, tags,
 * glossary terms, owners, domains) render the same datum the
 * overview pane shows in its Descriptions rows — the product has no
 * standalone widgets for them, and the overview component is not
 * filterable, so each fragment is the one row's value with the same
 * i18n label. The glossary-terms fragment filters the tag list by
 * `source === 'Glossary'`; the tags fragment renders the full list
 * exactly as the overview row does.
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
  | 'tableAliases';

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
  apiEndpointColumns: TableProps['columns'];
  taskGraph: PipelineTaskGraphModel;
  taskGraphEmpty: boolean;
  customProperties: CustomPropertyDef[];
  customPropsError: string;
  apiEndpoints: ApiEndpointRef[];
  apiEndpointsError: string;
  apiEndpointSchemaJson: (schema: Record<string, unknown> | undefined) => string;
  onApiEndpointClick: (row: ApiEndpointRef) => void;
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
   * full, unfiltered set — the server-filtered page is a subset of it);
   * `onSchemaTableChange` is the antd table change handler the view
   * owns (server fetch for Table, local pruning for the other four
   * surfaces); `schemaRowsOverride` replaces `asset.schemaRows` as the
   * displayed rows when set. The piece never decides which rows to show.
   */
  schemaTagFilterOptions: SchemaTagFilterOptions;
  schemaRowsOverride?: SchemaRow[];
  onSchemaTableChange: TableProps['onChange'];
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

/**
 * Pin TagsViewer gate, fork form — the same predicate
 * AssetOverviewFields applies to its tag chips: only Generated
 * labels get the distinct chip.
 */
function isGeneratedTag(tag: TagRef): boolean {
  return tag.labelType === 'Generated';
}

const glossaryTags = computed(() =>
  props.context.asset.tags.filter((tag) => tag.source === 'Glossary'),
);

/** D-F2-2: the rows the table shows — the view's override (server-filtered page or locally pruned tree) when set, else the detail rows. */
const displayedSchemaRows = computed(
  () => props.context.schemaRowsOverride ?? props.context.asset.schemaRows,
);

/**
 * D-1 Table widgets (official Table SCHEMA tab right column, y=7/8/9):
 * partitioned keys (columns of `tablePartition`), table constraints,
 * and aliases (FQN list, trailing name shown). The pieces render only
 * when the view mounts them — the view gates on data presence, the
 * same rule official `filterWidgets` applies — so an empty piece here
 * renders nothing, except constraints, which keep the section title
 * with an empty state (the product default-pane convention).
 */
const partitionedRows = computed<PartitionColumnDetails[]>(
  () => props.context.asset.tablePartition?.columns ?? [],
);

const partitionedColumns = computed<TableProps['columns']>(() => [
  { title: t('asset.columns.column'), dataIndex: 'columnName', key: 'columnName' },
  { title: t('asset.columns.type'), dataIndex: 'intervalType', key: 'intervalType' },
]);

const aliasRows = computed(() =>
  (props.context.asset.aliases ?? []).map((alias) => ({
    // Official TableAliases: aliases are FQNs; the service, database
    // and schema are established by the page, so only the trailing
    // name carries new information. `splitFqn` is quote-aware like
    // official `Fqn.split`, so a dotted quoted name stays whole.
    key: alias,
    name: (() => {
      const parts = splitFqn(alias);
      return parts.length > 0 ? unquoteFqnPart(parts[parts.length - 1] as string) : alias;
    })(),
    fqn: alias,
  })),
);

const aliasColumns = computed<TableProps['columns']>(() => [
  { title: t('asset.columns.name'), dataIndex: 'name', key: 'name' },
]);

function constraintTypeLabel(type: TableConstraintType | undefined): string {
  // Literal t() calls (not a key map): the referenced-keys test only
  // resolves static calls, so a map lookup would silently skip the
  // both-catalogs check.
  switch (type) {
    case 'PRIMARY_KEY':
      return t('label.primary-key');
    case 'UNIQUE':
      return t('label.unique');
    case 'FOREIGN_KEY':
      return t('label.foreign-key');
    case 'SORT_KEY':
      return t('label.sort-key');
    case 'DIST_KEY':
      return t('label.dist-key');
    case 'CLUSTER_KEY':
      return t('label.cluster-key');
    default:
      return '';
  }
}

function constraintColumns(constraint: TableConstraint): string {
  return (constraint.columns ?? []).join(', ');
}

function onReferredColumnClick(referredColumn: string): void {
  const tableFqn = getTableFQNFromColumnFQN(referredColumn);
  if (tableFqn) {
    props.context.onTableFqnClick?.(tableFqn);
  }
}

const showMetricExpression = computed(
  () =>
    props.context.entityType === 'metric' &&
    Boolean(
      props.context.asset.storedProcedureCode?.code ||
        props.context.asset.storedProcedureCode?.language,
    ),
);
</script>

<template>
  <template v-if="piece === 'schemaTable'">
    <Typography.Title :level="5">{{ context.asset.schemaLabel }}</Typography.Title>
    <Empty
      v-if="!displayedSchemaRows.length"
      data-testid="asset-schema-empty"
      :description="t('asset.schemaEmpty')"
    />
    <!-- Two SmTable branches, not one table with a conditional bodyCell
         slot: SmTable forwards bodyCell only when the caller provides
         it, and a present-but-empty slot would blank the default
         rendering the model/fields panes rely on. -->
    <SmTable
      v-else-if="withJoins"
      row-key="key"
      test-id="asset-schema-table"
      :columns="context.schemaColumns"
      :data-source="displayedSchemaRows"
      :expandable="context.schemaExpandable"
      :pagination="false"
      :on-change="context.onSchemaTableChange"
      size="small"
    >
      <template #customFilterDropdown="{ setSelectedKeys, selectedKeys, confirm, column }">
        <ColumnFilter
          :options="column.key === 'glossaryTerms' ? context.schemaTagFilterOptions.glossary : context.schemaTagFilterOptions.classification"
          :selected-values="(selectedKeys as string[])"
          :confirm="confirm"
          @change="setSelectedKeys($event)"
        />
      </template>
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          {{ (record as SchemaRow).name }}
          <FrequentlyJoinedColumns :joins="context.asset.joins" :column-name="(record as SchemaRow).name" />
        </template>
        <template v-else-if="column.key === 'dataType'">
          {{ (record as SchemaRow).dataType }}
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
    <SmTable
      v-else
      row-key="key"
      test-id="asset-schema-table"
      :columns="context.schemaColumns"
      :data-source="displayedSchemaRows"
      :expandable="context.schemaExpandable"
      :pagination="false"
      :on-change="context.onSchemaTableChange"
      size="small"
    >
      <template #customFilterDropdown="{ setSelectedKeys, selectedKeys, confirm, column }">
        <ColumnFilter
          :options="column.key === 'glossaryTerms' ? context.schemaTagFilterOptions.glossary : context.schemaTagFilterOptions.classification"
          :selected-values="(selectedKeys as string[])"
          :confirm="confirm"
          @change="setSelectedKeys($event)"
        />
      </template>
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          {{ (record as SchemaRow).name }}
        </template>
        <template v-else-if="column.key === 'dataType'">
          {{ (record as SchemaRow).dataType }}
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
    <FrequentlyJoinedTables v-if="withJoins && context.entityType === 'table'" :joins="context.asset.joins" />
  </template>
  <template v-else-if="piece === 'related'">
    <AssetRelatedPanel :asset="context.asset" />
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
      />
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
      <SmTable
        row-key="name"
        test-id="asset-charts-table"
        :columns="context.refColumns"
        :data-source="context.asset.charts ?? []"
        :pagination="false"
        size="small"
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
    <Alert v-if="context.apiEndpointsError" type="error" :message="context.apiEndpointsError" show-icon />
    <Empty
      v-else-if="!context.apiEndpoints.length"
      data-testid="asset-api-endpoints-empty"
      :description="t('asset.apiEndpointsEmpty')"
    />
    <SmTable
      v-else
      row-key="name"
      test-id="asset-api-endpoints-table"
      :columns="context.apiEndpointColumns"
      :data-source="context.apiEndpoints"
      :pagination="false"
      size="small"
      :custom-row="(row: ApiEndpointRef) => ({ onClick: () => context.onApiEndpointClick(row) })"
    />
  </template>
  <template v-else-if="piece === 'apiSchema'">
    <Descriptions bordered size="small" :column="1">
      <Descriptions.Item :label="t('asset.apiEndpointUrl')">{{ context.asset.apiEndpointUrl || '—' }}</Descriptions.Item>
      <Descriptions.Item :label="t('asset.apiRequestMethod')">{{ context.asset.apiRequestMethod || '—' }}</Descriptions.Item>
    </Descriptions>
    <template v-if="context.asset.apiRequestSchema">
      <Typography.Title :level="5">{{ t('asset.apiRequestSchema') }}</Typography.Title>
      <pre data-testid="asset-api-request-schema" class="detail__code">{{ context.apiEndpointSchemaJson(context.asset.apiRequestSchema) }}</pre>
    </template>
    <template v-if="context.asset.apiResponseSchema">
      <Typography.Title :level="5">{{ t('asset.apiResponseSchema') }}</Typography.Title>
      <pre data-testid="asset-api-response-schema" class="detail__code">{{ context.apiEndpointSchemaJson(context.asset.apiResponseSchema) }}</pre>
    </template>
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
    <AssetCustomPropertiesPanel
      :defs="context.customProperties"
      :values="context.asset.extension ?? {}"
      :error="context.customPropsError"
      :entity-type="context.entityType"
      :can-view="context.customPropsCanView"
      :widget-settings="getCustomPropertiesWidgetSettings(widget?.config)"
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
      <Space wrap>
        <Tag
          v-for="tag in context.asset.tags"
          :key="tag.tagFQN"
          :class="isGeneratedTag(tag) ? 'asset-overview__generated-tag' : undefined"
        >
          <StarOutlined v-if="isGeneratedTag(tag)" class="asset-overview__generated-tag-icon" />
          {{ tag.name }}
        </Tag>
        <Typography.Text v-if="!context.asset.tags.length" type="secondary">—</Typography.Text>
      </Space>
    </div>
  </template>
  <template v-else-if="piece === 'glossaryTerms'">
    <div data-testid="asset-widget-glossary-terms">
      <Typography.Text type="secondary">{{ t('asset.tabs.glossaryTerms') }}</Typography.Text>
      <Space wrap>
        <Tag
          v-for="tag in glossaryTags"
          :key="tag.tagFQN"
          :class="isGeneratedTag(tag) ? 'asset-overview__generated-tag' : undefined"
        >
          <StarOutlined v-if="isGeneratedTag(tag)" class="asset-overview__generated-tag-icon" />
          {{ tag.name }}
        </Tag>
        <Typography.Text v-if="!glossaryTags.length" type="secondary">—</Typography.Text>
      </Space>
    </div>
  </template>
  <template v-else-if="piece === 'owners'">
    <div data-testid="asset-widget-owners">
      <Typography.Text type="secondary">{{ t('asset.fields.owners') }}</Typography.Text>
      <Space wrap>
        <span v-for="owner in context.asset.owners" :key="owner.id || owner.name">
          {{ owner.displayName || owner.name }}
        </span>
        <Typography.Text v-if="!context.asset.owners.length" type="secondary">—</Typography.Text>
      </Space>
    </div>
  </template>
  <template v-else-if="piece === 'domains'">
    <div data-testid="asset-widget-domains">
      <Typography.Text type="secondary">{{ t('asset.fields.domains') }}</Typography.Text>
      <Space wrap>
        <span v-for="domain in context.asset.domains" :key="domain.id || domain.name">
          {{ domain.displayName || domain.name }}
        </span>
        <Typography.Text v-if="!context.asset.domains.length" type="secondary">—</Typography.Text>
      </Space>
    </div>
  </template>
  <template v-else-if="piece === 'frequentlyJoined'">
    <FrequentlyJoinedTables :joins="context.asset.joins" />
  </template>
  <template v-else-if="piece === 'partitionedKeys'">
    <Typography.Title :level="5">{{ t('label.table-partition-plural') }}</Typography.Title>
    <SmTable
      row-key="columnName"
      test-id="asset-partitioned-keys-table"
      :columns="partitionedColumns"
      :data-source="partitionedRows"
      :pagination="false"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'intervalType'">
          {{ (record as PartitionColumnDetails).intervalType || '--' }}
        </template>
      </template>
    </SmTable>
  </template>
  <template v-else-if="piece === 'tableConstraints'">
    <Typography.Title :level="5">{{ t('label.table-constraints') }}</Typography.Title>
    <Empty
      v-if="!context.asset.tableConstraints?.length"
      data-testid="asset-table-constraints-empty"
      :description="t('asset.constraintsEmpty')"
    />
    <Space v-else direction="vertical" style="width: 100%">
      <div
        v-for="(constraint, index) in context.asset.tableConstraints"
        :key="`${constraint.constraintType ?? 'unknown'}-${index}`"
        :data-testid="`${constraint.constraintType ?? 'unknown'}-container`"
      >
        <Typography.Text strong>{{ constraintTypeLabel(constraint.constraintType) }}</Typography.Text>
        <Typography.Paragraph v-if="constraintColumns(constraint)" style="margin-bottom: 0">
          {{ constraintColumns(constraint) }}
        </Typography.Paragraph>
        <template v-if="constraint.constraintType === 'FOREIGN_KEY' && constraint.referredColumns?.length">
          <div
            v-for="referred in constraint.referredColumns"
            :key="referred"
          >
            <a
              v-if="context.onTableFqnClick"
              href="#"
              :title="referred"
              @click.prevent="onReferredColumnClick(referred)"
            >
              {{ referred }}
            </a>
            <Typography.Text v-else :title="referred">{{ referred }}</Typography.Text>
          </div>
        </template>
      </div>
    </Space>
  </template>
  <template v-else-if="piece === 'tableAliases'">
    <Typography.Title :level="5">{{ t('label.alias-plural') }}</Typography.Title>
    <SmTable
      row-key="key"
      test-id="asset-table-aliases-table"
      :columns="aliasColumns"
      :data-source="aliasRows"
      :pagination="false"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <span :title="(record as { fqn: string }).fqn">{{ (record as { name: string }).name }}</span>
        </template>
      </template>
    </SmTable>
  </template>
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

/* Generated-tag badge (D-F4), same rules as AssetOverviewFields: visual
   distinction only — the product primary tint on the same antd Tag. */
.asset-overview__generated-tag.ant-tag {
  color: var(--sm-color-primary);
  background: var(--sm-color-primary-bg);
  border-color: var(--sm-color-primary-50);
}

.asset-overview__generated-tag-icon {
  font-size: 12px;
  margin-inline-end: 4px;
}
</style>
