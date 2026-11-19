<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Descriptions, Empty, Space, Tag, Typography, type TableProps } from 'ant-design-vue';
import { StarOutlined } from '@ant-design/icons-vue';
import SmTable from '@/components/shared/SmTable.vue';
import PipelineTaskGraph from '@/components/pipeline/PipelineTaskGraph.vue';
import AssetCustomPropertiesPanel from '@/features/crud/AssetCustomPropertiesPanel.vue';
import AssetRelatedPanel from '@/features/crud/AssetRelatedPanel.vue';
import FrequentlyJoinedColumns from '@/features/queries/FrequentlyJoinedColumns.vue';
import FrequentlyJoinedTables from '@/features/queries/FrequentlyJoinedTables.vue';
import type { ApiEndpointRef } from '@/api/apiCollections';
import type { PipelineTaskGraphModel } from '@/pipeline/taskGraph';
import type { AssetDetail, SchemaRow, TagRef } from '@/types/api';
import type { CustomPropertyDef } from '@/types/collaboration';

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
  | 'frequentlyJoined';

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
}

const props = withDefaults(
  defineProps<{
    piece: AssetDetailPieceId | null;
    context: AssetDetailPieceContext;
    /** Schema-table joins affordances: only the `schema` pane carries them. */
    withJoins?: boolean;
  }>(),
  { withJoins: false },
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
      v-if="!context.asset.schemaRows.length"
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
      :data-source="context.asset.schemaRows"
      :expandable="context.schemaExpandable"
      :pagination="false"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          {{ (record as SchemaRow).name }}
          <FrequentlyJoinedColumns :joins="context.asset.joins" :column-name="(record as SchemaRow).name" />
        </template>
        <template v-else-if="column.key === 'dataType'">
          {{ (record as SchemaRow).dataType }}
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
      :data-source="context.asset.schemaRows"
      :expandable="context.schemaExpandable"
      :pagination="false"
      size="small"
    />
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
    />
  </template>
  <template v-else-if="piece === 'description'">
    <div data-testid="asset-widget-description">
      <Typography.Text type="secondary">{{ t('asset.fields.description') }}</Typography.Text>
      <Typography.Paragraph>{{ context.asset.description || '—' }}</Typography.Paragraph>
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
