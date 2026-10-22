<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Button, Card, Descriptions, Table, Tag, Space, Typography, Alert, Spin } from 'ant-design-vue';
import { fetchAssetDetail } from '@/api/entities';
import { isDetailWired, lineageLocation } from '@/catalog/entityRoutes';
import type { AssetDetail } from '@/types/api';

const props = defineProps<{
  entityType: string;
  fqn: string;
}>();

const router = useRouter();

const loading = ref(false);
const errorMessage = ref('');
const asset = ref<AssetDetail | null>(null);

const decodedFqn = computed(() => props.fqn);

const schemaColumns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Type', dataIndex: 'dataType', key: 'dataType', width: 180 },
  { title: 'Description', dataIndex: 'description', key: 'description' },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  asset.value = null;
  if (!isDetailWired(props.entityType)) {
    errorMessage.value =
      `Phase 1 fetches full detail only for table and topic. "${props.entityType}" is not wired.`;
    loading.value = false;
    return;
  }
  try {
    asset.value = await fetchAssetDetail(props.entityType, decodedFqn.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load asset';
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.entityType, props.fqn],
  () => {
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <Spin :spinning="loading">
    <Card>
      <Typography.Title :level="4">
        {{ asset?.displayName || asset?.name || decodedFqn }}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        {{ entityType }} · {{ asset?.fullyQualifiedName || decodedFqn }}
      </Typography.Paragraph>
      <Button
        data-testid="view-lineage"
        class="detail__lineage"
        @click="router.push(lineageLocation(entityType, decodedFqn))"
      >
        View lineage
      </Button>
      <Alert v-if="errorMessage" type="warning" show-icon :message="errorMessage" class="detail__alert" />
      <template v-if="asset">
        <Descriptions bordered :column="1" size="small">
          <Descriptions.Item label="Name">{{ asset.name }}</Descriptions.Item>
          <Descriptions.Item label="Type">{{ asset.entityType }}</Descriptions.Item>
          <Descriptions.Item label="FQN">{{ asset.fullyQualifiedName }}</Descriptions.Item>
          <Descriptions.Item label="Description">{{ asset.description || '—' }}</Descriptions.Item>
          <Descriptions.Item label="Owners">
            <Space wrap>
              <span v-for="owner in asset.owners" :key="owner.name">{{ owner.displayName || owner.name }}</span>
              <Typography.Text v-if="!asset.owners.length" type="secondary">—</Typography.Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Tags">
            <Space wrap>
              <Tag v-for="tag in asset.tags" :key="tag.tagFQN">{{ tag.name }}</Tag>
              <Typography.Text v-if="!asset.tags.length" type="secondary">—</Typography.Text>
            </Space>
          </Descriptions.Item>
        </Descriptions>
        <Typography.Title :level="5" class="detail__schema-title">{{ asset.schemaLabel }}</Typography.Title>
        <Table
          row-key="name"
          :columns="schemaColumns"
          :data-source="asset.schemaRows"
          :pagination="false"
          size="small"
        />
      </template>
    </Card>
  </Spin>
</template>

<style scoped>
.detail__alert {
  margin-bottom: 16px;
}
.detail__lineage {
  margin-bottom: 16px;
}
.detail__schema-title {
  margin-top: 24px;
}
</style>
