<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Card, Table, Typography, Alert, Tag, Space, Empty } from 'ant-design-vue';
import { searchAssets } from '@/api/search';
import { assetLocation } from '@/catalog/entityRoutes';
import type { SearchHit } from '@/types/api';

const route = useRoute();
const router = useRouter();

const loading = ref(false);
const errorMessage = ref('');
const hits = ref<SearchHit[]>([]);
const total = ref(0);

const query = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''));

const columns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Type', dataIndex: 'entityType', key: 'entityType', width: 120 },
  { title: 'Fully qualified name', dataIndex: 'fullyQualifiedName', key: 'fqn' },
  { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
  { title: 'Owners', key: 'owners' },
  { title: 'Tags', key: 'tags' },
];

async function runSearch(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await searchAssets(query.value);
    hits.value = page.hits;
    total.value = page.total;
  } catch (error) {
    hits.value = [];
    total.value = 0;
    errorMessage.value = error instanceof Error ? error.message : 'Search failed';
  } finally {
    loading.value = false;
  }
}

function openHit(hit: SearchHit): void {
  if (!hit.fullyQualifiedName || !hit.entityType) {
    return;
  }
  void router.push(assetLocation(hit.entityType, hit.fullyQualifiedName));
}

onMounted(() => {
  void runSearch();
});

watch(query, () => {
  void runSearch();
});
</script>

<template>
  <Card>
    <Typography.Title :level="4">Search</Typography.Title>
    <Typography.Paragraph type="secondary">
      GET /api/v1/search/query on the <code>dataAsset</code> alias.
      <template v-if="query"> Query: <strong>{{ query }}</strong> </template>
      <template v-else> Showing a default match-all page.</template>
    </Typography.Paragraph>
    <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" class="search__error" />
    <Table
      row-key="fullyQualifiedName"
      :columns="columns"
      :data-source="hits"
      :loading="loading"
      :pagination="false"
      :locale="{ emptyText: 'No matching assets' }"
      data-testid="search-results"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <a href="#" @click.prevent="openHit(record as SearchHit)">
            {{ (record as SearchHit).displayName || (record as SearchHit).name }}
          </a>
        </template>
        <template v-else-if="column.key === 'owners'">
          <Space wrap>
            <span v-for="owner in (record as SearchHit).owners" :key="owner.name">{{ owner.displayName || owner.name }}</span>
            <Typography.Text v-if="!(record as SearchHit).owners.length" type="secondary">—</Typography.Text>
          </Space>
        </template>
        <template v-else-if="column.key === 'tags'">
          <Space wrap>
            <Tag v-for="tag in (record as SearchHit).tags" :key="tag.tagFQN">{{ tag.name }}</Tag>
          </Space>
        </template>
      </template>
      <template #emptyText>
        <Empty description="No matching assets" />
      </template>
    </Table>
    <Typography.Text v-if="!loading && !errorMessage" type="secondary">
      {{ hits.length }} shown
      <template v-if="total"> of {{ total }}</template>
    </Typography.Text>
  </Card>
</template>

<style scoped>
.search__error {
  margin-bottom: 16px;
}
</style>
