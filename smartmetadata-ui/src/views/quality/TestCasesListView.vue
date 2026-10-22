<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Typography, message } from 'ant-design-vue';
import { createTestCase, listTestCases } from '@/api/testCases';
import { listTestDefinitions } from '@/api/testDefinitions';
import { toEntityLink } from '@/quality/entityLink';
import type { TestCase, TestDefinition } from '@/types/quality';

const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const cases = ref<TestCase[]>([]);
const total = ref<number | undefined>();
const definitions = ref<TestDefinition[]>([]);
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  name: '',
  displayName: '',
  description: '',
  testDefinition: '',
  entityType: 'table',
  entityFqn: '',
  column: '',
  parameterText: '',
});

const columns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Asset', key: 'entityFQN' },
  { title: 'Definition', key: 'testDefinition' },
  { title: 'Latest status', key: 'status', width: 140 },
];

function parseParameterValues(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const eq = line.indexOf('=');
      if (eq <= 0) {
        return [];
      }
      return [{ name: line.slice(0, eq).trim(), value: line.slice(eq + 1).trim() }];
    });
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listTestCases({ limit: 50, includeAllTests: true });
    cases.value = page.data;
    total.value = page.total;
  } catch (error) {
    cases.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load test cases';
  } finally {
    loading.value = false;
  }
}

async function onCreate(): Promise<void> {
  creating.value = true;
  try {
    const created = await createTestCase({
      name: form.name.trim(),
      testDefinition: form.testDefinition,
      entityLink: toEntityLink(form.entityType, form.entityFqn, form.column),
      description: form.description.trim() || undefined,
      displayName: form.displayName.trim() || undefined,
      parameterValues: parseParameterValues(form.parameterText),
    });
    createOpen.value = false;
    message.success(`Created test case ${created.name}`);
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Create test case failed');
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  void load();
  void listTestDefinitions({ limit: 100 })
    .then((page) => {
      definitions.value = page.data;
    })
    .catch(() => undefined);
});
</script>

<template>
  <Card>
    <Space direction="vertical" size="middle" style="width: 100%">
      <div class="dq-head">
        <div>
          <Typography.Title :level="4">Test cases</Typography.Title>
          <Typography.Paragraph type="secondary">
            GET/POST /api/v1/dataQuality/testCases. CreateTestCase requires
            <code>name</code>, <code>testDefinition</code> FQN, and a MessageParser
            <code>entityLink</code>.
          </Typography.Paragraph>
        </div>
        <Button type="primary" data-testid="create-test-case" @click="createOpen = true">Create test case</Button>
      </div>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Table
        row-key="id"
        data-testid="test-cases-table"
        :columns="columns"
        :data-source="cases"
        :loading="loading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              href="#"
              :data-testid="`test-case-row-${(record as TestCase).id}`"
              @click.prevent="router.push({ name: 'quality-test-case', params: { id: (record as TestCase).id } })"
            >
              {{ (record as TestCase).displayName || (record as TestCase).name }}
            </a>
          </template>
          <template v-else-if="column.key === 'entityFQN'">
            {{ (record as TestCase).entityFQN || (record as TestCase).entityLink || '—' }}
          </template>
          <template v-else-if="column.key === 'testDefinition'">
            {{
              (record as TestCase).testDefinition?.fullyQualifiedName ||
              (record as TestCase).testDefinition?.name ||
              '—'
            }}
          </template>
          <template v-else-if="column.key === 'status'">
            {{
              (record as TestCase).testCaseResult?.testCaseStatus ||
              (record as TestCase).testCaseStatus ||
              '—'
            }}
          </template>
        </template>
      </Table>
      <Typography.Text type="secondary">
        {{ cases.length }} shown<template v-if="total !== undefined"> of {{ total }}</template>
      </Typography.Text>
    </Space>
    <Modal v-model:open="createOpen" title="Create test case" :confirm-loading="creating" @ok="onCreate">
      <Form layout="vertical">
        <Form.Item label="Name" required>
          <Input v-model:value="form.name" data-testid="create-test-case-name" />
        </Form.Item>
        <Form.Item label="Test definition" required>
          <Select
            v-model:value="form.testDefinition"
            show-search
            option-filter-prop="label"
            data-testid="create-test-case-definition"
          >
            <Select.Option
              v-for="definition in definitions"
              :key="definition.id"
              :value="definition.fullyQualifiedName || definition.name"
              :label="definition.displayName || definition.name"
            >
              {{ definition.displayName || definition.name }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Entity type" required>
          <Select v-model:value="form.entityType">
            <Select.Option value="table">table</Select.Option>
            <Select.Option value="topic">topic</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Entity FQN" required>
          <Input v-model:value="form.entityFqn" data-testid="create-test-case-fqn" />
        </Form.Item>
        <Form.Item label="Column (optional, column-level tests)">
          <Input v-model:value="form.column" />
        </Form.Item>
        <Form.Item label="Description">
          <Input.TextArea v-model:value="form.description" :rows="2" />
        </Form.Item>
        <Form.Item label="Parameters (one name=value per line)">
          <Input.TextArea v-model:value="form.parameterText" :rows="3" placeholder="minValue=1&#10;maxValue=100" />
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
