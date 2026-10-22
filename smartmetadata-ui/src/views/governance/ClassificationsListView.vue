<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Checkbox, Form, Input, Modal, Space, Table, Typography, message } from 'ant-design-vue';
import { createClassification, listClassifications } from '@/api/classifications';
import type { Classification } from '@/types/governance';

const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const classifications = ref<Classification[]>([]);
const total = ref<number | undefined>();
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  name: '',
  displayName: '',
  description: '',
  mutuallyExclusive: false,
});

const columns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Description', dataIndex: 'description', key: 'description' },
  { title: 'Tags', key: 'termCount', width: 90 },
  { title: 'Exclusive', key: 'mutuallyExclusive', width: 110 },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listClassifications({ limit: 50 });
    classifications.value = page.data;
    total.value = page.total;
  } catch (error) {
    classifications.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load classifications';
  } finally {
    loading.value = false;
  }
}

async function onCreate(): Promise<void> {
  creating.value = true;
  try {
    const created = await createClassification({
      name: form.name.trim(),
      description: form.description.trim(),
      displayName: form.displayName.trim() || undefined,
      mutuallyExclusive: form.mutuallyExclusive,
    });
    createOpen.value = false;
    message.success(`Created classification ${created.name}`);
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Create classification failed');
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
      <div class="gov-head">
        <div>
          <Typography.Title :level="4">Classifications</Typography.Title>
          <Typography.Paragraph type="secondary">
            GET/POST /api/v1/classifications. CreateClassification requires <code>name</code> and
            <code>description</code>.
          </Typography.Paragraph>
        </div>
        <Button type="primary" data-testid="create-classification" @click="createOpen = true">
          Create classification
        </Button>
      </div>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Table
        row-key="id"
        data-testid="classifications-table"
        :columns="columns"
        :data-source="classifications"
        :loading="loading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              href="#"
              :data-testid="`classification-row-${(record as Classification).id}`"
              @click.prevent="
                router.push({
                  name: 'governance-classification',
                  params: { id: (record as Classification).id },
                })
              "
            >
              {{ (record as Classification).displayName || (record as Classification).name }}
            </a>
          </template>
          <template v-else-if="column.key === 'termCount'">
            {{ (record as Classification).termCount ?? '—' }}
          </template>
          <template v-else-if="column.key === 'mutuallyExclusive'">
            {{ (record as Classification).mutuallyExclusive ? 'yes' : 'no' }}
          </template>
        </template>
      </Table>
      <Typography.Text type="secondary">
        {{ classifications.length }} shown<template v-if="total !== undefined"> of {{ total }}</template>
      </Typography.Text>
    </Space>
    <Modal v-model:open="createOpen" title="Create classification" :confirm-loading="creating" @ok="onCreate">
      <Form layout="vertical">
        <Form.Item label="Name" required>
          <Input v-model:value="form.name" data-testid="create-classification-name" />
        </Form.Item>
        <Form.Item label="Description" required>
          <Input.TextArea v-model:value="form.description" :rows="3" />
        </Form.Item>
        <Form.Item label="Display name">
          <Input v-model:value="form.displayName" />
        </Form.Item>
        <Form.Item>
          <Checkbox v-model:checked="form.mutuallyExclusive">Tags in this classification are mutually exclusive</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  </Card>
</template>

<style scoped>
.gov-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
</style>
