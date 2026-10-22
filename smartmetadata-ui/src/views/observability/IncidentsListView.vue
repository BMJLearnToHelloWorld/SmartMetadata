<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Alert, Card, Space, Table, Typography } from 'ant-design-vue';
import { listTestIncidents } from '@/api/testIncidents';
import type { TestIncident } from '@/types/quality';

const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const incidents = ref<TestIncident[]>([]);
const total = ref<number | undefined>();

const columns = [
  { title: 'Test case', key: 'testCase', ellipsis: true },
  { title: 'Status', dataIndex: 'testCaseResolutionStatusType', key: 'status', width: 120 },
  { title: 'Severity', dataIndex: 'severity', key: 'severity', width: 120 },
  { title: 'Updated', key: 'timestamp', width: 200 },
];

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
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load incidents';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <Card>
    <Space direction="vertical" size="middle" style="width: 100%">
      <div>
        <Typography.Title :level="4">Incidents</Typography.Title>
        <Typography.Paragraph type="secondary">
          GET /api/v1/dataQuality/testCases/testCaseIncidentStatus?latest=true. These records are
          the Incident Manager time series — not a separate invented incident entity.
        </Typography.Paragraph>
      </div>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Table
        row-key="id"
        data-testid="incidents-table"
        :columns="columns"
        :data-source="incidents"
        :loading="loading"
        :pagination="false"
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
                (record as TestIncident).testCaseReference?.name ||
                (record as TestIncident).id
              }}
            </a>
          </template>
          <template v-else-if="column.key === 'timestamp'">
            {{ formatTs((record as TestIncident).timestamp) }}
          </template>
        </template>
      </Table>
      <Typography.Text type="secondary">
        {{ incidents.length }} shown<template v-if="total !== undefined"> of {{ total }}</template>
      </Typography.Text>
    </Space>
  </Card>
</template>
