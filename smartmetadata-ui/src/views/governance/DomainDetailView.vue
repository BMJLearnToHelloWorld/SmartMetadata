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
import { getDomain, listDomainAssets, updateDomain } from '@/api/domains';
import { DOMAIN_TYPES, type Domain } from '@/types/governance';
import type { EntityRef } from '@/types/api';

const props = defineProps<{ id: string }>();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const domain = ref<Domain | null>(null);
const assets = ref<EntityRef[]>([]);
const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({
  displayName: '',
  description: '',
  domainType: 'Source-aligned',
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
    domain.value = await getDomain(props.id);
    try {
      assets.value = (await listDomainAssets(props.id, 50)).data;
    } catch {
      assets.value = [];
    }
  } catch (error) {
    domain.value = null;
    assets.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load domain';
  } finally {
    loading.value = false;
  }
}

function openEdit(): void {
  if (!domain.value) {
    return;
  }
  editForm.displayName = domain.value.displayName || '';
  editForm.description = domain.value.description || '';
  editForm.domainType = domain.value.domainType;
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!domain.value) {
    return;
  }
  saving.value = true;
  try {
    await updateDomain({
      name: domain.value.name,
      description: editForm.description.trim(),
      domainType: editForm.domainType,
      displayName: editForm.displayName.trim() || undefined,
      parent: domain.value.parent?.fullyQualifiedName || domain.value.parent?.name,
    });
    editOpen.value = false;
    message.success('Domain updated');
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
});
</script>

<template>
  <Spin :spinning="loading">
    <Card>
      <Space direction="vertical" size="middle" style="width: 100%">
        <div class="gov-head">
          <Typography.Title :level="4">{{ domain?.displayName || domain?.name || 'Domain' }}</Typography.Title>
          <Space>
            <Button @click="router.push({ name: 'governance-domains' })">Back</Button>
            <Button type="primary" data-testid="edit-domain" :disabled="!domain" @click="openEdit">Edit domain</Button>
          </Space>
        </div>
        <Alert v-if="errorMessage" type="warning" show-icon :message="errorMessage" />
        <Descriptions v-if="domain" bordered :column="1" size="small">
          <Descriptions.Item label="Name">{{ domain.name }}</Descriptions.Item>
          <Descriptions.Item label="FQN">{{ domain.fullyQualifiedName }}</Descriptions.Item>
          <Descriptions.Item label="Type">{{ domain.domainType }}</Descriptions.Item>
          <Descriptions.Item label="Parent">{{ domain.parent?.name || '—' }}</Descriptions.Item>
          <Descriptions.Item label="Description">{{ domain.description || '—' }}</Descriptions.Item>
          <Descriptions.Item label="Owners">
            {{ domain.owners.map((item) => item.displayName || item.name).join(', ') || '—' }}
          </Descriptions.Item>
        </Descriptions>
        <Typography.Title :level="5">Assets</Typography.Title>
        <Table
          row-key="id"
          data-testid="domain-assets-table"
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
        <Typography.Text v-if="!assets.length" type="secondary">No assets returned for this domain.</Typography.Text>
      </Space>
    </Card>
    <Modal v-model:open="editOpen" title="Edit domain" :confirm-loading="saving" @ok="onSave">
      <Form layout="vertical">
        <Form.Item label="Display name">
          <Input v-model:value="editForm.displayName" />
        </Form.Item>
        <Form.Item label="Description" required>
          <Input.TextArea v-model:value="editForm.description" :rows="3" />
        </Form.Item>
        <Form.Item label="Domain type" required>
          <Select v-model:value="editForm.domainType">
            <Select.Option v-for="type in DOMAIN_TYPES" :key="type" :value="type">{{ type }}</Select.Option>
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
