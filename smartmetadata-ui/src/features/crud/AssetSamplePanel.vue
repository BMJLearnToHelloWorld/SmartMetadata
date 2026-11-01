<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Alert, Table, Typography } from 'ant-design-vue';
import type { TableSampleData, TopicSampleData } from '@/types/quality';

defineProps<{
  tableSample: TableSampleData | null;
  topicSample: TopicSampleData | null;
  observabilityError: string;
  entityType: string;
}>();

const { t } = useI18n();
</script>

<template>
  <div>
    <template v-if="entityType === 'table'">
      <Typography.Title :level="5">{{ t('asset.sampleTitle') }}</Typography.Title>
      <Typography.Paragraph type="secondary">{{ t('asset.sampleLead') }}</Typography.Paragraph>
      <Alert
        v-if="observabilityError && !tableSample"
        type="warning"
        show-icon
        :message="observabilityError"
        class="detail__alert"
      />
      <Table
        v-if="tableSample"
        data-testid="asset-sample-table"
        row-key="__idx"
        :columns="(tableSample?.columns ?? []).map((name) => ({ title: name, dataIndex: name, key: name }))"
        :data-source="
          (tableSample?.rows ?? []).map((row, index) => {
            const record: Record<string, string | number> = { __idx: index };
            (tableSample?.columns ?? []).forEach((name, col) => {
              record[name] = row[col] ?? '';
            });
            return record;
          })
        "
        :pagination="false"
        size="small"
      />
    </template>
    <template v-else-if="entityType === 'topic'">
      <Typography.Title :level="5">{{ t('asset.topicSampleTitle') }}</Typography.Title>
      <Typography.Paragraph type="secondary">{{ t('asset.topicSampleLead') }}</Typography.Paragraph>
      <Alert
        v-if="observabilityError && !topicSample"
        type="warning"
        show-icon
        :message="observabilityError"
        class="detail__alert"
      />
      <Table
        v-if="topicSample"
        data-testid="asset-topic-sample-table"
        row-key="__idx"
        :columns="[{ title: t('asset.columns.message'), dataIndex: 'message', key: 'message' }]"
        :data-source="(topicSample?.messages ?? []).map((message, index) => ({ __idx: index, message }))"
        :pagination="false"
        size="small"
      />
    </template>
    <Typography.Paragraph v-else type="secondary">{{ t('asset.sampleLead') }}</Typography.Paragraph>
  </div>
</template>

<style scoped>
.detail__alert {
  margin-bottom: 16px;
}
</style>
