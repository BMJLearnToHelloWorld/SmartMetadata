<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Typography, message } from 'ant-design-vue';
import { createDataProduct, listDataProducts } from '@/api/dataProducts';
import { listDomains } from '@/api/domains';
import type { DataProduct, Domain } from '@/types/governance';

const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const products = ref<DataProduct[]>([]);
const domains = ref<Domain[]>([]);
const total = ref<number | undefined>();
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  name: '',
  displayName: '',
  description: '',
  domainFqns: [] as string[],
});

const columns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Description', dataIndex: 'description', key: 'description' },
  { title: 'Domains', key: 'domains' },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listDataProducts({ limit: 50 });
    products.value = page.data;
    total.value = page.total;
  } catch (error) {
    products.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load data products';
  } finally {
    loading.value = false;
  }
}

async function onCreate(): Promise<void> {
  creating.value = true;
  try {
    const created = await createDataProduct({
      name: form.name.trim(),
      description: form.description.trim(),
      displayName: form.displayName.trim() || undefined,
      domains: form.domainFqns,
    });
    createOpen.value = false;
    message.success(`Created data product ${created.name}`);
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Create data product failed');
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  void load();
  void listDomains({ limit: 100 })
    .then((page) => {
      domains.value = page.data;
    })
    .catch(() => undefined);
});
</script>

<template>
  <Card>
    <Space direction="vertical" size="middle" style="width: 100%">
      <div class="gov-head">
        <div>
          <Typography.Title :level="4">Data products</Typography.Title>
          <Typography.Paragraph type="secondary">
            GET/POST /api/v1/dataProducts. CreateDataProduct requires <code>name</code>,
            <code>description</code>, and <code>domains</code> (FQNs).
          </Typography.Paragraph>
        </div>
        <Button type="primary" data-testid="create-data-product" @click="createOpen = true">
          Create data product
        </Button>
      </div>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Table
        row-key="id"
        data-testid="data-products-table"
        :columns="columns"
        :data-source="products"
        :loading="loading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              href="#"
              :data-testid="`data-product-row-${(record as DataProduct).id}`"
              @click.prevent="
                router.push({ name: 'governance-data-product', params: { id: (record as DataProduct).id } })
              "
            >
              {{ (record as DataProduct).displayName || (record as DataProduct).name }}
            </a>
          </template>
          <template v-else-if="column.key === 'domains'">
            {{ (record as DataProduct).domains.map((item) => item.displayName || item.name).join(', ') || '—' }}
          </template>
        </template>
      </Table>
      <Typography.Text type="secondary">
        {{ products.length }} shown<template v-if="total !== undefined"> of {{ total }}</template>
      </Typography.Text>
    </Space>
    <Modal v-model:open="createOpen" title="Create data product" :confirm-loading="creating" @ok="onCreate">
      <Form layout="vertical">
        <Form.Item label="Name" required>
          <Input v-model:value="form.name" data-testid="create-data-product-name" />
        </Form.Item>
        <Form.Item label="Description" required>
          <Input.TextArea v-model:value="form.description" :rows="3" />
        </Form.Item>
        <Form.Item label="Domains" required>
          <Select v-model:value="form.domainFqns" mode="multiple" data-testid="create-data-product-domains">
            <Select.Option
              v-for="domain in domains"
              :key="domain.id"
              :value="domain.fullyQualifiedName || domain.name"
            >
              {{ domain.displayName || domain.name }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Display name">
          <Input v-model:value="form.displayName" />
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
