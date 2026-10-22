<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { Alert, Card, Descriptions, Spin, Table, Typography } from 'ant-design-vue';
import { getEventSubscription } from '@/api/eventSubscriptions';
import type { EventSubscription } from '@/types/quality';

const props = defineProps<{ id: string }>();
const loading = ref(false);
const errorMessage = ref('');
const alert = ref<EventSubscription | null>(null);

const destinationColumns = [
  { title: 'Category', dataIndex: 'category', key: 'category' },
  { title: 'Type', dataIndex: 'type', key: 'type' },
  { title: 'Endpoint', dataIndex: 'endpoint', key: 'endpoint' },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    alert.value = await getEventSubscription(props.id);
  } catch (error) {
    alert.value = null;
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load alert';
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.id,
  () => {
    void load();
  },
);

onMounted(() => {
  void load();
});
</script>

<template>
  <Spin :spinning="loading">
    <Card>
      <Typography.Title :level="4">
        {{ alert?.displayName || alert?.name || 'Alert' }}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        GET /api/v1/events/subscriptions/{id}
      </Typography.Paragraph>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Descriptions v-if="alert" bordered :column="1" size="small" class="dq-desc">
        <Descriptions.Item label="Name">{{ alert.name }}</Descriptions.Item>
        <Descriptions.Item label="Type">{{ alert.alertType || '—' }}</Descriptions.Item>
        <Descriptions.Item label="Enabled">{{ alert.enabled === false ? 'no' : 'yes' }}</Descriptions.Item>
        <Descriptions.Item label="Description">{{ alert.description || '—' }}</Descriptions.Item>
      </Descriptions>
      <Typography.Title v-if="alert" :level="5" class="dq-sub">Destinations</Typography.Title>
      <Table
        v-if="alert"
        row-key="type"
        size="small"
        :columns="destinationColumns"
        :data-source="alert.destinations"
        :pagination="false"
      />
    </Card>
  </Spin>
</template>

<style scoped>
.dq-desc {
  margin-top: 16px;
}
.dq-sub {
  margin-top: 24px;
}
</style>
