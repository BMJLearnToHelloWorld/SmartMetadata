<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Typography,
  message,
} from 'ant-design-vue';
import { isDetailWired } from '@/catalog/entityRoutes';
import { getDataProduct, listDataProductAssets, updateDataProduct } from '@/api/dataProducts';
import { listDomains } from '@/api/domains';
import type { EntityRef } from '@/types/api';
import type { DataProduct, Domain } from '@/types/governance';

const props = defineProps<{ id: string }>();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const product = ref<DataProduct | null>(null);
const domains = ref<Domain[]>([]);
const assets = ref<EntityRef[]>([]);
const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({
  displayName: '',
  description: '',
  domainFqns: [] as string[],
});

const assetColumns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Type', dataIndex: 'type', key: 'type', width: 140 },
  { title: 'FQN', dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    product.value = await getDataProduct(props.id);
    try {
      assets.value = (await listDataProductAssets(props.id, 50)).data;
    } catch {
      assets.value = [];
    }
  } catch (error) {
    product.value = null;
    assets.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load data product';
  } finally {
    loading.value = false;
  }
}

function openEdit(): void {
  if (!product.value) {
    return;
  }
  editForm.displayName = product.value.displayName || '';
  editForm.description = product.value.description || '';
  editForm.domainFqns = product.value.domains
    .map((item) => item.fullyQualifiedName || item.name)
    .filter(Boolean);
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!product.value) {
    return;
  }
  saving.value = true;
  try {
    await updateDataProduct({
      name: product.value.name,
      description: editForm.description.trim(),
      displayName: editForm.displayName.trim() || undefined,
      domains: editForm.domainFqns,
    });
    editOpen.value = false;
    message.success('Data product updated');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Update failed');
  } finally {
    saving.value = false;
  }
}

function openAsset(asset: EntityRef): void {
  const entityType = asset.type || '';
  const fqn = asset.fullyQualifiedName || asset.name;
  if (!isDetailWired(entityType) || !fqn) {
    return;
  }
  void router.push({ name: 'asset', params: { entityType, fqn } });
}

watch(
  () => props.id,
  () => {
    void load();
  },
);

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
  <Spin :spinning="loading">
    <Card>
      <Space direction="vertical" size="middle" style="width: 100%">
        <div class="gov-head">
          <Typography.Title :level="4">
            {{ product?.displayName || product?.name || 'Data product' }}
          </Typography.Title>
          <Space>
            <Button @click="router.push({ name: 'governance-data-products' })">Back</Button>
            <Button type="primary" data-testid="edit-data-product" :disabled="!product" @click="openEdit">
              Edit
            </Button>
          </Space>
        </div>
        <Alert v-if="errorMessage" type="warning" show-icon :message="errorMessage" />
        <Descriptions v-if="product" bordered :column="1" size="small">
          <Descriptions.Item label="Name">{{ product.name }}</Descriptions.Item>
          <Descriptions.Item label="FQN">{{ product.fullyQualifiedName }}</Descriptions.Item>
          <Descriptions.Item label="Description">{{ product.description || '—' }}</Descriptions.Item>
          <Descriptions.Item label="Domains">
            {{ product.domains.map((item) => item.displayName || item.name).join(', ') || '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="Owners">
            {{ product.owners.map((item) => item.displayName || item.name).join(', ') || '—' }}
          </Descriptions.Item>
        </Descriptions>
        <Typography.Title :level="5">Assets</Typography.Title>
        <Table
          row-key="id"
          :columns="assetColumns"
          :data-source="assets"
          :pagination="false"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <a
                v-if="isDetailWired((record as EntityRef).type || '') && (record as EntityRef).fullyQualifiedName"
                href="#"
                @click.prevent="openAsset(record as EntityRef)"
              >
                {{ (record as EntityRef).displayName || (record as EntityRef).name }}
              </a>
              <span v-else>{{ (record as EntityRef).displayName || (record as EntityRef).name }}</span>
            </template>
          </template>
        </Table>
        <Typography.Text v-if="!assets.length" type="secondary">
          No assets returned. Bulk asset membership uses PUT /v1/dataProducts/{name}/assets/add and is
          not wired in this MVP.
        </Typography.Text>
      </Space>
    </Card>
    <Modal v-model:open="editOpen" title="Edit data product" :confirm-loading="saving" @ok="onSave">
      <Form layout="vertical">
        <Form.Item label="Display name">
          <Input v-model:value="editForm.displayName" />
        </Form.Item>
        <Form.Item label="Description" required>
          <Input.TextArea v-model:value="editForm.description" :rows="3" />
        </Form.Item>
        <Form.Item label="Domains" required>
          <Select v-model:value="editForm.domainFqns" mode="multiple">
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
  </Spin>
</template>

<style scoped>
.gov-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
</style>
