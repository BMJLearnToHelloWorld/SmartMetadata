<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Typography, message } from 'ant-design-vue';
import { createTestDefinition, listTestDefinitions } from '@/api/testDefinitions';
import { TEST_DEFINITION_ENTITY_TYPES, TEST_PLATFORMS, type TestDefinition } from '@/types/quality';

const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const definitions = ref<TestDefinition[]>([]);
const total = ref<number | undefined>();
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  name: '',
  displayName: '',
  description: '',
  entityType: 'TABLE',
  testPlatforms: ['OpenMetadata'] as string[],
});

const columns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Entity type', dataIndex: 'entityType', key: 'entityType', width: 130 },
  { title: 'Platforms', key: 'testPlatforms' },
  { title: 'Dimension', dataIndex: 'dataQualityDimension', key: 'dataQualityDimension', width: 140 },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listTestDefinitions({ limit: 100 });
    definitions.value = page.data;
    total.value = page.total;
  } catch (error) {
    definitions.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load test definitions';
  } finally {
    loading.value = false;
  }
}

async function onCreate(): Promise<void> {
  creating.value = true;
  try {
    const created = await createTestDefinition({
      name: form.name.trim(),
      entityType: form.entityType,
      testPlatforms: form.testPlatforms,
      description: form.description.trim() || undefined,
      displayName: form.displayName.trim() || undefined,
    });
    createOpen.value = false;
    message.success(`Created test definition ${created.name}`);
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Create test definition failed');
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
          <Typography.Title :level="4">Test definitions</Typography.Title>
          <Typography.Paragraph type="secondary">
            GET/POST /api/v1/dataQuality/testDefinitions. CreateTestDefinition requires
            <code>name</code>, <code>entityType</code>, and <code>testPlatforms</code>. Seeded
            definitions appear after server bootstrap.
          </Typography.Paragraph>
        </div>
        <Button type="primary" data-testid="create-test-definition" @click="createOpen = true">
          Create definition
        </Button>
      </div>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Table
        row-key="id"
        data-testid="test-definitions-table"
        :columns="columns"
        :data-source="definitions"
        :loading="loading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              href="#"
              :data-testid="`test-definition-row-${(record as TestDefinition).id}`"
              @click.prevent="
                router.push({ name: 'quality-test-definition', params: { id: (record as TestDefinition).id } })
              "
            >
              {{ (record as TestDefinition).displayName || (record as TestDefinition).name }}
            </a>
          </template>
          <template v-else-if="column.key === 'testPlatforms'">
            {{ (record as TestDefinition).testPlatforms.join(', ') || '—' }}
          </template>
        </template>
      </Table>
      <Typography.Text type="secondary">
        {{ definitions.length }} shown<template v-if="total !== undefined"> of {{ total }}</template>
      </Typography.Text>
    </Space>
    <Modal v-model:open="createOpen" title="Create test definition" :confirm-loading="creating" @ok="onCreate">
      <Form layout="vertical">
        <Form.Item label="Name" required>
          <Input v-model:value="form.name" data-testid="create-test-definition-name" />
        </Form.Item>
        <Form.Item label="Entity type" required>
          <Select v-model:value="form.entityType" data-testid="create-test-definition-entity-type">
            <Select.Option v-for="type in TEST_DEFINITION_ENTITY_TYPES" :key="type" :value="type">
              {{ type }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Test platforms" required>
          <Select v-model:value="form.testPlatforms" mode="multiple">
            <Select.Option v-for="platform in TEST_PLATFORMS" :key="platform" :value="platform">
              {{ platform }}
            </Select.Option>
          </Select>
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
