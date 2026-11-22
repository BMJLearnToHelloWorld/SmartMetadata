<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Descriptions, Empty, Space, Table, Tag, Typography } from 'ant-design-vue';
import { StarOutlined } from '@ant-design/icons-vue';
import EntityDescriptionCell from '@/components/shared/EntityDescriptionCell.vue';
import type { AssetDetail, TagRef } from '@/types/api';

const props = withDefaults(
  defineProps<{
    asset: AssetDetail;
    entityType: string;
    /** D-3: derived canEditDescription; without onDescriptionUpdate the cell is preview-only. */
    descriptionAccess?: boolean;
    /** D-3: official isDescriptionExpandedFor for this entity type. */
    descriptionExpanded?: boolean;
    onDescriptionUpdate?: (description: string) => Promise<unknown> | unknown;
  }>(),
  { descriptionAccess: false, descriptionExpanded: false },
);

const { t } = useI18n();

/**
 * Pin TagsViewer gate, fork form: only Generated labels get the distinct
 * chip, and only here (the TagsContainerV2 equivalent — this surface always
 * carries entity context, so the pin's entityFqn guard is structural). Every
 * other labelType renders as a plain chip, as the pin does.
 */
function isGeneratedTag(tag: TagRef): boolean {
  return tag.labelType === 'Generated';
}

const refColumns = computed(() => [
  { title: t('asset.columns.name'), dataIndex: 'name', key: 'name' },
  { title: t('asset.columns.type'), dataIndex: 'type', key: 'type', width: 160 },
  { title: t('asset.columns.fqn'), dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
]);

/**
 * D-1 GlossaryTerms split (official TagsWidget / GlossaryWidget share
 * TagsContainerV2 and split `tags` via useTierSplit): the tags row
 * carries Classification labels only, glossary-sourced labels get
 * their own row. Same predicate as AssetDetailPiece's glossaryTerms
 * piece, so the default panel and the widget cell agree.
 */
const classificationTags = computed(() =>
  props.asset.tags.filter((tag) => tag.source !== 'Glossary'),
);
const glossaryTags = computed(() =>
  props.asset.tags.filter((tag) => tag.source === 'Glossary'),
);

const showRelated = computed(
  () => props.entityType === 'chart' || props.entityType === 'database' || props.entityType === 'databaseSchema',
);
</script>

<template>
  <div>
    <Descriptions bordered :column="1" size="small">
      <Descriptions.Item :label="t('asset.fields.name')">{{ asset.name }}</Descriptions.Item>
      <Descriptions.Item :label="t('asset.fields.type')">{{ asset.entityType }}</Descriptions.Item>
      <Descriptions.Item v-if="asset.tableType" :label="t('asset.fields.tableType')">
        {{ asset.tableType }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.serviceType" :label="t('asset.fields.serviceType')">
        {{ asset.serviceType }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.service" :label="t('asset.fields.service')">
        {{ asset.service.displayName || asset.service.name }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.database" :label="t('asset.fields.database')">
        {{ asset.database.displayName || asset.database.name }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.databaseSchema" :label="t('asset.fields.schema')">
        {{ asset.databaseSchema.displayName || asset.databaseSchema.name }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.partitions !== undefined" :label="t('asset.fields.partitions')">
        {{ asset.partitions }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.project" :label="t('asset.fields.project')">
        {{ asset.project }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.dashboardType" :label="t('asset.fields.dashboardType')">
        {{ asset.dashboardType }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.chartType" :label="t('asset.fields.chartType')">
        {{ asset.chartType }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.metricType" :label="t('asset.fields.metricType')">
        {{ asset.metricType }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.unitOfMeasurement" :label="t('asset.fields.unitOfMeasurement')">
        {{ asset.unitOfMeasurement }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.granularity" :label="t('asset.fields.granularity')">
        {{ asset.granularity }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.dataModelType" :label="t('asset.fields.dataModelType')">
        {{ asset.dataModelType }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.scheduleInterval" :label="t('asset.fields.scheduleInterval')">
        {{ asset.scheduleInterval }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.pipelineState" :label="t('asset.fields.pipelineState')">
        {{ asset.pipelineState }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.algorithm" :label="t('asset.fields.algorithm')">
        {{ asset.algorithm }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.target" :label="t('asset.fields.target')">
        {{ asset.target }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.prefix" :label="t('asset.fields.prefix')">
        {{ asset.prefix }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.fileFormats?.length" :label="t('asset.fields.fileFormats')">
        {{ asset.fileFormats.join(', ') }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.indexType" :label="t('asset.fields.indexType')">
        {{ asset.indexType }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.storedProcedureType" :label="t('asset.fields.storedProcedureType')">
        {{ asset.storedProcedureType }}
      </Descriptions.Item>
      <Descriptions.Item v-if="asset.sourceUrl" :label="t('asset.fields.sourceUrl')">
        <a :href="asset.sourceUrl" target="_blank" rel="noreferrer">{{ asset.sourceUrl }}</a>
      </Descriptions.Item>
      <Descriptions.Item :label="t('asset.fields.fqn')">{{ asset.fullyQualifiedName }}</Descriptions.Item>
      <Descriptions.Item :label="t('asset.fields.description')">
        <EntityDescriptionCell
          :description="asset.description"
          :entity-name="asset.displayName || asset.name"
          :has-edit-access="descriptionAccess"
          :expanded="descriptionExpanded"
          :on-description-update="onDescriptionUpdate"
        />
      </Descriptions.Item>
      <Descriptions.Item :label="t('asset.fields.owners')">
        <Space wrap>
          <span v-for="owner in asset.owners" :key="owner.id || owner.name">
            {{ owner.displayName || owner.name }}
          </span>
          <Typography.Text v-if="!asset.owners.length" type="secondary">—</Typography.Text>
        </Space>
      </Descriptions.Item>
      <Descriptions.Item :label="t('asset.fields.tags')">
        <Space wrap>
          <Tag
            v-for="tag in classificationTags"
            :key="tag.tagFQN"
            :class="isGeneratedTag(tag) ? 'asset-overview__generated-tag' : undefined"
          >
            <StarOutlined v-if="isGeneratedTag(tag)" class="asset-overview__generated-tag-icon" />
            {{ tag.name }}
          </Tag>
          <Typography.Text v-if="!classificationTags.length" type="secondary">—</Typography.Text>
        </Space>
      </Descriptions.Item>
      <Descriptions.Item :label="t('asset.tabs.glossaryTerms')">
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
      </Descriptions.Item>
      <Descriptions.Item :label="t('asset.fields.domains')">
        <Space wrap>
          <span v-for="domain in asset.domains" :key="domain.id || domain.name">
            {{ domain.displayName || domain.name }}
          </span>
          <Typography.Text v-if="!asset.domains.length" type="secondary">—</Typography.Text>
        </Space>
      </Descriptions.Item>
      <Descriptions.Item :label="t('asset.fields.dataProducts')">
        <Space wrap>
          <span v-for="product in asset.dataProducts ?? []" :key="product.id || product.name">
            {{ product.displayName || product.name }}
          </span>
          <Typography.Text v-if="!(asset.dataProducts ?? []).length" type="secondary">—</Typography.Text>
        </Space>
      </Descriptions.Item>
    </Descriptions>
    <template v-if="showRelated">
      <Typography.Title :level="5" class="detail__schema-title">{{ t('asset.relatedTitle') }}</Typography.Title>
      <Empty
        v-if="!asset.children?.length"
        data-testid="asset-related-empty"
        :description="t('asset.relatedEmpty')"
      />
      <Table
        v-else
        row-key="name"
        data-testid="asset-related-table"
        :columns="refColumns"
        :data-source="asset.children"
        :pagination="false"
        size="small"
      />
    </template>
  </div>
</template>

<style scoped>
.detail__schema-title {
  margin-top: 24px;
}

/* Generated-tag badge (D-F4): visual distinction only — the product primary
   tint on the same antd Tag, so shape and height match the sibling chips.
   The icon reuses the fork's Auto Classification icon role (agentsUtils). */
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
