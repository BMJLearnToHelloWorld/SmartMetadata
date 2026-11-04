<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Input, Select, Space, Tabs, Typography } from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import { listDataAccessRequests } from '@/api/tasks';
import { DATA_ACCESS_TYPES, type CollaborationTask } from '@/types/collaboration';

const router = useRouter();
const { t } = useI18n();

const loading = ref(false);
const errorMessage = ref('');
const requests = ref<CollaborationTask[]>([]);
const total = ref<number | undefined>();
const page = ref(1);
const PAGE_SIZE = 50;

// Server statusGroup buckets (TaskResource listDataAccessRequests):
// open = awaiting review, active = full non-terminal lifecycle (an
// Approved request still awaits its grant), closed = terminal bucket.
const STATUS_GROUPS = ['open', 'active', 'closed'] as const;
const activeGroup = ref<(typeof STATUS_GROUPS)[number]>('open');
const accessType = ref<string | undefined>();
const queryText = ref('');
const dataset = ref('');

const columns = computed(() => [
  { title: t('collaboration.dataAccess.name'), key: 'name' },
  { title: t('collaboration.dataAccess.about'), key: 'about' },
  { title: t('collaboration.dataAccess.accessType'), dataIndex: ['payload', 'accessType'], key: 'accessType', width: 140 },
  { title: t('collaboration.dataAccess.requestedAccess'), dataIndex: ['payload', 'requestedAccess'], key: 'requestedAccess', width: 140 },
  { title: t('collaboration.dataAccess.status'), dataIndex: 'status', key: 'status', width: 120 },
  { title: t('collaboration.dataAccess.requestedBy'), key: 'requestedBy' },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await listDataAccessRequests({
      limit: PAGE_SIZE,
      offset: (page.value - 1) * PAGE_SIZE,
      statusGroup: activeGroup.value,
      accessType: accessType.value,
      q: queryText.value.trim() || undefined,
      dataset: dataset.value.trim() || undefined,
    });
    requests.value = result.data;
    total.value = result.total;
  } catch (error) {
    requests.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('collaboration.dataAccess.loadFailed');
  } finally {
    loading.value = false;
  }
}

function onGroupChange(key: string): void {
  activeGroup.value = key as (typeof STATUS_GROUPS)[number];
  page.value = 1;
  void load();
}

function onSearch(): void {
  page.value = 1;
  void load();
}

function onPage(delta: number): void {
  page.value = Math.max(1, page.value + delta);
  void load();
}

onMounted(() => {
  void load();
});
</script>

<template>
  <Card>
    <Space direction="vertical" size="middle" style="width: 100%">
      <div class="dar-head">
        <PageHeader :header="t('collaboration.dataAccess.title')" :sub-header="t('collaboration.dataAccess.lead')" />
        <Button type="primary" data-testid="create-data-access-request" @click="router.push({ name: 'data-access-request-new' })">
          {{ t('collaboration.dataAccess.create') }}
        </Button>
      </div>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Tabs :active-key="activeGroup" data-testid="dar-status-tabs" @change="(key) => onGroupChange(String(key))">
        <Tabs.TabPane v-for="group in STATUS_GROUPS" :key="group" :tab="t(`collaboration.dataAccess.group.${group}`)" />
      </Tabs>
      <Space wrap>
        <Select
          v-model:value="accessType"
          allow-clear
          :placeholder="t('collaboration.dataAccess.accessType')"
          data-testid="dar-access-type-filter"
          style="width: 180px"
          @change="onSearch"
        >
          <Select.Option v-for="item in DATA_ACCESS_TYPES" :key="item" :value="item">
            {{ item }}
          </Select.Option>
        </Select>
        <Input
          v-model:value="dataset"
          :placeholder="t('collaboration.dataAccess.datasetPlaceholder')"
          data-testid="dar-dataset-filter"
          style="width: 260px"
          @press-enter="onSearch"
        />
        <Input.Search
          v-model:value="queryText"
          :placeholder="t('collaboration.dataAccess.searchPlaceholder')"
          data-testid="dar-search"
          style="width: 260px"
          @search="onSearch"
        />
      </Space>
      <SmTable
        row-key="id"
        test-id="dar-table"
        :columns="columns"
        :data-source="requests"
        :loading="loading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              href="#"
              :data-testid="`dar-row-${(record as CollaborationTask).id}`"
              @click.prevent="router.push({ name: 'task', params: { id: (record as CollaborationTask).id } })"
            >
              {{
                (record as CollaborationTask).displayName ||
                (record as CollaborationTask).name ||
                (record as CollaborationTask).id
              }}
            </a>
          </template>
          <template v-else-if="column.key === 'about'">
            {{
              (record as CollaborationTask).about?.fullyQualifiedName ||
              (record as CollaborationTask).about?.name ||
              '—'
            }}
          </template>
          <template v-else-if="column.key === 'requestedBy'">
            {{
              (record as CollaborationTask).createdBy?.displayName ||
              (record as CollaborationTask).createdBy?.name ||
              '—'
            }}
          </template>
        </template>
      </SmTable>
      <Space>
        <Button data-testid="dar-prev-page" :disabled="page <= 1 || loading" @click="onPage(-1)">
          {{ t('collaboration.dataAccess.previous') }}
        </Button>
        <Typography.Text type="secondary">
          {{
            total !== undefined
              ? t('crud.shownOf', { shown: requests.length, total })
              : t('crud.shown', { shown: requests.length })
          }}
        </Typography.Text>
        <Button
          data-testid="dar-next-page"
          :disabled="loading || (total !== undefined && page * PAGE_SIZE >= total)"
          @click="onPage(1)"
        >
          {{ t('collaboration.dataAccess.next') }}
        </Button>
      </Space>
    </Space>
  </Card>
</template>

<style scoped>
.dar-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
</style>
