<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Descriptions, Empty, Typography, type TableProps } from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import EntityDescriptionCell from '@/components/shared/EntityDescriptionCell.vue';
import WidgetCustomPropertiesCell from '@/components/shared/widgets/WidgetCustomPropertiesCell.vue';
import WidgetDataProductsCell from '@/components/shared/widgets/WidgetDataProductsCell.vue';
import WidgetDomainCell from '@/components/shared/widgets/WidgetDomainCell.vue';
import WidgetKnowledgePagesCell from '@/components/shared/widgets/WidgetKnowledgePagesCell.vue';
import WidgetOwnersCell from '@/components/shared/widgets/WidgetOwnersCell.vue';
import WidgetTagsCell from '@/components/shared/widgets/WidgetTagsCell.vue';
import PipelineTaskGraph from '@/components/pipeline/PipelineTaskGraph.vue';
import AssetRelatedPanel from '@/features/crud/AssetRelatedPanel.vue';
import FrequentlyJoinedColumns from '@/features/queries/FrequentlyJoinedColumns.vue';
import FrequentlyJoinedTables from '@/features/queries/FrequentlyJoinedTables.vue';
import SchemaTagCell from '@/views/SchemaTagCell.vue';
import type { TagLabelInput } from '@/governance/assetPatch';
import type { ApiEndpointRef } from '@/api/apiCollections';
import type { PipelineTaskGraphModel } from '@/pipeline/taskGraph';
import type { AssetDetail, EntityRef, SchemaRow } from '@/types/api';
import type { CustomPropertyDef } from '@/types/collaboration';
import type { AssetTagOption, Domain, TagSource } from '@/types/governance';
import type { OwnerOption } from '@/governance/catalogOptions';

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
  | 'dataProducts'
  | 'knowledgePages'
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
      :data-source="context.asset.schemaRows"
      :expandable="context.schemaExpandable"
      :pagination="false"
      size="small"
    >
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
    <WidgetCustomPropertiesCell
      :defs="context.customProperties"
      :values="context.asset.extension ?? {}"
      :error="context.customPropsError"
      :entity-type="context.entityType"
      :can-view="context.customPropsCanView"
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
