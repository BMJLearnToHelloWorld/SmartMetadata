<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { Alert, Button, Card, Descriptions, Form, Input, Modal, Select, Space, Spin, Table, Typography, message } from 'ant-design-vue';
import { getTestDefinition, updateTestDefinition } from '@/api/testDefinitions';
import { TEST_DEFINITION_ENTITY_TYPES, TEST_PLATFORMS, type TestDefinition } from '@/types/quality';

const props = defineProps<{ id: string }>();
const loading = ref(false);
const errorMessage = ref('');
const definition = ref<TestDefinition | null>(null);
const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({
  displayName: '',
  description: '',
  entityType: 'TABLE',
  testPlatforms: ['OpenMetadata'] as string[],
});

const parameterColumns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Type', dataIndex: 'dataType', key: 'dataType' },
  { title: 'Required', key: 'required', width: 100 },
  { title: 'Description', dataIndex: 'description', key: 'description' },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    definition.value = await getTestDefinition(props.id);
  } catch (error) {
    definition.value = null;
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load test definition';
  } finally {
    loading.value = false;
  }
}

function openEdit(): void {
  if (!definition.value) {
    return;
  }
  editForm.displayName = definition.value.displayName || '';
  editForm.description = definition.value.description || '';
  editForm.entityType = definition.value.entityType || 'TABLE';
  editForm.testPlatforms = definition.value.testPlatforms.length
    ? [...definition.value.testPlatforms]
    : ['OpenMetadata'];
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!definition.value) {
    return;
  }
  saving.value = true;
  try {
    await updateTestDefinition({
      name: definition.value.name,
      entityType: editForm.entityType,
      testPlatforms: editForm.testPlatforms,
      description: editForm.description.trim() || undefined,
      displayName: editForm.displayName.trim() || undefined,
    });
    editOpen.value = false;
    message.success('Test definition updated');
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
        {{ definition?.displayName || definition?.name || 'Test definition' }}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        GET/PUT /api/v1/dataQuality/testDefinitions
      </Typography.Paragraph>
      <Button data-testid="edit-test-definition" :disabled="!definition" @click="openEdit">Edit</Button>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" class="dq-alert" />
      <Descriptions v-if="definition" bordered :column="1" size="small" class="dq-desc">
        <Descriptions.Item label="Name">{{ definition.name }}</Descriptions.Item>
        <Descriptions.Item label="FQN">{{ definition.fullyQualifiedName }}</Descriptions.Item>
        <Descriptions.Item label="Entity type">{{ definition.entityType || '—' }}</Descriptions.Item>
        <Descriptions.Item label="Platforms">{{ definition.testPlatforms.join(', ') || '—' }}</Descriptions.Item>
        <Descriptions.Item label="Dimension">{{ definition.dataQualityDimension || '—' }}</Descriptions.Item>
        <Descriptions.Item label="Provider">{{ definition.provider || '—' }}</Descriptions.Item>
        <Descriptions.Item label="Description">{{ definition.description || '—' }}</Descriptions.Item>
      </Descriptions>
      <Typography.Title v-if="definition" :level="5" class="dq-sub">Parameters</Typography.Title>
      <Table
        v-if="definition"
        row-key="name"
        size="small"
        :columns="parameterColumns"
        :data-source="definition.parameterDefinition"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'required'">
            {{ record.required ? 'yes' : 'no' }}
          </template>
        </template>
      </Table>
    </Card>
    <Modal v-model:open="editOpen" title="Edit test definition" :confirm-loading="saving" @ok="onSave">
      <Form layout="vertical">
        <Form.Item label="Display name">
          <Input v-model:value="editForm.displayName" />
        </Form.Item>
        <Form.Item label="Description">
          <Input.TextArea v-model:value="editForm.description" :rows="3" />
        </Form.Item>
        <Form.Item label="Entity type">
          <Select v-model:value="editForm.entityType">
            <Select.Option v-for="type in TEST_DEFINITION_ENTITY_TYPES" :key="type" :value="type">
              {{ type }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Test platforms">
          <Select v-model:value="editForm.testPlatforms" mode="multiple">
            <Select.Option v-for="platform in TEST_PLATFORMS" :key="platform" :value="platform">
              {{ platform }}
            </Select.Option>
          </Select>
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
