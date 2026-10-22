<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Typography, message } from 'ant-design-vue';
import { createDomain, listDomains } from '@/api/domains';
import { DOMAIN_TYPES, type Domain } from '@/types/governance';

const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const domains = ref<Domain[]>([]);
const total = ref<number | undefined>();
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  name: '',
  displayName: '',
  description: '',
  domainType: 'Source-aligned',
  parent: undefined as string | undefined,
});

const columns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Type', dataIndex: 'domainType', key: 'domainType', width: 180 },
  { title: 'Description', dataIndex: 'description', key: 'description' },
  { title: 'Parent', key: 'parent' },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listDomains({ limit: 50 });
    domains.value = page.data;
    total.value = page.total;
  } catch (error) {
    domains.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load domains';
  } finally {
    loading.value = false;
  }
}

async function onCreate(): Promise<void> {
  creating.value = true;
  try {
    const created = await createDomain({
      name: form.name.trim(),
      description: form.description.trim(),
      domainType: form.domainType,
      displayName: form.displayName.trim() || undefined,
      parent: form.parent,
    });
    createOpen.value = false;
    message.success(`Created domain ${created.name}`);
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Create domain failed');
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
          <Typography.Title :level="4">Domains</Typography.Title>
          <Typography.Paragraph type="secondary">
            GET/POST /api/v1/domains. CreateDomain requires <code>name</code>, <code>description</code>,
            and <code>domainType</code>.
          </Typography.Paragraph>
        </div>
        <Button type="primary" data-testid="create-domain" @click="createOpen = true">Create domain</Button>
      </div>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Table
        row-key="id"
        data-testid="domains-table"
        :columns="columns"
        :data-source="domains"
        :loading="loading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              href="#"
              :data-testid="`domain-row-${(record as Domain).id}`"
              @click.prevent="router.push({ name: 'governance-domain', params: { id: (record as Domain).id } })"
            >
              {{ (record as Domain).displayName || (record as Domain).name }}
            </a>
          </template>
          <template v-else-if="column.key === 'parent'">
            {{ (record as Domain).parent?.name || '—' }}
          </template>
        </template>
      </Table>
      <Typography.Text type="secondary">
        {{ domains.length }} shown<template v-if="total !== undefined"> of {{ total }}</template>
      </Typography.Text>
    </Space>
    <Modal v-model:open="createOpen" title="Create domain" :confirm-loading="creating" @ok="onCreate">
      <Form layout="vertical">
        <Form.Item label="Name" required>
          <Input v-model:value="form.name" data-testid="create-domain-name" />
        </Form.Item>
        <Form.Item label="Description" required>
          <Input.TextArea v-model:value="form.description" :rows="3" />
        </Form.Item>
        <Form.Item label="Domain type" required>
          <Select v-model:value="form.domainType">
            <Select.Option v-for="type in DOMAIN_TYPES" :key="type" :value="type">{{ type }}</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Display name">
          <Input v-model:value="form.displayName" />
        </Form.Item>
        <Form.Item label="Parent domain">
          <Select v-model:value="form.parent" allow-clear>
            <Select.Option
              v-for="domain in domains"
              :key="domain.id"
              :value="domain.fullyQualifiedName || domain.name"
            >
              {{ domain.displayName || domain.name }}
            </Select.Option>
          </Select>
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
