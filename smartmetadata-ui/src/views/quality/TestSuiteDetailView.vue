<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Descriptions, Form, Input, Modal, Spin, Table, Typography, message } from 'ant-design-vue';
import { getTestSuite, updateTestSuite } from '@/api/testSuites';
import type { EntityRef } from '@/types/api';
import type { TestSuite } from '@/types/quality';

const props = defineProps<{ id: string }>();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const suite = ref<TestSuite | null>(null);
const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({
  displayName: '',
  description: '',
});

const testColumns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'FQN', dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    suite.value = await getTestSuite(props.id);
  } catch (error) {
    suite.value = null;
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load test suite';
  } finally {
    loading.value = false;
  }
}

function openEdit(): void {
  if (!suite.value) {
    return;
  }
  editForm.displayName = suite.value.displayName || '';
  editForm.description = suite.value.description || '';
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!suite.value) {
    return;
  }
  saving.value = true;
  try {
    await updateTestSuite({
      name: suite.value.name,
      description: editForm.description.trim() || undefined,
      displayName: editForm.displayName.trim() || undefined,
    });
    editOpen.value = false;
    message.success('Test suite updated');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Update failed');
  } finally {
    saving.value = false;
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
        {{ suite?.displayName || suite?.name || 'Test suite' }}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        GET/PUT /api/v1/dataQuality/testSuites
      </Typography.Paragraph>
      <Button data-testid="edit-test-suite" :disabled="!suite" @click="openEdit">Edit</Button>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" class="dq-alert" />
      <Descriptions v-if="suite" bordered :column="1" size="small" class="dq-desc">
        <Descriptions.Item label="Name">{{ suite.name }}</Descriptions.Item>
        <Descriptions.Item label="FQN">{{ suite.fullyQualifiedName }}</Descriptions.Item>
        <Descriptions.Item label="Type">{{ suite.basic ? 'basic' : 'logical' }}</Descriptions.Item>
        <Descriptions.Item label="Summary">
          success {{ suite.summary?.success ?? '—' }} · failed {{ suite.summary?.failed ?? '—' }} ·
          aborted {{ suite.summary?.aborted ?? '—' }} · queued {{ suite.summary?.queued ?? '—' }}
        </Descriptions.Item>
        <Descriptions.Item label="Description">{{ suite.description || '—' }}</Descriptions.Item>
      </Descriptions>
      <Typography.Title :level="5" class="dq-sub">Tests</Typography.Title>
      <Table
        row-key="id"
        size="small"
        :columns="testColumns"
        :data-source="suite?.tests ?? []"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              v-if="(record as EntityRef).id"
              href="#"
              @click.prevent="router.push({ name: 'quality-test-case', params: { id: (record as EntityRef).id } })"
            >
              {{ (record as EntityRef).displayName || (record as EntityRef).name }}
            </a>
            <span v-else>{{ (record as EntityRef).displayName || (record as EntityRef).name }}</span>
          </template>
        </template>
      </Table>
    </Card>
    <Modal v-model:open="editOpen" title="Edit test suite" :confirm-loading="saving" @ok="onSave">
      <Form layout="vertical">
        <Form.Item label="Display name">
          <Input v-model:value="editForm.displayName" />
        </Form.Item>
        <Form.Item label="Description">
          <Input.TextArea v-model:value="editForm.description" :rows="3" />
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
