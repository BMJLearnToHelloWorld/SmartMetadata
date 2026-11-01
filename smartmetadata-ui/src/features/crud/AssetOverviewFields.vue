<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Descriptions, Empty, Space, Table, Tag, Typography } from 'ant-design-vue';
import type { AssetDetail } from '@/types/api';

const props = defineProps<{
  asset: AssetDetail;
  entityType: string;
}>();

const { t } = useI18n();

const refColumns = computed(() => [
  { title: t('asset.columns.name'), dataIndex: 'name', key: 'name' },
  { title: t('asset.columns.type'), dataIndex: 'type', key: 'type', width: 160 },
  { title: t('asset.columns.fqn'), dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
]);

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
      <Descriptions.Item :label="t('asset.fields.description')">{{ asset.description || '—' }}</Descriptions.Item>
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
          <Tag v-for="tag in asset.tags" :key="tag.tagFQN">{{ tag.name }}</Tag>
          <Typography.Text v-if="!asset.tags.length" type="secondary">—</Typography.Text>
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
</style>
