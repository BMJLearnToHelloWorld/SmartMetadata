<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Table, Typography } from 'ant-design-vue';
import type { ActivityEvent, Conversation } from '@/types/collaboration';

const props = defineProps<{
  activity: ActivityEvent[];
  conversations: Conversation[];
  collaborationError: string;
  entityType: string;
  fqn: string;
}>();

const { t } = useI18n();

const activityColumns = computed(() => [
  { title: t('asset.columns.eventType'), dataIndex: 'eventType', key: 'eventType', width: 180 },
  { title: t('asset.columns.summary'), key: 'summary' },
]);

const conversationColumns = computed(() => [
  { title: t('asset.columns.message'), dataIndex: 'message', key: 'message' },
  { title: t('asset.columns.replies'), dataIndex: 'replyCount', key: 'replyCount', width: 90 },
]);
</script>

<template>
  <div>
    <Typography.Paragraph type="secondary">
      {{ t('asset.activityLead', { type: entityType, fqn }) }}
    </Typography.Paragraph>
    <Alert
      v-if="collaborationError"
      type="warning"
      show-icon
      :message="collaborationError"
      class="detail__alert"
    />
    <Table
      row-key="id"
      data-testid="asset-activity-table"
      :columns="activityColumns"
      :data-source="activity"
      :pagination="false"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'summary'">
          {{ (record as ActivityEvent).summary || (record as ActivityEvent).fieldName || '—' }}
        </template>
      </template>
    </Table>
    <Typography.Title :level="5" class="detail__schema-title">{{ t('asset.conversationsTitle') }}</Typography.Title>
    <Typography.Paragraph type="secondary">
      {{ t('asset.conversationsLead', { type: entityType, fqn }) }}
    </Typography.Paragraph>
    <Table
      row-key="id"
      data-testid="asset-conversations-table"
      :columns="conversationColumns"
      :data-source="conversations"
      :pagination="false"
      size="small"
    />
  </div>
</template>

<style scoped>
.detail__alert {
  margin-bottom: 16px;
}
.detail__schema-title {
  margin-top: 24px;
}
</style>
