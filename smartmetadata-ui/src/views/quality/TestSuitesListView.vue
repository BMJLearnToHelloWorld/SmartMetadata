<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Form, Input, Modal, Space, Table, Typography, message } from 'ant-design-vue';
import { createTestSuite, listTestSuites } from '@/api/testSuites';
import type { TestSuite } from '@/types/quality';

const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const suites = ref<TestSuite[]>([]);
const total = ref<number | undefined>();
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  name: '',
  displayName: '',
  description: '',
});

const columns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Type', key: 'basic', width: 110 },
  { title: 'Tests', key: 'tests', width: 90 },
  { title: 'Failed', key: 'failed', width: 90 },
  { title: 'Success', key: 'success', width: 90 },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listTestSuites({ limit: 50 });
    suites.value = page.data;
    total.value = page.total;
  } catch (error) {
    suites.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load test suites';
  } finally {
    loading.value = false;
  }
}

async function onCreate(): Promise<void> {
  creating.value = true;
  try {
    const created = await createTestSuite({
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      displayName: form.displayName.trim() || undefined,
    });
    createOpen.value = false;
    message.success(`Created logical test suite ${created.name}`);
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Create test suite failed');
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <Card>
    <Space direction="vertical" size="middle" style="width: 100%">
      <div class="dq-head">
        <div>
          <Typography.Title :level="4">Test suites</Typography.Title>
          <Typography.Paragraph type="secondary">
            GET/POST /api/v1/dataQuality/testSuites creates a <strong>logical</strong> suite
            (CreateTestSuite requires <code>name</code>). Basic/executable suites are created by
            the server when tests are attached to an asset; this UI does not invent a pipeline.
          </Typography.Paragraph>
        </div>
        <Button type="primary" data-testid="create-test-suite" @click="createOpen = true">
          Create logical suite
        </Button>
      </div>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Table
        row-key="id"
        data-testid="test-suites-table"
        :columns="columns"
        :data-source="suites"
        :loading="loading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              href="#"
              :data-testid="`test-suite-row-${(record as TestSuite).id}`"
              @click.prevent="router.push({ name: 'quality-test-suite', params: { id: (record as TestSuite).id } })"
            >
              {{ (record as TestSuite).displayName || (record as TestSuite).name }}
            </a>
          </template>
          <template v-else-if="column.key === 'basic'">
            {{ (record as TestSuite).basic ? 'basic' : 'logical' }}
          </template>
          <template v-else-if="column.key === 'tests'">
            {{ (record as TestSuite).tests.length }}
          </template>
          <template v-else-if="column.key === 'failed'">
            {{ (record as TestSuite).summary?.failed ?? '—' }}
          </template>
          <template v-else-if="column.key === 'success'">
            {{ (record as TestSuite).summary?.success ?? '—' }}
          </template>
        </template>
      </Table>
      <Typography.Text type="secondary">
        {{ suites.length }} shown<template v-if="total !== undefined"> of {{ total }}</template>
      </Typography.Text>
    </Space>
    <Modal v-model:open="createOpen" title="Create logical test suite" :confirm-loading="creating" @ok="onCreate">
      <Form layout="vertical">
        <Form.Item label="Name" required>
          <Input v-model:value="form.name" data-testid="create-test-suite-name" />
        </Form.Item>
        <Form.Item label="Description">
          <Input.TextArea v-model:value="form.description" :rows="3" />
        </Form.Item>
        <Form.Item label="Display name">
          <Input v-model:value="form.displayName" />
        </Form.Item>
      </Form>
    </Modal>
  </Card>
</template>

<style scoped>
.dq-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
</style>
