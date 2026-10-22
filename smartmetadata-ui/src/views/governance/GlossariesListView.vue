<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Checkbox, Form, Input, Modal, Space, Table, Typography, message } from 'ant-design-vue';
import { createGlossary, listGlossaries } from '@/api/glossaries';
import type { Glossary } from '@/types/governance';

const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const glossaries = ref<Glossary[]>([]);
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
  { title: 'Terms', key: 'termCount', width: 90 },
  { title: 'Exclusive', key: 'mutuallyExclusive', width: 110 },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listGlossaries({ limit: 50 });
    glossaries.value = page.data;
    total.value = page.total;
  } catch (error) {
    glossaries.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load glossaries';
  } finally {
    loading.value = false;
  }
}

async function onCreate(): Promise<void> {
  creating.value = true;
  try {
    const created = await createGlossary({
      name: form.name.trim(),
      description: form.description.trim(),
      displayName: form.displayName.trim() || undefined,
      mutuallyExclusive: form.mutuallyExclusive,
    });
    createOpen.value = false;
    message.success(`Created glossary ${created.name}`);
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Create glossary failed');
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
          <Typography.Title :level="4">Glossaries</Typography.Title>
          <Typography.Paragraph type="secondary">
            GET/POST /api/v1/glossaries. CreateGlossary requires <code>name</code> and
            <code>description</code>.
          </Typography.Paragraph>
        </div>
        <Button type="primary" data-testid="create-glossary" @click="createOpen = true">Create glossary</Button>
      </div>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Table
        row-key="id"
        data-testid="glossaries-table"
        :columns="columns"
        :data-source="glossaries"
        :loading="loading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              href="#"
              :data-testid="`glossary-row-${(record as Glossary).id}`"
              @click.prevent="router.push({ name: 'governance-glossary', params: { id: (record as Glossary).id } })"
            >
              {{ (record as Glossary).displayName || (record as Glossary).name }}
            </a>
          </template>
          <template v-else-if="column.key === 'termCount'">
            {{ (record as Glossary).termCount ?? '—' }}
          </template>
          <template v-else-if="column.key === 'mutuallyExclusive'">
            {{ (record as Glossary).mutuallyExclusive ? 'yes' : 'no' }}
          </template>
        </template>
      </Table>
      <Typography.Text type="secondary">
        {{ glossaries.length }} shown<template v-if="total !== undefined"> of {{ total }}</template>
      </Typography.Text>
    </Space>
    <Modal v-model:open="createOpen" title="Create glossary" :confirm-loading="creating" @ok="onCreate">
      <Form layout="vertical">
        <Form.Item label="Name" required>
          <Input v-model:value="form.name" data-testid="create-glossary-name" />
        </Form.Item>
        <Form.Item label="Description" required>
          <Input.TextArea v-model:value="form.description" data-testid="create-glossary-description" :rows="3" />
        </Form.Item>
        <Form.Item label="Display name">
          <Input v-model:value="form.displayName" />
        </Form.Item>
        <Form.Item>
          <Checkbox v-model:checked="form.mutuallyExclusive">Child terms are mutually exclusive</Checkbox>
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
