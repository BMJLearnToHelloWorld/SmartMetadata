<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { listTestIncidents } from '@/api/testIncidents';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { entityLabel } from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';
import type { TestIncident } from '@/types/quality';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const incidents = ref<TestIncident[]>([]);
const total = ref<number | undefined>();

const columns = computed<EntityListColumn[]>(() => [
  { title: t('observability.incidents.testCase'), key: 'testCase', ellipsis: true },
  { title: t('crud.status'), dataIndex: 'testCaseResolutionStatusType', key: 'status', width: 120 },
  { title: t('observability.incidents.severity'), dataIndex: 'severity', key: 'severity', width: 120 },
  { title: t('observability.incidents.updated'), key: 'timestamp', width: 200 },
]);

function formatTs(value?: number): string {
  if (!value) {
    return '—';
  }
  const millis = value < 1e12 ? value * 1000 : value;
  return new Date(millis).toISOString();
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listTestIncidents({ limit: 50, latest: true });
    incidents.value = page.data;
    total.value = page.total;
  } catch (error) {
    incidents.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <EntityListShell
    :title="t('observability.incidents.title')"
    :lead="t('observability.incidents.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="incidents"
    table-test-id="incidents-table"
    :total="total"
    @refresh="load"
  >
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'testCase'">
        <a
          href="#"
          :data-testid="`incident-row-${(record as TestIncident).id}`"
          @click.prevent="router.push({ name: 'observability-incident', params: { id: (record as TestIncident).id } })"
        >
          {{
            (record as TestIncident).testCaseReference?.fullyQualifiedName ||
            entityLabel((record as TestIncident).testCaseReference) ||
            (record as TestIncident).id
          }}
        </a>
      </template>
      <template v-else-if="column.key === 'timestamp'">
        {{ formatTs((record as TestIncident).timestamp) }}
      </template>
    </template>
  </EntityListShell>
</template>
