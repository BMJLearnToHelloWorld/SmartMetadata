<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Descriptions, Form, Input, Modal, Space, Spin, Table, Typography, message } from 'ant-design-vue';
import { getTestCase, updateTestCase } from '@/api/testCases';
import { listTestCaseResults } from '@/api/testCaseResults';
import { parseEntityLink } from '@/quality/entityLink';
import type { TestCase, TestCaseResult } from '@/types/quality';

const props = defineProps<{ id: string }>();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const testCase = ref<TestCase | null>(null);
const results = ref<TestCaseResult[]>([]);
const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({
  displayName: '',
  description: '',
  parameterText: '',
});

const resultColumns = [
  { title: 'Status', dataIndex: 'testCaseStatus', key: 'testCaseStatus', width: 120 },
  { title: 'Timestamp', key: 'timestamp', width: 200 },
  { title: 'Result', dataIndex: 'result', key: 'result' },
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
    const loaded = await getTestCase(props.id);
    testCase.value = loaded;
    if (loaded.fullyQualifiedName) {
      const page = await listTestCaseResults(loaded.fullyQualifiedName);
      results.value = page.data;
    } else {
      results.value = [];
    }
  } catch (error) {
    testCase.value = null;
    results.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load test case';
  } finally {
    loading.value = false;
  }
}

function openEdit(): void {
  if (!testCase.value) {
    return;
  }
  editForm.displayName = testCase.value.displayName || '';
  editForm.description = testCase.value.description || '';
  editForm.parameterText = testCase.value.parameterValues.map((item) => `${item.name}=${item.value}`).join('\n');
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!testCase.value?.entityLink || !testCase.value.testDefinition) {
    message.error('Cannot update a test case without entityLink and testDefinition');
    return;
  }
  saving.value = true;
  try {
    const parameterValues = editForm.parameterText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        const eq = line.indexOf('=');
        return eq > 0 ? [{ name: line.slice(0, eq).trim(), value: line.slice(eq + 1).trim() }] : [];
      });
    await updateTestCase({
      name: testCase.value.name,
      testDefinition: testCase.value.testDefinition.fullyQualifiedName || testCase.value.testDefinition.name,
      entityLink: testCase.value.entityLink,
      description: editForm.description.trim() || undefined,
      displayName: editForm.displayName.trim() || undefined,
      parameterValues,
    });
    editOpen.value = false;
    message.success('Test case updated');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Update failed');
  } finally {
    saving.value = false;
  }
}

function openAsset(): void {
  const parsed = testCase.value?.entityLink ? parseEntityLink(testCase.value.entityLink) : null;
  const entityType = parsed?.entityType || 'table';
  const fqn = parsed?.fqn || testCase.value?.entityFQN;
  if (!fqn) {
    return;
  }
  void router.push({ name: 'asset', params: { entityType, fqn } });
}

function openDefinition(): void {
  const id = testCase.value?.testDefinition?.id;
  if (!id) {
    return;
  }
  void router.push({ name: 'quality-test-definition', params: { id } });
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
        {{ testCase?.displayName || testCase?.name || 'Test case' }}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        GET /api/v1/dataQuality/testCases/{id} · results from
        GET /api/v1/dataQuality/testCases/testCaseResults/{fqn}
      </Typography.Paragraph>
      <Space>
        <Button data-testid="edit-test-case" :disabled="!testCase" @click="openEdit">Edit</Button>
        <Button :disabled="!testCase?.entityLink && !testCase?.entityFQN" @click="openAsset">Open asset</Button>
        <Button
          data-testid="open-test-definition"
          :disabled="!testCase?.testDefinition?.id"
          @click="openDefinition"
        >
          Open definition
        </Button>
      </Space>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" class="dq-alert" />
      <Descriptions v-if="testCase" bordered :column="1" size="small" class="dq-desc">
        <Descriptions.Item label="Name">{{ testCase.name }}</Descriptions.Item>
        <Descriptions.Item label="FQN">{{ testCase.fullyQualifiedName }}</Descriptions.Item>
        <Descriptions.Item label="Entity link">{{ testCase.entityLink || '—' }}</Descriptions.Item>
        <Descriptions.Item label="Latest status">
          {{ testCase.testCaseResult?.testCaseStatus || testCase.testCaseStatus || '—' }}
        </Descriptions.Item>
        <Descriptions.Item label="Latest result">
          {{ testCase.testCaseResult?.result || '—' }}
        </Descriptions.Item>
        <Descriptions.Item label="Description">{{ testCase.description || '—' }}</Descriptions.Item>
      </Descriptions>
      <Typography.Title :level="5" class="dq-sub">Results</Typography.Title>
      <Table
        data-testid="test-case-results-table"
        row-key="timestamp"
        size="small"
        :columns="resultColumns"
        :data-source="results"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'timestamp'">
            {{ formatTs((record as TestCaseResult).timestamp) }}
          </template>
        </template>
      </Table>
    </Card>
    <Modal v-model:open="editOpen" title="Edit test case" :confirm-loading="saving" @ok="onSave">
      <Form layout="vertical">
        <Form.Item label="Display name">
          <Input v-model:value="editForm.displayName" />
        </Form.Item>
        <Form.Item label="Description">
          <Input.TextArea v-model:value="editForm.description" :rows="3" />
        </Form.Item>
        <Form.Item label="Parameters (one name=value per line)">
          <Input.TextArea v-model:value="editForm.parameterText" :rows="3" />
        </Form.Item>
      </Form>
    </Modal>
  </Spin>
</template>

<style scoped>
.dq-alert,
.dq-desc {
  margin-top: 16px;
}
.dq-sub {
  margin-top: 24px;
}
</style>
